/**
 * Firebase client initialisation — lazy, so the app works fully static (no
 * Firebase config, no auth) until a feature actually needs the backend.
 *
 * The only feature that does today is `importSquad`: the FPL API sends no CORS
 * headers, so a browser cannot fetch another manager's picks itself.
 */

import { getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import {
  getAuth,
  signInAnonymously,
  type Auth,
} from 'firebase/auth';
import { getFunctions, httpsCallable, type Functions } from 'firebase/functions';

import type { Squad } from '../../shared/types';

interface FirebaseWebConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  appId: string;
}

function readConfig(): FirebaseWebConfig | null {
  const apiKey = import.meta.env.VITE_FIREBASE_API_KEY as string | undefined;
  const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID as string | undefined;
  const appId = import.meta.env.VITE_FIREBASE_APP_ID as string | undefined;
  if (!apiKey || !projectId || !appId) return null;
  return {
    apiKey,
    projectId,
    appId,
    authDomain:
      (import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string | undefined) ??
      `${projectId}.firebaseapp.com`,
  };
}

let cached: { app: FirebaseApp; auth: Auth; functions: Functions } | null = null;

/** Null when the app has not been given a Firebase config — pure static mode. */
export function getFirebase(): { app: FirebaseApp; auth: Auth; functions: Functions } | null {
  if (cached) return cached;
  const config = readConfig();
  if (!config) return null;

  const app = getApps()[0] ?? initializeApp(config);
  const auth = getAuth(app);
  const functions = getFunctions(app, 'europe-west2');
  cached = { app, auth, functions };
  return cached;
}

/** Anonymous session: enough for the callable's auth check, zero friction. */
async function ensureSignedIn(auth: Auth): Promise<void> {
  if (auth.currentUser) return;
  await signInAnonymously(auth);
}

export type ImportSquadResult =
  | { status: 'OK'; entryName: string; squad: Squad }
  | { status: 'PICKS_NOT_PUBLIC'; entryName: string }
  | { status: 'SEASON_NOT_STARTED' };

/**
 * URL of the read-only fetchSquadPublic proxy (same region). Set at build time
 * via VITE_SQUAD_PROXY_URL; when unset it is derived from the hosting origin so
 * a firebase.json rewrite to /api/squad picks it up, else it stays unset and
 * the callable is the only path.
 */
function proxyUrl(): string | null {
  const explicit = import.meta.env.VITE_SQUAD_PROXY_URL as string | undefined;
  if (explicit) return explicit;
  // Hosted build: relative URL hits the firebase.json rewrite. Dev server has
  // no rewrite, so there is no proxy URL to derive — return null there.
  if (typeof window !== 'undefined' && !import.meta.env.DEV) return '/api/squad';
  return null;
}

/** Parses a JSON body, or null when the response is not JSON (e.g. the SPA fallback page). */
async function jsonOrNull(response: Response): Promise<Record<string, unknown> | null> {
  if (!response.headers.get('content-type')?.includes('application/json')) return null;
  try {
    const body: unknown = await response.json();
    return body && typeof body === 'object' ? (body as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/**
 * The squad snapshot written by `npm run snapshot` for the entry ids it was
 * configured with. Refreshed with the data snapshot, so it can be hours old.
 */
async function loadStaticSquad(entryId: number): Promise<ImportSquadResult | null> {
  try {
    const response = await fetch(`${import.meta.env.BASE_URL}data/squads/${entryId}.json`);
    if (!response.ok) return null;
    const body = await jsonOrNull(response);
    return body && 'status' in body ? (body as unknown as ImportSquadResult) : null;
  } catch {
    return null;
  }
}

const PASTE_HINT = 'Use the "Paste from FPL" tab to import your squad without a backend.';

/**
 * Read-only live import via the HTTP proxy. Used when there is no Firebase
 * config in this build. Falls back to the static squad snapshot only when the
 * live path cannot answer, so a snapshot never shadows fresher live data.
 */
export async function callFetchSquadPublic(entryId: number): Promise<ImportSquadResult> {
  const base = proxyUrl();
  if (!base) {
    const snapshot = await loadStaticSquad(entryId);
    if (snapshot) return snapshot;
    throw new Error(
      'No squad proxy URL in this build — set VITE_SQUAD_PROXY_URL or deploy the backend.',
    );
  }

  let response: Response;
  try {
    response = await fetch(`${base}?entryId=${entryId}`, {
      headers: { accept: 'application/json' },
    });
  } catch {
    const snapshot = await loadStaticSquad(entryId);
    if (snapshot) return snapshot;
    throw new Error(`Could not reach the squad import service. ${PASTE_HINT}`);
  }

  const body = await jsonOrNull(response);
  if (response.ok && body && 'status' in body) return body as unknown as ImportSquadResult;

  if (body?.code === 'ENTRY_NOT_FOUND') {
    throw new Error(`No FPL team has entry id ${entryId}. Check the number in your team's URL.`);
  }
  if (response.status === 400 || response.status === 429) {
    throw new Error(typeof body?.error === 'string' ? body.error : `Request rejected (HTTP ${response.status}).`);
  }

  // Live path could not answer: the proxy is not deployed, or FPL refused it.
  const snapshot = await loadStaticSquad(entryId);
  if (snapshot) return snapshot;

  if (body?.code === 'UPSTREAM_FAILED') {
    throw new Error(`The FPL API did not answer the import service's request. ${PASTE_HINT}`);
  }
  if (response.status === 404 || !body) {
    throw new Error(`The squad import service is not deployed for this site. ${PASTE_HINT}`);
  }
  throw new Error(`Squad import failed (HTTP ${response.status}).`);
}

/**
 * True when THIS build can serve a live import — either the callable (Firebase
 * configured) or the read-only HTTP proxy (proxy URL derivable). Drives the
 * ImportSquad panel's availability: unconfigured static builds are the only
 * ones that genuinely cannot import.
 */
export function canImportSquad(): boolean {
  return getFirebase() !== null || proxyUrl() !== null;
}

/**
 * Imports a manager's squad, preferring the callable when this build has a
 * Firebase config (it also persists the squad), else the read-only HTTP proxy.
 * Both return the same ImportSquadResult, so the caller needs no per-path fork.
 */
export async function importSquadFetch(entryId: number): Promise<ImportSquadResult> {
  if (getFirebase()) return callImportSquad(entryId);
  return callFetchSquadPublic(entryId);
}

/**
 * Calls the importSquad Cloud Function. Throws when the backend has not been
 * configured or the call fails — the caller renders that honestly.
 */
export async function callImportSquad(entryId: number): Promise<ImportSquadResult> {
  const firebase = getFirebase();
  if (!firebase) {
    throw new Error(
      'No Firebase config in this build — squad import needs the deployed backend.',
    );
  }

  await ensureSignedIn(firebase.auth);
  const callable = httpsCallable<{ entryId: number }, ImportSquadResult>(
    firebase.functions,
    'importSquad',
  );
  const result = await callable({ entryId });
  return result.data;
}
