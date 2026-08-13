/**
 * Captaincy selection.
 *
 * Pre-season, FPL's own `ep_next` is crude and heavily tied — dozens of players
 * sit on exactly 4.0. Ranking on expected points alone therefore picks almost
 * arbitrarily, and the first version of the squad builder cheerfully handed the
 * armband to a goalkeeper. These tests lock that shut.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { bootstrapSchema } from '../src/fpl/schemas';
import { transformBootstrap } from '../src/ingest/transform';
import {
  autoFillSquad,
  buildSquadFromIds,
  compareForCaptaincy,
  resolvePicks,
  startersOf,
} from '../../shared/model/squad';
import { generateAlerts } from '../../shared/model/alerts';
import type { Player } from '../../shared/types';

const bootstrap = bootstrapSchema.parse(
  JSON.parse(readFileSync(join(__dirname, 'fixtures', 'bootstrap.json'), 'utf8')),
);
const { players, meta } = transformBootstrap(bootstrap, '2026-08-13T00:00:00.000Z');
const rules = meta.rules;

const byId = new Map(players.map((player) => [player.id, player]));

describe('compareForCaptaincy', () => {
  it('prefers higher expected points above all else', () => {
    const striker = players.find((p) => p.position === 'FWD')!;
    const keeper = players.find((p) => p.position === 'GKP')!;
    const betterKeeper: Player = { ...keeper, epNext: striker.epNext + 5 };
    expect(compareForCaptaincy(betterKeeper, striker)).toBeLessThan(0);
  });

  it('breaks ties towards attackers over goalkeepers', () => {
    const striker = players.find((p) => p.position === 'FWD')!;
    const keeper = players.find((p) => p.position === 'GKP')!;
    const tiedKeeper: Player = { ...keeper, epNext: striker.epNext };
    expect(compareForCaptaincy(striker, tiedKeeper)).toBeLessThan(0);
  });

  it('breaks ties towards attackers over defenders', () => {
    const striker = players.find((p) => p.position === 'FWD')!;
    const defender = players.find((p) => p.position === 'DEF')!;
    const tiedDefender: Player = { ...defender, epNext: striker.epNext };
    expect(compareForCaptaincy(striker, tiedDefender)).toBeLessThan(0);
  });
});

describe('default captain', () => {
  it('is never a goalkeeper', () => {
    const ids = autoFillSquad(players, rules)!;
    const squad = buildSquadFromIds(ids, players, rules)!;
    expect(byId.get(squad.captainId)!.position).not.toBe('GKP');
  });

  it('vice-captain is never a goalkeeper either', () => {
    const ids = autoFillSquad(players, rules)!;
    const squad = buildSquadFromIds(ids, players, rules)!;
    expect(byId.get(squad.viceCaptainId)!.position).not.toBe('GKP');
  });

  it('captain and vice are different players, both starting', () => {
    const ids = autoFillSquad(players, rules)!;
    const squad = buildSquadFromIds(ids, players, rules)!;
    const starterIds = startersOf(resolvePicks(squad.picks, players)).map((e) => e.player.id);

    expect(squad.captainId).not.toBe(squad.viceCaptainId);
    expect(starterIds).toContain(squad.captainId);
    expect(starterIds).toContain(squad.viceCaptainId);
  });

  it('holds across many different squads', () => {
    // Seed from a range of positions so the generated squads genuinely differ.
    for (let offset = 0; offset < 8; offset++) {
      const seed = players
        .filter((p) => p.availability === 'AVAILABLE' && p.position === 'FWD')
        .sort((a, b) => b.price - a.price)
        .slice(offset, offset + 1)
        .map((p) => p.id);

      const ids = autoFillSquad(players, rules, { seed })!;
      const squad = buildSquadFromIds(ids, players, rules)!;
      expect(byId.get(squad.captainId)!.position).not.toBe('GKP');
    }
  });
});

describe('captaincy alert', () => {
  it('never recommends captaining a goalkeeper', () => {
    const ids = autoFillSquad(players, rules)!;
    const squad = buildSquadFromIds(ids, players, rules)!;

    // Force the armband onto the worst starter so the rule has to fire.
    const starters = startersOf(resolvePicks(squad.picks, players));
    const worst = starters.reduce((t, e) => (e.player.epNext < t.player.epNext ? e : t));

    const alerts = generateAlerts({
      players,
      watchedIds: squad.picks.map((p) => p.playerId),
      event: 1,
      totalManagers: meta.totalPlayers,
      now: '2026-08-13T12:00:00.000Z',
      squad: { picks: squad.picks, captainId: worst.player.id },
    });

    const captaincy = alerts.find((a) => a.type === 'CAPTAINCY');
    if (captaincy?.replacementId) {
      expect(byId.get(captaincy.replacementId)!.position).not.toBe('GKP');
    }
  });

  it('stays silent when there is no real projected gain', () => {
    // Everyone on identical projections: switching captain wins nothing, so
    // claiming a gain would be inventing one.
    const flat = players.map((p) => ({ ...p, epNext: 4 }));
    const ids = autoFillSquad(flat, rules)!;
    const squad = buildSquadFromIds(ids, flat, rules)!;
    const starters = startersOf(resolvePicks(squad.picks, flat));

    const alerts = generateAlerts({
      players: flat,
      watchedIds: [],
      event: 1,
      totalManagers: meta.totalPlayers,
      now: '2026-08-13T12:00:00.000Z',
      squad: { picks: squad.picks, captainId: starters[5]!.player.id },
    });

    expect(alerts.some((a) => a.type === 'CAPTAINCY')).toBe(false);
  });
});
