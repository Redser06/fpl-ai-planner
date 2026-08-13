/**
 * Squad rules, formation and points — the logic the assistant manager reasons over.
 *
 * All pure functions. Every rule is read from the live `SquadRules` (which come
 * from FPL's own `game_settings` and `element_types`) rather than hardcoded, so
 * a rule change in the real game flows through without a code change.
 *
 * This is where the prototype's three worst defects are actually fixed:
 *   - formation was decorative (state read only to highlight a button)
 *   - money was fake (squad value and bank were string literals)
 *   - swaps could produce illegal squads (two goalkeepers on the pitch)
 */

import type { Player, Position, Squad, SquadPick, SquadRules } from '../types';

export const POSITION_ORDER: Position[] = ['GKP', 'DEF', 'MID', 'FWD'];

/** Slots 1-11 are the starting XI; 12-15 are the bench, in substitution order. */
export const STARTER_SLOTS = 11;

export interface SquadValidationError {
  code:
    | 'SQUAD_SIZE'
    | 'POSITION_QUOTA'
    | 'CLUB_LIMIT'
    | 'OVER_BUDGET'
    | 'DUPLICATE_PLAYER'
    | 'FORMATION_INVALID'
    | 'NO_CAPTAIN';
  message: string;
}

export interface SquadCosting {
  /** Total price of all 15 players, in millions. */
  squadValue: number;
  /** Budget remaining, in millions. Negative means over budget. */
  bank: number;
}

const byId = (players: readonly Player[]): Map<number, Player> =>
  new Map(players.map((player) => [player.id, player]));

export function resolvePicks(
  picks: readonly SquadPick[],
  players: readonly Player[],
): Array<{ pick: SquadPick; player: Player }> {
  const lookup = byId(players);
  return picks
    .map((pick) => {
      const player = lookup.get(pick.playerId);
      return player ? { pick, player } : null;
    })
    .filter((entry): entry is { pick: SquadPick; player: Player } => entry !== null)
    .sort((a, b) => a.pick.slot - b.pick.slot);
}

export const startersOf = (
  resolved: ReturnType<typeof resolvePicks>,
): ReturnType<typeof resolvePicks> => resolved.filter((entry) => entry.pick.slot <= STARTER_SLOTS);

export const benchOf = (
  resolved: ReturnType<typeof resolvePicks>,
): ReturnType<typeof resolvePicks> => resolved.filter((entry) => entry.pick.slot > STARTER_SLOTS);

/** Real money. The prototype hardcoded "£103.4M" and "£0.6M" as strings. */
export function costSquad(
  picks: readonly SquadPick[],
  players: readonly Player[],
  rules: SquadRules,
): SquadCosting {
  const resolved = resolvePicks(picks, players);
  const squadValue = resolved.reduce((total, entry) => total + entry.player.price, 0);
  return {
    squadValue: round1(squadValue),
    bank: round1(rules.totalBudget - squadValue),
  };
}

function countByPosition(entries: ReturnType<typeof resolvePicks>): Record<Position, number> {
  const counts: Record<Position, number> = { GKP: 0, DEF: 0, MID: 0, FWD: 0 };
  for (const entry of entries) counts[entry.player.position] += 1;
  return counts;
}

/**
 * Is this XI a legal formation?
 *
 * Uses FPL's own per-position min/max play values, so it stays correct if the
 * game ever changes them. Currently: exactly 1 GKP, 3-5 DEF, 2-5 MID, 1-3 FWD.
 */
export function isValidFormation(
  starters: ReturnType<typeof resolvePicks>,
  rules: SquadRules,
): boolean {
  if (starters.length !== STARTER_SLOTS) return false;

  const counts = countByPosition(starters);
  return POSITION_ORDER.every((position) => {
    const count = counts[position];
    return count >= rules.positionMinPlay[position] && count <= rules.positionMaxPlay[position];
  });
}

/**
 * The formation the XI actually is, e.g. "4-3-3".
 *
 * Derived from the players on the pitch rather than stored as state — which is
 * why it can never disagree with what is rendered, the bug that made the
 * prototype's formation switcher decorative.
 */
export function deriveFormation(starters: ReturnType<typeof resolvePicks>): string {
  const counts = countByPosition(starters);
  return `${counts.DEF}-${counts.MID}-${counts.FWD}`;
}

