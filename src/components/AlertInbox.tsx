/**
 * The assistant manager's inbox — the landing surface and the actual product.
 *
 * Every alert is derived from real API fields and shows its own evidence, so a
 * user can always answer "why am I being told this?".
 */

import { useState } from 'react';
import { AlertTriangle, ChevronDown, ChevronRight, Inbox, ShieldCheck, TrendingDown, TrendingUp } from 'lucide-react';

import type { Alert, Player } from '../../shared/types';
import { formatPrice } from '../lib/format';

const SEVERITY_STYLES: Record<Alert['severity'], string> = {
  CRITICAL: 'border-l-red-500 bg-red-950/20',
  WARNING: 'border-l-amber-500 bg-amber-950/20',
  INFO: 'border-l-sky-500 bg-sky-950/20',
};

const SEVERITY_BADGE: Record<Alert['severity'], string> = {
  CRITICAL: 'bg-red-950 text-red-300 border-red-500/40',
  WARNING: 'bg-amber-950 text-amber-300 border-amber-500/40',
  INFO: 'bg-sky-950 text-sky-300 border-sky-500/40',
};

function AlertIcon({ type }: { type: Alert['type'] }) {
  if (type === 'PRICE_RISE') return <TrendingUp className="h-4 w-4 text-sky-400" />;
  if (type === 'PRICE_FALL') return <TrendingDown className="h-4 w-4 text-sky-400" />;
  return <AlertTriangle className="h-4 w-4 text-amber-400" />;
}

function AlertCard({
  alert,
  playersById,
}: {
  alert: Alert;
  playersById: Map<number, Player>;
}) {
  const [showEvidence, setShowEvidence] = useState(false);
  const replacement = alert.replacementId ? playersById.get(alert.replacementId) : null;
  const target = alert.targetId ? playersById.get(alert.targetId) : null;

  return (
    <div className={`rounded-xl border border-slate-800 border-l-4 p-4 ${SEVERITY_STYLES[alert.severity]}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2.5">
          <div className="mt-0.5">
            <AlertIcon type={alert.type} />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-100">{alert.title}</h3>
            <p className="mt-1 text-xs leading-relaxed text-slate-400">{alert.description}</p>
          </div>
        </div>
        <span
          className={`shrink-0 rounded border px-2 py-0.5 text-[10px] font-black uppercase tracking-wider ${SEVERITY_BADGE[alert.severity]}`}
        >
          {alert.severity}
        </span>
      </div>

      {replacement && target && (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-slate-800 bg-slate-950/60 p-2.5">
          <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">
            Suggested
          </span>
          <span className="text-xs text-slate-300">
            <span className="font-bold text-red-300">{target.webName}</span>
            <span className="text-slate-600"> → </span>
            <span className="font-bold text-emerald-300">{replacement.webName}</span>
          </span>
          <span className="text-[10px] text-slate-500">
            {formatPrice(replacement.price)} · {replacement.epNext.toFixed(1)} xP ·{' '}
            {replacement.teamShort}
          </span>
        </div>
      )}

      <button
        type="button"
        onClick={() => setShowEvidence((open) => !open)}
        className="mt-3 flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-slate-500 transition-colors hover:text-slate-300"
      >
        {showEvidence ? (
          <ChevronDown className="h-3 w-3" />
        ) : (
          <ChevronRight className="h-3 w-3" />
        )}
        Why am I seeing this?
      </button>

      {showEvidence && (
        <dl className="mt-2 space-y-1 rounded-lg border border-slate-800 bg-slate-950/80 p-2.5">
          {alert.evidence.map((item) => (
            <div key={item.field} className="flex justify-between gap-4 text-[11px]">
              <dt className="font-mono text-slate-500">{item.field}</dt>
              <dd className="text-right font-mono text-slate-300">
                {item.value === null ? '—' : String(item.value)}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}

export function AlertInbox({
  alerts,
  playersById,
  watchlistLabel,
}: {
  alerts: Alert[];
  playersById: Map<number, Player>;
  watchlistLabel: string;
}) {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
      <div className="flex items-center justify-between border-b border-slate-800 pb-3">
        <div className="flex items-center gap-2">
          <Inbox className="h-5 w-5 text-emerald-400" />
          <h2 className="text-sm font-black uppercase tracking-wide text-slate-100">
            Assistant Manager
          </h2>
        </div>
        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
          Watching {watchlistLabel}
        </span>
      </div>

      {alerts.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-slate-800 bg-slate-900/50 py-12 text-center">
          <ShieldCheck className="h-8 w-8 text-emerald-500" />
          <p className="text-sm font-bold text-slate-200">Nothing needs your attention.</p>
          <p className="max-w-sm text-xs text-slate-500">
            No availability or price risks detected across the players being watched. An empty
            inbox is a real result, not a placeholder.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {alerts.map((alert) => (
            <AlertCard key={alert.id} alert={alert} playersById={playersById} />
          ))}
        </div>
      )}
    </div>
  );
}
