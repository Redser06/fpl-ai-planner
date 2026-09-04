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

/**
 * Read-only live import via the HTTP proxy. Used when there is no Firebase
 * config in this build. Throws honestly when no proxy URL is available.
 */
export async function callFetchSquadPublic(entryId: number): Promise<ImportSquadResult> {
  const base = proxyUrl();
  if (!base) {
    throw new Error(
      'No squad proxy URL in this build — set VITE_SQUAD_PROXY_URL or deploy the backend.',
    );
  }
  const response = await fetch(`${base}?entryId=${entryId}`, { headers: { accept: 'application/json' } });
  if (!response.ok) {
    if (response.status === 404) {
      throw new Error(
        'Live Entry ID import is unavailable because Cloud Functions are not deployed on this Firebase project (requires Blaze plan). Please use the "Paste from FPL (Instant)" tab to import your current squad with zero backend required!',
      );
    }
    throw new Error(`Squad import failed (HTTP ${response.status}).`);
  }
  return (await response.json()) as ImportSquadResult;
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