export function validateSquad(
  picks: readonly SquadPick[],
  players: readonly Player[],
  rules: SquadRules,
): SquadValidationError[] {
  const errors: SquadValidationError[] = [];
  const resolved = resolvePicks(picks, players);

  if (picks.length !== rules.squadSize) {
    errors.push({
      code: 'SQUAD_SIZE',
      message: `Squad must contain ${rules.squadSize} players (currently ${picks.length}).`,
    });
  }

  const ids = new Set(picks.map((pick) => pick.playerId));
  if (ids.size !== picks.length) {
    errors.push({ code: 'DUPLICATE_PLAYER', message: 'The same player is selected twice.' });
  }

  const counts = countByPosition(resolved);
  for (const position of POSITION_ORDER) {
    const required = rules.positionQuota[position];
    if (counts[position] !== required) {
      errors.push({
        code: 'POSITION_QUOTA',
        message: `Need exactly ${required} ${position} (currently ${counts[position]}).`,
      });
    }
  }

  const perClub = new Map<number, number>();
  for (const entry of resolved) {
    perClub.set(entry.player.teamId, (perClub.get(entry.player.teamId) ?? 0) + 1);
  }
  for (const [teamId, count] of perClub) {
    if (count > rules.teamLimit) {
      const short = resolved.find((entry) => entry.player.teamId === teamId)?.player.teamShort;
      errors.push({
        code: 'CLUB_LIMIT',
        message: `Maximum ${rules.teamLimit} players from one club — ${short} has ${count}.`,
      });
    }
  }

  const { bank, squadValue } = costSquad(picks, players, rules);
  if (bank < 0) {
    errors.push({
      code: 'OVER_BUDGET',
      message: `Over budget by £${Math.abs(bank).toFixed(1)}m (squad costs £${squadValue.toFixed(1)}m of £${rules.totalBudget.toFixed(1)}m).`,
    });
  }

  // Formation is only meaningful once the squad is otherwise complete.
  if (picks.length === rules.squadSize && !isValidFormation(startersOf(resolved), rules)) {
    errors.push({
      code: 'FORMATION_INVALID',
      message: 'Starting XI is not a legal formation.',
    });
  }

  if (picks.length > 0 && !picks.some((pick) => pick.isCaptain)) {
    errors.push({ code: 'NO_CAPTAIN', message: 'No captain selected.' });
  }

  return errors;
}

/**
 * Can this starter and this bench player swap without breaking the formation?
 *
 * The prototype swapped by array index with no position check at all, so it
 * would happily field two goalkeepers.
 */
export function canSwap(
  starterId: number,
  benchId: number,
  picks: readonly SquadPick[],
  players: readonly Player[],
  rules: SquadRules,
): boolean {
  const swapped = applySwap(starterId, benchId, picks);
  if (!swapped) return false;
  return isValidFormation(startersOf(resolvePicks(swapped, players)), rules);
}

/** Returns the new picks with the two players' slots exchanged, or null. */
export function applySwap(
  starterId: number,
  benchId: number,
  picks: readonly SquadPick[],
): SquadPick[] | null {
  const starter = picks.find((pick) => pick.playerId === starterId);
  const bench = picks.find((pick) => pick.playerId === benchId);
  if (!starter || !bench) return null;
  if (starter.slot > STARTER_SLOTS || bench.slot <= STARTER_SLOTS) return null;

  return picks.map((pick) => {
    if (pick.playerId === starterId) return { ...pick, slot: bench.slot };
    if (pick.playerId === benchId) return { ...pick, slot: starter.slot };
    return pick;
  });
}

/** Every bench player who could legally come on for this starter. */
export function legalSwapsFor(
  starterId: number,
  picks: readonly SquadPick[],
  players: readonly Player[],
  rules: SquadRules,
): number[] {
  return benchOf(resolvePicks(picks, players))
    .map((entry) => entry.player.id)
    .filter((benchId) => canSwap(starterId, benchId, picks, players, rules));
}

/**
 * How attractive each position is for the armband, used only to break ties.
 *
 * This matters more than it sounds pre-season, where FPL's own `ep_next` is
 * crude and heavily tied — dozens of players sit on exactly 4.0. Ranking on
 * expected points alone then picks essentially arbitrarily, and cheerfully
 * hands the captaincy to a goalkeeper. Nobody captains a goalkeeper.
 */
const CAPTAINCY_POSITION_WEIGHT: Record<Position, number> = {
  FWD: 3,
  MID: 3,
  DEF: 1,
  GKP: 0,
};

