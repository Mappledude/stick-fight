declare module '../../public/firebase-config.js' {
  import type {
    FirebaseOptions,
    FirebaseConfigLoggers,
    FirebaseConfigResolveResult,
  } from './public__firebase-config';

  export const WINDOW_CONFIG_KEYS: readonly string[];
  export const REQUIRED_KEYS: readonly (keyof FirebaseOptions)[];
  export const OPTIONAL_REQUIRED_KEYS: readonly (keyof FirebaseOptions)[];

  export function normalizeFirebaseConfig(
    rawConfig: unknown,
    source: string,
    loggers?: FirebaseConfigLoggers,
  ): FirebaseOptions;

  export function tryReadGlobalFirebaseConfig(scope: unknown): { value: unknown; key?: string } | null;

  export function resolveFirebaseConfig(
    scope: unknown,
    inlineConfig: FirebaseOptions | null | undefined,
    loggers?: FirebaseConfigLoggers,
  ): FirebaseConfigResolveResult;

  export function bootstrap(scope: unknown): FirebaseOptions | null;
}
