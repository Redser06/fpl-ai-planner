/**
 * Firestore writers for ingested data.
 *
 * DESIGN NOTE — why datasets are chunked into a handful of documents rather
 * than one document per player:
 *
 * Writing 584 player documents on an hourly schedule is ~14,000 writes/day,
 * which sits right on top of the Firestore free-tier limit of 20,000. Chunking
 * the same data into 4 documents makes it ~9 writes per ingest (~216/day), and
 * the client reads 4 documents instead of 584. For a personal tool this is
 * strictly better on cost, latency and quota, and the only thing given up is
 * per-player queries — which we do not need, because the client holds the whole
 * player list in memory anyway.
 *
 * Chunk size is bounded by Firestore's 1 MB per-document limit. At ~700 bytes
 * per slim player, 150 per chunk is ~105 KB — comfortable headroom.
 */

import type { Firestore } from 'firebase-admin/firestore';
import type {
  FdrRow,
  Fixture,
  Gameweek,
  Player,
  SeasonMeta,
  Team,
} from '../../../shared/types';

/** Public, read-only reference data. Written only by ingest functions. */
export const DATASETS = 'datasets';

const PLAYER_CHUNK_SIZE = 150;
const FIXTURE_CHUNK_SIZE = 200;

function chunk<T>(items: readonly T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

/**
 * Writes a chunked dataset and records the chunk count on an index document,
 * so a reader always knows how many chunks to fetch — and so a shrinking
 * dataset cannot leave stale chunks being read as live data.
 */
async function writeChunked<T>(
  db: Firestore,
  name: string,
  items: readonly T[],
  chunkSize: number,
  ingestedAt: string,
): Promise<void> {
  const chunks = chunk(items, chunkSize);
  const batch = db.batch();

  chunks.forEach((items, index) => {
    batch.set(db.collection(DATASETS).doc(`${name}-${index}`), {
      items,
      chunkIndex: index,
      ingestedAt,
    });
  });

  batch.set(db.collection(DATASETS).doc(name), {
    chunkCount: chunks.length,
    itemCount: items.length,
    ingestedAt,
  });

  await batch.commit();

  // Remove any chunks left over from a previously larger dataset.
  const stale = await db
    .collection(DATASETS)
    .where('chunkIndex', '>=', chunks.length)
    .get();
  if (!stale.empty) {
    const cleanup = db.batch();
    stale.docs
      .filter((doc) => doc.id.startsWith(`${name}-`))
      .forEach((doc) => cleanup.delete(doc.ref));
    await cleanup.commit();
  }
}

export async function writePlayers(
  db: Firestore,
  players: readonly Player[],
  ingestedAt: string,
): Promise<void> {
  await writeChunked(db, 'players', players, PLAYER_CHUNK_SIZE, ingestedAt);
}

export async function writeFixtures(
  db: Firestore,
  fixtures: readonly Fixture[],
  ingestedAt: string,
): Promise<void> {
  await writeChunked(db, 'fixtures', fixtures, FIXTURE_CHUNK_SIZE, ingestedAt);
}

/** Small datasets fit in a single document. */
export async function writeSmallDatasets(
  db: Firestore,
  data: {
    teams: readonly Team[];
    gameweeks: readonly Gameweek[];
    meta: SeasonMeta;
    fdr: { fromEvent: number; eventCount: number; rows: FdrRow[] };
  },
  ingestedAt: string,
): Promise<void> {
  const batch = db.batch();
  batch.set(db.collection(DATASETS).doc('teams'), { items: data.teams, ingestedAt });
  batch.set(db.collection(DATASETS).doc('gameweeks'), { items: data.gameweeks, ingestedAt });
  batch.set(db.collection(DATASETS).doc('meta'), { ...data.meta, ingestedAt });
  batch.set(db.collection(DATASETS).doc('fdr'), { ...data.fdr, ingestedAt });
  await batch.commit();
}
