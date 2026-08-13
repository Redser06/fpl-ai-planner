/**
 * Single source of truth for types shared between the Cloud Functions backend
 * and the React SPA.
 *
 * These are OUR types — the slim, stable projection we serve to the client.
 * They are deliberately NOT the raw FPL API shape (that lives in
 * functions/src/fpl/schemas.ts, where it is validated at the boundary).
 * The raw `elements` object carries 105 fields and changes without notice;
 * everything below is what we actually commit to.
 */

/** FPL element_type ids: 1=GKP, 2=DEF, 3=MID, 4=FWD. */
export type Position = 'GKP' | 'DEF' | 'MID' | 'FWD';

/**
 * Derived from the raw FPL `status` char:
 *   a -> AVAILABLE   d -> DOUBTFUL   i -> INJURED
 *   s -> SUSPENDED   u -> UNAVAILABLE  n -> NOT_IN_SQUAD (loaned out etc.)
 */
export type Availability =
  | 'AVAILABLE'
  | 'DOUBTFUL'
  | 'INJURED'
  | 'SUSPENDED'
  | 'UNAVAILABLE'
  | 'NOT_IN_SQUAD';

export interface Team {
  id: number;
  code: number;
  name: string;
  shortName: string;
  /** FPL's own 1-5 strength ratings, split home/away. Used for fixture adjustment. */
  strengthOverallHome: number;
  strengthOverallAway: number;
  strengthAttackHome: number;
  strengthAttackAway: number;
  strengthDefenceHome: number;
  strengthDefenceAway: number;
}

/**
 * Slim player projection: ~30 of the raw 105 fields.
 * Prices are in millions (raw `now_cost` is tenths — always divided at the boundary).
 */
export interface Player {
  id: number;
  /** Stable across seasons; `id` is not. Use this to join history. */
  code: number;
  webName: string;
  firstName: string;
  secondName: string;

  teamId: number;
  teamShort: string;
  position: Position;

  /** In millions, e.g. 14.5 — NOT the raw tenths value. */
  price: number;
  /** Price movement this gameweek, in millions. */
  priceChangeEvent: number;
  /** Price movement since season start, in millions. */
  priceChangeStart: number;

  availability: Availability;
  /** Raw FPL news string, e.g. "Hamstring injury - 75% chance of playing". */
  news: string;
  /** 0-100, or null when FPL gives no figure. */
  chanceOfPlayingNextRound: number | null;

  totalPoints: number;
  eventPoints: number;
  /** FPL's rolling form figure (points/game over `stats_form_days`). */
  form: number;
  pointsPerGame: number;
  minutes: number;
  starts: number;
  selectedByPercent: number;

  goalsScored: number;
  assists: number;
  cleanSheets: number;
  bonus: number;
  bps: number;
  ictIndex: number;

  /** Expected stats — season totals. */
  xG: number;
  xA: number;
  xGI: number;
  xGC: number;
  /** Per-90 rates. These are what the model actually consumes. */
  xGPer90: number;
  xAPer90: number;
  xGIPer90: number;
  xGCPer90: number;

  /** 2025/26+ defensive contribution points rule. */
  defensiveContribution: number;
  defensiveContributionPer90: number;

  /** Net transfers this gameweek — the input to price-change prediction. */
  transfersInEvent: number;
  transfersOutEvent: number;

  /** FPL's OWN expected points for the next gameweek. Our model's baseline to beat. */
  epNext: number;

  /** Set-piece order: 1 = first choice, null = not on them. */
  penaltiesOrder: number | null;
  cornersOrder: number | null;
}

export interface Fixture {
  id: number;
  /** Gameweek number. Null for fixtures not yet assigned to a gameweek. */
  event: number | null;
  kickoffTime: string | null;
  teamHome: number;
  teamAway: number;
  /** FPL's real 1-5 difficulty, from the perspective of each side. */
  difficultyHome: number;
  difficultyAway: number;
  finished: boolean;
  scoreHome: number | null;
  scoreAway: number | null;
}

export interface Gameweek {
  id: number;
  name: string;
  deadlineTime: string;
  finished: boolean;
  isCurrent: boolean;
  isNext: boolean;
  isPrevious: boolean;
}

