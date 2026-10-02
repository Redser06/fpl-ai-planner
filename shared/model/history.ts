/**
 * Gameweek-by-gameweek squad history — what squad form and season totals are
 * computed from.
 *
 * FPL only exposes `event_points` for the current gameweek, so history has to
 * be recorded while each gameweek is current. The picks are locked the first
 * time a gameweek is seen after its deadline (FPL locks teams then too), and
 * re-scored on every later refresh until FPL marks the gameweek finished.
 *
 * Points are the XI plus the captain multiplier. Auto-substitutions are not
 * applied: per-gameweek minutes are not in the data we ingest.
 */

import type { Gameweek, Player, SeasonMeta, Squad, SquadPick, SquadRules } from '../types';
import { costSquad, resolvePicks, scoreSquad } from './squad';

export interface GameweekResult {
  event: number;
  points: number;
  benchPoints: number;
  /** Squad value at the time, in millions. */
  squadValue: number;
  /** True once FPL marked the gameweek finished; the entry is then frozen. */
  final: boolean;
  /** The picks as locked at the deadline — scoring always uses these. */
  picks: SquadPick[];
  recordedAt: string;
}

export interface HistoryInput {
  squad: Squad | null;
  players: readonly Player[];
  gameweeks: readonly Gameweek[];
  meta: Pick<SeasonMeta, 'currentEvent' | 'statsSeason'>;
  rules: SquadRules;
  now: Date;
}

/**
 * Returns the updated history, or null when nothing changed (so callers can
 * skip a write and a re-render).
 */
export function updateHistory(
  history: readonly GameweekResult[],
  input: HistoryInput,
): GameweekResult[] | null {
  const { squad, players, gameweeks, meta, rules, now } = input;
  const event = meta.currentEvent;
  if (event === null || meta.statsSeason !== 'CURRENT') return null;

  const gameweek = gameweeks.find((candidate) => candidate.id === event);
  if (!gameweek || new Date(gameweek.deadlineTime) > now) return null;

  const existing = history.find((entry) => entry.event === event);
  if (existing?.final) return null;

  const picks = existing?.picks ?? squad?.picks;
  if (!picks || resolvePicks(picks, players).length !== rules.squadSize) return null;

  const score = scoreSquad(picks, players);
  const next: GameweekResult = {
    event,
    points: score.gameweekPoints,
    benchPoints: score.benchPoints,
    squadValue: existing?.squadValue ?? costSquad(picks, players, rules).squadValue,
    final: gameweek.finished,
    picks: [...picks],
    recordedAt: now.toISOString(),
  };

  if (
    existing &&
    existing.points === next.points &&
    existing.benchPoints === next.benchPoints &&
    existing.final === next.final
  ) {
    return null;
  }

  return [...history.filter((entry) => entry.event !== event), next].sort(
    (a, b) => a.event - b.event,
  );
}

/** Mean points over the last `window` recorded gameweeks, or null with none. */
export function squadForm(history: readonly GameweekResult[], window = 5): number | null {
  const recent = history.slice(-window);
  if (recent.length === 0) return null;
  return recent.reduce((total, entry) => total + entry.points, 0) / recent.length;
}
