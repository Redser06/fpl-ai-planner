/**
 * Transform-layer tests.
 *
 * Runs against the real recorded bootstrap/fixtures, plus synthetic fixtures for
 * blank and double gameweeks (which do not exist in the pre-season schedule but
 * are exactly the cases the prototype got wrong).
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { bootstrapSchema, fixturesSchema } from '../src/fpl/schemas';
import {
  buildFdrMatrix,
  toAvailability,
  toChipWindows,
  toFixture,
  toMillions,
  toPosition,
  toSquadRules,
  transformBootstrap,
} from '../src/ingest/transform';
import type { Fixture, Team } from '../../shared/types';

const FIXTURES = join(__dirname, 'fixtures');
const load = (name: string): unknown =>
  JSON.parse(readFileSync(join(FIXTURES, `${name}.json`), 'utf8'));

const bootstrap = bootstrapSchema.parse(load('bootstrap'));
const rawFixtures = fixturesSchema.parse(load('fixtures'));
const fixtures = rawFixtures.map(toFixture);
const { teams, players, meta } = transformBootstrap(bootstrap, '2026-08-13T00:00:00.000Z');

describe('scalar transforms', () => {
  it('converts tenths to millions without float drift', () => {
    expect(toMillions(1000)).toBe(100);
    expect(toMillions(145)).toBe(14.5);
    expect(toMillions(45)).toBe(4.5);
    expect(toMillions(-2)).toBe(-0.2);
  });

  it('maps element types to positions', () => {
    expect(toPosition(1)).toBe('GKP');
    expect(toPosition(4)).toBe('FWD');
    expect(() => toPosition(9)).toThrow();
  });

  it('maps availability codes, degrading unknown codes safely', () => {
    expect(toAvailability('a')).toBe('AVAILABLE');
    expect(toAvailability('i')).toBe('INJURED');
    expect(toAvailability('d')).toBe('DOUBTFUL');
    // A code FPL has not invented yet must not take the ingest down.
    expect(toAvailability('zzz')).toBe('UNAVAILABLE');
  });
});

describe('player projection', () => {
  it('projects every element without loss', () => {
    expect(players).toHaveLength(bootstrap.elements.length);
  });

  it('produces sane prices in millions, never raw tenths', () => {
    for (const player of players) {
      expect(player.price).toBeGreaterThanOrEqual(3.5);
      expect(player.price).toBeLessThanOrEqual(20);
    }
  });

  it('resolves every player to a real team short name', () => {
    const shortNames = new Set(teams.map((team) => team.shortName));
    for (const player of players) {
      expect(shortNames.has(player.teamShort)).toBe(true);
    }
  });

  it('never emits NaN into a numeric field', () => {
    // The string-vs-number split in the raw API makes this the most likely
    // silent corruption, so it is asserted across every player and field.
    for (const player of players) {
      for (const [key, value] of Object.entries(player)) {
        if (typeof value === 'number') {
          expect(Number.isFinite(value), `${player.webName}.${key} was ${value}`).toBe(true);
        }
      }
    }
  });
});

describe('season meta', () => {
  it('reads squad rules from the live API rather than hardcoding them', () => {
    const rules = toSquadRules(bootstrap);
    expect(rules.squadSize).toBe(15);
    expect(rules.teamLimit).toBe(3);
    expect(rules.totalBudget).toBe(100);
    expect(rules.positionQuota).toEqual({ GKP: 2, DEF: 5, MID: 5, FWD: 3 });
    // Starting XI constraints — 1 GK exactly, 3-5 DEF, 2-5 MID, 1-3 FWD.
    expect(rules.positionMinPlay.GKP).toBe(1);
    expect(rules.positionMaxPlay.GKP).toBe(1);
    expect(rules.positionMinPlay.DEF).toBe(3);
  });

  it('assigns each chip to the correct half of the season', () => {
    const windows = toChipWindows(bootstrap.chips, bootstrap.events.length);
    expect(windows).toHaveLength(8);

    const firstHalf = windows.filter((w) => w.half === 1);
    const secondHalf = windows.filter((w) => w.half === 2);
    expect(firstHalf).toHaveLength(4);
    expect(secondHalf).toHaveLength(4);

    // Each chip name appears exactly once per half.
    for (const half of [firstHalf, secondHalf]) {
      expect(new Set(half.map((w) => w.name)).size).toBe(4);
    }
  });

  it('identifies the gameweek we plan against', () => {
    expect(meta.nextEvent).not.toBeNull();
    expect(meta.nextDeadline).not.toBeNull();
    expect(meta.totalPlayers).toBeGreaterThan(0);
  });
});

describe('FDR matrix — real data', () => {
  const matrix = buildFdrMatrix(teams, fixtures, 1, 6);

  it('covers all 20 teams, not 13', () => {
    // The prototype shipped 13 teams while its README claimed 20.
    expect(matrix).toHaveLength(20);
  });

  it('gives every team the requested number of gameweek cells', () => {
    for (const row of matrix) {
      expect(row.cells).toHaveLength(6);
      expect(row.cells.map((cell) => cell.event)).toEqual([1, 2, 3, 4, 5, 6]);
    }
  });

  it('never lists a team as its own opponent', () => {
    for (const row of matrix) {
      for (const cell of row.cells) {
        for (const opponent of cell.opponents) {
          expect(opponent.opponentShort).not.toBe(row.teamShort);
        }
      }
    }
  });

  it('agrees with the raw fixture list on difficulty', () => {
    // Spot-check every GW1 cell against the source fixture, so a transposition
    // of home/away difficulty would be caught.
    const gw1 = fixtures.filter((fixture) => fixture.event === 1);
    for (const fixture of gw1) {
      const homeRow = matrix.find((row) => row.teamId === fixture.teamHome);
      const homeCell = homeRow?.cells.find((cell) => cell.event === 1);
      expect(homeCell?.opponents[0]?.isHome).toBe(true);
      expect(homeCell?.opponents[0]?.difficulty).toBe(fixture.difficultyHome);

      const awayRow = matrix.find((row) => row.teamId === fixture.teamAway);
      const awayCell = awayRow?.cells.find((cell) => cell.event === 1);
      expect(awayCell?.opponents[0]?.isHome).toBe(false);
      expect(awayCell?.opponents[0]?.difficulty).toBe(fixture.difficultyAway);
    }
  });

  it('does not invent blanks — every team plays in a normal gameweek', () => {
    // The prototype marked all of its teams BLANK in the same gameweek, which
    // cannot happen. In the real pre-season schedule GW1 is complete.
    const gw1Cells = matrix.map((row) => row.cells[0]!);
    expect(gw1Cells.every((cell) => !cell.isBlank)).toBe(true);
  });
});

describe('FDR matrix — blanks and doubles', () => {
  const twoTeams: Team[] = [
    {
      id: 1,
      code: 1,
      name: 'Alpha',
      shortName: 'ALP',
      strengthOverallHome: 3,
      strengthOverallAway: 3,
      strengthAttackHome: 3,
      strengthAttackAway: 3,
      strengthDefenceHome: 3,
      strengthDefenceAway: 3,
    },
    {
      id: 2,
      code: 2,
      name: 'Beta',
      shortName: 'BET',
      strengthOverallHome: 3,
      strengthOverallAway: 3,
      strengthAttackHome: 3,
      strengthAttackAway: 3,
      strengthDefenceHome: 3,
      strengthDefenceAway: 3,
    },
  ];

  const makeFixture = (id: number, event: number, home: number, away: number): Fixture => ({
    id,
    event,
    kickoffTime: null,
    teamHome: home,
    teamAway: away,
    difficultyHome: 2,
    difficultyAway: 4,
    finished: false,
    scoreHome: null,
    scoreAway: null,
  });

  it('flags a double gameweek and averages its difficulty', () => {
    const doubled = [makeFixture(1, 5, 1, 2), makeFixture(2, 5, 2, 1)];
    const matrix = buildFdrMatrix(twoTeams, doubled, 5, 1);
    const alpha = matrix.find((row) => row.teamShort === 'ALP')!;

    expect(alpha.cells[0]!.isDouble).toBe(true);
    expect(alpha.cells[0]!.opponents).toHaveLength(2);
    // Home fixture difficulty 2, away fixture difficulty 4 -> mean 3.
    expect(alpha.cells[0]!.averageDifficulty).toBe(3);
  });

  it('flags a blank gameweek with a null average, not a zero', () => {
    // Zero would sort as "easiest fixture" in any ranking — it must be null.
    const matrix = buildFdrMatrix(twoTeams, [], 5, 1);
    const alpha = matrix.find((row) => row.teamShort === 'ALP')!;

    expect(alpha.cells[0]!.isBlank).toBe(true);
    expect(alpha.cells[0]!.opponents).toHaveLength(0);
    expect(alpha.cells[0]!.averageDifficulty).toBeNull();
  });

  it('ignores fixtures with no gameweek assigned', () => {
    const unscheduled: Fixture = { ...makeFixture(9, 5, 1, 2), event: null };
    const matrix = buildFdrMatrix(twoTeams, [unscheduled], 5, 1);
    expect(matrix.every((row) => row.cells[0]!.isBlank)).toBe(true);
  });
});
