/**
 * Our own FPL API client. ~120 lines, zero runtime dependencies beyond zod.
 *
 * Responsibilities, in order of importance:
 *  1. Validate every response through a zod schema (the drift canary).
 *  2. Retry transient failures with exponential backoff + jitter.
 *  3. Identify ourselves honestly in the User-Agent and cache aggressively —
 *     this API is a free public good and we should not hammer it.
 */

import { z } from 'zod';
import { endpoints } from './endpoints';
import {
  bootstrapSchema,
  elementSummarySchema,
  entryPicksSchema,
  entrySchema,
  fixturesSchema,
  type RawBootstrap,
  type RawElementSummary,
  type RawEntry,
  type RawEntryPicks,
  type RawFixture,
} from './schemas';

const USER_AGENT =
  'fpl-ai-planner/2.0 (personal FPL assistant; +https://github.com/Redser06/fpl-ai-planner)';

const DEFAULT_TIMEOUT_MS = 20_000;
const DEFAULT_RETRIES = 3;

/** Thrown when the API returns a non-2xx status. */
export class FplHttpError extends Error {
  constructor(
    readonly status: number,
    readonly url: string,
  ) {
    super(`FPL API returned ${status} for ${url}`);
    this.name = 'FplHttpError';
  }

  /**
   * True for the specific, EXPECTED 404 on entry picks before a deadline.
   * Callers use this to fall back to the manual squad builder rather than
   * treating a normal pre-deadline state as a failure.
   */
  get isNotFound(): boolean {
    return this.status === 404;
  }
}

/** Thrown when the response parsed as JSON but did not match our schema. */
export class FplSchemaError extends Error {
  constructor(
    readonly url: string,
    readonly issues: z.ZodIssue[],
  ) {
    const summary = issues
      .slice(0, 5)
      .map((i) => `${i.path.join('.')}: ${i.message}`)
      .join('; ');
    super(`FPL API shape changed at ${url} — ${summary}`);
    this.name = 'FplSchemaError';
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** 5xx and 429 are worth retrying; 4xx (bar 429) will not change on a retry. */
function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

async function fetchJson(url: string, retries = DEFAULT_RETRIES): Promise<unknown> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) {
      // Exponential backoff with jitter, so parallel ingest workers don't
      // synchronise their retries into a thundering herd.
      const backoff = 2 ** attempt * 250 + Math.random() * 250;
      await sleep(backoff);
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

    try {
      const response = await fetch(url, {
        headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
        signal: controller.signal,
      });

      if (!response.ok) {
        const error = new FplHttpError(response.status, url);
        if (!isRetryableStatus(response.status)) throw error;
        lastError = error;
        continue;
      }

      return await response.json();
    } catch (error) {
      // A non-retryable HTTP error should propagate immediately.
      if (error instanceof FplHttpError && !isRetryableStatus(error.status)) throw error;
      lastError = error;
    } finally {
      clearTimeout(timeout);
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error(`FPL API request failed for ${url}: ${String(lastError)}`);
}

/**
 * Generic over the schema rather than its output type: several schemas
 * transform (string -> number), so input and output types differ and a plain
 * `ZodType<T>` cannot express them.
 */
async function fetchParsed<S extends z.ZodTypeAny>(url: string, schema: S): Promise<z.infer<S>> {
  const json = await fetchJson(url);
  const result = schema.safeParse(json);
  if (!result.success) throw new FplSchemaError(url, result.error.issues);
  return result.data;
}

export async function fetchBootstrap(): Promise<RawBootstrap> {
  return fetchParsed(endpoints.bootstrap(), bootstrapSchema);
}

export async function fetchFixtures(event?: number): Promise<RawFixture[]> {
  return fetchParsed(endpoints.fixtures(event), fixturesSchema);
}

export async function fetchElementSummary(playerId: number): Promise<RawElementSummary> {
  return fetchParsed(endpoints.elementSummary(playerId), elementSummarySchema);
}

export async function fetchEntry(entryId: number): Promise<RawEntry> {
  return fetchParsed(endpoints.entry(entryId), entrySchema);
}

/**
 * Returns null when picks are not yet public (the pre-deadline 404), so callers
 * can distinguish "not available yet" from "something broke".
 */
export async function fetchEntryPicks(
  entryId: number,
  event: number,
): Promise<RawEntryPicks | null> {
  try {
    return await fetchParsed(endpoints.entryPicks(entryId, event), entryPicksSchema);
  } catch (error) {
    if (error instanceof FplHttpError && error.isNotFound) return null;
    throw error;
  }
}

/**
 * Map over items with bounded concurrency.
 *
 * The nightly history ingest makes 584 element-summary calls; firing those in
 * parallel would be abusive and would get us rate-limited. Firing them
 * sequentially takes ~10 minutes. This keeps a small number in flight.
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;

  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await fn(items[index] as T, index);
    }
  });

  await Promise.all(workers);
  return results;
}
