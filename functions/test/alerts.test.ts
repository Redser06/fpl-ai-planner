/**
 * Alert engine tests.
 *
 * The critical property under test is that alerts are DERIVED, never invented:
 * every one must cite its source field, and no rule may fire on data that does
 * not support it.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { bootstrapSchema } from '../src/fpl/schemas';
import { transformBootstrap } from '../src/ingest/transform';
import { findReplacement, generateAlerts } from '../../shared/model/alerts';
import type { Player } from '../../shared/types';

const FIXTURES = join(__dirname, 'fixtures');
const bootstrap = bootstrapSchema.parse(
  JSON.parse(readFileSync(join(FIXTURES, 'bootstrap.json'), 'utf8')),
);
const { players, meta } = transformBootstrap(bootstrap, '2026-08-13T00:00:00.000Z');

const NOW = '2026-08-13T12:00:00.000Z';

const baseContext = {
  players,
  event: 1,
  totalManagers: meta.totalPlayers,
  now: NOW,
};

describe('availability alerts on real data', () => {
  const flagged = players.filter((player) => player.availability !== 'AVAILABLE');

  it('the recorded season really does have flagged players to alert on', () => {
    expect(flagged.length).toBeGreaterThan(0);
  });

  it('fires exactly one alert per flagged watched player', () => {
    const watchedIds = flagged.slice(0, 10).map((player) => player.id);
    const alerts = generateAlerts({ ...baseContext, watchedIds });
    const availability = alerts.filter((a) => a.type === 'INJURY' || a.type === 'SUSPENSION');
    expect(availability).toHaveLength(10);
  });

  it('stays silent for fully available players', () => {
    const availableIds = players
      .filter((player) => player.availability === 'AVAILABLE')
      .slice(0, 25)
      .map((player) => player.id);

    const alerts = generateAlerts({ ...baseContext, watchedIds: availableIds });
    expect(alerts.filter((a) => a.type === 'INJURY' || a.type === 'SUSPENSION')).toHaveLength(0);
  });

  it('cites source fields on every single alert', () => {
    const watchedIds = flagged.map((player) => player.id);
    const alerts = generateAlerts({ ...baseContext, watchedIds });

    expect(alerts.length).toBeGreaterThan(0);
    for (const alert of alerts) {
      expect(alert.evidence.length).toBeGreaterThan(0);
      for (const item of alert.evidence) {
        expect(typeof item.field).toBe('string');
        expect(item.field.length).toBeGreaterThan(0);
      }
    }
  });

  it('escalates a 0% chance above a 75% chance', () => {
    const zero = players.find(
      (p) => p.availability !== 'AVAILABLE' && p.chanceOfPlayingNextRound === 0,
    );
    expect(zero, 'expected at least one 0% player in the recorded season').toBeDefined();

    const alerts = generateAlerts({ ...baseContext, watchedIds: [zero!.id] });
    expect(alerts[0]!.severity).toBe('CRITICAL');
  });

  it('suggests a replacement that is available, same position and affordable', () => {
    const watchedIds = flagged.map((player) => player.id);
    const alerts = generateAlerts({ ...baseContext, watchedIds });
    const byId = new Map(players.map((player) => [player.id, player]));

    const withReplacement = alerts.filter((alert) => alert.replacementId !== null);
    expect(withReplacement.length).toBeGreaterThan(0);

    for (const alert of withReplacement) {
      const target = byId.get(alert.targetId!)!;
      const replacement = byId.get(alert.replacementId!)!;

      expect(replacement.position).toBe(target.position);
      expect(replacement.availability).toBe('AVAILABLE');
      expect(replacement.price).toBeLessThanOrEqual(target.price + 0.5);
      expect(replacement.id).not.toBe(target.id);
    }
  });

  it('is deterministic — same input, identical output', () => {
    const watchedIds = flagged.slice(0, 20).map((player) => player.id);
    const first = generateAlerts({ ...baseContext, watchedIds });
    const second = generateAlerts({ ...baseContext, watchedIds });
    expect(first).toEqual(second);
  });
});

describe('price change alerts', () => {
  it('stays silent pre-season, when FPL has zeroed the transfer counters', () => {
    // Not a bug: transfers_in_event/out_event reset to 0 before GW1, so there
    // is genuinely no signal to fire on. An empty inbox is a valid state.
    const watchedIds = players.slice(0, 100).map((player) => player.id);
    const alerts = generateAlerts({ ...baseContext, watchedIds });
    expect(alerts.filter((a) => a.type === 'PRICE_RISE' || a.type === 'PRICE_FALL')).toHaveLength(
      0,
    );
  });

  it('fires once transfer momentum crosses the threshold', () => {
    const target = players[0]!;
    const moving: Player = {
      ...target,
      // 2% of the manager base moving in — comfortably over the threshold.
      transfersInEvent: Math.round(meta.totalPlayers * 0.02),
      transfersOutEvent: 0,
    };

    const alerts = generateAlerts({
      ...baseContext,
      players: [moving, ...players.slice(1)],
      watchedIds: [moving.id],
    });

    const priceAlert = alerts.find((a) => a.type === 'PRICE_RISE');
    expect(priceAlert).toBeDefined();
    expect(priceAlert!.evidence.map((e) => e.field)).toContain('transfers_in_event');
  });

  it('distinguishes a fall from a rise', () => {
    const target = players[0]!;
    const falling: Player = {
      ...target,
      transfersInEvent: 0,
      transfersOutEvent: Math.round(meta.totalPlayers * 0.02),
    };

    const alerts = generateAlerts({
      ...baseContext,
      players: [falling, ...players.slice(1)],
      watchedIds: [falling.id],
    });

    expect(alerts.some((a) => a.type === 'PRICE_FALL')).toBe(true);
  });
});

describe('findReplacement', () => {
  it('returns null when nothing in the position is affordable', () => {
    const cheapest = [...players]
      .filter((p) => p.position === 'FWD')
      .sort((a, b) => a.price - b.price)[0]!;

    // Nobody can be cheaper than the cheapest forward minus the band.
    const impossible: Player = { ...cheapest, price: 0 };
    const replacement = findReplacement(impossible, players, 0);
    expect(replacement).toBeNull();
  });

  it('picks the highest expected-points candidate, not merely the cheapest', () => {
    const injured = players.find(
      (p) => p.position === 'MID' && p.availability !== 'AVAILABLE',
    )!;
    const replacement = findReplacement(injured, players)!;

    const allValid = players.filter(
      (p) =>
        p.id !== injured.id &&
        p.position === 'MID' &&
        p.availability === 'AVAILABLE' &&
        p.price <= injured.price + 0.5 &&
        (p.epNext > 0 || p.minutes > 0),
    );
    const best = Math.max(...allValid.map((p) => p.epNext));
    expect(replacement.epNext).toBe(best);
  });
});
