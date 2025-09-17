(function (global) {
  'use strict';

  const netState = {
    initialized: false,
    firestore: null,
    fieldValue: null,
    roomId: null,
    peerId: null,
    isHost: false,
    playerName: null,
    shareUrl: null,
  };

  const firebaseNamespace = () => (typeof global.firebase !== 'undefined' ? global.firebase : null);

  const getFirebaseConfig = () => {
    if (typeof global === 'undefined') {
      return null;
    }
    if (global.__FIREBASE_CONFIG__) {
      return global.__FIREBASE_CONFIG__;
    }
    if (global.STICK_FIGHT_FIREBASE_CONFIG) {
      return global.STICK_FIGHT_FIREBASE_CONFIG;
    }
    if (global.STICKFIGHT_FIREBASE_CONFIG) {
      return global.STICKFIGHT_FIREBASE_CONFIG;
    }
    if (global.STICKFIGHT_FIREBASE_OPTIONS) {
      return global.STICKFIGHT_FIREBASE_OPTIONS;
    }
    return null;
  };

  const ensureFirestore = () => {
    if (netState.firestore) {
      return netState.firestore;
    }
    const firebase = firebaseNamespace();
    if (!firebase) {
      throw new Error('Firebase SDK failed to load.');
    }
    const config = getFirebaseConfig();
    if (!config) {
      throw new Error('Firebase configuration was not provided.');
    }
    if (!firebase.apps || firebase.apps.length === 0) {
      firebase.initializeApp(config);
    }
    if (typeof firebase.firestore !== 'function') {
      throw new Error('Firestore SDK is not available.');
    }
    const firestoreInstance = firebase.firestore();
    netState.firestore = firestoreInstance;
    netState.fieldValue = firebase.firestore.FieldValue || null;
    return firestoreInstance;
  };

  const ensureAuthReady = (() => {
    let authPromise = null;

    const ensure = async () => {
      const firebase = firebaseNamespace();
      if (!firebase || typeof firebase.auth !== 'function') {
        return;
      }

      const auth = firebase.auth();
      if (!auth) {
        return;
      }

      if (auth.currentUser) {
        return;
      }

      if (!authPromise) {
        if (typeof auth.signInAnonymously !== 'function') {
          throw new Error('Firebase Auth does not support anonymous sign-in.');
        }
        authPromise = auth
          .signInAnonymously()
          .catch((error) => {
            authPromise = null;
            throw error;
          })
          .then(() => {
            authPromise = null;
          });
      }

      return authPromise;
    };

    return () => ensure();
  })();

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

  const createRoom = async (options) => {
    await ensureAuthReady();
    const firestore = ensureFirestore();
    const hostName = typeof options === 'string' ? options : options && options.name;
    const resolvedHostName = hostName && hostName.trim() ? hostName.trim() : 'Host';
    const roomId = generateRoomId();
    const hostPeerId = generatePeerId();
    const roomsCollection = firestore.collection('rooms');
    const roomRef = roomsCollection.doc(roomId);
    const playersRef = roomRef.collection('players').doc(hostPeerId);

    await runTransaction(async (transaction) => {
      const existing = await transaction.get(roomRef);
      if (existing && existing.exists) {
        throw new Error('A room with this ID already exists. Please try again.');
      }
      transaction.set(roomRef, {
        createdAt: getTimestampValue(),
        maxPlayers: 9,
        hostPeerId,
      });
      transaction.set(playersRef, {
        name: resolvedHostName,
        joinedAt: getTimestampValue(),
      });
    });

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
    await ensureAuthReady();
    const firestore = ensureFirestore();
    const playersName = typeof options === 'string' ? options : options && options.name;
    const resolvedName = playersName && playersName.trim() ? playersName.trim() : 'Player';
    const trimmedRoomId = sanitizeRoomId(roomId);
    if (!trimmedRoomId) {
      throw new Error('Room ID is invalid.');
    }
    const roomRef = firestore.collection('rooms').doc(trimmedRoomId);
    const peerId = generatePeerId();

    await runTransaction(async (transaction) => {
      const roomSnapshot = await transaction.get(roomRef);
      if (!roomSnapshot || !roomSnapshot.exists) {
        throw new Error('The requested room could not be found.');
      }
      const roomData = roomSnapshot.data() || {};
      const maxPlayers = typeof roomData.maxPlayers === 'number' ? roomData.maxPlayers : 9;
      const playersCollection = roomRef.collection('players');
      const playersSnapshot = await transaction.get(playersCollection);
      if (playersSnapshot && playersSnapshot.size >= maxPlayers) {
        throw new Error('This room is already full.');
      }
      transaction.set(playersCollection.doc(peerId), {
        name: resolvedName,
        joinedAt: getTimestampValue(),
      });
    });

    netState.roomId = trimmedRoomId;
    netState.peerId = peerId;
    netState.isHost = false;
    netState.playerName = resolvedName;
    netState.shareUrl = buildShareUrl(trimmedRoomId);
    netState.initialized = true;

    emitEvent('roomJoined', {
      roomId: trimmedRoomId,
      peerId,
      name: resolvedName,
    });

    return { roomId: trimmedRoomId, peerId, name: resolvedName };
  };

  const overlayState = {
    overlay: null,
    panel: null,
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
    `);

    const button = overlayState.panel.querySelector('#stickfight-create-from-invalid');
    if (button) {
      button.addEventListener('click', () => {
        renderCreateLobby();
      });
    }
  };

  const initializeOverlayFlow = () => {
    createStyles();
    ensureOverlay();
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

  initWhenReady();

  global.StickFightNet = {
    state: netState,
    ensureFirestore,
    createRoom,
    joinRoom,
    buildShareUrl,
    hideOverlay,
    showOverlay,
  };
})(typeof window !== 'undefined' ? window : this);
