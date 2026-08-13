/**
 * App shell.
 *
 * The assistant reasons about YOUR squad: alerts, captaincy and fixture
 * warnings are all scoped to the 15 players you actually own. Without a squad
 * it falls back to a most-owned watchlist, and says so.
 *
 * There is no hardcoded football data in this file. Everything is rendered from
 * the live snapshot in public/data/.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarDays, Inbox, Loader2, PenSquare, ServerCrash, Shield, Users } from 'lucide-react';

import { loadSnapshot, type Snapshot } from './data/snapshot';
import { clearSquad, loadHistory, loadSquad, saveSquad } from './data/squadStore';
import { generateAlerts } from '../shared/model/alerts';
import {
  applySwap,
  buildSquadFromIds,
  costSquad,
  deriveFormation,
  resolvePicks,
  startersOf,
} from '../shared/model/squad';
import type { Squad } from '../shared/types';
import { AlertInbox } from './components/AlertInbox';
import { FdrMatrix } from './components/FdrMatrix';
import { Pitch } from './components/Pitch';
import { PlayerTable } from './components/PlayerTable';
import { SquadBuilder } from './components/SquadBuilder';
import { SquadSummary } from './components/SquadSummary';
import { timeUntil } from './lib/format';

type Tab = 'inbox' | 'squad' | 'players' | 'fixtures';

const TABS: Array<{ id: Tab; label: string; icon: typeof Inbox }> = [
  { id: 'inbox', label: 'Assistant Manager', icon: Inbox },
  { id: 'squad', label: 'My Squad', icon: Shield },
  { id: 'players', label: 'Player Pool', icon: Users },
  { id: 'fixtures', label: 'Fixture Difficulty', icon: CalendarDays },
];

/**
 * Fallback watchlist when no squad exists yet: the most-owned players, as a
 * proxy for "players you probably own". 200 covers roughly everyone owned by
 * 1% of managers or more — narrower windows contain no flagged players at all.
 */
const WATCHLIST_SIZE = 200;

export default function App() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('inbox');
  const [squad, setSquad] = useState<Squad | null>(null);
  const [building, setBuilding] = useState(false);
  const [history] = useState(() => loadHistory());

  useEffect(() => {
    let cancelled = false;

    loadSnapshot()
      .then((data) => {
        if (cancelled) return;
        setSnapshot(data);
        setSquad(loadSquad());
      })
      .catch((cause: unknown) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : String(cause));
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const persist = useCallback((next: Squad) => {
    setSquad(next);
    saveSquad(next);
  }, []);

  const playersById = useMemo(
    () => new Map((snapshot?.players ?? []).map((player) => [player.id, player])),
    [snapshot],
  );

  const alerts = useMemo(() => {
    if (!snapshot) return [];

    const watchedIds = squad
      ? squad.picks.map((pick) => pick.playerId)
      : [...snapshot.players]
          .sort((a, b) => b.selectedByPercent - a.selectedByPercent)
          .slice(0, WATCHLIST_SIZE)
          .map((player) => player.id);

    return generateAlerts({
      players: snapshot.players,
      watchedIds,
      event: snapshot.meta.nextEvent ?? snapshot.meta.currentEvent ?? 1,
      totalManagers: snapshot.meta.totalPlayers,
      now: new Date().toISOString(),
      fdr: snapshot.fdr.rows,
      statsAreCarryover: snapshot.meta.statsSeason === 'PREVIOUS',
      ...(squad ? { squad: { picks: squad.picks, captainId: squad.captainId } } : {}),
    });
  }, [snapshot, squad]);

  const handleSwap = useCallback(
    (starterId: number, benchId: number) => {
      if (!squad || !snapshot) return;
      const picks = applySwap(starterId, benchId, squad.picks);
      if (!picks) return;

      persist({
        ...squad,
        picks,
        formation: deriveFormation(startersOf(resolvePicks(picks, snapshot.players))),
        updatedAt: new Date().toISOString(),
      });
    },
    [squad, snapshot, persist],
  );

  const handleSetCaptain = useCallback(
    (playerId: number) => {
      if (!squad) return;
      // Promote the outgoing captain to vice so the pair is never the same player.
      const viceCaptainId = playerId === squad.viceCaptainId ? squad.captainId : squad.viceCaptainId;

      persist({
        ...squad,
        captainId: playerId,
        viceCaptainId,
        picks: squad.picks.map((pick) => ({
          ...pick,
          isCaptain: pick.playerId === playerId,
          isViceCaptain: pick.playerId === viceCaptainId,
        })),
        updatedAt: new Date().toISOString(),
      });
    },
    [squad, persist],
  );

  const handleBuilt = useCallback(
    (playerIds: number[]) => {
      if (!snapshot) return;
      const built = buildSquadFromIds(playerIds, snapshot.players, snapshot.meta.rules);
      if (!built) return;
      persist(built);
      setBuilding(false);
      setTab('squad');
    },
    [snapshot, persist],
  );

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
  const costing = squad ? costSquad(squad.picks, snapshot.players, meta.rules) : null;
  const showLivePoints = meta.statsSeason === 'CURRENT' && meta.currentEvent !== null;

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

        <div className="flex items-center gap-3">
          {squad && (
            <button
              type="button"
              onClick={() => {
                clearSquad();
                setSquad(null);
                setBuilding(true);
                setTab('squad');
              }}
              className="flex items-center gap-1.5 rounded-lg border border-slate-700 px-3 py-1.5 text-[11px] font-bold text-slate-400 transition-colors hover:border-emerald-500/50 hover:text-emerald-300"
            >
              <PenSquare className="h-3.5 w-3.5" /> Rebuild squad
            </button>
          )}
          <div className="flex items-center gap-4 rounded-xl border border-slate-800 bg-slate-950/80 px-4 py-2">
            <Stat label="Players" value={String(snapshot.players.length)} />
            <Divider />
            <Stat
              label="Needs attention"
              value={String(criticalCount)}
              tone={criticalCount > 0 ? 'alert' : 'ok'}
            />
          </div>
        </div>
      </header>

      <nav className="flex gap-6 overflow-x-auto border-b border-slate-800 bg-slate-900/60 px-6">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`flex items-center gap-2 whitespace-nowrap border-b-2 py-3 text-xs font-bold transition-colors ${
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
            watchlistLabel={squad ? 'your squad' : `top ${WATCHLIST_SIZE} owned`}
          />
        )}

        {tab === 'squad' &&
          (building || !squad ? (
            <SquadBuilder
              players={snapshot.players}
              rules={meta.rules}
              onComplete={handleBuilt}
              onCancel={squad ? () => setBuilding(false) : null}
            />
          ) : (
            <div className="mx-auto flex w-full max-w-4xl flex-col gap-5">
              <SquadSummary
                picks={squad.picks}
                players={snapshot.players}
                meta={meta}
                history={history}
                squadValue={costing!.squadValue}
                bank={costing!.bank}
              />
              <Pitch
                picks={squad.picks}
                players={snapshot.players}
                rules={meta.rules}
                captainId={squad.captainId}
                viceCaptainId={squad.viceCaptainId}
                showLivePoints={showLivePoints}
                onSwap={handleSwap}
                onSetCaptain={handleSetCaptain}
              />
            </div>
          ))}

        {tab === 'players' && <PlayerTable players={snapshot.players} meta={meta} />}

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
