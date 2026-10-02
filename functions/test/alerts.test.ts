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
import {
  applyTransfer,
  autoFillSquad,
  buildSquadFromIds,
  validateSquad,
} from '../../shared/model/squad';
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
  rules: meta.rules,
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

  describe('with a real, legal squad', () => {
    const ids = autoFillSquad(players, meta.rules)!;
    const built = buildSquadFromIds(ids, players, meta.rules)!;
    // Flag every outfield squad member so each one needs a replacement.
    const flaggedIds = new Set(
      built.picks
        .map((pick) => players.find((p) => p.id === pick.playerId)!)
        .filter((p) => p.position !== 'GKP')
        .map((p) => p.id),
    );
    const doctored = players.map((p) =>
      flaggedIds.has(p.id) ? { ...p, availability: 'INJURED' as const, chanceOfPlayingNextRound: 0 } : p,
    );
    const squad = { ...built, bank: built.bank };
    const ownedIds = new Set(squad.picks.map((pick) => pick.playerId));
    const byId = new Map(doctored.map((player) => [player.id, player]));

    const alerts = generateAlerts({
      ...baseContext,
      players: doctored,
      watchedIds: [...flaggedIds],
      squad: { picks: squad.picks, captainId: squad.captainId, bank: squad.bank },
    });
    const withReplacement = alerts.filter((alert) => alert.replacementId !== null);

    it('offers replacements at all', () => {
      expect(withReplacement.length).toBeGreaterThan(0);
    });

    it('never suggests a player already in the squad', () => {
      for (const alert of withReplacement) expect(ownedIds.has(alert.replacementId!)).toBe(false);
    });

    it('never exceeds the bank — no price-rise slack', () => {
      for (const alert of withReplacement) {
        const target = byId.get(alert.targetId!)!;
        const replacement = byId.get(alert.replacementId!)!;
        expect(replacement.position).toBe(target.position);
        expect(replacement.availability).toBe('AVAILABLE');
        expect(replacement.price).toBeLessThanOrEqual(target.price + squad.bank + 1e-9);
      }
    });

    it('only suggests transfers the apply path accepts', () => {
      for (const alert of withReplacement) {
        const applied = applyTransfer(
          squad,
          alert.targetId!,
          alert.replacementId!,
          doctored,
          meta.rules,
        );
        expect(applied, `${alert.title} → ${alert.actionLabel}`).not.toBeNull();
        expect(validateSquad(applied!.picks, doctored, meta.rules)).toEqual([]);
      }
    });
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
  const context = {
    bank: 5,
    // No squads in these tests approach the club cap; a fresh map reads as zero.
    clubCounts: new Map<number, number>(),
    teamLimit: meta.rules.teamLimit,
  };

  it('returns null when nothing in the position is affordable', () => {
    const cheapest = [...players]
      .filter((p) => p.position === 'FWD')
      .sort((a, b) => a.price - b.price)[0]!;

    // Nobody can be cheaper than the cheapest forward minus the slack.
    const impossible: Player = { ...cheapest, price: 0 };
    const replacement = findReplacement(impossible, players, { ...context, bank: 0 });
    expect(replacement).toBeNull();
  });

  it('rejects candidates that cost more than price + bank allows', () => {
    const target = players.find((p) => p.position === 'MID' && p.availability === 'AVAILABLE')!;

    const poor = findReplacement(target, players, { ...context, bank: 0 });
    expect(poor).not.toBeNull();
    expect(poor!.price).toBeLessThanOrEqual(target.price);

    const rich = findReplacement(target, players, { ...context, bank: 5 });
    expect(rich!.price).toBeLessThanOrEqual(target.price + 5);
  });

  it('rejects a candidate even £0.1m over budget', () => {
    const target = players.find((p) => p.position === 'MID' && p.availability === 'AVAILABLE')!;
    const justOver: Player = {
      ...target,
      id: -1,
      price: Math.round((target.price + 0.1) * 10) / 10,
      epNext: 99,
    };
    const replacement = findReplacement(target, [target, justOver], { ...context, bank: 0 });
    expect(replacement).toBeNull();
  });

  it('skips players already owned', () => {
    const target = players.find((p) => p.position === 'MID' && p.availability === 'AVAILABLE')!;
    const best = findReplacement(target, players, { ...context, bank: 100 })!;
    const next = findReplacement(target, players, {
      ...context,
      bank: 100,
      ownedIds: new Set([best.id]),
    });
    expect(next?.id).not.toBe(best.id);
  });

  it('falls through to the next-best candidate when the legality gate refuses one', () => {
    const target = players.find((p) => p.position === 'MID' && p.availability === 'AVAILABLE')!;
    const best = findReplacement(target, players, { ...context, bank: 100 })!;
    const gated = findReplacement(target, players, {
      ...context,
      bank: 100,
      isLegal: (candidate) => candidate.id !== best.id,
    });
    expect(gated).not.toBeNull();
    expect(gated!.id).not.toBe(best.id);
  });

  it('rejects candidates who would breach the club limit', () => {
    const target = players.find((p) => p.position === 'MID' && p.availability === 'AVAILABLE')!;
    const bestUnconstrained = findReplacement(target, players, {
      ...context,
      bank: 100,
    });
    expect(bestUnconstrained).not.toBeNull();

    // Same club already at the cap: the candidate is illegal even though the
    // outgoing player's slot is being vacated... unless it IS the same club.
    const atCap = new Map([[bestUnconstrained!.teamId, meta.rules.teamLimit]]);
    if (bestUnconstrained!.teamId === target.teamId) {
      atCap.set(bestUnconstrained!.teamId, meta.rules.teamLimit);
    }

    const replacement = findReplacement(target, players, {
      ...context,
      bank: 100,
      clubCounts: atCap,
    });

    if (bestUnconstrained!.teamId !== target.teamId) {
      // Blocked entirely or a different club offered — never the capped one.
      expect(replacement === null || replacement.teamId !== bestUnconstrained!.teamId).toBe(true);
    }
  });

  it('allows a same-club swap even at the club cap', () => {
    // Every club already at the cap: ONLY a same-club swap would be legal.
    // If the function offers anything at all, correctness demands it be the
    // same club — and the legality rule we are testing is that this is allowed.
    const target = players.find((p) => p.position === 'MID' && p.availability === 'AVAILABLE')!;
    const allCapped = new Map(
      [...new Set(players.map((p) => p.teamId))].map((teamId) => [teamId, meta.rules.teamLimit]),
    );

    const replacement = findReplacement(target, players, {
      bank: 100,
      clubCounts: allCapped,
      teamLimit: meta.rules.teamLimit,
    });

    // Another same-club MID exists, so a legal answer must exist and be same-club.
    const sameClub = players.filter(
      (p) =>
        p.teamId === target.teamId &&
        p.position === 'MID' &&
        p.id !== target.id &&
        p.availability === 'AVAILABLE' &&
        (p.epNext > 0 || p.minutes > 0),
    );
    expect(sameClub.length).toBeGreaterThan(0);

    expect(replacement).not.toBeNull();
    expect(replacement!.teamId).toBe(target.teamId);
  });

  it('picks the highest expected-points candidate, not merely the cheapest', () => {
    const injured = players.find(
      (p) => p.position === 'MID' && p.availability !== 'AVAILABLE',
    )!;
    const replacement = findReplacement(injured, players, { ...context, bank: 100 })!;

    const allValid = players.filter(
      (p) =>
        p.id !== injured.id &&
        p.position === 'MID' &&
        p.availability === 'AVAILABLE' &&
        p.price <= injured.price + 100 &&
        (p.epNext > 0 || p.minutes > 0),
    );
    const best = Math.max(...allValid.map((p) => p.epNext));
    expect(replacement.epNext).toBe(best);
  });
});
