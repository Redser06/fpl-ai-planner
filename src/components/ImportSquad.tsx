/**
 * Import a squad into the assistant manager.
 *
 * Supports two ingestion modes:
 *  1. Paste from FPL: Paste the raw text directly from the FPL website (Pick Team,
 *     My Team, Transfers, or Points view). Automatically preserves the starting XI,
 *     gameweek formation (e.g. 3-5-2), and exact bench order without cutting to CSV.
 *  2. FPL Entry ID: Talks to the Cloud Function / proxy to import historical fielded
 *     picks once a deadline has passed.
 */

import { useMemo, useState } from 'react';
import {
  AlertCircle,
  Check,
  ClipboardPaste,
  CloudDownload,
  Loader2,
  Sparkles,
} from 'lucide-react';

import type { Player, Squad, SquadRules, Team } from '../../shared/types';
import { deriveFormation, resolvePicks, startersOf } from '../../shared/model/squad';
import { parseSquadFromText, type ParseSquadResult } from '../../shared/model/squadParser';
import { canImportSquad, importSquadFetch } from '../data/firebase';
import { loadEntryId, saveEntryId } from '../data/squadStore';
import { formatPrice } from '../lib/format';

const ENTRY_ID_PATTERN = /^\d+$/;

const EXAMPLE_PASTE = `Player
F\tGWP\tTP\tFix
Goalkeepers
Roefs, Sunderland
Roefs
Sunderland
GKP
3.5\t6\t7\t
BRE (A)
Brentford, Away
Defenders
Hall, Newcastle
Hall
Newcastle
DEF
7.0\t11\t14\t
BOU (H)
Bournemouth, Home
Guéhi, Man City
Guéhi
Man City
DEF
6.0\t2\t12\t
COV (H)
Coventry City, Home
Gabriel, Arsenal
Gabriel
Arsenal
DEF
6.5\t8\t13\t
CHE (H)
Chelsea, Home
Midfielders
Wilson, Leeds
Wilson
Leeds
MID
2.0\t1\t4\t
BHA (A)
Brighton, Away
Mbeumo, Man Utd
Mbeumo
Man Utd
MID
6.5\t11\t13\t
EVE (A)
Everton, Away
B.Fernandes, Man Utd
B.Fernandes
Man Utd
MID
12.5\t23\t25\t
EVE (A)
Everton, Away
Rogers, Chelsea
Rogers
Chelsea
MID
6.5\t5\t13\t
ARS (A)
Arsenal, Away
Cherki, Man City
Cherki
Man City
MID
11.0\t14\t22\t
COV (H)
Coventry City, Home
Forwards
Wissa, Newcastle
Wissa
Newcastle
FWD
6.0\t8\t12\t
BOU (H)
Bournemouth, Home
Šeško, Man Utd
Šeško
Man Utd
FWD
1.0\t1\t2\t
EVE (A)
Everton, Away
Substitutes
Dubravka, Spurs
Dubravka
Spurs
GKP
0.0\t0\t0\t
NFO (A)
Nott'm Forest, Away
Gyökeres, Arsenal
Gyökeres
Arsenal
FWD
0.0\t0\t0\t
CHE (H)
Chelsea, Home
Kayode, Brentford
Kayode
Brentford
DEF
7.5\t2\t15\t
SUN (H)
Sunderland, Home
Van Hecke, Spurs
Van Hecke
Spurs
DEF
1.0\t1\t2\t
NFO (A)
Nott'm Forest, Away`;

type Mode = 'paste' | 'id';

