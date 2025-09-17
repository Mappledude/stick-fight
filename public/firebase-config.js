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
    const windowConfig = tryReadGlobalFirebaseConfig(scope);
    if (windowConfig && windowConfig.value) {
      try {
        const normalizedWindow = normalizeFirebaseConfig(windowConfig.value, 'window', loggers);
        return { config: normalizedWindow, source: 'window', key: windowConfig.key };
      } catch (error) {
        if (!inlineConfig) {
          throw error;
        }
      }
    }

    if (!inlineConfig) {
      logError(loggers, 'missing=config source=inline');
      throw new Error('CFG_MISSING_INLINE_CONFIG');
    }

    const normalizedInline = normalizeFirebaseConfig(inlineConfig, 'inline', loggers);
    return { config: normalizedInline, source: 'inline' };
  };

  const bootstrap = (scope) => {
    if (!isObject(scope)) {
      return null;
    }

    const loggers = {
      boot: scope.__StickFightBoot && typeof scope.__StickFightBoot === 'object' ? scope.__StickFightBoot : undefined,
      console: typeof console !== 'undefined' && console ? console : undefined,
    };

    const { config, source } = resolveFirebaseConfig(scope, INLINE_CONFIG, loggers);
    const apiKeyLen = config.apiKey.length;
    const apiKeyHead = config.apiKey.slice(0, 6);
    const logDetails =
      'source=' +
      source +
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
  };

  if (isObject(global) && !global.__StickFightFirebaseConfigShared) {
    global.__StickFightFirebaseConfigShared = api;
  }

  return api;
});
