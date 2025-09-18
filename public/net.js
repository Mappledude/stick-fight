(function (global) {
  'use strict';

  const Boot = (() => {
    if (global && typeof global.__StickFightBoot === 'object') {
      return global.__StickFightBoot;
    }
    const noop = () => undefined;
    return {
      flags: { debug: false, safe: false, nofs: false, nolobby: false },
      log: noop,
    };
  })();

  const bootLog = (tag, message, detail) => {
    if (Boot && typeof Boot.log === 'function') {
      Boot.log(tag, message, detail);
    } else if (typeof console !== 'undefined' && console && typeof console.log === 'function') {
      const label = '[' + tag + '] ' + message;
      if (typeof detail !== 'undefined') {
        console.log(label, detail);
      } else {
        console.log(label);
      }
    }
  };

  const bootFlags = Boot && Boot.flags ? Boot.flags : { debug: false, safe: false, nofs: false, nolobby: false };
  const NETWORK_DISABLED = !!(bootFlags.safe || bootFlags.nolobby);

  if (NETWORK_DISABLED) {
    bootLog('ROUTE', 'net-module-disabled', { safe: bootFlags.safe, nolobby: bootFlags.nolobby });
  }

  const netState = {
    initialized: false,
    firestore: null,
    functions: null,
    fieldValue: null,
    auth: null,
    roomId: null,
    peerId: null,
    isHost: false,
    playerName: null,
    playerColor: null,
    playerCodeWord: null,
    roomName: null,
    roomStructure: null,
    shareUrl: null,
  };

  const overlayState = {
    overlay: null,
    panel: null,
    isAdmin: false,
    fatalError: false,
    fatalMessage: null,
    pendingFatalMessage: null,
    contentLocked: false,
    overlayInitRequested: false,
    bannerMessage: null,
    activeView: 'lobby',
    routeHandlerAttached: false,
    adminAddCode: '',
    selectedStructure: '',
  };

  const ADMIN_ADD_CODE_STORAGE_KEY = 'stickfight.adminAddCode';
  const PLAYER_IDENTITY_STORAGE_KEY = 'stickfight.playerIdentity';
  const DEFAULT_IDENTITY_COLOR = '#FFFFFF';
  const IDENTITY_COLOR_REGEX = /^#[0-9A-F]{6}$/;

  const identityState = {
    loaded: false,
    value: null,
  };

  const DEFAULT_ROOM_STRUCTURES = Object.freeze([
    { value: 'random', label: 'Random' },
    { value: 'gauntlet', label: 'Gauntlet' },
    { value: 'tower', label: 'Tower' },
  ]);

  let cachedRoomStructureOptions = null;

  const getSessionStorage = () => {
    if (typeof window === 'undefined') {
      return null;
    }
    try {
      if (window.sessionStorage) {
        return window.sessionStorage;
      }
    } catch (error) {
      return null;
    }
    return null;
  };

  const readSessionValue = (key) => {
    if (!key) {
      return '';
    }
    const storage = getSessionStorage();
    if (!storage) {
      return '';
    }
    try {
      return storage.getItem(key) || '';
    } catch (error) {
      return '';
    }
  };

  const writeSessionValue = (key, value) => {
    if (!key) {
      return;
    }
    const storage = getSessionStorage();
    if (!storage) {
      return;
    }
    try {
      if (value) {
        storage.setItem(key, value);
      } else {
        storage.removeItem(key);
      }
    } catch (error) {
      // ignore storage errors
    }
  };

  const getLocalStorage = () => {
    if (typeof window === 'undefined') {
      return null;
    }
    try {
      if (window.localStorage) {
        return window.localStorage;
      }
    } catch (error) {
      return null;
    }
    return null;
  };

  const normalizeIdentityColor = (value) => {
    if (typeof value !== 'string') {
      return DEFAULT_IDENTITY_COLOR;
    }
    const trimmed = value.trim().toUpperCase();
    return IDENTITY_COLOR_REGEX.test(trimmed) ? trimmed : DEFAULT_IDENTITY_COLOR;
  };

  const sanitizeCodeWord = (value) => {
    if (typeof value !== 'string') {
      return '';
    }
    const trimmed = value.trim().toUpperCase();
    return /^[A-Z]{4}$/.test(trimmed) ? trimmed : '';
  };

  const normalizePlayerIdentity = (raw) => {
    if (!raw || typeof raw !== 'object') {
      return null;
    }
    const codeWord = sanitizeCodeWord(raw.codeWord);
    const name = typeof raw.name === 'string' ? raw.name.trim() : '';
    if (!codeWord || !name) {
      return null;
    }
    const color = normalizeIdentityColor(raw.color);
    return { codeWord, name, color };
  };

  const persistIdentityToStorage = (identity) => {
    const storage = getLocalStorage();
    if (!storage) {
      return;
    }
    try {
      if (identity) {
        storage.setItem(PLAYER_IDENTITY_STORAGE_KEY, JSON.stringify(identity));
      } else {
        storage.removeItem(PLAYER_IDENTITY_STORAGE_KEY);
      }
    } catch (error) {
      // ignore storage errors
    }
  };

  const applyIdentityToNetState = (identity) => {
    if (identity) {
      netState.playerName = identity.name;
      netState.playerColor = identity.color;
      netState.playerCodeWord = identity.codeWord;
    } else {
      netState.playerName = null;
      netState.playerColor = null;
      netState.playerCodeWord = null;
    }
  };

  const loadIdentityFromStorage = () => {
    identityState.loaded = true;
    identityState.value = null;
    const storage = getLocalStorage();
    if (!storage) {
      return null;
    }
    try {
      const stored = storage.getItem(PLAYER_IDENTITY_STORAGE_KEY);
      if (!stored) {
        applyIdentityToNetState(null);
        return null;
      }
      const parsed = JSON.parse(stored);
      const normalized = normalizePlayerIdentity(parsed);
      if (normalized) {
        identityState.value = normalized;
        applyIdentityToNetState(normalized);
        return normalized;
      }
      storage.removeItem(PLAYER_IDENTITY_STORAGE_KEY);
      applyIdentityToNetState(null);
    } catch (error) {
      try {
        storage.removeItem(PLAYER_IDENTITY_STORAGE_KEY);
      } catch (_) {
        // ignore
      }
      applyIdentityToNetState(null);
    }
    return null;
  };

  const getPlayerIdentity = () => {
    if (!identityState.loaded) {
      return loadIdentityFromStorage();
    }
    return identityState.value;
  };

  const setPlayerIdentity = (identity) => {
    const normalized = normalizePlayerIdentity(identity);
    identityState.loaded = true;
    identityState.value = normalized;
    persistIdentityToStorage(normalized);
    applyIdentityToNetState(normalized || null);
    return normalized;
  };

  const clearPlayerIdentity = () => {
    identityState.loaded = true;
    identityState.value = null;
    persistIdentityToStorage(null);
    applyIdentityToNetState(null);
  };

  const resolveRoomStructureOptions = () => {
    if (cachedRoomStructureOptions) {
      return cachedRoomStructureOptions;
    }
    const bootStructures = Boot && Array.isArray(Boot.structures) ? Boot.structures : null;
    const normalized = [];
    if (Array.isArray(bootStructures)) {
      for (let i = 0; i < bootStructures.length; i += 1) {
        const entry = bootStructures[i];
        if (!entry) {
          continue;
        }
        if (typeof entry === 'string') {
          const trimmed = entry.trim();
          if (!trimmed) {
            continue;
          }
          normalized.push({ value: trimmed, label: trimmed });
          continue;
        }
        if (typeof entry === 'object' && typeof entry.value === 'string') {
          const trimmedValue = entry.value.trim();
          if (!trimmedValue) {
            continue;
          }
          const label =
            typeof entry.label === 'string' && entry.label.trim()
              ? entry.label.trim()
              : trimmedValue;
          normalized.push({ value: trimmedValue, label });
        }
      }
    }
    if (normalized.length > 0) {
      cachedRoomStructureOptions = normalized;
      return cachedRoomStructureOptions;
    }
    cachedRoomStructureOptions = DEFAULT_ROOM_STRUCTURES;
    return cachedRoomStructureOptions;
  };

  const getDefaultRoomStructure = () => {
    const options = resolveRoomStructureOptions();
    return options && options.length > 0 ? options[0].value : 'random';
  };

  const sanitizeRoomName = (value) => {
    const raw = typeof value === 'string' ? value : '';
    const trimmed = raw.trim().replace(/\s+/g, ' ');
    if (!trimmed) {
      return 'New Room';
    }
    const maxLength = 64;
    return trimmed.length > maxLength ? trimmed.slice(0, maxLength) : trimmed;
  };

  const normalizeStructureValue = (value) => {
    const options = resolveRoomStructureOptions();
    const raw = typeof value === 'string' ? value.trim() : '';
    if (!raw) {
      return getDefaultRoomStructure();
    }
    const lowerRaw = raw.toLowerCase();
    for (let i = 0; i < options.length; i += 1) {
      const option = options[i];
      if (!option || !option.value) {
        continue;
      }
      if (option.value.toLowerCase() === lowerRaw) {
        return option.value;
      }
    }
    return getDefaultRoomStructure();
  };

  const normalizeHexColorInput = (value) => {
    if (typeof value !== 'string') {
      return '';
    }
    let trimmed = value.trim();
    if (!trimmed) {
      return '';
    }
    if (trimmed.charAt(0) !== '#') {
      trimmed = `#${trimmed}`;
    }
    if (trimmed.length === 4) {
      const shorthand = trimmed.slice(1);
      trimmed =
        '#' + shorthand.charAt(0) + shorthand.charAt(0) + shorthand.charAt(1) + shorthand.charAt(1) + shorthand.charAt(2) + shorthand.charAt(2);
    }
    const upper = trimmed.toUpperCase();
    if (!/^#[0-9A-F]{6}$/.test(upper)) {
      return '';
    }
    return upper;
  };

  const getStoredAdminAddCode = () => {
    if (overlayState.adminAddCode && overlayState.adminAddCode.trim()) {
      return overlayState.adminAddCode.trim();
    }
    const stored = readSessionValue(ADMIN_ADD_CODE_STORAGE_KEY);
    if (stored && stored.trim()) {
      overlayState.adminAddCode = stored.trim();
      return overlayState.adminAddCode;
    }
    return '';
  };

  const persistAdminAddCode = (value) => {
    const sanitized = typeof value === 'string' ? value.trim() : '';
    overlayState.adminAddCode = sanitized;
    writeSessionValue(ADMIN_ADD_CODE_STORAGE_KEY, sanitized);
  };

  const lobbyRoomsState = {
    rooms: [],
    unsubscribe: null,
    listening: false,
  };

  const FirebaseBootstrap = (function resolveFirebaseBootstrap(scope) {
    if (!scope) {
      return null;
    }
    if (typeof scope.__StickFightFirebaseBootstrap === 'object') {
      return scope.__StickFightFirebaseBootstrap;
    }
    if (typeof scope.FirebaseBootstrap === 'object') {
      return scope.FirebaseBootstrap;
    }
    return null;
  })(global);

  const FirebaseConfigModule =
    global && typeof global.__StickFightFirebaseConfigModule === 'object'
      ? global.__StickFightFirebaseConfigModule
      : null;

  const showFatalBanner = (message) => {
    if (Boot && typeof Boot.error === 'function') {
      Boot.error(new Error(message), 'AUTH');
      return;
    }
    if (typeof console !== 'undefined' && console && typeof console.error === 'function') {
      console.error('[BANNER] ' + message);
    }
  };

  const resolveFirebaseConfig = () => {
    if (FirebaseBootstrap && typeof FirebaseBootstrap.getFirebaseConfig === 'function') {
      return FirebaseBootstrap.getFirebaseConfig();
    }
    if (FirebaseConfigModule && typeof FirebaseConfigModule.getFirebaseConfig === 'function') {
      return FirebaseConfigModule.getFirebaseConfig();
    }
    if (global && typeof global.getFirebaseConfig === 'function') {
      return global.getFirebaseConfig();
    }
    return null;
  };

  const describeFirebaseConfig = () => {
    let config = null;
    try {
      config = resolveFirebaseConfig();
    } catch (error) {
      config = null;
    }
    const projectId = config && typeof config.projectId === 'string' ? config.projectId : 'missing';
    const authDomain = config && typeof config.authDomain === 'string' ? config.authDomain : 'missing';
    const apiKey = config && typeof config.apiKey === 'string' ? config.apiKey : '';
    const apiKeyHead = apiKey ? apiKey.slice(0, 6) : 'missing';
    return { config, projectId, authDomain, apiKeyHead };
  };

  const logConfigScope = (scope) => {
    const { projectId, authDomain, apiKeyHead } = describeFirebaseConfig();
    const message =
      'scope=' +
      scope +
      ' projectId=' +
      projectId +
      ' authDomain=' +
      authDomain +
      ' apiKeyHead=' +
      apiKeyHead;
    bootLog('CFG', message);
  };

  let firebaseAppInstance = null;

  const ensureFirebaseApp = () => {
    if (NETWORK_DISABLED) {
      throw new Error('Networking disabled by query flags.');
    }
    if (firebaseAppInstance) {
      return firebaseAppInstance;
    }
    if (!FirebaseBootstrap || typeof FirebaseBootstrap.initFirebase !== 'function') {
      throw new Error('Firebase bootstrap helper unavailable.');
    }
    firebaseAppInstance = FirebaseBootstrap.initFirebase();
    return firebaseAppInstance;
  };

  const firebaseNamespace = () => {
    if (typeof global.firebase !== 'undefined') {
      return global.firebase;
    }
    return null;
  };

  const ensureFirestore = () => {
    if (netState.firestore) {
      return netState.firestore;
    }
    const firebase = firebaseNamespace();
    if (!firebase || typeof firebase.firestore !== 'function') {
      throw new Error('Firestore SDK is not available.');
    }
    const app = ensureFirebaseApp();
    const firestoreInstance = firebase.firestore(app);
    if (!firestoreInstance) {
      throw new Error('Firestore SDK is not available.');
    }
    netState.firestore = firestoreInstance;
    if (!netState.fieldValue && firebase.firestore && firebase.firestore.FieldValue) {
      netState.fieldValue = firebase.firestore.FieldValue;
    }
    return firestoreInstance;
  };

  const ensureFunctions = () => {
    if (netState.functions) {
      return netState.functions;
    }
    const firebase = firebaseNamespace();
    if (!firebase || typeof firebase.functions !== 'function') {
      throw new Error('Functions SDK is not available.');
    }
    const app = ensureFirebaseApp();
    const functionsInstance = firebase.functions(app);
    if (!functionsInstance) {
      throw new Error('Functions SDK is not available.');
    }
    netState.functions = functionsInstance;
    return functionsInstance;
  };

  const ensureKeyVerification = async () => {
    if (!FirebaseBootstrap || typeof FirebaseBootstrap.verifyKey !== 'function') {
      return;
    }
    try {
      await FirebaseBootstrap.verifyKey(Boot);
    } catch (error) {
      let status = null;
      try {
        status =
          typeof FirebaseBootstrap.getKeyCheckStatus === 'function'
            ? FirebaseBootstrap.getKeyCheckStatus(Boot)
            : null;
      } catch (statusError) {
        status = null;
      }
      const detailMessage =
        (status && status.error && typeof status.error.message === 'string' && status.error.message) ||
        (error && typeof error.message === 'string' ? error.message : 'API key verification failed.');
      const banner = '[KEY][ERR] ' + detailMessage;
      renderKeyVerificationError(banner);
      if (Boot && typeof Boot.error === 'function') {
        try {
          Boot.error(error, 'KEY');
        } catch (bootError) {
          // Ignore Boot.error failures.
        }
      }
      throw error;
    }
  };

// --- Auth bootstrap (namespaced Firebase v8 style) ---------------------------
let _authInstance = null;
let _signInPromise = null;

/** Return the firebase.auth() singleton, initializing Firebase app if needed. */
function ensureAuth() {
  if (NETWORK_DISABLED) {
    throw new Error('Networking disabled by query flags.');
  }
  if (_authInstance) {
    return _authInstance;
  }

  const firebase = firebaseNamespace();
  if (!firebase || typeof firebase.auth !== 'function') {
    throw new Error('Firebase Auth SDK is not available.');
  }

  const app = ensureFirebaseApp();
  const authInstance = firebase.auth(app);
  if (!authInstance) {
    throw new Error('Firebase Auth SDK is not available.');
  }

  _authInstance = authInstance;
  bootLog('AUTH', 'auth-instance-ready');
  return _authInstance;
}

/**
 * Ensure there is a signed-in user (anonymous).
 * - De-dupes concurrent calls via a shared promise.
 * - Resolves with { auth, user }.
 */
async function ensureSignedInUser() {
  await ensureKeyVerification();
  const auth = ensureAuth();

  // Already signed in?
  if (auth.currentUser) {
    const uid = auth.currentUser.uid || 'missing';
    bootLog('AUTH', `result code=ok uid=${uid}`);
    return { auth, user: auth.currentUser };
  }

  if (_signInPromise) {
    const user = await _signInPromise;
    return { auth, user };
  }

  // Start a new anonymous sign-in, memoized.
  if (typeof auth.signInAnonymously !== 'function') {
    throw new Error('Firebase Auth does not support anonymous sign-in.');
  }

  bootLog('AUTH', 'start');
  _signInPromise = auth
    .signInAnonymously()
    .then((cred) => {
      _signInPromise = null;
      const user = (cred && cred.user) || auth.currentUser;
      if (!user) {
        throw new Error('no-user-after-anon');
      }
      const uid = user.uid || 'missing';
      bootLog('AUTH', `result code=ok uid=${uid}`);
      return user;
    })
    .catch((err) => {
      _signInPromise = null;
      const code = err && typeof err.code === 'string' ? err.code : 'error';
      const rawMessage = err && typeof err.message === 'string' ? err.message : String(err || 'auth-error');
      if (typeof console !== 'undefined' && console && typeof console.error === 'function') {
        console.error('[AUTH] result code=' + code + ' message=' + rawMessage);
      }
      showFatalBanner('Auth failed: ' + code);
      throw err;
    });

  const user = await _signInPromise;
  return { auth, user };
}

/** Optional: legacy/compat alias for callers expecting a “ready” function. */
function ensureAuthReady() {
  return ensureSignedInUser().then(() => undefined);
}

  let lastEnsureAppAndUserMeta = null;

  async function ensureAppAndUser() {
    if (NETWORK_DISABLED) {
      throw new Error('Networking disabled by query flags.');
    }
    if (!FirebaseBootstrap || typeof FirebaseBootstrap.initFirebase !== 'function') {
      throw new Error('Firebase bootstrap helper unavailable.');
    }
    if (typeof FirebaseBootstrap.ensureSignedInUser !== 'function') {
      throw new Error('Firebase bootstrap helper unavailable.');
    }

    const firebase = firebaseNamespace();
    const appsBefore = firebase && firebase.apps ? firebase.apps.length : 0;
    const app = FirebaseBootstrap.initFirebase();
    if (!firebaseAppInstance) {
      firebaseAppInstance = app;
    }
    const result = await FirebaseBootstrap.ensureSignedInUser();
    const auth = result && result.auth ? result.auth : null;
    const user = result && result.user ? result.user : null;
    const firebaseAfter = firebaseNamespace();
    const appsAfter = firebaseAfter && firebaseAfter.apps ? firebaseAfter.apps.length : appsBefore;
    lastEnsureAppAndUserMeta = {
      appsBefore,
      appsAfter,
    };
    return { app, auth, user };
  }

  const logAppAndUserGuard = (guardResult) => {
    if (!guardResult) {
      return;
    }
    const meta = lastEnsureAppAndUserMeta || {};
    const firebase = firebaseNamespace();
    const appsAfter =
      typeof meta.appsAfter === 'number'
        ? meta.appsAfter
        : firebase && firebase.apps
        ? firebase.apps.length
        : 0;
    const reused =
      typeof meta.appsBefore === 'number'
        ? meta.appsBefore > 0
          ? 'yes'
          : 'no'
        : appsAfter > 1
        ? 'yes'
        : appsAfter > 0
        ? 'no'
        : 'unknown';
    bootLog('INIT', `sdk=compat scriptType=classic appInitRequested=yes reusedApp=${reused} apps=${appsAfter}`);
    const auth = guardResult.auth || null;
    const user = guardResult.user || (auth && auth.currentUser) || null;
    const uid = user && user.uid ? user.uid : 'missing';
    bootLog('AUTH', `uid=${uid}`);
  };

  const ensureAdminPrivileges = async () => {
    const { auth, user } = await ensureSignedInUser();
    const currentUser = user || (auth && auth.currentUser) || null;
    overlayState.isAdmin = true;
    return { auth, user: currentUser, claims: {} };
  };

  const namespace = global.StickFightNet || {};


  const getTimestampValue = () => {
    const firebase = firebaseNamespace();
    if (netState.fieldValue && typeof netState.fieldValue.serverTimestamp === 'function') {
      return netState.fieldValue.serverTimestamp();
    }
    if (firebase && firebase.firestore && firebase.firestore.Timestamp && typeof firebase.firestore.Timestamp.now === 'function') {
      return firebase.firestore.Timestamp.now();
    }
    return new Date();
  };

  const getServerTimestamp = () => {
    if (netState.fieldValue && typeof netState.fieldValue.serverTimestamp === 'function') {
      return netState.fieldValue.serverTimestamp();
    }
    const firebase = firebaseNamespace();
    if (
      firebase &&
      firebase.firestore &&
      firebase.firestore.FieldValue &&
      typeof firebase.firestore.FieldValue.serverTimestamp === 'function'
    ) {
      return firebase.firestore.FieldValue.serverTimestamp();
    }
    return getTimestampValue();
  };

  const identityNamespace = () => {
    if (global && typeof global.StickFightIdentity === 'object') {
      return global.StickFightIdentity;
    }
    if (global && global.StickFightNet && typeof global.StickFightNet.identity === 'object') {
      return global.StickFightNet.identity;
    }
    return null;
  };

  const randomId = () => {
    const cryptoObj = typeof global.crypto !== 'undefined' ? global.crypto : null;
    if (cryptoObj && typeof cryptoObj.randomUUID === 'function') {
      return cryptoObj.randomUUID();
    }
    const values =
      cryptoObj && typeof cryptoObj.getRandomValues === 'function'
        ? cryptoObj.getRandomValues(new Uint8Array(16))
        : Array.from({ length: 16 }, () => Math.floor(Math.random() * 256));
    return Array.from(values, (value) => value.toString(16).padStart(2, '0')).join('');
  };

  const getDeviceId = () => {
    const identity = identityNamespace();
    if (identity && typeof identity.getDeviceId === 'function') {
      try {
        const resolved = identity.getDeviceId();
        if (resolved) {
          return resolved;
        }
      } catch (error) {
        // fall through to storage fallback
      }
    }
    try {
      const storage = global && global.localStorage ? global.localStorage : null;
      if (!storage) {
        return randomId();
      }
      const existing = storage.getItem('deviceId');
      if (typeof existing === 'string' && existing) {
        return existing;
      }
      const next = randomId();
      storage.setItem('deviceId', next);
      return next;
    } catch (error) {
      return randomId();
    }
  };

  const alphabet = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  const fallbackAlphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

  const randomFromAlphabet = (alpha, length) => {
    const chars = [];
    const useAlphabet = typeof alpha === 'string' && alpha.length > 0 ? alpha : fallbackAlphabet;
    const size = typeof length === 'number' && length > 0 ? Math.floor(length) : 8;
    const cryptoObj = typeof global.crypto !== 'undefined' ? global.crypto : null;
    if (cryptoObj && typeof cryptoObj.getRandomValues === 'function') {
      const values = new Uint32Array(size);
      cryptoObj.getRandomValues(values);
      for (let i = 0; i < size; i += 1) {
        chars.push(useAlphabet[values[i] % useAlphabet.length]);
      }
      return chars.join('');
    }
    for (let i = 0; i < size; i += 1) {
      const index = Math.floor(Math.random() * useAlphabet.length);
      chars.push(useAlphabet[index]);
    }
    return chars.join('');
  };

  const generateRoomId = () => randomFromAlphabet(alphabet, 8);
  const generatePeerId = () => randomFromAlphabet(alphabet + alphabet.toLowerCase(), 20);

  const sanitizeRoomId = (value) => {
    if (typeof value !== 'string') {
      return '';
    }
    const trimmed = value.trim();
    if (!trimmed) {
      return '';
    }
    return /^[A-Za-z0-9_-]+$/.test(trimmed) ? trimmed : '';
  };

  const escapeHtml = (value) => {
    if (typeof value !== 'string') {
      return '';
    }
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  };

  const buildShareUrl = (roomId) => {
    const safeRoomId = typeof roomId === 'string' ? roomId : '';
    if (typeof window === 'undefined' || !window.location) {
      return `?room=${encodeURIComponent(safeRoomId)}`;
    }
    const origin = window.location.origin || '';
    const pathname = window.location.pathname || '';
    return `${origin}${pathname}?room=${encodeURIComponent(safeRoomId)}`;
  };

  const emitEvent = (name, detail) => {
    if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') {
      return;
    }
    const event = new CustomEvent(`stickfight:${name}`, { detail });
    window.dispatchEvent(event);
  };

  const runTransaction = async (fn) => {
    const firestore = ensureFirestore();
    if (typeof firestore.runTransaction === 'function') {
      return firestore.runTransaction(fn);
    }
    return fn({
      get: (ref) => ref.get(),
      set: (ref, value) => ref.set(value),
    });
  };

  const logMessage = (label, message, data) => {
    if (typeof console === 'undefined' || !console || typeof console.log !== 'function') {
      return;
    }
    if (data !== undefined) {
      console.log(`${label} ${message}`, data);
      return;
    }
    console.log(`${label} ${message}`);
  };

// ---------- Overlay error banner + Firestore error handling ----------

const ensureBannerElement = () => {
  if (!overlayState.panel) return null;
  if (typeof document === 'undefined') return null;

  let banner = overlayState.panel.querySelector('[data-stickfight-error-banner]');
  if (!banner) {
    banner = document.createElement('div');
    banner.className = 'stickfight-error-banner';
    banner.setAttribute('data-stickfight-error-banner', 'true');
    banner.setAttribute('hidden', 'hidden');
    overlayState.panel.insertBefore(banner, overlayState.panel.firstChild);
  }
  return banner;
};

const applyBannerMessage = () => {
  const banner = ensureBannerElement();
  if (!banner) return;
  const message = overlayState.bannerMessage;
  if (message) {
    banner.textContent = message;
    banner.removeAttribute('hidden');
  } else {
    banner.textContent = '';
    banner.setAttribute('hidden', 'hidden');
  }
};

const setBannerMessage = (message) => {
  overlayState.bannerMessage = message || null;
  if (overlayState.bannerMessage) {
    createStyles();
    ensureOverlay();
    if (overlayState.overlay) {
      overlayState.overlay.classList.remove('stickfight-hidden');
    }
  }
  applyBannerMessage();
};

const formatFirestoreErrorDetails = (op, error) => {
  const code = error && typeof error.code === 'string' ? error.code : 'unknown';
  const rawMessage =
    error && typeof error.message === 'string' && error.message
      ? error.message
      : String(error);
  return { code, message: rawMessage, formatted: `op=${op} code=${code} msg=${rawMessage}` };
};

const handleFirestoreError = (op, error) => {
  const details = formatFirestoreErrorDetails(op, error);
  const alreadyLogged =
    error && typeof error === 'object' && Object.prototype.hasOwnProperty.call(error, '__stickfightFsLogged');
  if (!alreadyLogged) {
    logMessage('[FS][ERR]', details.formatted, error);
    if (error && typeof error === 'object') {
      try { error.__stickfightFsLogged = true; } catch (_) { /* ignore RO errors */ }
    }
  }
  setBannerMessage(`[FS][ERR] ${details.formatted}`);
};

  const withFirestoreErrorHandling = async (op, action) => {
    try {
      return await action();
    } catch (error) {
      handleFirestoreError(op, error);
      throw error;
    }
  };

  const fetchPlayerIdentityByCodeWord = async (codeWord) =>
    withFirestoreErrorHandling('read', async () => {
      const sanitized = sanitizeCodeWord(codeWord);
      if (!sanitized) {
        return null;
      }
      const firestore = ensureFirestore();
      const snapshot = await firestore.collection('players').doc(sanitized).get();
      if (!snapshot || !snapshot.exists) {
        return null;
      }
      const data = snapshot.data() || {};
      if (data.active === false) {
        return null;
      }
      return normalizePlayerIdentity({
        codeWord: sanitized,
        name: data.name,
        color: data.color,
      });
    });

// ---------- Room creation (host) with device-lock & metadata ----------

  const createRoomRecord = async ({ hostUid, hostName, hostColor, hostCodeWord, roomName, structure }) =>
    withFirestoreErrorHandling('create', async () => {
      const firestore = ensureFirestore();
      const resolvedName = hostName && hostName.trim() ? hostName.trim() : 'Host';
      const resolvedRoomName = sanitizeRoomName(roomName);
      const resolvedStructure = normalizeStructureValue(structure);
      const resolvedColor = normalizeIdentityColor(hostColor);
      const resolvedCodeWord = sanitizeCodeWord(hostCodeWord);

      const roomId = generateRoomId();
      const hostPeerId = generatePeerId();

    const roomsCollection = firestore.collection('rooms');
    const roomRef = roomsCollection.doc(roomId);
    const playersRef = roomRef.collection('players').doc(hostUid);

    const deviceId =
      typeof getDeviceId === 'function'
        ? getDeviceId()
        : (window.NetUI && typeof window.NetUI.getDeviceId === 'function'
            ? window.NetUI.getDeviceId()
            : null);

    const ts =
      (typeof getServerTimestamp === 'function' && getServerTimestamp()) ||
      (typeof getTimestampValue === 'function' && getTimestampValue()) ||
      new Date();

    await runTransaction(async (transaction) => {
      const existing = await transaction.get(roomRef);
      if (existing && existing.exists) {
        throw new Error('A room with this ID already exists. Please try again.');
      }

      // Room metadata (authoritative fields set at creation)
      transaction.set(roomRef, {
        code: roomId,
        status: 'open',
        active: true,
        maxPlayers: 9,
        createdAt: ts,
        updatedAt: ts,
        lastActivityAt: ts,
        hostPeerId,
        hostUid,
        playerCount: 1,
        roomName: resolvedRoomName,
        structure: resolvedStructure,
      });

      // Host player document (device lock + identity)
      const hostPlayerPayload = {
        uid: hostUid,
        deviceId,
        peerId: hostPeerId,
        role: 'host',
        isHost: true,
        name: resolvedName,
        nick: resolvedName,
        color: resolvedColor,
        joinedAt: ts,
        lastSeenAt: ts,
        hp: 100,
      };
      if (resolvedCodeWord) {
        hostPlayerPayload.codeWord = resolvedCodeWord;
      }
      transaction.set(playersRef, hostPlayerPayload);
    });

    // Defensive post-commit touch (keeps lastActivity fresh; safe if identical)
    try {
      await roomRef.set({ updatedAt: ts, lastActivityAt: ts }, { merge: true });
    } catch (error) {
      logMessage('[ROOM]', `failed to update metadata for code=${roomId}`, error);
    }

    logMessage('[ROOM]', `created code=${roomId} host=${hostUid} peer=${hostPeerId}`);

    return {
      roomId,
      hostPeerId,
      hostUid,
      hostName: resolvedName,
      roomName: resolvedRoomName,
      structure: resolvedStructure,
    };
  });


  const createRoom = async (options) => {
    logConfigScope('room-create');
    let guardResult = null;
    if (!bootFlags.safe) {
      guardResult = await ensureAppAndUser();
      logAppAndUserGuard(guardResult);
    }
    const { auth, user } = guardResult || (await ensureSignedInUser());
    const currentUser = user || (auth && auth.currentUser);
    if (!currentUser || !currentUser.uid) {
      throw new Error('Unable to determine the authenticated user.');
    }
    const hostName = typeof options === 'string' ? options : options && options.name;
    const roomNameOption =
      options && typeof options === 'object' && typeof options.roomName === 'string'
        ? options.roomName
        : '';
    const structureOption =
      options && typeof options === 'object' && typeof options.structure === 'string'
        ? options.structure
        : '';
    const hostColorOption =
      options && typeof options === 'object' && typeof options.color === 'string'
        ? options.color
        : '';
    const hostCodeWordOption =
      options && typeof options === 'object' && typeof options.codeWord === 'string'
        ? options.codeWord
        : '';
    const resolvedHostName = hostName && hostName.trim() ? hostName.trim() : 'Host';
    const resolvedHostColor = normalizeIdentityColor(hostColorOption);
    const resolvedHostCodeWord = sanitizeCodeWord(hostCodeWordOption);
    const record = await createRoomRecord({
      hostUid: currentUser.uid,
      hostName: resolvedHostName,
      hostColor: resolvedHostColor,
      hostCodeWord: resolvedHostCodeWord,
      roomName: roomNameOption,
      structure: structureOption,
    });
    const { roomId, hostPeerId, roomName: createdRoomName, structure: createdStructure } = record;

    const shareUrl = buildShareUrl(roomId);
    netState.roomId = roomId;
    netState.peerId = hostPeerId;
    netState.isHost = true;
    netState.playerName = resolvedHostName;
    netState.playerColor = resolvedHostColor;
    netState.playerCodeWord = resolvedHostCodeWord || null;
    netState.roomName = createdRoomName;
    netState.roomStructure = createdStructure;
    netState.shareUrl = shareUrl;
    netState.initialized = true;

    logMessage('[ROOM]', `created id=${roomId} code=${roomId}`);

    emitEvent('roomCreated', {
      roomId,
      hostPeerId,
      shareUrl,
      name: resolvedHostName,
      color: resolvedHostColor,
      codeWord: resolvedHostCodeWord,
      roomName: createdRoomName,
      structure: createdStructure,
    });

    return {
      roomId,
      hostPeerId,
      shareUrl,
      name: resolvedHostName,
      color: resolvedHostColor,
      codeWord: resolvedHostCodeWord,
      roomName: createdRoomName,
      structure: createdStructure,
    };
  };

  const joinRoom = async (roomId, options) => {
    logConfigScope('room-join');
// Init/auth guard with safe-mode support
let guardResult = null;

if (!bootFlags.safe) {
  if (typeof ensureAppAndUser === 'function') {
    // Preferred: centralized app+auth guard (returns { app, auth, user })
    guardResult = await ensureAppAndUser();
  } else {
    // Fallback: legacy path (compat)
    if (typeof ensureAuthReady === 'function') {
      await ensureAuthReady();
    }
    // Try to reuse the canonical bootstrap if present
    let app = null;
    if (window.FirebaseBootstrap && typeof FirebaseBootstrap.initFirebase === 'function') {
      app = FirebaseBootstrap.initFirebase();
    }
    const signed = window.FirebaseBootstrap && typeof FirebaseBootstrap.ensureSignedInUser === 'function'
      ? await FirebaseBootstrap.ensureSignedInUser()
      : await ensureSignedInUser();
    guardResult = { app: app || signed.app, auth: signed.auth, user: signed.user };
  }

  if (typeof logAppAndUserGuard === 'function') {
    try { logAppAndUserGuard(guardResult); } catch (_) { /* noop */ }
  }
}

// Firestore after app/auth (no-op in safe mode)
const firestore = ensureFirestore();
const { auth, user } = guardResult || (await ensureSignedInUser());

    const currentUser = user || (auth && auth.currentUser);
    if (!currentUser || !currentUser.uid) {
      throw new Error('Unable to determine the authenticated user.');
    }
    const playersName = typeof options === 'string' ? options : options && options.name;
    const playerColorOption =
      options && typeof options === 'object' && typeof options.color === 'string'
        ? options.color
        : '';
    const playerCodeWordOption =
      options && typeof options === 'object' && typeof options.codeWord === 'string'
        ? options.codeWord
        : '';
    const resolvedName = playersName && playersName.trim() ? playersName.trim() : 'Player';
    const resolvedColor = normalizeIdentityColor(playerColorOption);
    const resolvedCodeWord = sanitizeCodeWord(playerCodeWordOption);
    const trimmedRoomId = sanitizeRoomId(roomId);
    if (!trimmedRoomId) {
      throw new Error('Room ID is invalid.');
    }
    const peerId = generatePeerId();
    const roomRef = firestore.collection('rooms').doc(trimmedRoomId);
    const playerDocRef = roomRef.collection('players').doc(currentUser.uid);
    let alreadyPresent = false;

    await withFirestoreErrorHandling('update', async () => {
      const getST =
        (typeof getServerTimestamp === 'function' && getServerTimestamp) ||
        (() => (typeof getTimestampValue === 'function' ? getTimestampValue() : new Date()));

      const deviceId =
        (typeof getDeviceId === 'function' && getDeviceId()) ||
        (window.NetUI && typeof window.NetUI.getDeviceId === 'function' ? window.NetUI.getDeviceId() : null);

      const playersCollection = roomRef.collection('players');

      // Pre-read for presence & capacity snapshot
      const [existingPlayerDoc, playersSnapshot] = await Promise.all([
        playerDocRef.get(),
        playersCollection.get(),
      ]);
      alreadyPresent = !!(existingPlayerDoc && existingPlayerDoc.exists);

      await runTransaction(async (transaction) => {
        // Room existence
        const roomSnapshot = await transaction.get(roomRef);
        if (!roomSnapshot || !roomSnapshot.exists) {
          throw new Error('The requested room could not be found.');
        }

        const roomData = roomSnapshot.data() || {};
        const maxPlayers = typeof roomData.maxPlayers === 'number' ? roomData.maxPlayers : 9;

        // Capacity guard
        if (!alreadyPresent && playersSnapshot && playersSnapshot.size >= maxPlayers) {
          throw new Error('This room is already full.');
        }

        const timestamp = getST();

        // Player payload (device-lock + identity)
        const playerData = {
          uid: currentUser.uid,
          peerId,
          role: 'guest',
          isHost: false,
          deviceId,
          nick: resolvedName,
          name: resolvedName,
          color: resolvedColor,
          lastSeenAt: timestamp,
        };
        if (!alreadyPresent) {
          playerData.joinedAt = timestamp;
        }
        if (resolvedCodeWord) {
          playerData.codeWord = resolvedCodeWord;
        }

        // Write player doc
        if (alreadyPresent) {
          transaction.update(playerDocRef, playerData);
        } else {
          transaction.set(playerDocRef, playerData);
        }

        // Room metadata touch (+increment playerCount on first join)
        const updates = {
          updatedAt: timestamp,
          lastActivityAt: timestamp,
        };
        if (!alreadyPresent) {
          if (netState.fieldValue && typeof netState.fieldValue.increment === 'function') {
            updates.playerCount = netState.fieldValue.increment(1);
          } else {
            const currentCount =
              typeof roomData.playerCount === 'number' ? roomData.playerCount : playersSnapshot.size;
            updates.playerCount = currentCount + 1;
          }
        }

        transaction.set(roomRef, updates, { merge: true });
      });
    });

    netState.roomId = trimmedRoomId;
    netState.peerId = peerId;
    netState.isHost = false;
    netState.playerName = resolvedName;
    netState.playerColor = resolvedColor;
    netState.playerCodeWord = resolvedCodeWord || null;
    netState.shareUrl = buildShareUrl(trimmedRoomId);
    netState.initialized = true;

    logMessage('[ROOM]', `joined code=${trimmedRoomId} uid=${currentUser.uid} name=${resolvedName}`);

    emitEvent('roomJoined', {
      roomId: trimmedRoomId,
      peerId,
      name: resolvedName,
      color: resolvedColor,
      codeWord: resolvedCodeWord,
    });

    return { roomId: trimmedRoomId, peerId, name: resolvedName, color: resolvedColor, codeWord: resolvedCodeWord };
  };

  const deleteCollectionDocs = async (collectionRef, batchSize = 50) =>
    withFirestoreErrorHandling('update', async () => {
      const firestore = ensureFirestore();
      let snapshot = await collectionRef.limit(batchSize).get();
      while (snapshot && !snapshot.empty) {
        const batch = firestore.batch();
        snapshot.docs.forEach((doc) => {
          batch.delete(doc.ref);
        });
        await batch.commit();
        snapshot = await collectionRef.limit(batchSize).get();
      }
    });

const deleteRoomDocument = async (roomRef) =>
  withFirestoreErrorHandling('update', async () => {
    const subcollections = ['players', 'signals'];
    for (let i = 0; i < subcollections.length; i += 1) {
      const sub = subcollections[i];
        try {
          const subRef = roomRef.collection(sub);
          await deleteCollectionDocs(subRef);
        } catch (error) {
          handleFirestoreError('update', error);
          logMessage('[ROOM]', `failed to delete ${sub} for code=${roomRef.id}`, error);
        }
      }
      await roomRef.delete();
      logMessage('[ROOM]', `deleted code=${roomRef.id}`);
    });

  const adminAddPlayer = async ({ adminCode, name, color }) => {
    logConfigScope('admin-add-player');
    await ensureAdminPrivileges();
    const functionsInstance = ensureFunctions();
    if (!functionsInstance || typeof functionsInstance.httpsCallable !== 'function') {
      throw new Error('Cloud Functions unavailable.');
    }
    const callable = functionsInstance.httpsCallable('adminAddPlayer');
    const response = await callable({ adminCode, name, color });
    const data = response && typeof response.data === 'object' ? response.data : response;
    const codeWord = data && typeof data.codeWord === 'string' ? data.codeWord.trim() : '';
    if (!codeWord) {
      throw new Error('Invalid response from server.');
    }
    return { codeWord };
  };

  const adminCreateRoom = async () => {
    logConfigScope('admin-create-room');
    const { user } = await ensureAdminPrivileges();
    if (!user || !user.uid) {
      throw new Error('Admin privileges are required.');
    }
    let guardResult = null;
    if (!bootFlags.safe) {
      guardResult = await ensureAppAndUser();
      logAppAndUserGuard(guardResult);
    }
    const record = await createRoomRecord({
      hostUid: user.uid,
      hostName: 'Admin',
      roomName: 'Admin Room',
      structure: getDefaultRoomStructure(),
    });
    logMessage('[ROOM]', `created id=${record.roomId} code=${record.roomId}`);
    return {
      roomId: record.roomId,
      hostPeerId: record.hostPeerId,
      shareUrl: buildShareUrl(record.roomId),
      roomName: record.roomName,
      structure: record.structure,
    };
  };

  const adminDeleteRoomByCode = async (code) => {
    const trimmed = sanitizeRoomId(code);
    if (!trimmed) {
      throw new Error('Room code is required.');
    }
    await ensureAdminPrivileges();
// Ensure app+auth first (unless in safe mode)
if (!bootFlags.safe && typeof ensureAppAndUser === 'function') {
  try {
    const guardResult = await ensureAppAndUser();
    if (typeof logAppAndUserGuard === 'function') {
      try { logAppAndUserGuard(guardResult); } catch (_) {}
    }
  } catch (_) {
    // If guard fails, withFirestoreErrorHandling below will still surface errors
  }
}

return withFirestoreErrorHandling('update', async () => {
  const firestore = ensureFirestore();
  const roomRef = firestore.collection('rooms').doc(trimmed);
  const snapshot = await roomRef.get();
  if (!snapshot.exists) {
    throw new Error('Room not found.');
  }
  await deleteRoomDocument(roomRef);
  return trimmed;
});

  };

  const adminDeleteAllRooms = async () => {
    await ensureAdminPrivileges();
// Ensure app+auth first (unless in safe mode)
if (!bootFlags.safe && typeof ensureAppAndUser === 'function') {
  try {
    const guardResult = await ensureAppAndUser();
    if (typeof logAppAndUserGuard === 'function') {
      try { logAppAndUserGuard(guardResult); } catch (_) {}
    }
  } catch (_) {
    // Guard errors will be surfaced by the withFirestoreErrorHandling path below
  }
}

return withFirestoreErrorHandling('update', async () => {
  const firestore = ensureFirestore();
  const roomsSnapshot = await firestore.collection('rooms').get();
  const docs = roomsSnapshot.docs || [];
  for (const doc of docs) {
    await deleteRoomDocument(doc.ref);
  }
  return docs.length;
});

};

  const playerIdentityMarkup = (options = {}) => {
    const identity = getPlayerIdentity();
    const missingMessageRaw = options && typeof options.missingMessage === 'string' ? options.missingMessage : '';
    const missingMessage = missingMessageRaw && missingMessageRaw.trim()
      ? missingMessageRaw.trim()
      : 'Enter your player code to continue.';
    if (!identity) {
      return `
        <div class="stickfight-identity-card stickfight-identity-card--missing">
          <div class="stickfight-identity-card__label">Player Identity</div>
          <div class="stickfight-identity-card__body">
            <p>${escapeHtml(missingMessage)}</p>
            <a class="stickfight-inline-link" href="#" data-stickfight-enter-code="true">Enter code</a>
          </div>
        </div>
      `;
    }
    const color = escapeHtml(identity.color || DEFAULT_IDENTITY_COLOR);
    const name = escapeHtml(identity.name || 'Player');
    const codeWord = escapeHtml(identity.codeWord || '----');
    return `
      <div class="stickfight-identity-card">
        <div class="stickfight-identity-card__swatch" style="background: ${color};"></div>
        <div class="stickfight-identity-card__body">
          <div class="stickfight-identity-card__label">Signed in as</div>
          <div class="stickfight-identity-card__name">${name}</div>
          <div class="stickfight-identity-card__meta">Code word: ${codeWord}</div>
        </div>
      </div>
    `;
  };

  const roomsSectionMarkup = (includeAdminButton = true) => `
      <div class="stickfight-rooms-section">
        <div class="stickfight-rooms-header">
          <h3>Open Lobbies</h3>
          <div class="stickfight-rooms-actions">
            ${
              includeAdminButton
                ? '<button type="button" class="stickfight-secondary-button" id="stickfight-admin-entry">Admin</button>'
                : ''
            }
          </div>
        </div>
        <div id="stickfight-rooms-table"></div>
      </div>
    `;

  const ensureLobbyView = () => {
    showOverlay();
    overlayState.contentLocked = false;
    const needsRender =
      overlayState.activeView !== 'lobby' || !overlayState.panel || !overlayState.panel.innerHTML;
    if (needsRender) {
      renderCreateLobby();
    }
  };

  let joinRequestInProgress = false;

  const joinLobbyByCode = async (roomCode, options = {}) => {
    const identity = getPlayerIdentity();
    const sanitized = sanitizeRoomId(typeof roomCode === 'string' ? roomCode : '');
    const invalidMessage =
      options && typeof options.invalidMessage === 'string'
        ? options.invalidMessage
        : 'Enter a valid room code.';

    ensureLobbyView();

    if (!identity) {
      setBannerMessage('Enter your player code before joining a lobby.');
      return;
    }

    if (!sanitized) {
      setBannerMessage(invalidMessage);
      return;
    }

    if (joinRequestInProgress) {
      return;
    }

    joinRequestInProgress = true;
    logMessage('[ROOM]', `join attempt code=${sanitized}`);
    setBannerMessage(`Joining lobby ${sanitized}...`);

    try {
      const result = await joinRoom(sanitized, {
        name: identity.name,
        color: identity.color,
        codeWord: identity.codeWord,
      });
      setBannerMessage('');
      if (!redirectToRoomIfPossible(result && result.roomId, false)) {
        hideOverlay();
        emitEvent('lobbyDismissed', { roomId: netState.roomId, isHost: false });
      }
    } catch (error) {
      const message = error && error.message ? error.message : 'Unable to join the room.';
      setBannerMessage(message);
    } finally {
      joinRequestInProgress = false;
    }
  };

  const renderRoomsTableMarkup = () => {
    if (!lobbyRoomsState.rooms || lobbyRoomsState.rooms.length === 0) {
      return '<p class="stickfight-empty">No open rooms.</p>';
    }
    const rows = lobbyRoomsState.rooms
      .slice()
      .sort((a, b) => a.code.localeCompare(b.code))
      .map((room) => {
        const maxPlayers = typeof room.maxPlayers === 'number' && room.maxPlayers > 0 ? room.maxPlayers : null;
        const countText = maxPlayers ? `${room.playerCount}/${maxPlayers}` : `${room.playerCount}`;
        const code = escapeHtml(room.code);
        return `
          <tr>
            <td>${code}</td>
            <td>${escapeHtml(String(countText))}</td>
            <td class="stickfight-join-cell">
              <button type="button" class="stickfight-secondary-button stickfight-room-join" data-room-code="${code}">Join</button>
            </td>
          </tr>
        `;
      })
      .join('');
    return `
      <table class="stickfight-rooms-table">
        <thead>
          <tr>
            <th>Code</th>
            <th>Players</th>
            <th>Join</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>
    `;
  };

  const updateRoomsTable = () => {
    if (!overlayState.panel) {
      return;
    }
    const container = overlayState.panel.querySelector('#stickfight-rooms-table');
    if (!container) {
      return;
    }
    container.innerHTML = renderRoomsTableMarkup();
    const joinButtons = container.querySelectorAll('.stickfight-room-join');
    joinButtons.forEach((button) => {
      button.addEventListener('click', () => {
        const raw = button.getAttribute('data-room-code') || '';
        const sanitized = sanitizeRoomId(raw) || (raw ? raw.trim().toUpperCase() : '');
        joinLobbyByCode(sanitized);
      });
    });
  };

  const refreshRoomsFromSnapshot = async (snapshot) => {
    const docs = snapshot && snapshot.docs ? snapshot.docs : [];
    const processed = await Promise.all(
      docs.map(async (doc) => {
        const data = doc.data ? doc.data() || {} : {};
        let playerCount = typeof data.playerCount === 'number' ? data.playerCount : null;
        let maxPlayers = typeof data.maxPlayers === 'number' ? data.maxPlayers : null;
        if (playerCount === null) {
          try {
            const playersSnapshot = await doc.ref.collection('players').get();
            playerCount = playersSnapshot.size;
          } catch (error) {
            handleFirestoreError('listen', error);
            playerCount = 0;
          }
        }
        if (maxPlayers === null) {
          maxPlayers = 0;
        }
        return {
          code: doc.id,
          playerCount,
          maxPlayers: maxPlayers || undefined,
        };
      })
    );
    lobbyRoomsState.rooms = processed;
    updateRoomsTable();
    logMessage('[LOBBY]', `rooms=${processed.length}`);
    return processed.length;
  };

  const startLobbyRoomsListener = async () => {
    logConfigScope('lobby-listener');
    if (lobbyRoomsState.listening) {
      return;
    }
    lobbyRoomsState.listening = true;
    let guardResult = null;
    if (!bootFlags.safe) {
      try {
        guardResult = await ensureAppAndUser();
        logAppAndUserGuard(guardResult);
      } catch (error) {
        logMessage('[LOBBY]', 'failed to initialize firebase app/user for lobby rooms', error);
        return;
      }
    }
    try {
      await ensureAuthReady();
    } catch (error) {
      logMessage('[LOBBY]', 'failed to initialize auth for lobby rooms', error);
      return;
    }
    try {
await withFirestoreErrorHandling('listen', async () => {
  const firestore = ensureFirestore();
  const query = firestore
    .collection('rooms')
    .where('status', '==', 'open')
    .where('active', '==', true);

  logMessage('[LOBBY]', 'attach-listener');
  let firstSnapshotLogged = false;

  lobbyRoomsState.unsubscribe = query.onSnapshot(
    (snapshot) => {
      Promise.resolve()
        .then(() => refreshRoomsFromSnapshot(snapshot))
        .then((count) => {
          if (!firstSnapshotLogged) {
            const resolvedCount =
              typeof count === 'number' ? count : lobbyRoomsState.rooms.length;
            logMessage('[LOBBY]', `rooms=${resolvedCount} first-snapshot`);
            firstSnapshotLogged = true;
          }
        })
        .catch((error) => {
          logMessage('[LOBBY]', 'failed to process rooms snapshot', error);
        });
    },
    (error) => {
      handleFirestoreError('listen', error);
      logMessage('[LOBBY]', 'rooms snapshot error', error);
    }
  );
});

    } catch (error) {
      logMessage('[LOBBY]', 'unable to listen for rooms', error);
    }
  };

  const handleAdminEntry = () => {
    logConfigScope('admin-handle-entry');
    overlayState.isAdmin = true;
    goToRoute('#/admin');
  };

  const attachAdminEntryHandler = () => {
    if (!overlayState.panel) {
      return;
    }
    const adminButton = overlayState.panel.querySelector('#stickfight-admin-entry');
    if (adminButton) {
      adminButton.addEventListener('click', (event) => {
        event.preventDefault();
        handleAdminEntry();
      });
    }
    const identityLink = overlayState.panel.querySelector('[data-stickfight-enter-code]');
    if (identityLink) {
      identityLink.addEventListener('click', (event) => {
        event.preventDefault();
        renderEnterView();
      });
    }
  };

  const renderAdminPanel = () => {
    if (overlayState.fatalError) {
      showOverlay();
      return;
    }
    showOverlay();
    overlayState.contentLocked = false;
    const storedAdminCode = getStoredAdminAddCode();
    renderView(
      'admin',
      `
      <h2>Admin Controls</h2>
      <p>Manage rooms for debugging and moderation. Be careful—deletions are permanent.</p>
      <div class="stickfight-admin-grid">
        <form class="stickfight-admin-inline stickfight-admin-add-form" id="stickfight-admin-add-player-form">
          <input type="text" id="stickfight-admin-add-code" name="adminCode" placeholder="Admin add code" autocomplete="off" value="${escapeHtml(storedAdminCode)}" />
          <input type="text" id="stickfight-admin-player-name" name="playerName" placeholder="Player name" autocomplete="off" maxlength="64" />
          <input type="text" id="stickfight-admin-player-color" name="playerColor" placeholder="#RRGGBB" autocomplete="off" />
          <button type="submit" class="stickfight-primary-button" id="stickfight-admin-add-submit">Create Player</button>
        </form>
        <div class="stickfight-admin-add-result hidden" id="stickfight-admin-add-result">
          <div class="stickfight-admin-add-message" id="stickfight-admin-add-message"></div>
          <div class="stickfight-share-row">
            <input type="text" id="stickfight-admin-add-codeword" readonly />
            <button type="button" class="stickfight-secondary-button" id="stickfight-admin-add-copy">Copy</button>
          </div>
        </div>
        <button type="button" class="stickfight-primary-button" id="stickfight-admin-create-room">Create Open Room</button>
        <form class="stickfight-admin-inline" id="stickfight-admin-delete-form">
          <input type="text" id="stickfight-admin-delete-code" name="code" placeholder="Room code" autocomplete="off" />
          <button type="submit" class="stickfight-secondary-button">Delete by Code</button>
        </form>
        <form class="stickfight-admin-inline" id="stickfight-admin-delete-all-form">
          <input type="text" id="stickfight-admin-delete-all-confirm" name="confirm" placeholder="Type DELETE ALL" autocomplete="off" />
          <button type="submit" class="stickfight-secondary-button">Delete All Rooms</button>
        </form>
        <div class="stickfight-admin-status" id="stickfight-admin-status"></div>
        <div class="stickfight-admin-actions">
          <button type="button" class="stickfight-secondary-button" id="stickfight-admin-back">Back</button>
        </div>
      </div>
      ${roomsSectionMarkup(false)}
    `
    );

    const statusEl = overlayState.panel.querySelector('#stickfight-admin-status');
    const setStatus = (message) => {
      if (statusEl) {
        statusEl.textContent = message || '';
      }
    };

    const addForm = overlayState.panel.querySelector('#stickfight-admin-add-player-form');
    const adminCodeInput = overlayState.panel.querySelector('#stickfight-admin-add-code');
    const playerNameInput = overlayState.panel.querySelector('#stickfight-admin-player-name');
    const playerColorInput = overlayState.panel.querySelector('#stickfight-admin-player-color');
    const addSubmitButton = overlayState.panel.querySelector('#stickfight-admin-add-submit');
    const addResultContainer = overlayState.panel.querySelector('#stickfight-admin-add-result');
    const addMessageEl = overlayState.panel.querySelector('#stickfight-admin-add-message');
    const codewordInput = overlayState.panel.querySelector('#stickfight-admin-add-codeword');
    const copyCodewordButton = overlayState.panel.querySelector('#stickfight-admin-add-copy');

    const hideAddResult = () => {
      if (addResultContainer) {
        addResultContainer.classList.add('hidden');
      }
      if (addMessageEl) {
        addMessageEl.textContent = '';
      }
      if (codewordInput) {
        codewordInput.value = '';
      }
    };

    const showAddResult = (codeWord, playerNameValue) => {
      if (!addResultContainer) {
        return;
      }
      if (addMessageEl) {
        addMessageEl.textContent = playerNameValue
          ? `Player ${playerNameValue} created. Share the code word below.`
          : 'Player created. Share the code word below.';
      }
      if (codewordInput) {
        codewordInput.value = codeWord;
        try {
          codewordInput.select();
          codewordInput.setSelectionRange(0, codewordInput.value.length);
        } catch (error) {
          // ignore selection errors
        }
      }
      addResultContainer.classList.remove('hidden');
    };

    hideAddResult();

    if (adminCodeInput) {
      adminCodeInput.addEventListener('input', () => {
        persistAdminAddCode(adminCodeInput.value || '');
      });
    }

    if (addForm) {
      addForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        const adminCodeValue = adminCodeInput ? adminCodeInput.value.trim() : '';
        const playerNameValue = playerNameInput ? playerNameInput.value.trim() : '';
        const colorRaw = playerColorInput ? playerColorInput.value : '';
        const normalizedColor = normalizeHexColorInput(colorRaw);
        if (!adminCodeValue) {
          setStatus('Admin code is required.');
          if (adminCodeInput) {
            adminCodeInput.focus();
          }
          hideAddResult();
          return;
        }
        if (!playerNameValue) {
          setStatus('Player name is required.');
          if (playerNameInput) {
            playerNameInput.focus();
          }
          hideAddResult();
          return;
        }
        if (!normalizedColor) {
          setStatus('Enter a color in hex format like #FFAA33.');
          if (playerColorInput) {
            playerColorInput.focus();
          }
          hideAddResult();
          return;
        }
        if (playerColorInput) {
          playerColorInput.value = normalizedColor;
        }
        persistAdminAddCode(adminCodeValue);
        setStatus('Creating player...');
        hideAddResult();
        if (addSubmitButton) {
          addSubmitButton.disabled = true;
        }
        try {
          const result = await adminAddPlayer({
            adminCode: adminCodeValue,
            name: playerNameValue,
            color: normalizedColor,
          });
          setStatus('Player created. Code word ready to copy.');
          showAddResult(result.codeWord, playerNameValue);
          if (playerNameInput) {
            playerNameInput.value = '';
          }
        } catch (error) {
          const message = error && error.message ? error.message : 'Failed to create player.';
          setStatus(message);
          hideAddResult();
        } finally {
          if (addSubmitButton) {
            addSubmitButton.disabled = false;
          }
        }
      });
    }

    if (codewordInput) {
      codewordInput.addEventListener('focus', () => {
        try {
          codewordInput.select();
          codewordInput.setSelectionRange(0, codewordInput.value.length);
        } catch (error) {
          // ignore selection errors
        }
      });
    }

    if (copyCodewordButton) {
      copyCodewordButton.addEventListener('click', async () => {
        if (!codewordInput || !codewordInput.value) {
          return;
        }
        try {
          codewordInput.select();
          codewordInput.setSelectionRange(0, codewordInput.value.length);
        } catch (error) {
          // ignore selection errors
        }
        let copied = false;
        if (navigator && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
          try {
            await navigator.clipboard.writeText(codewordInput.value);
            copied = true;
          } catch (err) {
            copied = false;
          }
        }
        if (!copied) {
          try {
            copied = document.execCommand && document.execCommand('copy');
          } catch (error) {
            copied = false;
          }
        }
        setStatus(
          copied ? 'Player code copied to clipboard!' : 'Copy the code word above to share it.'
        );
      });
    }

    const createButton = overlayState.panel.querySelector('#stickfight-admin-create-room');
    if (createButton) {
      createButton.addEventListener('click', async () => {
        logMessage('[ADMIN]', 'create-room click');
        createButton.disabled = true;
        setStatus('Creating room...');
        try {
          const record = await adminCreateRoom();
          setStatus(`Room ${record.roomId} created.`);
        } catch (error) {
          const message = error && error.message ? error.message : 'Failed to create room.';
          setStatus(message);
        } finally {
          createButton.disabled = false;
        }
      });
    }

    const deleteForm = overlayState.panel.querySelector('#stickfight-admin-delete-form');
    if (deleteForm) {
      deleteForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        const input = overlayState.panel.querySelector('#stickfight-admin-delete-code');
        const code = input && input.value ? input.value.trim() : '';
        setStatus('Deleting room...');
        try {
          const deletedCode = await adminDeleteRoomByCode(code);
          setStatus(`Room ${deletedCode} deleted.`);
          if (input) {
            input.value = '';
          }
        } catch (error) {
          const message = error && error.message ? error.message : 'Failed to delete room.';
          setStatus(message);
        }
      });
    }

    const deleteAllForm = overlayState.panel.querySelector('#stickfight-admin-delete-all-form');
    if (deleteAllForm) {
      deleteAllForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        const confirmInput = overlayState.panel.querySelector('#stickfight-admin-delete-all-confirm');
        const confirmValue = confirmInput && confirmInput.value ? confirmInput.value.trim() : '';
        if (confirmValue !== 'DELETE ALL') {
          setStatus('Type DELETE ALL to confirm.');
          return;
        }
        logMessage('[ADMIN]', 'delete-all click');
        setStatus('Deleting all rooms...');
        try {
          const count = await adminDeleteAllRooms();
          setStatus(`Deleted ${count} room${count === 1 ? '' : 's'}.`);
          if (confirmInput) {
            confirmInput.value = '';
          }
        } catch (error) {
          const message = error && error.message ? error.message : 'Failed to delete rooms.';
          setStatus(message);
        }
      });
    }

    const backButton = overlayState.panel.querySelector('#stickfight-admin-back');
    if (backButton) {
      backButton.addEventListener('click', () => {
        goToRoute('#/lobby');
      });
    }

    updateRoomsTable();
  };

  const hideOverlay = () => {
    if (overlayState.overlay) {
      overlayState.overlay.classList.add('stickfight-hidden');
    }
  };

  const showOverlay = () => {
    if (overlayState.overlay) {
      overlayState.overlay.classList.remove('stickfight-hidden');
    }
  };

  const createStyles = () => {
    if (typeof document === 'undefined') {
      return;
    }
    if (document.getElementById('stickfight-net-styles')) {
      return;
    }
    const style = document.createElement('style');
    style.id = 'stickfight-net-styles';
    style.textContent = `
      .stickfight-lobby-overlay {
        position: fixed;
        inset: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 32px;
        background: rgba(3, 7, 12, 0.92);
        backdrop-filter: blur(6px);
        z-index: 9999;
        color: #f6fbff;
        font-family: 'Inter', 'Segoe UI', Roboto, sans-serif;
      }
      .stickfight-lobby-overlay.stickfight-hidden {
        display: none;
      }
      .stickfight-lobby-panel {
        width: min(480px, 100%);
        background: linear-gradient(160deg, rgba(12, 18, 28, 0.95), rgba(8, 12, 20, 0.88));
        border: 1px solid rgba(11, 180, 255, 0.35);
        border-radius: 16px;
        box-shadow: 0 28px 60px rgba(2, 6, 14, 0.6);
        padding: 28px 32px;
      }
      .stickfight-main {
        display: flex;
        flex-direction: column;
        gap: 24px;
      }
      .topbar {
        display: flex;
        justify-content: center;
        gap: 20px;
        padding-bottom: 16px;
        margin-bottom: 24px;
        border-bottom: 1px solid rgba(11, 180, 255, 0.25);
      }
      .nav {
        display: inline-flex;
        align-items: center;
        gap: 18px;
      }
      .nav-link {
        color: rgba(224, 245, 255, 0.9);
        text-decoration: none;
        font-weight: 600;
        letter-spacing: 0.04em;
        text-transform: uppercase;
        transition: color 0.2s ease;
      }
      .nav-link:hover {
        color: #ffffff;
      }
      .nav-link.active {
        color: #ffffff;
        text-decoration: underline;
      }
      .hidden {
        display: none !important;
      }
      .stickfight-error-banner {
        margin-bottom: 20px;
        padding: 14px 18px;
        border-radius: 12px;
        background: linear-gradient(135deg, rgba(176, 12, 32, 0.92), rgba(120, 4, 20, 0.92));
        border: 1px solid rgba(255, 115, 140, 0.75);
        box-shadow: 0 18px 32px rgba(96, 3, 16, 0.5);
        color: #ffeef0;
        font-weight: 600;
        letter-spacing: 0.01em;
      }
      .stickfight-error-banner[hidden] {
        display: none;
      }
      .stickfight-lobby-panel h2 {
        margin: 0 0 12px;
        font-size: 1.6rem;
        font-weight: 700;
        letter-spacing: 0.01em;
      }
      .stickfight-lobby-panel p {
        margin: 0 0 20px;
        color: rgba(210, 226, 255, 0.82);
        line-height: 1.55;
      }
      .stickfight-identity-card {
        display: flex;
        align-items: center;
        gap: 16px;
        padding: 16px 18px;
        border: 1px solid rgba(11, 180, 255, 0.35);
        border-radius: 12px;
        background: rgba(9, 18, 32, 0.7);
        box-shadow: 0 14px 28px rgba(2, 6, 14, 0.4);
        margin-bottom: 20px;
      }
      .stickfight-identity-card__swatch {
        width: 44px;
        height: 44px;
        border-radius: 10px;
        border: 1px solid rgba(255, 255, 255, 0.35);
        box-shadow: 0 8px 18px rgba(0, 0, 0, 0.35);
      }
      .stickfight-identity-card__body {
        display: flex;
        flex-direction: column;
        gap: 4px;
      }
      .stickfight-identity-card__label {
        font-size: 0.78rem;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        color: rgba(182, 235, 255, 0.75);
      }
      .stickfight-identity-card__name {
        font-size: 1.2rem;
        font-weight: 700;
        color: #ffffff;
      }
      .stickfight-identity-card__meta {
        font-size: 0.95rem;
        color: rgba(210, 226, 255, 0.8);
      }
      .stickfight-identity-card--missing {
        border-color: rgba(255, 173, 88, 0.45);
        background: rgba(45, 24, 6, 0.65);
        box-shadow: 0 14px 32px rgba(32, 12, 0, 0.45);
      }
      .stickfight-identity-card--missing p {
        margin: 0 0 6px;
        color: rgba(255, 221, 189, 0.85);
      }
      .stickfight-inline-link {
        color: #49c3ff;
        text-decoration: none;
        font-weight: 600;
      }
      .stickfight-inline-link:hover {
        color: #8fe6ff;
        text-decoration: underline;
      }
      .stickfight-lobby-form {
        display: flex;
        flex-direction: column;
        gap: 18px;
      }
      .stickfight-lobby-form label {
        display: flex;
        flex-direction: column;
        gap: 6px;
        font-weight: 600;
        font-size: 0.95rem;
        color: rgba(230, 240, 255, 0.92);
      }
      .stickfight-lobby-form input[type="text"] {
        border-radius: 10px;
        padding: 12px 14px;
        border: 1px solid rgba(13, 160, 245, 0.35);
        background: rgba(255, 255, 255, 0.06);
        color: #ffffff;
        font-size: 1rem;
        outline: none;
        transition: border-color 0.2s ease, box-shadow 0.2s ease;
      }
      .stickfight-lobby-form input[type="text"]:focus {
        border-color: rgba(11, 180, 255, 0.9);
        box-shadow: 0 0 0 3px rgba(11, 180, 255, 0.25);
      }
      .stickfight-lobby-form select {
        border-radius: 10px;
        padding: 12px 14px;
        border: 1px solid rgba(13, 160, 245, 0.35);
        background: rgba(255, 255, 255, 0.06);
        color: #ffffff;
        font-size: 1rem;
        outline: none;
        transition: border-color 0.2s ease, box-shadow 0.2s ease;
      }
      .stickfight-lobby-form select:focus {
        border-color: rgba(11, 180, 255, 0.9);
        box-shadow: 0 0 0 3px rgba(11, 180, 255, 0.25);
      }
      .stickfight-primary-button,
      .stickfight-secondary-button {
        border-radius: 10px;
        border: none;
        font-weight: 600;
        font-size: 1rem;
        padding: 12px 16px;
        cursor: pointer;
        transition: transform 0.1s ease, box-shadow 0.2s ease;
      }
      .stickfight-primary-button {
        background: linear-gradient(135deg, #0bb4ff, #45d2ff);
        color: #04121e;
        box-shadow: 0 10px 22px rgba(11, 180, 255, 0.35);
      }
      .stickfight-primary-button:hover {
        transform: translateY(-1px);
        box-shadow: 0 14px 28px rgba(11, 180, 255, 0.4);
      }
      .stickfight-primary-button:disabled {
        opacity: 0.6;
        cursor: wait;
        transform: none;
        box-shadow: none;
      }
      .stickfight-secondary-button {
        background: transparent;
        border: 1px solid rgba(11, 180, 255, 0.5);
        color: rgba(202, 232, 255, 0.92);
      }
      .stickfight-secondary-button:hover {
        border-color: rgba(11, 180, 255, 0.8);
        color: #ffffff;
      }
      .stickfight-lobby-error {
        color: #ff6b8a;
        min-height: 1.4em;
        font-size: 0.95rem;
      }
      .stickfight-share-row {
        display: flex;
        align-items: center;
        gap: 10px;
      }
      .stickfight-share-row input[type="text"] {
        flex: 1;
        cursor: pointer;
        user-select: all;
      }
      .stickfight-status {
        margin-top: 12px;
        font-size: 0.95rem;
        color: rgba(182, 235, 255, 0.9);
        min-height: 1.2em;
      }
      .stickfight-rooms-section {
        margin-top: 32px;
        padding: 20px;
        border: 1px solid rgba(11, 180, 255, 0.25);
        border-radius: 12px;
        background: rgba(10, 22, 36, 0.6);
      }
      .stickfight-rooms-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 16px;
        gap: 16px;
      }
      .stickfight-rooms-actions {
        display: flex;
        align-items: center;
        gap: 12px;
      }
      .stickfight-rooms-header h3 {
        margin: 0;
        font-size: 1.2rem;
        font-weight: 600;
      }
      .stickfight-rooms-table {
        width: 100%;
        border-collapse: collapse;
        font-size: 0.95rem;
      }
      .stickfight-rooms-table th,
      .stickfight-rooms-table td {
        padding: 10px 12px;
        text-align: left;
        border-bottom: 1px solid rgba(11, 180, 255, 0.12);
      }
      .stickfight-rooms-table tbody tr:hover {
        background: rgba(11, 180, 255, 0.08);
      }
      .stickfight-join-cell {
        text-align: right;
        width: 1%;
        white-space: nowrap;
      }
      .stickfight-empty {
        margin: 0;
        color: rgba(200, 224, 255, 0.7);
        font-size: 0.95rem;
      }
      .stickfight-admin-grid {
        display: flex;
        flex-direction: column;
        gap: 18px;
        margin-bottom: 24px;
      }
      .stickfight-admin-inline {
        display: flex;
        gap: 12px;
        align-items: center;
      }
      .stickfight-admin-inline input[type="text"],
      .stickfight-admin-inline select {
        flex: 1;
      }
      .stickfight-admin-add-form {
        flex-wrap: wrap;
        align-items: stretch;
      }
      .stickfight-admin-add-form input[type="text"] {
        flex: 1 1 160px;
        min-width: 140px;
      }
      .stickfight-admin-add-form button {
        flex: 0 0 auto;
      }
      .stickfight-admin-add-result {
        padding: 14px 16px;
        border-radius: 10px;
        background: rgba(9, 40, 60, 0.6);
        border: 1px solid rgba(11, 180, 255, 0.25);
      }
      .stickfight-admin-add-message {
        font-weight: 600;
        color: rgba(182, 235, 255, 0.95);
        margin-bottom: 8px;
      }
      .stickfight-admin-status {
        min-height: 1.2em;
        font-size: 0.95rem;
        color: rgba(182, 235, 255, 0.9);
      }
      .stickfight-admin-actions {
        display: flex;
        justify-content: flex-end;
        gap: 12px;
      }
    `;
    document.head.appendChild(style);
  };

  const ensureOverlay = () => {
    if (overlayState.overlay || typeof document === 'undefined') {
      return;
    }
    if (!document.body) {
      if (!overlayState.overlayInitRequested && typeof document.addEventListener === 'function') {
        overlayState.overlayInitRequested = true;
        document.addEventListener(
          'DOMContentLoaded',
          () => {
            overlayState.overlayInitRequested = false;
            ensureOverlay();
            if (overlayState.pendingFatalMessage) {
              renderKeyVerificationError(overlayState.pendingFatalMessage);
            }
          },
          { once: true }
        );
      }
      return;
    }
    const overlay = document.createElement('div');
    overlay.className = 'stickfight-lobby-overlay stickfight-hidden';
    const panel = document.createElement('div');
    panel.className = 'stickfight-lobby-panel';
    overlay.appendChild(panel);
    document.body.appendChild(overlay);
    overlayState.overlay = overlay;
    overlayState.panel = panel;
    if (overlayState.pendingFatalMessage) {
      renderKeyVerificationError(overlayState.pendingFatalMessage);
    }
  };

  const renderContent = (html, options) => {
    if (!overlayState.panel) {
      return;
    }
    const opts = options || {};
    if (overlayState.contentLocked && !opts.force) {
      return;
    }
    overlayState.panel.innerHTML = html;
    if (!opts.force) {
      overlayState.contentLocked = false;
    }
    applyBannerMessage();
  };

  const renderLayout = (activeView, bodyHtml) => {
    const normalizedView = activeView === 'admin' ? 'admin' : 'lobby';
    const navLink = (view, id, label) => {
      const isActive = normalizedView === view ? ' active' : '';
      return `<a href="#/${view}" id="${id}" class="nav-link${isActive}">${label}</a>`;
    };
    const viewSection = (view) => {
      const hiddenClass = normalizedView === view ? '' : ' class="hidden"';
      const content = normalizedView === view ? bodyHtml : '';
      return `<section data-view="${view}"${hiddenClass}>${content}</section>`;
    };
    return `
      <header class="topbar">
        <nav class="nav">
          ${navLink('lobby', 'link-lobby', 'Lobby')}
          ${navLink('admin', 'link-admin', 'Admin')}
        </nav>
      </header>
      <main class="stickfight-main">
        ${viewSection('lobby')}
        ${viewSection('admin')}
      </main>
    `;
  };

  const renderView = (activeView, bodyHtml, options) => {
    const normalizedView = activeView === 'admin' ? 'admin' : 'lobby';
    overlayState.activeView = normalizedView;
    renderContent(renderLayout(normalizedView, bodyHtml), options);
  };

  function renderKeyVerificationError(message) {
    const fallbackMessage = '[KEY][ERR] Firebase API key verification failed.';
    const effectiveMessage =
      typeof message === 'string' && message
        ? message
        : overlayState.fatalMessage || overlayState.pendingFatalMessage || fallbackMessage;
    overlayState.fatalError = true;
    overlayState.fatalMessage = effectiveMessage;
    overlayState.pendingFatalMessage = effectiveMessage;
    overlayState.contentLocked = true;

    createStyles();
    ensureOverlay();

    if (!overlayState.overlay) {
      return;
    }

    const safeMessage = escapeHtml(effectiveMessage);
    showOverlay();
    renderView(
      'lobby',
      `
      <h2>Configuration Error</h2>
      <div class="stickfight-lobby-error" style="margin-bottom: 16px;">${safeMessage}</div>
      <p>Stick Fight online features are unavailable because the Firebase API key does not match the configured project.</p>
      <p>Please verify the API key for project <strong>stick-fight-pigeon</strong> and reload the page.</p>
    `,
      { force: true }
    );
    overlayState.pendingFatalMessage = null;
  }

  const renderCreateLobby = () => {
    if (overlayState.fatalError) {
      showOverlay();
      return;
    }
    showOverlay();
    overlayState.contentLocked = false;
    const identity = getPlayerIdentity();
    const identityMarkup = playerIdentityMarkup({
      missingMessage: 'Enter your player code before hosting or joining games.',
    });
    const structureOptions = resolveRoomStructureOptions();
    const selectedStructure = overlayState.selectedStructure || getDefaultRoomStructure();
    const structureOptionsMarkup = structureOptions
      .map((option) => {
        if (!option || !option.value) {
          return '';
        }
        const value = escapeHtml(option.value);
        const label = escapeHtml(option.label || option.value);
        const selected = option.value === selectedStructure ? ' selected' : '';
        return `<option value="${value}"${selected}>${label}</option>`;
      })
      .join('');
    renderView('lobby', `
      ${identityMarkup}
      <h2>Host a Lobby</h2>
      <p>${escapeHtml(
        identity
          ? 'Create a room and share the invite link with your friends.'
          : 'Enter your assigned code word to unlock hosting.'
      )}</p>
      <form class="stickfight-lobby-form" id="stickfight-create-form">
        <label>
          <span>Room Name</span>
          <input type="text" id="stickfight-room-name" name="roomName" maxlength="64" autocomplete="off" placeholder="Room name" required${
            identity ? '' : ' disabled'
          } />
        </label>
        <label>
          <span>Structure</span>
          <select id="stickfight-room-structure" name="structure"${identity ? '' : ' disabled'}>${structureOptionsMarkup}</select>
        </label>
        <div class="stickfight-lobby-error" id="stickfight-create-error"></div>
        <button type="submit" class="stickfight-primary-button" id="stickfight-create-button"${
          identity ? '' : ' disabled'
        }>Create Game</button>
      </form>
      ${roomsSectionMarkup()}
    `);

    const form = overlayState.panel.querySelector('#stickfight-create-form');
    const roomNameInput = overlayState.panel.querySelector('#stickfight-room-name');
    const structureSelect = overlayState.panel.querySelector('#stickfight-room-structure');
    const errorEl = overlayState.panel.querySelector('#stickfight-create-error');
    const submitButton = overlayState.panel.querySelector('#stickfight-create-button');

    if (roomNameInput && identity) {
      roomNameInput.focus();
    }

    if (structureSelect && selectedStructure) {
      structureSelect.value = selectedStructure;
    }

    if (structureSelect) {
      structureSelect.addEventListener('change', () => {
        overlayState.selectedStructure = structureSelect.value || '';
      });
    }

    let busy = false;
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (!roomNameInput || !structureSelect || !submitButton) {
        return;
      }
      const activeIdentity = getPlayerIdentity();
      if (!activeIdentity) {
        if (errorEl) {
          errorEl.textContent = 'Enter your player code before hosting a lobby.';
        }
        return;
      }
      if (busy) {
        return;
      }
      busy = true;
      logMessage('[ROOM]', 'create click');
      if (errorEl) {
        errorEl.textContent = '';
      }
      submitButton.disabled = true;
      const roomName = roomNameInput ? roomNameInput.value.trim() : '';
      const structureValue = structureSelect ? structureSelect.value : '';
      if (!roomName) {
        if (errorEl) {
          errorEl.textContent = 'Room name is required.';
        }
        submitButton.disabled = false;
        busy = false;
        if (roomNameInput) {
          roomNameInput.focus();
        }
        return;
      }
      try {
        const result = await createRoom({
          name: activeIdentity.name,
          color: activeIdentity.color,
          codeWord: activeIdentity.codeWord,
          roomName,
          structure: structureValue,
        });
        overlayState.selectedStructure = structureValue;
        renderHostShare(result);
      } catch (error) {
        const message = error && error.message ? error.message : 'Unable to create the room.';
        if (errorEl) {
          errorEl.textContent = message;
        }
        submitButton.disabled = false;
        busy = false;
      }
    });

    attachAdminEntryHandler();
    updateRoomsTable();
  };

  const redirectToRoomIfPossible = (roomId, isHost) => {
    const safeRoomId = sanitizeRoomId(roomId);
    if (!safeRoomId) {
      return false;
    }
    const target = `/room/${encodeURIComponent(safeRoomId)}`;
    let locationRef = null;
    if (typeof window !== 'undefined' && window.location) {
      locationRef = window.location;
    } else if (typeof globalThis !== 'undefined' && globalThis.location) {
      locationRef = globalThis.location;
    }
    if (!locationRef || typeof locationRef.assign !== 'function') {
      return false;
    }
    try {
      locationRef.assign(target);
      hideOverlay();
      emitEvent('lobbyDismissed', { roomId: safeRoomId, isHost: !!isHost });
      return true;
    } catch (error) {
      return false;
    }
  };

  const renderHostShare = (result) => {
    if (overlayState.fatalError) {
      showOverlay();
      return;
    }
    const roomId = result && result.roomId ? result.roomId : '';
    if (redirectToRoomIfPossible(roomId, true)) {
      return;
    }
    const shareUrl = result && result.shareUrl ? result.shareUrl : '';
    const name = result && result.name ? result.name : '';
    overlayState.contentLocked = false;
    renderView('lobby', `
      <h2>Lobby Ready</h2>
      <p>${escapeHtml(name || 'Host')}, share this link so your friends can join your room.</p>
      <div class="stickfight-share-row">
        <input type="text" id="stickfight-share-input" value="${escapeHtml(shareUrl)}" readonly />
        <button type="button" class="stickfight-secondary-button" id="stickfight-copy-button">Copy</button>
      </div>
      <div class="stickfight-status" id="stickfight-share-status"></div>
      <div style="margin-top: 24px; display: flex; justify-content: flex-end;">
        <button type="button" class="stickfight-primary-button" id="stickfight-enter-button">Enter Lobby</button>
      </div>
      ${roomsSectionMarkup()}
    `);

    const shareInput = overlayState.panel.querySelector('#stickfight-share-input');
    const copyButton = overlayState.panel.querySelector('#stickfight-copy-button');
    const enterButton = overlayState.panel.querySelector('#stickfight-enter-button');
    const statusEl = overlayState.panel.querySelector('#stickfight-share-status');

    const setStatus = (message) => {
      if (!statusEl) {
        return;
      }
      const base = `Room ID: <strong>${escapeHtml(roomId)}</strong>`;
      statusEl.innerHTML = message ? `${base}<br><span>${escapeHtml(message)}</span>` : base;
    };

    setStatus('');

    if (shareInput) {
      shareInput.addEventListener('focus', () => {
        shareInput.select();
      });
    }

    if (copyButton) {
      copyButton.addEventListener('click', async () => {
        if (!shareInput) {
          return;
        }
        shareInput.select();
        shareInput.setSelectionRange(0, shareInput.value.length);
        let copied = false;
        if (navigator && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
          try {
            await navigator.clipboard.writeText(shareInput.value);
            copied = true;
          } catch (err) {
            copied = false;
          }
        }
        if (!copied) {
          try {
            copied = document.execCommand && document.execCommand('copy');
          } catch (error) {
            copied = false;
          }
        }
        setStatus(copied ? 'Invite link copied to clipboard!' : 'Copy the link above to invite players.');
      });
    }

    if (enterButton) {
      enterButton.addEventListener('click', () => {
        if (redirectToRoomIfPossible(roomId, true)) {
          return;
        }
        hideOverlay();
        emitEvent('lobbyDismissed', { roomId, isHost: true });
      });
    }

    attachAdminEntryHandler();
    updateRoomsTable();
  };

  const renderEnterView = () => {
    if (overlayState.fatalError) {
      showOverlay();
      return;
    }
    showOverlay();
    overlayState.contentLocked = false;
    const identity = getPlayerIdentity();
    const identityMarkup = playerIdentityMarkup({
      missingMessage: 'Enter the 4-letter code word provided by the host to unlock your player identity.',
    });
    renderView(
      'enter',
      `
      <h2>Enter Player Code</h2>
      <p>${escapeHtml(
        identity
          ? 'Update or confirm your Stick Fight identity by entering a new code word.'
          : 'Enter your assigned 4-letter code word to unlock your Stick Fight identity.'
      )}</p>
      ${identityMarkup}
      <form class="stickfight-lobby-form" id="stickfight-enter-form">
        <label>
          <span>Code Word</span>
          <input type="text" id="stickfight-enter-code" name="codeWord" maxlength="4" autocomplete="off" placeholder="ABCD" required />
        </label>
        <div class="stickfight-lobby-error" id="stickfight-enter-error"></div>
        <button type="submit" class="stickfight-primary-button" id="stickfight-enter-submit">Save Identity</button>
      </form>
    `,
    );

    const form = overlayState.panel.querySelector('#stickfight-enter-form');
    const input = overlayState.panel.querySelector('#stickfight-enter-code');
    const errorEl = overlayState.panel.querySelector('#stickfight-enter-error');
    const submitButton = overlayState.panel.querySelector('#stickfight-enter-submit');

    if (!form) {
      return;
    }

    if (input) {
      input.focus();
      input.addEventListener('input', () => {
        const next = input.value ? input.value.toUpperCase() : '';
        const sanitized = next.replace(/[^A-Z]/g, '').slice(0, 4);
        if (sanitized !== input.value) {
          input.value = sanitized;
        }
      });
    }

    let busy = false;
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (!input || !submitButton) {
        return;
      }
      if (busy) {
        return;
      }
      const codeValue = input.value ? input.value.toUpperCase() : '';
      const sanitized = sanitizeCodeWord(codeValue);
      if (!sanitized) {
        if (errorEl) {
          errorEl.textContent = 'Enter a valid 4-letter code word.';
        }
        input.focus();
        return;
      }
      busy = true;
      if (errorEl) {
        errorEl.textContent = '';
      }
      submitButton.disabled = true;
      try {
        const fetchedIdentity = await fetchPlayerIdentityByCodeWord(sanitized);
        if (!fetchedIdentity) {
          if (errorEl) {
            errorEl.textContent = 'That code word could not be found. Double-check and try again.';
          }
          submitButton.disabled = false;
          busy = false;
          return;
        }
        setPlayerIdentity(fetchedIdentity);
        goToRoute('#/lobby');
      } catch (error) {
        const message = error && error.message ? error.message : 'Unable to verify the code word.';
        if (errorEl) {
          errorEl.textContent = message;
        }
        submitButton.disabled = false;
        busy = false;
      }
    });
  };

  const normalizeRouteKey = (value) => {
    if (value === '#/admin' || value === '#/lobby') {
      return value;
    }
    if (value === '#admin') {
      return '#/admin';
    }
    return '#/lobby';
  };

  const getCurrentRoute = () => {
    if (typeof window === 'undefined' || !window.location) {
      return '#/lobby';
    }
    return normalizeRouteKey(window.location.hash || '');
  };

  const handleRoute = (routeOverride) => {
    const routeKey = normalizeRouteKey(routeOverride || getCurrentRoute());
    switch (routeKey) {
      case '#/admin':
        renderAdminPanel();
        break;
      case '#/lobby':
      default:
        renderCreateLobby();
        break;
    }
  };

  function goToRoute(route) {
    const target = normalizeRouteKey(route);
    if (typeof window === 'undefined' || !window.location) {
      handleRoute(target);
      return;
    }
    const current = normalizeRouteKey(window.location.hash || '');
    if (current === target) {
      handleRoute(target);
      return;
    }
    window.location.hash = target;
  }

  const setupRouter = (initialRoute) => {
    const targetRoute = normalizeRouteKey(initialRoute || getCurrentRoute());
    if (overlayState.routeHandlerAttached) {
      handleRoute(targetRoute);
      return;
    }
    if (typeof window === 'undefined') {
      overlayState.routeHandlerAttached = true;
      handleRoute(targetRoute);
      return;
    }
    const onHashChange = () => handleRoute();
    window.addEventListener('hashchange', onHashChange);
    overlayState.routeHandlerAttached = true;
    const current = normalizeRouteKey(window.location.hash || '');
    if (!window.location.hash || current !== targetRoute) {
      window.location.hash = targetRoute;
    } else {
      handleRoute(targetRoute);
    }
  };

  const initializeOverlayFlow = () => {
    if (overlayState.fatalError) {
      renderKeyVerificationError();
      return;
    }
    createStyles();
    ensureOverlay();
    startLobbyRoomsListener();
    if (!overlayState.overlay) {
      return;
    }
    const search = (typeof window !== 'undefined' && window.location && window.location.search) || '';
    let roomId = '';
    if (typeof URLSearchParams === 'function') {
      try {
        const params = new URLSearchParams(search);
        roomId = params.get('room') || '';
      } catch (error) {
        roomId = '';
      }
    } else {
      const match = /[?&]room=([^&]+)/i.exec(search);
      roomId = match ? decodeURIComponent(match[1]) : '';
    }
    const safeRoomId = sanitizeRoomId(roomId);
    let initialRoute = null;
    if (typeof window !== 'undefined' && window.location && window.location.hash) {
      initialRoute = normalizeRouteKey(window.location.hash);
    }
    setupRouter(initialRoute || '#/lobby');

    if (safeRoomId) {
      joinLobbyByCode(safeRoomId);
    } else if (roomId) {
      ensureLobbyView();
      setBannerMessage(
        'The lobby link you followed is missing or invalid. You can create a new game to get started.'
      );
    }
  };

  const initWhenReady = () => {
    if (typeof document === 'undefined') {
      return;
    }
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', initializeOverlayFlow, { once: true });
    } else {
      initializeOverlayFlow();
    }
  };

  if (!NETWORK_DISABLED) {
    initWhenReady();
  }

  global.StickFightNet = Object.assign(namespace, {
    state: netState,
    ensureFirestore,
    ensureFunctions,
    ensureAuth,
    ensureSignedInUser,
    ensureAuthReady,
    ensureAppAndUser,
    createRoom,
    joinRoom,
    joinLobbyByCode,
    buildShareUrl,
    hideOverlay,
    showOverlay,
    adminCreateRoom,
    adminDeleteRoomByCode,
    adminDeleteAllRooms,
    adminAddPlayer,
    identity: {
      get: getPlayerIdentity,
      set: setPlayerIdentity,
      clear: clearPlayerIdentity,
      fetchByCodeWord: fetchPlayerIdentityByCodeWord,
    },
    showAdminPanel: () => {
      overlayState.isAdmin = true;
      goToRoute('#/admin');
    },
  });
})(typeof window !== 'undefined' ? window : this);
