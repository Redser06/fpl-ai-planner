/**
 * Squad points and form — what the assistant reasons about week to week.
 *
 * Honest about the pre-season state: before a ball is kicked there are no
 * points and no form, and showing zeros with an explanation beats showing
 * last season's numbers as though they were this season's.
 */

import { Coins, TrendingUp, Trophy, Wallet } from 'lucide-react';

import type { Player, SeasonMeta, SquadPick } from '../../shared/types';
import { scoreSquad } from '../../shared/model/squad';
import type { GameweekResult } from '../data/squadStore';
import { formatPrice } from '../lib/format';

interface SquadSummaryProps {
  picks: SquadPick[];
  players: Player[];
  meta: SeasonMeta;
  history: GameweekResult[];
  squadValue: number;
  bank: number;
}

export function SquadSummary({
  picks,
  players,
  meta,
  history,
  squadValue,
  bank,
}: SquadSummaryProps) {
  const score = scoreSquad(picks, players);
  const seasonStarted = meta.statsSeason === 'CURRENT';

  const totalPoints = history.reduce((total, entry) => total + entry.points, 0);
  const lastGameweek = history.at(-1) ?? null;

  // Form over the last five recorded gameweeks — the same window FPL uses
  // conceptually, but at squad level rather than player level.
  const recent = history.slice(-5);
  const squadForm =
    recent.length === 0
      ? null
      : recent.reduce((total, entry) => total + entry.points, 0) / recent.length;

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Metric
          icon={Trophy}
          label="Total points"
          value={seasonStarted ? String(totalPoints) : '—'}
          hint={seasonStarted ? `${history.length} GW recorded` : 'Season not started'}
        />
        <Metric
          icon={TrendingUp}
          label="Last gameweek"
          value={lastGameweek ? String(lastGameweek.points) : '—'}
          hint={lastGameweek ? `GW${lastGameweek.event}` : 'No gameweek played'}
        />
        <Metric
          icon={TrendingUp}
          label="Squad form"
          value={squadForm === null ? '—' : squadForm.toFixed(1)}
          hint={squadForm === null ? 'Needs a played GW' : `Last ${recent.length} GW average`}
        />
        <Metric
          icon={TrendingUp}
          label={`GW${meta.nextEvent ?? '—'} projected`}
          value={score.expectedPoints.toFixed(1)}
          hint="XI + captain, from ep_next"
          tone="accent"
        />
        <Metric
          icon={Coins}
          label="Squad value"
          value={formatPrice(squadValue)}
          hint="Sum of live prices"
        />
        <Metric
          icon={Wallet}
          label="In the bank"
          value={formatPrice(bank)}
          hint={bank < 0 ? 'Over budget' : 'Budget remaining'}
          tone={bank < 0 ? 'alert' : 'default'}
        />
      </div>

      {!seasonStarted && (
        <p className="rounded-lg border border-slate-800 bg-slate-900/50 px-3 py-2 text-[11px] text-slate-500">
          <span className="font-bold text-slate-400">Season hasn't started.</span> Points and form
          fill in from gameweek 1. Player totals shown elsewhere are carried over from{' '}
          {meta.statsSeasonLabel ?? 'last season'} — FPL leaves them in place until the season
          rolls over.
        </p>
      )}
    </div>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
  hint,
  tone = 'default',
}: {
  icon: typeof Trophy;
  label: string;
  value: string;
  hint: string;
  tone?: 'default' | 'accent' | 'alert';
}) {
  const valueClass =
    tone === 'accent' ? 'text-emerald-400' : tone === 'alert' ? 'text-red-400' : 'text-slate-100';

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 px-3 py-2.5">
      <span className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider text-slate-500">
        <Icon className="h-3 w-3" />
        {label}
      </span>
      <span className={`mt-0.5 block text-lg font-black leading-tight ${valueClass}`}>
        {value}
      </span>
      <span className="text-[9px] text-slate-600">{hint}</span>
    </div>
  );
}
