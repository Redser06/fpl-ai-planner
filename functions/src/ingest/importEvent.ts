/**
 * Which gameweek's picks to import for a squad import request.
 *
 * FPL keeps a gameweek's picks private until its deadline has passed, so the
 * CURRENT event's picks 404 for most of the week. The importable event is the
 * latest one whose deadline has already gone — the squad the manager actually
 * fielded most recently.
 *
 * Pure, so it can be unit tested without firebase-admin initialising.
 */

import type { Gameweek } from '../../../shared/types';

/**
 * The latest gameweek whose deadline has passed, or null when none has
 * (pre-season). Handles unordered input and an empty list.
 */
export function latestClosedEvent(gameweeks: readonly Gameweek[], now: Date): number | null {
  const closed = gameweeks.filter((gameweek) => new Date(gameweek.deadlineTime) <= now);
  if (closed.length === 0) return null;
  return Math.max(...closed.map((gameweek) => gameweek.id));
}