/** Sorts best-captain-first: expected points, then attacking threat, then price. */
export function compareForCaptaincy(a: Player, b: Player): number {
  if (b.epNext !== a.epNext) return b.epNext - a.epNext;

  const weight =
    CAPTAINCY_POSITION_WEIGHT[b.position] - CAPTAINCY_POSITION_WEIGHT[a.position];
  if (weight !== 0) return weight;

  if (b.xGIPer90 !== a.xGIPer90) return b.xGIPer90 - a.xGIPer90;
  return b.price - a.price;
}

export interface SquadPoints {
  /** Points scored by the XI this gameweek, including the captain multiplier. */
  gameweekPoints: number;
  /** Points sitting unused on the bench — the cost of a bad bench order. */
  benchPoints: number;
  /** Sum of the XI's expected points for the next gameweek, captain included. */
  expectedPoints: number;
  /** Mean FPL form across the starting XI. */
  averageForm: number;
}

/**
 * Squad scoring for a single gameweek.
 *
 * Captain multiplier is applied here rather than stored, so triple captain is
 * just a different multiplier rather than a special case elsewhere.
 */
export function scoreSquad(
  picks: readonly SquadPick[],
  players: readonly Player[],
  captainMultiplier = 2,
): SquadPoints {
  const resolved = resolvePicks(picks, players);
  const starters = startersOf(resolved);
  const bench = benchOf(resolved);

  let gameweekPoints = 0;
  let expectedPoints = 0;

  for (const { pick, player } of starters) {
    const multiplier = pick.isCaptain ? captainMultiplier : 1;
    gameweekPoints += player.eventPoints * multiplier;
    expectedPoints += player.epNext * multiplier;
  }

  const benchPoints = bench.reduce((total, entry) => total + entry.player.eventPoints, 0);
  const averageForm =
    starters.length === 0
      ? 0
      : starters.reduce((total, entry) => total + entry.player.form, 0) / starters.length;

  return {
    gameweekPoints,
    benchPoints,
    expectedPoints: round1(expectedPoints),
    averageForm: round1(averageForm),
  };
}

/**
 * Builds a squad object from a flat list of 15 player ids, assigning slots so
 * the XI is a legal formation and the bench is ordered GK first.
 *
 * Used by the manual builder, which collects players without caring about slots.
 */
