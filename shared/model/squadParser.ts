/**
 * Parser for raw squad copy-paste text from the official Fantasy Premier League
 * website (Pick Team, My Team, Transfers, or Points view).
 *
 * Automatically detects:
 *   - Gameweek starting XI and exact formation (e.g. 3-5-2, 4-4-2, 3-4-3)
 *   - Bench order (slot 12 reserve GK, slots 13-15 outfield subs in priority order)
 *   - Captain and vice-captain markers (C) / (V)
 *   - Player names with diacritics / accents (Guéhi, Šeško, Gyökeres)
 *   - Club disambiguation for shared names (e.g. Wilson of Leeds vs Brentford)
 */

import type { Player, Position, Squad, SquadPick, SquadRules, Team } from '../types';
import {
  compareForCaptaincy,
  costSquad,
  deriveFormation,
  isValidFormation,
  resolvePicks,
  startersOf,
  validateSquad,
} from './squad';

export interface ParseSquadSuccess {
  success: true;
  squad: Squad;
  formation: string;
  starters: Player[];
  bench: Player[];
  captain: Player;
  viceCaptain: Player;
}

export interface ParseSquadFailure {
  success: false;
  error: string;
  unmatchedNames?: string[];
  validationErrors?: string[];
}

export type ParseSquadResult = ParseSquadSuccess | ParseSquadFailure;

/** Strips accents, punctuation, and case for fuzzy matching. */
export function cleanString(value: string): string {
  return (value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/ø/g, 'o')
    .replace(/æ/g, 'ae')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]/g, '');
}

/** Team name aliases and normalizations. */
const KNOWN_TEAM_ALIASES: Record<string, string> = {
  manutd: 'manchester united',
  manchesterutd: 'manchester united',
  mancity: 'manchester city',
  spurs: 'tottenham hotspur',
  tottenham: 'tottenham hotspur',
  wolves: 'wolverhampton wanderers',
  forest: 'nottingham forest',
  nottsforest: 'nottingham forest',
  nottmforest: 'nottingham forest',
  leicester: 'leicester city',
  leeds: 'leeds united',
  newcastle: 'newcastle united',
  brighton: 'brighton and hove albion',
  westbrom: 'west bromwich albion',
};

function normalizeTeamName(raw: string): string {
  const cleaned = cleanString(raw);
  return KNOWN_TEAM_ALIASES[cleaned] ?? cleaned;
}

function teamMatches(playerTeam: Team, query: string): boolean {
  const cQuery = normalizeTeamName(query);
  if (!cQuery) return true;

  const tName = normalizeTeamName(playerTeam.name);
  const tShort = cleanString(playerTeam.shortName);

  return (
    tName.includes(cQuery) ||
    cQuery.includes(tName) ||
    tShort === cQuery ||
    cQuery.includes(tShort)
  );
}

/**
 * Finds the best-matching Player from the pool.
 */
export function matchPlayerInPool(
  name: string,
  players: readonly Player[],
  teams: readonly Team[],
  teamHint?: string,
  posHint?: Position,
): Player | null {
  const cName = cleanString(name);
  if (!cName) return null;

  const teamLookup = new Map(teams.map((t) => [t.id, t]));

  const matchesTeam = (p: Player): boolean => {
    if (!teamHint) return true;
    const team = teamLookup.get(p.teamId);
    return team ? teamMatches(team, teamHint) : false;
  };

  // 1. If teamHint is provided, search inside that club first
  if (teamHint) {
    const clubPool = players.filter(matchesTeam);
    if (clubPool.length > 0) {
      let candidates = clubPool.filter((p) => cleanString(p.webName) === cName);
      if (posHint) {
        const withPos = candidates.filter((p) => p.position === posHint);
        if (withPos.length > 0) candidates = withPos;
      }
      if (candidates.length === 1 && candidates[0]) return candidates[0];

      candidates = clubPool.filter(
        (p) =>
          cleanString(p.secondName) === cName ||
          cleanString(`${p.firstName}${p.secondName}`) === cName,
      );
      if (posHint) {
        const withPos = candidates.filter((p) => p.position === posHint);
        if (withPos.length > 0) candidates = withPos;
      }
      if (candidates.length === 1 && candidates[0]) return candidates[0];

      candidates = clubPool.filter(
        (p) =>
          cleanString(p.webName).includes(cName) ||
          cName.includes(cleanString(p.webName)) ||
          cleanString(p.secondName).includes(cName),
      );
      if (posHint) {
        const withPos = candidates.filter((p) => p.position === posHint);
        if (withPos.length > 0) candidates = withPos;
      }
      if (candidates.length === 1 && candidates[0]) return candidates[0];
    }
  }

  // 2. Global search: exact webName match
  let pool = players.filter((p) => cleanString(p.webName) === cName);
  if (posHint) {
    const withPos = pool.filter((p) => p.position === posHint);
    if (withPos.length > 0) pool = withPos;
  }
  if (pool.length === 1 && pool[0]) return pool[0];

  // 3. Global search: exact match on secondName or full name
  pool = players.filter(
    (p) =>
      cleanString(p.secondName) === cName ||
      cleanString(`${p.firstName}${p.secondName}`) === cName,
  );
  if (posHint) {
    const withPos = pool.filter((p) => p.position === posHint);
    if (withPos.length > 0) pool = withPos;
  }
  if (pool.length === 1 && pool[0]) return pool[0];

  return null;
}

