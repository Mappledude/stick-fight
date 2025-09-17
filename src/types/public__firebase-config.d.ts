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

export interface FirebaseConfigBootLogger {
  log?: (scope: string, message: string) => void;
  error?: (scope: string, message: string) => void;
}

export interface FirebaseConfigConsoleLogger {
  info?: (message: string) => void;
  error?: (message: string) => void;
}

export interface FirebaseConfigLoggers {
  boot?: FirebaseConfigBootLogger;
  console?: FirebaseConfigConsoleLogger;
  error?: (message: string) => void;
  info?: (message: string) => void;
}

export interface FirebaseConfigResolveResult {
  config: FirebaseOptions;
  source: 'window' | 'inline';
  key?: string;
}

export declare const WINDOW_CONFIG_KEYS: readonly string[];
export declare const REQUIRED_KEYS: readonly (keyof FirebaseOptions)[];
export declare const OPTIONAL_REQUIRED_KEYS: readonly (keyof FirebaseOptions)[];

export declare function normalizeFirebaseConfig(
  rawConfig: unknown,
  source: string,
  loggers?: FirebaseConfigLoggers,
): FirebaseOptions;

export declare function tryReadGlobalFirebaseConfig(scope: unknown): { value: unknown; key?: string } | null;

export declare function resolveFirebaseConfig(
  scope: unknown,
  inlineConfig: FirebaseOptions | null | undefined,
  loggers?: FirebaseConfigLoggers,
): FirebaseConfigResolveResult;

export declare function bootstrap(scope: unknown): FirebaseOptions | null;
