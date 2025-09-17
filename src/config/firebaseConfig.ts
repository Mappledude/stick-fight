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

type ConfigSource = 'window' | 'env';

export interface FirebaseConfigMetadata {
  source: ConfigSource;
  apiKeyHead: string;
  apiKeyLength: number;
  debug: boolean;
  mode: 'development' | 'production';
}

export interface ResolvedFirebaseConfig {
  config: FirebaseOptions;
  metadata: FirebaseConfigMetadata;
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

const WINDOW_CONFIG_KEYS = [
  '__FIREBASE_CONFIG__',
  'STICK_FIGHT_FIREBASE_CONFIG',
  'STICKFIGHT_FIREBASE_CONFIG',
  'STICKFIGHT_FIREBASE_OPTIONS',
] as const;

const ENV_KEY_MAP: Record<keyof FirebaseOptions, string[]> = {
  apiKey: ['VITE_FIREBASE_API_KEY', 'FIREBASE_API_KEY'],
  authDomain: ['VITE_FIREBASE_AUTH_DOMAIN', 'FIREBASE_AUTH_DOMAIN'],
  projectId: ['VITE_FIREBASE_PROJECT_ID', 'FIREBASE_PROJECT_ID'],
  storageBucket: ['VITE_FIREBASE_STORAGE_BUCKET', 'FIREBASE_STORAGE_BUCKET'],
  messagingSenderId: ['VITE_FIREBASE_MESSAGING_SENDER_ID', 'FIREBASE_MESSAGING_SENDER_ID'],
  appId: ['VITE_FIREBASE_APP_ID', 'FIREBASE_APP_ID'],
  measurementId: ['VITE_FIREBASE_MEASUREMENT_ID', 'FIREBASE_MEASUREMENT_ID'],
};

let cachedConfig: ResolvedFirebaseConfig | null = null;

interface QueryFlags {
  debug: boolean;
  cfg?: string;
}

function readQueryFlags(): QueryFlags {
  if (typeof globalThis === 'undefined') {
    return { debug: false };
  }

  try {
    const { location } = globalThis as { location?: { search?: string | null } };
    if (!location || typeof location.search !== 'string') {
      return { debug: false };
    }

    const params = new URLSearchParams(location.search ?? '');
    return {
      debug: params.get('debug') === '1',
      cfg: params.get('cfg') ?? undefined,
    };
  } catch (error) {
    // URLSearchParams may be unavailable in some environments.
    return { debug: false };
  }
}

interface WindowConfigResult {
  value: unknown;
  key?: string;
}

function readGlobalConfig(): WindowConfigResult | null {
  if (typeof globalThis === 'undefined') {
    return null;
  }

  const globalScope = globalThis as Record<string, unknown>;

  for (const key of WINDOW_CONFIG_KEYS) {
    if (key in globalScope && globalScope[key]) {
      return { value: globalScope[key], key };
    }
  }

  return null;
}

function readEnvValue(names: string[]): string | undefined {
  const importMeta =
    typeof import.meta !== 'undefined' ? (import.meta as { env?: Record<string, string | undefined> }) : undefined;
  const importMetaEnv = importMeta?.env;

  const processEnv = typeof process !== 'undefined' ? (process.env as Record<string, string | undefined>) : undefined;

  for (const name of names) {
    const value = importMetaEnv?.[name] ?? processEnv?.[name];
    if (typeof value === 'string' && value.trim() !== '') {
      return value;
    }
  }

  return undefined;
}

function readEnvConfig(): Partial<FirebaseOptions> | null {
  const result: Partial<FirebaseOptions> = {};
  let hasAnyValue = false;

  (Object.keys(ENV_KEY_MAP) as Array<keyof FirebaseOptions>).forEach((key) => {
    const value = readEnvValue(ENV_KEY_MAP[key]);
    if (typeof value !== 'undefined') {
      (result as Record<string, unknown>)[key] = value;
      hasAnyValue = true;
    }
  });

  return hasAnyValue ? result : null;
}

function resolveMode(): 'development' | 'production' {
  const importMeta =
    typeof import.meta !== 'undefined' ? (import.meta as { env?: Record<string, string | undefined> }) : undefined;
  const importMetaEnv = importMeta?.env;

  const processEnv = typeof process !== 'undefined' ? (process.env as Record<string, string | undefined>) : undefined;

  const rawMode =
    importMetaEnv?.MODE || importMetaEnv?.NODE_ENV || processEnv?.NODE_ENV || processEnv?.MODE || 'development';

  return rawMode === 'production' ? 'production' : 'development';
}

function validateConfig(rawConfig: unknown, source: ConfigSource): FirebaseOptions {
  if (!rawConfig || typeof rawConfig !== 'object') {
    console.error('[CFG][ERR] missing=object source=' + source);
    throw new Error('Firebase configuration was not found. Make sure configuration values are defined.');
  }

  const candidate = rawConfig as Record<string, unknown>;
  const missingKeys: string[] = [];

  for (const key of REQUIRED_KEYS) {
    const value = candidate[key as string];
    if (typeof value !== 'string' || value.trim() === '') {
      missingKeys.push(key);
    }
  }

  for (const key of OPTIONAL_REQUIRED_KEYS) {
    const value = candidate[key as string];
    if (typeof value !== 'string' || value.trim() === '') {
      missingKeys.push(key);
    }
  }

  const apiKeyValue = candidate.apiKey;
  if (typeof apiKeyValue === 'string' && apiKeyValue.length < 20) {
    missingKeys.push('apiKey(len<20)');
  }

  if (missingKeys.length) {
    console.error(`[CFG][ERR] missing=${missingKeys.join('|')} source=${source}`);
    throw new Error(`Firebase configuration is missing required values: ${missingKeys.join(', ')}`);
  }

  const normalized: FirebaseOptions = Object.freeze({ ...candidate }) as FirebaseOptions;
  return normalized;
}

function buildResult(config: FirebaseOptions, source: ConfigSource, debug: boolean): ResolvedFirebaseConfig {
  const apiKeyLength = config.apiKey.length;
  const apiKeyHead = config.apiKey.slice(0, 6);
  const mode = resolveMode();

  if (debug) {
    console.info(
      `[CFG] projectId=${config.projectId} authDomain=${config.authDomain} apiKeyLen=${apiKeyLength} apiKeyHead=${apiKeyHead} source=${source} mode=${mode}`,
    );
  }

  return {
    config,
    metadata: {
      source,
      apiKeyHead,
      apiKeyLength,
      debug,
      mode,
    },
  };
}

function resolveFirebaseConfig(): ResolvedFirebaseConfig {
  const { debug, cfg } = readQueryFlags();
  const forcedSource: ConfigSource | undefined = cfg === 'window' ? 'window' : cfg === 'env' ? 'env' : undefined;
  const preferWindow = forcedSource ? forcedSource === 'window' : true;
  const allowEnvFallback = forcedSource !== 'window';

  if (preferWindow) {
    const windowConfig = readGlobalConfig();
    if (windowConfig?.value) {
      try {
        const normalized = validateConfig(windowConfig.value, 'window');
        return buildResult(normalized, 'window', debug);
      } catch (error) {
        if (!allowEnvFallback) {
          throw error;
        }
      }
    }
    if (!allowEnvFallback && !windowConfig?.value) {
      console.error('[CFG][ERR] missing=config source=window');
      throw new Error('Firebase configuration was not found. Make sure window.__FIREBASE_CONFIG__ is defined.');
    }
  }

  if (allowEnvFallback) {
    const envConfig = readEnvConfig();
    if (envConfig) {
      const normalized = validateConfig(envConfig, 'env');
      return buildResult(normalized, 'env', debug);
    }
    if (forcedSource === 'env') {
      console.error('[CFG][ERR] missing=config source=env');
      throw new Error('Firebase configuration environment variables are missing.');
    }
  }

  const windowConfig = readGlobalConfig();
  if (windowConfig?.value) {
    const normalized = validateConfig(windowConfig.value, 'window');
    return buildResult(normalized, 'window', debug);
  }

  console.error('[CFG][ERR] missing=config source=window');
  throw new Error('Firebase configuration was not found. Make sure window.__FIREBASE_CONFIG__ or environment variables are defined.');
}

export function getResolvedFirebaseConfig(): ResolvedFirebaseConfig {
  if (!cachedConfig) {
    cachedConfig = resolveFirebaseConfig();
  }

  return cachedConfig;
}

export function getFirebaseConfigMetadata(): FirebaseConfigMetadata {
  return getResolvedFirebaseConfig().metadata;
}

export function getFirebaseConfig(): FirebaseOptions {
  return getResolvedFirebaseConfig().config;
}
