/**
 * Squad model tests.
 *
 * The important properties: no sequence of operations can produce an illegal
 * squad, formation always matches who is actually on the pitch, and money is
 * real (all three were broken in the prototype).
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { bootstrapSchema } from '../src/fpl/schemas';
import { transformBootstrap } from '../src/ingest/transform';
import {
  applySwap,
  benchOf,
  buildSquadFromIds,
  canSwap,
  costSquad,
  deriveFormation,
  isValidFormation,
  legalSwapsFor,
  resolvePicks,
  scoreSquad,
  startersOf,
  validateSquad,
} from '../../shared/model/squad';
import type { Player, Position, SquadPick } from '../../shared/types';

const bootstrap = bootstrapSchema.parse(
  JSON.parse(readFileSync(join(__dirname, 'fixtures', 'bootstrap.json'), 'utf8')),
);
const { players, meta } = transformBootstrap(bootstrap, '2026-08-13T00:00:00.000Z');
const rules = meta.rules;

/** Cheapest legal 15 that also respects the 3-per-club limit. */
function pickBudgetSquad(): Player[] {
  const chosen: Player[] = [];
  const perClub = new Map<number, number>();

  for (const position of ['GKP', 'DEF', 'MID', 'FWD'] as Position[]) {
    const needed = rules.positionQuota[position];
    const pool = players
      .filter((player) => player.position === position)
      .sort((a, b) => a.price - b.price);

    for (const player of pool) {
      if (chosen.filter((p) => p.position === position).length >= needed) break;
      const clubCount = perClub.get(player.teamId) ?? 0;
      if (clubCount >= rules.teamLimit) continue;
      chosen.push(player);
      perClub.set(player.teamId, clubCount + 1);
    }
  }

  return chosen;
}

const budgetSquad = pickBudgetSquad();

describe('buildSquadFromIds', () => {
  const squad = buildSquadFromIds(
    budgetSquad.map((player) => player.id),
    players,
    rules,
  );

  it('builds a squad from 15 ids', () => {
    expect(squad).not.toBeNull();
    expect(squad!.picks).toHaveLength(15);
  });

  it('produces a legal formation', () => {
    const resolved = resolvePicks(squad!.picks, players);
    expect(isValidFormation(startersOf(resolved), rules)).toBe(true);
  });

  it('starts exactly one goalkeeper and benches the other', () => {
    const resolved = resolvePicks(squad!.picks, players);
    const startingKeepers = startersOf(resolved).filter((e) => e.player.position === 'GKP');
    expect(startingKeepers).toHaveLength(1);
    expect(benchOf(resolved).filter((e) => e.player.position === 'GKP')).toHaveLength(1);
  });

  it('puts the reserve keeper first on the bench', () => {
    const resolved = resolvePicks(squad!.picks, players);
    expect(benchOf(resolved)[0]!.player.position).toBe('GKP');
  });

  it('assigns a captain and a different vice-captain, both starting', () => {
    expect(squad!.captainId).not.toBe(squad!.viceCaptainId);
    const starterIds = startersOf(resolvePicks(squad!.picks, players)).map((e) => e.player.id);
    expect(starterIds).toContain(squad!.captainId);
    expect(starterIds).toContain(squad!.viceCaptainId);
  });

  it('rejects a squad that is not exactly the required size', () => {
    expect(buildSquadFromIds(budgetSquad.slice(0, 14).map((p) => p.id), players, rules)).toBeNull();
  });
});

