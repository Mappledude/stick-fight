(function (global) {
  'use strict';

  const REQUIRED_KEYS = ['apiKey', 'authDomain', 'projectId', 'appId'];
  const OPTIONAL_KEYS = ['storageBucket', 'messagingSenderId'];
  const GLOBAL_CONFIG_KEYS = [
    '__FIREBASE_CONFIG__',
    'STICKFIGHT_FIREBASE_CONFIG',
    'STICK_FIGHT_FIREBASE_CONFIG',
    'STICKFIGHT_FIREBASE_OPTIONS',
  ];

  const state = {
    boot: null,
    config: null,
    mismatchWarned: false,
    app: null,
    auth: null,
    firestore: null,
    fieldValue: null,
    scriptType: null,
    sdkType: null,
    scriptElement: null,
    logs: {
      host: false,
      init: false,
      sw: false,
    },
  };

  function detectScriptElement() {
    if (state.scriptElement) {
      return state.scriptElement;
    }

    try {
      if (typeof document === 'undefined' || !document) {
        return null;
      }

      if (document.currentScript) {
        state.scriptElement = document.currentScript;
        return state.scriptElement;
      }

      if (typeof document.getElementsByTagName === 'function') {
        const scripts = document.getElementsByTagName('script');
        for (let i = scripts.length - 1; i >= 0; i -= 1) {
          const candidate = scripts[i];
          if (!candidate) {
            continue;
          }
          const src = candidate.getAttribute ? candidate.getAttribute('src') : candidate.src;
          if (typeof src !== 'string' || src === '') {
            continue;
          }
          if (src.indexOf('firebase-bootstrap.js') !== -1) {
            state.scriptElement = candidate;
            return state.scriptElement;
          }
        }
      }
    } catch (error) {
      // Ignore DOM access failures.
    }

    return null;
  }

  function detectScriptType() {
    if (state.scriptType) {
      return state.scriptType;
    }

    let type = 'classic';
    try {
      const script = detectScriptElement();
      if (script) {
        let attr = null;
        if (typeof script.type === 'string' && script.type !== '') {
          attr = script.type;
        } else if (script.getAttribute) {
          attr = script.getAttribute('type');
        }
        if (typeof attr === 'string' && attr.toLowerCase() === 'module') {
          type = 'module';
        }
      }
    } catch (error) {
      // Ignore failures; default to classic.
    }

    state.scriptType = type;
    return state.scriptType;
  }

  function detectSdkType(namespace) {
    if (state.sdkType) {
      return state.sdkType;
    }

    let type = 'compat';
    try {
      if (namespace && typeof namespace === 'object') {
        const hasCompatApps = namespace.apps && typeof namespace.apps.length === 'number';
        if (!hasCompatApps && typeof namespace.getApps === 'function') {
          type = 'modular';
        }
      }
    } catch (error) {
      // Ignore detection errors; default to compat.
    }

    state.sdkType = type;
    return state.sdkType;
  }

  const noopBoot = {
    log: function () {},
    error: function () {},
  };

  function resolveBoot(boot) {
    if (boot && typeof boot === 'object') {
      state.boot = boot;
      return boot;
    }
    if (state.boot) {
      return state.boot;
    }
    const globalBoot = global && typeof global.__StickFightBoot === 'object' ? global.__StickFightBoot : null;
    if (globalBoot) {
      state.boot = globalBoot;
      return globalBoot;
    }
    state.boot = noopBoot;
    return state.boot;
  }

  function log(tag, message, detail) {
    const boot = state.boot || noopBoot;
    const logger = boot && typeof boot.log === 'function' ? boot.log.bind(boot) : null;
    if (logger) {
      logger(tag, message, detail);
      return;
    }
    if (typeof console !== 'undefined' && console) {
      const label = '[' + tag + '] ' + message;
      if (typeof detail !== 'undefined') {
        if (typeof console.log === 'function') {
          console.log(label, detail);
        }
      } else if (typeof console.log === 'function') {
        console.log(label);
      }
    }
  }

  function warn(tag, message, detail) {
    const boot = state.boot || noopBoot;
    if (boot && typeof boot.log === 'function') {
      boot.log(tag, message, detail);
    }
    if (typeof console !== 'undefined' && console && typeof console.warn === 'function') {
      const label = '[' + tag + '] ' + message;
      if (typeof detail !== 'undefined') {
        console.warn(label, detail);
      } else {
        console.warn(label);
      }
    }
  }

  function configsMatch(a, b) {
    if (!a || !b) {
      return true;
    }
    const keys = Object.create(null);
    for (const key in a) {
      if (Object.prototype.hasOwnProperty.call(a, key)) {
        keys[key] = true;
      }
    }
    for (const key in b) {
      if (Object.prototype.hasOwnProperty.call(b, key)) {
        keys[key] = true;
      }
    }
    for (const key in keys) {
      if (!Object.prototype.hasOwnProperty.call(keys, key)) {
        continue;
      }
      if (a[key] !== b[key]) {
        return false;
      }
    }
    return true;
  }

  function readGlobalConfigCandidate() {
    if (!global || typeof global !== 'object') {
      return null;
    }
    for (let i = 0; i < GLOBAL_CONFIG_KEYS.length; i += 1) {
      const key = GLOBAL_CONFIG_KEYS[i];
      if (key in global && global[key]) {
        return global[key];
      }
    }
    return null;
  }

  function validateConfig(raw) {
    if (!raw || typeof raw !== 'object') {
      throw new Error('Firebase configuration was not provided.');
    }
    const missing = [];
    const candidate = raw;
    for (let i = 0; i < REQUIRED_KEYS.length; i += 1) {
      const key = REQUIRED_KEYS[i];
      const value = candidate[key];
      if (typeof value !== 'string' || value.trim() === '') {
        missing.push(key);
      }
    }
    for (let i = 0; i < OPTIONAL_KEYS.length; i += 1) {
      const key = OPTIONAL_KEYS[i];
      const value = candidate[key];
      if (typeof value === 'undefined') {
        continue;
      }
      if (typeof value !== 'string' || value.trim() === '') {
        missing.push(key);
      }
    }
    if (missing.length > 0) {
      throw new Error('Firebase configuration is invalid: missing ' + missing.join(','));
    }
    return {
      apiKey: candidate.apiKey,
      authDomain: candidate.authDomain,
      projectId: candidate.projectId,
      storageBucket: candidate.storageBucket,
      messagingSenderId: candidate.messagingSenderId,
      appId: candidate.appId,
      measurementId: candidate.measurementId,
    };
  }

  function logHostOnce(config) {
    if (state.logs.host) {
      return;
    }
    state.logs.host = true;

    let origin = 'unknown';
    let route = 'unknown';
    try {
      if (typeof location !== 'undefined' && location) {
        origin = typeof location.origin === 'string' ? location.origin : origin;
        route = typeof location.pathname === 'string' ? location.pathname : route;
      }
    } catch (error) {
      // Ignore failures when reading location.
    }

    log('HOST', 'origin=' + origin + ' route=' + route + ' authDomain=' + config.authDomain);
  }

  function logServiceWorkerOnce() {
    if (state.logs.sw) {
      return;
    }
    state.logs.sw = true;

    let status = 'unsupported';
    let controller = 'none';
    try {
      if (typeof navigator !== 'undefined' && navigator && 'serviceWorker' in navigator) {
        status = 'supported';
        const sw = navigator.serviceWorker;
        controller = sw && sw.controller ? 'controller' : 'none';
      }
    } catch (error) {
      status = 'error';
    }

    log('SW', 'status=' + status + ' controller=' + controller);
  }

  function logInitOnce(namespace, reused) {
    if (state.logs.init) {
      return;
    }
    state.logs.init = true;

    const sdkType = detectSdkType(namespace);
    const scriptType = detectScriptType();
    const reusedValue = reused ? 'yes' : 'no';
    log('INIT', 'sdk=' + sdkType + ' scriptType=' + scriptType + ' reusedApp=' + reusedValue);
  }

  function warnConfigMismatch(existingConfig, expectedConfig) {
    if (state.mismatchWarned) {
      return;
    }
    state.mismatchWarned = true;
    const expectedProject = expectedConfig && expectedConfig.projectId ? expectedConfig.projectId : 'unknown';
    const existingProject = existingConfig && existingConfig.projectId ? existingConfig.projectId : 'unknown';
    warn('INIT', 'firebase-config-mismatch reuse-existing-app expected=' + expectedProject + ' existing=' + existingProject);
  }

  function ensureConfig(boot) {
    resolveBoot(boot);
    const raw = readGlobalConfigCandidate();
    if (!raw && state.config) {
      return state.config;
    }
    if (!raw && !state.config) {
      throw new Error('Firebase configuration was not provided.');
    }

    const validated = validateConfig(raw);
    if (!state.config) {
      state.config = validated;
      logHostOnce(validated);
      logServiceWorkerOnce();
      return state.config;
    }

    if (!configsMatch(state.config, validated)) {
      warnConfigMismatch(state.config, validated);
    }
    return state.config;
  }

  function getFirebaseNamespace() {
    if (typeof global === 'undefined' || !global) {
      throw new Error('Firebase SDK is not available in this environment.');
    }
    const namespace = global.firebase;
    if (!namespace) {
      throw new Error('Firebase SDK failed to load.');
    }
    return namespace;
  }

  function ensureFirebaseApp(boot) {
    resolveBoot(boot);
    if (state.app) {
      return state.app;
    }
    const namespace = getFirebaseNamespace();
    const config = ensureConfig(boot);

    const hasCompatApps = namespace.apps && typeof namespace.apps.length === 'number';
    let apps = [];
    if (hasCompatApps) {
      apps = namespace.apps;
    } else if (typeof namespace.getApps === 'function') {
      try {
        const modularApps = namespace.getApps();
        if (modularApps && typeof modularApps.length === 'number') {
          apps = modularApps;
        }
      } catch (error) {
        apps = [];
      }
    }

    if (apps && apps.length > 0) {
      const existingApp = hasCompatApps
        ? (typeof namespace.app === 'function' ? namespace.app() : apps[0])
        : (typeof namespace.getApp === 'function' ? namespace.getApp() : apps[0]);
      const existingConfig = existingApp && existingApp.options ? existingApp.options : null;
      if (existingConfig && !configsMatch(existingConfig, config)) {
        warnConfigMismatch(existingConfig, config);
      }
      state.app = existingApp;
      logInitOnce(namespace, true);
      return state.app;
    }

    if (typeof namespace.initializeApp !== 'function') {
      throw new Error('Firebase initializeApp method is not available.');
    }

    state.app = namespace.initializeApp(config);
    logInitOnce(namespace, false);
    return state.app;
  }

  function ensureAuth(boot) {
    resolveBoot(boot);
    if (state.auth) {
      return state.auth;
    }
    const namespace = getFirebaseNamespace();
    if (typeof namespace.auth !== 'function') {
      throw new Error('Firebase Auth SDK is not available.');
    }
    ensureFirebaseApp(boot);
    state.auth = namespace.auth();
    return state.auth;
  }

  function ensureFirestore(boot) {
    resolveBoot(boot);
    if (state.firestore) {
      return state.firestore;
    }
    const namespace = getFirebaseNamespace();
    if (typeof namespace.firestore !== 'function') {
      throw new Error('Firebase Firestore SDK is not available.');
    }
    ensureFirebaseApp(boot);
    state.firestore = namespace.firestore();
    state.fieldValue = namespace.firestore && namespace.firestore.FieldValue ? namespace.firestore.FieldValue : null;
    return state.firestore;
  }

  function ensureFieldValue(boot) {
    ensureFirestore(boot);
    return state.fieldValue;
  }

  function bootstrap(boot) {
    const resolvedBoot = resolveBoot(boot);
    const namespace = getFirebaseNamespace();
    const app = ensureFirebaseApp(resolvedBoot);
    const auth = ensureAuth(resolvedBoot);
    const firestore = ensureFirestore(resolvedBoot);
    const config = ensureConfig(resolvedBoot);

    return {
      firebase: namespace,
      app: app,
      auth: auth,
      firestore: firestore,
      fieldValue: state.fieldValue,
      config: config,
    };
  }

  const api = {
    bootstrap: bootstrap,
    getApp: ensureFirebaseApp,
    getAuth: ensureAuth,
    getFirestore: ensureFirestore,
    getFieldValue: ensureFieldValue,
    getConfig: ensureConfig,
  };

  if (!global.__StickFightFirebaseBootstrap) {
    global.__StickFightFirebaseBootstrap = api;
  }
})(typeof window !== 'undefined' ? window : typeof globalThis !== 'undefined' ? globalThis : this);
