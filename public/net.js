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
    joinPrefillCode: '',
    pendingJoinRoomId: '',
    routeHandlerAttached: false,
    invalidRoomLink: false,
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

// ---------- Room creation (host) with device-lock & metadata ----------

const createRoomRecord = async ({ hostUid, hostName }) =>
  withFirestoreErrorHandling('create', async () => {
    const firestore = ensureFirestore();
    const resolvedName = hostName && hostName.trim() ? hostName.trim() : 'Host';

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
      });

      // Host player document (device lock + identity)
      transaction.set(playersRef, {
        uid: hostUid,
        deviceId,
        peerId: hostPeerId,
        role: 'host',
        isHost: true,
        name: resolvedName,
        nick: resolvedName,
        joinedAt: ts,
        lastSeenAt: ts,
        hp: 100,
      });
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
    const resolvedHostName = hostName && hostName.trim() ? hostName.trim() : 'Host';
    const record = await createRoomRecord({ hostUid: currentUser.uid, hostName: resolvedHostName });
    const { roomId, hostPeerId } = record;

    const shareUrl = buildShareUrl(roomId);
    netState.roomId = roomId;
    netState.peerId = hostPeerId;
    netState.isHost = true;
    netState.playerName = resolvedHostName;
    netState.shareUrl = shareUrl;
    netState.initialized = true;

    logMessage('[ROOM]', `created id=${roomId} code=${roomId}`);

    emitEvent('roomCreated', {
      roomId,
      hostPeerId,
      shareUrl,
      name: resolvedHostName,
    });

    return { roomId, hostPeerId, shareUrl, name: resolvedHostName };
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
    const resolvedName = playersName && playersName.trim() ? playersName.trim() : 'Player';
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
          lastSeenAt: timestamp,
        };
        if (!alreadyPresent) {
          playerData.joinedAt = timestamp;
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
    netState.shareUrl = buildShareUrl(trimmedRoomId);
    netState.initialized = true;

    logMessage('[ROOM]', `joined code=${trimmedRoomId} uid=${currentUser.uid} name=${resolvedName}`);

    emitEvent('roomJoined', {
      roomId: trimmedRoomId,
      peerId,
      name: resolvedName,
    });

    return { roomId: trimmedRoomId, peerId, name: resolvedName };
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
    const record = await createRoomRecord({ hostUid: user.uid, hostName: 'Admin' });
    logMessage('[ROOM]', `created id=${record.roomId} code=${record.roomId}`);
    return {
      roomId: record.roomId,
      hostPeerId: record.hostPeerId,
      shareUrl: buildShareUrl(record.roomId),
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

  const roomsSectionMarkup = (includeAdminButton = true) => `
      <div class="stickfight-rooms-section">
        <div class="stickfight-rooms-header">
          <h3>Open Lobbies</h3>
          <div class="stickfight-rooms-actions">
            <a class="stickfight-secondary-button stickfight-join-link" href="#/join" id="stickfight-open-join">Join Table</a>
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
        overlayState.joinPrefillCode = sanitized;
        overlayState.pendingJoinRoomId = '';
        overlayState.invalidRoomLink = false;
        goToRoute('#/join');
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
    const joinLink = overlayState.panel.querySelector('#stickfight-open-join');
    if (joinLink) {
      joinLink.addEventListener('click', (event) => {
        event.preventDefault();
        overlayState.pendingJoinRoomId = '';
        overlayState.invalidRoomLink = false;
        goToRoute('#/join');
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
    renderView(
      'admin',
      `
      <h2>Admin Controls</h2>
      <p>Manage rooms for debugging and moderation. Be careful—deletions are permanent.</p>
      <div class="stickfight-admin-grid">
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
      .stickfight-admin-inline input[type="text"] {
        flex: 1;
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
    const navLink = (view, id, label) => {
      const isActive = activeView === view ? ' active' : '';
      return `<a href="#/${view}" id="${id}" class="nav-link${isActive}">${label}</a>`;
    };
    const viewSection = (view) => {
      const hiddenClass = activeView === view ? '' : ' class="hidden"';
      const content = activeView === view ? bodyHtml : '';
      return `<section data-view="${view}"${hiddenClass}>${content}</section>`;
    };
    return `
      <header class="topbar">
        <nav class="nav">
          ${navLink('lobby', 'link-lobby', 'Lobby')}
          ${navLink('admin', 'link-admin', 'Admin')}
          ${navLink('join', 'link-join', 'Join Table')}
        </nav>
      </header>
      <main class="stickfight-main">
        ${viewSection('lobby')}
        ${viewSection('admin')}
        ${viewSection('join')}
      </main>
    `;
  };

  const renderView = (activeView, bodyHtml, options) => {
    overlayState.activeView = activeView;
    renderContent(renderLayout(activeView, bodyHtml), options);
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
    renderView('lobby', `
      <h2>Host a Lobby</h2>
      <p>Create a room and share the invite link with your friends.</p>
      <form class="stickfight-lobby-form" id="stickfight-create-form">
        <label>
          <span>Nickname</span>
          <input type="text" id="stickfight-host-name" name="name" maxlength="32" autocomplete="off" placeholder="Your name" />
        </label>
        <div class="stickfight-lobby-error" id="stickfight-create-error"></div>
        <button type="submit" class="stickfight-primary-button" id="stickfight-create-button">Create Game</button>
      </form>
      ${roomsSectionMarkup()}
    `);

    const form = overlayState.panel.querySelector('#stickfight-create-form');
    const nameInput = overlayState.panel.querySelector('#stickfight-host-name');
    const errorEl = overlayState.panel.querySelector('#stickfight-create-error');
    const submitButton = overlayState.panel.querySelector('#stickfight-create-button');

    if (nameInput) {
      nameInput.focus();
    }

    let busy = false;
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (busy) {
        return;
      }
      busy = true;
      logMessage('[ROOM]', 'create click');
      errorEl.textContent = '';
      submitButton.disabled = true;
      const name = nameInput ? nameInput.value.trim() : '';
      try {
        const result = await createRoom({ name });
        renderHostShare(result);
      } catch (error) {
        const message = error && error.message ? error.message : 'Unable to create the room.';
        errorEl.textContent = message;
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

  const renderJoinForm = (roomId) => {
    if (overlayState.fatalError) {
      showOverlay();
      return;
    }
    showOverlay();
    overlayState.contentLocked = false;
    overlayState.joinPrefillCode = roomId;
    renderView('join', `
      <h2>Join Lobby</h2>
      <p>Enter a nickname to join room <strong>${escapeHtml(roomId)}</strong>.</p>
      <form class="stickfight-lobby-form" id="stickfight-join-form">
        <label>
          <span>Nickname</span>
          <input type="text" id="stickfight-guest-name" name="name" maxlength="32" autocomplete="off" placeholder="Your name" />
        </label>
        <div class="stickfight-lobby-error" id="stickfight-join-error"></div>
        <button type="submit" class="stickfight-primary-button" id="stickfight-join-button">Join Lobby</button>
      </form>
      ${roomsSectionMarkup()}
    `);

    const form = overlayState.panel.querySelector('#stickfight-join-form');
    const nameInput = overlayState.panel.querySelector('#stickfight-guest-name');
    const errorEl = overlayState.panel.querySelector('#stickfight-join-error');
    const submitButton = overlayState.panel.querySelector('#stickfight-join-button');

    if (nameInput) {
      nameInput.focus();
    }

    let busy = false;
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (busy) {
        return;
      }
      busy = true;
      logMessage('[ROOM]', `join click code=${roomId}`);
      errorEl.textContent = '';
      submitButton.disabled = true;
      const name = nameInput ? nameInput.value.trim() : '';
      try {
        const result = await joinRoom(roomId, { name });
        renderJoinSuccess(result);
      } catch (error) {
        const message = error && error.message ? error.message : 'Unable to join the room.';
        errorEl.textContent = message;
        submitButton.disabled = false;
        busy = false;
      }
    });

    attachAdminEntryHandler();
    updateRoomsTable();
  };

  const renderJoinTableView = () => {
    if (overlayState.fatalError) {
      showOverlay();
      return;
    }
    showOverlay();
    overlayState.contentLocked = false;
    overlayState.invalidRoomLink = false;
    renderView(
      'join',
      `
      <h2>Join Table</h2>
      <p>Enter a room code to join an existing lobby.</p>
      <form class="stickfight-lobby-form" id="join-form">
        <label>
          <span>Room Code</span>
          <input type="text" id="join-code" name="code" placeholder="Enter room code" autocomplete="off" required />
        </label>
        <div class="stickfight-lobby-error" id="stickfight-join-code-error"></div>
        <button type="submit" class="stickfight-primary-button">Join</button>
      </form>
      ${roomsSectionMarkup()}
    `
    );

    const form = overlayState.panel.querySelector('#join-form');
    const input = overlayState.panel.querySelector('#join-code');
    const errorEl = overlayState.panel.querySelector('#stickfight-join-code-error');

    if (input && overlayState.joinPrefillCode) {
      input.value = overlayState.joinPrefillCode;
      input.focus();
    } else if (input) {
      input.focus();
    }

    if (!form) {
      return;
    }

    form.addEventListener('submit', (event) => {
      event.preventDefault();
      if (!input) {
        return;
      }
      const rawCode = input.value ? input.value.trim().toUpperCase() : '';
      const sanitized = sanitizeRoomId(rawCode);
      if (!sanitized) {
        if (errorEl) {
          errorEl.textContent = 'Enter a valid room code.';
        }
        return;
      }
      if (errorEl) {
        errorEl.textContent = '';
      }
      overlayState.joinPrefillCode = sanitized;
      overlayState.pendingJoinRoomId = sanitized;
      renderJoinForm(sanitized);
    });

    attachAdminEntryHandler();
    updateRoomsTable();
  };

  const renderJoinSuccess = (result) => {
    if (overlayState.fatalError) {
      showOverlay();
      return;
    }
    const roomId = result && result.roomId ? result.roomId : netState.roomId || '';
    if (redirectToRoomIfPossible(roomId, false)) {
      return;
    }
    const playerName = result && result.name ? result.name : 'Player';
    overlayState.contentLocked = false;
    renderView('join', `
      <h2>Ready to Fight</h2>
      <p>${escapeHtml(playerName)}, you have joined the lobby. Waiting for the host to start the match!</p>
      <div style="display: flex; justify-content: flex-end; margin-top: 24px;">
        <button type="button" class="stickfight-primary-button" id="stickfight-join-success-button">Continue</button>
      </div>
    `);

    const button = overlayState.panel.querySelector('#stickfight-join-success-button');
    if (button) {
      button.addEventListener('click', () => {
        if (redirectToRoomIfPossible(roomId, false)) {
          return;
        }
        hideOverlay();
        emitEvent('lobbyDismissed', { roomId: netState.roomId, isHost: false });
      });
    }
  };

  const renderInvalidRoom = () => {
    if (overlayState.fatalError) {
      showOverlay();
      return;
    }
    showOverlay();
    overlayState.contentLocked = false;
    renderView('join', `
      <h2>Invalid Link</h2>
      <p>The lobby link you followed is missing or invalid. You can create a new game to get started.</p>
      <div style="display: flex; justify-content: flex-end; margin-top: 24px;">
        <button type="button" class="stickfight-primary-button" id="stickfight-create-from-invalid">Create New Game</button>
      </div>
      ${roomsSectionMarkup()}
    `);

    const button = overlayState.panel.querySelector('#stickfight-create-from-invalid');
    if (button) {
      button.addEventListener('click', () => {
        renderCreateLobby();
      });
    }

    attachAdminEntryHandler();
    updateRoomsTable();
  };

  const normalizeRouteKey = (value) => {
    if (value === '#/admin' || value === '#/join' || value === '#/lobby') {
      return value;
    }
    if (value === '#admin') {
      return '#/admin';
    }
    if (value === '#join') {
      return '#/join';
    }
    if (value === '#lobby') {
      return '#/lobby';
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
      case '#/join':
        if (overlayState.invalidRoomLink) {
          overlayState.invalidRoomLink = false;
          renderInvalidRoom();
        } else if (overlayState.pendingJoinRoomId) {
          const code = overlayState.pendingJoinRoomId;
          overlayState.pendingJoinRoomId = '';
          renderJoinForm(code);
        } else {
          renderJoinTableView();
        }
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
    if (safeRoomId) {
      overlayState.pendingJoinRoomId = safeRoomId;
      overlayState.joinPrefillCode = safeRoomId;
      initialRoute = '#/join';
    } else if (roomId) {
      overlayState.joinPrefillCode = roomId.trim().toUpperCase();
      overlayState.invalidRoomLink = true;
      initialRoute = '#/join';
    }
    if (!initialRoute && typeof window !== 'undefined' && window.location && window.location.hash) {
      initialRoute = normalizeRouteKey(window.location.hash);
    }
    setupRouter(initialRoute || '#/lobby');
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
    buildShareUrl,
    hideOverlay,
    showOverlay,
    adminCreateRoom,
    adminDeleteRoomByCode,
    adminDeleteAllRooms,
    showAdminPanel: () => {
      overlayState.isAdmin = true;
      goToRoute('#/admin');
    },
  });
})(typeof window !== 'undefined' ? window : this);