describe('money is real', () => {
  it('computes squad value as the sum of actual prices', () => {
    const squad = buildSquadFromIds(budgetSquad.map((p) => p.id), players, rules)!;
    const expected = budgetSquad.reduce((total, player) => total + player.price, 0);
    const { squadValue } = costSquad(squad.picks, players, rules);
    expect(squadValue).toBeCloseTo(expected, 1);
  });

  it('bank is budget minus squad value, and changes when the squad changes', () => {
    const squad = buildSquadFromIds(budgetSquad.map((p) => p.id), players, rules)!;
    const before = costSquad(squad.picks, players, rules);
    expect(before.bank).toBeCloseTo(rules.totalBudget - before.squadValue, 1);

    // Swap the cheapest forward for the most expensive one.
    const out = budgetSquad.find((p) => p.position === 'FWD')!;
    const expensive = [...players]
      .filter((p) => p.position === 'FWD')
      .sort((a, b) => b.price - a.price)[0]!;

    const swappedIds = budgetSquad.map((p) => (p.id === out.id ? expensive.id : p.id));
    const after = costSquad(
      swappedIds.map((id, index) => ({
        playerId: id,
        slot: index + 1,
        isCaptain: false,
        isViceCaptain: false,
      })),
      players,
      rules,
    );

    expect(after.squadValue).toBeGreaterThan(before.squadValue);
    expect(after.bank).toBeLessThan(before.bank);
  });

  it('flags going over budget', () => {
    const priciest = [...players].sort((a, b) => b.price - a.price);
    const overspent: SquadPick[] = [];
    for (const position of ['GKP', 'DEF', 'MID', 'FWD'] as Position[]) {
      const pool = priciest.filter((p) => p.position === position);
      for (let i = 0; i < rules.positionQuota[position]; i++) {
        overspent.push({
          playerId: pool[i]!.id,
          slot: overspent.length + 1,
          isCaptain: overspent.length === 0,
          isViceCaptain: overspent.length === 1,
        });
      }
    }

    const errors = validateSquad(overspent, players, rules);
    expect(errors.some((error) => error.code === 'OVER_BUDGET')).toBe(true);
  });
});

describe('formation is derived, never decorative', () => {
  it('reports the formation the XI actually is', () => {
    const squad = buildSquadFromIds(budgetSquad.map((p) => p.id), players, rules)!;
    const resolved = resolvePicks(squad.picks, players);
    const starters = startersOf(resolved);

    const formation = deriveFormation(starters);
    const [def, mid, fwd] = formation.split('-').map(Number);

    expect(starters.filter((e) => e.player.position === 'DEF')).toHaveLength(def!);
    expect(starters.filter((e) => e.player.position === 'MID')).toHaveLength(mid!);
    expect(starters.filter((e) => e.player.position === 'FWD')).toHaveLength(fwd!);
    expect(1 + def! + mid! + fwd!).toBe(11);
  });

  it('rejects an XI with two goalkeepers', () => {
    const keepers = players.filter((p) => p.position === 'GKP').slice(0, 2);
    const outfield = players.filter((p) => p.position !== 'GKP').slice(0, 9);
    const picks: SquadPick[] = [...keepers, ...outfield].map((player, index) => ({
      playerId: player.id,
      slot: index + 1,
      isCaptain: index === 0,
      isViceCaptain: index === 1,
    }));

    expect(isValidFormation(startersOf(resolvePicks(picks, players)), rules)).toBe(false);
  });
});

describe('swaps can never create an illegal squad', () => {
  const squad = buildSquadFromIds(budgetSquad.map((p) => p.id), players, rules)!;
  const resolved = resolvePicks(squad.picks, players);
  const starters = startersOf(resolved);
  const bench = benchOf(resolved);

  it('refuses to bench the only goalkeeper for an outfielder', () => {
    const keeper = starters.find((e) => e.player.position === 'GKP')!;
    const outfieldSub = bench.find((e) => e.player.position !== 'GKP')!;
    expect(canSwap(keeper.player.id, outfieldSub.player.id, squad.picks, players, rules)).toBe(
      false,
    );
  });

  it('allows a like-for-like goalkeeper swap', () => {
    const keeper = starters.find((e) => e.player.position === 'GKP')!;
    const benchKeeper = bench.find((e) => e.player.position === 'GKP')!;
    expect(canSwap(keeper.player.id, benchKeeper.player.id, squad.picks, players, rules)).toBe(
      true,
    );
  });

  it('every swap it permits really does leave a legal formation', () => {
    // Exhaustive over all 11 x 4 combinations — the property that matters.
    for (const starter of starters) {
      for (const sub of bench) {
        const permitted = canSwap(starter.player.id, sub.player.id, squad.picks, players, rules);
        const swapped = applySwap(starter.player.id, sub.player.id, squad.picks);
        const legal =
          swapped !== null && isValidFormation(startersOf(resolvePicks(swapped, players)), rules);
        expect(permitted).toBe(legal);
      }
    }
  });

  it('legalSwapsFor never offers an illegal option', () => {
    for (const starter of starters) {
      for (const benchId of legalSwapsFor(starter.player.id, squad.picks, players, rules)) {
        expect(canSwap(starter.player.id, benchId, squad.picks, players, rules)).toBe(true);
      }
    }
  });

  it('rejects a swap between two starters', () => {
    expect(
      applySwap(starters[0]!.player.id, starters[1]!.player.id, squad.picks),
    ).toBeNull();
  });
});

