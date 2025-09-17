import type { FirebaseOptions } from '../config/firebaseConfig';
import { getFirebaseConfig } from '../config/firebaseConfig';
import { debugInfo, debugLog, isDebugLoggingEnabled } from './debug';

type FirebaseAppLike = {
  options?: FirebaseOptions;
};

type FirebaseAuthLike = {
  currentUser: unknown | null;
  signInAnonymously?: () => Promise<unknown>;
};

type FirebaseFirestoreLike = unknown;

type FirebaseNamespace = {
  apps?: unknown[];
  initializeApp?: (config: FirebaseOptions) => FirebaseAppLike;
  app?: () => FirebaseAppLike;
  auth?: () => FirebaseAuthLike;
  firestore?: () => FirebaseFirestoreLike;
};

let appInstance: FirebaseAppLike | null = null;
let authInstance: FirebaseAuthLike | null = null;
let firestoreInstance: FirebaseFirestoreLike | null = null;
let authReadyPromise: Promise<void> | null = null;
let hostLogged = false;

function configsMatch(a?: FirebaseOptions, b?: FirebaseOptions): boolean {
  if (!a || !b) {
    return true;
  }

  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const key of keys) {
    const first = a[key];
    const second = b[key];
    if (first !== second) {
      return false;
    }
  }
  return true;
}

function logHostInfoOnce(config: FirebaseOptions): void {
  if (hostLogged || !isDebugLoggingEnabled()) {
    return;
  }
  hostLogged = true;

  let origin = 'unknown';
  let route = 'unknown';
  try {
    if (typeof location !== 'undefined') {
      origin = typeof location.origin === 'string' ? location.origin : origin;
      route = typeof location.pathname === 'string' ? location.pathname : route;
    }
  } catch (error) {
    // Ignore failures to read location information.
  }

  debugInfo(
    `[HOST] origin=${origin} route=${route} authDomain=${config.authDomain}`,
  );
}

function logFirebaseInit(
  action: 'created' | 'reused',
  app: FirebaseAppLike,
  namespace: FirebaseNamespace,
): void {
  if (!isDebugLoggingEnabled()) {
    return;
  }

  const name = (app as Record<string, unknown>).name;
  const compat = typeof (app as Record<string, unknown>).options === 'object';
  const authCompatLoaded = typeof namespace.auth === 'function';
  debugLog(
    `[INIT] firebase-app ${action} name=${
      typeof name === 'string' ? name : 'unknown'
    } compat=${compat} authCompat=${authCompatLoaded}`,
  );
}

function getFirebaseNamespace(): FirebaseNamespace {
  if (typeof globalThis === 'undefined') {
    throw new Error('Firebase SDK is not available in this environment.');
  }
  const namespace = (globalThis as Record<string, unknown>).firebase as FirebaseNamespace | undefined;
  if (!namespace) {
    throw new Error('Firebase SDK failed to load.');
  }
  return namespace;
}

export function getFirebaseApp(): FirebaseAppLike {
  if (appInstance) {
    const firebase = getFirebaseNamespace();
    const config = getFirebaseConfig();
    const existingConfig = appInstance.options;
    if (
      existingConfig &&
      typeof existingConfig === 'object' &&
      !configsMatch(existingConfig as FirebaseOptions, config)
    ) {
      throw new Error('Firebase app already initialized with a different configuration.');
    }
    logHostInfoOnce(config);
    logFirebaseInit('reused', appInstance, firebase);
    return appInstance;
  }

  const firebase = getFirebaseNamespace();
  const config = getFirebaseConfig();
  logHostInfoOnce(config);

  if (firebase.apps && Array.isArray(firebase.apps) && firebase.apps.length > 0 && typeof firebase.app === 'function') {
    const existingApp = firebase.app();
    const existingConfig = (existingApp as FirebaseAppLike).options;
    if (
      existingConfig &&
      typeof existingConfig === 'object' &&
      !configsMatch(existingConfig as FirebaseOptions, config)
    ) {
      throw new Error('Firebase app already initialized with a different configuration.');
    }
    appInstance = existingApp;
    logFirebaseInit('reused', appInstance, firebase);
    return appInstance;
  }

  if (typeof firebase.initializeApp === 'function') {
    if (firebase.apps && Array.isArray(firebase.apps) && firebase.apps.length > 0) {
      const existing = firebase.apps[0] as FirebaseAppLike;
      const existingConfig = existing && existing.options;
      if (
        existingConfig &&
        typeof existingConfig === 'object' &&
        !configsMatch(existingConfig as FirebaseOptions, config)
      ) {
        throw new Error('Firebase app already initialized with a different configuration.');
      }
    }

    appInstance = firebase.initializeApp(config);
    logFirebaseInit('created', appInstance, firebase);
    return appInstance;
  }

  if (typeof firebase.app === 'function') {
    const existingApp = firebase.app();
    const existingConfig = (existingApp as FirebaseAppLike).options;
    if (
      existingConfig &&
      typeof existingConfig === 'object' &&
      !configsMatch(existingConfig as FirebaseOptions, config)
    ) {
      throw new Error('Firebase app already initialized with a different configuration.');
    }
    appInstance = existingApp;
    logFirebaseInit('reused', appInstance, firebase);
    return appInstance;
  }

  throw new Error('Firebase initializeApp method is not available.');
}

export function getFirebaseAuth(): FirebaseAuthLike {
  if (authInstance) {
    return authInstance;
  }

  const firebase = getFirebaseNamespace();
  if (typeof firebase.auth !== 'function') {
    throw new Error('Firebase Auth SDK is not available.');
  }

  authInstance = firebase.auth();
  return authInstance;
}

export function getFirestore(): FirebaseFirestoreLike {
  if (firestoreInstance) {
    return firestoreInstance;
  }

  const firebase = getFirebaseNamespace();
  if (typeof firebase.firestore !== 'function') {
    throw new Error('Firebase Firestore SDK is not available.');
  }

  // Ensure the app is initialized before creating Firestore.
  getFirebaseApp();
  firestoreInstance = firebase.firestore();
  return firestoreInstance;
}

export async function ensureAuth(): Promise<void> {
  const config = getFirebaseConfig();
  logHostInfoOnce(config);
  const auth = getFirebaseAuth();
  if (auth.currentUser) {
    return;
  }

  if (authReadyPromise) {
    return authReadyPromise;
  }

  if (typeof auth.signInAnonymously !== 'function') {
    throw new Error('Anonymous authentication is not supported in the current Firebase Auth SDK.');
  }

  authReadyPromise = auth
    .signInAnonymously()
    .then(() => {
      authReadyPromise = null;
    })
    .catch((error) => {
      authReadyPromise = null;
      throw error;
    })
    .then(() => undefined);

  return authReadyPromise;
}
