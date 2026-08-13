/**
 * The alert rules engine.
 *
 * This is the product. Everything else — the pitch view, the FDR matrix, the
 * comparison tools — is supporting evidence for what comes out of here.
 *
 * Two non-negotiable properties:
 *
 *  1. EVERY alert cites the raw API field it was derived from, in `evidence`.
 *     An alert a user cannot verify is an alert that destroys trust the first
 *     time it is wrong, and trust in this product is binary.
 *
 *  2. NO alert is ever invented. If the data does not support a rule firing,
 *     nothing fires. An empty inbox is a valid, honest state.
 *
 * These are pure functions over already-transformed data: no I/O, no LLM, no
 * randomness. The LLM (Phase 4) may only rewrite `title`/`description` prose
 * over these objects — it may never produce a number or invent an alert.
 */

import type { Alert, FdrRow, Player, SquadPick } from '../types';
import { compareForCaptaincy, resolvePicks, startersOf } from './squad';

/**
 * Net transfer momentum (as a fraction of all managers) beyond which a price
 * change becomes likely. FPL's real thresholds are undisclosed and load-varying;
 * this is a heuristic, and is labelled as a risk rather than a certainty.
 */
const PRICE_MOMENTUM_THRESHOLD = 0.012;

/**
 * A player's form is judged against their own scoring rate, not an absolute
 * number — a 4.0 form is a slump for a premium and a purple patch for a £4.5m
 * defender. Fire when form drops to this fraction of season points-per-game.
 */
const FORM_SLUMP_RATIO = 0.6;

/** Minimum points-per-game before a form judgement is worth making at all. */
const FORM_MIN_BASELINE = 3;

/** Average FDR over the horizon above/below which a fixture run is remarkable. */
const FIXTURE_HARD_THRESHOLD = 3.8;
const FIXTURE_EASY_THRESHOLD = 2.2;

export interface AlertContext {
  /** The full player pool, used to find replacements. */
  players: readonly Player[];
  /** Players the user actually cares about — their squad, or a watchlist. */
  watchedIds: readonly number[];
  /** Gameweek the alerts concern. */
  event: number;
  /** Total FPL managers — the denominator for price momentum. */
  totalManagers: number;
  /** Injected so output is deterministic and testable. */
  now: string;

  /**
   * The user's actual squad. When present, the assistant can reason about
   * things that only make sense for a real team — most importantly captaincy.
   */
  squad?: {
    picks: readonly SquadPick[];
    captainId: number;
  };

  /** Fixture difficulty rows, keyed lookup built internally. Enables fixture swings. */
  fdr?: readonly FdrRow[];

  /**
   * Whether player stat totals describe the previous season. Form rules are
   * meaningless against carryover stats, so they stand down when this is true.
   */
  statsAreCarryover?: boolean;
}

/**
 * Finds the best available replacement for a player: same position, within a
 * small price band, ranked by expected points.
 *
 * This is what the prototype's three hardcoded "AI OPTIMIZER" cards pretended
 * to do. It is deliberately simple and explainable — a full optimiser over
 * budget and squad legality is Phase 3.
 */
export function findReplacement(
  player: Player,
  players: readonly Player[],
  priceBand = 0.5,
): Player | null {
  const candidates = players.filter(
    (candidate) =>
      candidate.id !== player.id &&
      candidate.position === player.position &&
      candidate.availability === 'AVAILABLE' &&
      candidate.price <= player.price + priceBand &&
      // Require some evidence of playing time or a real projection, so we never
      // recommend a bench-warmer purely because he is cheap.
      (candidate.epNext > 0 || candidate.minutes > 0),
  );

  if (candidates.length === 0) return null;

  return candidates.reduce((best, candidate) =>
    candidate.epNext > best.epNext ? candidate : best,
  );
}

/**
 * Availability alerts — injuries, suspensions, departures.
 *
 * Severity is driven by FPL's own `chance_of_playing_next_round` rather than by
 * our judgement, so the alert can always be justified from the source data.
 */
