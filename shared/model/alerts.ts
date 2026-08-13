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

import type { Alert, Player } from '../types';

/**
 * Net transfer momentum (as a fraction of all managers) beyond which a price
 * change becomes likely. FPL's real thresholds are undisclosed and load-varying;
 * this is a heuristic, and is labelled as a risk rather than a certainty.
 */
const PRICE_MOMENTUM_THRESHOLD = 0.012;

interface AlertContext {
  /** The full player pool, used to find replacements. */
  players: readonly Player[];
  /** Players the user actually cares about (their squad, or a watchlist). */
  watchedIds: readonly number[];
  /** Gameweek the alerts concern. */
  event: number;
  /** Total FPL managers — the denominator for price momentum. */
  totalManagers: number;
  /** Injected so output is deterministic and testable. */
  now: string;
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
 * Generates the full alert feed, highest priority first.
 *
 * Rules implemented: availability, price-change risk.
 * Still to come (Phase 4): form slump, fixture swing, blank/double gameweek
 * detection, captaincy, chip windows.
 */
export function generateAlerts(context: AlertContext): Alert[] {
  return [...availabilityAlerts(context), ...priceChangeAlerts(context)].sort(
    (a, b) => b.priority - a.priority,
  );
}
