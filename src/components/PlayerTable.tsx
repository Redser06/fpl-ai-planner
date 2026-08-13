/**
 * The real player pool — all 584 of them, at real prices, with real
 * availability flags. Replaces the prototype's 17 hardcoded players.
 */

import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';

import type { Player, Position, SeasonMeta } from '../../shared/types';
import { AVAILABILITY_LABEL, availabilityClasses, formatPrice } from '../lib/format';

type SortKey = 'epNext' | 'price' | 'totalPoints' | 'selectedByPercent' | 'xGIPer90';

const SORT_LABELS: Record<SortKey, string> = {
  epNext: 'xP (next GW)',
  price: 'Price',
  totalPoints: 'Total pts',
  selectedByPercent: 'Ownership',
  xGIPer90: 'xGI / 90',
};

const POSITIONS: Array<Position | 'ALL'> = ['ALL', 'GKP', 'DEF', 'MID', 'FWD'];

export function PlayerTable({ players, meta }: { players: Player[]; meta: SeasonMeta }) {
  /**
   * Before the season starts FPL leaves LAST season's totals in the payload.
   * Showing them under a bare "Pts" heading presents carryover as current-season
   * scoring, which is simply wrong — so the column says which season it is.
   */
  const carryover = meta.statsSeason === 'PREVIOUS';
  const seasonSuffix = carryover ? ` ${meta.statsSeasonLabel ?? 'last season'}` : '';

  const [query, setQuery] = useState('');
  const [position, setPosition] = useState<Position | 'ALL'>('ALL');
  const [sortKey, setSortKey] = useState<SortKey>('epNext');
  const [availableOnly, setAvailableOnly] = useState(false);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();

    return players
      .filter((player) => {
        if (position !== 'ALL' && player.position !== position) return false;
        if (availableOnly && player.availability !== 'AVAILABLE') return false;
        if (needle.length === 0) return true;
        return (
          player.webName.toLowerCase().includes(needle) ||
          `${player.firstName} ${player.secondName}`.toLowerCase().includes(needle) ||
          player.teamShort.toLowerCase().includes(needle)
        );
      })
      .sort((a, b) => b[sortKey] - a[sortKey])
      .slice(0, 100);
  }, [players, query, position, sortKey, availableOnly]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search player or team…"
            className="w-full rounded-lg border border-slate-800 bg-slate-900 py-2 pl-9 pr-3 text-xs text-slate-200 placeholder:text-slate-600 focus:border-emerald-500/50 focus:outline-none"
          />
        </div>

        <div className="flex gap-1 rounded-lg border border-slate-800 bg-slate-900 p-1">
          {POSITIONS.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setPosition(option)}
              className={`rounded px-2.5 py-1 text-[10px] font-black uppercase tracking-wider transition-colors ${
                position === option
                  ? 'bg-emerald-500 text-slate-950'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {option}
            </button>
          ))}
        </div>

        <select
          value={sortKey}
          onChange={(event) => setSortKey(event.target.value as SortKey)}
          className="rounded-lg border border-slate-800 bg-slate-900 px-2.5 py-2 text-xs text-slate-300 focus:border-emerald-500/50 focus:outline-none"
        >
          {Object.entries(SORT_LABELS).map(([key, label]) => (
            <option key={key} value={key}>
              Sort: {label}
            </option>
          ))}
        </select>

        <label className="flex cursor-pointer items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
          <input
            type="checkbox"
            checked={availableOnly}
            onChange={(event) => setAvailableOnly(event.target.checked)}
            className="h-3.5 w-3.5 accent-emerald-500"
          />
          Available only
        </label>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-800">
        <table className="w-full min-w-[720px] text-left text-xs">
          <thead className="bg-slate-900 text-[10px] uppercase tracking-wider text-slate-500">
            <tr>
              <th className="px-3 py-2 font-black">Player</th>
              <th className="px-3 py-2 font-black">Team</th>
              <th className="px-3 py-2 font-black">Pos</th>
              <th className="px-3 py-2 text-right font-black">Price</th>
              <th className="px-3 py-2 text-right font-black">xP</th>
              <th className="px-3 py-2 text-right font-black" title={carryover ? `Totals carried over from ${meta.statsSeasonLabel ?? 'last season'} — FPL resets them when the season starts` : undefined}>
                Pts{seasonSuffix}
              </th>
              <th className="px-3 py-2 text-right font-black">xGI/90{seasonSuffix}</th>
              <th className="px-3 py-2 text-right font-black">Own %</th>
              <th className="px-3 py-2 font-black">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/70">
            {filtered.map((player) => (
              <tr key={player.id} className="transition-colors hover:bg-slate-900/60">
                <td className="px-3 py-2 font-bold text-slate-200">{player.webName}</td>
                <td className="px-3 py-2 text-slate-400">{player.teamShort}</td>
                <td className="px-3 py-2 text-slate-400">{player.position}</td>
                <td className="px-3 py-2 text-right font-mono text-slate-300">
                  {formatPrice(player.price)}
                </td>
                <td className="px-3 py-2 text-right font-mono font-bold text-emerald-400">
                  {player.epNext.toFixed(1)}
                </td>
                <td className="px-3 py-2 text-right font-mono text-slate-300">
                  {player.totalPoints}
                </td>
                <td className="px-3 py-2 text-right font-mono text-slate-400">
                  {player.xGIPer90.toFixed(2)}
                </td>
                <td className="px-3 py-2 text-right font-mono text-slate-400">
                  {player.selectedByPercent.toFixed(1)}
                </td>
                <td className="px-3 py-2">
                  <span
                    className={`rounded border px-1.5 py-0.5 text-[10px] font-bold ${availabilityClasses(player.availability)}`}
                    title={player.news || undefined}
                  >
                    {AVAILABILITY_LABEL[player.availability]}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-[10px] text-slate-600">
        Showing {filtered.length} of {players.length} players.
        {carryover && (
          <>
            {' '}
            Points and per-90 figures are {meta.statsSeasonLabel ?? 'last season'} totals — FPL
            carries them until the new season starts. xP is for the upcoming gameweek.
          </>
        )}
      </p>
    </div>
  );
}
