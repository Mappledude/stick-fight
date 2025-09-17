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
    claims: null,
  };

  const lobbyRoomsState = {
    rooms: [],
    unsubscribe: null,
    listening: false,
  };

  const FirebaseBootstrap =
    global && typeof global.__StickFightFirebaseBootstrap === 'object'
      ? global.__StickFightFirebaseBootstrap
      : null;

  let firebaseBootstrapEnv = null;

  const ensureFirebaseEnv = () => {
    if (NETWORK_DISABLED) {
      throw new Error('Networking disabled by query flags.');
    }
    if (firebaseBootstrapEnv) {
      return firebaseBootstrapEnv;
    }
    if (!FirebaseBootstrap || typeof FirebaseBootstrap.bootstrap !== 'function') {
      throw new Error('Firebase bootstrap helper unavailable.');
    }
    firebaseBootstrapEnv = FirebaseBootstrap.bootstrap(Boot);
    return firebaseBootstrapEnv;
  };

  const describeFirebaseConfig = () => {
    let config = null;
    try {
      if (FirebaseBootstrap && typeof FirebaseBootstrap.getConfig === 'function') {
        config = FirebaseBootstrap.getConfig(Boot);
      } else if (firebaseBootstrapEnv) {
        config = firebaseBootstrapEnv.config;
      }
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

  const firebaseNamespace = () => {
    if (firebaseBootstrapEnv && firebaseBootstrapEnv.firebase) {
      return firebaseBootstrapEnv.firebase;
    }
    if (!FirebaseBootstrap || typeof FirebaseBootstrap.bootstrap !== 'function') {
      return typeof global.firebase !== 'undefined' ? global.firebase : null;
    }
    try {
      return ensureFirebaseEnv().firebase;
    } catch (error) {
      return typeof global.firebase !== 'undefined' ? global.firebase : null;
    }
  };

  const ensureFirestore = () => {
    if (netState.firestore) {
      return netState.firestore;
    }
    const env = ensureFirebaseEnv();
    const firestoreInstance = env && env.firestore ? env.firestore : null;
    if (!firestoreInstance) {
      throw new Error('Firestore SDK is not available.');
    }
    netState.firestore = firestoreInstance;
    netState.fieldValue = env.fieldValue || (env.firebase && env.firebase.firestore ? env.firebase.firestore.FieldValue : null);
    return firestoreInstance;
  };

// --- Auth bootstrap (namespaced Firebase v8 style) ---------------------------
let _authInstance = null;
let _signInPromise = null;
let _adminCheckPromise = null;

/** Return the firebase.auth() singleton, initializing Firebase app if needed. */
function ensureAuth() {
  if (NETWORK_DISABLED) {
    throw new Error('Networking disabled by query flags.');
  }
  if (_authInstance) return _authInstance;

  const env = ensureFirebaseEnv();
  if (!env || !env.auth) {
    throw new Error('Firebase Auth SDK is not available.');
  }

  _authInstance = env.auth;
  bootLog('AUTH', 'auth-instance-ready');
  return _authInstance;
}

/**
 * Ensure there is a signed-in user (anonymous).
 * - De-dupes concurrent calls via a shared promise.
 * - Resolves with { auth, user }.
 */
async function ensureSignedInUser() {
  const auth = ensureAuth();

  // Already signed in?
  if (auth.currentUser) {
    bootLog('AUTH', 'current-user', { uid: auth.currentUser.uid || null });
    return { auth, user: auth.currentUser };
  }

  // Another call is already signing in? await it.
  if (_signInPromise) {
    await _signInPromise;
    if (!auth.currentUser) {
      throw new Error('Anonymous sign-in finished but no currentUser present.');
    }
    bootLog('AUTH', 'sign-in-shared');
    return { auth, user: auth.currentUser };
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
      if (!user) throw new Error('Failed to sign in anonymously.');
      const uid = user.uid || 'missing';
      bootLog('AUTH', `result code=ok uid=${uid}`);
      return user;
    })
    .catch((err) => {
      _signInPromise = null;
      const code = err && typeof err.code === 'string' ? err.code : 'unknown';
      const rawMessage = err && typeof err.message === 'string' ? err.message : '';
      const message = rawMessage || (err ? String(err) : 'Failed to sign in anonymously.');
      bootLog('AUTH', `result code=${code} message=${message}`);
      const combinedMessage = `Firebase Auth failed (code=${code}): ${message}`;
      const authError = new Error(combinedMessage);
      if (code && typeof code === 'string') {
        authError.code = code;
      }
      if (Boot && typeof Boot.error === 'function') {
        Boot.error(authError, 'AUTH');
      }
      throw authError;
    });

  const user = await _signInPromise;
  return { auth, user };
}

/** Optional: legacy/compat alias for callers expecting a “ready” function. */
function ensureAuthReady() {
  return ensureSignedInUser().then(() => undefined);
}

  const ADMIN_CLAIM_KEYS = ['admin', 'stickfightAdmin'];

  const claimsContainAdmin = (claims) => {
    if (!claims || typeof claims !== 'object') {
      return false;
    }
    for (let i = 0; i < ADMIN_CLAIM_KEYS.length; i += 1) {
      const key = ADMIN_CLAIM_KEYS[i];
      if (claims[key] === true) {
        return true;
      }
    }
    return false;
  };

  const ensureAdminPrivileges = async (options) => {
    const opts = options || {};
    const forceRefresh = !!opts.forceRefresh;
    if (_adminCheckPromise && !forceRefresh) {
      try {
        const result = await _adminCheckPromise;
        if (result && claimsContainAdmin(result.claims)) {
          return result;
        }
      } catch (error) {
        // ignore cached failure and retry below
      }
    }

    const { auth, user } = await ensureSignedInUser();
    const currentUser = user || (auth && auth.currentUser);
    if (!currentUser || !currentUser.uid) {
      throw new Error('Unable to determine the authenticated user.');
    }

    const fetchClaims = async (refresh) => {
      try {
        return await currentUser.getIdTokenResult(refresh);
      } catch (error) {
        if (refresh) {
          throw error;
        }
        return currentUser.getIdTokenResult(true);
      }
    };

    _adminCheckPromise = Promise.resolve()
      .then(() => fetchClaims(forceRefresh))
      .then((tokenResult) => {
        if (!tokenResult) {
          throw new Error('Failed to verify admin privileges.');
        }
        const claims = tokenResult.claims || {};
        overlayState.claims = claims;
        if (!claimsContainAdmin(claims)) {
          const error = new Error(
            'Admin privileges are required. Ask the project owner to grant the admin custom claim.'
          );
          error.code = 'auth/not-admin';
          error.claims = claims;
          throw error;
        }
        return { auth, user: currentUser, claims };
      })
      .catch((error) => {
        overlayState.claims = (error && error.claims) || overlayState.claims || null;
        throw error;
      });

    return _adminCheckPromise;
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

  const createRoomRecord = async ({ hostUid, hostName }) => {
    const firestore = ensureFirestore();
    const resolvedName = hostName && hostName.trim() ? hostName.trim() : 'Host';
    const roomId = generateRoomId();
    const hostPeerId = generatePeerId();
    const roomsCollection = firestore.collection('rooms');
    const roomRef = roomsCollection.doc(roomId);
    const playersRef = roomRef.collection('players').doc(hostUid);
    const now = getTimestampValue();
    await runTransaction(async (transaction) => {
      const existing = await transaction.get(roomRef);
      if (existing && existing.exists) {
        throw new Error('A room with this ID already exists. Please try again.');
      }
      transaction.set(roomRef, {
        code: roomId,
        active: true,
        status: 'open',
        createdAt: now,
        updatedAt: now,
        lastActivityAt: now,
        maxPlayers: 9,
        hostPeerId,
        hostUid,
        playerCount: 1,
      });
      transaction.set(playersRef, {
        uid: hostUid,
        peerId: hostPeerId,
        name: resolvedName,
        joinedAt: now,
        isHost: true,
      });
    });
    logMessage('[ROOM]', `created code=${roomId} host=${hostUid} peer=${hostPeerId}`);
    return {
      roomId,
      hostPeerId,
      hostUid,
      hostName: resolvedName,
    };
  };

  const createRoom = async (options) => {
    logConfigScope('room-create');
    await ensureAuthReady();
    const { auth, user } = await ensureSignedInUser();
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
    await ensureAuthReady();
    const firestore = ensureFirestore();
    const { auth, user } = await ensureSignedInUser();
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
    const roomRef = firestore.collection('rooms').doc(trimmedRoomId);
    const peerId = generatePeerId();
    const playerDocRef = roomRef.collection('players').doc(currentUser.uid);
    const playersCollection = roomRef.collection('players');
    const [existingPlayerDoc, playersSnapshot] = await Promise.all([
      playerDocRef.get(),
      playersCollection.get(),
    ]);
    const alreadyPresent = !!(existingPlayerDoc && existingPlayerDoc.exists);

    await runTransaction(async (transaction) => {
      const roomSnapshot = await transaction.get(roomRef);
      if (!roomSnapshot || !roomSnapshot.exists) {
        throw new Error('The requested room could not be found.');
      }
      const roomData = roomSnapshot.data() || {};
      const maxPlayers = typeof roomData.maxPlayers === 'number' ? roomData.maxPlayers : 9;
      if (!alreadyPresent && playersSnapshot && playersSnapshot.size >= maxPlayers) {
        throw new Error('This room is already full.');
      }
      const now = getTimestampValue();
      transaction.set(playerDocRef, {
        uid: currentUser.uid,
        peerId,
        name: resolvedName,
        joinedAt: now,
        isHost: false,
      });
      const updates = {
        updatedAt: now,
        lastActivityAt: now,
      };
      if (!alreadyPresent) {
        if (netState.fieldValue && typeof netState.fieldValue.increment === 'function') {
          updates.playerCount = netState.fieldValue.increment(1);
        } else {
          const currentCount = typeof roomData.playerCount === 'number' ? roomData.playerCount : playersSnapshot.size;
          updates.playerCount = currentCount + 1;
        }
      }
      transaction.update(roomRef, updates);
    });

    netState.roomId = trimmedRoomId;
    netState.peerId = peerId;
    netState.isHost = false;
    netState.playerName = resolvedName;
    netState.shareUrl = buildShareUrl(trimmedRoomId);
    netState.initialized = true;

    logMessage('[ROOM]', `joined code=${trimmedRoomId} uid=${currentUser.uid} name=${resolvedName}${alreadyPresent ? ' (rejoin)' : ''}`);

    emitEvent('roomJoined', {
      roomId: trimmedRoomId,
      peerId,
      name: resolvedName,
    });

    return { roomId: trimmedRoomId, peerId, name: resolvedName };
  };

  const deleteCollectionDocs = async (collectionRef, batchSize = 50) => {
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
  };

  const deleteRoomDocument = async (roomRef) => {
    const subcollections = ['players', 'signals'];
    for (let i = 0; i < subcollections.length; i += 1) {
      const sub = subcollections[i];
      try {
        const subRef = roomRef.collection(sub);
        await deleteCollectionDocs(subRef);
      } catch (error) {
        logMessage('[ROOM]', `failed to delete ${sub} for code=${roomRef.id}`, error);
      }
    }
    await roomRef.delete();
    logMessage('[ROOM]', `deleted code=${roomRef.id}`);
  };

  const adminCreateRoom = async () => {
    logConfigScope('admin-create-room');
    const { user } = await ensureAdminPrivileges();
    if (!user || !user.uid) {
      throw new Error('Admin privileges are required.');
    }
    const record = await createRoomRecord({ hostUid: user.uid, hostName: 'Admin' });
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
    const firestore = ensureFirestore();
    const roomRef = firestore.collection('rooms').doc(trimmed);
    const snapshot = await roomRef.get();
    if (!snapshot.exists) {
      throw new Error('Room not found.');
    }
    await deleteRoomDocument(roomRef);
    return trimmed;
  };

  const adminDeleteAllRooms = async () => {
    await ensureAdminPrivileges();
    const firestore = ensureFirestore();
    const roomsSnapshot = await firestore.collection('rooms').get();
    const docs = roomsSnapshot.docs || [];
    for (let i = 0; i < docs.length; i += 1) {
      await deleteRoomDocument(docs[i].ref);
    }
    return docs.length;
  };

  const roomsSectionMarkup = (includeAdminButton = true) => `
      <div class="stickfight-rooms-section">
        <div class="stickfight-rooms-header">
          <h3>Open Lobbies</h3>
          ${includeAdminButton
            ? '<button type="button" class="stickfight-secondary-button" id="stickfight-admin-entry">Admin</button>'
            : ''}
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
        return `
          <tr>
            <td>${escapeHtml(room.code)}</td>
            <td>${escapeHtml(String(countText))}</td>
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
  };

  const startLobbyRoomsListener = async () => {
    logConfigScope('lobby-listener');
    if (lobbyRoomsState.listening) {
      return;
    }
    lobbyRoomsState.listening = true;
    try {
      await ensureAuthReady();
    } catch (error) {
      logMessage('[LOBBY]', 'failed to initialize auth for lobby rooms', error);
      return;
    }
    const firestore = ensureFirestore();
    try {
      const query = firestore
        .collection('rooms')
        .where('status', '==', 'open')
        .where('active', '==', true);
      lobbyRoomsState.unsubscribe = query.onSnapshot(
        (snapshot) => {
          Promise.resolve()
            .then(() => refreshRoomsFromSnapshot(snapshot))
            .catch((error) => {
              logMessage('[LOBBY]', 'failed to process rooms snapshot', error);
            });
        },
        (error) => {
          logMessage('[LOBBY]', 'rooms snapshot error', error);
        }
      );
    } catch (error) {
      logMessage('[LOBBY]', 'unable to listen for rooms', error);
    }
  };

  const handleAdminEntry = async () => {
    logConfigScope('admin-handle-entry');
    if (overlayState.isAdmin) {
      renderAdminPanel();
      return;
    }
    const promptFn = typeof window !== 'undefined' && typeof window.prompt === 'function' ? window.prompt : null;
    const alertFn = typeof window !== 'undefined' && typeof window.alert === 'function' ? window.alert : null;
    const code = promptFn ? promptFn('Enter admin code') : null;
    if (code === '808080') {
      try {
        await ensureAdminPrivileges({ forceRefresh: true });
        overlayState.isAdmin = true;
        logMessage('[ADMIN]', 'entered');
        renderAdminPanel();
      } catch (error) {
        overlayState.isAdmin = false;
        const message = error && error.message ? error.message : 'Failed to verify admin access.';
        logMessage('[ADMIN]', 'entry-denied', error);
        if (alertFn) {
          alertFn(message);
        }
      }
    } else if (code && code.trim()) {
      if (alertFn) {
        alertFn('Invalid admin code.');
      }
    }
  };

  const attachAdminEntryHandler = () => {
    if (!overlayState.panel) {
      return;
    }
    const adminButton = overlayState.panel.querySelector('#stickfight-admin-entry');
    if (!adminButton) {
      return;
    }
    adminButton.addEventListener('click', handleAdminEntry);
  };

  const renderAdminPanel = () => {
    showOverlay();
    renderContent(`
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
        <div style="display: flex; justify-content: flex-end; gap: 12px;">
          <button type="button" class="stickfight-secondary-button" id="stickfight-admin-back">Back</button>
        </div>
      </div>
      ${roomsSectionMarkup(false)}
    `);

    const statusEl = overlayState.panel.querySelector('#stickfight-admin-status');
    const setStatus = (message) => {
      if (statusEl) {
        statusEl.textContent = message || '';
      }
    };

    const createButton = overlayState.panel.querySelector('#stickfight-admin-create-room');
    if (createButton) {
      createButton.addEventListener('click', async () => {
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
        renderCreateLobby();
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
    `;
    document.head.appendChild(style);
  };

  const ensureOverlay = () => {
    if (overlayState.overlay || typeof document === 'undefined') {
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
  };

  const renderContent = (html) => {
    if (!overlayState.panel) {
      return;
    }
    overlayState.panel.innerHTML = html;
  };

  const renderCreateLobby = () => {
    showOverlay();
    renderContent(`
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

  const renderHostShare = (result) => {
    const shareUrl = result && result.shareUrl ? result.shareUrl : '';
    const roomId = result && result.roomId ? result.roomId : '';
    const name = result && result.name ? result.name : '';
    renderContent(`
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
        hideOverlay();
        emitEvent('lobbyDismissed', { roomId, isHost: true });
      });
    }

    attachAdminEntryHandler();
    updateRoomsTable();
  };

  const renderJoinForm = (roomId) => {
    showOverlay();
    renderContent(`
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

  const renderJoinSuccess = (result) => {
    const playerName = result && result.name ? result.name : 'Player';
    renderContent(`
      <h2>Ready to Fight</h2>
      <p>${escapeHtml(playerName)}, you have joined the lobby. Waiting for the host to start the match!</p>
      <div style="display: flex; justify-content: flex-end; margin-top: 24px;">
        <button type="button" class="stickfight-primary-button" id="stickfight-join-success-button">Continue</button>
      </div>
    `);

    const button = overlayState.panel.querySelector('#stickfight-join-success-button');
    if (button) {
      button.addEventListener('click', () => {
        hideOverlay();
        emitEvent('lobbyDismissed', { roomId: netState.roomId, isHost: false });
      });
    }
  };

  const renderInvalidRoom = () => {
    showOverlay();
    renderContent(`
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

  const initializeOverlayFlow = () => {
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
    if (safeRoomId) {
      renderJoinForm(safeRoomId);
    } else if (roomId) {
      renderInvalidRoom();
    } else {
      renderCreateLobby();
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
    ensureAuth,
    ensureSignedInUser,
    ensureAuthReady,
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
      renderAdminPanel();
    },
  });
})(typeof window !== 'undefined' ? window : this);