export function ImportSquad({
  players,
  teams,
  rules,
  onImported,
  onManual,
}: {
  players: Player[];
  teams: Team[];
  rules: SquadRules;
  /** Called with the fully derived squad, ready to persist and render. */
  onImported: (squad: Squad) => void;
  /** Called when the user chooses (or is steered to) the manual builder. */
  onManual: () => void;
}) {
  const [mode, setMode] = useState<Mode>('paste');

  // Paste mode state
  const [pastedText, setPastedText] = useState('');

  // ID mode state
  const remembered = loadEntryId();
  const [entryId, setEntryId] = useState(remembered ? String(remembered) : '');
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<{ heading: string; body: string } | null>(null);
  const configured = canImportSquad();

  const parseResult: ParseSquadResult | null = useMemo(() => {
    if (!pastedText.trim()) return null;
    return parseSquadFromText(pastedText, players, teams, rules);
  }, [pastedText, players, teams, rules]);

  function handleConfirmPaste() {
    if (parseResult && parseResult.success) {
      onImported(parseResult.squad);
    }
  }

  async function submitEntryId() {
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
      const result = await importSquadFetch(Number(trimmed));

      switch (result.status) {
        case 'OK': {
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
            body: 'FPL only publishes picks once the deadline has gone. Paste your squad directly using the "Paste from FPL" tab above, or build it manually.',
          });
          return;
        case 'SEASON_NOT_STARTED':
          setFailure({
            heading: 'The season has not started',
            body: 'No gameweek deadline has passed yet. Use "Paste from FPL" to import your squad instantly, or build it manually.',
          });
          return;
      }
    } catch (cause) {
      setFailure({
        heading: 'Import failed',
        body:
          cause instanceof Error
            ? cause.message
            : 'Something went wrong talking to the import service. Try again or paste your squad above.',
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-5 rounded-xl border border-slate-800 bg-slate-900/60 p-6 shadow-xl">
      <div className="flex items-start justify-between gap-3 border-b border-slate-800/80 pb-4">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-emerald-500/40 bg-emerald-950/60">
            <ClipboardPaste className="h-5 w-5 text-emerald-400" />
          </div>
          <div>
            <h2 className="text-sm font-black uppercase tracking-wide text-slate-100">
              Import your squad
            </h2>
            <p className="mt-1 text-xs leading-relaxed text-slate-400">
              Copy directly from Fantasy Premier League without formatting to CSV, or import via
              entry ID.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={onManual}
          className="rounded-lg border border-slate-700 px-3 py-1.5 text-[11px] font-bold text-slate-400 hover:border-slate-600 hover:text-slate-200"
        >
          Build manually
        </button>
      </div>

      {/* Mode Tabs */}
      <div className="flex rounded-lg border border-slate-800 bg-slate-950 p-1">
        <button
          type="button"
          onClick={() => setMode('paste')}
          className={`flex flex-1 items-center justify-center gap-2 rounded-md py-2 text-xs font-bold transition-all ${
            mode === 'paste'
              ? 'bg-emerald-500 text-slate-950 shadow'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Sparkles className="h-3.5 w-3.5" /> Paste from FPL (Instant)
        </button>
        <button
          type="button"
          onClick={() => setMode('id')}
          className={`flex flex-1 items-center justify-center gap-2 rounded-md py-2 text-xs font-bold transition-all ${
            mode === 'id'
              ? 'bg-emerald-500 text-slate-950 shadow'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <CloudDownload className="h-3.5 w-3.5" /> FPL Entry ID
        </button>
      </div>

      {mode === 'paste' && (
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <label htmlFor="fpl-paste-box" className="text-[10px] font-black uppercase tracking-wider text-slate-400">
              Paste team text from FPL website
            </label>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPastedText(EXAMPLE_PASTE)}
                className="text-[10px] font-bold text-emerald-400 underline underline-offset-2 hover:text-emerald-300"
              >
                Fill example squad
              </button>
              {pastedText && (
                <button
                  type="button"
                  onClick={() => setPastedText('')}
                  className="text-[10px] font-bold text-slate-500 hover:text-slate-300"
                >
                  Clear
                </button>
              )}
            </div>
          </div>

          <textarea
            id="fpl-paste-box"
            rows={7}
            value={pastedText}
            onChange={(e) => setPastedText(e.target.value)}
            placeholder={`Go to fantasy.premierleague.com, open "Pick Team", "My Team", or "Points", select all (Cmd+A / Ctrl+A) or copy your player list, and paste here...\n\nExample format:\nGoalkeepers\nRoefs, Sunderland\nDefenders\nHall, Newcastle\n...`}
            className="w-full rounded-xl border border-slate-700 bg-slate-950 p-3 font-mono text-xs text-slate-200 placeholder:text-slate-600 focus:border-emerald-500 focus:outline-none"
          />

          {/* Live Parse Results Preview */}
          {parseResult && (
            <div className="flex flex-col gap-3 rounded-xl border border-slate-800 bg-slate-950/70 p-4">
              {parseResult.success ? (
                <>
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
                    <div className="flex items-center gap-2">
                      <span className="flex items-center gap-1 rounded bg-emerald-500/20 px-2 py-0.5 text-xs font-black text-emerald-400">
                        <Check className="h-3 w-3" /> Formation {parseResult.formation}
                      </span>
                      <span className="text-xs text-slate-400">
                        Cost: <strong className="text-slate-200">{formatPrice(parseResult.squad.squadValue)}</strong> (Bank: {formatPrice(parseResult.squad.bank)})
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-xs">
                      <span className="text-slate-400">
                        (C) <strong className="text-emerald-300">{parseResult.captain.webName}</strong>
                      </span>
                      <span className="text-slate-400">
                        (V) <strong className="text-slate-300">{parseResult.viceCaptain.webName}</strong>
                      </span>
                    </div>
                  </div>

                  {/* Starting XI chips */}
                  <div>
                    <div className="mb-1.5 flex items-center justify-between">
                      <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">
                        Starting XI ({parseResult.formation})
                      </span>
                      <span className="text-[10px] font-bold text-emerald-400">11 players</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {parseResult.starters.map((p) => (
                        <span
                          key={p.id}
                          className="flex items-center gap-1 rounded border border-slate-800 bg-slate-900 px-2 py-1 text-xs text-slate-200"
                        >
                          <span className="text-[9px] font-bold uppercase text-slate-500">
                            {p.position}
                          </span>
                          <span className="font-bold">{p.webName}</span>
                          <span className="text-[10px] text-slate-500">{p.teamShort}</span>
                          {p.id === parseResult.captain.id && (
                            <span className="rounded bg-emerald-400 px-1 text-[9px] font-black text-slate-950">
                              C
                            </span>
                          )}
                          {p.id === parseResult.viceCaptain.id && (
                            <span className="rounded bg-slate-400 px-1 text-[9px] font-black text-slate-950">
                              V
                            </span>
                          )}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Bench preview */}
                  <div>
                    <div className="mb-1.5 flex items-center justify-between">
                      <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">
                        Substitutes (in exact order)
                      </span>
                      <span className="text-[10px] font-bold text-slate-400">4 players</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {parseResult.bench.map((p, index) => (
                        <span
                          key={p.id}
                          className="flex items-center gap-1 rounded border border-slate-800 bg-slate-900/60 px-2 py-1 text-xs text-slate-300"
                        >
                          <span className="rounded-full bg-slate-800 px-1.5 py-0.2 text-[9px] font-black text-slate-400">
                            {index === 0 ? 'GK' : index}
                          </span>
                          <span className="font-bold">{p.webName}</span>
                          <span className="text-[10px] text-slate-500">{p.teamShort}</span>
                        </span>
                      ))}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handleConfirmPaste}
                    className="mt-2 flex items-center justify-center gap-2 rounded-lg bg-emerald-500 py-2.5 text-xs font-black text-slate-950 shadow-md transition-transform hover:scale-[1.01] active:scale-[0.99]"
                  >
                    <Check className="h-4 w-4" /> Confirm & Load Squad ({parseResult.formation})
                  </button>
                </>
              ) : (
                <div className="flex flex-col gap-1.5 text-xs">
                  <div className="flex items-center gap-2 font-bold text-amber-400">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    <span>Could not complete squad parse</span>
                  </div>
                  <p className="text-slate-400">{parseResult.error}</p>
                  {parseResult.unmatchedNames && parseResult.unmatchedNames.length > 0 && (
                    <div className="mt-1 rounded bg-slate-900 p-2 font-mono text-[11px] text-amber-300">
                      Unmatched: {parseResult.unmatchedNames.join(', ')}
                    </div>
                  )}
                  {parseResult.validationErrors && (
                    <ul className="mt-1 list-disc pl-4 text-[11px] text-red-300">
                      {parseResult.validationErrors.map((err, i) => (
                        <li key={i}>{err}</li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          )}

          {!parseResult && (
            <div className="rounded-lg border border-slate-800/80 bg-slate-950/40 p-3 text-[11px] leading-relaxed text-slate-500">
              <strong className="font-bold text-slate-400">Tip:</strong> In Fantasy Premier League,
              press <kbd className="rounded border border-slate-700 bg-slate-900 px-1 py-0.5 text-slate-300">Cmd+A</kbd> or <kbd className="rounded border border-slate-700 bg-slate-900 px-1 py-0.5 text-slate-300">Ctrl+A</kbd> on your Pick Team screen and copy the entire page. Our parser automatically ignores page text and extracts only your squad.
            </div>
          )}
        </div>
      )}

      {mode === 'id' && (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void submitEntryId();
          }}
          className="flex flex-col gap-3"
        >
          {!configured && (
            <div className="rounded-lg border border-amber-500/40 bg-amber-950/40 p-3 text-xs leading-relaxed text-amber-200">
              This build cannot reach a backend or proxy URL. Use the "Paste from FPL" tab above to import your team without a backend.
            </div>
          )}

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
                onClick={() => setMode('paste')}
                className="mt-2 text-[11px] font-black uppercase tracking-wider text-emerald-400 underline underline-offset-2 hover:text-emerald-300"
              >
                Use "Paste from FPL" instead
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
          </div>
        </form>
      )}
    </div>
  );
}
