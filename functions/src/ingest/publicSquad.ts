/**
 * fetchSquadPublic — a narrow, read-only HTTP proxy for one thing: a manager's
 * fielded squad, live from the FPL API.
 *
 * Why this exists: the FPL API sends no CORS headers, so a browser cannot fetch
 * `/entry/{id}/event/{n}/picks/` itself. `importSquad` solves that behind a
 * callable + anonymous auth + a Firestore write. This is the same read served
 * over plain HTTP with NO auth, NO write, and NO dependency on our ingested
 * datasets — so the squad list pulls even before the full backend is deployed.
 *
 * The trust boundary is intact: every FPL response is zod-validated (in
 * fpl/client) before it leaves this process, and the return shape is the exact
 * ImportSquadResult union the client already renders.
 *
 * The HTTP surface (query parsing, status codes) is a thin shell in index.ts;
 * everything that decides WHAT to fetch lives here so vitest can cover it.
 */

import type { Squad, SquadPick } from '../../../shared/types';
import { fetchEntry, fetchEntryPicks } from '../fpl/client';
import { toMillions } from './transform';
import { pickEventCandidates } from './publicSquadEvent';

/** Mirrors the callable's result so client routing needs no per-path fork. */
export type PublicSquadResult =
  | { status: 'OK'; entryName: string; squad: Squad }
  | { status: 'PICKS_NOT_PUBLIC'; entryName: string }
  | { status: 'SEASON_NOT_STARTED' };

/** Thrown for an entry id that is not a positive integer — maps to HTTP 400. */
export class InvalidEntryIdError extends Error {}

export function parseEntryId(raw: unknown): number {
  const entryId = Number(raw);
  if (!Number.isInteger(entryId) || entryId <= 0) {
    throw new InvalidEntryIdError('entryId must be a positive integer.');
  }
  return entryId;
}

/** Injectable for tests; the real default talks to the live FPL API. */
export interface PublicSquadDeps {
  fetchEntry: typeof fetchEntry;
  fetchEntryPicks: typeof fetchEntryPicks;
  now?: () => Date;
}

const defaultDeps: PublicSquadDeps = { fetchEntry, fetchEntryPicks };

/**
 * Fetches the latest publicly visible squad for an entry.
 *
 * Event choice comes from the live entry's `current_event`, not our snapshot:
 * try the current event, fall back to the previous one when it is still
 * private, and only declare the season un-started when GW1 itself is private.
 */
export async function fetchPublicSquad(
  entryIdRaw: unknown,
  deps: PublicSquadDeps = defaultDeps,
): Promise<PublicSquadResult> {
  const entryId = parseEntryId(entryIdRaw);
  const entry = await deps.fetchEntry(entryId);

  const candidates = pickEventCandidates(entry.current_event);
  if (candidates.length === 0) {
    // current_event is null: the entry has not started an event — pre-season.
    return { status: 'SEASON_NOT_STARTED' };
  }

  for (const event of candidates) {
    const picks = await deps.fetchEntryPicks(entryId, event);
    if (!picks) continue; // that event is still private — try the previous one

    const squadPicks: SquadPick[] = picks.picks.map((pick) => ({
      playerId: pick.element,
      slot: pick.position,
      isCaptain: pick.is_captain,
      isViceCaptain: pick.is_vice_captain,
    }));

    const squad: Squad = {
      picks: squadPicks,
      // Derived client-side once positions are known (LAZY 6 fix), same as importSquad.
      formation: '',
      captainId: squadPicks.find((pick) => pick.isCaptain)?.playerId ?? 0,
      viceCaptainId: squadPicks.find((pick) => pick.isViceCaptain)?.playerId ?? 0,
      bank: toMillions(picks.entry_history.bank),
      squadValue: toMillions(picks.entry_history.value),
      entryId,
      source: 'IMPORTED',
      updatedAt: (deps.now?.() ?? new Date()).toISOString(),
    };

    return { status: 'OK', entryName: entry.name, squad };
  }

  // Every candidate event 404'd. If only GW1 was ever in play, the season has
  // not started; anything later means the manager's picks have never gone
  // public this season. (The null case returns above, so this is a number.)
  if ((entry.current_event ?? 0) <= 1) {
    return { status: 'SEASON_NOT_STARTED' };
  }
  return { status: 'PICKS_NOT_PUBLIC', entryName: entry.name };
}
