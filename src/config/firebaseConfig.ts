export interface FirebaseOptions {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket?: string;
  messagingSenderId?: string;
  appId: string;
  measurementId?: string;
  [key: string]: unknown;
}

const REQUIRED_KEYS: Array<keyof FirebaseOptions> = [
  'apiKey',
  'authDomain',
  'projectId',
  'appId',
];

const OPTIONAL_REQUIRED_KEYS: Array<keyof FirebaseOptions> = [
  'storageBucket',
  'messagingSenderId',
];

let cachedConfig: FirebaseOptions | null = null;

function readGlobalConfig(): unknown {
  if (typeof globalThis === 'undefined') {
    return undefined;
  }

  const globalScope = globalThis as Record<string, unknown>;
  if (globalScope.__FIREBASE_CONFIG__) {
    return globalScope.__FIREBASE_CONFIG__;
  }

  if (globalScope.STICK_FIGHT_FIREBASE_CONFIG) {
    return globalScope.STICK_FIGHT_FIREBASE_CONFIG;
  }

  if (globalScope.STICKFIGHT_FIREBASE_CONFIG) {
    return globalScope.STICKFIGHT_FIREBASE_CONFIG;
  }

  if (globalScope.STICKFIGHT_FIREBASE_OPTIONS) {
    return globalScope.STICKFIGHT_FIREBASE_OPTIONS;
  }

  return undefined;
}

function normalizeConfig(rawConfig: unknown): FirebaseOptions {
  if (!rawConfig || typeof rawConfig !== 'object') {
    throw new Error('Firebase configuration was not found. Make sure window.__FIREBASE_CONFIG__ is defined.');
  }

  const result: FirebaseOptions = { ...rawConfig } as FirebaseOptions;

  const missingRequired = REQUIRED_KEYS.filter((key) => {
    const value = result[key];
    return typeof value !== 'string' || value.trim() === '';
  });

  const missingOptional = OPTIONAL_REQUIRED_KEYS.filter((key) => {
    const value = result[key];
    return typeof value !== 'string' || value.trim() === '';
  });

  if (missingRequired.length || missingOptional.length) {
    const missingKeys = missingRequired.concat(missingOptional);
    throw new Error(`Firebase configuration is missing required values: ${missingKeys.join(', ')}`);
  }

  return Object.freeze({ ...result });
}

export function getFirebaseConfig(): FirebaseOptions {
  if (cachedConfig) {
    return cachedConfig;
  }

  const rawConfig = readGlobalConfig();
  const normalized = normalizeConfig(rawConfig);
  cachedConfig = normalized;
  return cachedConfig;
}