export function buildSquadFromIds(
  playerIds: readonly number[],
  players: readonly Player[],
  rules: SquadRules,
  options: { captainId?: number; viceCaptainId?: number; source?: Squad['source'] } = {},
): Squad | null {
  const lookup = byId(players);
  const chosen = playerIds
    .map((id) => lookup.get(id))
    .filter((player): player is Player => player !== undefined);

  if (chosen.length !== rules.squadSize) return null;

  const byPosition = new Map<Position, Player[]>(
    POSITION_ORDER.map((position) => [
      position,
      chosen
        .filter((player) => player.position === position)
        // Best expected points start; the rest go to the bench.
        .sort((a, b) => b.epNext - a.epNext),
    ]),
  );

  const starters: Player[] = [];
  const bench: Player[] = [];

  for (const position of POSITION_ORDER) {
    const pool = byPosition.get(position) ?? [];
    const minimum = rules.positionMinPlay[position];
    starters.push(...pool.slice(0, minimum));
    bench.push(...pool.slice(minimum));
  }

  // Fill the remaining XI places with the best benched outfielders, respecting
  // each position's maximum.
  const remaining = STARTER_SLOTS - starters.length;
  const promotable = bench
    .filter((player) => player.position !== 'GKP')
    .sort((a, b) => b.epNext - a.epNext);

  for (const player of promotable) {
    if (starters.length >= STARTER_SLOTS) break;
    const count = starters.filter((s) => s.position === player.position).length;
    if (count >= rules.positionMaxPlay[player.position]) continue;
    starters.push(player);
    bench.splice(bench.indexOf(player), 1);
  }

  if (starters.length !== STARTER_SLOTS || remaining < 0) return null;

  // Bench order: reserve goalkeeper first, then by expected points.
  bench.sort((a, b) => {
    if (a.position === 'GKP' && b.position !== 'GKP') return -1;
    if (b.position === 'GKP' && a.position !== 'GKP') return 1;
    return b.epNext - a.epNext;
  });

  const ranked = [...starters].sort(compareForCaptaincy);
  const captainId = options.captainId ?? ranked[0]!.id;
  const viceCaptainId =
    options.viceCaptainId ??
    ranked.find((player) => player.id !== captainId)?.id ??
    starters[0]!.id;

  const ordered = [...starters, ...bench];
  const picks: SquadPick[] = ordered.map((player, index) => ({
    playerId: player.id,
    slot: index + 1,
    isCaptain: player.id === captainId,
    isViceCaptain: player.id === viceCaptainId,
  }));

  const { bank, squadValue } = costSquad(picks, players, rules);

  return {
    picks,
    formation: deriveFormation(startersOf(resolvePicks(picks, players))),
    captainId,
    viceCaptainId,
    bank,
    squadValue,
    source: options.source ?? 'MANUAL',
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Picks a complete, legal 15 within budget.
 *
 * Deliberately NOT an optimiser — that comes later. This is a sensible starting
 * point for a user to edit, and its contract is that it always returns a squad
 * that passes `validateSquad`, or null if that is impossible.
 *
 * Strategy: take the cheapest legal squad first, then greedily spend whatever
 * is left upgrading the weakest player it can afford to improve. Starting from
 * the cheapest guarantees affordability at every step, which is what a
 * best-first greedy fails at — it spends the budget on four midfielders and
 * then cannot afford three forwards.
 */
export function autoFillSquad(
  players: readonly Player[],
  rules: SquadRules,
  options: { seed?: readonly number[]; maxUpgrades?: number } = {},
): number[] | null {
  const maxUpgrades = options.maxUpgrades ?? 200;
  const seedIds = new Set(options.seed ?? []);

  const eligible = players.filter(
    (player) => player.availability === 'AVAILABLE' || seedIds.has(player.id),
  );

  const picked: Player[] = [];
  const clubCount = new Map<number, number>();

  const canAdd = (player: Player): boolean =>
    !picked.some((p) => p.id === player.id) &&
    (clubCount.get(player.teamId) ?? 0) < rules.teamLimit &&
    picked.filter((p) => p.position === player.position).length <
      rules.positionQuota[player.position];

  const add = (player: Player): void => {
    picked.push(player);
    clubCount.set(player.teamId, (clubCount.get(player.teamId) ?? 0) + 1);
  };

  const remove = (player: Player): void => {
    picked.splice(picked.findIndex((p) => p.id === player.id), 1);
    clubCount.set(player.teamId, (clubCount.get(player.teamId) ?? 1) - 1);
  };

  // Honour any explicitly seeded players first.
  for (const id of seedIds) {
    const player = eligible.find((p) => p.id === id);
    if (player && canAdd(player)) add(player);
  }

  // Cheapest legal squad.
  for (const position of POSITION_ORDER) {
    const pool = eligible
      .filter((player) => player.position === position)
      .sort((a, b) => a.price - b.price || b.epNext - a.epNext);

    for (const player of pool) {
      if (picked.filter((p) => p.position === position).length >= rules.positionQuota[position]) {
        break;
      }
      if (canAdd(player)) add(player);
    }
  }

  if (picked.length !== rules.squadSize) return null;

  let spent = picked.reduce((total, player) => total + player.price, 0);
  if (spent > rules.totalBudget) return null;

  // Greedily upgrade while the budget allows.
  for (let iteration = 0; iteration < maxUpgrades; iteration++) {
    let bestGain = 0;
    let bestOut: Player | null = null;
    let bestIn: Player | null = null;

    for (const out of picked) {
      // Players the user explicitly chose are locked — upgrading them away
      // would silently discard a deliberate decision.
      if (seedIds.has(out.id)) continue;

      const budgetFor = rules.totalBudget - (spent - out.price);

      for (const candidate of eligible) {
        if (candidate.position !== out.position) continue;
        if (candidate.price > budgetFor) continue;
        if (picked.some((p) => p.id === candidate.id)) continue;

        // Club limit, accounting for the player leaving.
        const clubAfterRemoval =
          (clubCount.get(candidate.teamId) ?? 0) - (out.teamId === candidate.teamId ? 1 : 0);
        if (clubAfterRemoval >= rules.teamLimit) continue;

        const gain = candidate.epNext - out.epNext;
        if (gain > bestGain) {
          bestGain = gain;
          bestOut = out;
          bestIn = candidate;
        }
      }
    }

    if (!bestOut || !bestIn) break;

    remove(bestOut);
    add(bestIn);
    spent = spent - bestOut.price + bestIn.price;
  }

  return picked.map((player) => player.id);
}

const round1 = (value: number): number => Math.round(value * 10) / 10;
