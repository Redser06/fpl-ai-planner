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
import { HttpsError, onCall, onRequest } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { logger } from 'firebase-functions';

import {
  fetchBootstrap,
  fetchEntry,
  fetchEntryPicks,
  fetchFixtures,
  FplHttpError,
} from './fpl/client';
import { callerKey, RateLimiter, TtlCache } from './http/guard';
import {
  buildFdrMatrix,
  fdrEventCount,
  toFixture,
  toMillions,
  transformBootstrap,
} from './ingest/transform';
import { latestClosedEvent } from './ingest/importEvent';
import {
  fetchPublicSquad,
  InvalidEntryIdError,
  parseEntryId,
  type PublicSquadResult,
} from './ingest/publicSquad';
import { writeFixtures, writePlayers, writeSmallDatasets } from './ingest/store';
import type { Gameweek, Squad, SquadPick } from '../../shared/types';

initializeApp();
const db = getFirestore();

/** Gameweeks of fixture difficulty to precompute for the FDR matrix. */
const FDR_HORIZON = 8;

const REGION = 'europe-west2';

/**
 * Uids allowed to call privileged functions (manual ingest and anything else
 * that costs money). Set via the ADMIN_UIDS env var, comma-separated.
 *
 * Authentication is not authorisation: being signed in proves who you are,
 * it says nothing about what you may trigger.
 */
const ADMIN_UIDS = (process.env.ADMIN_UIDS ?? '')
  .split(',')
  .map((uid) => uid.trim())
  .filter(Boolean);

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
  const eventCount = fdrEventCount(gameweeks, fromEvent, FDR_HORIZON);
  const fdr = buildFdrMatrix(teams, fixtures, fromEvent, eventCount);

  await Promise.all([
    writePlayers(db, players, ingestedAt),
    writeFixtures(db, fixtures, ingestedAt),
    writeSmallDatasets(
      db,
      { teams, gameweeks, meta, fdr: { fromEvent, eventCount, rows: fdr } },
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
 *
 * Allowlisted: this writes the entire reference dataset and costs money, so it
 * is restricted to ADMIN_UIDS. Being signed in is not enough.
 */
export const ingestNow = onCall({ region: REGION, timeoutSeconds: 300 }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in to trigger an ingest.');
  if (!ADMIN_UIDS.includes(request.auth.uid)) {
    throw new HttpsError('permission-denied', 'This account may not trigger an ingest.');
  }
  const result = await runIngest();
  logger.info('Manual ingest complete', result);
  return result;
});

/**
 * Imports a squad from a public FPL entry id.
 *
 * Imports the latest gameweek whose deadline has passed (see importEvent.ts)
 * rather than the current one, so the flow works midweek and not just in the
 * few hours between a deadline and the next gameweek opening.
 *
 * Returns `{ status: 'PICKS_NOT_PUBLIC' }` rather than throwing when even the
 * previous event has no public picks (e.g. an entry created after it) — that
 * is a normal state, not an error, and the client falls back to the manual
 * squad builder.
 */
export const importSquad = onCall({ region: REGION, maxInstances: 3 }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in to import a squad.');

  const entryId = Number(request.data?.entryId);
  if (!Number.isInteger(entryId) || entryId <= 0) {
    throw new HttpsError('invalid-argument', 'entryId must be a positive integer.');
  }

  const gameweeksSnap = await db.collection('datasets').doc('gameweeks').get();
  const gameweeks = (gameweeksSnap.data()?.items as Gameweek[] | undefined) ?? [];
  const event = latestClosedEvent(gameweeks, new Date());

  if (event === null) {
    return { status: 'SEASON_NOT_STARTED' as const };
  }

  let entry: Awaited<ReturnType<typeof fetchEntry>>;
  let picks: Awaited<ReturnType<typeof fetchEntryPicks>>;
  try {
    [entry, picks] = await Promise.all([fetchEntry(entryId), fetchEntryPicks(entryId, event)]);
  } catch (error) {
    if (error instanceof FplHttpError && error.isNotFound) {
      throw new HttpsError('not-found', `No FPL team has entry id ${entryId}.`);
    }
    throw error;
  }

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
    // Derived client-side once player positions are known (LAZY 6 fix).
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

/**
 * Read-only HTTP proxy for a manager's fielded squad, live from FPL.
 *
 * GET /fetchSquadPublic?entryId=4698335
 *
 * No auth and no Firestore write: it is the public read `importSquad` performs,
 * exposed over plain HTTP so the squad list pulls before the full backend (and
 * its config) exists. Event choice comes from the live entry's `current_event`,
 * not our ingested datasets. The client prefers `importSquad` once the callable
 * is deployed and configured; this stays as the documented fallback.
 */
const proxyLimiter = new RateLimiter(10, 60_000);
const proxyCache = new TtlCache<PublicSquadResult>(5 * 60_000);

export const fetchSquadPublic = onRequest(
  { region: REGION, maxInstances: 2, timeoutSeconds: 90 },
  async (req, res) => {
    // CORS so the static site (any origin: hosting URL, preview channel, localhost)
    // can call it. It reads no cookies and returns no per-user secret, so a wildcard
    // origin is safe here; the squad it returns is FPL-public once the deadline passes.
    res.set('Access-Control-Allow-Origin', '*');

    if (req.method !== 'GET') {
      res.status(405).json({ error: 'Only GET is supported.' });
      return;
    }

    if (!proxyLimiter.allow(callerKey(req.headers['x-forwarded-for'], req.ip ?? 'unknown'))) {
      res.status(429).json({ error: 'Too many squad lookups — try again in a minute.' });
      return;
    }

    try {
      const entryId = parseEntryId(req.query.entryId);
      const cacheKey = String(entryId);
      const cached = proxyCache.get(cacheKey);
      if (cached) {
        res.status(200).json(cached);
        return;
      }

      const result = await fetchPublicSquad(entryId);
      proxyCache.set(cacheKey, result);
      res.status(200).json(result);
    } catch (error) {
      if (error instanceof InvalidEntryIdError) {
        res.status(400).json({ error: error.message });
        return;
      }
      if (error instanceof FplHttpError && error.isNotFound) {
        res.status(404).json({ error: 'No FPL team has that entry id.', code: 'ENTRY_NOT_FOUND' });
        return;
      }
      logger.error('fetchSquadPublic failed', error);
      res.status(502).json({ error: 'Upstream FPL request failed.', code: 'UPSTREAM_FAILED' });
    }
  },
);
