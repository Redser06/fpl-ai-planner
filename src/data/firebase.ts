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
