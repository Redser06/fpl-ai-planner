/**
 * Squad persistence.
 *
 * localStorage for now: there is no deployed backend and no auth, and a
 * personal tool should not require either to be useful. The `Squad` shape is
 * identical to what the `importSquad` Cloud Function writes to Firestore, so
 * moving to server-side persistence later is a swap of these two functions.
 */

import type { GameweekResult } from '../../shared/model/history';
import type { Squad } from '../../shared/types';

const STORAGE_KEY = 'fpl-assistant:squad:v1';

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

const ENTRY_ID_KEY = 'fpl-assistant:entryId:v1';

/** The FPL entry id used for squad import, so a re-import is one click. */
export function loadEntryId(): number | null {
  try {
    const raw = localStorage.getItem(ENTRY_ID_KEY);
    if (!raw) return null;
    const id = Number(raw);
    return Number.isInteger(id) && id > 0 ? id : null;
  } catch {
    return null;
  }
}

export function saveEntryId(entryId: number): void {
  try {
    localStorage.setItem(ENTRY_ID_KEY, String(entryId));
  } catch {
    /* ignore */
  }
}

export function loadHistory(): GameweekResult[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as GameweekResult[];
    if (!Array.isArray(parsed)) return [];
    // Entries without locked picks cannot be re-scored, so they are dropped.
    return parsed.filter((entry) => Array.isArray(entry?.picks) && typeof entry.event === 'number');
  } catch {
    return [];
  }
}

export function saveHistory(history: readonly GameweekResult[]): void {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  } catch {
    /* ignore */
  }
}

const TAB_KEY = 'fpl-assistant:tab:v1';

export function loadActiveTab(): string | null {
  try {
    return localStorage.getItem(TAB_KEY);
  } catch {
    return null;
  }
}

export function saveActiveTab(tab: string): void {
  try {
    localStorage.setItem(TAB_KEY, tab);
  } catch {
    /* ignore */
  }
}
