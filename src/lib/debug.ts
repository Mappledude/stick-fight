const DEBUG_QUERY_PATTERN = /[?&]debug=1\b/;

let cachedDebug: boolean | null = null;

function readGlobalDebugFlag(): boolean | null {
  if (typeof globalThis === 'undefined') {
    return null;
  }

  const globalScope = globalThis as Record<string, unknown>;
  const candidateKeys = [
    'STICK_FIGHT_DEBUG',
    'STICKFIGHT_DEBUG',
    '__STICKFIGHT_DEBUG__',
    '__STICK_FIGHT_DEBUG__',
    'stickfightDebug',
  ];

  for (const key of candidateKeys) {
    const value = globalScope[key];
    if (typeof value === 'boolean') {
      return value;
    }
    if (typeof value === 'string') {
      if (value === '1' || value.toLowerCase() === 'true') {
        return true;
      }
      if (value === '0' || value.toLowerCase() === 'false') {
        return false;
      }
    }
    if (typeof value === 'number') {
      if (value === 1) {
        return true;
      }
      if (value === 0) {
        return false;
      }
    }
  }

  return null;
}

function readQueryString(): string {
  if (typeof location === 'undefined') {
    return '';
  }
  try {
    return typeof location.search === 'string' ? location.search : '';
  } catch (error) {
    return '';
  }
}

function parseDebugFromQuery(search: string): boolean {
  if (!search) {
    return false;
  }

  if (typeof URLSearchParams === 'function') {
    try {
      const params = new URLSearchParams(search);
      const value = params.get('debug');
      if (value === '1' || value === 'true') {
        return true;
      }
      if (value === '0' || value === 'false') {
        return false;
      }
    } catch (error) {
      return DEBUG_QUERY_PATTERN.test(search);
    }
  }

  return DEBUG_QUERY_PATTERN.test(search);
}

export function isDebugLoggingEnabled(): boolean {
  if (cachedDebug !== null) {
    return cachedDebug;
  }

  const globalFlag = readGlobalDebugFlag();
  if (typeof globalFlag === 'boolean') {
    cachedDebug = globalFlag;
    return cachedDebug;
  }

  const search = readQueryString();
  cachedDebug = parseDebugFromQuery(search);
  return cachedDebug;
}

function logWithConsole(method: 'log' | 'info' | 'warn' | 'error', args: unknown[]): void {
  if (!isDebugLoggingEnabled()) {
    return;
  }
  if (typeof console === 'undefined') {
    return;
  }
  const target = (console as Record<string, unknown>)[method];
  if (typeof target === 'function') {
    try {
      (target as (...params: unknown[]) => void)(...args);
    } catch (error) {
      // Swallow logging errors to avoid cascading failures.
    }
  }
}

export function debugLog(...args: unknown[]): void {
  logWithConsole('log', args);
}

export function debugInfo(...args: unknown[]): void {
  logWithConsole('info', args);
}

export function debugWarn(...args: unknown[]): void {
  logWithConsole('warn', args);
}

export function debugError(...args: unknown[]): void {
  logWithConsole('error', args);
}