function availabilityAlerts(context: AlertContext): Alert[] {
  const byId = new Map(context.players.map((player) => [player.id, player]));
  const alerts: Alert[] = [];

  for (const id of context.watchedIds) {
    const player = byId.get(id);
    if (!player || player.availability === 'AVAILABLE') continue;

    const chance = player.chanceOfPlayingNextRound;

    // 0% or no stated chance for an injured/suspended player is critical;
    // a stated 50% or less is critical; 75% is a warning.
    const severity: Alert['severity'] =
      chance === null ? 'WARNING' : chance <= 50 ? 'CRITICAL' : 'WARNING';

    const type: Alert['type'] = player.availability === 'SUSPENDED' ? 'SUSPENSION' : 'INJURY';

    const replacement = findReplacement(player, context.players);

    alerts.push({
      id: `availability-${player.id}-${context.event}`,
      severity,
      type,
      title: `${player.webName} (${player.teamShort}) — ${player.availability.toLowerCase()}`,
      description:
        player.news.trim().length > 0
          ? player.news.trim()
          : `Flagged as ${player.availability.toLowerCase()} with no further detail from FPL.`,
      actionLabel: replacement ? `Swap for ${replacement.webName}` : null,
      targetId: player.id,
      replacementId: replacement?.id ?? null,
      event: context.event,
      evidence: [
        { field: 'status', value: player.availability },
        { field: 'chance_of_playing_next_round', value: chance },
        { field: 'news', value: player.news || null },
      ],
      // 0% chance sorts above 75% chance.
      priority: severity === 'CRITICAL' ? 100 - (chance ?? 0) : 50 - (chance ?? 0) / 10,
      createdAt: context.now,
    });
  }

  return alerts;
}

/**
 * Price-change risk from net transfer momentum.
 *
 * Note: this correctly produces NOTHING in pre-season, because FPL resets
 * `transfers_in_event` / `transfers_out_event` to zero before the first
 * deadline. That is the rule behaving properly, not a bug.
 */
function priceChangeAlerts(context: AlertContext): Alert[] {
  const byId = new Map(context.players.map((player) => [player.id, player]));
  const alerts: Alert[] = [];

  if (context.totalManagers <= 0) return alerts;

  for (const id of context.watchedIds) {
    const player = byId.get(id);
    if (!player) continue;

    const net = player.transfersInEvent - player.transfersOutEvent;
    const momentum = net / context.totalManagers;
    if (Math.abs(momentum) < PRICE_MOMENTUM_THRESHOLD) continue;

    const rising = momentum > 0;

    alerts.push({
      id: `price-${player.id}-${context.event}`,
      severity: 'INFO',
      type: rising ? 'PRICE_RISE' : 'PRICE_FALL',
      title: `${player.webName} (${player.teamShort}) is likely to ${rising ? 'rise' : 'fall'} in price`,
      description: rising
        ? `Net ${net.toLocaleString()} transfers in this gameweek. Buying before the rise preserves team value.`
        : `Net ${Math.abs(net).toLocaleString()} transfers out this gameweek. Selling before the fall preserves team value.`,
      actionLabel: null,
      targetId: player.id,
      replacementId: null,
      event: context.event,
      evidence: [
        { field: 'transfers_in_event', value: player.transfersInEvent },
        { field: 'transfers_out_event', value: player.transfersOutEvent },
        { field: 'net_transfer_momentum', value: momentum.toFixed(5) },
      ],
      priority: 30 + Math.abs(momentum) * 100,
      createdAt: context.now,
    });
  }

  return alerts;
}

/**
 * Captaincy — the single highest-leverage decision of the gameweek, since the
 * armband doubles a score. Only fires when the current captain is not the
 * squad's best expected scorer, and only for players who can actually play.
 */
