/**
 * Auto-fill tests.
 *
 * The contract is narrow but absolute: whatever it returns must be a squad that
 * passes validateSquad. The first implementation of this quietly returned 11
 * players because it over-reserved budget for the remaining slots, which is
 * exactly the class of bug these assertions exist to catch.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { bootstrapSchema } from '../src/fpl/schemas';
import { transformBootstrap } from '../src/ingest/transform';
import { autoFillSquad, buildSquadFromIds, costSquad, validateSquad } from '../../shared/model/squad';

const bootstrap = bootstrapSchema.parse(
  JSON.parse(readFileSync(join(__dirname, 'fixtures', 'bootstrap.json'), 'utf8')),
);
const { players, meta } = transformBootstrap(bootstrap, '2026-08-13T00:00:00.000Z');
const rules = meta.rules;

describe('autoFillSquad', () => {
  const ids = autoFillSquad(players, rules);

  it('returns a full squad', () => {
    expect(ids).not.toBeNull();
    expect(ids).toHaveLength(rules.squadSize);
  });

  it('returns a squad that actually validates', () => {
    const squad = buildSquadFromIds(ids!, players, rules)!;
    expect(squad).not.toBeNull();
    expect(validateSquad(squad.picks, players, rules)).toEqual([]);
  });

  it('stays within budget', () => {
    const squad = buildSquadFromIds(ids!, players, rules)!;
    const { squadValue, bank } = costSquad(squad.picks, players, rules);
    expect(squadValue).toBeLessThanOrEqual(rules.totalBudget);
    expect(bank).toBeGreaterThanOrEqual(0);
  });

  it('respects the club limit', () => {
    const byId = new Map(players.map((player) => [player.id, player]));
    const perClub = new Map<number, number>();
    for (const id of ids!) {
      const teamId = byId.get(id)!.teamId;
      perClub.set(teamId, (perClub.get(teamId) ?? 0) + 1);
    }
    for (const count of perClub.values()) {
      expect(count).toBeLessThanOrEqual(rules.teamLimit);
    }
  });

  it('fills every position quota exactly', () => {
    const byId = new Map(players.map((player) => [player.id, player]));
    for (const position of ['GKP', 'DEF', 'MID', 'FWD'] as const) {
      const count = ids!.filter((id) => byId.get(id)!.position === position).length;
      expect(count).toBe(rules.positionQuota[position]);
    }
  });

  it('picks only available players', () => {
    const byId = new Map(players.map((player) => [player.id, player]));
    for (const id of ids!) {
      expect(byId.get(id)!.availability).toBe('AVAILABLE');
    }
  });

  it('spends meaningfully rather than returning the cheapest possible squad', () => {
    const squad = buildSquadFromIds(ids!, players, rules)!;
    const { squadValue } = costSquad(squad.picks, players, rules);
    // A cheapest-15 squad lands around £60m; a sensible one uses most of £100m.
    expect(squadValue).toBeGreaterThan(rules.totalBudget * 0.9);
  });

  it('honours seeded players and never upgrades them away', () => {
    // One per position, and mid-priced so the upgrade pass would happily
    // replace them if it were not respecting the lock.
    const seed = (['GKP', 'DEF', 'MID', 'FWD'] as const).map(
      (position) =>
        players
          .filter((p) => p.availability === 'AVAILABLE' && p.position === position)
          .sort((a, b) => a.price - b.price)[3]!,
    );

    const seeded = autoFillSquad(players, rules, { seed: seed.map((p) => p.id) })!;
    for (const player of seed) {
      expect(seeded, `${player.webName} was dropped`).toContain(player.id);
    }
    expect(seeded).toHaveLength(rules.squadSize);

    const squad = buildSquadFromIds(seeded, players, rules)!;
    expect(validateSquad(squad.picks, players, rules)).toEqual([]);
  });

  it('drops seeds that cannot legally coexist rather than returning an invalid squad', () => {
    // Three goalkeepers from one club: breaks both the GKP quota (2) and, with
    // the club limit, cannot all be honoured. The squad must still be legal.
    const keepers = players
      .filter((p) => p.position === 'GKP' && p.availability === 'AVAILABLE')
      .slice(0, 3);

    const result = autoFillSquad(players, rules, { seed: keepers.map((p) => p.id) })!;
    expect(result).toHaveLength(rules.squadSize);

    const squad = buildSquadFromIds(result, players, rules)!;
    expect(validateSquad(squad.picks, players, rules)).toEqual([]);
  });

  it('is deterministic', () => {
    expect(autoFillSquad(players, rules)).toEqual(autoFillSquad(players, rules));
  });
});
