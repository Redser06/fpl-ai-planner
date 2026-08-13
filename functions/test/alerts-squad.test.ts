/**
 * Tests for the squad-aware alert rules: captaincy, form slump, fixture swing,
 * and blank/double gameweek detection.
 *
 * These are the rules that need a real team to reason about, which is exactly
 * why the watchlist proxy was never good enough.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { bootstrapSchema } from '../src/fpl/schemas';
import { transformBootstrap } from '../src/ingest/transform';
import { generateAlerts } from '../../shared/model/alerts';
import { compareForCaptaincy } from '../../shared/model/squad';
import type { FdrRow } from '../../shared/types';

const bootstrap = bootstrapSchema.parse(
  JSON.parse(readFileSync(join(__dirname, 'fixtures', 'bootstrap.json'), 'utf8')),
);
const { players, meta } = transformBootstrap(bootstrap, '2026-08-13T00:00:00.000Z');

const baseContext = {
  players,
  event: 1,
  totalManagers: meta.totalPlayers,
  now: '2026-08-13T12:00:00.000Z',
};

describe('captaincy', () => {
  const squadPlayers = players.filter((p) => p.availability === 'AVAILABLE').slice(0, 15);
  const picks = squadPlayers.map((player, index) => ({
    playerId: player.id,
    slot: index + 1,
    isCaptain: false,
    isViceCaptain: false,
  }));

  const starters = squadPlayers.slice(0, 11);
  // Ties on ep_next are common pre-season, so rank with the same comparator the
  // implementation uses rather than on expected points alone.
  const best = [...starters].sort(compareForCaptaincy)[0]!;
  const worst = starters.reduce((trailer, p) => (p.epNext < trailer.epNext ? p : trailer));

  it('recommends the highest expected-points starter when the armband is misplaced', () => {
    const alerts = generateAlerts({
      ...baseContext,
      watchedIds: [],
      squad: { picks, captainId: worst.id },
    });

    const captaincy = alerts.find((a) => a.type === 'CAPTAINCY');
    expect(captaincy).toBeDefined();
    expect(captaincy!.replacementId).toBe(best.id);
    expect(captaincy!.targetId).toBe(worst.id);
  });

  it('stays silent when the best player already has the armband', () => {
    const alerts = generateAlerts({
      ...baseContext,
      watchedIds: [],
      squad: { picks, captainId: best.id },
    });
    expect(alerts.some((a) => a.type === 'CAPTAINCY')).toBe(false);
  });

  it('never hands the armband to an unavailable player', () => {
    const injured = players.find((p) => p.availability === 'INJURED')!;
    // Give the injured player a huge projection so only the availability
    // filter can stop him being recommended.
    const doctored = players.map((p) =>
      p.id === injured.id ? { ...p, epNext: 99 } : p,
    );
    const withInjured = [
      { playerId: injured.id, slot: 1, isCaptain: false, isViceCaptain: false },
      ...picks.slice(1),
    ];

    const alerts = generateAlerts({
      ...baseContext,
      players: doctored,
      watchedIds: [],
      squad: { picks: withInjured, captainId: worst.id },
    });

    const captaincy = alerts.find((a) => a.type === 'CAPTAINCY');
    if (captaincy) expect(captaincy.replacementId).not.toBe(injured.id);
  });

  it('does nothing without a squad — it is a squad-only decision', () => {
    const alerts = generateAlerts({ ...baseContext, watchedIds: [] });
    expect(alerts.some((a) => a.type === 'CAPTAINCY')).toBe(false);
  });
});

describe('form slump', () => {
  it('stands down while stats are last season carryover', () => {
    // Exactly the current pre-season state: form zeroed, totals from last year.
    const carryover = players.map((p) => ({ ...p, form: 0, pointsPerGame: 6 }));
    const alerts = generateAlerts({
      ...baseContext,
      players: carryover,
      watchedIds: carryover.slice(0, 20).map((p) => p.id),
      statsAreCarryover: true,
    });
    expect(alerts.some((a) => a.type === 'FORM_SLUMP')).toBe(false);
  });

  it('fires when form drops well below the player own scoring rate', () => {
    const slumping = players.map((p, i) =>
      i === 0
        ? { ...p, availability: 'AVAILABLE' as const, form: 1.5, pointsPerGame: 6 }
        : { ...p, form: 5, pointsPerGame: 5 },
    );

    const alerts = generateAlerts({
      ...baseContext,
      players: slumping,
      watchedIds: [slumping[0]!.id],
      statsAreCarryover: false,
    });

    const slump = alerts.find((a) => a.type === 'FORM_SLUMP');
    expect(slump).toBeDefined();
    expect(slump!.evidence.map((e) => e.field)).toContain('form');
  });

  it('judges relative to the player, not an absolute number', () => {
    // Form 4.0 is a slump for a 7.0 ppg premium...
    const premium = players.map((p, i) =>
      i === 0 ? { ...p, availability: 'AVAILABLE' as const, form: 4, pointsPerGame: 7 } : p,
    );
    expect(
      generateAlerts({
        ...baseContext,
        players: premium,
        watchedIds: [premium[0]!.id],
        statsAreCarryover: false,
      }).some((a) => a.type === 'FORM_SLUMP'),
    ).toBe(true);

    // ...and a fine return for a 4.5 ppg budget pick.
    const budget = players.map((p, i) =>
      i === 0 ? { ...p, availability: 'AVAILABLE' as const, form: 4, pointsPerGame: 4.5 } : p,
    );
    expect(
      generateAlerts({
        ...baseContext,
        players: budget,
        watchedIds: [budget[0]!.id],
        statsAreCarryover: false,
      }).some((a) => a.type === 'FORM_SLUMP'),
    ).toBe(false);
  });

  it('ignores fringe players with no meaningful baseline', () => {
    const fringe = players.map((p, i) =>
      i === 0 ? { ...p, availability: 'AVAILABLE' as const, form: 0.1, pointsPerGame: 1.2 } : p,
    );

    const alerts = generateAlerts({
      ...baseContext,
      players: fringe,
      watchedIds: [fringe[0]!.id],
      statsAreCarryover: false,
    });
    expect(alerts.some((a) => a.type === 'FORM_SLUMP')).toBe(false);
  });
});

describe('fixture swings and gameweek shape', () => {
  const teamId = players[0]!.teamId;

  const rowWith = (
    cells: Array<{ event: number; opponents: number; difficulty?: number }>,
  ): FdrRow => ({
    teamId,
    teamShort: 'TST',
    teamName: 'Test FC',
    cells: cells.map(({ event, opponents, difficulty = 5 }) => ({
      event,
      opponents: Array.from({ length: opponents }, () => ({
        opponentShort: 'OPP',
        isHome: true,
        difficulty,
      })),
      averageDifficulty: opponents === 0 ? null : difficulty,
      isBlank: opponents === 0,
      isDouble: opponents > 1,
    })),
  });

  it('flags a genuinely hard run', () => {
    const alerts = generateAlerts({
      ...baseContext,
      watchedIds: [players[0]!.id],
      fdr: [rowWith([1, 2, 3, 4].map((event) => ({ event, opponents: 1, difficulty: 5 })))],
    });
    expect(alerts.some((a) => a.type === 'FIXTURE_SWING')).toBe(true);
  });

  it('flags a favourable run', () => {
    const alerts = generateAlerts({
      ...baseContext,
      watchedIds: [players[0]!.id],
      fdr: [rowWith([1, 2, 3, 4].map((event) => ({ event, opponents: 1, difficulty: 2 })))],
    });
    const swing = alerts.find((a) => a.type === 'FIXTURE_SWING');
    expect(swing).toBeDefined();
    expect(swing!.title).toContain('favourable');
  });

  it('says nothing about an unremarkable run', () => {
    const alerts = generateAlerts({
      ...baseContext,
      watchedIds: [players[0]!.id],
      fdr: [rowWith([1, 2, 3, 4].map((event) => ({ event, opponents: 1, difficulty: 3 })))],
    });
    expect(alerts.some((a) => a.type === 'FIXTURE_SWING')).toBe(false);
  });

  it('excludes blanks from the average rather than scoring them zero', () => {
    // A blank counted as 0 difficulty would drag this to "favourable".
    const alerts = generateAlerts({
      ...baseContext,
      watchedIds: [players[0]!.id],
      fdr: [
        rowWith([
          { event: 1, opponents: 1, difficulty: 5 },
          { event: 2, opponents: 0 },
          { event: 3, opponents: 1, difficulty: 5 },
        ]),
      ],
    });
    const swing = alerts.find((a) => a.type === 'FIXTURE_SWING');
    expect(swing).toBeDefined();
    expect(swing!.title).toContain('difficult');
  });

  it('detects a blank gameweek', () => {
    const alerts = generateAlerts({
      ...baseContext,
      watchedIds: [players[0]!.id],
      fdr: [rowWith([{ event: 1, opponents: 1 }, { event: 2, opponents: 0 }])],
    });
    const blank = alerts.find((a) => a.type === 'BLANK_GW');
    expect(blank).toBeDefined();
    expect(blank!.event).toBe(2);
  });

  it('detects a double gameweek', () => {
    const alerts = generateAlerts({
      ...baseContext,
      watchedIds: [players[0]!.id],
      fdr: [rowWith([{ event: 1, opponents: 2 }])],
    });
    const double = alerts.find((a) => a.type === 'DOUBLE_GW');
    expect(double).toBeDefined();
    expect(double!.evidence.find((e) => e.field === 'fixture_count')?.value).toBe(2);
  });

  it('ignores clubs the user has no players at', () => {
    const otherTeam = players.find((p) => p.teamId !== teamId)!;
    const alerts = generateAlerts({
      ...baseContext,
      watchedIds: [otherTeam.id],
      fdr: [rowWith([{ event: 1, opponents: 0 }])],
    });
    expect(alerts.some((a) => a.type === 'BLANK_GW')).toBe(false);
  });
});
