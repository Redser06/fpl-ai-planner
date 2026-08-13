/**
 * The pitch — visual squad representation.
 *
 * Table stakes for an FPL tool (FPL run one themselves), and the surface where
 * the assistant's recommendations become tangible.
 *
 * Unlike the prototype's version, everything here is real:
 *  - rows are laid out from the formation the XI ACTUALLY is, derived from the
 *    players on the pitch rather than from a decorative bit of state
 *  - clicking a starter offers only the substitutions that leave a legal XI
 *  - the captain's armband moves points, and the header maths reflects it
 */

import { useState } from 'react';
import { AlertTriangle, ArrowLeftRight, Star } from 'lucide-react';

import type { Player, Position, SquadPick, SquadRules } from '../../shared/types';
import {
  benchOf,
  deriveFormation,
  legalSwapsFor,
  resolvePicks,
  startersOf,
} from '../../shared/model/squad';
import { availabilityClasses, formatPrice } from '../lib/format';

const ROW_ORDER: Position[] = ['GKP', 'DEF', 'MID', 'FWD'];

interface PitchProps {
  picks: SquadPick[];
  players: Player[];
  rules: SquadRules;
  captainId: number;
  viceCaptainId: number;
  /** Whether to show live gameweek points instead of expected points. */
  showLivePoints: boolean;
  onSwap: (starterId: number, benchId: number) => void;
  onSetCaptain: (playerId: number) => void;
}

function PlayerChip({
  player,
  isCaptain,
  isViceCaptain,
  showLivePoints,
  selected,
  swapCandidate,
  onClick,
}: {
  player: Player;
  isCaptain: boolean;
  isViceCaptain: boolean;
  showLivePoints: boolean;
  selected: boolean;
  swapCandidate: boolean;
  onClick: () => void;
}) {
  const flagged = player.availability !== 'AVAILABLE';
  const value = showLivePoints ? player.eventPoints : player.epNext;

  return (
    <button
      type="button"
      onClick={onClick}
      className={`group relative flex w-[92px] flex-col items-center rounded-lg border px-1.5 py-1.5 text-center transition-all ${
        selected
          ? 'border-emerald-400 bg-emerald-950/60 ring-2 ring-emerald-400/50'
          : swapCandidate
            ? 'border-sky-400/70 bg-sky-950/40 hover:border-sky-300'
            : 'border-slate-700 bg-slate-900/90 hover:border-slate-500'
      }`}
      title={player.news || undefined}
    >
      {(isCaptain || isViceCaptain) && (
        <span
          className={`absolute -left-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-black ${
            isCaptain ? 'bg-emerald-400 text-slate-950' : 'bg-slate-400 text-slate-950'
          }`}
        >
          {isCaptain ? 'C' : 'V'}
        </span>
      )}

      {flagged && (
        <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500">
          <AlertTriangle className="h-2.5 w-2.5 text-slate-950" />
        </span>
      )}

      <span className="w-full truncate text-[11px] font-bold text-slate-100">
        {player.webName}
      </span>
      <span className="text-[9px] font-medium uppercase tracking-wider text-slate-500">
        {player.teamShort} · {formatPrice(player.price)}
      </span>
      <span
        className={`mt-0.5 rounded px-1.5 text-[10px] font-black ${
          showLivePoints ? 'bg-slate-800 text-slate-200' : 'bg-emerald-950 text-emerald-300'
        }`}
      >
        {showLivePoints ? `${value} pts` : `${value.toFixed(1)} xP`}
      </span>
    </button>
  );
}

export function Pitch({
  picks,
  players,
  rules,
  captainId,
  viceCaptainId,
  showLivePoints,
  onSwap,
  onSetCaptain,
}: PitchProps) {
  const [selectedStarter, setSelectedStarter] = useState<number | null>(null);

  const resolved = resolvePicks(picks, players);
  const starters = startersOf(resolved);
  const bench = benchOf(resolved);
  const formation = deriveFormation(starters);

  const swapTargets =
    selectedStarter === null ? [] : legalSwapsFor(selectedStarter, picks, players, rules);

  const handleStarterClick = (playerId: number) => {
    setSelectedStarter((current) => (current === playerId ? null : playerId));
  };

  const handleBenchClick = (playerId: number) => {
    if (selectedStarter === null) return;
    if (!swapTargets.includes(playerId)) return;
    onSwap(selectedStarter, playerId);
    setSelectedStarter(null);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-baseline gap-3">
          <h2 className="text-sm font-black uppercase tracking-wide text-slate-100">
            Starting XI
          </h2>
          <span className="rounded border border-emerald-500/30 bg-emerald-950 px-2 py-0.5 text-[11px] font-black text-emerald-300">
            {formation}
          </span>
        </div>

        {selectedStarter !== null && (
          <span className="flex items-center gap-1.5 text-[11px] font-bold text-sky-300">
            <ArrowLeftRight className="h-3.5 w-3.5" />
            {swapTargets.length > 0
              ? `${swapTargets.length} legal substitution${swapTargets.length === 1 ? '' : 's'} highlighted`
              : 'No legal substitution for this player'}
          </span>
        )}
      </div>

      {/* Pitch */}
      <div className="rounded-2xl border border-emerald-900/40 bg-gradient-to-b from-emerald-950/50 to-slate-950 p-4">
        <div className="flex flex-col gap-4">
          {ROW_ORDER.map((position) => {
            const row = starters.filter((entry) => entry.player.position === position);
            if (row.length === 0) return null;

            return (
              <div key={position} className="flex flex-wrap justify-center gap-2">
                {row.map(({ player }) => (
                  <PlayerChip
                    key={player.id}
                    player={player}
                    isCaptain={player.id === captainId}
                    isViceCaptain={player.id === viceCaptainId}
                    showLivePoints={showLivePoints}
                    selected={selectedStarter === player.id}
                    swapCandidate={false}
                    onClick={() => handleStarterClick(player.id)}
                  />
                ))}
              </div>
            );
          })}
        </div>
      </div>

      {/* Bench */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-3">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-[10px] font-black uppercase tracking-wider text-slate-500">
            Bench (in order)
          </h3>
          {selectedStarter !== null && swapTargets.length > 0 && (
            <span className="text-[10px] font-bold text-sky-300">Click a highlighted player</span>
          )}
        </div>
        <div className="flex flex-wrap justify-center gap-2">
          {bench.map(({ player }, index) => (
            <div key={player.id} className="flex flex-col items-center gap-1">
              <span className="text-[9px] font-black text-slate-600">{index + 1}</span>
              <PlayerChip
                player={player}
                isCaptain={player.id === captainId}
                isViceCaptain={player.id === viceCaptainId}
                showLivePoints={showLivePoints}
                selected={false}
                swapCandidate={swapTargets.includes(player.id)}
                onClick={() => handleBenchClick(player.id)}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Captain picker */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-800 bg-slate-900/50 p-3">
        <span className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-slate-500">
          <Star className="h-3.5 w-3.5" /> Captain
        </span>
        {starters.map(({ player }) => (
          <button
            key={player.id}
            type="button"
            onClick={() => onSetCaptain(player.id)}
            className={`rounded border px-2 py-1 text-[10px] font-bold transition-colors ${
              player.id === captainId
                ? 'border-emerald-400 bg-emerald-500 text-slate-950'
                : `${availabilityClasses(player.availability)} hover:border-emerald-500/50`
            }`}
          >
            {player.webName}
          </button>
        ))}
      </div>
    </div>
  );
}