function captaincyAlerts(context: AlertContext): Alert[] {
  if (!context.squad) return [];

  const starters = startersOf(resolvePicks(context.squad.picks, context.players)).filter(
    (entry) => entry.player.availability === 'AVAILABLE',
  );
  if (starters.length === 0) return [];

  // Same ranking the squad builder uses, so the assistant never contradicts
  // the default it set — and never suggests captaining a goalkeeper.
  const best = [...starters].sort((a, b) => compareForCaptaincy(a.player, b.player))[0]!.player;

  const current = context.players.find((player) => player.id === context.squad!.captainId);
  if (!current || current.id === best.id) return [];

  const gain = best.epNext - current.epNext;
  // Ignore noise — a captaincy switch has to be worth actually making.
  if (gain < 0.5) return [];

  return [
    {
      id: `captaincy-${best.id}-${context.event}`,
      severity: 'WARNING',
      type: 'CAPTAINCY',
      title: `Captain ${best.webName}, not ${current.webName}`,
      description: `${best.webName} (${best.teamShort}) projects ${best.epNext.toFixed(1)} xP against ${current.webName}'s ${current.epNext.toFixed(1)}. The armband doubles it, so this is worth roughly ${(gain * 2).toFixed(1)} points.`,
      actionLabel: `Give ${best.webName} the armband`,
      targetId: current.id,
      replacementId: best.id,
      event: context.event,
      evidence: [
        { field: `ep_next (${best.webName})`, value: best.epNext },
        { field: `ep_next (${current.webName})`, value: current.epNext },
        { field: 'status', value: best.availability },
      ],
      priority: 70 + gain,
      createdAt: context.now,
    },
  ];
}

/**
 * Form slump — a player scoring well below their own established rate.
 *
 * Judged relative to the player's season points-per-game rather than an
 * absolute threshold, and stood down entirely when the stat block is last
 * season's carryover, where "form" would be comparing against nothing.
 */
function formSlumpAlerts(context: AlertContext): Alert[] {
  if (context.statsAreCarryover) return [];

  const byId = new Map(context.players.map((player) => [player.id, player]));
  const alerts: Alert[] = [];

  for (const id of context.watchedIds) {
    const player = byId.get(id);
    if (!player || player.availability !== 'AVAILABLE') continue;
    if (player.pointsPerGame < FORM_MIN_BASELINE) continue;
    if (player.form >= player.pointsPerGame * FORM_SLUMP_RATIO) continue;

    const replacement = findReplacement(player, context.players);

    alerts.push({
      id: `form-${player.id}-${context.event}`,
      severity: 'INFO',
      type: 'FORM_SLUMP',
      title: `${player.webName} (${player.teamShort}) is out of form`,
      description: `Form of ${player.form.toFixed(1)} against a season average of ${player.pointsPerGame.toFixed(1)} points per game.`,
      actionLabel: replacement ? `Consider ${replacement.webName}` : null,
      targetId: player.id,
      replacementId: replacement?.id ?? null,
      event: context.event,
      evidence: [
        { field: 'form', value: player.form },
        { field: 'points_per_game', value: player.pointsPerGame },
        { field: 'expected_goal_involvements_per_90', value: player.xGIPer90 },
      ],
      priority: 40 + (player.pointsPerGame - player.form),
      createdAt: context.now,
    });
  }

  return alerts;
}

/**
 * Fixture swings — a watched player's club entering a notably hard or easy run.
 *
 * Blank gameweeks are excluded from the average rather than counted as zero,
 * which would make a blank look like the easiest fixture possible.
 */