describe('validateSquad', () => {
  it('accepts a well-formed squad', () => {
    const squad = buildSquadFromIds(budgetSquad.map((p) => p.id), players, rules)!;
    expect(validateSquad(squad.picks, players, rules)).toEqual([]);
  });

  it('catches breaching the 3-per-club limit', () => {
    const arsenal = players.filter((p) => p.teamId === 1);
    expect(arsenal.length).toBeGreaterThan(rules.teamLimit);

    const picks: SquadPick[] = arsenal.slice(0, 4).map((player, index) => ({
      playerId: player.id,
      slot: index + 1,
      isCaptain: index === 0,
      isViceCaptain: index === 1,
    }));

    const errors = validateSquad(picks, players, rules);
    expect(errors.some((error) => error.code === 'CLUB_LIMIT')).toBe(true);
  });

  it('catches a duplicated player', () => {
    const player = players[0]!;
    const picks: SquadPick[] = [
      { playerId: player.id, slot: 1, isCaptain: true, isViceCaptain: false },
      { playerId: player.id, slot: 2, isCaptain: false, isViceCaptain: true },
    ];
    const errors = validateSquad(picks, players, rules);
    expect(errors.some((error) => error.code === 'DUPLICATE_PLAYER')).toBe(true);
  });

  it('catches a missing captain', () => {
    const squad = buildSquadFromIds(budgetSquad.map((p) => p.id), players, rules)!;
    const noCaptain = squad.picks.map((pick) => ({ ...pick, isCaptain: false }));
    const errors = validateSquad(noCaptain, players, rules);
    expect(errors.some((error) => error.code === 'NO_CAPTAIN')).toBe(true);
  });
});

describe('scoreSquad', () => {
  const squad = buildSquadFromIds(budgetSquad.map((p) => p.id), players, rules)!;

  it('doubles the captain and ignores the bench for gameweek points', () => {
    const captain = players.find((p) => p.id === squad.captainId)!;
    const boosted: Player[] = players.map((player) =>
      player.id === captain.id ? { ...player, eventPoints: 10 } : { ...player, eventPoints: 2 },
    );

    const score = scoreSquad(squad.picks, boosted);
    // 10 other starters x 2 + captain 10 x 2 = 40
    expect(score.gameweekPoints).toBe(40);
    // 4 bench players x 2
    expect(score.benchPoints).toBe(8);
  });

  it('applies a triple captain multiplier', () => {
    const captain = players.find((p) => p.id === squad.captainId)!;
    const boosted: Player[] = players.map((player) =>
      player.id === captain.id ? { ...player, eventPoints: 10 } : { ...player, eventPoints: 0 },
    );

    expect(scoreSquad(squad.picks, boosted, 3).gameweekPoints).toBe(30);
  });

  it('averages form across the starting XI only', () => {
    const withForm: Player[] = players.map((player) => ({ ...player, form: 5 }));
    expect(scoreSquad(squad.picks, withForm).averageForm).toBe(5);
  });
});
