/**
 * Pure transforms from raw FPL API shapes to our slim projections.
 *
 * No I/O, no Firebase, no side effects — which is what makes this the part of
 * the system that can be tested exhaustively against recorded fixtures.
 */

import type {
  Availability,
  ChipName,
  ChipWindow,
  FdrCell,
  FdrRow,
  Fixture,
  Gameweek,
  Player,
  Position,
  SeasonMeta,
  SquadRules,
  Team,
} from '../../../shared/types';
import type {
  RawBootstrap,
  RawElement,
  RawEvent,
  RawFixture,
  RawTeam,
} from '../fpl/schemas';

/** FPL prices are in tenths of a million. Never let a raw value escape this. */
export const toMillions = (tenths: number): number => Math.round(tenths) / 10;

const POSITION_BY_ELEMENT_TYPE: Record<number, Position> = {
  1: 'GKP',
  2: 'DEF',
  3: 'MID',
  4: 'FWD',
};

export function toPosition(elementType: number): Position {
  const position = POSITION_BY_ELEMENT_TYPE[elementType];
  if (!position) throw new Error(`Unknown FPL element_type: ${elementType}`);
  return position;
}

const AVAILABILITY_BY_STATUS: Record<string, Availability> = {
  a: 'AVAILABLE',
  d: 'DOUBTFUL',
  i: 'INJURED',
  s: 'SUSPENDED',
  u: 'UNAVAILABLE',
  n: 'NOT_IN_SQUAD',
};

/**
 * Unknown status codes map to UNAVAILABLE rather than throwing: FPL has added
 * codes mid-season before, and a new code should degrade to "don't pick him"
 * rather than take the whole ingest down.
 */
export function toAvailability(status: string): Availability {
  return AVAILABILITY_BY_STATUS[status] ?? 'UNAVAILABLE';
}

export function toTeam(raw: RawTeam): Team {
  return {
    id: raw.id,
    code: raw.code,
    name: raw.name,
    shortName: raw.short_name,
    strengthOverallHome: raw.strength_overall_home,
    strengthOverallAway: raw.strength_overall_away,
    strengthAttackHome: raw.strength_attack_home,
    strengthAttackAway: raw.strength_attack_away,
    strengthDefenceHome: raw.strength_defence_home,
    strengthDefenceAway: raw.strength_defence_away,
  };
}

export function toPlayer(raw: RawElement, teamShortById: ReadonlyMap<number, string>): Player {
  return {
    id: raw.id,
    code: raw.code,
    webName: raw.web_name,
    firstName: raw.first_name,
    secondName: raw.second_name,

    teamId: raw.team,
    teamShort: teamShortById.get(raw.team) ?? 'UNK',
    position: toPosition(raw.element_type),

    price: toMillions(raw.now_cost),
    priceChangeEvent: toMillions(raw.cost_change_event),
    priceChangeStart: toMillions(raw.cost_change_start),

    availability: toAvailability(raw.status),
    news: raw.news,
    chanceOfPlayingNextRound: raw.chance_of_playing_next_round,

    totalPoints: raw.total_points,
    eventPoints: raw.event_points,
    form: raw.form,
    pointsPerGame: raw.points_per_game,
    minutes: raw.minutes,
    starts: raw.starts,
    selectedByPercent: raw.selected_by_percent,

    goalsScored: raw.goals_scored,
    assists: raw.assists,
    cleanSheets: raw.clean_sheets,
    bonus: raw.bonus,
    bps: raw.bps,
    ictIndex: raw.ict_index,

    xG: raw.expected_goals,
    xA: raw.expected_assists,
    xGI: raw.expected_goal_involvements,
    xGC: raw.expected_goals_conceded,
    xGPer90: raw.expected_goals_per_90,
    xAPer90: raw.expected_assists_per_90,
    xGIPer90: raw.expected_goal_involvements_per_90,
    xGCPer90: raw.expected_goals_conceded_per_90,

    defensiveContribution: raw.defensive_contribution,
    defensiveContributionPer90: raw.defensive_contribution_per_90,

    transfersInEvent: raw.transfers_in_event,
    transfersOutEvent: raw.transfers_out_event,

    epNext: raw.ep_next ?? 0,

    penaltiesOrder: raw.penalties_order,
    cornersOrder: raw.corners_and_indirect_freekicks_order,
  };
}

