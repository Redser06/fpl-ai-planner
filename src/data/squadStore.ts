/**
 * Squad persistence.
 *
 * localStorage for now: there is no deployed backend and no auth, and a
 * personal tool should not require either to be useful. The `Squad` shape is
 * identical to what the `importSquad` Cloud Function writes to Firestore, so
 * moving to server-side persistence later is a swap of these two functions.
 */

import type { Squad } from '../../shared/types';

const STORAGE_KEY = 'fpl-assistant:squad:v1';

/** Per-gameweek record, appended as gameweeks complete. */
export interface GameweekResult {
  event: number;
  points: number;
  benchPoints: number;
  /** Squad value at the time, in millions. */
  squadValue: number;
  recordedAt: string;
}

const HISTORY_KEY = 'fpl-assistant:history:v1';

export function loadSquad(): Squad | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Squad;
    // Cheap shape guard — a corrupted or outdated entry should not crash the
    // app on load, it should just look like "no squad yet".
    if (!Array.isArray(parsed.picks) || parsed.picks.length === 0) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveSquad(squad: Squad): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(squad));
  } catch {
    // Private browsing or a full quota. Losing persistence is not worth
    // breaking the session over.
  }
}

export function clearSquad(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export function loadHistory(): GameweekResult[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as GameweekResult[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** Records a completed gameweek, replacing any existing entry for it. */
export function recordGameweek(result: GameweekResult): GameweekResult[] {
  const history = loadHistory().filter((entry) => entry.event !== result.event);
  const updated = [...history, result].sort((a, b) => a.event - b.event);

  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(updated));
  } catch {
    /* ignore */
  }

  return updated;
}
