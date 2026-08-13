/**
 * Records live FPL API responses to functions/test/fixtures/.
 *
 * These recordings are the offline corpus the schema tests run against, so the
 * test suite is deterministic and works with no network. Re-run this when you
 * want to refresh the corpus (e.g. after a known FPL change):
 *
 *   npm run record-fixtures
 *
 * If the schema tests start failing after a re-record, that is the signal that
 * FPL changed something we depend on.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { endpoints } from '../functions/src/fpl/endpoints.js';

const OUT_DIR = join(process.cwd(), 'functions', 'test', 'fixtures');

const USER_AGENT =
  'fpl-ai-planner/2.0 (personal FPL assistant; +https://github.com/Redser06/fpl-ai-planner)';

async function record(name: string, url: string): Promise<void> {
  const response = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
  if (!response.ok) {
    // A 404 is a legitimate recording for the pre-deadline picks case.
    console.warn(`  ${name}: HTTP ${response.status} — recording status only`);
    await writeFile(
      join(OUT_DIR, `${name}.status.json`),
      JSON.stringify({ url, status: response.status }, null, 2),
    );
    return;
  }

  const json = await response.json();
  await writeFile(join(OUT_DIR, `${name}.json`), JSON.stringify(json));
  const size = JSON.stringify(json).length;
  console.log(`  ${name}: ${(size / 1024).toFixed(0)} KB`);
}

async function main(): Promise<void> {
  await mkdir(OUT_DIR, { recursive: true });
  console.log(`Recording FPL API fixtures to ${OUT_DIR}`);

  await record('bootstrap', endpoints.bootstrap());
  await record('fixtures', endpoints.fixtures());
  // Player 1 is a stable, always-present element with 5 seasons of history.
  await record('element-summary', endpoints.elementSummary(1));
  await record('entry', endpoints.entry(1));
  // Expected to 404 before the gameweek deadline — that is the point.
  await record('entry-picks', endpoints.entryPicks(1, 1));

  console.log('Done.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
