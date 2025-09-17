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
      initMeta: null,
    },
    keyCheck: {
      promise: null,
      status: 'idle',
      error: null,
      result: null,
      loggedStart: false,
      loggedOk: false,
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

  function logServiceWorkerOnce(boot) {
    if (state.logs.sw) {
      return;
    }
    state.logs.sw = true;

    const resolvedBoot = resolveBoot(boot);
    const bootFlags =
      resolvedBoot && resolvedBoot.flags && typeof resolvedBoot.flags === 'object'
        ? resolvedBoot.flags
        : null;
    const debugMode = !!(bootFlags && bootFlags.debug);
    if (debugMode) {
      log('SW', 'registered=no (debug)');
      return;
    }

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

  function getApiKeyHead(value) {
    if (typeof value !== 'string' || value === '') {
      return 'missing';
    }
    return value.slice(0, 6);
  }

  function extractProjectIdFromResponse(data) {
    if (!data || typeof data !== 'object') {
      return null;
    }
    if (typeof data.projectId === 'string' && data.projectId !== '') {
      return data.projectId;
    }
    if (typeof data.project_id === 'string' && data.project_id !== '') {
      return data.project_id;
    }
    return null;
  }

  function buildV1KeyUrl(projectId, apiKey) {
    return (
      'https://identitytoolkit.googleapis.com/v1/projects/' +
      encodeURIComponent(projectId) +
      '/config?key=' +
      encodeURIComponent(apiKey)
    );
  }

  function buildV3KeyUrl(projectId, apiKey) {
    return (
      'https://www.googleapis.com/identitytoolkit/v3/relyingparty/getProjectConfig?key=' +
      encodeURIComponent(apiKey) +
      '&project=' +
      encodeURIComponent(projectId)
    );
  }

  function fetchProjectConfig(url, source) {
    if (typeof fetch !== 'function') {
      const fetchError = new Error('Fetch API is not available for Firebase key verification.');
      fetchError.code = 'key/no-fetch';
      fetchError.source = source;
      fetchError.url = url;
      return Promise.reject(fetchError);
    }
    return fetch(url)
      .then(function (response) {
        if (!response) {
          const responseError = new Error('No response received when verifying Firebase key.');
          responseError.code = 'key/no-response';
          responseError.source = source;
          responseError.url = url;
          throw responseError;
        }
        if (response.status !== 200) {
          const statusError = new Error('Firebase key verification failed with HTTP ' + response.status + '.');
          statusError.code = 'key/http';
          statusError.httpStatus = response.status;
          statusError.source = source;
          statusError.url = url;
          throw statusError;
        }
        return response
          .json()
          .catch(function () {
            return {};
          })
          .then(function (body) {
            return {
              body: body || {},
              source: source,
            };
          });
      })
      .catch(function (error) {
        if (!error || typeof error !== 'object') {
          return Promise.reject(error);
        }
        if (!Object.prototype.hasOwnProperty.call(error, 'code')) {
          error.code = 'key/fetch';
        }
        if (!Object.prototype.hasOwnProperty.call(error, 'source')) {
          error.source = source;
        }
        if (!Object.prototype.hasOwnProperty.call(error, 'url')) {
          error.url = url;
        }
        return Promise.reject(error);
      });
  }

  function recordKeyCheckFailure(message, code, detail, originalError) {
    state.keyCheck.status = 'error';
    state.keyCheck.error = {
      message: message,
      code: code,
      detail: detail || null,
    };
    state.keyCheck.result = null;
    log('KEY][ERR', message);

    const baseError = originalError && typeof originalError === 'object' ? originalError : new Error(message);
    try {
      baseError.message = message;
    } catch (error) {
      // Ignore if message is read-only.
    }
    baseError.code = baseError.code || code;
    if (detail && !baseError.detail) {
      baseError.detail = detail;
    }
    baseError.__keyCheckHandled = true;
    return baseError;
  }

  function getKeyCheckStatus() {
    return {
      status: state.keyCheck.status,
      error: state.keyCheck.error,
      result: state.keyCheck.result,
    };
  }

  function verifyKey(boot) {
    resolveBoot(boot);
    if (state.keyCheck.promise) {
      return state.keyCheck.promise;
    }

    const config = ensureConfig(boot);
    const projectId = config && typeof config.projectId === 'string' ? config.projectId : '';
    const apiKey = config && typeof config.apiKey === 'string' ? config.apiKey : '';
    const apiKeyHead = getApiKeyHead(apiKey);

    if (!state.keyCheck.loggedStart) {
      state.keyCheck.loggedStart = true;
      log('KEY', 'check=start projectId=' + projectId + ' apiKeyHead=' + apiKeyHead);
    }

    if (!projectId || !apiKey) {
      const failure = recordKeyCheckFailure(
        'API key does not belong to projectId=' + (projectId || 'unknown') + ' (HTTP invalid-config)',
        'key/invalid-config',
        {
          expectedProjectId: projectId || null,
        }
      );
      state.keyCheck.promise = Promise.reject(failure);
      return state.keyCheck.promise;
    }

    state.keyCheck.status = 'pending';
    state.keyCheck.error = null;
    state.keyCheck.result = null;

    const v1Url = buildV1KeyUrl(projectId, apiKey);
    const v3Url = buildV3KeyUrl(projectId, apiKey);

    const verificationPromise = fetchProjectConfig(v1Url, 'v1')
      .catch(function (primaryError) {
        return fetchProjectConfig(v3Url, 'v3').catch(function (fallbackError) {
          fallbackError.primaryError = primaryError;
          throw fallbackError;
        });
      })
      .then(function (result) {
        const remoteProjectId = extractProjectIdFromResponse(result && result.body);
        if (remoteProjectId === projectId) {
          state.keyCheck.status = 'ok';
          state.keyCheck.error = null;
          state.keyCheck.result = {
            projectId: remoteProjectId,
            source: result ? result.source : null,
          };
          if (!state.keyCheck.loggedOk) {
            state.keyCheck.loggedOk = true;
            log('KEY', 'check=ok (matched project)');
          }
          return state.keyCheck.result;
        }

        const detail = {
          expectedProjectId: projectId,
          receivedProjectId: remoteProjectId || null,
          source: result ? result.source : null,
        };
        const message =
          'API key does not belong to projectId=' + projectId + ' (got=' + (remoteProjectId || 'missing') + ')';
        throw recordKeyCheckFailure(message, 'key/mismatch', detail);
      })
      .catch(function (error) {
        if (error && error.__keyCheckHandled) {
          throw error;
        }

        const status =
          typeof error === 'object' && error
            ? typeof error.httpStatus === 'number'
              ? error.httpStatus
              : typeof error.status === 'number'
              ? error.status
              : null
            : null;
        const statusLabel = status === null ? 'network-error' : String(status);
        const detail = {
          expectedProjectId: projectId,
          httpStatus: status,
          source: error && typeof error === 'object' ? error.source : null,
          url: error && typeof error === 'object' ? error.url : null,
        };
        throw recordKeyCheckFailure(
          'API key does not belong to projectId=' + projectId + ' (HTTP ' + statusLabel + ')',
          'key/http',
          detail,
          error && error instanceof Error ? error : null
        );
      });

    state.keyCheck.promise = verificationPromise;
    return verificationPromise;
  }

  function updateInitLogMetadata(partial) {
    if (!state.logs.initMeta) {
      state.logs.initMeta = {
        sdkType: null,
        scriptType: null,
        appInitRequested: false,
        reusedApp: false,
        apps: 0,
      };
    }

    const meta = state.logs.initMeta;
    if (partial && typeof partial === 'object') {
      if (Object.prototype.hasOwnProperty.call(partial, 'sdkType')) {
        meta.sdkType = partial.sdkType;
      }
      if (Object.prototype.hasOwnProperty.call(partial, 'scriptType')) {
        meta.scriptType = partial.scriptType;
      }
      if (Object.prototype.hasOwnProperty.call(partial, 'appInitRequested')) {
        meta.appInitRequested = !!partial.appInitRequested;
      }
      if (Object.prototype.hasOwnProperty.call(partial, 'reusedApp')) {
        meta.reusedApp = !!partial.reusedApp;
      }
      if (Object.prototype.hasOwnProperty.call(partial, 'apps')) {
        meta.apps = typeof partial.apps === 'number' ? partial.apps : meta.apps;
      }
    }

    return meta;
  }

  function logInitOnce(namespace, metadata) {
    const meta = updateInitLogMetadata(metadata);

    if (meta.sdkType === null) {
      meta.sdkType = detectSdkType(namespace);
    }
    if (meta.scriptType === null) {
      meta.scriptType = detectScriptType();
    }

    if (state.logs.init) {
      return;
    }
    state.logs.init = true;

    const reusedValue = meta.reusedApp ? 'yes' : 'no';
    const initRequestedValue = meta.appInitRequested ? 'yes' : 'no';
    const appsValue = typeof meta.apps === 'number' ? meta.apps : 0;

    log(
      'INIT',
      'sdk=' +
        meta.sdkType +
        ' scriptType=' +
        meta.scriptType +
        ' appInitRequested=' +
        initRequestedValue +
        ' reusedApp=' +
        reusedValue +
        ' apps=' +
        appsValue
    );
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
    logServiceWorkerOnce(boot);
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
      logServiceWorkerOnce(boot);
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

    const appsCount = apps && typeof apps.length === 'number' ? apps.length : 0;
    const metadata = {
      sdkType: detectSdkType(namespace),
      scriptType: detectScriptType(),
      apps: appsCount,
      reusedApp: false,
      appInitRequested: false,
    };

    if (state.app) {
      metadata.reusedApp = true;
      logInitOnce(namespace, metadata);
      return state.app;
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
      metadata.reusedApp = true;
      logInitOnce(namespace, metadata);
      return state.app;
    }

    if (typeof namespace.initializeApp !== 'function') {
      throw new Error('Firebase initializeApp method is not available.');
    }

    metadata.appInitRequested = true;
    state.app = namespace.initializeApp(config);
    logInitOnce(namespace, metadata);
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
    verifyKey: verifyKey,
    getKeyCheckStatus: getKeyCheckStatus,
  };

  if (!global.__StickFightFirebaseBootstrap) {
    global.__StickFightFirebaseBootstrap = api;
  }
})(typeof window !== 'undefined' ? window : typeof globalThis !== 'undefined' ? globalThis : this);
