/**
 * Builds a static data snapshot into public/data/.
 *
 * WHY THIS EXISTS: Cloud Functions need a Firebase project on the Blaze plan.
 * This script runs the exact same ingest + transform code against the live API
 * and writes the result as static JSON, so the app is fully usable on free
 * Firebase Hosting with no backend at all.
 *
 * It is not a toy fallback — for a personal tool it is arguably the right
 * architecture: run it on a schedule (GitHub Action / cron), redeploy hosting,
 * pay nothing. The Cloud Functions path exists for when you want per-user
 * squads and generated alerts.
 *
 *   npm run snapshot
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { fetchBootstrap, fetchFixtures } from '../functions/src/fpl/client';
import { buildFdrMatrix, toFixture, transformBootstrap } from '../functions/src/ingest/transform';

const OUT_DIR = join(process.cwd(), 'public', 'data');

/** How many gameweeks of fixture difficulty to precompute. */
const FDR_HORIZON = 8;

async function write(name: string, data: unknown): Promise<void> {
  const json = JSON.stringify(data);
  await writeFile(join(OUT_DIR, name), json);
  console.log(`  ${name.padEnd(16)} ${(json.length / 1024).toFixed(0)} KB`);
}

async function main(): Promise<void> {
  await mkdir(OUT_DIR, { recursive: true });
  const ingestedAt = new Date().toISOString();

  console.log('Fetching live FPL data...');
  const [bootstrap, rawFixtures] = await Promise.all([fetchBootstrap(), fetchFixtures()]);

  const { teams, players, gameweeks, meta } = transformBootstrap(bootstrap, ingestedAt);
  const fixtures = rawFixtures.map(toFixture);

  // Build the FDR matrix from the next gameweek, falling back to GW1 pre-season.
  const fromEvent = meta.nextEvent ?? meta.currentEvent ?? 1;
  const fdr = buildFdrMatrix(teams, fixtures, fromEvent, FDR_HORIZON);

  console.log(`Writing snapshot to ${OUT_DIR}`);
  await write('meta.json', meta);
  await write('teams.json', teams);
  await write('players.json', players);
  await write('fixtures.json', fixtures);
  await write('gameweeks.json', gameweeks);
  await write('fdr.json', { fromEvent, eventCount: FDR_HORIZON, rows: fdr });

  console.log(
    `\nDone. ${players.length} players, ${teams.length} teams, ${fixtures.length} fixtures.`,
  );
  console.log(`Next gameweek: ${meta.nextEvent ?? 'n/a'} (deadline ${meta.nextDeadline ?? 'n/a'})`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
