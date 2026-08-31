/**
 * Import gameweek selection.
 *
 * The single most impactful bug in the first cycle: `importSquad` asked FPL for
 * the CURRENT event's picks, which are private until the deadline — so import
 * only worked in the few hours between deadline and the next gameweek opening.
 * The correct event is the latest one whose deadline has PASSED: the squad the
 * manager actually fielded most recently.
 */

import { describe, expect, it } from 'vitest';

import { latestClosedEvent } from '../src/ingest/importEvent';
import type { Gameweek } from '../../shared/types';

function gameweek(id: number, deadlineTime: string): Gameweek {
  return { id, name: `Gameweek ${id}`, deadlineTime, finished: false, isCurrent: false, isNext: false, isPrevious: false };
}

const SEASON: Gameweek[] = [
  gameweek(1, '2026-08-14T17:30:00Z'),
  gameweek(2, '2026-08-21T17:30:00Z'),
  gameweek(3, '2026-08-28T17:30:00Z'),
];

describe('latestClosedEvent', () => {
  it('is null before the season starts — no deadline has passed', () => {
    expect(latestClosedEvent(SEASON, new Date('2026-08-01T00:00:00Z'))).toBeNull();
  });

  it('returns null at the exact deadline instant boundary start of day', () => {
    // One minute before GW1's deadline: still private.
    expect(latestClosedEvent(SEASON, new Date('2026-08-14T17:29:00Z'))).toBeNull();
  });

  it('returns GW1 the moment its deadline passes', () => {
    expect(latestClosedEvent(SEASON, new Date('2026-08-14T17:31:00Z'))).toBe(1);
  });

  it('returns the LATEST closed event midweek, not the current one', () => {
    // Midweek between GW2 and GW3: GW2 is public, GW3 is not.
    expect(latestClosedEvent(SEASON, new Date('2026-08-25T12:00:00Z'))).toBe(2);
  });

  it('keeps returning the same event through a gameweek until the next deadline passes', () => {
    // GW2's deadline has passed; GW3's has not. All week it must stay GW2.
    expect(latestClosedEvent(SEASON, new Date('2026-08-22T09:00:00Z'))).toBe(2);
    expect(latestClosedEvent(SEASON, new Date('2026-08-28T17:29:00Z'))).toBe(2);
    expect(latestClosedEvent(SEASON, new Date('2026-08-28T17:31:00Z'))).toBe(3);
  });

  it('handles an empty gameweek list', () => {
    expect(latestClosedEvent([], new Date('2026-08-20T00:00:00Z'))).toBeNull();
  });
});
