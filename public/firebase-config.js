(function (root, factory) {
  const api = factory(root);

  if (typeof module === 'object' && module && typeof module.exports !== 'undefined') {
    module.exports = api;
  } else {
    api.bootstrap(root);
  }
})(typeof window !== 'undefined' ? window : typeof globalThis !== 'undefined' ? globalThis : this, function (global) {
  'use strict';

  const INLINE_CONFIG = Object.freeze({
    apiKey: 'AIzaSyCTrS0i1Xz9Ll9cSPYnS3sh2g6Pfm7eNcQ',
    authDomain: 'stick-fight-pigeon.firebaseapp.com',
    projectId: 'stick-fight-pigeon',
    storageBucket: 'stick-fight-pigeon.appspot.com',
    messagingSenderId: '1035698723456',
    appId: '1:1035698723456:web:13b6cf2b2a9f4e12a8c7b1',
    measurementId: 'G-8X0PQR1XYZ',
  });

  const WINDOW_CONFIG_KEYS = Object.freeze([
    '__FIREBASE_CONFIG__',
    'STICKFIGHT_FIREBASE_CONFIG',
    'STICK_FIGHT_FIREBASE_CONFIG',
    'STICKFIGHT_FIREBASE_OPTIONS',
  ]);

  const REQUIRED_KEYS = Object.freeze(['apiKey', 'authDomain', 'projectId', 'appId']);
  const OPTIONAL_REQUIRED_KEYS = Object.freeze(['storageBucket', 'messagingSenderId']);

  const isObject = (value) => Boolean(value) && typeof value === 'object';

  const logError = (loggers, message) => {
    const line = '[CFG][ERR] ' + message;
    const boot = loggers && loggers.boot;
    if (boot && typeof boot.error === 'function') {
      boot.error('CFG', message);
    }
    const consoleRef = loggers && loggers.console;
    if (consoleRef && typeof consoleRef.error === 'function') {
      consoleRef.error(line);
    }
    const errorFn = loggers && typeof loggers.error === 'function' ? loggers.error : undefined;
    if (errorFn) {
      errorFn(line);
    }
  };

  const logInfo = (loggers, message) => {
    const line = '[CFG] ' + message;
    const boot = loggers && loggers.boot;
    if (boot && typeof boot.log === 'function') {
      boot.log('CFG', message);
    }
    const consoleRef = loggers && loggers.console;
    if (consoleRef && typeof consoleRef.info === 'function') {
      consoleRef.info(line);
    }
    const infoFn = loggers && typeof loggers.info === 'function' ? loggers.info : undefined;
    if (infoFn) {
      infoFn(line);
    }
  };

  const normalizeFirebaseConfig = (rawConfig, source, loggers) => {
    if (!isObject(rawConfig)) {
      logError(loggers, 'missing=object source=' + source);
      throw new Error('CFG_INVALID_CONFIG_' + source);
    }

    const candidate = rawConfig;
    const missing = [];

    for (let i = 0; i < REQUIRED_KEYS.length; i += 1) {
      const key = REQUIRED_KEYS[i];
      const value = candidate[key];
      if (typeof value !== 'string' || value.trim() === '') {
        missing.push(key);
      }
    }

    for (let i = 0; i < OPTIONAL_REQUIRED_KEYS.length; i += 1) {
      const key = OPTIONAL_REQUIRED_KEYS[i];
      const value = candidate[key];
      if (typeof value !== 'string' || value.trim() === '') {
        missing.push(key);
      }
    }

    const apiKeyValue = candidate.apiKey;
    if (typeof apiKeyValue === 'string' && apiKeyValue.length < 20) {
      missing.push('apiKey(len<20)');
    }

    if (missing.length > 0) {
      logError(loggers, 'missing=' + missing.join('|') + ' source=' + source);
      throw new Error('CFG_INVALID_CONFIG_FIELDS_' + source);
    }

    return Object.freeze({
      apiKey: candidate.apiKey,
      authDomain: candidate.authDomain,
      projectId: candidate.projectId,
      storageBucket: candidate.storageBucket,
      messagingSenderId: candidate.messagingSenderId,
      appId: candidate.appId,
      measurementId: candidate.measurementId,
    });
  };

  const readQueryParam = (scope, name) => {
    if (!isObject(scope) || typeof name !== 'string' || !name) {
      return null;
    }

    let search = '';
    try {
      const location = scope.location;
      if (location && typeof location.search === 'string') {
        search = location.search;
      }
    } catch (error) {
      return null;
    }

    if (typeof search !== 'string' || search === '') {
      return null;
    }

    let text = search.charAt(0) === '?' ? search.slice(1) : search;
    if (!text) {
      return null;
    }

    const pairs = text.split('&');
    for (let i = 0; i < pairs.length; i += 1) {
      const part = pairs[i];
      if (!part) {
        continue;
      }

      const eqIndex = part.indexOf('=');
      const rawKey = eqIndex >= 0 ? part.slice(0, eqIndex) : part;
      const rawValue = eqIndex >= 0 ? part.slice(eqIndex + 1) : '';

      let decodedKey = rawKey;
      try {
        decodedKey = decodeURIComponent(rawKey.replace(/\+/g, ' '));
      } catch (error) {
        decodedKey = rawKey.replace(/\+/g, ' ');
      }

      if (decodedKey !== name) {
        continue;
      }

      try {
        return decodeURIComponent(rawValue.replace(/\+/g, ' '));
      } catch (error) {
        return rawValue.replace(/\+/g, ' ');
      }
    }

    return null;
  };

  const readQueryFlag = (scope, name, truthyValues) => {
    const value = readQueryParam(scope, name);
    if (typeof value !== 'string') {
      return false;
    }

    const normalized = value.trim().toLowerCase();
    if (!normalized) {
      return false;
    }

    const allowed = Array.isArray(truthyValues) && truthyValues.length > 0 ? truthyValues : ['1', 'true', 'yes', 'on'];
    return allowed.indexOf(normalized) >= 0;
  };

  const isSafeModeEnabled = (scope, loggers) => {
    const boot = loggers && loggers.boot;
    const bootFlags = boot && isObject(boot.flags) ? boot.flags : null;
    if (bootFlags && bootFlags.safe) {
      return true;
    }

    return readQueryFlag(scope, 'safe');
  };

  const shouldAllowInlineConfig = (scope) => {
    return readQueryFlag(scope, 'useInline', ['1']);
  };

  const isNonProductionEnvironment = (scope) => {
    let mode = '';

    if (isObject(scope)) {
      const boot = isObject(scope.__StickFightBoot) ? scope.__StickFightBoot : null;
      if (boot) {
        if (typeof boot.env === 'string' && boot.env) {
          mode = boot.env;
        } else if (typeof boot.mode === 'string' && boot.mode) {
          mode = boot.mode;
        }
      }
    }

    if (!mode && typeof process !== 'undefined' && process && isObject(process.env)) {
      const env = process.env;
      const nodeEnv = typeof env.NODE_ENV === 'string' && env.NODE_ENV ? env.NODE_ENV : env.MODE;
      if (typeof nodeEnv === 'string' && nodeEnv) {
        mode = nodeEnv;
      }
    }

    if (!mode && isObject(scope) && isObject(scope.location) && typeof scope.location.hostname === 'string') {
      const host = scope.location.hostname.toLowerCase();
      if (host === 'localhost' || host === '127.0.0.1') {
        mode = 'development';
      }
    }

    if (!mode) {
      return false;
    }

    const normalized = mode.trim().toLowerCase();
    return normalized !== 'production' && normalized !== 'prod';
  };

  const readFirebaseInitOptions = (scope) => {
    if (!isObject(scope)) {
      return null;
    }

    const firebase = scope.firebase;
    if (!isObject(firebase)) {
      return null;
    }

    const apps = firebase.apps;
    if (!apps) {
      return null;
    }

    let firstApp = null;
    if (Array.isArray(apps) && apps.length > 0) {
      firstApp = apps[0];
    } else if (typeof apps === 'object' && apps) {
      firstApp = apps[0] || null;
    }

    if (!isObject(firstApp) || !isObject(firstApp.options)) {
      return null;
    }

    return firstApp.options;
  };

  const tryReadGlobalFirebaseConfig = (scope) => {
    if (!isObject(scope)) {
      return null;
    }

    for (let i = 0; i < WINDOW_CONFIG_KEYS.length; i += 1) {
      const key = WINDOW_CONFIG_KEYS[i];
      if (key in scope && scope[key]) {
        return { value: scope[key], key };
      }
    }

    return null;
  };

  const resolveFirebaseConfig = (scope, inlineConfig, loggers) => {
    const safeMode = isSafeModeEnabled(scope, loggers);
    const allowInline = shouldAllowInlineConfig(scope);
    const nonProduction = isNonProductionEnvironment(scope);

    const firebaseInitOptions = readFirebaseInitOptions(scope);
    if (firebaseInitOptions) {
      try {
        const normalizedFirebaseInit = normalizeFirebaseConfig(firebaseInitOptions, 'firebase-init', loggers);
        return { config: normalizedFirebaseInit, source: 'firebase-init' };
      } catch (error) {
        // Fall back to other sources on validation failure.
      }
    }

    const windowConfig = tryReadGlobalFirebaseConfig(scope);
    if (windowConfig && windowConfig.value) {
      try {
        const normalizedWindow = normalizeFirebaseConfig(windowConfig.value, 'window', loggers);
        return { config: normalizedWindow, source: 'window', key: windowConfig.key };
      } catch (error) {
        if (!(allowInline && inlineConfig)) {
          throw error;
        }
      }
    }

    if (allowInline && inlineConfig && nonProduction) {
      const normalizedInline = normalizeFirebaseConfig(inlineConfig, 'inline-dev', loggers);
      logInfo(
        loggers,
        'source=inline-dev projectId=' +
          normalizedInline.projectId +
          ' apiKeyLen=' +
          normalizedInline.apiKey.length +
          ' apiKeyHead=' +
          normalizedInline.apiKey.slice(0, 6)
      );
      return { config: normalizedInline, source: 'inline-dev' };
    }

    logInfo(loggers, 'source=none');

    if (!safeMode) {
      logError(loggers, 'missing=config source=none');
      throw new Error('CFG_MISSING_FIREBASE_CONFIG');
    }

    return { config: null, source: 'none' };
  };

  const bootstrap = (scope) => {
    if (!isObject(scope)) {
      return null;
    }

    const loggers = {
      boot: scope.__StickFightBoot && typeof scope.__StickFightBoot === 'object' ? scope.__StickFightBoot : undefined,
      console: typeof console !== 'undefined' && console ? console : undefined,
    };

    const result = resolveFirebaseConfig(scope, INLINE_CONFIG, loggers);
    const resolvedSource = result && result.source ? result.source : 'none';
    const config = result ? result.config : null;

    if (!config) {
      return null;
    }

    const apiKeyLen = config.apiKey.length;
    const apiKeyHead = config.apiKey.slice(0, 6);
    const logDetails =
      'source=' +
      resolvedSource +
      ' projectId=' +
      config.projectId +
      ' authDomain=' +
      config.authDomain +
      ' apiKeyLen=' +
      apiKeyLen +
      ' apiKeyHead=' +
      apiKeyHead;

    logInfo(loggers, logDetails);

    scope.__FIREBASE_CONFIG__ = config;
    scope.STICKFIGHT_FIREBASE_CONFIG = config;
    scope.STICK_FIGHT_FIREBASE_CONFIG = config;
    scope.STICKFIGHT_FIREBASE_OPTIONS = config;

    return config;
  };

  const api = {
    bootstrap,
    normalizeFirebaseConfig,
    resolveFirebaseConfig,
    tryReadGlobalFirebaseConfig,
    WINDOW_CONFIG_KEYS,
    REQUIRED_KEYS,
    OPTIONAL_REQUIRED_KEYS,
    __test: Object.freeze({
      getInlineConfig: () => INLINE_CONFIG,
      isNonProductionEnvironment,
    }),
  };

  if (isObject(global) && !global.__StickFightFirebaseConfigShared) {
    global.__StickFightFirebaseConfigShared = api;
  }

  return api;
});
