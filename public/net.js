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
  const SAFE_MODE = !!bootFlags.safe;
  const NO_LOBBY_FLAG = !!bootFlags.nolobby;
  const NETWORK_DISABLED = SAFE_MODE || NO_LOBBY_FLAG;

  const AUTO_JOIN_FROM_QUERY = false;
  const AUTO_JOIN_FROM_STATE = false;

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
invalidRoomLink: false,
adminAddCode: '',

    selectedStructure: '',
  };

  const PLAYER_IDENTITY_STORAGE_KEY = 'stickfight.playerIdentity';
  const DEFAULT_IDENTITY_COLOR = '#FFFFFF';
  const IDENTITY_COLOR_REGEX = /^#[0-9A-F]{6}$/;
  const ADMIN_ADD_PLAYER_CODE = '808080';

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

  const lobbyRoomsState = {
    rooms: [],
    roomMetadata: {},
    playerListeners: {},
    unsubscribe: null,
    listening: false,
  };

  const adminPlayersState = {
    players: [],
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

  const adminCreateRoom = async (options = {}) => {
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
    const roomOptions = typeof options === 'object' && options ? options : {};
    const requestedName =
      typeof roomOptions.roomName === 'string' && roomOptions.roomName.trim()
        ? sanitizeRoomName(roomOptions.roomName)
        : '';
    const resolvedRoomName = requestedName || 'Admin Room';
    const resolvedStructure = normalizeStructureValue(roomOptions.structure);

    const record = await createRoomRecord({
      hostUid: user.uid,
      hostName: 'Admin',
      roomName: resolvedRoomName,
      structure: resolvedStructure,
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

  const roomsSectionMarkup = () => `
      <div class="stickfight-rooms-section">
        <div class="stickfight-rooms-header">
<h3>Open Rooms</h3>

        </div>
        <div class="stickfight-lobby-error" id="stickfight-rooms-error"></div>
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
        const playerCount = typeof room.playerCount === 'number' && room.playerCount >= 0 ? room.playerCount : 0;
        const countText = maxPlayers ? `${playerCount}/${maxPlayers}` : `${playerCount}`;
        const code = escapeHtml(room.code);
        const roomLabelSource = room && typeof room.roomName === 'string' && room.roomName.trim()
          ? room.roomName.trim()
          : room.code;
        const roomLabel = escapeHtml(roomLabelSource);
        const sanitizedNames = Array.isArray(room.playerNames)
          ? room.playerNames
              .map((name) => (typeof name === 'string' ? name.trim() : ''))
              .filter((name) => !!name)
              .map((name) => escapeHtml(name))
          : [];
        const namesText = sanitizedNames.length > 0 ? sanitizedNames.join(', ') : escapeHtml('No players');
        return `
          <tr>
            <td>${roomLabel}</td>
            <td>${escapeHtml(String(countText))}</td>
            <td class="stickfight-join-cell">
              <button type="button" class="stickfight-primary-button stickfight-room-join" data-room-code="${code}">Join</button>
            </td>
            <td>${namesText}</td>
          </tr>
        `;
      })
      .join('');
    return `
      <table class="stickfight-rooms-table">
        <thead>
          <tr>
            <th>Room</th>
            <th>Players</th>
            <th>Join</th>
            <th>Names</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>
    `;
  };

  const renderAdminRoomsTableMarkup = () => {
    if (!lobbyRoomsState.rooms || lobbyRoomsState.rooms.length === 0) {
      return '<p class="stickfight-empty">No rooms available.</p>';
    }
    const rows = lobbyRoomsState.rooms
      .slice()
      .sort((a, b) => a.code.localeCompare(b.code))
      .map((room) => {
        const code = escapeHtml(room.code);
        const maxPlayers = typeof room.maxPlayers === 'number' && room.maxPlayers > 0 ? room.maxPlayers : null;
        const countText = maxPlayers ? `${room.playerCount}/${maxPlayers}` : `${room.playerCount}`;
        return `
          <tr>
            <td>${code}</td>
            <td>${escapeHtml(String(countText))}</td>
            <td class="stickfight-admin-room-actions">
              <button type="button" class="stickfight-primary-button stickfight-admin-room-delete" data-room-code="${code}">Delete</button>
            </td>
          </tr>
        `;
      })
      .join('');
    return `
      <table class="stickfight-admin-table">
        <thead>
          <tr>
            <th>Code</th>
            <th>Players</th>
            <th>Delete</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>
    `;
  };

  const updateAdminRoomsTable = () => {
    if (!overlayState.panel) {
      return;
    }
    const container = overlayState.panel.querySelector('#stickfight-admin-rooms-table');
    if (!container) {
      return;
    }
    container.innerHTML = renderAdminRoomsTableMarkup();
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
    const errorEl = overlayState.panel.querySelector('#stickfight-rooms-error');
    if (errorEl) {
      errorEl.textContent = '';
    }
    const joinButtons = container.querySelectorAll('.stickfight-room-join');
    let joinBusy = false;
    joinButtons.forEach((button) => {
      button.addEventListener('click', async () => {
        if (joinBusy) {
          return;
        }
        const identity = getPlayerIdentity();
        if (!identity) {
          if (errorEl) {
            errorEl.textContent = 'Enter your player code before joining a lobby.';
          }
          return;
        }
        if (errorEl) {
          errorEl.textContent = '';
        }
        const raw = button.getAttribute('data-room-code') || '';
        const sanitized = sanitizeRoomId(raw) || (raw ? raw.trim().toUpperCase() : '');
if (!sanitized) {
  if (errorEl) {
    errorEl.textContent = 'Unable to join the selected room.';
  }
  return;
}
joinBusy = true;
button.disabled = true;
try {
  const result = await joinRoom(sanitized, {
    name: identity.name,
    color: identity.color,
    codeWord: identity.codeWord,
  });
  const roomId = (result && result.roomId) || sanitized;
  if (!redirectToRoomIfPossible(roomId, false)) {
    renderJoinSuccess(result);
  }
} catch (error) {
  const message = error && error.message ? error.message : 'Unable to join the room.';
  if (errorEl) {
    errorEl.textContent = message;
  }
} finally {
  joinBusy = false;
  button.disabled = false;
}

      });
    });
    updateAdminRoomsTable();
  };

  const renderAdminPlayersTableMarkup = () => {
    if (!adminPlayersState.players || adminPlayersState.players.length === 0) {
      return '<p class="stickfight-empty">No players found.</p>';
    }
    const hasCreatedAt = adminPlayersState.players.some((player) => !!player.createdAt);
    const hasActive = adminPlayersState.players.some((player) => typeof player.active === 'boolean');
    const headerCells = [`<th>Name</th>`, `<th>Code Word</th>`];
    if (hasCreatedAt) {
      headerCells.push('<th>Created At</th>');
    }
    if (hasActive) {
      headerCells.push('<th>Active</th>');
    }
    const rows = adminPlayersState.players
      .slice()
      .sort((a, b) => {
        const nameCompare = a.name.localeCompare(b.name);
        if (nameCompare !== 0) {
          return nameCompare;
        }
        return a.codeWord.localeCompare(b.codeWord);
      })
      .map((player) => {
        const nameCell = `<td>${escapeHtml(player.name)}</td>`;
        const codeWord = escapeHtml(player.codeWord);
        const codeCell = `
          <td class="stickfight-admin-player-code">
            <span class="stickfight-admin-player-codeword">${codeWord}</span>
            <button type="button" class="stickfight-primary-button stickfight-admin-copy-code" data-code-word="${codeWord}">Copy</button>
          </td>
        `;
        const createdAtCell = hasCreatedAt
          ? `<td>${player.createdAt ? escapeHtml(player.createdAt.toLocaleString()) : ''}</td>`
          : '';
        const activeCell = hasActive
          ? `<td>${
              typeof player.active === 'boolean'
                ? escapeHtml(player.active ? 'Yes' : 'No')
                : ''
            }</td>`
          : '';
        return `<tr>${nameCell}${codeCell}${createdAtCell}${activeCell}</tr>`;
      })
      .join('');
    return `
      <table class="stickfight-admin-table">
        <thead>
          <tr>${headerCells.join('')}</tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>
    `;
  };

  const updateAdminPlayersTable = () => {
    if (!overlayState.panel) {
      return;
    }
    const container = overlayState.panel.querySelector('#stickfight-admin-players-table');
    if (!container) {
      return;
    }
    container.innerHTML = renderAdminPlayersTableMarkup();
  };

  const refreshAdminPlayersFromSnapshot = (snapshot) => {
    const docs = snapshot && snapshot.docs ? snapshot.docs : [];
    const players = docs.map((doc) => {
      const data = doc.data ? doc.data() || {} : {};
      const rawName = typeof data.name === 'string' ? data.name.trim() : '';
      const name = rawName || 'Unnamed Player';
      const rawCodeWord = typeof data.codeWord === 'string' ? data.codeWord : '';
      const sanitizedCodeWord = sanitizeCodeWord(rawCodeWord) || sanitizeCodeWord(doc.id) || doc.id.toUpperCase();
      let createdAt = null;
      if (data.createdAt && typeof data.createdAt.toDate === 'function') {
        try {
          createdAt = data.createdAt.toDate();
        } catch (error) {
          createdAt = null;
        }
      }
      const active = typeof data.active === 'boolean' ? data.active : null;
      return {
        id: doc.id,
        name,
        codeWord: sanitizedCodeWord,
        createdAt,
        active,
      };
    });
    adminPlayersState.players = players;
    updateAdminPlayersTable();
    return players.length;
  };

  const startAdminPlayersListener = async () => {
    if (adminPlayersState.listening) {
      return;
    }
    adminPlayersState.listening = true;
    try {
      const firestore = ensureFirestore();
      if (!firestore || typeof firestore.collection !== 'function') {
        adminPlayersState.listening = false;
        return;
      }
      const collectionRef = firestore.collection('players');
      adminPlayersState.unsubscribe = collectionRef.onSnapshot(
        (snapshot) => {
          refreshAdminPlayersFromSnapshot(snapshot);
        },
        (error) => {
          adminPlayersState.listening = false;
          handleFirestoreError('listen', error);
        }
      );
    } catch (error) {
      adminPlayersState.listening = false;
      handleFirestoreError('listen', error);
    }
  };

const updateRoomsFromMetadata = () => {
  const metadata = lobbyRoomsState.roomMetadata || {};
  lobbyRoomsState.rooms = Object.keys(metadata).map((code) => {
    const entry = metadata[code] || {};
    const maxPlayers =
      typeof entry.maxPlayers === 'number' && entry.maxPlayers > 0 ? entry.maxPlayers : undefined;
    const playerNames = Array.isArray(entry.playerNames) ? entry.playerNames.slice() : [];
    const playerCount =
      typeof entry.playerCount === 'number' && entry.playerCount >= 0
        ? entry.playerCount
        : playerNames.length;
    return {
      code,
      roomName: typeof entry.roomName === 'string' ? entry.roomName : '',
      playerCount,
      maxPlayers,
      playerNames,
    };
  });
  updateRoomsTable();
};

const detachPlayerListener = (roomId) => {
  if (!roomId) return;
  lobbyRoomsState.playerListeners = lobbyRoomsState.playerListeners || {};
  const unsubscribe = lobbyRoomsState.playerListeners[roomId];
  if (typeof unsubscribe === 'function') {
    try {
      unsubscribe();
    } catch (error) {
      handleFirestoreError('listen', error);
    }
  }
  delete lobbyRoomsState.playerListeners[roomId];
};

const attachPlayerListener = (docRef, roomId) => {
  if (!docRef || !roomId) return;
  lobbyRoomsState.playerListeners = lobbyRoomsState.playerListeners || {};
  if (lobbyRoomsState.playerListeners[roomId]) return;

  try {
    const unsubscribe = docRef.collection('players').onSnapshot(
      (playersSnapshot) => {
        const metadata = lobbyRoomsState.roomMetadata || (lobbyRoomsState.roomMetadata = {});
        const entry = metadata[roomId] || (metadata[roomId] = {});
        const names = [];
        playersSnapshot.forEach((playerDoc) => {
          const d = (playerDoc && playerDoc.data) ? playerDoc.data() || {} : {};
          const nick = typeof d.nick === 'string' ? d.nick.trim() : '';
          const name = typeof d.name === 'string' ? d.name.trim() : '';
          const label = nick || name;
          if (label) names.push(label);
        });
        entry.playerNames = names;
        entry.playerCount = playersSnapshot.size;
        lobbyRoomsState.roomMetadata = metadata;
        updateRoomsFromMetadata();
      },
      (error) => handleFirestoreError('listen', error)
    );
    lobbyRoomsState.playerListeners[roomId] = unsubscribe;
  } catch (error) {
    handleFirestoreError('listen', error);
  }
};

const refreshRoomsFromSnapshot = (snapshot) => {
  const docs = snapshot && snapshot.docs ? snapshot.docs : [];
  const metadata = {};

  docs.forEach((doc) => {
    const data = doc.data ? doc.data() || {} : {};
    const roomId = doc.id;
    metadata[roomId] = {
      roomName: typeof data.roomName === 'string' ? data.roomName.trim() : '',
      maxPlayers:
        typeof data.maxPlayers === 'number' && data.maxPlayers > 0 ? data.maxPlayers : undefined,
      // May be overridden by player listener; keep initial value if provided:
      playerCount:
        typeof data.playerCount === 'number' && data.playerCount >= 0 ? data.playerCount : undefined,
      playerNames: [],
    };
    // Ensure we have a live listener for players in this room
    attachPlayerListener(doc.ref, roomId);
  });

  // Detach listeners for rooms that no longer exist
  lobbyRoomsState.playerListeners = lobbyRoomsState.playerListeners || {};
  Object.keys(lobbyRoomsState.playerListeners).forEach((roomId) => {
    if (!metadata[roomId]) {
      detachPlayerListener(roomId);
    }
  });

  lobbyRoomsState.roomMetadata = metadata;
  updateRoomsFromMetadata();
};

          }
          const names = [];
          playersSnapshot.forEach((playerDoc) => {
            const playerData = playerDoc && typeof playerDoc.data === 'function' ? playerDoc.data() || {} : {};
            const rawName = typeof playerData.name === 'string' ? playerData.name : '';
            const trimmed = rawName.trim();
            if (trimmed) {
              names.push(trimmed);
            }
          });
          entry.playerCount = playersSnapshot.size;
          entry.playerNames = names;
          updateRoomsFromMetadata();
        },
        (error) => {
          handleFirestoreError('listen', error);
        }
      );
      lobbyRoomsState.playerListeners[roomId] = unsubscribe;
    } catch (error) {
      handleFirestoreError('listen', error);
    }
  };

  const refreshRoomsFromSnapshot = async (snapshot) => {
    const docs = snapshot && snapshot.docs ? snapshot.docs : [];
    const metadata = lobbyRoomsState.roomMetadata || {};
    const activeRoomIds = new Set();

    docs.forEach((doc) => {
      const code = doc && doc.id ? doc.id : '';
      if (!code) {
        return;
      }
      activeRoomIds.add(code);
      const data = doc.data ? doc.data() || {} : {};
      const entry = metadata[code] || { code, playerNames: [] };
      entry.code = code;
      entry.roomName = typeof data.roomName === 'string' ? data.roomName : entry.roomName || '';
      if (typeof data.playerCount === 'number') {
        entry.playerCount = data.playerCount;
      } else if (typeof entry.playerCount !== 'number') {
        entry.playerCount = 0;
      }
      entry.maxPlayers =
        typeof data.maxPlayers === 'number' ? data.maxPlayers : entry.maxPlayers;
      metadata[code] = entry;
      attachPlayerListener(doc.ref, code);
    });

    Object.keys(metadata).forEach((code) => {
      if (activeRoomIds.has(code)) return;
      detachPlayerListener(code);
      delete metadata[code];
    });

    lobbyRoomsState.roomMetadata = metadata;
    updateRoomsFromMetadata();
    const count = docs.length;
    logMessage('[LOBBY]', `rooms=${count}`);
    return count;
  };

  const stopLobbyRoomsListener = () => {
    const listeners = lobbyRoomsState.playerListeners || {};
    Object.keys(listeners).forEach((roomId) => {
      detachPlayerListener(roomId);
    });
    lobbyRoomsState.playerListeners = {};
    lobbyRoomsState.roomMetadata = {};
    lobbyRoomsState.rooms = [];
    if (typeof lobbyRoomsState.unsubscribe === 'function') {
      try {
        lobbyRoomsState.unsubscribe();
      } catch (error) {
        handleFirestoreError('listen', error);
      }
    }
    lobbyRoomsState.unsubscribe = null;
    lobbyRoomsState.listening = false;

    updateRoomsTable();
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

    const structureOptions = resolveRoomStructureOptions();
    const arenaDefault = structureOptions.find(
      (option) => option && option.value && option.value.toLowerCase() === 'arena'
    );
    const defaultStructureValue = arenaDefault ? arenaDefault.value : getDefaultRoomStructure();
    const structureOptionsMarkup = structureOptions
      .map((option) => {
        if (!option || !option.value) {
          return '';
        }
        const value = escapeHtml(option.value);
        const label = escapeHtml(option.label || option.value);
        const selected = option.value === defaultStructureValue ? ' selected' : '';
        return `<option value="${value}"${selected}>${label}</option>`;
      })
      .join('');

    renderView(
      'admin',
      `
      <h2>Admin Controls</h2>
      <p>Manage rooms for debugging and moderation. Be careful—deletions are permanent.</p>
      <div class="stickfight-admin-sections">
        <section class="stickfight-admin-section">
          <h3>Create Room</h3>
          <form class="stickfight-admin-form" id="stickfight-admin-create-room-form">
            <label class="stickfight-admin-field">
              <span>Room Name</span>
              <input type="text" id="stickfight-admin-room-name" name="roomName" maxlength="64" autocomplete="off" placeholder="Room name" required />
            </label>
            <label class="stickfight-admin-field">
              <span>Structure</span>
              <select id="stickfight-admin-room-structure" name="structure">${structureOptionsMarkup}</select>
            </label>
            <button type="submit" class="stickfight-primary-button" id="stickfight-admin-create-room-submit">Create Room</button>
          </form>
        </section>
        <section class="stickfight-admin-section">
          <h3>Rooms</h3>
          <div id="stickfight-admin-rooms-table" class="stickfight-admin-table-container"></div>
        </section>
        <section class="stickfight-admin-section">
          <h3>Create Player</h3>
          <form class="stickfight-admin-form" id="stickfight-admin-add-player-form">
            <label class="stickfight-admin-field">
              <span>Player Name</span>
              <input type="text" id="stickfight-admin-player-name" name="playerName" maxlength="64" autocomplete="off" placeholder="Player name" required />
            </label>
            <label class="stickfight-admin-field">
              <span>Player Color (optional)</span>
              <input type="text" id="stickfight-admin-player-color" name="playerColor" autocomplete="off" placeholder="#RRGGBB" />
            </label>
            <button type="submit" class="stickfight-primary-button" id="stickfight-admin-add-submit">Create Player</button>
          </form>
          <div id="stickfight-admin-players-table" class="stickfight-admin-table-container"></div>
        </section>
      </div>
      <div class="stickfight-admin-status" id="stickfight-admin-status"></div>
      <div class="stickfight-admin-actions">
        <button type="button" class="stickfight-secondary-button" id="stickfight-admin-back">Back</button>
      </div>
      ${roomsSectionMarkup()}

    `
    );

    const statusEl = overlayState.panel.querySelector('#stickfight-admin-status');
    const setStatus = (message) => {
      if (statusEl) {
        statusEl.textContent = message || '';
      }
    };

    setStatus('');

    Promise.resolve(startAdminPlayersListener()).catch((error) => {
      logMessage('[ADMIN]', 'players listener failed', error);
    });

    updateAdminRoomsTable();
    updateAdminPlayersTable();

    const createRoomForm = overlayState.panel.querySelector('#stickfight-admin-create-room-form');
    const roomNameInput = overlayState.panel.querySelector('#stickfight-admin-room-name');
    const structureSelect = overlayState.panel.querySelector('#stickfight-admin-room-structure');
    const createRoomButton = overlayState.panel.querySelector('#stickfight-admin-create-room-submit');

    if (structureSelect) {
      structureSelect.value = defaultStructureValue;
    }

    if (createRoomForm) {
      createRoomForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        if (!roomNameInput || !createRoomButton) {
          return;
        }
        const roomNameValue = roomNameInput.value ? roomNameInput.value.trim() : '';
        if (!roomNameValue) {
          setStatus('Room name is required.');
          roomNameInput.focus();
          return;
        }
        const structureValue = structureSelect ? structureSelect.value : defaultStructureValue;
        const normalizedStructure = normalizeStructureValue(structureValue);
        setStatus('Creating room...');
        createRoomButton.disabled = true;
        try {
          const record = await adminCreateRoom({ roomName: roomNameValue, structure: normalizedStructure });
          setStatus(`Room ${record.roomId} created.`);
          roomNameInput.value = '';
          updateAdminRoomsTable();
        } catch (error) {
          const message = error && error.message ? error.message : 'Failed to create room.';
          setStatus(message);
        } finally {
          createRoomButton.disabled = false;
        }
      });
    }

    const addForm = overlayState.panel.querySelector('#stickfight-admin-add-player-form');
    const playerNameInput = overlayState.panel.querySelector('#stickfight-admin-player-name');
    const playerColorInput = overlayState.panel.querySelector('#stickfight-admin-player-color');
    const addSubmitButton = overlayState.panel.querySelector('#stickfight-admin-add-submit');

    if (addForm) {
      addForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        if (!playerNameInput || !addSubmitButton) {
          return;
        }
        const playerNameValue = playerNameInput.value ? playerNameInput.value.trim() : '';
        if (!playerNameValue) {
          setStatus('Player name is required.');
          playerNameInput.focus();
          return;
        }
        const rawColor = playerColorInput && playerColorInput.value ? playerColorInput.value : '';
        const normalizedColor = rawColor ? normalizeHexColorInput(rawColor) : '';
        if (rawColor && !normalizedColor) {
          setStatus('Enter a color in hex format like #FFAA33.');
          if (playerColorInput) {
            playerColorInput.focus();
          }
          return;
        }
        if (playerColorInput && normalizedColor) {
          playerColorInput.value = normalizedColor;
        }
        setStatus('Creating player...');
        addSubmitButton.disabled = true;
        const payload = { adminCode: ADMIN_ADD_PLAYER_CODE, name: playerNameValue };
        if (normalizedColor) {
          payload.color = normalizedColor;
        }
        try {
          const result = await adminAddPlayer(payload);
          setStatus(`Player created with code ${result.codeWord}.`);
          playerNameInput.value = '';
          updateAdminPlayersTable();
        } catch (error) {
          const message = error && error.message ? error.message : 'Failed to create player.';
          setStatus(message);
        } finally {
          addSubmitButton.disabled = false;
        }
      });
    }

    const roomsContainer = overlayState.panel.querySelector('#stickfight-admin-rooms-table');
    if (roomsContainer) {
      roomsContainer.addEventListener('click', async (event) => {
        const rawTarget = event.target;
        if (!(rawTarget instanceof Element)) {
          return;
        }
        const button = rawTarget.closest('button.stickfight-admin-room-delete');
        if (!button) {
          return;
        }
        event.preventDefault();
        const rawCode = button.getAttribute('data-room-code') || '';
        const code = sanitizeRoomId(rawCode) || rawCode.trim().toUpperCase();
        if (!code) {
          return;
        }
        button.disabled = true;
        setStatus(`Deleting room ${code}...`);
        try {
          await adminDeleteRoomByCode(code);
          setStatus(`Room ${code} deleted.`);
          updateAdminRoomsTable();
        } catch (error) {
          const message = error && error.message ? error.message : 'Failed to delete room.';
          setStatus(message);
        } finally {
          button.disabled = false;
        }
      });
    }

    const playersContainer = overlayState.panel.querySelector('#stickfight-admin-players-table');
    if (playersContainer) {
      playersContainer.addEventListener('click', async (event) => {
        const rawTarget = event.target;
        if (!(rawTarget instanceof Element)) {
          return;
        }
        const button = rawTarget.closest('button.stickfight-admin-copy-code');
        if (!button) {
          return;
        }
        event.preventDefault();
        const codeWord = button.getAttribute('data-code-word') || '';
        if (!codeWord) {
          return;
        }
        let copied = false;
        if (navigator && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
          try {
            await navigator.clipboard.writeText(codeWord);
            copied = true;
          } catch (error) {
            copied = false;
          }
        }
        if (!copied && typeof document !== 'undefined') {
          try {
            const temp = document.createElement('textarea');
            temp.value = codeWord;
            temp.setAttribute('readonly', '');
            temp.style.position = 'absolute';
            temp.style.left = '-9999px';
            document.body.appendChild(temp);
            temp.select();
            copied = document.execCommand && document.execCommand('copy');
            document.body.removeChild(temp);
          } catch (error) {
            copied = false;
          }
        }
        setStatus(
          copied
            ? `Code word ${codeWord} copied to clipboard.`
            : 'Copy failed. Select the code word to copy manually.'
        );
      });
    }

    const backButton = overlayState.panel.querySelector('#stickfight-admin-back');
    if (backButton) {
      backButton.addEventListener('click', () => {
        goToRoute('#/lobby');
      });
    }
  };

  const hideOverlay = () => {
    if (overlayState.overlay) {
      overlayState.overlay.classList.add('stickfight-hidden');
    }
    stopLobbyRoomsListener();
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
      .stickfight-admin-sections {
        display: flex;
        flex-direction: column;
        gap: 28px;
        margin-bottom: 24px;
      }
      .stickfight-admin-section {
        display: flex;
        flex-direction: column;
        gap: 16px;
        padding: 20px;
        border-radius: 12px;
        border: 1px solid rgba(11, 180, 255, 0.25);
        background: rgba(9, 24, 38, 0.55);
      }
      .stickfight-admin-section h3 {
        margin: 0;
        font-size: 1.1rem;
        font-weight: 600;
      }
      .stickfight-admin-form {
        display: flex;
        flex-direction: column;
        gap: 14px;
      }
      .stickfight-admin-field {
        display: flex;
        flex-direction: column;
        gap: 6px;
        font-weight: 600;
        font-size: 0.95rem;
        color: rgba(230, 240, 255, 0.92);
      }
      .stickfight-admin-form input[type="text"],
      .stickfight-admin-form select {
        border-radius: 10px;
        padding: 12px 14px;
        border: 1px solid rgba(13, 160, 245, 0.35);
        background: rgba(255, 255, 255, 0.06);
        color: #ffffff;
        font-size: 1rem;
        outline: none;
        transition: border-color 0.2s ease, box-shadow 0.2s ease;
      }
      .stickfight-admin-form input[type="text"]:focus,
      .stickfight-admin-form select:focus {
        border-color: rgba(11, 180, 255, 0.9);
        box-shadow: 0 0 0 3px rgba(11, 180, 255, 0.25);
      }
      .stickfight-admin-table-container {
        overflow-x: auto;
      }
      .stickfight-admin-table {
        width: 100%;
        border-collapse: collapse;
        font-size: 0.95rem;
      }
      .stickfight-admin-table th,
      .stickfight-admin-table td {
        padding: 10px 12px;
        text-align: left;
        border-bottom: 1px solid rgba(11, 180, 255, 0.12);
      }
      .stickfight-admin-table tbody tr:hover {
        background: rgba(11, 180, 255, 0.08);
      }
      .stickfight-admin-room-actions {
        text-align: right;
        width: 1%;
        white-space: nowrap;
      }
      .stickfight-admin-player-code {
        display: inline-flex;
        align-items: center;
        gap: 12px;
        white-space: nowrap;
      }
      .stickfight-admin-player-codeword {
        font-family: 'JetBrains Mono', 'Fira Code', monospace;
        letter-spacing: 0.12em;
      }
      .stickfight-admin-status {
        min-height: 1.4em;
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
    const identityMarkup = playerIdentityMarkup({
      missingMessage: 'Enter your player code before joining a lobby.',
    });
    renderView('lobby', `
      ${identityMarkup}
      ${roomsSectionMarkup()}
    `);

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

  const ROUTE_KEYS = Object.freeze({
    ADMIN: '#/admin',
    LOBBY: '#/lobby',
  });

  const ROUTE_PATH_LOOKUP = Object.freeze({
    '#/admin': '/admin',
    '#/lobby': '/lobby',
  });

  const sanitizeRouteValue = (value) => {
    if (typeof value !== 'string') {
      return '';
    }
    return value.trim().toLowerCase().replace(/^#/, '').replace(/^\/+/, '');
  };

  const resolveRouteFromValue = (value) => {
    const sanitized = sanitizeRouteValue(value);
    if (!sanitized) {
      return ROUTE_KEYS.LOBBY;
    }
    if (sanitized === 'admin') {
      return ROUTE_KEYS.ADMIN;
    }
    if (sanitized === 'lobby') {
      return ROUTE_KEYS.LOBBY;
    }
    return null;
  };

  const normalizeRouteKey = (value) => {
    return resolveRouteFromValue(value) || ROUTE_KEYS.LOBBY;
  };

  const getCurrentRoute = () => {
    if (typeof window === 'undefined' || !window.location) {
      return ROUTE_KEYS.LOBBY;
    }
    const { hash, pathname } = window.location;
    const hashRoute = resolveRouteFromValue(hash || '');
    if (hash && hashRoute) {
      return hashRoute;
    }
    const pathRoute = resolveRouteFromValue(pathname || '');
    if (pathRoute) {
      return pathRoute;
    }
    return ROUTE_KEYS.LOBBY;
  };

  const isRoomPath = (value) => {
    return typeof value === 'string' && /^\/room\//i.test(value);
  };

  const canUsePathRouting = () => {
    if (typeof window === 'undefined' || !window.location || !window.history) {
      return false;
    }
    if (typeof window.history.replaceState !== 'function') {
      return false;
    }
    const path = window.location.pathname || '';
    return !isRoomPath(path);
  };

  const syncRouteToLocation = (route) => {
    if (typeof window === 'undefined' || !window.location) {
      return null;
    }
    const routePath = ROUTE_PATH_LOOKUP[route];
    const pathname = window.location.pathname || '';
    if (canUsePathRouting() && routePath) {
      const search = window.location.search || '';
      const desiredUrl = routePath + search;
      if (pathname !== routePath || window.location.hash) {
        window.history.replaceState(null, '', desiredUrl);
        return 'path';
      }
      return null;
    }
    if (isRoomPath(pathname)) {
      return null;
    }
    if (window.location.hash !== route) {
      window.location.hash = route;
      return 'hash';
    }
    return null;
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
    const current = getCurrentRoute();
    if (current === target) {
      handleRoute(target);
      return;
    }
    const updateMode = syncRouteToLocation(target);
    if (updateMode !== 'hash') {
      handleRoute(target);
    }
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
    const onLocationChange = () => handleRoute();
    window.addEventListener('hashchange', onLocationChange);
    window.addEventListener('popstate', onLocationChange);
    overlayState.routeHandlerAttached = true;
    const updateMode = syncRouteToLocation(targetRoute);
    if (updateMode !== 'hash') {
      handleRoute(targetRoute);
    }
  };

  const initializeOverlayFlow = async (opts = {}) => {
    const skipNetwork = !!opts.skipNetwork;
    if (overlayState.fatalError) {
      renderKeyVerificationError();
      return;
    }
    createStyles();
    ensureOverlay();
    if (!overlayState.overlay) {
      return;
    }
    if (!skipNetwork) {
      await startLobbyRoomsListener();
    } else {
      logMessage('[LOBBY]', 'network listeners disabled — overlay shell only');
      updateRoomsTable();
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
      if (AUTO_JOIN_FROM_QUERY) {
        joinLobbyByCode(safeRoomId);
      } else {
        ensureLobbyView();
      }
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
    const startOverlay = () => initializeOverlayFlow({ skipNetwork: SAFE_MODE || NO_LOBBY_FLAG });
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', startOverlay, { once: true });
    } else {
      startOverlay();
    }
  };

  initWhenReady();

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
    stopLobbyRoomsListener,
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
