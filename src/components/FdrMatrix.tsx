/**
 * The fixture difficulty matrix — all 20 teams, from real fixture data.
 *
 * Replaces the prototype's hand-written 13-team table, which contained invented
 * opponent codes (RBO, LRS, HOT), a team playing itself twice in one gameweek,
 * and every team blanking in the same gameweek.
 *
 * Blanks and doubles here are computed from the actual fixture list, so when a
 * real blank or double arrives (typically around the FA Cup rounds) it appears
 * automatically.
 */

import { useMemo, useState } from 'react';

import type { FdrRow } from '../../shared/types';
import { difficultyClasses } from '../lib/format';

type SortMode = 'team' | 'easiest';

export function FdrMatrix({
  rows,
  fromEvent,
  eventCount,
}: {
  rows: FdrRow[];
  fromEvent: number;
  eventCount: number;
}) {
  const [sortMode, setSortMode] = useState<SortMode>('team');
  const events = Array.from({ length: eventCount }, (_, index) => fromEvent + index);

  const sorted = useMemo(() => {
    if (sortMode === 'team') return rows;

    // Rank by mean difficulty over the horizon. Blank gameweeks are excluded
    // from the mean rather than counted as zero, which would wrongly make a
    // blank look like the easiest possible fixture.
    return [...rows].sort((a, b) => average(a) - average(b));
  }, [rows, sortMode]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-black uppercase tracking-wide text-slate-100">
            Fixture difficulty · GW{fromEvent}–{fromEvent + eventCount - 1}
          </h2>
          <p className="mt-0.5 text-[11px] text-slate-500">
            {rows.length} teams, from live FPL fixture difficulty ratings.
          </p>
        </div>

        <div className="flex gap-1 rounded-lg border border-slate-800 bg-slate-900 p-1">
          <button
            type="button"
            onClick={() => setSortMode('team')}
            className={`rounded px-2.5 py-1 text-[10px] font-black uppercase tracking-wider transition-colors ${
              sortMode === 'team' ? 'bg-emerald-500 text-slate-950' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            A–Z
          </button>
          <button
            type="button"
            onClick={() => setSortMode('easiest')}
            className={`rounded px-2.5 py-1 text-[10px] font-black uppercase tracking-wider transition-colors ${
              sortMode === 'easiest'
                ? 'bg-emerald-500 text-slate-950'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Easiest run
          </button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-800">
        <table className="w-full min-w-[860px] border-collapse text-xs">
          <thead className="bg-slate-900 text-[10px] uppercase tracking-wider text-slate-500">
            <tr>
              <th className="sticky left-0 z-10 bg-slate-900 px-3 py-2 text-left font-black">
                Team
              </th>
              {events.map((event) => (
                <th key={event} className="px-2 py-2 text-center font-black">
                  GW{event}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/70">
            {sorted.map((row) => (
              <tr key={row.teamId}>
                <td className="sticky left-0 z-10 bg-slate-950 px-3 py-1.5 font-bold text-slate-200">
                  {row.teamShort}
                </td>
                {row.cells.map((cell) => (
                  <td key={cell.event} className="px-1 py-1.5 text-center">
                    <div
                      className={`rounded border px-1 py-1 text-[10px] font-bold ${difficultyClasses(cell.averageDifficulty)}`}
                      title={
                        cell.isBlank
                          ? 'Blank gameweek — no fixture'
                          : cell.opponents
                              .map(
                                (opponent) =>
                                  `${opponent.opponentShort} (${opponent.isHome ? 'H' : 'A'}) FDR ${opponent.difficulty}`,
                              )
                              .join(' + ')
                      }
                    >
                      {cell.isBlank ? (
                        <span className="text-slate-500">BLANK</span>
                      ) : (
                        cell.opponents.map((opponent, index) => (
                          <span key={`${opponent.opponentShort}-${index}`}>
                            {index > 0 && <span className="text-slate-500"> + </span>}
                            {opponent.opponentShort}
                            <span className="opacity-60">{opponent.isHome ? ' (H)' : ' (A)'}</span>
                          </span>
                        ))
                      )}
                      {cell.isDouble && (
                        <span className="ml-1 rounded bg-emerald-500 px-1 text-[8px] font-black text-slate-950">
                          DGW
                        </span>
                      )}
                    </div>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center gap-3 text-[10px] text-slate-500">
        <span className="font-bold uppercase tracking-wider">Difficulty</span>
        {[1, 2, 3, 4, 5].map((difficulty) => (
          <span
            key={difficulty}
            className={`rounded border px-2 py-0.5 font-bold ${difficultyClasses(difficulty)}`}
          >
            {difficulty}
          </span>
        ))}
        <span className={`rounded border px-2 py-0.5 font-bold ${difficultyClasses(null)}`}>
          Blank
        </span>
      </div>
    </div>
  );
}

function average(row: FdrRow): number {
  const values = row.cells
    .map((cell) => cell.averageDifficulty)
    .filter((value): value is number => value !== null);
  if (values.length === 0) return Number.POSITIVE_INFINITY;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}
