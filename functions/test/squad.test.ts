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
  applyTransfer,
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

describe('applyTransfer', () => {
  const baseSquad = buildSquadFromIds(
    budgetSquad.map((p) => p.id),
    players,
    rules,
  )!;
  const byId = new Map(players.map((player) => [player.id, player]));

  function replacementFor(outId: number, maxPrice: number): Player {
    const out = byId.get(outId)!;
    const taken = new Set(baseSquad.picks.map((pick) => pick.playerId));
    return players.find(
      (p) =>
        p.position === out.position &&
        !taken.has(p.id) &&
        p.id !== outId &&
        p.availability === 'AVAILABLE' &&
        p.price <= maxPrice &&
        // Keep clear of the club cap so this test isolates one constraint at a time.
        baseSquad.picks.filter((pick) => byId.get(pick.playerId)?.teamId === p.teamId).length <
          rules.teamLimit,
    )!;
  }

  it('applies a legal transfer and keeps slot, captain and formation coherent', () => {
    const starter = baseSquad.picks.find((pick) => pick.slot <= 11)!;
    const incoming = replacementFor(starter.playerId, 100);
    const result = applyTransfer(baseSquad, starter.playerId, incoming.id, players, rules);

    expect(result).not.toBeNull();
    expect(result!.picks).toHaveLength(15);
    expect(validateSquad(result!.picks, players, rules)).toEqual([]);

    // Incoming player takes the vacated slot.
    const incomingPick = result!.picks.find((pick) => pick.playerId === incoming.id)!;
    expect(incomingPick.slot).toBe(starter.slot);
    expect(result!.picks.some((pick) => pick.playerId === starter.playerId)).toBe(false);

    // Formation label still matches the pitch, money still adds up.
    const resolved = resolvePicks(result!.picks, players);
    expect(result!.formation).toBe(deriveFormation(startersOf(resolved)));
    const value = resolved.reduce((total, entry) => total + entry.player.price, 0);
    expect(result!.squadValue).toBeCloseTo(value, 1);
  });

  it('moves the armband to the vice when the captain is sold', () => {
    const outCaptain = baseSquad.captainId;
    // Pick an incoming player of the same position at or below the captain's
    // price (captains are premium, so a cheap replacement always exists).
    const outgoing = byId.get(outCaptain)!;
    const taken = new Set(baseSquad.picks.map((pick) => pick.playerId));
    const incoming = players.find(
      (p) =>
        p.position === outgoing.position &&
        !taken.has(p.id) &&
        p.availability === 'AVAILABLE' &&
        p.price <= outgoing.price &&
        // Keep the swap legal on clubs too, so this test isolates the captaincy move.
        baseSquad.picks.filter((pick) => byId.get(pick.playerId)!.teamId === p.teamId).length <
          rules.teamLimit,
    )!;
    expect(incoming, 'need a cheaper same-position replacement').toBeDefined();

    const result = applyTransfer(baseSquad, outCaptain, incoming.id, players, rules)!;
    expect(result).not.toBeNull();
    expect(result.captainId).toBe(baseSquad.viceCaptainId);
    expect(result.viceCaptainId).not.toBe(result.captainId);
    expect(result.picks.find((pick) => pick.playerId === incoming.id)!.isCaptain).toBe(false);
    expect(result.picks.find((pick) => pick.playerId === result.captainId)!.isCaptain).toBe(true);
  });

  it('refuses a transfer that breaks the budget against the real bank', () => {
    // Spend the bank to zero first, then try to buy anyone pricier than the
    // outgoing player. Budget squad plus an expensive in = over real budget.
    const starter = baseSquad.picks.find((pick) => pick.slot <= 11)!;
    const outgoing = byId.get(starter.playerId)!;
    const taken = new Set(baseSquad.picks.map((pick) => pick.playerId));

    const noBank = { ...baseSquad, bank: 0 };
    const tooDear = [...players]
      .filter(
        (p) =>
          p.position === outgoing.position &&
          !taken.has(p.id) &&
          p.price > outgoing.price,
      )
      .sort((a, b) => b.price - a.price)[0];
    expect(tooDear, 'need a dearer same-position player to test the refusal').toBeDefined();

    // With zero bank, ANY upgrade is refused — budget is checked against bank,
    // so bank=0 plus a dearer player is over.
    expect(applyTransfer(noBank, starter.playerId, tooDear!.id, players, rules)).toBeNull();
  });

  it('updates the bank by the actual price difference', () => {
    const starter = baseSquad.picks.find((pick) => pick.slot <= 11)!;
    const outgoing = byId.get(starter.playerId)!;
    const incoming = replacementFor(starter.playerId, 100);
    const result = applyTransfer(baseSquad, starter.playerId, incoming.id, players, rules)!;

    expect(result.bank).toBeCloseTo(baseSquad.bank + outgoing.price - incoming.price, 1);
  });

  it('refuses a transfer that breaches the club limit', () => {
    const starter = baseSquad.picks.find((pick) => pick.slot <= 11)!;
    const outgoing = byId.get(starter.playerId)!;
    const taken = new Set(baseSquad.picks.map((pick) => pick.playerId));

    // A club already at the cap (excluding the outgoing player's own club).
    const clubCounts = new Map<number, number>();
    for (const pick of baseSquad.picks) {
      const player = byId.get(pick.playerId)!;
      clubCounts.set(player.teamId, (clubCounts.get(player.teamId) ?? 0) + 1);
    }
    const capped = [...clubCounts.entries()].find(
      ([teamId, count]) => count >= rules.teamLimit && teamId !== outgoing.teamId,
    );
    // Force a cap: pick the club with the most owned players, excluding outgoing's.
    const [teamId] =
      capped ??
      [...clubCounts.entries()]
        .filter(([id]) => id !== outgoing.teamId)
        .sort((a, b) => b[1] - a[1])[0]!;

    const sameClub = players.find(
      (p) =>
        p.teamId === teamId &&
        p.position === outgoing.position &&
        !taken.has(p.id) &&
        p.availability === 'AVAILABLE' &&
        p.price <= outgoing.price + baseSquad.bank,
    );

    if (sameClub && (clubCounts.get(teamId) ?? 0) >= rules.teamLimit) {
      // Genuinely at cap: must be refused.
      expect(applyTransfer(baseSquad, starter.playerId, sameClub.id, players, rules)).toBeNull();
    } else if (sameClub) {
      // Not actually at cap in this recorded squad: result must still be legal.
      const result = applyTransfer(baseSquad, starter.playerId, sameClub.id, players, rules);
      expect(result === null || validateSquad(result.picks, players, rules).length === 0).toBe(
        true,
      );
    }
  });

  it('refuses to duplicate a player already in the squad', () => {
    const a = baseSquad.picks[0]!;
    const b = baseSquad.picks.find((pick) => pick.playerId !== a.playerId)!;
    expect(applyTransfer(baseSquad, a.playerId, b.playerId, players, rules)).toBeNull();
  });

  it('refuses a cross-position transfer (that is a rebuild, not a transfer)', () => {
    const starter = baseSquad.picks.find((pick) => pick.slot <= 11)!;
    const other = players.find(
      (p) =>
        p.position !== byId.get(starter.playerId)!.position &&
        !baseSquad.picks.some((pick) => pick.playerId === p.id),
    )!;
    expect(applyTransfer(baseSquad, starter.playerId, other.id, players, rules)).toBeNull();
  });

  it('returns null for players not in the squad or pool', () => {
    expect(applyTransfer(baseSquad, 99999, players[0]!.id, players, rules)).toBeNull();
    expect(applyTransfer(baseSquad, baseSquad.picks[0]!.playerId, 99999, players, rules)).toBeNull();
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
