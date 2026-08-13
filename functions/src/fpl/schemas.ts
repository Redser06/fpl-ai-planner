/**
 * Zod schemas for the raw FPL API responses.
 *
 * These are the trust boundary. The FPL API is undocumented and changes
 * mid-season without notice; parsing here means a shape change fails loudly at
 * ingest instead of quietly writing garbage into Firestore.
 *
 * Two deliberate choices:
 *  - Objects STRIP unknown keys rather than rejecting them, so FPL adding a
 *    106th field is a no-op for us. Only changes to fields we depend on break.
 *  - Numeric types match what the API actually returns, verified across all 584
 *    elements on 2026-08-13: season totals are STRINGS ("0.00"), per-90 rates
 *    are NUMBERS, and `ep_next` is a STRING. Getting this wrong is the single
 *    easiest way to silently corrupt the model's inputs.
 */

import { z } from 'zod';

/** A numeric the API sends as a string, e.g. "541.6" or "0.00". */
const numericString = z
  .string()
  .transform((v, ctx) => {
    const n = Number(v);
    if (!Number.isFinite(n)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Expected numeric string, got "${v}"` });
      return z.NEVER;
    }
    return n;
  });

/** Same, but the API may also send null (pre-season `ep_this` does). */
const nullableNumericString = z
  .union([z.string(), z.null()])
  .transform((v) => (v === null ? null : Number(v)))
  .refine((v) => v === null || Number.isFinite(v), { message: 'Expected numeric string or null' });

export const teamSchema = z.object({
  id: z.number(),
  code: z.number(),
  name: z.string(),
  short_name: z.string(),
  strength_overall_home: z.number(),
  strength_overall_away: z.number(),
  strength_attack_home: z.number(),
  strength_attack_away: z.number(),
  strength_defence_home: z.number(),
  strength_defence_away: z.number(),
});

export const elementTypeSchema = z.object({
  id: z.number(),
  singular_name_short: z.string(),
  squad_select: z.number(),
  squad_min_play: z.number(),
  squad_max_play: z.number(),
});

export const elementSchema = z.object({
  id: z.number(),
  code: z.number(),
  web_name: z.string(),
  first_name: z.string(),
  second_name: z.string(),
  team: z.number(),
  element_type: z.number(),

  now_cost: z.number(),
  cost_change_event: z.number(),
  cost_change_start: z.number(),

  status: z.string(),
  news: z.string(),
  chance_of_playing_next_round: z.number().nullable(),

  total_points: z.number(),
  event_points: z.number(),
  form: numericString,
  points_per_game: numericString,
  minutes: z.number(),
  starts: z.number(),
  selected_by_percent: numericString,

  goals_scored: z.number(),
  assists: z.number(),
  clean_sheets: z.number(),
  bonus: z.number(),
  bps: z.number(),
  ict_index: numericString,

  // Season totals arrive as strings.
  expected_goals: numericString,
  expected_assists: numericString,
  expected_goal_involvements: numericString,
  expected_goals_conceded: numericString,

  // Per-90 rates arrive as numbers.
  expected_goals_per_90: z.number(),
  expected_assists_per_90: z.number(),
  expected_goal_involvements_per_90: z.number(),
  expected_goals_conceded_per_90: z.number(),

  defensive_contribution: z.number(),
  defensive_contribution_per_90: z.number(),

  transfers_in_event: z.number(),
  transfers_out_event: z.number(),

  /** FPL's own expected points for the next gameweek. Our model's baseline. */
  ep_next: nullableNumericString,

  penalties_order: z.number().nullable(),
  corners_and_indirect_freekicks_order: z.number().nullable(),
});

export const eventSchema = z.object({
  id: z.number(),
  name: z.string(),
  deadline_time: z.string(),
  finished: z.boolean(),
  is_current: z.boolean(),
  is_next: z.boolean(),
  is_previous: z.boolean(),
});

export const chipSchema = z.object({
  name: z.string(),
  start_event: z.number(),
  stop_event: z.number(),
});

export const gameSettingsSchema = z.object({
  squad_squadsize: z.number(),
  squad_team_limit: z.number(),
  squad_total_spend: z.number(),
});

export const bootstrapSchema = z.object({
  events: z.array(eventSchema),
  teams: z.array(teamSchema),
  elements: z.array(elementSchema),
  element_types: z.array(elementTypeSchema),
  chips: z.array(chipSchema),
  game_settings: gameSettingsSchema,
  total_players: z.number(),
});

export const fixtureSchema = z.object({
  id: z.number(),
  event: z.number().nullable(),
  kickoff_time: z.string().nullable(),
  team_h: z.number(),
  team_a: z.number(),
  team_h_difficulty: z.number(),
  team_a_difficulty: z.number(),
  team_h_score: z.number().nullable(),
  team_a_score: z.number().nullable(),
  finished: z.boolean(),
});

export const fixturesSchema = z.array(fixtureSchema);

/** One prior season's totals, from element-summary. Solves the cold-start problem. */
export const historyPastSchema = z.object({
  season_name: z.string(),
  element_code: z.number(),
  start_cost: z.number(),
  end_cost: z.number(),
  total_points: z.number(),
  minutes: z.number(),
  goals_scored: z.number(),
  assists: z.number(),
  clean_sheets: z.number(),
  goals_conceded: z.number(),
  bonus: z.number(),
  bps: z.number(),
  starts: z.number(),
  expected_goals: numericString,
  expected_assists: numericString,
  expected_goal_involvements: numericString,
  expected_goals_conceded: numericString,
  defensive_contribution: z.number(),
});

/** One gameweek of this season, from element-summary. */
export const historyEntrySchema = z.object({
  element: z.number(),
  round: z.number(),
  minutes: z.number(),
  total_points: z.number(),
  was_home: z.boolean(),
  opponent_team: z.number(),
  expected_goals: numericString,
  expected_assists: numericString,
  expected_goal_involvements: numericString,
  expected_goals_conceded: numericString,
  defensive_contribution: z.number(),
  bps: z.number(),
  value: z.number(),
});

export const elementSummarySchema = z.object({
  history: z.array(historyEntrySchema),
  history_past: z.array(historyPastSchema),
});

export const entrySchema = z.object({
  id: z.number(),
  name: z.string(),
  player_first_name: z.string(),
  player_last_name: z.string(),
  summary_overall_points: z.number().nullable(),
  summary_overall_rank: z.number().nullable(),
  last_deadline_bank: z.number().nullable(),
  last_deadline_value: z.number().nullable(),
});

export const entryPickSchema = z.object({
  element: z.number(),
  position: z.number(),
  is_captain: z.boolean(),
  is_vice_captain: z.boolean(),
  multiplier: z.number(),
});

export const entryPicksSchema = z.object({
  active_chip: z.string().nullable(),
  entry_history: z.object({
    event: z.number(),
    bank: z.number(),
    value: z.number(),
  }),
  picks: z.array(entryPickSchema),
});

export type RawBootstrap = z.infer<typeof bootstrapSchema>;
export type RawElement = z.infer<typeof elementSchema>;
export type RawTeam = z.infer<typeof teamSchema>;
export type RawFixture = z.infer<typeof fixtureSchema>;
export type RawEvent = z.infer<typeof eventSchema>;
export type RawElementSummary = z.infer<typeof elementSummarySchema>;
export type RawEntry = z.infer<typeof entrySchema>;
export type RawEntryPicks = z.infer<typeof entryPicksSchema>;
export type RawHistoryPast = z.infer<typeof historyPastSchema>;