function fixtureSwingAlerts(context: AlertContext): Alert[] {
  if (!context.fdr || context.fdr.length === 0) return [];

  const fdrByTeam = new Map(context.fdr.map((row) => [row.teamId, row]));
  const byId = new Map(context.players.map((player) => [player.id, player]));
  const alerts: Alert[] = [];
  const seenTeams = new Set<number>();

  for (const id of context.watchedIds) {
    const player = byId.get(id);
    if (!player || seenTeams.has(player.teamId)) continue;

    const row = fdrByTeam.get(player.teamId);
    if (!row) continue;

    const difficulties = row.cells
      .map((cell) => cell.averageDifficulty)
      .filter((value): value is number => value !== null);
    if (difficulties.length === 0) continue;

    const mean = difficulties.reduce((sum, value) => sum + value, 0) / difficulties.length;
    const hard = mean >= FIXTURE_HARD_THRESHOLD;
    const easy = mean <= FIXTURE_EASY_THRESHOLD;
    if (!hard && !easy) continue;

    seenTeams.add(player.teamId);

    const run = row.cells
      .slice(0, 5)
      .map((cell) =>
        cell.isBlank
          ? 'BLANK'
          : cell.opponents
              .map((o) => `${o.opponentShort}${o.isHome ? '(H)' : '(A)'}`)
              .join('+'),
      )
      .join(', ');

    alerts.push({
      id: `fixtures-${row.teamId}-${context.event}`,
      severity: 'INFO',
      type: 'FIXTURE_SWING',
      title: `${row.teamName} have a ${hard ? 'difficult' : 'favourable'} run`,
      description: `Average difficulty ${mean.toFixed(1)} over the next ${difficulties.length} gameweeks: ${run}.`,
      actionLabel: null,
      targetId: player.id,
      replacementId: null,
      event: context.event,
      evidence: [
        { field: 'team_fixture_difficulty_mean', value: mean.toFixed(2) },
        { field: 'gameweeks_assessed', value: difficulties.length },
      ],
      priority: hard ? 35 + mean : 25 + (5 - mean),
      createdAt: context.now,
    });
  }

  return alerts;
}

/**
 * Blank and double gameweek detection, straight from the fixture list.
 *
 * The prototype faked this by declaring all of its teams blank in the same
 * gameweek — which cannot happen. Here it is simply counted.
 */
function gameweekShapeAlerts(context: AlertContext): Alert[] {
  if (!context.fdr || context.fdr.length === 0) return [];

  const byId = new Map(context.players.map((player) => [player.id, player]));
  const watchedTeams = new Set<number>();
  for (const id of context.watchedIds) {
    const player = byId.get(id);
    if (player) watchedTeams.add(player.teamId);
  }

  const alerts: Alert[] = [];

  for (const row of context.fdr) {
    if (!watchedTeams.has(row.teamId)) continue;

    for (const cell of row.cells) {
      if (!cell.isBlank && !cell.isDouble) continue;

      alerts.push({
        id: `${cell.isDouble ? 'dgw' : 'bgw'}-${row.teamId}-${cell.event}`,
        severity: cell.isBlank ? 'WARNING' : 'INFO',
        type: cell.isBlank ? 'BLANK_GW' : 'DOUBLE_GW',
        title: cell.isBlank
          ? `${row.teamName} blank in GW${cell.event}`
          : `${row.teamName} play twice in GW${cell.event}`,
        description: cell.isBlank
          ? `${row.teamName} have no fixture in gameweek ${cell.event}. Your players from that club will score nothing.`
          : `${row.teamName} play ${cell.opponents.map((o) => `${o.opponentShort} (${o.isHome ? 'H' : 'A'})`).join(' and ')} in gameweek ${cell.event}.`,
        actionLabel: null,
        targetId: null,
        replacementId: null,
        event: cell.event,
        evidence: [
          { field: 'fixture_count', value: cell.opponents.length },
          { field: 'gameweek', value: cell.event },
        ],
        // Nearer gameweeks matter more.
        priority: (cell.isBlank ? 60 : 45) - (cell.event - context.event),
        createdAt: context.now,
      });
    }
  }

  return alerts;
}

/**
 * Generates the full alert feed, highest priority first.
 *
 * Rules: availability, captaincy, blank/double gameweek, form slump, fixture
 * swing, price-change risk. Rules that the current data cannot support simply
 * produce nothing.
 */
export function generateAlerts(context: AlertContext): Alert[] {
  return [
    ...availabilityAlerts(context),
    ...captaincyAlerts(context),
    ...gameweekShapeAlerts(context),
    ...formSlumpAlerts(context),
    ...fixtureSwingAlerts(context),
    ...priceChangeAlerts(context),
  ].sort((a, b) => b.priority - a.priority);
}
