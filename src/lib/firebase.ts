import type { FirebaseOptions } from '../config/firebaseConfig';
import { getFirebaseConfig } from '../config/firebaseConfig';

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
    return appInstance;
  }

  const firebase = getFirebaseNamespace();
  if (firebase.apps && Array.isArray(firebase.apps) && firebase.apps.length > 0 && typeof firebase.app === 'function') {
    appInstance = firebase.app();
    return appInstance;
  }

  if (typeof firebase.initializeApp === 'function') {
    const config = getFirebaseConfig();
    appInstance = firebase.initializeApp(config);
    return appInstance;
  }

  if (typeof firebase.app === 'function') {
    appInstance = firebase.app();
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
