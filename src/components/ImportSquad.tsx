/**
 * Import a squad from an FPL entry id.
 *
 * The FPL API sends no CORS headers, so a browser cannot fetch picks itself —
 * this talks to the `importSquad` Cloud Function, which imports the latest
 * gameweek whose deadline has passed (i.e. the squad the manager actually
 * fielded most recently). The result is resolved against the live player pool
 * client-side so the formation is real, then persisted.
 *
 * Every status gets honest copy: private squads and closed seasons are normal
 * states with a manual-builder path, not errors.
 */

import { useState } from 'react';
import { CloudDownload, Loader2 } from 'lucide-react';

import type { Player, Squad } from '../../shared/types';
import { deriveFormation, resolvePicks, startersOf } from '../../shared/model/squad';
import { callImportSquad, getFirebase } from '../data/firebase';
import { loadEntryId, saveEntryId } from '../data/squadStore';

const ENTRY_ID_PATTERN = /^\d+$/;

export function ImportSquad({
  players,
  onImported,
  onManual,
}: {
  players: Player[];
  /** Called with the fully derived squad, ready to persist and render. */
  onImported: (squad: Squad) => void;
  /** Called when the user chooses (or is steered to) the manual builder. */
  onManual: () => void;
}) {
  const remembered = loadEntryId();
  const [entryId, setEntryId] = useState(remembered ? String(remembered) : '');
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<{ heading: string; body: string } | null>(null);
  const configured = getFirebase() !== null;

  async function submit() {
    const trimmed = entryId.trim();
    if (!ENTRY_ID_PATTERN.test(trimmed)) {
      setFailure({
        heading: 'That is not an entry id',
        body: 'Your entry id is the number in the URL when you view your team on the FPL site — e.g. fantasy.premierleague.com/entry/1234567/…',
      });
      return;
    }

    setBusy(true);
    setFailure(null);

    try {
      const result = await callImportSquad(Number(trimmed));

      switch (result.status) {
        case 'OK': {
          // Formation arrives empty from the function (it has no player
          // positions); derive it here so the pitch and the label never disagree.
          const resolved = resolvePicks(result.squad.picks, players);
          const squad: Squad = {
            ...result.squad,
            formation: deriveFormation(startersOf(resolved)),
            source: 'IMPORTED',
          };
          saveEntryId(Number(trimmed));
          onImported(squad);
          return;
        }
        case 'PICKS_NOT_PUBLIC':
          setFailure({
            heading: `${result.entryName}'s squad is private until this gameweek's deadline passes`,
            body: 'FPL only publishes picks once the deadline has gone. Your most recent fielded squad will import once the season is under way — until then, build it manually and import after the first deadline.',
          });
          return;
        case 'SEASON_NOT_STARTED':
          setFailure({
            heading: 'The season has not started',
            body: 'No gameweek deadline has passed yet, so there is no public squad to import. Once gameweek 1 is done, importing will fetch the squad you fielded — until then, build it manually.',
          });
          return;
      }
    } catch (cause) {
      setFailure({
        heading: 'Import failed',
        body:
          cause instanceof Error
            ? cause.message
            : 'Something went wrong talking to the import service. Try again, or build the squad manually.',
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-5 rounded-xl border border-slate-800 bg-slate-900/60 p-6">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-emerald-500/40 bg-emerald-950/60">
          <CloudDownload className="h-5 w-5 text-emerald-400" />
        </div>
        <div>
          <h2 className="text-sm font-black uppercase tracking-wide text-slate-100">
            Import your squad
          </h2>
          <p className="mt-1 text-xs leading-relaxed text-slate-500">
            Enter your FPL entry id — the number in the URL when you view your team — and we will
            pull in the squad you last fielded.
          </p>
        </div>
      </div>

      {!configured && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-950/40 p-3 text-xs leading-relaxed text-amber-200">
          This build has no Firebase backend configured, so import cannot talk to the server. You
          can still build your squad manually.
        </div>
      )}

      <form
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
        className="flex flex-col gap-3"
      >
        <label className="flex flex-col gap-1.5">
          <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">
            FPL entry id
          </span>
          <input
            type="text"
            inputMode="numeric"
            autoComplete="off"
            spellCheck={false}
            placeholder="e.g. 1234567"
            value={entryId}
            onChange={(event) => setEntryId(event.target.value)}
            disabled={busy || !configured}
            className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm font-bold text-slate-100 placeholder:font-normal placeholder:text-slate-600 focus:border-emerald-500 focus:outline-none disabled:opacity-50"
          />
        </label>

        {failure && (
          <div className="rounded-lg border border-red-500/40 bg-red-950/40 p-3">
            <p className="text-xs font-bold text-red-200">{failure.heading}</p>
            <p className="mt-1 text-xs leading-relaxed text-red-300/80">{failure.body}</p>
            <button
              type="button"
              onClick={onManual}
              className="mt-2 text-[11px] font-black uppercase tracking-wider text-red-200 underline underline-offset-2 hover:text-red-100"
            >
              Build the squad manually instead
            </button>
          </div>
        )}

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={busy || !configured || entryId.trim().length === 0}
            className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-emerald-500 px-3 py-2 text-xs font-black text-slate-950 transition-opacity disabled:cursor-not-allowed disabled:opacity-30"
          >
            {busy ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Importing…
              </>
            ) : remembered ? (
              'Import again'
            ) : (
              'Import squad'
            )}
          </button>
          <button
            type="button"
            onClick={onManual}
            className="rounded-lg border border-slate-700 px-3 py-2 text-[11px] font-bold text-slate-400 hover:text-slate-200"
          >
            Build manually
          </button>
        </div>
      </form>
    </div>
  );
}
