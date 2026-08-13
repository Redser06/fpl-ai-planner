# FPL Assistant Manager

An assistant manager that watches your Fantasy Premier League squad and tells you the few things
that matter before the deadline — each with the evidence behind it.

Not a dashboard you have to remember to visit. An inbox that comes to you.

---

## Why this exists

Expected points, fixture heatmaps and transfer suggestions are table stakes — Fantasy Football Fix,
Fantasy Football Hub and FPL Review all ship them, with better models and years of data. Competing
on "AI xP planner" is a losing pitch.

What none of them do well is the **Football Manager assistant-manager inbox**: a proactive,
deadline-timed feed with a one-click fix attached to each item. That is what this is built around.

Two rules the codebase enforces:

1. **Every alert cites its source.** Each one carries the raw API fields it was derived from, shown
   under "Why am I seeing this?". Trust in a stats product is binary — one wrong alert and it's gone.
2. **No alert is ever invented.** If the data doesn't support a rule firing, nothing fires. An empty
   inbox is a valid, honest state.

---

## Status

| Area | State |
|---|---|
| Real FPL data ingest (players, teams, fixtures, gameweeks) | ✅ Done |
| Schema validation + drift tests against recorded live responses | ✅ Done |
| Real 20-team fixture difficulty matrix, with blank/double detection | ✅ Done |
| Alert engine: availability (injury/suspension/departure) + price-change risk | ✅ Done |
| Cloud Functions: scheduled ingest, Firestore rules, squad import | ✅ Written, **not yet deployed** |
| Manual squad builder + team-id import UI | ⛔ Next (see Roadmap) |
| Expected-points model, optimiser, multi-GW planner | ⛔ Not started |
| LLM narration of alerts | ⛔ Not started |

**42 tests passing.** Everything above marked done is verified against real, recorded API responses.

---

## Quick start

```bash
npm install
npm run snapshot   # fetches live FPL data into public/data/ — required before first run
npm run dev
```

`npm run snapshot` is not optional: the app renders entirely from that data and will show a clear
error without it. Re-run it whenever you want fresh prices and injury news.

```bash
npm run typecheck  # tsc --noEmit across app, functions, scripts and tests
npm test           # 42 tests against recorded API fixtures
npm run build      # typecheck + production build
```

---

## Architecture

```
FPL API ──► fpl/client.ts ──► zod schemas ──► transform ──► slim projections
            (retry, timeout,   (trust          (pure,        (~30 of 105 fields)
             identifying UA)    boundary)       testable)
                                                   │
                        ┌──────────────────────────┴──────────────────────────┐
                        ▼                                                     ▼
              scripts/snapshot.ts                            functions/src/index.ts
              static JSON → public/data/                     scheduled ingest → Firestore
              (free hosting, no backend)                     (per-user squads, alerts)
                        │                                                     │
                        └──────────────────────► React SPA ◄──────────────────┘
```

Both paths run **the same** ingest and transform code, so they cannot drift apart.

### Key files

| Path | Purpose |
|---|---|
| `shared/types.ts` | The contract between backend and SPA. Single source of truth. |
| `shared/model/alerts.ts` | The alert rules engine. Pure, deterministic, no I/O. |
| `functions/src/fpl/endpoints.ts` | Every FPL endpoint we use, documented. |
| `functions/src/fpl/schemas.ts` | Zod schemas — the trust boundary against API drift. |
| `functions/src/fpl/client.ts` | Our own API client: retry, backoff, timeout, validation. |
| `functions/src/ingest/transform.ts` | Raw API → slim projections, and the FDR matrix builder. |
| `functions/src/ingest/store.ts` | Chunked Firestore writers (quota-aware). |
| `functions/src/index.ts` | Scheduled ingest + callable squad import. |
| `scripts/snapshot.ts` | Static data snapshot for the zero-cost hosting path. |
| `firestore.rules` | All client writes denied; user data scoped to its owner. |

---

## Data source

We call the **official FPL API directly** (`fantasy.premierleague.com/api`) through our own client.

We deliberately do **not** depend on the `fpl-api` npm package. It was last published in 2022, has a
single maintainer and ~86 downloads/month, pulls in `superagent` to do what `fetch` does natively,
and its self-described "95% accurate" types predate every schema change since — the live `elements`
object now carries 105 fields including `defensive_contribution` and `scout_risks`. It is a thin
wrapper over eight public URLs, so there is no value on the other side of that supply-chain risk.
Its README was, however, a useful map of the endpoint list.

### Things the API does that will bite you

- **No CORS headers.** A browser cannot call this API from your own origin. This is the whole reason
  a server-side component exists.
- **`bootstrap-static` is ~1.4 MB and `cache-control: no-store`.** Never fetch it per user request.
- **Squads are private before a deadline.** `/entry/{id}/event/{gw}/picks/` returns **404** until the
  gameweek deadline passes, which is why a manual squad builder is required rather than optional.
- **Numeric types are inconsistent.** Season totals are strings (`"0.00"`), per-90 rates are numbers,
  `ep_next` is a string. The zod schemas normalise all of it; getting it wrong silently corrupts the
  model's inputs.
- **Pre-season resets.** `transfers_in_event` / `transfers_out_event` are zeroed before GW1, so
  price-change alerts correctly produce nothing until the season starts.

---

## Deploying

### Option A — free, no backend (recommended to start)

```bash
npm run snapshot && npm run build
npx firebase-tools deploy --only hosting
```

Re-run to refresh data. A scheduled GitHub Action doing exactly this is a complete, zero-cost
production setup for a personal tool.

### Option B — with the Cloud Functions backend

Needs a Firebase project on the **Blaze** plan (scheduled functions require it). Not yet done:

```bash
npx firebase-tools use --add          # link a project — no .firebaserc exists yet
cd functions && npm install && npm run build && cd ..
npx firebase-tools deploy --only functions,firestore:rules,hosting
```

Then call the `ingestNow` callable once to populate Firestore rather than waiting for the schedule.

---

## Roadmap

1. **Squad ingress** — manual builder (real budget, position quotas and 3-per-club limit, all read
   from live `game_settings`), plus team-id import once deadlines start passing.
2. **Expected points model** — minutes probability × fixture-adjusted per-90 returns + clean-sheet
   and defensive-contribution terms, blending last season's `history_past` into current form.
   Baseline it against FPL's own `ep_next`; if it can't beat that, say so.
3. **More alert rules** — form slump, fixture swing, blank/double gameweek, captaincy, chip windows.
4. **Deadline delivery** — push/email at T-24h and T-2h. This is what makes it a habit.
5. **LLM narration** — Gemini rewrites alert prose only, never the numbers.

---

## Attribution

Data from the official Fantasy Premier League API. This project is not affiliated with, endorsed by,
or connected to the Premier League.

## License

MIT