interface RawExtractedPlayer {
  name: string;
  team?: string;
  pos?: Position;
  isCaptain: boolean;
  isViceCaptain: boolean;
}

type SectionKey = 'GKP' | 'DEF' | 'MID' | 'FWD' | 'SUB';

/**
 * Parses raw clipboard text from FPL and resolves a full, legal Squad.
 */
export function parseSquadFromText(
  rawText: string,
  players: readonly Player[],
  teams: readonly Team[],
  rules: SquadRules,
): ParseSquadResult {
  const trimmed = rawText.trim();
  if (!trimmed) {
    return { success: false, error: 'Pasted text is empty.' };
  }

  const lines = trimmed.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);

  let currentSection: SectionKey | null = null;
  const sections: Record<SectionKey, RawExtractedPlayer[]> = {
    GKP: [],
    DEF: [],
    MID: [],
    FWD: [],
    SUB: [],
  };

  let hasSectionHeaders = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line === undefined) continue;

    if (/^goalkeepers?$/i.test(line)) {
      currentSection = 'GKP';
      hasSectionHeaders = true;
      continue;
    }
    if (/^defenders?$/i.test(line)) {
      currentSection = 'DEF';
      hasSectionHeaders = true;
      continue;
    }
    if (/^midfielders?$/i.test(line)) {
      currentSection = 'MID';
      hasSectionHeaders = true;
      continue;
    }
    if (/^forwards?$/i.test(line)) {
      currentSection = 'FWD';
      hasSectionHeaders = true;
      continue;
    }
    if (/^(substitutes?|subs?|bench)/i.test(line)) {
      currentSection = 'SUB';
      hasSectionHeaders = true;
      continue;
    }

    if (!currentSection) continue;

    // Pattern 1: "PlayerName, TeamName"
    const commaMatch = line.match(/^([^,]+),\s*([^,]+)$/);
    if (commaMatch && commaMatch[1] && commaMatch[2]) {
      const pName = commaMatch[1].replace(/\s*\([CV]\)$/i, '').trim();
      const tName = commaMatch[2].replace(/\s*\([CV]\)$/i, '').trim();

      // Discard fixture lines like "Brentford, Away" or "Bournemouth, Home"
      if (/^(home|away)$/i.test(tName)) {
        continue;
      }

      const isCaptain = /\(C\)/i.test(line) || /\bcaptain\b/i.test(line);
      const isViceCaptain = /\(V\)/i.test(line) || /\bvice[- ]captain\b/i.test(line);

      const list = sections[currentSection];
      const last = list[list.length - 1];
      // Skip repeated immediate lines (e.g. image alt text followed by display title)
      if (
        !last ||
        cleanString(last.name) !== cleanString(pName) ||
        cleanString(last.team ?? '') !== cleanString(tName)
      ) {
        list.push({
          name: pName,
          team: tName,
          pos: currentSection === 'SUB' ? undefined : currentSection,
          isCaptain,
          isViceCaptain,
        });
      }
      continue;
    }

    // Pattern 2: Triplet where 2 lines ahead is a position code (GKP | DEF | MID | FWD)
    // e.g. Line 0: "Roefs", Line 1: "Sunderland", Line 2: "GKP"
    const candidateLine2 = lines[i + 2];
    const candidateLine1 = lines[i + 1];
    if (candidateLine2 !== undefined && candidateLine1 !== undefined) {
      const posCandidate = candidateLine2.toUpperCase();
      if (['GKP', 'DEF', 'MID', 'FWD'].includes(posCandidate)) {
        const pName = line.replace(/\s*\([CV]\)$/i, '').trim();
        const tName = candidateLine1.replace(/\s*\([CV]\)$/i, '').trim();

        if (!/^(home|away)$/i.test(tName) && !/^(player|f|gwp|tp|fix)$/i.test(pName)) {
          const isCaptain =
            /\(C\)/i.test(line) || /\(C\)/i.test(candidateLine1) || /\(C\)/i.test(candidateLine2);
          const isViceCaptain =
            /\(V\)/i.test(line) || /\(V\)/i.test(candidateLine1) || /\(V\)/i.test(candidateLine2);

          const list = sections[currentSection];
          const last = list[list.length - 1];
          if (!last || cleanString(last.name) !== cleanString(pName)) {
            list.push({
              name: pName,
              team: tName,
              pos: posCandidate as Position,
              isCaptain,
              isViceCaptain,
            });
          }
        }
      }
    }
  }

  // If section headers were present, resolve section by section to preserve XI & bench
  if (hasSectionHeaders) {
    const unmatched: string[] = [];
    const starters: Player[] = [];
    const bench: Player[] = [];

    let rawCaptainId: number | null = null;
    let rawViceCaptainId: number | null = null;

    for (const sec of ['GKP', 'DEF', 'MID', 'FWD'] as const) {
      for (const item of sections[sec]) {
        const matched = matchPlayerInPool(item.name, players, teams, item.team, sec);
        if (!matched) {
          unmatched.push(`${item.name} (${item.team ?? sec})`);
        } else {
          // Guard against duplicates
          if (!starters.some((p) => p.id === matched.id)) {
            starters.push(matched);
            if (item.isCaptain) rawCaptainId = matched.id;
            if (item.isViceCaptain) rawViceCaptainId = matched.id;
          }
        }
      }
    }

    for (const item of sections.SUB) {
      const matched = matchPlayerInPool(item.name, players, teams, item.team, item.pos);
      if (!matched) {
        unmatched.push(`${item.name} (${item.team ?? 'SUB'})`);
      } else {
        if (!starters.some((p) => p.id === matched.id) && !bench.some((p) => p.id === matched.id)) {
          bench.push(matched);
          if (item.isCaptain) rawCaptainId = matched.id;
          if (item.isViceCaptain) rawViceCaptainId = matched.id;
        }
      }
    }

    if (unmatched.length > 0) {
      return {
        success: false,
        error: `Could not find ${unmatched.length} player${unmatched.length === 1 ? '' : 's'} in the FPL database: ${unmatched.slice(0, 3).join(', ')}${unmatched.length > 3 ? '...' : ''}.`,
        unmatchedNames: unmatched,
      };
    }

    if (starters.length !== 11 || bench.length !== 4) {
      return {
        success: false,
        error: `Expected 11 starters and 4 substitutes, but parsed ${starters.length} starters and ${bench.length} substitutes. Make sure you copy all players from the FPL team screen.`,
      };
    }

    // Ensure reserve goalkeeper is slot 12, then outfielders in exact parsed order
    const benchGkIndex = bench.findIndex((p) => p.position === 'GKP');
    if (benchGkIndex > 0) {
      const reserveGk = bench[benchGkIndex];
      if (reserveGk) {
        bench.splice(benchGkIndex, 1);
        bench.unshift(reserveGk);
      }
    }

    const allOrdered = [...starters, ...bench];

    // Assign captaincy: explicit (C)/(V) if found, else smart expected points rank
    const ranked = [...starters].sort(compareForCaptaincy);
    const firstRanked = ranked[0];
    const secondRanked = ranked[1];
    if (!firstRanked || !secondRanked) {
      return {
        success: false,
        error: 'Unable to rank squad for captaincy.',
      };
    }

    const captainId = rawCaptainId ?? firstRanked.id;
    const viceCaptainId =
      rawViceCaptainId ?? ranked.find((p) => p.id !== captainId)?.id ?? secondRanked.id;

    const picks: SquadPick[] = allOrdered.map((p, idx) => ({
      playerId: p.id,
      slot: idx + 1,
      isCaptain: p.id === captainId,
      isViceCaptain: p.id === viceCaptainId,
    }));

    const resolved = resolvePicks(picks, players);
    const formation = deriveFormation(startersOf(resolved));

    if (!isValidFormation(startersOf(resolved), rules)) {
      return {
        success: false,
        error: `The parsed starting XI (${formation}) is not a legal FPL formation. Check that you have between 3-5 defenders, 2-5 midfielders, and 1-3 forwards.`,
      };
    }

    const validationErrors = validateSquad(picks, players, rules);
    if (validationErrors.length > 0) {
      return {
        success: false,
        error: validationErrors.map((e) => e.message).join(' '),
        validationErrors: validationErrors.map((e) => e.message),
      };
    }

    const { squadValue, bank } = costSquad(picks, players, rules);
    const captain = players.find((p) => p.id === captainId);
    const viceCaptain = players.find((p) => p.id === viceCaptainId);

    if (!captain || !viceCaptain) {
      return { success: false, error: 'Failed to resolve captain or vice captain.' };
    }

    return {
      success: true,
      formation,
      starters,
      bench,
      captain,
      viceCaptain,
      squad: {
        picks,
        formation,
        captainId,
        viceCaptainId,
        bank,
        squadValue,
        source: 'IMPORTED',
        updatedAt: new Date().toISOString(),
      },
    };
  }

  // Fallback: No section headers detected — attempt to parse as a flat list or CSV
  return parseFlatSquadList(lines, players, teams, rules);
}

