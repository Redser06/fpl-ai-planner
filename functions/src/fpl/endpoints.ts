/**
 * The official FPL API surface we use.
 *
 * All of these are public and unauthenticated — verified live on 2026-08-13.
 * The API is undocumented and MAY change without notice, which is exactly why
 * every response is validated through a zod schema before it reaches Firestore.
 *
 * Deliberately NOT using the `fpl-api` npm package: last published 2022-07-19,
 * single maintainer, ~86 downloads/month, and it pulls in `superagent` to do
 * what fetch does natively. It is a thin wrapper over the eight URLs below —
 * no value on the other side of that supply-chain risk.
 */

export const FPL_BASE = 'https://fantasy.premierleague.com/api';

export const endpoints = {
  /** Players, teams, gameweeks, chips, game settings. ~1.37 MB — cache it. */
  bootstrap: () => `${FPL_BASE}/bootstrap-static/`,

  /** All fixtures, or one gameweek's. Carries the real 1-5 difficulty ratings. */
  fixtures: (event?: number) =>
    event === undefined ? `${FPL_BASE}/fixtures/` : `${FPL_BASE}/fixtures/?event=${event}`,

  /** Per-player detail: upcoming fixtures, this season's history, and past seasons. */
  elementSummary: (playerId: number) => `${FPL_BASE}/element-summary/${playerId}/`,

  /** A manager's entry (team) metadata. Public. */
  entry: (entryId: number) => `${FPL_BASE}/entry/${entryId}/`,

  /** A manager's season history. Public. */
  entryHistory: (entryId: number) => `${FPL_BASE}/entry/${entryId}/history/`,

  /**
   * A manager's picks for a gameweek.
   *
   * IMPORTANT: returns 404 until that gameweek's deadline has passed — squads
   * are private pre-deadline. Any "import my team" flow must handle this and
   * fall back to the manual squad builder.
   */
  entryPicks: (entryId: number, event: number) =>
    `${FPL_BASE}/entry/${entryId}/event/${event}/picks/`,

  /** Live per-player scores for a gameweek. Empty until the gameweek starts. */
  eventLive: (event: number) => `${FPL_BASE}/event/${event}/live/`,
} as const;
