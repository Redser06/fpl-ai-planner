/**
 * Schema drift canary.
 *
 * These parse REAL recorded FPL API responses through our zod schemas. If FPL
 * changes a field we depend on — renames it, changes its type, starts sending
 * null — these fail loudly here rather than silently writing corrupt data into
 * Firestore at 03:00.
 *
 * Refresh the corpus with `npm run record-fixtures`.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  bootstrapSchema,
  elementSummarySchema,
  entrySchema,
  fixturesSchema,
} from '../src/fpl/schemas';

const FIXTURES = join(__dirname, 'fixtures');
const load = (name: string): unknown =>
  JSON.parse(readFileSync(join(FIXTURES, `${name}.json`), 'utf8'));

describe('bootstrap-static', () => {
  const raw = load('bootstrap');

  it('parses the full live response', () => {
    const result = bootstrapSchema.safeParse(raw);
    if (!result.success) {
      throw new Error(
        `bootstrap schema drift:\n${result.error.issues
          .slice(0, 10)
          .map((i) => `  ${i.path.join('.')}: ${i.message}`)
          .join('\n')}`,
      );
    }
    expect(result.success).toBe(true);
  });

  it('has the expected league shape', () => {
    const bootstrap = bootstrapSchema.parse(raw);
    expect(bootstrap.teams).toHaveLength(20);
    expect(bootstrap.events).toHaveLength(38);
    expect(bootstrap.element_types).toHaveLength(4);
    expect(bootstrap.elements.length).toBeGreaterThan(400);
  });

  it('coerces string numerics into real numbers', () => {
    // The API sends season totals as strings ("0.00") and per-90s as numbers.
    // Getting this backwards is the easiest way to silently corrupt the model.
    const bootstrap = bootstrapSchema.parse(raw);
    for (const element of bootstrap.elements) {
      expect(typeof element.expected_goals).toBe('number');
      expect(typeof element.form).toBe('number');
      expect(typeof element.ict_index).toBe('number');
      expect(typeof element.selected_by_percent).toBe('number');
      expect(Number.isFinite(element.expected_goals_per_90)).toBe(true);
    }
  });

  it('exposes two of each chip, split across the two halves of the season', () => {
    // The real game gives 2x wildcard / freehit / bboost / 3xc, not 1x each.
    const bootstrap = bootstrapSchema.parse(raw);
    const counts = new Map<string, number>();
    for (const chip of bootstrap.chips) {
      counts.set(chip.name, (counts.get(chip.name) ?? 0) + 1);
    }
    for (const name of ['wildcard', 'freehit', 'bboost', '3xc']) {
      expect(counts.get(name), `expected 2x ${name}`).toBe(2);
    }
  });

  it('carries the squad rules we build the manual squad builder from', () => {
    const bootstrap = bootstrapSchema.parse(raw);
    expect(bootstrap.game_settings.squad_squadsize).toBe(15);
    expect(bootstrap.game_settings.squad_team_limit).toBe(3);
    expect(bootstrap.game_settings.squad_total_spend).toBe(1000);
  });
});

describe('fixtures', () => {
  const raw = load('fixtures');

  it('parses the full live response', () => {
    expect(fixturesSchema.safeParse(raw).success).toBe(true);
  });

  it('carries real per-side difficulty ratings in the 1-5 range', () => {
    const fixtures = fixturesSchema.parse(raw);
    expect(fixtures.length).toBeGreaterThan(300);
    for (const fixture of fixtures) {
      expect(fixture.team_h_difficulty).toBeGreaterThanOrEqual(1);
      expect(fixture.team_h_difficulty).toBeLessThanOrEqual(5);
      expect(fixture.team_a_difficulty).toBeGreaterThanOrEqual(1);
      expect(fixture.team_a_difficulty).toBeLessThanOrEqual(5);
    }
  });

  it('never has a team playing itself', () => {
    // The prototype's fake data had Man City down to play "NFO (H) + NFO (A)".
    const fixtures = fixturesSchema.parse(raw);
    for (const fixture of fixtures) {
      expect(fixture.team_h).not.toBe(fixture.team_a);
    }
  });
});

describe('element-summary', () => {
  const raw = load('element-summary');

  it('parses the full live response', () => {
    expect(elementSummarySchema.safeParse(raw).success).toBe(true);
  });

  it('carries prior-season history, which is what solves the cold start', () => {
    const summary = elementSummarySchema.parse(raw);
    expect(summary.history_past.length).toBeGreaterThan(0);
    const lastSeason = summary.history_past.at(-1);
    expect(lastSeason?.season_name).toMatch(/^\d{4}\/\d{2}$/);
    expect(typeof lastSeason?.expected_goals).toBe('number');
  });
});

describe('entry', () => {
  it('parses the full live response', () => {
    expect(entrySchema.safeParse(load('entry')).success).toBe(true);
  });
});

describe('entry picks (pre-deadline)', () => {
  it('records that picks are NOT public before the deadline', () => {
    // This is not a bug — it is the constraint that forces a manual squad
    // builder as the pre-season onboarding path. Recorded so the assumption
    // is visible and versioned rather than tribal knowledge.
    const recorded = JSON.parse(
      readFileSync(join(FIXTURES, 'entry-picks.status.json'), 'utf8'),
    ) as { status: number };
    expect(recorded.status).toBe(404);
  });
});
