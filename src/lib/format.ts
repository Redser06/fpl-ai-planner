/** Shared display helpers. */

import type { Availability } from '../../shared/types';

export const formatPrice = (millions: number): string => `£${millions.toFixed(1)}m`;

/**
 * Difficulty colouring, 1 (easiest) to 5 (hardest).
 * Blanks are explicitly grey rather than green — a blank gameweek is not an
 * easy fixture, it is no fixture.
 */
export function difficultyClasses(difficulty: number | null): string {
  if (difficulty === null) return 'bg-slate-800/60 text-slate-500 border-slate-700';
  if (difficulty <= 2) return 'bg-emerald-900/70 text-emerald-200 border-emerald-500/30';
  if (difficulty < 3) return 'bg-emerald-900/40 text-emerald-300 border-emerald-500/20';
  if (difficulty < 4) return 'bg-amber-900/50 text-amber-200 border-amber-500/30';
  if (difficulty < 5) return 'bg-orange-900/50 text-orange-200 border-orange-500/30';
  return 'bg-red-900/60 text-red-200 border-red-500/40';
}

export const AVAILABILITY_LABEL: Record<Availability, string> = {
  AVAILABLE: 'Available',
  DOUBTFUL: 'Doubtful',
  INJURED: 'Injured',
  SUSPENDED: 'Suspended',
  UNAVAILABLE: 'Unavailable',
  NOT_IN_SQUAD: 'Not in squad',
};

export function availabilityClasses(availability: Availability): string {
  switch (availability) {
    case 'AVAILABLE':
      return 'bg-emerald-950 text-emerald-300 border-emerald-500/30';
    case 'DOUBTFUL':
      return 'bg-amber-950 text-amber-300 border-amber-500/30';
    case 'INJURED':
    case 'SUSPENDED':
      return 'bg-red-950 text-red-300 border-red-500/40';
    default:
      return 'bg-slate-800 text-slate-400 border-slate-700';
  }
}

/** e.g. "6 days" / "4 hours" until the deadline. */
export function timeUntil(iso: string | null, now = Date.now()): string {
  if (!iso) return 'unknown';
  const ms = new Date(iso).getTime() - now;
  if (Number.isNaN(ms)) return 'unknown';
  if (ms <= 0) return 'passed';

  const hours = Math.floor(ms / 3_600_000);
  if (hours < 1) return `${Math.floor(ms / 60_000)} min`;
  if (hours < 48) return `${hours}h`;
  return `${Math.floor(hours / 24)} days`;
}
