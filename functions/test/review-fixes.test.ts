/**
 * Regression tests for defects found in review: squad history, the benched
 * captain, the FDR horizon past GW38, club matching in the paste parser, and
 * the public proxy's abuse limits.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { bootstrapSchema } from '../src/fpl/schemas';
import { callerKey, RateLimiter, TtlCache } from '../src/http/guard';
import { buildFdrMatrix, fdrEventCount, transformBootstrap } from '../src/ingest/transform';
import { squadForm, updateHistory, type GameweekResult } from '../../shared/model/history';
import {
  applySwap,
  autoFillSquad,
  buildSquadFromIds,
  legalSwapsFor,
  validateSquad,
} from '../../shared/model/squad';
import { matchPlayerInPool } from '../../shared/model/squadParser';
import type { Gameweek, Player, Team } from '../../shared/types';

const bootstrap = bootstrapSchema.parse(
  JSON.parse(readFileSync(join(__dirname, 'fixtures', 'bootstrap.json'), 'utf8')),
);
const { players, teams, gameweeks, meta } = transformBootstrap(
  bootstrap,
  '2026-08-13T00:00:00.000Z',
);
const squad = buildSquadFromIds(autoFillSquad(players, meta.rules)!, players, meta.rules)!;

describe('squad history', () => {
  const gw = (id: number, finished: boolean): Gameweek => ({
    id,
    name: `Gameweek ${id}`,
    deadlineTime: `2026-08-${String(10 + id).padStart(2, '0')}T10:00:00Z`,
    finished,
    isCurrent: false,
    isNext: false,
    isPrevious: false,
  });
  const live = { currentEvent: 3, statsSeason: 'CURRENT' as const };
  const scored = (points: number): Player[] =>
    players.map((p) => ({ ...p, eventPoints: points }));
  const input = (overrides: Partial<Parameters<typeof updateHistory>[1]> = {}) => ({
    squad,
    players: scored(2),
    gameweeks: [gw(3, false)],
    meta: live,
    rules: meta.rules,
    now: new Date('2026-08-14T12:00:00Z'),
    ...overrides,
  });

  it('records nothing pre-season or before the deadline', () => {
    expect(updateHistory([], input({ meta: { currentEvent: null, statsSeason: 'CURRENT' } }))).toBeNull();
    expect(updateHistory([], input({ meta: { currentEvent: 3, statsSeason: 'PREVIOUS' } }))).toBeNull();
    expect(updateHistory([], input({ now: new Date('2026-08-13T09:00:00Z') }))).toBeNull();
  });

  it('records the XI with the captain doubled, and the bench separately', () => {
    const history = updateHistory([], input())!;
    expect(history).toHaveLength(1);
    // 10 starters × 2 + captain × 2 × 2 = 24; 4 bench × 2 = 8.
    expect(history[0]).toMatchObject({ event: 3, points: 24, benchPoints: 8, final: false });
  });

  it('keeps scoring the picks locked at the deadline, not later edits', () => {
    const first = updateHistory([], input())!;
    const edited = { ...squad, picks: squad.picks.map((p) => ({ ...p, isCaptain: false })) };
    const updated = updateHistory(first, input({ squad: edited, players: scored(5) }))!;
    expect(updated[0]!.points).toBe(60);
    expect(updated[0]!.picks).toEqual(first[0]!.picks);
  });

  it('freezes a gameweek once FPL marks it finished', () => {
    const final = updateHistory([], input({ gameweeks: [gw(3, true)] }))!;
    expect(final[0]!.final).toBe(true);
    expect(updateHistory(final, input({ gameweeks: [gw(3, true)], players: scored(9) }))).toBeNull();
  });

  it('returns null when nothing changed, so callers skip the write', () => {
    const first = updateHistory([], input())!;
    expect(updateHistory(first, input())).toBeNull();
  });

  it('averages squad form over the last five gameweeks', () => {
    const history = [10, 20, 30, 40, 50, 60].map(
      (points, index): GameweekResult => ({
        event: index + 1,
        points,
        benchPoints: 0,
        squadValue: 100,
        final: true,
        picks: [],
        recordedAt: '',
      }),
    );
    expect(squadForm([])).toBeNull();
    expect(squadForm(history)).toBe(40);
  });
});

describe('the armband never sits on the bench', () => {
  it('hands the captaincy to the player coming on', () => {
    const captain = squad.picks.find((pick) => pick.isCaptain)!;
    const benchId = legalSwapsFor(captain.playerId, squad.picks, players, meta.rules)[0];
    expect(benchId).toBeDefined();

    const swapped = applySwap(captain.playerId, benchId!, squad.picks)!;
    const newCaptain = swapped.find((pick) => pick.isCaptain)!;
    expect(newCaptain.playerId).toBe(benchId);
    expect(newCaptain.slot).toBeLessThanOrEqual(11);
    expect(validateSquad(swapped, players, meta.rules)).toEqual([]);
  });

  it('rejects a squad whose captain is benched', () => {
    const benched = squad.picks.map((pick) => ({
      ...pick,
      isCaptain: pick.slot === 13,
    }));
    expect(validateSquad(benched, players, meta.rules).map((e) => e.code)).toContain(
      'CAPTAIN_ON_BENCH',
    );
  });
});

describe('FDR horizon', () => {
  it('stops at the final gameweek instead of inventing blanks', () => {
    const count = fdrEventCount(gameweeks, 35, 8);
    expect(count).toBe(4);
    const cells = buildFdrMatrix(teams, [], 35, count)[0]!.cells;
    expect(cells.map((cell) => cell.event)).toEqual([35, 36, 37, 38]);
  });

  it('uses the full horizon mid-season', () => {
    expect(fdrEventCount(gameweeks, 5, 8)).toBe(8);
  });
});

describe('paste parser club matching', () => {
  it('does not treat a short code inside a club name as a match', () => {
    // "CHE" sits inside "manchester": Chelsea's exact-name player used to beat
    // the Man Utd player the club hint actually pointed at.
    const chelsea = teams.find((t) => t.shortName === 'CHE')!;
    const united = teams.find((t) => t.shortName === 'MUN')!;
    const base = players[0]!;
    const enzo: Player = { ...base, id: -1, webName: 'Enzo', secondName: 'Fernández', teamId: chelsea.id };
    const enzoJr: Player = { ...base, id: -2, webName: 'Enzo Jr', secondName: 'Smith', teamId: united.id };

    expect(matchPlayerInPool('Enzo', [enzo, enzoJr], teams, 'Man Utd')?.id).toBe(enzoJr.id);
  });

  it('still matches an exact short code', () => {
    const team: Team = teams.find((t) => t.shortName === 'ARS')!;
    const player = players.find((p) => p.teamId === team.id)!;
    expect(matchPlayerInPool(player.webName, players, teams, 'ARS')?.id).toBe(player.id);
  });
});

describe('proxy guard', () => {
  it('rate limits per caller within a window', () => {
    const limiter = new RateLimiter(2, 1_000);
    expect(limiter.allow('a', 0)).toBe(true);
    expect(limiter.allow('a', 1)).toBe(true);
    expect(limiter.allow('a', 2)).toBe(false);
    expect(limiter.allow('b', 2)).toBe(true);
    expect(limiter.allow('a', 1_001)).toBe(true);
  });

  it('expires cached results', () => {
    const cache = new TtlCache<number>(100);
    cache.set('x', 1, 0);
    expect(cache.get('x', 50)).toBe(1);
    expect(cache.get('x', 100)).toBeUndefined();
  });

  it('keys callers on the first forwarded hop', () => {
    expect(callerKey('1.2.3.4, 10.0.0.1', 'fallback')).toBe('1.2.3.4');
    expect(callerKey(undefined, 'fallback')).toBe('fallback');
  });
});