export function toFixture(raw: RawFixture): Fixture {
  return {
    id: raw.id,
    event: raw.event,
    kickoffTime: raw.kickoff_time,
    teamHome: raw.team_h,
    teamAway: raw.team_a,
    difficultyHome: raw.team_h_difficulty,
    difficultyAway: raw.team_a_difficulty,
    finished: raw.finished,
    scoreHome: raw.team_h_score,
    scoreAway: raw.team_a_score,
  };
}

export function toGameweek(raw: RawEvent): Gameweek {
  return {
    id: raw.id,
    name: raw.name,
    deadlineTime: raw.deadline_time,
    finished: raw.finished,
    isCurrent: raw.is_current,
    isNext: raw.is_next,
    isPrevious: raw.is_previous,
  };
}

const CHIP_NAMES: ReadonlySet<string> = new Set(['wildcard', 'freehit', 'bboost', '3xc']);

/**
 * The real game gives TWO of each chip: one usable in GW1-19 and one in GW20-38.
 * The prototype modelled four chips, one each, which is simply the wrong game.
 *
 * Rather than hardcoding 19/20 as the split, we derive the half from the
 * chip's own start_event relative to the season's midpoint.
 */
export function toChipWindows(
  chips: RawBootstrap['chips'],
  totalEvents: number,
): ChipWindow[] {
  const midpoint = Math.floor(totalEvents / 2);
  return chips
    .filter((chip): chip is typeof chip & { name: ChipName } => CHIP_NAMES.has(chip.name))
    .map((chip) => ({
      name: chip.name,
      startEvent: chip.start_event,
      stopEvent: chip.stop_event,
      half: (chip.start_event > midpoint ? 2 : 1) as 1 | 2,
    }))
    .sort((a, b) => a.startEvent - b.startEvent || a.name.localeCompare(b.name));
}

/**
 * Squad rules read from the live API rather than hardcoded, so a rule change
 * (budget, club limit, squad size) flows through without a code change.
 */
export function toSquadRules(bootstrap: RawBootstrap): SquadRules {
  const quota = {} as Record<Position, number>;
  const minPlay = {} as Record<Position, number>;
  const maxPlay = {} as Record<Position, number>;

  for (const type of bootstrap.element_types) {
    const position = toPosition(type.id);
    quota[position] = type.squad_select;
    minPlay[position] = type.squad_min_play;
    maxPlay[position] = type.squad_max_play;
  }

  return {
    squadSize: bootstrap.game_settings.squad_squadsize,
    teamLimit: bootstrap.game_settings.squad_team_limit,
    totalBudget: toMillions(bootstrap.game_settings.squad_total_spend),
    positionQuota: quota,
    positionMinPlay: minPlay,
    positionMaxPlay: maxPlay,
  };
}

/**
 * Determines whether the element stat block describes last season or this one.
 *
 * Pre-season, FPL leaves last season's totals in `bootstrap-static` and only
 * resets them once the season is under way. Two signals together, because
 * either alone can mislead:
 *   - no gameweek has started or finished yet, AND
 *   - players nevertheless have recorded minutes
 * ...means we are looking at carryover from the previous season.
 */
/**
 * Labels the previous season from the upcoming season's first deadline.
 * A season starting in August 2026 is 2026/27, so the carryover stats are 2025/26.
 */
function previousSeasonLabel(bootstrap: RawBootstrap): string | null {
  const first = [...bootstrap.events].sort((a, b) => a.id - b.id)[0];
  if (!first) return null;

  const year = new Date(first.deadline_time).getUTCFullYear();
  if (Number.isNaN(year)) return null;

  const start = year - 1;
  return `${start}/${String((start + 1) % 100).padStart(2, '0')}`;
}

export function deriveStatsSeason(bootstrap: RawBootstrap): 'PREVIOUS' | 'CURRENT' {
  const seasonUnderway = bootstrap.events.some((event) => event.finished || event.is_current);
  if (seasonUnderway) return 'CURRENT';

  const hasRecordedMinutes = bootstrap.elements.some((element) => element.minutes > 0);
  return hasRecordedMinutes ? 'PREVIOUS' : 'CURRENT';
}

