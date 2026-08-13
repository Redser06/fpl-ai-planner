/**
 * App shell.
 *
 * The inbox is the landing tab, deliberately: the product is an assistant that
 * tells you what matters before the deadline, not a dashboard you have to
 * remember to visit. The player pool and fixture matrix are supporting evidence.
 *
 * There is no hardcoded football data anywhere in this file. Everything below
 * is rendered from the live snapshot in public/data/.
 */

import { useEffect, useMemo, useState } from 'react';
import { CalendarDays, Inbox, Loader2, ServerCrash, Shield, Users } from 'lucide-react';

import { loadSnapshot, type Snapshot } from './data/snapshot';
import { generateAlerts } from '../shared/model/alerts';
import { AlertInbox } from './components/AlertInbox';
import { FdrMatrix } from './components/FdrMatrix';
import { PlayerTable } from './components/PlayerTable';
import { timeUntil } from './lib/format';

type Tab = 'inbox' | 'players' | 'fixtures';

const TABS: Array<{ id: Tab; label: string; icon: typeof Inbox }> = [
  { id: 'inbox', label: 'Assistant Manager', icon: Inbox },
  { id: 'players', label: 'Player Pool', icon: Users },
  { id: 'fixtures', label: 'Fixture Difficulty', icon: CalendarDays },
];

/**
 * Until a user squad exists (Phase 2: manual builder + entry-id import), we
 * watch the most-owned players as a proxy for "players you probably own".
 * The alert engine takes a list of ids either way, so this is the same code
 * path a real squad will use.
 *
 * 200 is chosen from the data rather than by feel: it covers every player owned
 * by roughly 1% of managers or more. Narrower windows (the top 60) contain no
 * flagged players at all right now, which is a true but useless inbox.
 */
const WATCHLIST_SIZE = 200;

export default function App() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('inbox');

  useEffect(() => {
    let cancelled = false;

    loadSnapshot()
      .then((data) => {
        if (!cancelled) setSnapshot(data);
      })
      .catch((cause: unknown) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : String(cause));
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const playersById = useMemo(
    () => new Map((snapshot?.players ?? []).map((player) => [player.id, player])),
    [snapshot],
  );

  const alerts = useMemo(() => {
    if (!snapshot) return [];

    const watchedIds = [...snapshot.players]
      .sort((a, b) => b.selectedByPercent - a.selectedByPercent)
      .slice(0, WATCHLIST_SIZE)
      .map((player) => player.id);

    return generateAlerts({
      players: snapshot.players,
      watchedIds,
      event: snapshot.meta.nextEvent ?? snapshot.meta.currentEvent ?? 1,
      totalManagers: snapshot.meta.totalPlayers,
      now: new Date().toISOString(),
    });
  }, [snapshot]);

  if (error) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 p-8 text-center">
        <ServerCrash className="h-10 w-10 text-red-400" />
        <h1 className="text-sm font-black uppercase tracking-wide text-slate-200">
          No data snapshot found
        </h1>
        <p className="max-w-md text-xs leading-relaxed text-slate-500">{error}</p>
      </div>
    );
  }

  if (!snapshot) {
    return (
      <div className="flex min-h-screen items-center justify-center gap-2 text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span className="text-xs font-bold uppercase tracking-wider">Loading live FPL data…</span>
      </div>
    );
  }

  const { meta } = snapshot;
  const criticalCount = alerts.filter((alert) => alert.severity === 'CRITICAL').length;

  return (
    <div className="flex min-h-screen flex-col bg-slate-950 text-slate-100">
      <header className="sticky top-0 z-40 flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 bg-slate-900/90 px-6 py-3 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-purple-500/40 bg-fplPurple">
            <Shield className="h-5 w-5 text-emerald-400" />
          </div>
          <div>
            <h1 className="text-base font-black tracking-wide text-slate-100">
              FPL ASSISTANT MANAGER
            </h1>
            <p className="text-[11px] text-slate-500">
              Gameweek {meta.nextEvent ?? meta.currentEvent ?? '—'} · deadline in{' '}
              <span className="font-bold text-slate-300">{timeUntil(meta.nextDeadline)}</span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4 rounded-xl border border-slate-800 bg-slate-950/80 px-4 py-2">
          <Stat label="Players" value={String(snapshot.players.length)} />
          <Divider />
          <Stat label="Managers" value={`${(meta.totalPlayers / 1_000_000).toFixed(1)}m`} />
          <Divider />
          <Stat
            label="Needs attention"
            value={String(criticalCount)}
            tone={criticalCount > 0 ? 'alert' : 'ok'}
          />
        </div>
      </header>

      <nav className="flex gap-6 overflow-x-auto border-b border-slate-800 bg-slate-900/60 px-6">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`flex items-center gap-2 border-b-2 py-3 text-xs font-bold transition-colors ${
              tab === id
                ? 'border-emerald-400 text-emerald-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Icon className="h-4 w-4" />
            {label}
            {id === 'inbox' && criticalCount > 0 && (
              <span className="rounded-full bg-red-500 px-1.5 text-[10px] font-black text-slate-950">
                {criticalCount}
              </span>
            )}
          </button>
        ))}
      </nav>

      <main className="flex-1 p-6">
        {tab === 'inbox' && (
          <AlertInbox
            alerts={alerts}
            playersById={playersById}
            watchlistLabel={`top ${WATCHLIST_SIZE} owned`}
          />
        )}
        {tab === 'players' && <PlayerTable players={snapshot.players} />}
        {tab === 'fixtures' && (
          <FdrMatrix
            rows={snapshot.fdr.rows}
            fromEvent={snapshot.fdr.fromEvent}
            eventCount={snapshot.fdr.eventCount}
          />
        )}
      </main>

      <footer className="border-t border-slate-800 px-6 py-3 text-[10px] text-slate-600">
        Data from the official Fantasy Premier League API, ingested{' '}
        {new Date(meta.ingestedAt).toLocaleString()}. Not affiliated with or endorsed by the
        Premier League.
      </footer>
    </div>
  );
}

function Stat({
  label,
  value,
  tone = 'default',
}: {
  label: string;
  value: string;
  tone?: 'default' | 'ok' | 'alert';
}) {
  const toneClass =
    tone === 'alert' ? 'text-red-400' : tone === 'ok' ? 'text-emerald-400' : 'text-slate-200';

  return (
    <div className="text-right">
      <span className="block text-[9px] font-bold uppercase tracking-wider text-slate-500">
        {label}
      </span>
      <span className={`text-sm font-black ${toneClass}`}>{value}</span>
    </div>
  );
}

const Divider = () => <div className="h-6 w-px bg-slate-800" />;