/**
 * Fallback parser for flat lists or comma-separated player names.
 */
function parseFlatSquadList(
  lines: string[],
  players: readonly Player[],
  teams: readonly Team[],
  rules: SquadRules,
): ParseSquadResult {
  const candidateNames: string[] = [];

  for (const line of lines) {
    const parts = line.split(',').map((p) => p.trim()).filter(Boolean);
    if (parts.length > 2) {
      candidateNames.push(...parts);
    } else {
      candidateNames.push(line);
    }
  }

  const matchedPlayers: Player[] = [];
  const unmatched: string[] = [];

  for (const raw of candidateNames) {
    const comma = raw.match(/^([^,]+),\s*([^,]+)$/);
    const name = comma && comma[1] ? comma[1].trim() : raw;
    const teamHint = comma && comma[2] ? comma[2].trim() : undefined;

    if (/^(player|f|gwp|tp|fix|home|away)$/i.test(name)) continue;

    const match = matchPlayerInPool(name, players, teams, teamHint);
    if (match) {
      if (!matchedPlayers.some((p) => p.id === match.id)) {
        matchedPlayers.push(match);
      }
    } else {
      unmatched.push(raw);
    }
  }

  if (matchedPlayers.length < rules.squadSize) {
    return {
      success: false,
      error: `Could not identify 15 players (found ${matchedPlayers.length}). Paste the squad using FPL's standard copy format with Goalkeepers, Defenders, Midfielders, Forwards and Substitutes headers.`,
      unmatchedNames: unmatched.slice(0, 5),
    };
  }

  // Take first 15 players
  const chosen15 = matchedPlayers.slice(0, rules.squadSize);
  const byPosition = {
    GKP: chosen15.filter((p) => p.position === 'GKP'),
    DEF: chosen15.filter((p) => p.position === 'DEF'),
    MID: chosen15.filter((p) => p.position === 'MID'),
    FWD: chosen15.filter((p) => p.position === 'FWD'),
  };

  if (
    byPosition.GKP.length !== rules.positionQuota.GKP ||
    byPosition.DEF.length !== rules.positionQuota.DEF ||
    byPosition.MID.length !== rules.positionQuota.MID ||
    byPosition.FWD.length !== rules.positionQuota.FWD
  ) {
    return {
      success: false,
      error: 'The parsed 15 players do not match squad quotas (2 GKP, 5 DEF, 5 MID, 3 FWD).',
    };
  }

  const gkp0 = byPosition.GKP[0];
  const gkp1 = byPosition.GKP[1];
  if (!gkp0 || !gkp1) {
    return { success: false, error: 'Incomplete goalkeepers in squad.' };
  }

  // Starting XI default: 1 GKP, 3 DEF, 4 MID, 3 FWD
  const starters: Player[] = [
    gkp0,
    ...byPosition.DEF.slice(0, 3),
    ...byPosition.MID.slice(0, 4),
    ...byPosition.FWD.slice(0, 3),
  ];
  const bench: Player[] = [
    gkp1,
    ...byPosition.DEF.slice(3),
    ...byPosition.MID.slice(4),
  ];

  const ranked = [...starters].sort(compareForCaptaincy);
  const firstRanked = ranked[0];
  const secondRanked = ranked[1];
  if (!firstRanked || !secondRanked) {
    return { success: false, error: 'Unable to rank squad for captaincy.' };
  }

  const captainId = firstRanked.id;
  const viceCaptainId = secondRanked.id;

  const picks: SquadPick[] = [...starters, ...bench].map((p, idx) => ({
    playerId: p.id,
    slot: idx + 1,
    isCaptain: p.id === captainId,
    isViceCaptain: p.id === viceCaptainId,
  }));

  const validationErrors = validateSquad(picks, players, rules);
  if (validationErrors.length > 0) {
    return {
      success: false,
      error: validationErrors.map((e) => e.message).join(' '),
      validationErrors: validationErrors.map((e) => e.message),
    };
  }

  const { squadValue, bank } = costSquad(picks, players, rules);
  const resolved = resolvePicks(picks, players);
  const formation = deriveFormation(startersOf(resolved));

  const captain = players.find((p) => p.id === captainId);
  const viceCaptain = players.find((p) => p.id === viceCaptainId);
  if (!captain || !viceCaptain) {
    return { success: false, error: 'Failed to resolve captain or vice captain.' };
  }

  return {
    success: true,
    formation,
    starters,
    bench,
    captain,
    viceCaptain,
    squad: {
      picks,
      formation,
      captainId,
      viceCaptainId,
      bank,
      squadValue,
      source: 'IMPORTED',
      updatedAt: new Date().toISOString(),
    },
  };
}
