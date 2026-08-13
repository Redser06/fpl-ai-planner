/**
 * Manual squad builder.
 *
 * This is the ONLY viable onboarding path before a gameweek deadline: FPL keeps
 * squads private until the deadline passes, so `/entry/{id}/event/{gw}/picks/`
 * returns 404 and "import my team" cannot work pre-season.
 *
 * Every constraint enforced here — budget, position quotas, club limit — is read
 * from FPL's live `game_settings`, not hardcoded.
 */

import { useMemo, useState } from 'react';
import { Check, Plus, Search, Trash2, Wand2, X } from 'lucide-react';

import type { Player, Position, SquadRules } from '../../shared/types';
import { autoFillSquad, POSITION_ORDER } from '../../shared/model/squad';
import { availabilityClasses, formatPrice } from '../lib/format';

interface SquadBuilderProps {
  players: Player[];
  rules: SquadRules;
  onComplete: (playerIds: number[]) => void;
  onCancel: (() => void) | null;
}

export function SquadBuilder({ players, rules, onComplete, onCancel }: SquadBuilderProps) {
  const [selected, setSelected] = useState<number[]>([]);
  const [query, setQuery] = useState('');
  const [position, setPosition] = useState<Position>('GKP');

  const byId = useMemo(() => new Map(players.map((player) => [player.id, player])), [players]);
  const chosen = selected
    .map((id) => byId.get(id))
    .filter((player): player is Player => player !== undefined);

  const spent = chosen.reduce((total, player) => total + player.price, 0);
  const remaining = rules.totalBudget - spent;

  const counts = useMemo(() => {
    const result: Record<Position, number> = { GKP: 0, DEF: 0, MID: 0, FWD: 0 };
    for (const player of chosen) result[player.position] += 1;
    return result;
  }, [chosen]);

  const clubCounts = useMemo(() => {
    const result = new Map<number, number>();
    for (const player of chosen) result.set(player.teamId, (result.get(player.teamId) ?? 0) + 1);
    return result;
  }, [chosen]);

  /** Why this specific player cannot be added right now, or null if he can. */
  function blockedReason(player: Player): string | null {
    if (selected.includes(player.id)) return 'Already selected';
    if (counts[player.position] >= rules.positionQuota[player.position]) {
      return `Already have ${rules.positionQuota[player.position]} ${player.position}`;
    }
    if ((clubCounts.get(player.teamId) ?? 0) >= rules.teamLimit) {
      return `Already have ${rules.teamLimit} from ${player.teamShort}`;
    }
    if (player.price > remaining) return 'Not affordable';
    return null;
  }

  const candidates = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return players
      .filter((player) => player.position === position)
      .filter((player) => {
        if (needle.length === 0) return true;
        return (
          player.webName.toLowerCase().includes(needle) ||
          player.teamShort.toLowerCase().includes(needle)
        );
      })
      .sort((a, b) => b.epNext - a.epNext || b.selectedByPercent - a.selectedByPercent)
      .slice(0, 60);
  }, [players, position, query]);

  const isComplete = selected.length === rules.squadSize;

  /**
   * Fills the squad automatically, keeping anything already chosen as a seed.
   * The logic lives in the tested model layer rather than here.
   */
  function autoFill() {
    const filled = autoFillSquad(players, rules, { seed: selected });
    if (filled) setSelected(filled);
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
        <div>
          <h2 className="text-sm font-black uppercase tracking-wide text-slate-100">
            Build your squad
          </h2>
          <p className="mt-0.5 text-[11px] text-slate-500">
            {rules.squadSize} players · £{rules.totalBudget.toFixed(1)}m budget · max{' '}
            {rules.teamLimit} per club. Read live from FPL.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={autoFill}
            className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-[11px] font-bold text-slate-300 transition-colors hover:border-emerald-500/50 hover:text-emerald-300"
          >
            <Wand2 className="h-3.5 w-3.5" /> Auto-fill
          </button>
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="rounded-lg border border-slate-700 px-3 py-1.5 text-[11px] font-bold text-slate-400 hover:text-slate-200"
            >
              Cancel
            </button>
          )}
          <button
            type="button"
            disabled={!isComplete || remaining < 0}
            onClick={() => onComplete(selected)}
            className="flex items-center gap-1.5 rounded-lg bg-emerald-500 px-3 py-1.5 text-[11px] font-black text-slate-950 transition-opacity disabled:cursor-not-allowed disabled:opacity-30"
          >
            <Check className="h-3.5 w-3.5" /> Confirm squad
          </button>
        </div>
      </div>

      {/* Progress */}
      <div className="flex flex-wrap items-center gap-4 rounded-xl border border-slate-800 bg-slate-900/60 px-4 py-2.5">
        <div className="text-right">
          <span className="block text-[9px] font-bold uppercase tracking-wider text-slate-500">
            Selected
          </span>
          <span className="text-sm font-black text-slate-200">
            {selected.length}/{rules.squadSize}
          </span>
        </div>
        <div className="h-6 w-px bg-slate-800" />
        <div className="text-right">
          <span className="block text-[9px] font-bold uppercase tracking-wider text-slate-500">
            Remaining
          </span>
          <span
            className={`text-sm font-black ${remaining < 0 ? 'text-red-400' : 'text-emerald-400'}`}
          >
            {formatPrice(remaining)}
          </span>
        </div>
        <div className="h-6 w-px bg-slate-800" />
        {POSITION_ORDER.map((pos) => (
          <div key={pos} className="text-right">
            <span className="block text-[9px] font-bold uppercase tracking-wider text-slate-500">
              {pos}
            </span>
            <span
              className={`text-sm font-black ${
                counts[pos] === rules.positionQuota[pos] ? 'text-emerald-400' : 'text-slate-300'
              }`}
            >
              {counts[pos]}/{rules.positionQuota[pos]}
            </span>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        {/* Candidate list */}
        <div className="flex flex-col gap-3 lg:col-span-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex gap-1 rounded-lg border border-slate-800 bg-slate-900 p-1">
              {POSITION_ORDER.map((pos) => (
                <button
                  key={pos}
                  type="button"
                  onClick={() => setPosition(pos)}
                  className={`rounded px-2.5 py-1 text-[10px] font-black uppercase tracking-wider transition-colors ${
                    position === pos
                      ? 'bg-emerald-500 text-slate-950'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {pos} {counts[pos]}/{rules.positionQuota[pos]}
                </button>
              ))}
            </div>
            <div className="relative min-w-[160px] flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search…"
                className="w-full rounded-lg border border-slate-800 bg-slate-900 py-1.5 pl-9 pr-3 text-xs text-slate-200 placeholder:text-slate-600 focus:border-emerald-500/50 focus:outline-none"
              />
            </div>
          </div>

          <div className="max-h-[460px] overflow-y-auto rounded-xl border border-slate-800">
            <table className="w-full text-left text-xs">
              <tbody className="divide-y divide-slate-800/70">
                {candidates.map((player) => {
                  const blocked = blockedReason(player);
                  return (
                    <tr key={player.id} className="hover:bg-slate-900/60">
                      <td className="px-3 py-1.5">
                        <span className="font-bold text-slate-200">{player.webName}</span>
                        <span className="ml-1.5 text-[10px] text-slate-500">
                          {player.teamShort}
                        </span>
                      </td>
                      <td className="px-2 py-1.5">
                        <span
                          className={`rounded border px-1.5 py-0.5 text-[9px] font-bold ${availabilityClasses(player.availability)}`}
                        >
                          {player.availability === 'AVAILABLE' ? 'Fit' : player.availability}
                        </span>
                      </td>
                      <td className="px-2 py-1.5 text-right font-mono text-slate-300">
                        {formatPrice(player.price)}
                      </td>
                      <td className="px-2 py-1.5 text-right font-mono font-bold text-emerald-400">
                        {player.epNext.toFixed(1)}
                      </td>
                      <td className="px-2 py-1.5 text-right font-mono text-slate-500">
                        {player.selectedByPercent.toFixed(1)}%
                      </td>
                      <td className="px-3 py-1.5 text-right">
                        <button
                          type="button"
                          disabled={blocked !== null}
                          title={blocked ?? 'Add to squad'}
                          onClick={() => setSelected((current) => [...current, player.id])}
                          className="rounded bg-emerald-500 p-1 text-slate-950 transition-opacity disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-500"
                        >
                          <Plus className="h-3 w-3" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Chosen squad */}
        <div className="flex flex-col gap-2 lg:col-span-2">
          <h3 className="text-[10px] font-black uppercase tracking-wider text-slate-500">
            Your squad
          </h3>
          <div className="flex flex-col gap-2 rounded-xl border border-slate-800 bg-slate-900/40 p-3">
            {POSITION_ORDER.map((pos) => {
              const group = chosen.filter((player) => player.position === pos);
              return (
                <div key={pos}>
                  <span className="text-[9px] font-black uppercase tracking-wider text-slate-600">
                    {pos}
                  </span>
                  {group.length === 0 ? (
                    <p className="text-[11px] text-slate-700">—</p>
                  ) : (
                    group.map((player) => (
                      <div
                        key={player.id}
                        className="flex items-center justify-between gap-2 py-0.5"
                      >
                        <span className="truncate text-[11px] text-slate-300">
                          {player.webName}
                          <span className="ml-1 text-[9px] text-slate-600">
                            {player.teamShort}
                          </span>
                        </span>
                        <span className="flex items-center gap-1.5">
                          <span className="font-mono text-[10px] text-slate-400">
                            {formatPrice(player.price)}
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              setSelected((current) =>
                                current.filter((id) => id !== player.id),
                              )
                            }
                            className="text-slate-600 hover:text-red-400"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </span>
                      </div>
                    ))
                  )}
                </div>
              );
            })}

            {selected.length > 0 && (
              <button
                type="button"
                onClick={() => setSelected([])}
                className="mt-2 flex items-center justify-center gap-1.5 rounded-lg border border-slate-800 py-1.5 text-[10px] font-bold text-slate-500 hover:border-red-500/40 hover:text-red-400"
              >
                <Trash2 className="h-3 w-3" /> Clear all
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