/**
 * A single team's fixture run for one gameweek, as rendered in the FDR matrix.
 * `opponents` has length 0 for a blank gameweek and 2+ for a double.
 */
export interface FdrCell {
  event: number;
  opponents: Array<{
    opponentShort: string;
    isHome: boolean;
    difficulty: number;
  }>;
  /** Mean difficulty across the cell's fixtures. Null when blank. */
  averageDifficulty: number | null;
  isBlank: boolean;
  isDouble: boolean;
}

export interface FdrRow {
  teamId: number;
  teamShort: string;
  teamName: string;
  cells: FdrCell[];
}

/**
 * Chip availability. The real game gives TWO of each chip, split across
 * first half (GW1-19) and second half (GW20-38) — not one of each.
 */
export type ChipName = 'wildcard' | 'freehit' | 'bboost' | '3xc';

export interface ChipWindow {
  name: ChipName;
  startEvent: number;
  stopEvent: number;
  /** 1 = first-half chip set, 2 = second-half set. */
  half: 1 | 2;
}

/** Squad construction rules, read from live `game_settings` rather than hardcoded. */
export interface SquadRules {
  squadSize: number;
  /** Max players from any one club. */
  teamLimit: number;
  /** Total budget in millions, e.g. 100.0. */
  totalBudget: number;
  /** Per-position squad quotas, e.g. GKP: 2, DEF: 5, MID: 5, FWD: 3. */
  positionQuota: Record<Position, number>;
  /** Min/max of each position allowed in the starting XI. */
  positionMinPlay: Record<Position, number>;
  positionMaxPlay: Record<Position, number>;
}

export interface SeasonMeta {
  /** Gameweek currently in progress, if any. */
  currentEvent: number | null;
  /** Next gameweek to be played — what we plan against. */
  nextEvent: number | null;
  nextDeadline: string | null;
  totalPlayers: number;
  chipWindows: ChipWindow[];
  rules: SquadRules;
  /** ISO timestamp of the ingest that produced this snapshot. */
  ingestedAt: string;
}

/** A user's squad. Either built by hand or imported from an FPL entry id. */
export interface Squad {
  /** 15 player ids, in FPL pick order (1-11 starters, 12-15 bench). */
  picks: SquadPick[];
  formation: string;
  captainId: number;
  viceCaptainId: number;
  /** In millions. */
  bank: number;
  squadValue: number;
  /** Set when imported rather than hand-built. */
  entryId?: number;
  source: 'MANUAL' | 'IMPORTED';
  updatedAt: string;
}

export interface SquadPick {
  playerId: number;
  /** 1-15. Positions 1-11 are the starting XI. */
  slot: number;
  isCaptain: boolean;
  isViceCaptain: boolean;
}

export type AlertSeverity = 'CRITICAL' | 'WARNING' | 'INFO';

export type AlertType =
  | 'INJURY'
  | 'SUSPENSION'
  | 'PRICE_RISE'
  | 'PRICE_FALL'
  | 'FORM_SLUMP'
  | 'FIXTURE_SWING'
  | 'BLANK_GW'
  | 'DOUBLE_GW'
  | 'CAPTAINCY'
  | 'CHIP_WINDOW';

/**
 * The core product object. Kept close to the prototype's original schema, which
 * was the best idea in it — particularly `replacementId` powering a one-click fix.
 *
 * `evidence` is the addition that makes alerts trustworthy: every alert must cite
 * the source field it was derived from, so nothing is ever unexplainable.
 */
export interface Alert {
  id: string;
  severity: AlertSeverity;
  type: AlertType;
  title: string;
  description: string;
  /** Button label, e.g. "Swap for Foden". */
  actionLabel: string | null;
  /** Player the alert is about. */
  targetId: number | null;
  /** Player to swap in, if the alert has a one-click fix. */
  replacementId: number | null;
  /** Which gameweek this concerns. */
  event: number;
  /**
   * Traceability: the raw API fields this alert was derived from.
   * e.g. [{ field: 'chance_of_playing_next_round', value: 75 }]
   */
  evidence: Array<{ field: string; value: string | number | null }>;
  /** Ranking weight — higher surfaces first. */
  priority: number;
  createdAt: string;
}