export function toSeasonMeta(bootstrap: RawBootstrap, ingestedAt: string): SeasonMeta {
  const current = bootstrap.events.find((event) => event.is_current) ?? null;
  const next = bootstrap.events.find((event) => event.is_next) ?? null;
  const statsSeason = deriveStatsSeason(bootstrap);

  return {
    statsSeason,
    // Only labelled when we know the stats are carryover; mid-season the label
    // would be guesswork, and a wrong label is worse than none.
    statsSeasonLabel: statsSeason === 'PREVIOUS' ? previousSeasonLabel(bootstrap) : null,
    currentEvent: current?.id ?? null,
    nextEvent: next?.id ?? null,
    nextDeadline: next?.deadline_time ?? null,
    totalPlayers: bootstrap.total_players,
    chipWindows: toChipWindows(bootstrap.chips, bootstrap.events.length),
    rules: toSquadRules(bootstrap),
    ingestedAt,
  };
}

/**
 * Build the fixture-difficulty matrix from REAL fixture data.
 *
 * Correctly represents:
 *  - blanks  (a team with no fixture in a gameweek → `isBlank`, 0 opponents)
 *  - doubles (a team with 2+ fixtures        → `isDouble`, 2+ opponents)
 *
 * Both of which the prototype faked, by declaring all 13 of its teams blank in
 * the same gameweek — something that cannot happen in the real game.
 */
export function buildFdrMatrix(
  teams: readonly Team[],
  fixtures: readonly Fixture[],
  fromEvent: number,
  eventCount: number,
): FdrRow[] {
  const shortById = new Map(teams.map((team) => [team.id, team.shortName]));
  const events = Array.from({ length: eventCount }, (_, i) => fromEvent + i);

  // Index fixtures by `${teamId}:${event}` so each cell is a direct lookup
  // rather than a scan of the full fixture list per team per gameweek.
  const byTeamEvent = new Map<string, FdrCell['opponents']>();

  for (const fixture of fixtures) {
    if (fixture.event === null) continue;

    const sides = [
      {
        teamId: fixture.teamHome,
        opponentId: fixture.teamAway,
        isHome: true,
        difficulty: fixture.difficultyHome,
      },
      {
        teamId: fixture.teamAway,
        opponentId: fixture.teamHome,
        isHome: false,
        difficulty: fixture.difficultyAway,
      },
    ];

    for (const side of sides) {
      const key = `${side.teamId}:${fixture.event}`;
      const opponents = byTeamEvent.get(key) ?? [];
      opponents.push({
        opponentShort: shortById.get(side.opponentId) ?? 'UNK',
        isHome: side.isHome,
        difficulty: side.difficulty,
      });
      byTeamEvent.set(key, opponents);
    }
  }

  return teams
    .map((team) => ({
      teamId: team.id,
      teamShort: team.shortName,
      teamName: team.name,
      cells: events.map((event): FdrCell => {
        const opponents = byTeamEvent.get(`${team.id}:${event}`) ?? [];
        const averageDifficulty =
          opponents.length === 0
            ? null
            : opponents.reduce((sum, o) => sum + o.difficulty, 0) / opponents.length;

        return {
          event,
          opponents,
          averageDifficulty,
          isBlank: opponents.length === 0,
          isDouble: opponents.length > 1,
        };
      }),
    }))
    .sort((a, b) => a.teamName.localeCompare(b.teamName));
}

/** Convenience: full bootstrap → all our projections in one pass. */
export function transformBootstrap(bootstrap: RawBootstrap, ingestedAt: string) {
  const teams = bootstrap.teams.map(toTeam);
  const teamShortById = new Map(teams.map((team) => [team.id, team.shortName]));

  return {
    teams,
    players: bootstrap.elements.map((element) => toPlayer(element, teamShortById)),
    gameweeks: bootstrap.events.map(toGameweek),
    meta: toSeasonMeta(bootstrap, ingestedAt),
  };
}
