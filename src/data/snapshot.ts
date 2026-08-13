/**
 * Loads the data snapshot the app renders from.
 *
 * Currently reads the static JSON written by `npm run snapshot` into
 * public/data/. That keeps the app fully functional on free Firebase Hosting
 * with no backend deployed.
 *
 * When the Cloud Functions backend is live, swap the implementation of
 * `loadSnapshot` to read the `datasets/*` documents from Firestore — the shape
 * is identical, because both are produced by the same transform code.
 */

import type { FdrRow, Fixture, Gameweek, Player, SeasonMeta, Team } from '../../shared/types';

export interface FdrMatrix {
  fromEvent: number;
  eventCount: number;
  rows: FdrRow[];
}

export interface Snapshot {
  meta: SeasonMeta;
  teams: Team[];
  players: Player[];
  fixtures: Fixture[];
  gameweeks: Gameweek[];
  fdr: FdrMatrix;
}

async function loadJson<T>(name: string): Promise<T> {
  const response = await fetch(`${import.meta.env.BASE_URL}data/${name}.json`);
  if (!response.ok) {
    throw new Error(
      `Could not load ${name}.json (HTTP ${response.status}). Run \`npm run snapshot\` to generate the data.`,
    );
  }
  return (await response.json()) as T;
}

export async function loadSnapshot(): Promise<Snapshot> {
  const [meta, teams, players, fixtures, gameweeks, fdr] = await Promise.all([
    loadJson<SeasonMeta>('meta'),
    loadJson<Team[]>('teams'),
    loadJson<Player[]>('players'),
    loadJson<Fixture[]>('fixtures'),
    loadJson<Gameweek[]>('gameweeks'),
    loadJson<FdrMatrix>('fdr'),
  ]);

  return { meta, teams, players, fixtures, gameweeks, fdr };
}
