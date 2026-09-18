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
  entryPicksSchema,
  entrySchema,
  fixturesSchema,
  type RawBootstrap,
  type RawEntry,
  type RawEntryPicks,
  type RawFixture,
} from './schemas';

const HEADER_PROFILES: Record<string, string>[] = [
  // Profile 1: Official Mobile App (FPL iOS app - unblocked on Cloudflare)
  {
    'User-Agent': 'Premier-League/13.0 (iPhone; iOS 17.5.1; Scale/3.00)',
    Accept: 'application/json',
  },
  // Profile 2: Clean browser without spoofed Sec headers
  {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
    Accept: 'application/json, text/plain, */*',
    'Accept-Language': 'en-GB,en;q=0.9',
  },
  // Profile 3: Standard curl / python
  {
    'User-Agent': 'curl/8.7.1',
    Accept: '*/*',
  },
  // Profile 4: Explicit client tool
  {
    'User-Agent': 'fpl-ai-planner/2.0 (personal FPL assistant; +https://github.com/Redser06/fpl-ai-planner)',
    Accept: 'application/json',
  },
];

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

function isRetryableStatus(status: number): boolean {
  return status === 429 || (status >= 500 && status <= 599);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchJson(url: string, retries = DEFAULT_RETRIES): Promise<unknown> {
  let lastError: unknown;

  for (let profileIdx = 0; profileIdx < HEADER_PROFILES.length; profileIdx++) {
    const headers = HEADER_PROFILES[profileIdx]!;
    for (let attempt = 0; attempt <= retries; attempt++) {
      if (attempt > 0) {
        const backoff = 2 ** attempt * 250 + Math.random() * 250;
        await sleep(backoff);
      }

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

      try {
        const response = await fetch(url, {
          headers,
          signal: controller.signal,
        });

        if (!response.ok) {
          const bodyText = await response.text().catch(() => '');
          console.warn(`FPL API returned status ${response.status} with profile ${profileIdx} for ${url}. Response body: ${bodyText.slice(0, 500)}`);
          const error = new FplHttpError(response.status, url);
          if (response.status === 403) {
            // Break inner retry loop to try next header profile immediately
            lastError = error;
            break;
          }
          if (!isRetryableStatus(response.status)) throw error;
          lastError = error;
          continue;
        }

        return await response.json();
      } catch (error) {
        if (error instanceof FplHttpError && error.status === 403) {
          lastError = error;
          break;
        }
        if (error instanceof FplHttpError && !isRetryableStatus(error.status)) throw error;
        lastError = error;
      } finally {
        clearTimeout(timeout);
      }
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
 * Keeps a small number of calls in flight against the free public API: full
 * parallelism would be abusive and get us rate-limited, while a sequential
 * loop makes bulk fetches (hundreds of elements) take minutes.
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
