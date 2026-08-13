/**
 * Cloud Functions entrypoint.
 *
 * Two kinds of function only:
 *
 *  1. SCHEDULED INGEST — the only writers of reference data. They pull from the
 *     FPL API (which sends no CORS headers, so a browser cannot do this itself)
 *     and write validated, slim projections into Firestore.
 *
 *  2. CALLABLES — for the things that genuinely need a server: importing a
 *     squad from an FPL entry id (again, CORS) and saving a user's own squad.
 *
 * Reference data is read by the client DIRECTLY from Firestore rather than
 * through a callable: it is public, non-sensitive, and direct reads avoid
 * function cold starts and invocation cost entirely. Writes are denied to
 * clients by firestore.rules.
 */

import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { logger } from 'firebase-functions';

import { fetchBootstrap, fetchEntry, fetchEntryPicks, fetchFixtures } from './fpl/client';
import { buildFdrMatrix, toFixture, transformBootstrap } from './ingest/transform';
import { writeFixtures, writePlayers, writeSmallDatasets } from './ingest/store';
import { toMillions } from './ingest/transform';
import type { Squad, SquadPick } from '../../shared/types';

initializeApp();
const db = getFirestore();

/** Gameweeks of fixture difficulty to precompute for the FDR matrix. */
const FDR_HORIZON = 8;

const REGION = 'europe-west2';

/**
 * Full ingest: bootstrap + fixtures + derived FDR matrix.
 *
 * Hourly is deliberately conservative. Player prices change once a day (~01:30
 * UTC) and injury news trickles in through the day; hourly catches both without
 * hammering a free public API.
 */
async function runIngest(): Promise<{ players: number; fixtures: number }> {
  const ingestedAt = new Date().toISOString();

  const [bootstrap, rawFixtures] = await Promise.all([fetchBootstrap(), fetchFixtures()]);

  const { teams, players, gameweeks, meta } = transformBootstrap(bootstrap, ingestedAt);
  const fixtures = rawFixtures.map(toFixture);

  const fromEvent = meta.nextEvent ?? meta.currentEvent ?? 1;
  const fdr = buildFdrMatrix(teams, fixtures, fromEvent, FDR_HORIZON);

  await Promise.all([
    writePlayers(db, players, ingestedAt),
    writeFixtures(db, fixtures, ingestedAt),
    writeSmallDatasets(
      db,
      { teams, gameweeks, meta, fdr: { fromEvent, eventCount: FDR_HORIZON, rows: fdr } },
      ingestedAt,
    ),
  ]);

  return { players: players.length, fixtures: fixtures.length };
}

export const ingestHourly = onSchedule(
  { schedule: 'every 60 minutes', region: REGION, timeoutSeconds: 300, memory: '512MiB' },
  async () => {
    const result = await runIngest();
    logger.info('Ingest complete', result);
  },
);

/**
 * Manual ingest trigger, so you can populate Firestore immediately after
 * deploying rather than waiting for the first scheduled run.
 */
export const ingestNow = onCall({ region: REGION, timeoutSeconds: 300 }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in to trigger an ingest.');
  const result = await runIngest();
  logger.info('Manual ingest complete', result);
  return result;
});

/**
 * Imports a squad from a public FPL entry id.
 *
 * Returns `{ status: 'PICKS_NOT_PUBLIC' }` rather than throwing when the
 * gameweek deadline has not passed: FPL keeps picks private until then, so this
 * is a normal pre-deadline state, not an error. The client falls back to the
 * manual squad builder.
 */
export const importSquad = onCall({ region: REGION }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in to import a squad.');

  const entryId = Number(request.data?.entryId);
  if (!Number.isInteger(entryId) || entryId <= 0) {
    throw new HttpsError('invalid-argument', 'entryId must be a positive integer.');
  }

  const metaSnap = await db.collection('datasets').doc('meta').get();
  const currentEvent = metaSnap.data()?.currentEvent as number | null | undefined;

  if (!currentEvent) {
    return { status: 'SEASON_NOT_STARTED' as const };
  }

  const [entry, picks] = await Promise.all([
    fetchEntry(entryId),
    fetchEntryPicks(entryId, currentEvent),
  ]);

  if (!picks) {
    return { status: 'PICKS_NOT_PUBLIC' as const, entryName: entry.name };
  }

  const squadPicks: SquadPick[] = picks.picks.map((pick) => ({
    playerId: pick.element,
    slot: pick.position,
    isCaptain: pick.is_captain,
    isViceCaptain: pick.is_vice_captain,
  }));

  const squad: Squad = {
    picks: squadPicks,
    // Derived from the picks themselves once the client has player positions.
    formation: '',
    captainId: squadPicks.find((pick) => pick.isCaptain)?.playerId ?? 0,
    viceCaptainId: squadPicks.find((pick) => pick.isViceCaptain)?.playerId ?? 0,
    bank: toMillions(picks.entry_history.bank),
    squadValue: toMillions(picks.entry_history.value),
    entryId,
    source: 'IMPORTED',
    updatedAt: new Date().toISOString(),
  };

  await db.collection('squads').doc(request.auth.uid).set(squad);

  return { status: 'OK' as const, entryName: entry.name, squad };
});
