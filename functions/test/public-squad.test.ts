/**
 * Tests for the read-only live squad proxy's pure core. Deps are injected so
 * nothing here touches the network or firebase-admin.
 */

import { describe, expect, it } from 'vitest';

import { pickEventCandidates } from '../src/ingest/publicSquadEvent';
import {
  fetchPublicSquad,
  parseEntryId,
  InvalidEntryIdError,
  type PublicSquadDeps,
} from '../src/ingest/publicSquad';
import type { RawEntry, RawEntryPicks } from '../src/fpl/schemas';

function entry(overrides: Partial<RawEntry> = {}): RawEntry {
  return {
    id: 4698335,
    name: 'Baby Brother XI 2026',
    player_first_name: 'Conor',
    player_last_name: 'Redmond',
    summary_overall_points: 150,
    summary_overall_rank: 1955694,
    last_deadline_bank: 0,
    last_deadline_value: 1000,
    current_event: 2,
    started_event: 1,
    ...overrides,
  };
}

function picks(playerIds: number[]): RawEntryPicks {
  return {
    active_chip: null,
    entry_history: { event: 2, bank: 0, value: 1000 },
    picks: playerIds.map((id, index) => ({
      element: id,
      position: index + 1,
      is_captain: id === playerIds[6],
      is_vice_captain: id === playerIds[10],
      multiplier: 1,
    })),
  };
}

const FIFTEEN = [11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25];

function makeDeps(overrides: Partial<PublicSquadDeps> = {}): PublicSquadDeps {
  return {
    fetchEntry: async () => entry(),
    fetchEntryPicks: async () => picks(FIFTEEN),
    now: () => new Date('2026-08-31T21:00:00Z'),
    ...overrides,
  };
}

describe('parseEntryId', () => {
  it('accepts a positive integer from a query string', () => {
    expect(parseEntryId('4698335')).toBe(4698335);
    expect(parseEntryId(7)).toBe(7);
  });

  it('rejects non-numeric, negative, fractional, and missing ids', () => {
    expect(() => parseEntryId('abc')).toThrow(InvalidEntryIdError);
    expect(() => parseEntryId('-3')).toThrow(InvalidEntryIdError);
    expect(() => parseEntryId('1.5')).toThrow(InvalidEntryIdError);
    expect(() => parseEntryId(undefined)).toThrow(InvalidEntryIdError);
    expect(() => parseEntryId('')).toThrow(InvalidEntryIdError);
  });
});

describe('pickEventCandidates', () => {
  it('is empty pre-season (current_event null)', () => {
    expect(pickEventCandidates(null)).toEqual([]);
  });

  it('tries only GW1 when the current event is 1', () => {
    expect(pickEventCandidates(1)).toEqual([1]);
  });

  it('tries the current event then the previous one mid-season', () => {
    expect(pickEventCandidates(2)).toEqual([2, 1]);
    expect(pickEventCandidates(20)).toEqual([20, 19]);
  });
});

describe('fetchPublicSquad', () => {
  it('returns the current event squad when it is public', async () => {
    const seen: number[] = [];
    const result = await fetchPublicSquad(
      '4698335',
      makeDeps({
        fetchEntryPicks: async (_id, event) => {
          seen.push(event);
          return picks(FIFTEEN);
        },
      }),
    );

    expect(result.status).toBe('OK');
    expect(seen).toEqual([2]); // did not need to fall back
    if (result.status !== 'OK') return;
    expect(result.entryName).toBe('Baby Brother XI 2026');
    expect(result.squad.entryId).toBe(4698335);
    expect(result.squad.source).toBe('IMPORTED');
    expect(result.squad.formation).toBe(''); // derived client-side
    expect(result.squad.picks).toHaveLength(15);
    expect(result.squad.captainId).toBe(17); // playerIds[6] flagged captain
    expect(result.squad.viceCaptainId).toBe(21); // playerIds[10]
    expect(result.squad.bank).toBe(0);
    expect(result.squad.squadValue).toBe(100);
  });

  it('falls back to the previous event when the current one is still private', async () => {
    const seen: number[] = [];
    const result = await fetchPublicSquad(
      4698335,
      makeDeps({
        fetchEntryPicks: async (_id, event) => {
          seen.push(event);
          return event === 2 ? null : picks(FIFTEEN); // GW2 private, GW1 public
        },
      }),
    );

    expect(result.status).toBe('OK');
    expect(seen).toEqual([2, 1]);
  });

  it('returns PICKS_NOT_PUBLIC when every candidate event is private mid-season', async () => {
    const result = await fetchPublicSquad(
      4698335,
      makeDeps({ fetchEntryPicks: async () => null }),
    );
    expect(result).toEqual({ status: 'PICKS_NOT_PUBLIC', entryName: 'Baby Brother XI 2026' });
  });

  it('returns SEASON_NOT_STARTED pre-season (current_event null, no fetch attempted)', async () => {
    let fetchCalled = false;
    const result = await fetchPublicSquad(
      4698335,
      makeDeps({
        fetchEntry: async () => entry({ current_event: null }),
        fetchEntryPicks: async () => {
          fetchCalled = true;
          return null;
        },
      }),
    );
    expect(result).toEqual({ status: 'SEASON_NOT_STARTED' });
    expect(fetchCalled).toBe(false);
  });

  it('returns SEASON_NOT_STARTED when GW1 itself is still private', async () => {
    const result = await fetchPublicSquad(
      4698335,
      makeDeps({
        fetchEntry: async () => entry({ current_event: 1 }),
        fetchEntryPicks: async () => null,
      }),
    );
    expect(result).toEqual({ status: 'SEASON_NOT_STARTED' });
  });

  it('validates the entry id before any network call', async () => {
    let fetchCalled = false;
    await expect(
      fetchPublicSquad('not-a-number', makeDeps({
        fetchEntry: async () => {
          fetchCalled = true;
          return entry();
        },
      })),
    ).rejects.toBeInstanceOf(InvalidEntryIdError);
    expect(fetchCalled).toBe(false);
  });

  it('emits the same squad shape importSquad persists (import-path parity)', async () => {
    // The callable (importSquad) and this proxy are interchangeable to the
    // client, so the OK squad must carry the exact fields both set. If one path
    // drifted, the pitch/captain/bank UI would silently break after the flip.
    const result = await fetchPublicSquad('4698335', makeDeps());
    if (result.status !== 'OK') throw new Error('expected OK');

    const squad = result.squad;
    expect(Object.keys(squad).sort()).toEqual(
      [
        'picks',
        'formation',
        'captainId',
        'viceCaptainId',
        'bank',
        'squadValue',
        'entryId',
        'source',
        'updatedAt',
      ].sort(),
    );
    expect(squad.picks.every((pick) =>
      Object.keys(pick).sort().join(',') === 'isCaptain,isViceCaptain,playerId,slot',
    )).toBe(true);
    expect(squad.updatedAt).toBe('2026-08-31T21:00:00.000Z'); // injected clock
  });
});
