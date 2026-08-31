/**
 * Which gameweek's picks to serve for a live, read-only squad fetch.
 *
 * Unlike `importSquad` (which derives the event from our ingested `gameweeks`
 * collection), this proxy has no Firestore dependency — it reads the manager's
 * `current_event` straight from the live FPL entry payload and picks the latest
 * event whose picks are likely public.
 *
 * FPL keeps the CURRENT event's picks private until its deadline passes, so for
 * most of the week `current_event` 404s and the importable squad is the one
 * from `current_event - 1`. Once the deadline goes, `current_event` becomes
 * public and is the squad the manager fielded.
 *
 * Pure, so vitest can cover it without firing up firebase-admin.
 */

/**
 * The candidate events to try, most recent first. `null` means the entry has
 * not started an event yet (pre-season) — FPL leaves `current_event` null
 * then — so there is no public squad to fetch.
 *
 * - `null`: pre-season, nothing to try.
 * - `currentEvent <= 1`: only GW1 is in play, so we try GW1 alone. If that
 *   404s the season genuinely has not started.
 * - otherwise: try the current event, then the previous one.
 */
export function pickEventCandidates(currentEvent: number | null): number[] {
  if (currentEvent === null) return [];
  if (currentEvent <= 1) return [1];
  return [currentEvent, currentEvent - 1];
}
