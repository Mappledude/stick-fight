(function () {
  const Boot = (() => {
    if (typeof window !== 'undefined' && window.__StickFightBoot) {
      return window.__StickFightBoot;
    }
    const noop = () => undefined;
    return {
      flags: { debug: false, safe: false, nofs: false, nolobby: false },
      milestone: noop,
      log: noop,
      error: noop,
      ready: noop,
      guard(step, fn) {
        if (typeof fn === 'function') {
          return fn();
        }
        return undefined;
      },
    };
  })();

  Boot.milestone('main-script');

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

  const BOOT_FLAGS = Boot && Boot.flags ? Boot.flags : { debug: false, safe: false, nofs: false, nolobby: false };
  Boot.milestone('boot-flags');

  const SAFE_MODE = !!BOOT_FLAGS.safe;
  const NO_FULLSCREEN = !!BOOT_FLAGS.nofs;
  const NO_LOBBY = !!BOOT_FLAGS.nolobby;
  const NETWORK_ENABLED = !SAFE_MODE && !NO_LOBBY;

  Boot.milestone('net-config');
  bootLog('ROUTE', NETWORK_ENABLED ? 'network-enabled' : 'network-disabled', {
    safe: SAFE_MODE,
    nolobby: NO_LOBBY,
  });

  const FirebaseBootstrap = (() => {
    const scope = typeof window !== 'undefined' ? window : typeof globalThis !== 'undefined' ? globalThis : {};
    if (scope && typeof scope.__StickFightFirebaseBootstrap === 'object') {
      return scope.__StickFightFirebaseBootstrap;
    }
    if (scope && typeof scope.FirebaseBootstrap === 'object') {
      return scope.FirebaseBootstrap;
    }
    return null;
  })();

  let FIREBASE_ENV = null;

  if (SAFE_MODE) {
    bootLog('ROUTE', 'safe-mode', { placeholder: true });
    Boot.milestone('config-safe-skip');
  } else {
    FIREBASE_ENV = Boot.guard('config-ready', () => {
      const logDiagnostic = (tag, message) => {
        if (Boot && typeof Boot.log === 'function') {
          Boot.log(tag, message);
        }
        if (!Boot || Boot.version !== 1) {
          if (typeof console !== 'undefined' && console && typeof console.info === 'function') {
            console.info('[' + tag + '] ' + message);
          }
        }
      };

      const showConfigFailure = (reason, detail) => {
        const message = detail ? reason + ' ' + detail : reason;
        if (Boot && typeof Boot.ensureOverlay === 'function') {
          Boot.ensureOverlay();
        }
        logDiagnostic('CFG', '[ERR] ' + reason);
        if (detail) {
          logDiagnostic('CFG', detail);
        }
        if (Boot && typeof Boot.error === 'function') {
          Boot.error(new Error(message), 'CFG');
        }
        if (typeof console !== 'undefined' && console && typeof console.error === 'function') {
          console.error('[CFG][ERR] ' + message);
        }

// Resolve boot flags (if present) to detect debug mode
const bootFlags =
  Boot && Boot.flags && typeof Boot.flags === 'object' ? Boot.flags : null;
const debugMode = !!(bootFlags && bootFlags.debug);

// Service worker handle
const sw =
  typeof navigator !== 'undefined' && navigator && navigator.serviceWorker
    ? navigator.serviceWorker
    : null;

if (debugMode) {
  // Skip SW in debug mode
  console.info('[SW] registered=no (debug)');
} else if (sw && typeof sw.register === 'function') {
  // Normal registration path
  sw
    .register('/service-worker.js')
    .then((reg) => {
      const scope =
        (reg && reg.scope) || (reg && reg.active && reg.active.scriptURL) || '';
      const hasController =
        !!(navigator && navigator.serviceWorker && navigator.serviceWorker.controller);
      console.info(
        `[SW] registered=yes scope=${scope} controller=${hasController ? 'present' : 'none'}`
      );
    })
    .catch((err) => {
      console.error('[SW] registered=no error=', err && (err.message || err));
    });
} else {
  console.info('[SW] registered=no (unsupported)');
}

        if (sw && sw.ready && typeof sw.ready.then === 'function') {
          sw.ready
            .then((registration) => {
              if (registration && typeof registration.update === 'function') {
                logDiagnostic('CFG', 'retry: requested service worker update');
                return registration.update();
              }
              return null;
            })
            .catch(() => undefined);
        }
// Resolve boot flags
const bootFlags =
  Boot && Boot.flags && typeof Boot.flags === 'object' ? Boot.flags : null;
const debugMode = !!(bootFlags && bootFlags.debug);

// SW handle
const sw =
  typeof navigator !== 'undefined' && navigator && navigator.serviceWorker
    ? navigator.serviceWorker
    : null;

if (debugMode) {
  console.info('[SW] registered=no (debug)');
} else if (sw && typeof sw.register === 'function') {
  sw
    .register('/service-worker.js')
    .then((reg) => {
      const scope =
        (reg && reg.scope) || (reg && reg.active && reg.active.scriptURL) || '';
      const hasController =
        !!(navigator && navigator.serviceWorker && navigator.serviceWorker.controller);
      console.info(
        `[SW] registered=yes scope=${scope} controller=${hasController ? 'present' : 'none'}`
      );
    })
    .catch((err) => {
      console.error('[SW] registered=no error=', err && (err.message || err));
    });
} else {
  console.info('[SW] registered=no (unsupported)');
}


        logDiagnostic('CFG', 'hint: Shift+Reload to bypass stale service worker');

        if (typeof document !== 'undefined' && document && typeof document.getElementById === 'function') {
          const banner = document.getElementById('boot-overlay');
          if (banner && banner.hasAttribute('hidden')) {
            banner.removeAttribute('hidden');
          }
        }

        return null;
      };

      if (!FirebaseBootstrap || typeof FirebaseBootstrap.bootstrap !== 'function') {
        return showConfigFailure('missing firebase bootstrap helper');
      }

      try {
        return FirebaseBootstrap.bootstrap(Boot);
      } catch (error) {
        const detail = error && error.message ? error.message : String(error);
        return showConfigFailure('firebase bootstrap failed', detail);
      }
    });
  }

  if (SAFE_MODE) {
    Boot.milestone('safe-mode-placeholder');
    bootLog('BOOT', 'safe-mode placeholder ready');
    return;
  }

  if (!FIREBASE_ENV) {
    if (Boot && typeof Boot.log === 'function') {
      Boot.log('BOOT', 'config guard aborted');
    }
    if (!Boot || Boot.version !== 1) {
      if (typeof console !== 'undefined' && console && typeof console.warn === 'function') {
        console.warn('[BOOT] config guard aborted');
      }
    }
    return;
  }

  function isMobileUA() {
    var ua = (navigator && navigator.userAgent) ? navigator.userAgent : '';
    ua = ua.toLowerCase();
    return /iphone|ipad|ipod|android|mobile/.test(ua);
  }

  const detectPretendMobileFlag = (() => {
    let cached = null;
    const parseFlag = (value) => {
      if (typeof value !== 'string') {
        return false;
      }
      const normalized = value.trim().toLowerCase();
      if (!normalized) {
        return false;
      }
      return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
    };

    return function detectPretendMobileFlag() {
      if (cached !== null) {
        return cached;
      }
      if (typeof window === 'undefined' || !window.location || typeof window.location.search !== 'string') {
        cached = false;
        return cached;
      }

      const search = window.location.search;
      if (typeof URLSearchParams === 'function') {
        const params = new URLSearchParams(search);
        cached = parseFlag(params.get('pretendMobile'));
        return cached;
      }

      cached = /[?&]pretendmobile=(1|true|yes|on)\b/i.test(search);
      return cached;
    };
  })();

  function getLocationSearch() {
    if (typeof window === 'undefined' || !window.location) {
      return '';
    }
    const search = window.location.search;
    return typeof search === 'string' ? search : '';
  }

  function parseBoolFlag(value) {
    if (typeof value !== 'string') {
      return false;
    }
    const normalized = value.trim().toLowerCase();
    if (!normalized) {
      return false;
    }
    return (
      normalized === '1' ||
      normalized === 'true' ||
      normalized === 'yes' ||
      normalized === 'on'
    );
  }

  const NET_QUERY_PARAMS = (() => {
    const result = {
      netdiag: false,
      room: null,
      peer: null,
      role: null,
      hostPeerId: null,
    };

    const search = getLocationSearch();
    if (!search) {
      return result;
    }

    const assignParam = (key, value) => {
      if (typeof value === 'string' && value.length > 0) {
        result[key] = value;
      }
    };

    if (typeof URLSearchParams === 'function') {
      try {
        const params = new URLSearchParams(search);
        result.netdiag = parseBoolFlag(params.get('netdiag'));
        assignParam('room', params.get('room'));
        assignParam('peer', params.get('peer'));
        assignParam('role', params.get('role'));
        assignParam('hostPeerId', params.get('hostPeerId'));
        if (!result.role && parseBoolFlag(params.get('host'))) {
          result.role = 'host';
        }
        if (!result.role && parseBoolFlag(params.get('isHost'))) {
          result.role = 'host';
        }
      } catch (error) {
        // Ignore parsing errors and fall back to regex-based extraction below.
      }
    }

    const lowerSearch = search.toLowerCase();
    if (!result.netdiag) {
      result.netdiag = /[?&]netdiag=(1|true|yes|on)\b/.test(lowerSearch);
    }
    if (!result.room) {
      const roomMatch = search.match(/[?&]room=([^&#]*)/i);
      assignParam('room', roomMatch ? decodeURIComponent(roomMatch[1]) : null);
    }
    if (!result.peer) {
      const peerMatch = search.match(/[?&]peer=([^&#]*)/i);
      assignParam('peer', peerMatch ? decodeURIComponent(peerMatch[1]) : null);
    }
    if (!result.role) {
      if (/[?&](role|netrole)=host\b/i.test(lowerSearch)) {
        result.role = 'host';
      }
    }
    if (!result.hostPeerId) {
      const hostPeerMatch = search.match(/[?&]hostpeerid=([^&#]*)/i);
      assignParam('hostPeerId', hostPeerMatch ? decodeURIComponent(hostPeerMatch[1]) : null);
    }

    bootLog('ROUTE', 'net-query', {
      enabled: NETWORK_ENABLED,
      netdiag: result.netdiag,
      room: result.room,
      peer: result.peer,
      role: result.role,
    });

    return result;
  })();

  const NET_DIAG_ENABLED = !!NET_QUERY_PARAMS.netdiag;
  const NET_INPUT_STALE_MS = 1500;

  function netDiagLog(tag, payload) {
    if (!NET_DIAG_ENABLED) {
      return;
    }
    if (typeof console === 'undefined' || !console || typeof console.log !== 'function') {
      return;
    }
    if (typeof payload === 'undefined') {
      console.log('[NetDiag]', tag);
      return;
    }
    console.log('[NetDiag]', tag, payload);
  }

  function createPeerConnection() {
    var cfg = {
      iceServers: [
        { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
      ],
      sdpSemantics: 'unified-plan',
    };
    var pc = new RTCPeerConnection(cfg);
    if (NET_DIAG_ENABLED) {
      console.log('[NetDiag] createPeerConnection', { iceServers: cfg.iceServers });
      pc.addEventListener('iceconnectionstatechange', function () {
        console.log('[NetDiag] iceConnectionState', pc.iceConnectionState);
      });
      pc.addEventListener('connectionstatechange', function () {
        console.log('[NetDiag] connectionState', pc.connectionState);
      });
    }
    return pc;
  }

  const FirebaseRuntime = (() => {
    let initialized = false;
    let failed = false;
    let firestoreInstance = null;
    let fieldValue = null;
    const firebaseDisabled = SAFE_MODE || NO_LOBBY;

    if (firebaseDisabled) {
      bootLog('INIT', 'firebase-disabled', { reason: SAFE_MODE ? 'safe-mode' : 'nolobby' });
    }

    const ensureApp = () => {
      if (firebaseDisabled) {
        failed = true;
        return false;
      }
      if (failed) {
        return false;
      }
      if (initialized) {
        return true;
      }
      if (!FIREBASE_ENV) {
        failed = true;
        return false;
      }
      try {
        bootLog('INIT', 'firebase-bootstrap');
        firestoreInstance = FIREBASE_ENV.firestore || null;
        if (!firestoreInstance && FIREBASE_ENV.firebase && typeof FIREBASE_ENV.firebase.firestore === 'function') {
          firestoreInstance = FIREBASE_ENV.firebase.firestore();
        }
        fieldValue = FIREBASE_ENV.fieldValue ||
          (FIREBASE_ENV.firebase && FIREBASE_ENV.firebase.firestore
            ? FIREBASE_ENV.firebase.firestore.FieldValue
            : null);
        initialized = !!firestoreInstance;
        if (!initialized) {
          failed = true;
          if (NET_DIAG_ENABLED) {
            console.warn('[NetDiag] Firestore instance unavailable');
          }
          return false;
        }
        bootLog('INIT', 'firebase-ready');
        return true;
      } catch (error) {
        failed = true;
        console.error('[StickFight] Firebase init failed', error);
        bootLog('INIT', 'firebase-error', error);
        return false;
      }
    };

    return {
      getFirestore() {
        if (!ensureApp()) {
          return null;
        }
        return firestoreInstance;
      },
      getFieldValue() {
        if (!ensureApp()) {
          return null;
        }
        return fieldValue;
      },
    };
  })();

  function serializeSessionDescription(desc) {
    if (!desc) {
      return null;
    }
    return { type: desc.type, sdp: desc.sdp };
  }

  class Signaling {
    constructor(options) {
      const opts = options || {};
      this.db = opts.db || null;
      this.fieldValue = opts.fieldValue || null;
      this.roomId = opts.roomId || null;
      this.peerId = opts.peerId || null;
      this.isHost = !!opts.isHost;
      this.scene = opts.scene || null;
      this.netdiag = !!opts.netdiag;
      this.hostPeerId = opts.hostPeerId || (this.isHost ? this.peerId : null);
      this.started = false;
      this.playersUnsub = null;
      this.roomUnsub = null;
      this.signalUnsubs = {};
      this.peerEntries = {};
      this.playerPeerIdsByUid = {};
      this.stopped = false;
    }

    getRoomRef() {
      if (!this.db || typeof this.db.collection !== 'function' || !this.roomId) {
        return null;
      }
      return this.db.collection('rooms').doc(this.roomId);
    }

    getSignalDocRef(peerId) {
      const roomRef = this.getRoomRef();
      if (!roomRef || typeof roomRef.collection !== 'function' || !peerId) {
        return null;
      }
      return roomRef.collection('signals').doc(peerId);
    }

    start() {
      if (this.started) {
        return;
      }
      this.started = true;
      this.stopped = false;
      this.ensureOwnSignalDoc();
    }

    ensureOwnSignalDoc() {
      const docRef = this.getSignalDocRef(this.peerId);
      if (!docRef || !this.fieldValue) {
        return;
      }
      const payload = {
        role: this.isHost ? 'host' : 'guest',
        ice: [],
        updatedAt: typeof this.fieldValue.serverTimestamp === 'function'
          ? this.fieldValue.serverTimestamp()
          : null,
      };
      if (typeof this.fieldValue.delete === 'function') {
        payload.offer = this.fieldValue.delete();
        payload.answer = this.fieldValue.delete();
      }
      this.logSignalWrite(this.peerId, ['role', 'offer', 'answer', 'ice', 'updatedAt']);
      docRef
        .set(payload, { merge: true })
        .catch((error) => {
          console.error('[StickFight] Failed to init signal doc', error);
        });
    }

    stop() {
      if (this.stopped) {
        return;
      }
      this.stopped = true;
      this.started = false;
      if (this.playersUnsub) {
        this.playersUnsub();
        this.playersUnsub = null;
      }
      if (this.roomUnsub) {
        this.roomUnsub();
        this.roomUnsub = null;
      }
      const keys = Object.keys(this.signalUnsubs);
      for (let i = 0; i < keys.length; i += 1) {
        const key = keys[i];
        const unsub = this.signalUnsubs[key];
        if (typeof unsub === 'function') {
          unsub();
        }
        this.signalUnsubs[key] = null;
      }
      const peerIds = Object.keys(this.peerEntries);
      for (let j = 0; j < peerIds.length; j += 1) {
        const peerId = peerIds[j];
        const entry = this.peerEntries[peerId];
        if (!entry) {
          continue;
        }
        if (entry.inputDc) {
          try {
            entry.inputDc.close();
          } catch (error) {}
        }
        if (entry.stateDc) {
          try {
            entry.stateDc.close();
          } catch (error) {}
        }
        if (entry.pc) {
          try {
            entry.pc.close();
          } catch (error) {}
        }
      }
      this.peerEntries = {};
      this.playerPeerIdsByUid = {};
      const scene = this.scene;
      if (scene && scene.net) {
        scene.net.pcMap = {};
        scene.net.dcMap = {};
        scene.net.inputDc = null;
        scene.net.stateDc = null;
        scene.net.rtts = {};
        if (typeof scene.updateNetOverlay === 'function') {
          scene.updateNetOverlay();
        }
      }
    }

    ensurePeerEntry(peerId) {
      if (!this.peerEntries[peerId]) {
        this.peerEntries[peerId] = {
          pc: null,
          inputDc: null,
          stateDc: null,
          signalUnsub: null,
          remoteIceCount: 0,
          offerHandled: false,
          answerHandled: false,
          lastOfferSdp: null,
          lastAnswerSdp: null,
        };
      }
      return this.peerEntries[peerId];
    }

    registerPeerConnection(peerId, pc) {
      const scene = this.scene;
      if (scene) {
        if (!scene.net) {
          scene.net = {
            role: this.isHost ? 'host' : 'guest',
            pcMap: {},
            dcMap: {},
            inputDc: null,
            stateDc: null,
            rtts: {},
            lastOfferTs: null,
            lastAnswerTs: null,
          };
        }
        scene.net.role = this.isHost ? 'host' : 'guest';
        scene.net.pcMap[peerId] = pc;
        if (typeof scene.updateNetOverlay === 'function') {
          scene.updateNetOverlay();
        }
      }
      if (this.netdiag) {
        console.log('[NetDiag] register PC', { peerId, role: this.isHost ? 'host' : 'guest' });
      }
    }

    registerDataChannel(peerId, channel, label, isLocal) {
      if (!channel) {
        return;
      }
      const scene = this.scene;
      if (scene && scene.net) {
        if (!scene.net.dcMap[peerId]) {
          scene.net.dcMap[peerId] = {};
        }
        scene.net.dcMap[peerId][label] = channel;
        if (!this.isHost && label === 'input') {
          scene.net.inputDc = channel;
        }
        if (!this.isHost && label === 'state') {
          scene.net.stateDc = channel;
        }
      }

      const self = this;
      channel.addEventListener('open', () => {
        if (self.netdiag) {
          console.log('[NetDiag] datachannel open', { peerId, label });
        }
        if (scene && typeof scene.updateNetOverlay === 'function') {
          scene.updateNetOverlay();
        }
      });
      channel.addEventListener('close', () => {
        if (self.netdiag) {
          console.log('[NetDiag] datachannel close', { peerId, label });
        }
        if (scene && typeof scene.updateNetOverlay === 'function') {
          scene.updateNetOverlay();
        }
      });
      channel.addEventListener('error', (event) => {
        if (!self.netdiag) {
          return;
        }
        console.error('[NetDiag] datachannel error', { peerId, label, event });
      });

      if (!this.isHost && !isLocal && label === 'state') {
        channel.onmessage = (ev) => {
          if (self.netdiag) {
            console.log('[NetDiag] state channel message', {
              peerId,
              bytes: ev && typeof ev.data === 'string' ? ev.data.length : null,
            });
          }
        };
      }
    }

    appendIce(peerId, candidate) {
      if (!candidate) {
        return Promise.resolve();
      }
      const docRef = this.getSignalDocRef(peerId);
      if (
        !docRef ||
        !this.fieldValue ||
        typeof this.fieldValue.arrayUnion !== 'function'
      ) {
        return Promise.resolve();
      }
      const payload = {
        ice: this.fieldValue.arrayUnion({
          candidate: candidate.candidate,
          sdpMid: typeof candidate.sdpMid === 'string' ? candidate.sdpMid : null,
          sdpMLineIndex:
            typeof candidate.sdpMLineIndex === 'number' ? candidate.sdpMLineIndex : null,
          ts: Date.now(),
        }),
        updatedAt: typeof this.fieldValue.serverTimestamp === 'function'
          ? this.fieldValue.serverTimestamp()
          : null,
      };
      this.logSignalWrite(peerId, ['ice', 'updatedAt']);
      return docRef.set(payload, { merge: true }).catch((error) => {
        console.error('[StickFight] appendIce failed', error);
      });
    }

    writeSignal(peerId, partial) {
      const docRef = this.getSignalDocRef(peerId);
      if (!docRef) {
        return Promise.resolve();
      }
      const payload = Object.assign({}, partial || {});
      if (this.fieldValue && typeof this.fieldValue.serverTimestamp === 'function') {
        payload.updatedAt = this.fieldValue.serverTimestamp();
      }
      const keys = Object.keys(partial || {});
      keys.push('updatedAt');
      this.logSignalWrite(peerId, keys);
      return docRef.set(payload, { merge: true }).catch((error) => {
        console.error('[StickFight] writeSignal failed', error);
      });
    }

    logSignalWrite(peerId, keys) {
      if (!this.netdiag) {
        return;
      }
      const payload = {
        path: this.roomId && peerId ? 'rooms/' + this.roomId + '/signals/' + peerId : null,
        roomId: this.roomId,
        peerId,
        keys,
      };
      console.log('[NetDiag] write', payload);
    }

    hostWatchGuests() {
      if (!this.isHost || this.playersUnsub) {
        return;
      }
      const roomRef = this.getRoomRef();
      if (!roomRef || typeof roomRef.collection !== 'function') {
        return;
      }
      const playersRef = roomRef.collection('players');
      if (!playersRef || typeof playersRef.onSnapshot !== 'function') {
        return;
      }
      this.playersUnsub = playersRef.onSnapshot((snapshot) => {
        if (!snapshot) {
          return;
        }
        snapshot.docChanges().forEach((change) => {
          const doc = change.doc;
          if (!doc) {
            return;
          }
          const uid = doc.id;
          const data = (typeof doc.data === 'function' ? doc.data() : {}) || {};
          const peerId = data.peerId || (uid ? this.playerPeerIdsByUid[uid] : null);
          if (!peerId) {
            if (change.type === 'removed' && uid && this.playerPeerIdsByUid[uid]) {
              const storedPeerId = this.playerPeerIdsByUid[uid];
              delete this.playerPeerIdsByUid[uid];
              this.teardownPeer(storedPeerId);
            } else if (change.type !== 'removed') {
              console.warn('[StickFight] Player document missing peerId', { uid });
            }
            return;
          }
          if (change.type === 'removed') {
            delete this.playerPeerIdsByUid[uid];
            if (peerId !== this.peerId) {
              this.teardownPeer(peerId);
            }
            return;
          }
          this.playerPeerIdsByUid[uid] = peerId;
          if (peerId === this.peerId) {
            return;
          }
          this.hostAcceptGuest(peerId);
        });
      });
    }

    teardownPeer(peerId) {
      const entry = this.peerEntries[peerId];
      if (!entry) {
        return;
      }
      if (entry.signalUnsub) {
        entry.signalUnsub();
        entry.signalUnsub = null;
      }
      if (entry.inputDc) {
        try {
          entry.inputDc.close();
        } catch (error) {}
      }
      if (entry.stateDc) {
        try {
          entry.stateDc.close();
        } catch (error) {}
      }
      if (entry.pc) {
        try {
          entry.pc.close();
        } catch (error) {}
      }
      delete this.peerEntries[peerId];
      if (this.scene && this.scene.net) {
        delete this.scene.net.pcMap[peerId];
        delete this.scene.net.dcMap[peerId];
        if (typeof this.scene.updateNetOverlay === 'function') {
          this.scene.updateNetOverlay();
        }
      }
    }

    hostAcceptGuest(guestId) {
      const entry = this.ensurePeerEntry(guestId);
      let pc = entry.pc;
      const self = this;
      if (!pc) {
        pc = createPeerConnection();
        entry.pc = pc;
        this.registerPeerConnection(guestId, pc);

        const inputDc = pc.createDataChannel('input', {
          ordered: true,
          maxRetransmits: 0,
        });
        const stateDc = pc.createDataChannel('state', { ordered: true });
        entry.inputDc = inputDc;
        entry.stateDc = stateDc;
        this.registerDataChannel(guestId, inputDc, 'input', true);
        this.registerDataChannel(guestId, stateDc, 'state', true);

        pc.addEventListener('icecandidate', (event) => {
          if (!event || !event.candidate) {
            return;
          }
          self.appendIce(self.peerId, event.candidate);
        });
        pc.addEventListener('connectionstatechange', () => {
          if (self.scene && typeof self.scene.updateNetOverlay === 'function') {
            self.scene.updateNetOverlay();
          }
          if (pc.connectionState === 'connected') {
            console.log('host: peer ' + guestId + ' connected');
          }
        });
      }

      if (!entry.signalUnsub) {
        const guestSignalRef = this.getSignalDocRef(guestId);
        if (guestSignalRef && typeof guestSignalRef.onSnapshot === 'function') {
          entry.signalUnsub = guestSignalRef.onSnapshot((doc) => {
            self.handleGuestSignal(guestId, doc);
          });
        }
      }
    }

    handleGuestSignal(guestId, doc) {
      if (!doc || !doc.exists) {
        return;
      }
      const data = doc.data() || {};
      const entry = this.ensurePeerEntry(guestId);
      const pc = entry.pc;
      if (!pc) {
        return;
      }
      if (data.offer) {
        if (entry.lastOfferSdp !== data.offer.sdp) {
          entry.offerHandled = false;
        }
      }
      if (data.offer && !entry.offerHandled) {
        if (this.scene && this.scene.net) {
          this.scene.net.lastOfferTs = Date.now();
          if (typeof this.scene.updateNetOverlay === 'function') {
            this.scene.updateNetOverlay();
          }
        }
        entry.offerHandled = true;
        entry.lastOfferSdp = data.offer.sdp || null;
        const description = new RTCSessionDescription(data.offer);
        pc
          .setRemoteDescription(description)
          .then(() => pc.createAnswer())
          .then((answer) => pc.setLocalDescription(answer))
          .then(() => {
            const localDesc = serializeSessionDescription(pc.localDescription);
            if (localDesc) {
              if (this.scene && this.scene.net) {
                this.scene.net.lastAnswerTs = Date.now();
                entry.lastAnswerSdp = localDesc.sdp;
              }
              this.writeSignal(this.peerId, { answer: localDesc });
              if (this.scene && typeof this.scene.updateNetOverlay === 'function') {
                this.scene.updateNetOverlay();
              }
            }
          })
          .catch((error) => {
            console.error('[StickFight] host answer failed', error);
            entry.offerHandled = false;
          });
      }
      if (data.ice && data.ice.length) {
        const list = data.ice;
        for (let i = entry.remoteIceCount; i < list.length; i += 1) {
          const ice = list[i];
          if (!ice || !ice.candidate) {
            continue;
          }
          const candidate = new RTCIceCandidate({
            candidate: ice.candidate,
            sdpMid: typeof ice.sdpMid === 'string' ? ice.sdpMid : null,
            sdpMLineIndex:
              typeof ice.sdpMLineIndex === 'number' ? ice.sdpMLineIndex : null,
          });
          pc
            .addIceCandidate(candidate)
            .catch((error) => {
              console.error('[StickFight] host addIceCandidate failed', error);
            });
        }
        entry.remoteIceCount = list.length;
      }
    }

    ensureHostPeerId() {
      if (this.hostPeerId) {
        return Promise.resolve(this.hostPeerId);
      }
      const roomRef = this.getRoomRef();
      if (!roomRef || typeof roomRef.get !== 'function') {
        return Promise.resolve(null);
      }
      return roomRef
        .get()
        .then((doc) => {
          if (doc && doc.exists) {
            const data = doc.data() || {};
            this.hostPeerId = data.hostPeerId || this.hostPeerId;
          }
          return this.hostPeerId;
        })
        .catch((error) => {
          console.error('[StickFight] Failed to fetch room metadata', error);
          return null;
        });
    }

    guestWatchHost() {
      const ensure = this.ensureHostPeerId();
      ensure.then((hostPeerId) => {
        if (!hostPeerId) {
          return;
        }
        this.hostPeerId = hostPeerId;
        this.watchRoomMetadata();
        this.ensureGuestPeerConnection();
        this.subscribeHostSignals();
      });
    }

    watchRoomMetadata() {
      if (this.roomUnsub || !this.getRoomRef()) {
        return;
      }
      const roomRef = this.getRoomRef();
      if (!roomRef || typeof roomRef.onSnapshot !== 'function') {
        return;
      }
      this.roomUnsub = roomRef.onSnapshot((doc) => {
        if (!doc || !doc.exists) {
          return;
        }
        const data = doc.data() || {};
        const hostPeerId = data.hostPeerId;
        if (hostPeerId && hostPeerId !== this.hostPeerId) {
          this.hostPeerId = hostPeerId;
          this.resetGuestConnection();
        }
      });
    }

    resetGuestConnection() {
      const keys = Object.keys(this.peerEntries);
      for (let i = 0; i < keys.length; i += 1) {
        this.teardownPeer(keys[i]);
      }
      this.peerEntries = {};
      this.ensureGuestPeerConnection();
      this.subscribeHostSignals(true);
      if (this.scene && typeof this.scene.updateNetOverlay === 'function') {
        this.scene.updateNetOverlay();
      }
    }

    ensureGuestPeerConnection() {
      const hostPeerId = this.hostPeerId;
      if (!hostPeerId) {
        return null;
      }
      const entry = this.ensurePeerEntry(hostPeerId);
      let pc = entry.pc;
      const self = this;
      if (!pc) {
        pc = createPeerConnection();
        entry.pc = pc;
        this.registerPeerConnection(hostPeerId, pc);

        const inputDc = pc.createDataChannel('input', {
          ordered: true,
          maxRetransmits: 0,
        });
        entry.inputDc = inputDc;
        this.registerDataChannel(hostPeerId, inputDc, 'input', true);

        pc.addEventListener('datachannel', (event) => {
          const channel = event ? event.channel : null;
          if (!channel) {
            return;
          }
          if (channel.label === 'state') {
            entry.stateDc = channel;
            this.registerDataChannel(hostPeerId, channel, 'state', false);
          }
        });

        pc.addEventListener('icecandidate', (event) => {
          if (!event || !event.candidate) {
            return;
          }
          self.appendIce(self.peerId, event.candidate);
        });
        pc.addEventListener('connectionstatechange', () => {
          if (self.scene && typeof self.scene.updateNetOverlay === 'function') {
            self.scene.updateNetOverlay();
          }
          if (pc.connectionState === 'connected') {
            console.log('guest: connected to host');
          }
        });
      }
      return pc;
    }

    subscribeHostSignals(force) {
      const hostPeerId = this.hostPeerId;
      if (!hostPeerId) {
        return;
      }
      if (!force && this.signalUnsubs[hostPeerId]) {
        return;
      }
      const hostSignalRef = this.getSignalDocRef(hostPeerId);
      if (!hostSignalRef || typeof hostSignalRef.onSnapshot !== 'function') {
        return;
      }
      if (this.signalUnsubs[hostPeerId]) {
        this.signalUnsubs[hostPeerId]();
      }
      this.signalUnsubs[hostPeerId] = hostSignalRef.onSnapshot((doc) => {
        this.handleHostSignal(doc);
      });
    }

    handleHostSignal(doc) {
      if (!doc || !doc.exists) {
        return;
      }
      const data = doc.data() || {};
      const hostPeerId = doc.id;
      const entry = this.ensurePeerEntry(hostPeerId);
      const pc = entry.pc || this.ensureGuestPeerConnection();
      if (!pc) {
        return;
      }
      if (data.answer) {
        if (entry.lastAnswerSdp !== data.answer.sdp) {
          entry.answerHandled = false;
        }
      }
      if (data.answer && !entry.answerHandled) {
        entry.answerHandled = true;
        entry.lastAnswerSdp = data.answer.sdp || null;
        const description = new RTCSessionDescription(data.answer);
        pc
          .setRemoteDescription(description)
          .then(() => {
            if (this.scene && this.scene.net) {
              this.scene.net.lastAnswerTs = Date.now();
              if (typeof this.scene.updateNetOverlay === 'function') {
                this.scene.updateNetOverlay();
              }
            }
          })
          .catch((error) => {
            console.error('[StickFight] guest setRemoteDescription failed', error);
            entry.answerHandled = false;
          });
      }
      if (data.ice && data.ice.length) {
        const list = data.ice;
        for (let i = entry.remoteIceCount; i < list.length; i += 1) {
          const ice = list[i];
          if (!ice || !ice.candidate) {
            continue;
          }
          const candidate = new RTCIceCandidate({
            candidate: ice.candidate,
            sdpMid: typeof ice.sdpMid === 'string' ? ice.sdpMid : null,
            sdpMLineIndex:
              typeof ice.sdpMLineIndex === 'number' ? ice.sdpMLineIndex : null,
          });
          pc
            .addIceCandidate(candidate)
            .catch((error) => {
              console.error('[StickFight] guest addIceCandidate failed', error);
            });
        }
        entry.remoteIceCount = list.length;
      }
    }

    guestOffer() {
      if (this.isHost) {
        return Promise.resolve();
      }
      return this.ensureHostPeerId().then((hostPeerId) => {
        if (!hostPeerId) {
          return null;
        }
        this.hostPeerId = hostPeerId;
        const pc = this.ensureGuestPeerConnection();
        if (!pc) {
          return null;
        }
        const entry = this.ensurePeerEntry(hostPeerId);
        entry.answerHandled = false;
        return pc
          .createOffer({ offerToReceiveAudio: false, offerToReceiveVideo: false })
          .then((offer) => pc.setLocalDescription(offer).then(() => offer))
          .then((offer) => {
            const desc = serializeSessionDescription(offer);
            if (!desc) {
              return null;
            }
            if (this.scene && this.scene.net) {
              this.scene.net.lastOfferTs = Date.now();
            }
            return this.writeSignal(this.peerId, { role: 'guest', offer: desc });
          })
          .then(() => {
            if (this.scene && typeof this.scene.updateNetOverlay === 'function') {
              this.scene.updateNetOverlay();
            }
          })
          .catch((error) => {
            console.error('[StickFight] guestOffer failed', error);
          });
      });
    }
  }

  const SPEED = 220;
  const ACCEL = 1200;
  const FRICTION = 1600;
  const AIR_ACCEL = 620;
  const AIR_DRAG = 2.25;
  const MAX_VEL = 240;
  const JUMP_SPEED = 560;
  const JUMP_HORIZONTAL_SPEED = 260;
  const CROUCH_SPEED_SCALE = 0.35;
  const JOY_OUTER_R_BASE = 92;
  const JOY_KNOB_R_BASE = Math.round(JOY_OUTER_R_BASE * 0.4);
  const JOY_MOBILE_SCALE = isMobileUA() || detectPretendMobileFlag() ? 0.7 : 1;
  const JOY_OUTER_R = Math.round(JOY_OUTER_R_BASE * JOY_MOBILE_SCALE);
  const JOY_KNOB_R = Math.round(JOY_KNOB_R_BASE * JOY_MOBILE_SCALE);
  const JOY_HIT_PADDING = 10;
  const JOYSTICK_DEADZONE = 0.22;
  const JOYSTICK_JUMP_THRESHOLD = 0.48;
  const JOYSTICK_JUMP_HORIZONTAL_THRESHOLD = 0.32;
  const JOYSTICK_CROUCH_THRESHOLD = 0.45;
  const GRAVITY_Y = 2200;
  const FIXED_DT = 1 / 60;
  const MIN_LAYOUT_WIDTH = 320;
  const MIN_LAYOUT_HEIGHT = 180;
  const LAYOUT_POLL_INTERVAL = 16;
  const LAYOUT_POLL_TIMEOUT = 500;
  const JOY_TRACE_INTERVAL = 250;
  const PLAY_ASPECT_MIN = 4 / 3;
  const PLAY_ASPECT_MAX = 16 / 9;

  function parsePlayPadOverride(value) {
    if (typeof value !== 'string') {
      return null;
    }
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }
    const parsed = parseFloat(trimmed);
    if (!Number.isFinite(parsed) || parsed < 0) {
      return null;
    }
    return parsed;
  }

  function shrinkRect(rect, factor) {
    if (!rect) {
      return rect;
    }
    var ratio = 1 - (typeof factor === 'number' ? factor : 0);
    if (ratio < 0) {
      ratio = 0;
    }
    var cx = rect.x + rect.w * 0.5;
    var cy = rect.y + rect.h * 0.5;
    var w2 = rect.w * ratio;
    var h2 = rect.h * ratio;
    return { x: cx - w2 * 0.5, y: cy - h2 * 0.5, w: w2, h: h2 };
  }

  function computePlayArea(viewW, viewH, padOverride) {
    const safeViewW = Math.max(Math.round(viewW || 0), 0);
    const safeViewH = Math.max(Math.round(viewH || 0), 0);
    const PAD = 12;
    const EDGE = Math.round(Math.min(safeViewW, safeViewH) * 0.03);
    const resolvedPad = typeof padOverride === 'number' ? Math.max(padOverride, 0) : Math.max(PAD, EDGE);

    const availableWidth = Math.max(safeViewW - resolvedPad * 2, MIN_LAYOUT_WIDTH);
    const availableHeight = Math.max(safeViewH - resolvedPad * 2, MIN_LAYOUT_HEIGHT);

    let width = availableWidth;
    let height = availableHeight;

    if (width <= 0 || height <= 0) {
      width = Math.max(width, MIN_LAYOUT_WIDTH);
      height = Math.max(height, MIN_LAYOUT_HEIGHT);
    }

    let aspect = width / height;

    if (aspect < PLAY_ASPECT_MIN) {
      const targetHeight = width / PLAY_ASPECT_MIN;
      if (targetHeight >= MIN_LAYOUT_HEIGHT) {
        height = Math.min(height, targetHeight);
      } else {
        const targetWidth = height * PLAY_ASPECT_MIN;
        width = Math.max(MIN_LAYOUT_WIDTH, Math.min(width, targetWidth));
      }
    } else if (aspect > PLAY_ASPECT_MAX) {
      const targetWidth = height * PLAY_ASPECT_MAX;
      if (targetWidth >= MIN_LAYOUT_WIDTH) {
        width = Math.min(width, targetWidth);
      } else {
        const targetHeight = width / PLAY_ASPECT_MAX;
        height = Math.max(MIN_LAYOUT_HEIGHT, Math.min(height, targetHeight));
      }
    }

    width = Math.max(Math.min(width, availableWidth), MIN_LAYOUT_WIDTH);
    height = Math.max(Math.min(height, availableHeight), MIN_LAYOUT_HEIGHT);

    const x = Math.round((safeViewW - width) / 2);
    const y = Math.round((safeViewH - height) / 2);

    const result = { x, y, w: Math.round(width), h: Math.round(height) };
    return {
      x: Math.round(result.x),
      y: Math.round(result.y),
      w: Math.round(result.w),
      h: Math.round(result.h),
    };
  }

  function clampToPlay(target, play) {
    if (!target || !play) {
      return { changedX: false, changedY: false };
    }
    const body = target.body || null;
    const halfWidth = body && typeof body.halfWidth === 'number'
      ? body.halfWidth
      : body && typeof body.width === 'number'
      ? body.width / 2
      : 14;
    const halfHeight = body && typeof body.halfHeight === 'number'
      ? body.halfHeight
      : body && typeof body.height === 'number'
      ? body.height / 2
      : 32;

    const minX = play.x + halfWidth;
    const maxX = play.x + play.w - halfWidth;
    const minY = play.y + halfHeight;
    const maxY = play.y + play.h - halfHeight;

    const clampedX = Phaser.Math.Clamp(target.x, minX, maxX);
    const clampedY = Phaser.Math.Clamp(target.y, minY, maxY);

    const changedX = clampedX !== target.x;
    const changedY = clampedY !== target.y;

    if (changedX) {
      if (typeof target.setX === 'function') {
        target.setX(clampedX);
      } else {
        target.x = clampedX;
      }
    }

    if (changedY) {
      if (typeof target.setY === 'function') {
        target.setY(clampedY);
      } else {
        target.y = clampedY;
      }
    }

    return { changedX, changedY };
  }

  const traceControls = (() => {
    const state = {
      lastTraceTime: 0,
      overlay: null,
    };

    const getSceneTime = (scene) => {
      if (scene && scene.time && typeof scene.time.now === 'number') {
        return scene.time.now;
      }
      return Date.now();
    };

    const ensureOverlay = (scene) => {
      if (!scene || !scene.add) {
        return null;
      }
      if (state.overlay && state.overlay.scene === scene) {
        return state.overlay;
      }
      if (state.overlay && state.overlay.scene !== scene) {
        state.overlay.destroy();
        state.overlay = null;
      }

      const text = scene.add
        .text(12, 12, '', {
          fontFamily: 'monospace',
          fontSize: '12px',
          color: '#00ff99',
        })
        .setOrigin(0, 0)
        .setScrollFactor(0)
        .setDepth(1000)
        .setVisible(true);

      state.overlay = text;

      if (scene.events && typeof scene.events.once === 'function') {
        scene.events.once('shutdown', () => {
          if (state.overlay) {
            state.overlay.destroy();
            state.overlay = null;
          }
        });
      }

      return text;
    };

    const hideOverlay = () => {
      if (!state.overlay) {
        return;
      }
      if (!state.overlay.scene) {
        state.overlay = null;
        return;
      }
      state.overlay.setVisible(false);
      if (typeof state.overlay.setText === 'function') {
        state.overlay.setText('');
      }
    };

    const extractPointerMeta = (joystick) => {
      if (!joystick || !joystick._joyDiagLastEvent) {
        return null;
      }
      const last = joystick._joyDiagLastEvent;
      return {
        type: last.type,
        pointerId: last.pointerId,
        clientX: last.clientX,
        clientY: last.clientY,
        preventDefault: !!last.preventDefault,
      };
    };

    return function traceControls(scene) {
      const diagnosticsActive = !!(
        scene &&
        typeof scene.diagnosticsActive === 'function' &&
        scene.diagnosticsActive()
      );

      if (!diagnosticsActive) {
        hideOverlay();
        return;
      }

      const overlay = ensureOverlay(scene);
      if (overlay) {
        overlay.setVisible(true);
      }

      const now = getSceneTime(scene);
      const payload = [];

      const players = ['p1', 'p2'];
      for (let index = 0; index < players.length; index += 1) {
        const playerKey = players[index];
        const joystick = scene && scene.virtualJoysticks ? scene.virtualJoysticks[playerKey] : null;
        const vector = joystick ? joystick.getVector() : { x: 0, y: 0, magnitude: 0 };
        const pressed = !!(joystick && joystick.isActive && joystick.isActive());
        const pointerMeta = extractPointerMeta(joystick);
        const inputSnapshot = scene && scene.joystickSnapshots ? scene.joystickSnapshots[playerKey] : null;
        const mappedInput = scene && typeof scene.getPlayerInput === 'function'
          ? scene.getPlayerInput(playerKey)
          : null;
        const fighter = scene && scene._fighters ? scene._fighters[index] : null;
        const body = fighter ? /** @type {Phaser.Physics.Arcade.Body} */ (fighter.body) : null;
        const bodyOnFloor = body && body.onFloor && typeof body.onFloor === 'function'
          ? body.onFloor.call(body)
          : false;
        const onGround = !!(
          body &&
          (body.blocked && body.blocked.down || body.touching && body.touching.down || bodyOnFloor)
        );
        const canControl = fighter ? !fighter.isAttacking : false;
        const resolvedMoveX = mappedInput ? Phaser.Math.Clamp(mappedInput.moveX || 0, -1, 1) : 0;
        const moveInput = canControl ? resolvedMoveX : 0;
        let targetVelocity = moveInput * SPEED;
        if (fighter && fighter.isCrouching) {
          targetVelocity *= CROUCH_SPEED_SCALE;
        }
        const velocityX = body && body.velocity ? body.velocity.x : 0;
        const inputReset = !!(joystick && joystick._joyDiagInputReset);
        if (joystick) {
          joystick._joyDiagInputReset = false;
        }

        const data = {
          player: playerKey,
          joystick: {
            pressed,
            normX: vector.x,
            normY: vector.y,
            mag: vector.magnitude,
          },
          pointer: pointerMeta,
          inputs: {
            joystick: inputSnapshot
              ? {
                  moveX: inputSnapshot.moveX,
                  crouch: inputSnapshot.crouch,
                  jumpUp: inputSnapshot.jumpUp,
                  jumpForward: inputSnapshot.jumpForward,
                  jumpBack: inputSnapshot.jumpBack,
                }
              : null,
            mapped: mappedInput
              ? {
                  moveX: mappedInput.moveX,
                  crouch: mappedInput.crouch,
                  jumpUp: mappedInput.jumpUp,
                  jumpForward: mappedInput.jumpForward,
                  jumpBack: mappedInput.jumpBack,
                }
              : null,
          },
          movement: {
            targetV: targetVelocity,
            velocityX,
            onGround,
            isAttacking: fighter ? !!fighter.isAttacking : false,
          },
          inputReset,
        };

        if (index === 0 || joystick || fighter) {
          payload.push(data);
        }

        if (diagnosticsActive && joystick && typeof scene.logJoyDiag === 'function') {
          scene.logJoyDiag('joystick:deadzone', {
            context: 'trace',
            player: playerKey,
            radius: typeof joystick.radius === 'number' ? joystick.radius : null,
            deadzone: typeof joystick.deadzone === 'number' ? joystick.deadzone : null,
            magnitude: vector.magnitude,
            source: scene._joystickDeadzoneSource || 'default',
          });
        }

        if (index === 0 && overlay) {
          const format = (value, digits = 2) =>
            typeof value === 'number' && isFinite(value) ? value.toFixed(digits) : '0.00';
          const overlayText =
            `P1 press:${pressed ? '1' : '0'} ` +
            `nx:${format(vector.x)} ` +
            `mx:${format(resolvedMoveX)} ` +
            `vel:${format(velocityX, 1)}`;
          overlay.setText(overlayText);
        }
      }

      if (now - state.lastTraceTime >= JOY_TRACE_INTERVAL) {
        state.lastTraceTime = now;
        if (scene && typeof scene.logJoyDiag === 'function') {
          scene.logJoyDiag('trace', { time: now, players: payload });
        } else if (typeof console !== 'undefined' && console) {
          console.log('[JoyDiag] trace', { time: now, players: payload });
        }
      }
    };
  })();

  const preventDefaultScroll = (event) => {
    if (event.touches && event.touches.length > 1) {
      return;
    }
    event.preventDefault();
  };

  document.body.addEventListener('touchmove', preventDefaultScroll, { passive: false });

  const createJoystickStub = () => ({
    getVector() {
      return { x: 0, y: 0, magnitude: 0 };
    },
    isActive() {
      return false;
    },
    isEnabled() {
      return false;
    },
    reset() {},
    pointerId: null,
    _joyDiagInputReset: false,
  });

  const centerText = (scene, content, offsetY = 0, style = {}) => {
    const textStyle = {
      fontFamily: 'Arial, sans-serif',
      fontSize: '48px',
      color: '#ffffff',
      align: 'center',
      ...style,
    };

    const text = scene.add
      .text(0, 0, content, textStyle)
      .setOrigin(0.5, 0.5)
      .setDepth(20)
      .setAlpha(1)
      .setVisible(true);

    const updatePosition = () => {
      const { width, height } = scene.scale.gameSize;
      text.setPosition(width / 2, height / 2 + offsetY);
    };

    updatePosition();

    if (!scene._centeredElements) {
      scene._centeredElements = [];
    }
    scene._centeredElements.push(updatePosition);

    return text;
  };

  class Stick extends Phaser.GameObjects.Container {
    constructor(scene, x, y, config = {}) {
      super(scene, x, y);

      scene.add.existing(this);
      this.setDepth(10);
      this.setAlpha(1);
      this.setVisible(true);

      const color = config.color != null ? config.color : 0xffffff;
      const lineWidth = config.lineWidth != null ? config.lineWidth : 4;

      const head = scene.add.circle(0, -20, 10, color, 1);
      head.setStrokeStyle(2, color, 1);

      const torso = scene.add.line(0, 0, 0, -10, 0, 12, color, 1);
      torso.setLineWidth(lineWidth, lineWidth);

      const armLeft = scene.add.line(0, -4, 0, -4, -14, 4, color, 1);
      armLeft.setLineWidth(lineWidth, lineWidth);

      const armRight = scene.add.line(0, -4, 0, -4, 14, 4, color, 1);
      armRight.setLineWidth(lineWidth, lineWidth);

      const legLeft = scene.add.line(0, 12, 0, 12, -10, 28, color, 1);
      legLeft.setLineWidth(lineWidth, lineWidth);

      const legRight = scene.add.line(0, 12, 0, 12, 10, 28, color, 1);
      legRight.setLineWidth(lineWidth, lineWidth);

      const parts = [legLeft, legRight, torso, armLeft, armRight, head];
      parts.forEach((part) => {
        if (part && typeof part.setAlpha === 'function') {
          part.setAlpha(1);
        }
        if (part && typeof part.setVisible === 'function') {
          part.setVisible(true);
        }
      });

      this.add(parts);

      this.setSize(28, 64);

      this.baseBodySize = { width: 28, height: 64 };
      this.crouchBodySize = { width: 28, height: 44 };
      this.crouchOffset = (this.baseBodySize.height - this.crouchBodySize.height) / 2;
      this._crouchOffsetApplied = 0;
      this.isCrouching = false;
      this.hp = 100;
      this.facing = config.facing === -1 ? -1 : 1;
      this.isAttacking = false;

      scene.physics.add.existing(this);
      const body = /** @type {Phaser.Physics.Arcade.Body} */ (this.body);
      body.setAllowGravity(true);
      body.setCollideWorldBounds(true);
      body.setSize(this.baseBodySize.width, this.baseBodySize.height, true);
      body.setMaxVelocity(MAX_VEL, JUMP_SPEED * 1.3);
      body.setDrag(0, 0);
      body.setBounce(0, 0);

      this.setScale(this.facing, 1);
    }

    setFacing(direction) {
      const dir = direction >= 0 ? 1 : -1;
      if (dir !== this.facing) {
        this.facing = dir;
        this.setScale(dir, 1);
      }
      return this;
    }

    setCrouching(crouching) {
      const body = /** @type {Phaser.Physics.Arcade.Body} */ (this.body);
      if (!body) {
        return this;
      }
      const shouldCrouch = !!crouching;
      if (shouldCrouch === this.isCrouching) {
        return this;
      }

      if (shouldCrouch) {
        body.setSize(this.baseBodySize.width, this.crouchBodySize.height, true);
        super.setY(this.y + this.crouchOffset);
        this._crouchOffsetApplied = this.crouchOffset;
      } else {
        body.setSize(this.baseBodySize.width, this.baseBodySize.height, true);
        if (this._crouchOffsetApplied) {
          super.setY(this.y - this._crouchOffsetApplied);
        }
        this._crouchOffsetApplied = 0;
      }

      this.isCrouching = shouldCrouch;
      return this;
    }

    update() {
      const body = /** @type {Phaser.Physics.Arcade.Body} */ (this.body);
      if (!body) {
        return;
      }

      const bounds = this.scene.physics.world.bounds;
      if (!bounds || bounds.width <= 0 || bounds.height <= 0) {
        return;
      }
      const halfWidth = body.width / 2;
      const halfHeight = body.height / 2;

      const clampedX = Phaser.Math.Clamp(this.x, bounds.x + halfWidth, bounds.right - halfWidth);
      const clampedY = Phaser.Math.Clamp(this.y, bounds.y + halfHeight, bounds.bottom - halfHeight);

      if (clampedX !== this.x) {
        super.setX(clampedX);
        body.setVelocityX(0);
      }

      if (clampedY !== this.y) {
        super.setY(clampedY);
        body.setVelocityY(0);
      }
    }
  }

  class MainScene extends Phaser.Scene {
    constructor() {
      super({ key: 'MainScene' });
      this.dt = 0;
      this._simAcc = 0;
      this._simTickCount = 0;
      this._simTickLogTimer = 0;
      this._centeredElements = [];
      this.titleText = null;
      this.p1Input = this.createPlayerInputState();
      this.p2Input = this.createPlayerInputState();
      this.pointerStates = {
        p1: this.createPointerState(),
        p2: this.createPointerState(),
      };
      this.keyboardHoldStates = {
        p1: { left: false, right: false, crouch: false },
        p2: { left: false, right: false, crouch: false },
      };
      this.keyboardJumpQueue = {
        p1: { up: false, forward: false, back: false },
        p2: { up: false, forward: false, back: false },
      };
      this.touchButtons = { p1: {}, p2: {} };
      this.virtualJoysticks = { p1: createJoystickStub(), p2: createJoystickStub() };
      this.touchButtonsList = [];
      this.joystickList = [];
      this.touchButtonLayout = null;
      this.mobileControlLayout = null;
      const nav = typeof navigator !== 'undefined' ? navigator : null;
      const win = typeof window !== 'undefined' ? window : null;

      this._joystickDeadzone = JOYSTICK_DEADZONE;
      this._joystickDeadzoneSource = 'default';
      this._forceJoystick = false;
      this._forceKeyboard = false;
      this._joyDiagEnabled = false;
      this._joyDiagModes = this.getDefaultJoyDiagModes();
      this._pretendMobile = detectPretendMobileFlag();

      this.playArea = { x: 0, y: 0, w: MIN_LAYOUT_WIDTH, h: MIN_LAYOUT_HEIGHT };
      this._playAreaPadOverride = null;
      this.playBorder = null;
      this.stageLine = null;
      this._playAreaDiagText = null;
      this._playAreaDiagGrid = null;
      this._playAreaDiagLastText = null;

      const parseDebugFlag = (value) => {
        if (typeof value !== 'string') {
          return false;
        }
        const normalized = value.trim().toLowerCase();
        return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
      };

      if (win && win.location && typeof win.location.search === 'string') {
        const searchString = win.location.search;
        const joyDiagParser =
          win &&
          win.StickFightJoyDiag &&
          typeof win.StickFightJoyDiag.parseJoyDiagConfig === 'function'
            ? win.StickFightJoyDiag.parseJoyDiagConfig
            : null;
        const parsedJoyDiag = joyDiagParser ? joyDiagParser(searchString) : null;

        if (typeof URLSearchParams === 'function') {
          const params = new URLSearchParams(searchString);
          this._forceJoystick = parseDebugFlag(params.get('forceJoystick'));
          this._forceKeyboard = parseDebugFlag(params.get('forceKeyboard'));
          if (!this._pretendMobile) {
            this._pretendMobile = parseDebugFlag(params.get('pretendMobile'));
          }

          const playPadOverride = parsePlayPadOverride(params.get('playpad'));
          if (playPadOverride !== null) {
            this._playAreaPadOverride = playPadOverride;
          }

          if (parsedJoyDiag) {
            this.applyJoyDiagConfig(parsedJoyDiag);
          } else {
            this.applyJoyDiagConfig({
              enabled: parseDebugFlag(params.get('joydiag')),
              modes: {
                noControls: parseDebugFlag(params.get('nocontrols')),
                noJoystick: parseDebugFlag(params.get('nojoystick')),
                joystickOnly: parseDebugFlag(params.get('joyonly')),
                joyTest: parseDebugFlag(params.get('joytest')),
              },
            });
          }

          this.applyJoyDiagDeadzoneOverride(params.get('dz'), '?dz=');
        } else {
          const searchLower = searchString.toLowerCase();
          this._forceJoystick = /[?&]forcejoystick=(1|true|yes|on)\b/.test(searchLower);
          this._forceKeyboard = /[?&]forcekeyboard=(1|true|yes|on)\b/.test(searchLower);
          if (!this._pretendMobile) {
            this._pretendMobile = /[?&]pretendmobile=(1|true|yes|on)\b/.test(searchLower);
          }

          const playPadMatch = searchString.match(/[?&]playpad=([^&#]*)/i);
          const playPadValue = playPadMatch ? decodeURIComponent(playPadMatch[1]) : null;
          const playPadOverride = parsePlayPadOverride(playPadValue);
          if (playPadOverride !== null) {
            this._playAreaPadOverride = playPadOverride;
          }

          if (parsedJoyDiag) {
            this.applyJoyDiagConfig(parsedJoyDiag);
          } else {
            const joyDiagEnabled = /[?&]joydiag=(1|true|yes|on)\b/.test(searchLower);
            this.applyJoyDiagConfig({
              enabled: joyDiagEnabled,
              modes: {
                noControls:
                  joyDiagEnabled && /[?&]nocontrols=(1|true|yes|on)\b/.test(searchLower),
                noJoystick:
                  joyDiagEnabled && /[?&]nojoystick=(1|true|yes|on)\b/.test(searchLower),
                joystickOnly:
                  joyDiagEnabled && /[?&]joyonly=(1|true|yes|on)\b/.test(searchLower),
                joyTest: joyDiagEnabled && /[?&]joytest=(1|true|yes|on)\b/.test(searchLower),
              },
            });
          }

          const dzMatch = searchString.match(/[?&]dz=([^&#]*)/i);
          const dzValue = dzMatch ? decodeURIComponent(dzMatch[1]) : null;
          this.applyJoyDiagDeadzoneOverride(dzValue, '?dz=');
        }
      }

      const phaserTouchDevice =
        this.sys &&
        this.sys.game &&
        this.sys.game.device &&
        this.sys.game.device.input &&
        this.sys.game.device.input.touch;

      const hasTouchSupport = [
        nav && typeof nav.maxTouchPoints === 'number' && nav.maxTouchPoints > 0,
        nav && typeof nav.msMaxTouchPoints === 'number' && nav.msMaxTouchPoints > 0,
        win && 'ontouchstart' in win,
        win && typeof win.matchMedia === 'function' && win.matchMedia('(pointer: coarse)').matches,
        phaserTouchDevice,
      ].some(Boolean);

      if (this._forceKeyboard) {
        this._keyboardDetected = true;
      } else if (this._forceJoystick) {
        this._keyboardDetected = false;
      } else {
        this._keyboardDetected = !hasTouchSupport;
      }
      this._fighters = [];
      this.safeAreaInsets = { top: 0, right: 0, bottom: 0, left: 0 };
      this.debugOverlayVisible = false;
      this.debugText = null;
      this._joyDiagLogState = {
        css: { create: false, resize: false },
        depth: { create: false, resize: false },
      };
      this._joyTestLogPrinted = false;
      this._layoutReady = false;
      this._layoutReadyLogPrinted = false;
      this._resizeDebounceEvent = null;
      this._pendingResizeSize = null;
      this._joyDiagFrameIndex = 0;
      this._joyDiagFrameState = null;
      this._joyDiagOrderState = { lastSignature: null, lastFrame: null };
      this.joystickSnapshots = {
        p1: this.createJoystickSnapshot(),
        p2: this.createJoystickSnapshot(),
      };
      this.joystickPrevDirections = {
        p1: { up: false, forward: false, back: false },
        p2: { up: false, forward: false, back: false },
      };
// --- Net diagnostics & networking fields (merged) ---
this._netDiagEnabled = (typeof NET_DIAG_ENABLED !== 'undefined') ? NET_DIAG_ENABLED : false;

// From NET-03 (diag UI)
this.remotePlayerLabels = this.remotePlayerLabels || new Map();
this.netDiagText       = (typeof this.netDiagText !== 'undefined') ? this.netDiagText : null;
this._netDiagLast      = (typeof this._netDiagLast  !== 'undefined') ? this._netDiagLast  : null;

// From main (core net handles)
this.net        = this.net        || { role:null, roomId:null, peerId:null, pcMap:{}, dcMap:{}, peerInputs:{}, players:{} };
this.signaling  = (typeof this.signaling  !== 'undefined') ? this.signaling  : null;
this.netOverlay = (typeof this.netOverlay !== 'undefined') ? this.netOverlay : null;
    }

    getDefaultJoyDiagModes() {
      return {
        noControls: false,
        noJoystick: false,
        joystickOnly: false,
        joyTest: false,
      };
    }

    resetJoyDiagModes() {
      if (!this._joyDiagModes) {
        this._joyDiagModes = this.getDefaultJoyDiagModes();
        return;
      }
      Object.assign(this._joyDiagModes, this.getDefaultJoyDiagModes());
    }

    applyJoyDiagConfig(config) {
      const safeConfig = config || {};
      const modes = safeConfig.modes || {};
      this._joyDiagEnabled = !!safeConfig.enabled;
      if (!this._joyDiagEnabled) {
        this.resetJoyDiagModes();
        this._joystickDeadzone = JOYSTICK_DEADZONE;
        this._joystickDeadzoneSource = 'default';
        return;
      }
      this._joyDiagModes.noControls = !!modes.noControls;
      this._joyDiagModes.noJoystick = !!modes.noJoystick;
      this._joyDiagModes.joystickOnly = !!modes.joystickOnly;
      this._joyDiagModes.joyTest = !!modes.joyTest;
    }

    getJoystickDeadzone() {
      const value = this._joystickDeadzone;
      return typeof value === 'number' && isFinite(value) ? value : JOYSTICK_DEADZONE;
    }

    applyJoyDiagDeadzoneOverride(rawValue, sourceLabel) {
      const defaultDeadzone = JOYSTICK_DEADZONE;
      this._joystickDeadzone = defaultDeadzone;
      this._joystickDeadzoneSource = 'default';

      if (!this._joyDiagEnabled) {
        return;
      }

      if (typeof rawValue !== 'string' || rawValue.trim() === '') {
        return;
      }

      const parsed = parseFloat(rawValue);
      if (!Number.isFinite(parsed)) {
        this._joystickDeadzone = defaultDeadzone;
        if (this.diagnosticsActive()) {
          this.logJoyDiag('joystick:deadzone', {
            context: 'config',
            source: 'default',
            raw: rawValue,
            applied: this._joystickDeadzone,
            default: defaultDeadzone,
            overrideApplied: false,
          });
        }
        return;
      }

      const minDeadzone = 0;
      const maxDeadzone = 0.9;
      const clamped = Phaser.Math.Clamp(parsed, minDeadzone, maxDeadzone);

      this._joystickDeadzone = clamped;
      this._joystickDeadzoneSource = sourceLabel || 'override';

      if (this.diagnosticsActive()) {
        const payload = {
          context: 'config',
          source: this._joystickDeadzoneSource,
          raw: rawValue,
          applied: clamped,
          default: defaultDeadzone,
          overrideApplied: true,
          note: `${this._joystickDeadzoneSource} override active`,
        };
        if (clamped !== parsed) {
          payload.requested = parsed;
        }
        this.logJoyDiag('joystick:deadzone', payload);
      }
    }

    diagnosticsActive() {
      return !!this._joyDiagEnabled;
    }

    logJoyDiag(topic, payload) {
      if (!this.diagnosticsActive()) {
        return;
      }
      if (typeof console === 'undefined' || !console) {
        return;
      }
      const consoleFn = typeof console.info === 'function' ? console.info : console.log;
      try {
        consoleFn.call(console, `[JoyDiag] ${topic}`, payload);
      } catch (error) {
        console.log(`[JoyDiag] ${topic}`, payload, error);
      }
    }

    runJoyDiagChecks(context) {
      if (!this.diagnosticsActive()) {
        return;
      }
      this.auditCssConfiguration(context);
      this.auditDisplayDepths(context);
    }

    extractPointerId(pointer) {
      if (!pointer) {
        return null;
      }
      if (typeof pointer.id !== 'undefined') {
        return pointer.id;
      }
      if (typeof pointer.pointerId !== 'undefined') {
        return pointer.pointerId;
      }
      if (typeof pointer.identifier !== 'undefined') {
        return pointer.identifier;
      }
      return 'mouse';
    }

    logRendererOverride() {
      if (!this.diagnosticsActive()) {
        return;
      }
      if (typeof window === 'undefined' || !window.location) {
        return;
      }
      try {
        const params = new URLSearchParams(window.location.search || '');
        if (params.get('forceCanvas') === '1') {
          this.logJoyDiag('renderer', 'forceCanvas=1 override active');
        }
      } catch (error) {
        this.logJoyDiag('renderer', { error: error && error.message ? error.message : error });
      }
    }

    auditCssConfiguration(context) {
      if (!this.diagnosticsActive()) {
        return;
      }
      const state = this._joyDiagLogState && this._joyDiagLogState.css;
      const contextKey = context === 'resize' ? 'resize' : 'create';
      if (state && state[contextKey]) {
        return;
      }
      if (state) {
        state[contextKey] = true;
      }

      const details = { context: contextKey, canvas: null, root: null };
      if (
        typeof window !== 'undefined' &&
        window.getComputedStyle &&
        typeof document !== 'undefined'
      ) {
        const canvas = this.sys && this.sys.game ? this.sys.game.canvas : null;
        if (canvas) {
          const canvasStyle = canvas.style || {};
          const canvasStyles = window.getComputedStyle(canvas);
          details.canvas = {
            touchAction: canvasStyles.getPropertyValue('touch-action') || canvasStyle.touchAction || '',
            overscrollBehavior:
              canvasStyles.getPropertyValue('overscroll-behavior') || canvasStyle.overscrollBehavior || '',
            userSelect:
              canvasStyles.getPropertyValue('user-select') ||
              canvasStyle.userSelect ||
              canvasStyles.getPropertyValue('-webkit-user-select') ||
              canvasStyle.webkitUserSelect ||
              '',
          };
        }
        const root = document && document.documentElement ? document.documentElement : null;
        if (root) {
          const rootStyle = root.style || {};
          const rootStyles = window.getComputedStyle(root);
          details.root = {
            touchAction:
              rootStyles.getPropertyValue('touch-action') || rootStyle.touchAction || '',
            overscrollBehavior:
              rootStyles.getPropertyValue('overscroll-behavior') || rootStyle.overscrollBehavior || '',
            userSelect:
              rootStyles.getPropertyValue('user-select') ||
              rootStyle.userSelect ||
              rootStyles.getPropertyValue('-webkit-user-select') ||
              rootStyle.webkitUserSelect ||
              '',
          };
        }
      }

      this.logJoyDiag('css', details);
    }

    auditDisplayDepths(context) {
      if (!this.diagnosticsActive()) {
        return;
      }
      const state = this._joyDiagLogState && this._joyDiagLogState.depth;
      const contextKey = context === 'resize' ? 'resize' : 'create';
      if (state && state[contextKey]) {
        return;
      }
      if (state) {
        state[contextKey] = true;
      }

      const children = this.children && this.children.list ? this.children.list : [];
      const audit = [];
      for (let index = 0; index < children.length; index += 1) {
        const child = children[index];
        if (!child) {
          continue;
        }
        const entry = {
          index,
          type: child.type || (child.constructor ? child.constructor.name : 'Unknown'),
          depth: typeof child.depth === 'number' ? child.depth : null,
          name: child.name || null,
          width: typeof child.displayWidth === 'number' ? child.displayWidth : null,
          height: typeof child.displayHeight === 'number' ? child.displayHeight : null,
        };
        audit.push(entry);
      }

      this.logJoyDiag('depth', { context: contextKey, objects: audit });
    }

    ensureJoyDiagHudVisible() {
      if (!this.diagnosticsActive()) {
        return;
      }
      this.debugOverlayVisible = true;
      this.updateDebugOverlay();
    }

    runJoyTestSimulation() {
      // Touch joystick simulation disabled for desktop-only controls.
    }

    getJoystickDiagnostics(player) {
      const snapshot = this.joystickSnapshots[player];
      const joystick = this.virtualJoysticks[player];
      const vector = joystick ? joystick.getVector() : { x: 0, y: 0, magnitude: 0 };
      const active = joystick ? joystick.isActive() : false;
      const normX = Number.isFinite(vector.x) ? vector.x : 0;
      const normY = Number.isFinite(vector.y) ? vector.y : 0;
      const magnitude = Number.isFinite(vector.magnitude) ? vector.magnitude : 0;
      const angle = active ? Phaser.Math.RadToDeg(Math.atan2(normY, normX)) : 0;
      const input = this.getPlayerInput(player);
      return {
        player,
        active,
        snapshot,
        normX,
        normY,
        magnitude,
        angle,
        buttons: input
          ? {
              punch: !!input.punch,
              kick: !!input.kick,
              crouch: !!input.crouch,
            }
          : { punch: false, kick: false, crouch: false },
      };
    }

    renderDiagHUD() {
      if (!this.diagnosticsActive()) {
        return '';
      }
      const lines = [];
      const renderer = this.sys && this.sys.game ? this.sys.game.config : null;
      const renderType = renderer && typeof renderer.renderType === 'number' ? renderer.renderType : null;
      const usingCanvas = renderType === Phaser.CANVAS;
      if (usingCanvas) {
        lines.push('Renderer: Canvas (forceCanvas=1)');
      } else {
        lines.push('Renderer: Auto');
      }

      const formatButton = (pressed) => (pressed ? 'YES' : 'NO').padEnd(3, ' ');

      const players = ['p1', 'p2'];
      for (let i = 0; i < players.length; i += 1) {
        const player = players[i];
        const diag = this.getJoystickDiagnostics(player);
        if (!diag.snapshot) {
          continue;
        }
        const moveX = Number.isFinite(diag.snapshot.moveX) ? diag.snapshot.moveX : 0;
        if (lines.length) {
          lines.push('');
        }
        const buttonLine =
          `  Pressed: Punch ${formatButton(diag.buttons.punch)}  Kick ${formatButton(diag.buttons.kick)}  Crouch ${formatButton(diag.buttons.crouch)}`;
        const normLine = `  normX: ${diag.normX.toFixed(2)}    normY: ${diag.normY.toFixed(2)}`;
        const angleLine = `  angle: ${diag.angle.toFixed(1)}°    magnitude: ${diag.magnitude.toFixed(2)}`;
        const stateLine = `  moveX: ${moveX.toFixed(2)}    active: ${diag.active ? 'yes' : 'no'}`;

        lines.push(`${player.toUpperCase()}`);
        lines.push(buttonLine);
        lines.push(normLine);
        lines.push(angleLine);
        lines.push(stateLine);
      }
      return lines.join('\n');
    }

    renderLegacyHUD() {
      const format = (value) => (value ? 'T' : 'F');
      const formatMove = (value) => {
        const safe = Number.isFinite(value) ? value : 0;
        return safe.toFixed(2);
      };
      const p1 = this.p1Input;
      const p2 = this.p2Input;
      const lines = [
        `P1 MX:${formatMove(p1.moveX)} C:${format(p1.crouch)} JU:${format(p1.jumpUp)} JF:${format(
          p1.jumpForward
        )} JB:${format(p1.jumpBack)} P:${format(p1.punch)} K:${format(p1.kick)}`,
        `P2 MX:${formatMove(p2.moveX)} C:${format(p2.crouch)} JU:${format(p2.jumpUp)} JF:${format(
          p2.jumpForward
        )} JB:${format(p2.jumpBack)} P:${format(p2.punch)} K:${format(p2.kick)}`,
      ];
      return lines.join('\n');
    }

    preload() {}

    create() {
      this.cameras.main.setBackgroundColor('#111');

      if (!this.playBorder && this.add && typeof this.add.graphics === 'function') {
        this.playBorder = this.add.graphics();
        this.playBorder.setDepth(9);
      }

      if (!this.stageLine && this.add && typeof this.add.graphics === 'function') {
        this.stageLine = this.add.graphics();
        this.stageLine.setDepth(1000);
        if (this.stageLine.setScrollFactor) {
          this.stageLine.setScrollFactor(0);
        }
      }

      if (this.diagnosticsActive() && typeof console !== 'undefined' && console) {
        const modes = [];
        if (this._joyDiagModes.noControls) {
          modes.push('nocontrols');
        }
        if (this._joyDiagModes.noJoystick) {
          modes.push('nojoystick');
        }
        if (this._joyDiagModes.joystickOnly) {
          modes.push('joyonly');
        }
        if (this._joyDiagModes.joyTest) {
          modes.push('joytest');
        }
        const modeSummary = modes.length > 0 ? modes.join(', ') : 'default';
        const consoleFn = typeof console.info === 'function' ? console.info : console.log;
        consoleFn.call(console, `[JoyDiag] Active mode: ${modeSummary}`);
      }

      this.logRendererOverride();

      if (this.diagnosticsActive()) {
        const inputManager = this.input && this.input.manager ? this.input.manager : null;
        if (inputManager) {
          const config = inputManager.config || {};
          const touchPlugin = inputManager.touch || null;
          const topOnlyValue =
            typeof inputManager.topOnly === 'boolean'
              ? inputManager.topOnly
              : !!inputManager.topOnly;
          const touchDetails = touchPlugin
            ? {
                available: true,
                enabled:
                  typeof touchPlugin.enabled === 'boolean'
                    ? touchPlugin.enabled
                    : !!touchPlugin.enabled,
                capture: typeof touchPlugin.capture === 'boolean' ? touchPlugin.capture : null,
              }
            : { available: false };

          this.logJoyDiag('input', {
            pointersTotal:
              typeof inputManager.pointersTotal === 'number' ? inputManager.pointersTotal : null,
            pointersMax:
              typeof config.activePointers === 'number' ? config.activePointers : null,
            touch: touchDetails,
            setTopOnly: {
              value: topOnlyValue,
              method: typeof inputManager.setTopOnly,
            },
            config: {
              touch: typeof config.touch !== 'undefined' ? config.touch : null,
              inputQueue:
                typeof config.inputQueue !== 'undefined' ? config.inputQueue : null,
              disableContextMenu:
                typeof config.disableContextMenu !== 'undefined'
                  ? config.disableContextMenu
                  : null,
            },
          });
        }
      }

      const skipCenterText = this.diagnosticsActive() && this._joyDiagModes.joystickOnly;
      if (!skipCenterText) {
        this.titleText = centerText(this, 'Stick-Fight', -28, { fontSize: '56px', fontStyle: '700' });
        if (this.titleText && this.titleText.setInteractive) {
          this.titleText.setInteractive({ useHandCursor: false });
          this.titleText.on('pointerdown', (pointer) => {
            this.preventPointerDefault(pointer);
            this.toggleDebugOverlay();
          });
        }
        centerText(this, 'Main Scene Ready', 28, { fontSize: '24px', color: '#bbbbbb' });
      }

      this.registerTouchPrevention();
      this.createTouchControls();
      this.registerKeyboardControls();
      this.createDebugOverlay();
      this.logTouchControlsCreationDiagnostics();

      if (this.diagnosticsActive()) {
        this.ensureJoyDiagHudVisible();
        this.runJoyDiagChecks('create');
      } else {
        this.updateDebugOverlay();
      }

      this.scale.on('resize', this.handleResize, this);
      this.handleResize(this.scale.gameSize);

      this.waitForValidSize(() => this.initWorldAndSpawn());

      if (
        NETWORK_ENABLED &&
        typeof window !== 'undefined' &&
        window.StickFightNetplay &&
        typeof window.StickFightNetplay.attachScene === 'function'
      ) {
        window.StickFightNetplay.attachScene(this);
        bootLog('ROUTE', 'scene-hooks-prepared', { enabled: true });
      } else if (!NETWORK_ENABLED) {
        bootLog('ROUTE', 'netplay-skipped', { reason: SAFE_MODE ? 'safe-mode' : 'nolobby' });
      }

      const pointerDownHandler = (pointer) => {
        if (this._forceKeyboard) {
          return;
        }
        let pointerEventType;
        if (pointer && pointer.event) {
          pointerEventType = pointer.event.type;
        }
        const isTouchPointer =
          !!pointer &&
          (pointer.pointerType === 'touch' ||
            pointer.pointerType === 'pen' ||
            pointer.wasTouch === true ||
            (typeof pointerEventType === 'string' && pointerEventType.startsWith('touch')));
        if (!isTouchPointer) {
          return;
        }
        const wasKeyboard = this._keyboardDetected;
        if (wasKeyboard) {
          this._keyboardDetected = false;
        }
        if (wasKeyboard || this._forceJoystick) {
          this.updateTouchControlsVisibility();
        }
      };
      this.input.on('pointerdown', pointerDownHandler);
      if (NETWORK_ENABLED && typeof this.setupNetworking === 'function') {
        this.setupNetworking();
      }
      this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
        this.input.off('pointerdown', pointerDownHandler);
// --- scene/net teardown on shutdown ---
this.destroyNetDiagOverlay && this.destroyNetDiagOverlay();
this.clearRemotePlayerLabels && this.clearRemotePlayerLabels();

if (NETWORK_ENABLED &&
    typeof window !== 'undefined' &&
    window.StickFightNetplay &&
    typeof window.StickFightNetplay.detachScene === 'function') {
  window.StickFightNetplay.detachScene(this);
}

// Ensure all networking resources are cleaned up as well
this.teardownNetworking && this.teardownNetworking();
      });
    }

    // --- Networking session resolution (keep from main) ---
    resolveNetSession() {
      const session = {
        roomId: null,
        peerId: null,
        isHost: false,
        hostPeerId: null,
      };

      const win = typeof window !== 'undefined' ? window : null;
      const possibleSources = [];
      if (win) {
        if (win.STICKFIGHT_NET_SESSION) {
          possibleSources.push(win.STICKFIGHT_NET_SESSION);
        }
        if (win.STICKFIGHT_NET) {
          possibleSources.push(win.STICKFIGHT_NET);
        }
        if (win.StickFightNet) {
          possibleSources.push(win.StickFightNet);
        }
      }

      const applySession = (source) => {
        if (!source) return;
        if (typeof source.roomId === 'string' && source.roomId.length > 0) {
          session.roomId = session.roomId || source.roomId;
        }
        if (typeof source.peerId === 'string' && source.peerId.length > 0) {
          session.peerId = session.peerId || source.peerId;
        }
        if (typeof source.isHost === 'boolean') {
          session.isHost = source.isHost;
        }
        if (typeof source.hostPeerId === 'string' && source.hostPeerId.length > 0) {
          session.hostPeerId = session.hostPeerId || source.hostPeerId;
        }
        if (!session.isHost && typeof source.role === 'string') {
          session.isHost = source.role === 'host';
        }
      };

      for (let i = 0; i < possibleSources.length; i += 1) {
        applySession(possibleSources[i]);
      }

      if (!session.roomId && NET_QUERY_PARAMS.room) {
        session.roomId = NET_QUERY_PARAMS.room;
      }
      if (!session.peerId && NET_QUERY_PARAMS.peer) {
        session.peerId = NET_QUERY_PARAMS.peer;
      }
      if (!session.hostPeerId && NET_QUERY_PARAMS.hostPeerId) {
        session.hostPeerId = NET_QUERY_PARAMS.hostPeerId;
      }
      if (!session.isHost && NET_QUERY_PARAMS.role === 'host') {
        session.isHost = true;
      }
      if (!session.isHost && session.peerId && session.hostPeerId && session.peerId === session.hostPeerId) {
        session.isHost = true;
      }
      if (session.isHost && !session.hostPeerId && session.peerId) {
        session.hostPeerId = session.peerId;
      }

      return session;
    }

    // --- Net state factory (keep from main) ---
    createNetState(role) {
      this.net = {
        role: role,
        roomId: null,
        peerId: null,
        pcMap: {},
        dcMap: {},
        inputDc: null,
        stateDc: null,
        rtts: {},
        lastOfferTs: null,
        lastAnswerTs: null,
        peerInputs: {},
        players: {},
      };
    }

    // --- Networking setup (keep from main) ---
    setupNetworking() {
      if (!NETWORK_ENABLED) {
        if (this._netDiagEnabled) {
          netDiagLog('setup:disabled', { reason: 'flags' });
        }
        return;
      }
      const session = this.resolveNetSession();
      if (!session.roomId || !session.peerId) {
        if (this._netDiagEnabled) {
          netDiagLog('setup:skipped', { reason: 'missing session', session: session });
        }
        return;
      }

      const db = FirebaseRuntime.getFirestore();
      const fieldValue = FirebaseRuntime.getFieldValue();
      if (!db || !fieldValue) {
        if (this._netDiagEnabled) {
          netDiagLog('setup:firestore-unavailable', { roomId: session.roomId });
        }
        return;
      }

      this.createNetState(session.isHost ? 'host' : 'guest');
      if (this.net) {
        this.net.roomId = session.roomId;
        this.net.peerId = session.peerId;
        this.net.peerInputs = {};
        this.net.players = {};
      }
      if (session.isHost && typeof this.onNetPeerJoined === 'function') {
        this.onNetPeerJoined(session.peerId, { isLocal: true });
      }

      const signaling = new Signaling({
        db: db,
        fieldValue: fieldValue,
        roomId: session.roomId,
        peerId: session.peerId,
        isHost: session.isHost,
        hostPeerId: session.hostPeerId,
        scene: this,
        netdiag: this._netDiagEnabled,
      });

      this.signaling = signaling;
      signaling.start();
      if (session.isHost) {
        signaling.hostWatchGuests();
      } else {
        signaling.guestWatchHost();
        signaling.guestOffer();
      }
      this.createNetOverlay();
      this.updateNetOverlay();
    }

    teardownNetworking() {
      if (this.signaling) {
        this.signaling.stop();
        this.signaling = null;
      }
      if (this.netOverlay) {
        this.netOverlay.setText('');
        this.netOverlay.setVisible(false);
      }
      if (this.net) {
        this.net.pcMap = {};
        this.net.dcMap = {};
        this.net.inputDc = null;
        this.net.stateDc = null;
        this.net.rtts = {};
        this.net.lastOfferTs = null;
        this.net.lastAnswerTs = null;
        this.net.peerInputs = {};
        this.net.players = {};
        this.net.peerId = null;
        this.net.roomId = null;
      }
      this.net = null;
      this.updateNetOverlay();
    }

    createNetOverlay() {
      if (!this._netDiagEnabled) {
        return;
      }
      if (this.netOverlay) {
        return;
      }
      if (!this.add || typeof this.add.text !== 'function') {
        return;
      }
      const text = this.add
        .text(0, 0, '', {
          fontFamily: 'Menlo, Monaco, Consolas, monospace',
          fontSize: '12px',
          color: '#66ffcc',
          align: 'right',
          backgroundColor: 'rgba(5, 25, 18, 0.6)',
        })
        .setOrigin(1, 0)
        .setScrollFactor(0)
        .setDepth(120)
        .setVisible(false);
      text.setPadding(8, 6, 10, 8);
      this.netOverlay = text;
      this.positionNetOverlay();
    }

    positionNetOverlay() {
      if (!this.netOverlay) {
        return;
      }
      const safeInsets = this.safeAreaInsets || {};
      const topInset = typeof safeInsets.top === 'number' ? safeInsets.top : 0;
      const rightInset = typeof safeInsets.right === 'number' ? safeInsets.right : 0;
      const topOffset = topInset + 12;
      const rightOffset = rightInset + 12;
      const size = this.scale ? this.scale.gameSize : null;
      const width = size ? size.width : 0;
      this.netOverlay.setPosition(width - rightOffset, topOffset);
    }

    formatNetTimestamp(ts) {
      if (!ts) {
        return '-';
      }
      try {
        const date = new Date(ts);
        return date.toLocaleTimeString();
      } catch (error) {
        return String(ts);
      }
    }

    getNetPeerCounts() {
      const counts = { total: 0, connected: 0 };
      if (!this.net || !this.net.pcMap) {
        return counts;
      }
      const keys = Object.keys(this.net.pcMap);
      counts.total = keys.length;
      for (let i = 0; i < keys.length; i += 1) {
        const peerId = keys[i];
        const pc = this.net.pcMap[peerId];
        if (!pc) {
          continue;
        }
        const connectionState = typeof pc.connectionState === 'string' ? pc.connectionState : '';
        const iceState = typeof pc.iceConnectionState === 'string' ? pc.iceConnectionState : '';
        if (connectionState === 'connected' || iceState === 'connected' || iceState === 'completed') {
          counts.connected += 1;
        }
      }
      return counts;
    }

    updateNetOverlay() {
      if (!this._netDiagEnabled) {
        if (this.netOverlay) {
          this.netOverlay.setText('');
          this.netOverlay.setVisible(false);
        }
        return;
      }
      this.createNetOverlay();
      if (!this.netOverlay) {
        return;
      }
      if (!this.net) {
        this.netOverlay.setText('role: offline');
        this.netOverlay.setVisible(true);
        return;
      }
      const counts = this.getNetPeerCounts();
      const roleLabel = this.net.role || (this.signaling && this.signaling.isHost ? 'host' : 'guest');
      const lines = [
        'role: ' + roleLabel,
        'peers: ' + counts.connected + '/' + counts.total,
        'offer: ' + this.formatNetTimestamp(this.net.lastOfferTs),
        'answer: ' + this.formatNetTimestamp(this.net.lastAnswerTs),
      ];
      this.netOverlay.setText(lines.join('\n'));
      this.netOverlay.setVisible(true);
    }

    waitForValidSize(callback) {
      const start =
        typeof performance !== 'undefined' && typeof performance.now === 'function'
          ? performance.now()
          : Date.now();

      const checkSize = () => {
        const size = this.scale ? this.scale.gameSize : null;
        const width = size ? size.width : 0;
        const height = size ? size.height : 0;

        if (width >= MIN_LAYOUT_WIDTH && height >= MIN_LAYOUT_HEIGHT) {
          if (!this._layoutReadyLogPrinted) {
            console.info(
              `[StickFight] layout ready: ${Math.round(width)}x${Math.round(height)}`
            );
            this._layoutReadyLogPrinted = true;
          }
          if (typeof callback === 'function') {
            callback();
          }
          return;
        }

        const now =
          typeof performance !== 'undefined' && typeof performance.now === 'function'
            ? performance.now()
            : Date.now();

        if (now - start >= LAYOUT_POLL_TIMEOUT) {
          if (!this._layoutReadyLogPrinted) {
            const reportedWidth = Math.round(width || 0);
            const reportedHeight = Math.round(height || 0);
            console.warn(
              `[StickFight] layout timeout after ${LAYOUT_POLL_TIMEOUT}ms (size: ${reportedWidth}x${reportedHeight})`
            );
            this._layoutReadyLogPrinted = true;
          }
          if (typeof callback === 'function') {
            callback();
          }
          return;
        }

        if (this.time && typeof this.time.delayedCall === 'function') {
          this.time.delayedCall(LAYOUT_POLL_INTERVAL, checkSize);
        } else if (
          typeof window !== 'undefined' &&
          typeof window.requestAnimationFrame === 'function'
        ) {
          window.requestAnimationFrame(checkSize);
        } else {
          setTimeout(checkSize, LAYOUT_POLL_INTERVAL);
        }
      };

      checkSize();
    }

    initWorldAndSpawn() {
      if (!this.physics || !this.physics.world) {
        return;
      }

      if (!this._layoutReady) {
        this._layoutReady = true;
      }

      const scaleSize = this.scale ? this.scale.gameSize : null;
      const pending = this._pendingResizeSize;
      const size =
        pending && pending.width >= MIN_LAYOUT_WIDTH && pending.height >= MIN_LAYOUT_HEIGHT
          ? pending
          : scaleSize;

      const fallbackScaleSize = this.scale ? this.scale.gameSize : null;
      const resolvedSource = size || fallbackScaleSize;
      const resolvedSize = resolvedSource
        ? { width: resolvedSource.width || 0, height: resolvedSource.height || 0 }
        : null;

      this.refreshWorldBounds(resolvedSize);

      if (!this._fighters || this._fighters.length === 0) {
        this.spawnFighters();
      }

      this.clampFightersToPlayArea();
      this.applyResize(resolvedSize);
      this._pendingResizeSize = resolvedSize;
    }

    refreshWorldBounds(gameSize) {
      if (!this.physics || !this.physics.world) {
        return;
      }
      const size = gameSize || this.scale.gameSize;
      if (!size) {
        return;
      }
      const width = Math.max(typeof size.width === 'number' ? size.width : 0, MIN_LAYOUT_WIDTH);
      const height = Math.max(
        typeof size.height === 'number' ? size.height : 0,
        MIN_LAYOUT_HEIGHT
      );
      const basePlay = computePlayArea(width, height, this._playAreaPadOverride);
      let layout = null;
      let play = basePlay;
      if (this.shouldUseMobileLayout()) {
        layout = this.computeMobileLayout(size, basePlay);
        if (layout && layout.playArea) {
          play = layout.playArea;
        }
      } else {
        this.mobileControlLayout = null;
      }
      this.playArea = play;

      if (this.diagnosticsActive()) {
        this.logJoyDiag('layout:playArea', {
          mobile: isMobileUA(),
          pretendMobile: !!this._pretendMobile,
          shouldUseMobileLayout: this.shouldUseMobileLayout(),
          scale: JOY_MOBILE_SCALE,
          play: {
            x: play ? play.x : null,
            y: play ? play.y : null,
            w: play ? play.w : null,
            h: play ? play.h : null,
          },
          gutters: layout ? layout.gutters : null,
          controls: layout ? layout.controls : null,
          joystick: {
            outer: JOY_OUTER_R,
            knob: JOY_KNOB_R,
            hit: JOY_OUTER_R + JOY_HIT_PADDING,
          },
        });
        if (layout) {
          this.logJoyDiag('layout:controls', {
            pretendMobile: !!this._pretendMobile,
            shouldUseMobileLayout: this.shouldUseMobileLayout(),
            gutters: layout.gutters,
            controls: layout.controls,
            hitRadii: layout.hitRadii,
          });
        }
      }
      this.physics.world.setBounds(play.x, play.y, play.w, play.h, true, true, true, true);

      const camera = this.cameras ? this.cameras.main : null;
      if (camera) {
        camera.setBounds(play.x, play.y, play.w, play.h);
        camera.setScroll(play.x, play.y);
      }

      this.updatePlayAreaBorder();
      this.updatePlayAreaDiagnostics(true);
      this.positionTouchButtons();
    }

    clampFightersToPlayArea() {
      if (!this._fighters || !this.playArea) {
        return;
      }
      this._fighters.forEach((fighter) => {
        if (!fighter) {
          return;
        }
        const body = /** @type {Phaser.Physics.Arcade.Body} */ (fighter.body);
        const play = this.playArea;
        const result = clampToPlay(fighter, play);

        if (body) {
          if (result.changedX) {
            body.setVelocityX(0);
          }
          if (result.changedY) {
            body.setVelocityY(0);
          }
        }

        if (fighter.setAlpha) {
          fighter.setAlpha(1);
        }
        if (fighter.setVisible) {
          fighter.setVisible(true);
        }
      });
    }

    updatePlayAreaBorder() {
      if ((!this.playBorder && !this.stageLine) || !this.playArea) {
        return;
      }

      const play = this.playArea;
      const border = this.playBorder;
      const stageLine = this.stageLine || null;

      if (border) {
        border.clear();
      }
      if (stageLine) {
        stageLine.clear();
      }

      if (!play || play.w <= 0 || play.h <= 0) {
        if (border) {
          border.setVisible(false);
        }
        if (stageLine) {
          stageLine.setVisible(false);
        }
        return;
      }

      if (border) {
        border.setVisible(true);
        border.setDepth(9);
        border.lineStyle(3, 0xffffff, 0.8);
        border.strokeRect(
          play.x + 0.5,
          play.y + 0.5,
          Math.max(play.w - 1, 0),
          Math.max(play.h - 1, 0)
        );

        if (play.w > 12 && play.h > 12) {
          border.lineStyle(1, 0xffffff, 0.25);
          border.strokeRect(
            play.x + 6.5,
            play.y + 6.5,
            Math.max(play.w - 13, 0),
            Math.max(play.h - 13, 0)
          );
        }
      }

      if (stageLine) {
        stageLine.setVisible(true);
        stageLine.setDepth(1000);
        stageLine.lineStyle(2, 0xff2a2a, 1);
        const midY = play.y + play.h / 2;
        stageLine.beginPath();
        stageLine.moveTo(play.x, midY);
        stageLine.lineTo(play.x + play.w, midY);
        stageLine.strokePath();
      }
    }

    updatePlayAreaDiagnostics(forceRedraw) {
      const play = this.playArea;
      if (!play) {
        return;
      }

      const diagnosticsActive = this.diagnosticsActive();
      if (!diagnosticsActive) {
        if (this._playAreaDiagText) {
          this._playAreaDiagText.setVisible(false);
        }
        if (this._playAreaDiagGrid) {
          this._playAreaDiagGrid.clear();
          this._playAreaDiagGrid.setVisible(false);
        }
        return;
      }

      const label =
        'Play: ' +
        Math.round(play.x) +
        ',' +
        Math.round(play.y) +
        ' ' +
        Math.round(play.w) +
        '×' +
        Math.round(play.h);

      const needsCreate = !this._playAreaDiagText || !this._playAreaDiagGrid;
      const shouldRedraw = forceRedraw || needsCreate || this._playAreaDiagLastText !== label;

      if (shouldRedraw) {
        if (!this._playAreaDiagText && this.add && typeof this.add.text === 'function') {
          this._playAreaDiagText = this.add
            .text(12, 108, '', {
              fontFamily: 'monospace',
              fontSize: '12px',
              color: '#00ffee',
            })
            .setOrigin(0, 0)
            .setScrollFactor(0)
            .setDepth(60);
        }

        if (this._playAreaDiagText) {
          this._playAreaDiagText.setText(label);
          this._playAreaDiagText.setVisible(true);
        }

        if (!this._playAreaDiagGrid && this.add && typeof this.add.graphics === 'function') {
          this._playAreaDiagGrid = this.add.graphics();
          this._playAreaDiagGrid.setDepth(8);
        }

        const grid = this._playAreaDiagGrid;
        if (grid) {
          grid.clear();

          if (play.w > 0 && play.h > 0) {
            const baseStep = Math.max(48, Math.round(Math.min(play.w, play.h) / 6));
            const step = Math.max(24, baseStep);
            const useLineBetween = grid.lineBetween && typeof grid.lineBetween === 'function';
            grid.lineStyle(1, 0xffffff, 0.08);
            if (useLineBetween) {
              for (let x = play.x + step; x < play.x + play.w; x += step) {
                grid.lineBetween(x, play.y + 2, x, play.y + play.h - 2);
              }
              for (let y = play.y + step; y < play.y + play.h; y += step) {
                grid.lineBetween(play.x + 2, y, play.x + play.w - 2, y);
              }
            } else {
              grid.beginPath();
              for (let x = play.x + step; x < play.x + play.w; x += step) {
                grid.moveTo(x, play.y + 2);
                grid.lineTo(x, play.y + play.h - 2);
              }
              for (let y = play.y + step; y < play.y + play.h; y += step) {
                grid.moveTo(play.x + 2, y);
                grid.lineTo(play.x + play.w - 2, y);
              }
              grid.strokePath();
            }
          }
          grid.setVisible(true);
        }
        this._playAreaDiagLastText = label;

        if (typeof console !== 'undefined' && console && typeof console.info === 'function') {
          console.info('[PlayArea] ' + label);
        }
      } else {
        if (this._playAreaDiagText) {
          this._playAreaDiagText.setVisible(true);
        }
        if (this._playAreaDiagGrid) {
          this._playAreaDiagGrid.setVisible(true);
        }
      }
    }

    handleResize(gameSize) {
      const sourceSize = gameSize || this.scale.gameSize;
      if (!sourceSize) {
        return;
      }

      this._pendingResizeSize = {
        width: sourceSize.width,
        height: sourceSize.height,
      };

      const runResize = () => {
        this._resizeDebounceEvent = null;
        const pending = this._pendingResizeSize || this.scale.gameSize;
        this.applyResize(pending);
      };

      if (!this.time || typeof this.time.delayedCall !== 'function') {
        runResize();
        return;
      }

      if (this._resizeDebounceEvent) {
        this._resizeDebounceEvent.remove(false);
      }

      this._resizeDebounceEvent = this.time.delayedCall(0, runResize);
    }

    applyResize(gameSize) {
      const size = gameSize || this.scale.gameSize;
      if (!size) {
        return;
      }
      const width = typeof size.width === 'number' ? size.width : this.scale.gameSize.width;
      const height = typeof size.height === 'number' ? size.height : this.scale.gameSize.height;
      const safeWidth = Math.max(width || 0, 1);
      const safeHeight = Math.max(height || 0, 1);

      const camera = this.cameras.main;
      if (camera) {
        camera.setViewport(0, 0, safeWidth, safeHeight);
      }

      this.updateSafeAreaInsets();
      this.computeMobileLayout(size);

      (this._centeredElements || []).forEach((updatePosition) => updatePosition());
      this.positionTouchButtons();
      this.positionDebugOverlay();
// Position any networking diagnostics overlay (support both names)
if (typeof this.positionNetDiagOverlay === 'function') {
  this.positionNetDiagOverlay();
} else if (typeof this.positionNetOverlay === 'function') {
  this.positionNetOverlay();
}

      if (this._layoutReady) {
        this.refreshWorldBounds(size);
        this.clampFightersToPlayArea();
      } else {
        this.updatePlayAreaDiagnostics(false);
      }

      if (this.diagnosticsActive()) {
        this.runJoyDiagChecks('resize');
      }
    }

    update(time, delta) {
      this.dt = Math.min(delta, 50) / 1000;

      const role = this.net && typeof this.net.role === 'string' ? this.net.role : null;
      if (role === 'host') {
        const stepDelta = Math.min(delta / 1000, 0.1);
        this._simAcc += stepDelta;
        if (this._netDiagEnabled) {
          this._simTickLogTimer += stepDelta;
        }
        while (this._simAcc >= FIXED_DT) {
          this.serverFixedStep(FIXED_DT);
          this._simAcc -= FIXED_DT;
          if (this._netDiagEnabled) {
            this._simTickCount += 1;
          }
        }
        if (this._netDiagEnabled && this._simTickLogTimer >= 1) {
          const seconds = this._simTickLogTimer;
          const ticks = this._simTickCount;
          const rate = seconds > 0 ? ticks / seconds : 0;
          netDiagLog('sim:ticks-per-sec', {
            ticks,
            seconds,
            rate,
          });
          this._simTickLogTimer = 0;
          this._simTickCount = 0;
        }
      } else {
        this._simAcc = 0;
        this._simTickCount = 0;
        this._simTickLogTimer = 0;
      }

      this._joyDiagFrameIndex = (this._joyDiagFrameIndex || 0) + 1;
      const diagnosticsActive = this.diagnosticsActive();
      if (diagnosticsActive) {
        this._joyDiagFrameState = {
          frame: this._joyDiagFrameIndex,
          order: [],
          sources: {},
          overrideEvents: [],
          preResetMoveX: this.p1Input ? this.p1Input.moveX : null,
        };
      } else {
        this._joyDiagFrameState = null;
      }

      this.reconcileInputState();

      if (this._fighters && this._fighters.length) {
        const [p1, p2] = this._fighters;
        if (p1) {
          if (this._joyDiagFrameState) {
            this._joyDiagFrameState.order.push('updateFighterMovement:p1');
          }
          this.updateFighterMovement(p1, this.p1Input, p2, this.dt);
        }
        if (p2) {
          if (this._joyDiagFrameState) {
            this._joyDiagFrameState.order.push('updateFighterMovement:p2');
          }
          this.updateFighterMovement(p2, this.p2Input, p1, this.dt);
        }
      }

      this._fighters.forEach((fighter) => fighter.update(this.dt));

      if (this._joyDiagFrameState) {
        this._joyDiagFrameState.preResetMoveX = this.p1Input ? this.p1Input.moveX : null;
      }

      this.updatePlayAreaDiagnostics(false);

      this.resetMomentaryInputFlags();

      if (this._joyDiagFrameState) {
        const afterReset = this.p1Input ? this.p1Input.moveX : null;
        if (afterReset !== this._joyDiagFrameState.preResetMoveX) {
          this._joyDiagFrameState.overrideEvents.push({
            type: 'endOfFrameReset',
            stage: 'resetMomentaryInputFlags',
            before: this._joyDiagFrameState.preResetMoveX,
            after: afterReset,
          });
        }
      }

      this.updateDebugOverlay();
      this.updateNetOverlay();
      if (this.net && this.net.role === 'host' && typeof this.serverFixedStep === 'function') {
        this.serverFixedStep(this.dt);
      }
      traceControls(this);

      if (this._joyDiagFrameState) {
        this.flushJoyDiagFrameDiagnostics();
      }
    }

    // --- NET-04b helpers: timestamp & input normalization ---
    getNetTimestamp() {
      if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
        return performance.now();
      }
      return Date.now();
    }

    createDefaultNetInput() {
      return { moveX: 0, crouch: false, punch: false, kick: false, jump: 0 };
    }

    normalizePeerInputPacket(packet) {
      if (!packet || typeof packet !== 'object') {
        const defaults = this.createDefaultNetInput();
        return Object.assign(
          { receivedAt: this.getNetTimestamp(), sequence: null, timestamp: null, packetStale: false },
          defaults
        );
      }
      const payload = packet.payload && typeof packet.payload === 'object' ? packet.payload : null;
      const inputPayload = payload && typeof payload.p === 'object' ? payload.p : null;
      const defaults = this.createDefaultNetInput();

      const moveX = inputPayload && typeof inputPayload.mx !== 'undefined'
        ? Phaser.Math.Clamp(Number(inputPayload.mx) || 0, -1, 1)
        : defaults.moveX;
      const crouch = inputPayload && typeof inputPayload.cr !== 'undefined'
        ? !!inputPayload.cr
        : defaults.crouch;
      const punch = inputPayload && typeof inputPayload.pu !== 'undefined'
        ? !!inputPayload.pu
        : defaults.punch;
      const kick = inputPayload && typeof inputPayload.ki !== 'undefined'
        ? !!inputPayload.ki
        : defaults.kick;
      const rawJump = (inputPayload && typeof inputPayload.ju === 'number') ? inputPayload.ju : defaults.jump;
      const jump = Phaser.Math.Clamp(Math.round(rawJump), -1, 1);

      const receivedAt =
        (typeof packet.receivedAt === 'number' && Number.isFinite(packet.receivedAt))
          ? packet.receivedAt
          : this.getNetTimestamp();
      const sequence =
        (payload && typeof payload.seq === 'number' && Number.isFinite(payload.seq))
          ? payload.seq
          : null;
      const timestamp =
        (payload && typeof payload.t === 'number' && Number.isFinite(payload.t))
          ? payload.t
          : null;

      return {
        moveX,
        crouch,
        punch,
        kick,
        jump,
        receivedAt,
        sequence,
        timestamp,
        packetStale: !!packet.stale,
      };
    }

    // --- Spawn positioning for new peers (host) ---
    computeNetSpawnPosition(index) {
      const worldBounds =
        this.physics && this.physics.world && this.physics.world.bounds
          ? this.physics.world.bounds
          : null;
      const area = worldBounds
        ? { x: worldBounds.x, y: worldBounds.y, w: worldBounds.width, h: worldBounds.height }
        : this.playArea || { x: 0, y: 0, w: 0, h: 0 };

      const marginX = 64;
      const marginY = 72;
      const width  = Math.max((typeof area.w === 'number' ? area.w : 0), marginX * 2 + 1);
      const height = Math.max((typeof area.h === 'number' ? area.h : 0), marginY * 2 + 1);
      const safeLeft   = area.x + marginX;
      const safeRight  = area.x + width  - marginX;
      const safeBottom = area.y + height - marginY;
      const centerX = area.x + width * 0.5;

      const offset   = (index % 4) - 1.5;
      const spacing  = 120;
      const spawnX = Phaser.Math.Clamp(centerX + offset * spacing, safeLeft, safeRight);
      const spawnY = Phaser.Math.Clamp(safeBottom, area.y + marginY, area.y + height - marginY);
      return { x: spawnX, y: spawnY };
    }

    onNetPeerJoined(peerId, meta) {
      if (!this.net || this.net.role !== 'host') return;
      if (typeof peerId !== 'string' || peerId.length === 0) return;

      if (!this.net.players) this.net.players = {};
      if (this.net.players[peerId]) return;

      const index = Object.keys(this.net.players).length;
      const spawn = this.computeNetSpawnPosition(index);
      const centerX = this.playArea ? (this.playArea.x + this.playArea.w * 0.5) : spawn.x;
      const facing = (spawn.x < centerX) ? 1 : -1;

      const record = {
        id: peerId,
        x: spawn.x,
        y: spawn.y,
        vx: 0,
        vy: 0,
        hp: 100,
        facing: facing,
        onGround: true,
        lastInputAt: null,
        lastKnownInput: null,
        inputStale: false,
        lastPacketStale: false,
        packetTimestamp: null,
        packetSequence: null,
        lastProcessedAt: null,
      };
      this.net.players[peerId] = record;

      if (!this.net.peerInputs) this.net.peerInputs = {};
      if (!meta || !meta.skipLog) {
        console.log('[Net] Registered player', peerId, record);
      }
    }

    onNetPeerLeft(peerId) {
      if (!this.net || !this.net.players) return;
      if (typeof peerId !== 'string' || peerId.length === 0) return;

      if (this.net.players[peerId]) {
        delete this.net.players[peerId];
        if (this.net.peerInputs) delete this.net.peerInputs[peerId];
        console.log('[Net] Removed player', peerId);
      }
    }

    onPeerInput(peerId, packet) {
      if (!this.net || this.net.role !== 'host') return;
      if (typeof peerId !== 'string' || peerId.length === 0) return;

      const normalized = this.normalizePeerInputPacket(packet);
      if (!this.net.peerInputs) this.net.peerInputs = {};
      this.net.peerInputs[peerId] = normalized;

      const record = this.net.players ? this.net.players[peerId] : null;
      if (record) {
        record.lastPacketStale = !!normalized.packetStale;
      }
    }

    // --- Host fixed-step input plumbing (keeps noop fallback out) ---
    serverFixedStep(dt) {
      if (!this.net || this.net.role !== 'host') {
        return; // guest or offline: host sim not active
      }

      const STALE_MS = (typeof NET_INPUT_STALE_MS === 'number') ? NET_INPUT_STALE_MS : 1500;

      const players = this.net.players || {};
      const now = this.getNetTimestamp();
      const ids = Object.keys(players);

      for (let i = 0; i < ids.length; i += 1) {
        const peerId = ids[i];
        if (!peerId || peerId === this.net.peerId) {
          // Skip the host’s own local record here if you handle it elsewhere;
          // or include it if you want uniform handling for all players.
          continue;
        }

        const player = players[peerId];
        if (!player) continue;

        const defaults = this.createDefaultNetInput();
        const incoming = this.net.peerInputs ? this.net.peerInputs[peerId] : null;

        if (incoming) {
          const applied = Object.assign({}, defaults, incoming);
          const packetMarkedStale = !!applied.packetStale;

          player.packetTimestamp = (typeof applied.timestamp === 'number') ? applied.timestamp : null;
          player.packetSequence  = (typeof applied.sequence  === 'number') ? applied.sequence  : null;

          // consume the queued packet
          delete this.net.peerInputs[peerId];

          if (packetMarkedStale) {
            if (!player.lastPacketStale) {
              console.warn('[Net] Player ' + peerId + ' packet stale (timestamp drift)');
            }
            player.lastPacketStale = true;
            player.inputStale = true;
            player.lastInputAt = now - (STALE_MS + 1);
            player.activeInput = Object.assign({}, defaults);
            player.lastProcessedAt = now;
            continue;
          }

          player.lastPacketStale = false;
          player.lastKnownInput = applied;
          player.lastInputAt = (typeof applied.receivedAt === 'number' && Number.isFinite(applied.receivedAt))
            ? applied.receivedAt
            : now;
        }

        if (!player.lastKnownInput) {
          player.activeInput = Object.assign({}, defaults);
          player.inputStale = false;
          continue;
        }

        const ageMs = (typeof player.lastInputAt === 'number') ? (now - player.lastInputAt) : null;
        const isStale = (Number.isFinite(ageMs) && ageMs > STALE_MS);

        if (isStale) {
          if (!player.inputStale) {
            console.warn('[Net] Player ' + peerId + ' input stale (' + Math.round(ageMs) + 'ms)');
          }
          player.inputStale = true;
          player.activeInput = Object.assign({}, defaults);
        } else {
          if (player.inputStale) {
            console.log('[Net] Player ' + peerId + ' input active');
          }
          player.inputStale = false;
          player.activeInput = Object.assign({}, defaults, player.lastKnownInput);
        }

        player.lastProcessedAt = now;
      }
    }
    }

    reconcileInputState() {
      this.updateJoystickSnapshots();

      if (this._joyDiagFrameState) {
        const order = this._joyDiagFrameState.order;
        if (!order.includes('reconcile')) {
          order.push('reconcile');
        }
      }

      ['p1', 'p2'].forEach((player) => {
        const state = this.getPlayerInput(player);
        if (!state) {
          return;
        }

        const joystick = this.joystickSnapshots[player];
        const keyboardMoveX = this.determineKeyboardMoveX(player);
        const joystickMoveX = joystick ? joystick.moveX : 0;
        const joystickHasInput = Math.abs(joystickMoveX) > 0.0001;
        const keyboardHasInput = keyboardMoveX !== 0;
        const forcingKeyboard = player === 'p1' && this._forceKeyboard;
        let moveSource = 'joystick';
        let resolvedMoveX = joystickMoveX;
        let overrideType = null;

        if (forcingKeyboard || keyboardHasInput) {
          resolvedMoveX = keyboardHasInput ? keyboardMoveX : 0;
          moveSource = keyboardHasInput ? 'keyboard' : 'keyboard-forced';
          if (player === 'p1' && joystickHasInput && resolvedMoveX !== joystickMoveX) {
            overrideType = forcingKeyboard ? 'forceKeyboard' : 'keyboardFallback';
          }
        }

        state.moveX = Phaser.Math.Clamp(resolvedMoveX, -1, 1);

        if (this._joyDiagFrameState) {
          const frameState = this._joyDiagFrameState;
          frameState.sources[player] = {
            source: moveSource,
            keyboard: keyboardMoveX,
            joystick: joystickMoveX,
            forced: forcingKeyboard && !keyboardHasInput,
          };
          if (player === 'p1' && overrideType) {
            frameState.overrideEvents.push({
              type: overrideType,
              stage: 'reconcileInputState',
              keyboard: keyboardMoveX,
              joystick: joystickMoveX,
              applied: state.moveX,
            });
          }
        }

        const holds = this.keyboardHoldStates[player];
        const holdCrouch = holds && holds.crouch ? holds.crouch : false;
        const crouch = holdCrouch || joystick.crouch;
        state.crouch = !!crouch;

        const jumpQueue = this.keyboardJumpQueue[player];
        if (jumpQueue) {
          if (jumpQueue.forward) {
            state.jumpForward = true;
          }
          if (jumpQueue.back) {
            state.jumpBack = true;
          }
          if (jumpQueue.up) {
            state.jumpUp = true;
          }
        }

        if (joystick.jumpForward) {
          state.jumpForward = true;
        }
        if (joystick.jumpBack) {
          state.jumpBack = true;
        }
        if (joystick.jumpUp) {
          state.jumpUp = true;
        }
      });
    }


    flushJoyDiagFrameDiagnostics() {
      const frameState = this._joyDiagFrameState;
      this._joyDiagFrameState = null;
      if (!frameState) {
        return;
      }
      const orderState = this._joyDiagOrderState || (this._joyDiagOrderState = {});
      const order = frameState.order ? frameState.order.slice() : [];
      const reconcileIndex = order.indexOf('reconcile');
      const firstMovementIndex = order.findIndex((entry) =>
        typeof entry === 'string' && entry.startsWith('updateFighterMovement')
      );
      const reconcileBeforeMovement =
        reconcileIndex !== -1 && (firstMovementIndex === -1 || reconcileIndex < firstMovementIndex);
      const signature = order.length ? order.join('>') : 'none';

      if (this.diagnosticsActive()) {
        if (!orderState.lastSignature || orderState.lastSignature !== signature) {
          orderState.lastSignature = signature;
          orderState.lastFrame = frameState.frame;
          const payload = {
            frame: frameState.frame,
            order,
            reconcileBeforeMovement,
            moveSources: frameState.sources || {},
          };
          const topOnly = this.buildTopOnlyDiagnostics();
          if (topOnly) {
            payload.topOnly = topOnly;
          }
          this.logJoyDiag('controls:order', payload);
        }
        const overrides = frameState.overrideEvents || [];
        const seen = new Set();
        overrides.forEach((event) => {
          if (!event || !event.type) {
            return;
          }
          const key = `${event.type}:${event.stage}`;
          if (seen.has(key)) {
            return;
          }
          seen.add(key);
          this.logJoyDiag('controls:override', {
            frame: frameState.frame,
            ...event,
          });
        });
      }
    }

    buildTopOnlyDiagnostics() {
      const inputPlugin = this.input;
      const manager = inputPlugin && inputPlugin.manager ? inputPlugin.manager : null;
      if (!manager) {
        return null;
      }
      const active = !!manager.topOnly;
      const result = { active };
      if (!active) {
        return result;
      }

      const pointers = manager.pointers || [];
      const camera = this.cameras && this.cameras.main ? this.cameras.main : null;
      const sceneChildren = this.children && this.children.list ? this.children.list : [];
      const pointerDetails = {};
      ['p1', 'p2'].forEach((playerKey) => {
        const joystick = this.virtualJoysticks ? this.virtualJoysticks[playerKey] : null;
        if (!joystick) {
          return;
        }
        const pointerId =
          typeof joystick.pointerId === 'number' || typeof joystick.pointerId === 'string'
            ? joystick.pointerId
            : null;
        if (pointerId === null) {
          return;
        }
        const pointer = pointers.find((ptr) => ptr && ptr.id === pointerId);
        if (!pointer) {
          pointerDetails[playerKey] = {
            pointerId,
            joystickIsTop: null,
          };
          return;
        }
        const hitTest =
          typeof manager.hitTest === 'function'
            ? manager.hitTest(pointer, sceneChildren, camera)
            : null;
        const topObject = Array.isArray(hitTest) && hitTest.length > 0 ? hitTest[0] : null;
        let joystickIsTop = false;
        if (topObject) {
          if (topObject === joystick) {
            joystickIsTop = true;
          } else if (topObject.parentContainer) {
            let parent = topObject.parentContainer;
            while (parent && !joystickIsTop) {
              if (parent === joystick) {
                joystickIsTop = true;
              }
              parent = parent.parentContainer;
            }
          }
        }
        pointerDetails[playerKey] = {
          pointerId,
          pointerX: typeof pointer.x === 'number' ? pointer.x : null,
          pointerY: typeof pointer.y === 'number' ? pointer.y : null,
          joystickIsTop,
          topObjectType: topObject
            ? topObject.name || topObject.type || (topObject.constructor && topObject.constructor.name)
            : null,
        };
      });

      if (Object.keys(pointerDetails).length > 0) {
        result.pointers = pointerDetails;
      }
      return result;
    }

    createPlayerInputState() {
      return {
        moveX: 0,
        crouch: false,
        jumpUp: false,
        jumpForward: false,
        jumpBack: false,
        punch: false,
        kick: false,
        punchPressed: false,
        kickPressed: false,
      };
    }

    createPointerState() {
      return {
        punch: new Set(),
        kick: new Set(),
      };
    }

    createJoystickSnapshot() {
      return {
        moveX: 0,
        crouch: false,
        jumpUp: false,
        jumpForward: false,
        jumpBack: false,
      };
    }

    getPlayerInput(player) {
      return player === 'p2' ? this.p2Input : this.p1Input;
    }

    updateJoystickSnapshots() {
      ['p1', 'p2'].forEach((player) => {
        const joystick = this.virtualJoysticks[player];
        const snapshot = this.joystickSnapshots[player];
        snapshot.moveX = 0;
        snapshot.crouch = false;
        snapshot.jumpUp = false;
        snapshot.jumpForward = false;
        snapshot.jumpBack = false;

        const prev = this.joystickPrevDirections[player];
        if (!joystick || !joystick.isEnabled()) {
          prev.up = false;
          prev.forward = false;
          prev.back = false;
          return;
        }

        const vector = joystick.getVector();
        if (!joystick.isActive()) {
          prev.up = false;
          prev.forward = false;
          prev.back = false;
          return;
        }

        const maxComponent = Math.max(Math.abs(vector.x), Math.abs(vector.y));
        const normalizedX = maxComponent > 0 ? vector.x / maxComponent : 0;
        snapshot.moveX = Phaser.Math.Clamp(normalizedX * vector.magnitude, -1, 1);

        const crouchActive = vector.y >= JOYSTICK_CROUCH_THRESHOLD;
        snapshot.crouch = crouchActive;

        const upActive = vector.y <= -JOYSTICK_JUMP_THRESHOLD;
        const forwardActive = upActive && vector.x >= JOYSTICK_JUMP_HORIZONTAL_THRESHOLD;
        const backActive = upActive && vector.x <= -JOYSTICK_JUMP_HORIZONTAL_THRESHOLD;

        if (forwardActive && !prev.forward) {
          snapshot.jumpForward = true;
        } else if (backActive && !prev.back) {
          snapshot.jumpBack = true;
        } else if (upActive && !prev.up && !forwardActive && !backActive) {
          snapshot.jumpUp = true;
        }

        prev.up = upActive;
        prev.forward = forwardActive;
        prev.back = backActive;
      });

      this.runJoyTestSimulation();
    }

    determineKeyboardMoveX(player) {
      const states = this.keyboardHoldStates[player];
      if (!states) {
        return 0;
      }
      const left = !!states.left;
      const right = !!states.right;
      if (left === right) {
        return 0;
      }
      return right ? 1 : -1;
    }

    handleKeyboardJump(player) {
      const queue = this.keyboardJumpQueue[player];
      const holds = this.keyboardHoldStates[player];
      if (!queue || !holds) {
        return;
      }
      const horizontal = holds.right === holds.left ? 0 : holds.right ? 1 : -1;
      if (horizontal > 0) {
        queue.forward = true;
      } else if (horizontal < 0) {
        queue.back = true;
      } else {
        queue.up = true;
      }
      this.detectKeyboard();
    }

    updateFighterMovement(fighter, input, opponent, dt) {
      if (!fighter) {
        return;
      }

      const body = /** @type {Phaser.Physics.Arcade.Body} */ (fighter.body);
      if (!body) {
        return;
      }

      if (opponent) {
        const facingDirection = opponent.x >= fighter.x ? 1 : -1;
        fighter.setFacing(facingDirection);
      }

      const bodyOnFloor =
        body.onFloor && typeof body.onFloor === 'function' ? body.onFloor.call(body) : false;
      const onGround = body.blocked.down || body.touching.down || bodyOnFloor;
      const canControl = !fighter.isAttacking;

      const wantsCrouch = !!(input && input.crouch && onGround && canControl);
      fighter.setCrouching(wantsCrouch);

      let moveInput = 0;
      if (canControl && input) {
        moveInput = Phaser.Math.Clamp(input.moveX || 0, -1, 1);
      }
      if (!canControl) {
        moveInput = 0;
      }

      let targetVelocity = moveInput * SPEED;
      if (fighter.isCrouching) {
        targetVelocity *= CROUCH_SPEED_SCALE;
      }

      const acceleration = onGround
        ? targetVelocity === 0
          ? FRICTION
          : ACCEL
        : AIR_ACCEL;

      let vx = body.velocity.x;
      if (targetVelocity > vx) {
        vx = Math.min(vx + acceleration * dt, targetVelocity);
      } else if (targetVelocity < vx) {
        vx = Math.max(vx - acceleration * dt, targetVelocity);
      } else if (targetVelocity === 0 && onGround) {
        const frictionStep = FRICTION * dt;
        if (vx > frictionStep) {
          vx -= frictionStep;
        } else if (vx < -frictionStep) {
          vx += frictionStep;
        } else {
          vx = 0;
        }
      }

      if (!onGround) {
        vx = Phaser.Math.Clamp(Phaser.Math.Linear(vx, targetVelocity, dt * AIR_DRAG), -MAX_VEL, MAX_VEL);
      }

      body.setVelocityX(Phaser.Math.Clamp(vx, -MAX_VEL, MAX_VEL));

      if (input && canControl) {
        const wantsJumpForward = !!input.jumpForward;
        const wantsJumpBack = !!input.jumpBack;
        const wantsJumpUp = !!input.jumpUp;
        const jumpRequested = wantsJumpForward || wantsJumpBack || wantsJumpUp;
        if (jumpRequested && onGround) {
          if (fighter.isCrouching) {
            fighter.setCrouching(false);
          }
          const horizontalDir = wantsJumpForward ? 1 : wantsJumpBack ? -1 : 0;
          const horizontalVelocity =
            horizontalDir !== 0 ? horizontalDir * JUMP_HORIZONTAL_SPEED : body.velocity.x;
          body.setVelocityY(-JUMP_SPEED);
          if (horizontalDir !== 0) {
            body.setVelocityX(Phaser.Math.Clamp(horizontalVelocity, -MAX_VEL, MAX_VEL));
          }
        }
      }
    }

    spawnFighters() {
      if (!this.physics || !this.physics.world) {
        return;
      }

      if (!this._fighters) {
        this._fighters = [];
      }
      if (this._fighters.length) {
        return;
      }

      const bounds = this.physics.world.bounds;
      if (!bounds || bounds.width <= 0 || bounds.height <= 0) {
        return;
      }

      const safeHalfWidth = 14;
      const safeHalfHeight = 32;
      const groundOffset = Math.max(64, safeHalfHeight + 16);

      const spawnY = Phaser.Math.Clamp(
        bounds.bottom - groundOffset,
        bounds.y + safeHalfHeight,
        bounds.bottom - safeHalfHeight
      );

      const spawnX1 = Phaser.Math.Clamp(
        bounds.x + bounds.width * 0.22,
        bounds.x + safeHalfWidth,
        bounds.right - safeHalfWidth
      );
      const spawnX2 = Phaser.Math.Clamp(
        bounds.x + bounds.width * 0.78,
        bounds.x + safeHalfWidth,
        bounds.right - safeHalfWidth
      );

      const p1 = new Stick(this, spawnX1, spawnY, { facing: 1, color: 0x4cd964 });
      const p2 = new Stick(this, spawnX2, spawnY, { facing: -1, color: 0xff3b30 });

      p1.setFacing(1).setAlpha(1).setVisible(true);
      p2.setFacing(-1).setAlpha(1).setVisible(true);

      this._fighters = [p1, p2];
    }

    registerTouchPrevention() {
      const canvas = this.sys.game.canvas;
      if (canvas) {
        canvas.style.touchAction = 'none';
        canvas.style.webkitUserSelect = 'none';
        canvas.style.userSelect = 'none';
        if (!canvas._preventScrollAttached) {
          canvas.addEventListener('touchstart', preventDefaultScroll, { passive: false });
          canvas.addEventListener('touchmove', preventDefaultScroll, { passive: false });
          canvas._preventScrollAttached = true;
        }
      }
    }

    createTouchControls() {
      this.registerTouchPrevention();
      this.updateTouchControlsVisibility();
    }

    positionTouchButtons() {
      this.mobileControlLayout = null;
    }

    hideLegacyTouchContainers() {
      const hideLegacyDirectionalControl = (control) => {
        if (!control) {
          return;
        }
        const hideSingle = (item) => {
          if (!item) {
            return;
          }
          if (typeof item.setVisible === 'function') {
            item.setVisible(false);
          }
          if (typeof item.setActive === 'function') {
            item.setActive(false);
          }
          if (item.input) {
            item.input.enabled = false;
          }
        };
        if (Array.isArray(control)) {
          control.forEach(hideSingle);
          return;
        }
        hideSingle(control);
        if (typeof control === 'object') {
          hideLegacyDirectionalControl(control.left);
          hideLegacyDirectionalControl(control.right);
          hideLegacyDirectionalControl(control.up);
          hideLegacyDirectionalControl(control.down);
          if (control.container && control.container !== control) {
            hideLegacyDirectionalControl(control.container);
          }
        }
      };
      [
        this.legacyTouchControls,
        this.legacyTouchButtons,
        this.legacyDPad,
        this.legacyDpad,
        this.legacyDpadButtons,
        this.dpad,
        this.dpadContainer,
        this.arrowControls,
        this.arrowButtons,
      ].forEach(hideLegacyDirectionalControl);
    }

    createTouchButton() {
      return null;
    }

    configureButtonInteraction() {}

    handleActionPress(player, key) {
      const state = this.getPlayerInput(player);
      if (!state) {
        return;
      }
      state[key] = true;
      const pressedKey = `${key}Pressed`;
      if (pressedKey in state) {
        state[pressedKey] = true;
      }
    }

    handleKeyboardAction(player, key) {
      this.handleActionPress(player, key);
      this.detectKeyboard();
    }

    updateActionHoldState(player, key) {
      const pointerSet = this.pointerStates[player][key];
      const pointerActive = pointerSet ? pointerSet.size > 0 : false;
      const state = this.getPlayerInput(player);
      if (state) {
        state[key] = pointerActive;
      }
      const buttonGroup = this.touchButtons[player];
      const button = buttonGroup ? buttonGroup[key] : undefined;
      if (button) {
        this.setButtonActive(button, pointerActive);
      }
    }

    resetMomentaryInputFlags() {
      ['p1', 'p2'].forEach((player) => {
        const state = this.getPlayerInput(player);
        if (!state) {
          return;
        }
        state.punchPressed = false;
        state.kickPressed = false;
        state.jumpUp = false;
        state.jumpForward = false;
        state.jumpBack = false;
        const punchSet = this.pointerStates[player].punch;
        if (!(punchSet && punchSet.size > 0)) {
          state.punch = false;
        }
        const kickSet = this.pointerStates[player].kick;
        if (!(kickSet && kickSet.size > 0)) {
          state.kick = false;
        }
        const queue = this.keyboardJumpQueue[player];
        if (queue) {
          queue.up = false;
          queue.forward = false;
          queue.back = false;
        }
      });
    }

    preventPointerDefault(pointer) {
      const event = pointer && (pointer.event || pointer.originalEvent);
      const cancelable = !!(event && event.cancelable !== false);
      const defaultPreventedBefore = !!(event && event.defaultPrevented);
      let preventDefaultCalled = false;
      if (cancelable && event && typeof event.preventDefault === 'function') {
        event.preventDefault();
        preventDefaultCalled = true;
      }
      const defaultPreventedAfter = !!(event && event.defaultPrevented);
      return {
        cancelable,
        preventDefaultCalled,
        defaultPreventedBefore,
        defaultPreventedAfter,
      };
    }

    shouldUseMobileLayout() {
      return false;
    }

    computeMobileLayout() {
      this.mobileControlLayout = null;
      return null;
    }

    registerKeyboardControls() {
      if (!this.input || !this.input.keyboard) {
        return;
      }

      const keyboard = this.input.keyboard;

      const setMoveKeyState = (player, key, isActive) => {
        const keyboardStates = this.keyboardHoldStates[player];
        if (!keyboardStates) {
          return;
        }
        keyboardStates[key] = isActive;
        if (isActive) {
          this.detectKeyboard();
        }
      };

      const setCrouchState = (player, isActive) => {
        const keyboardStates = this.keyboardHoldStates[player];
        if (!keyboardStates) {
          return;
        }
        keyboardStates.crouch = isActive;
        if (isActive) {
          this.detectKeyboard();
        }
      };

      const onP1LeftDown = () => setMoveKeyState('p1', 'left', true);
      const onP1LeftUp = () => setMoveKeyState('p1', 'left', false);
      const onP1RightDown = () => setMoveKeyState('p1', 'right', true);
      const onP1RightUp = () => setMoveKeyState('p1', 'right', false);
      const onP1CrouchDown = () => setCrouchState('p1', true);
      const onP1CrouchUp = () => setCrouchState('p1', false);
      const onP1JumpDown = () => this.handleKeyboardJump('p1');

      const onP2LeftDown = () => setMoveKeyState('p2', 'left', true);
      const onP2LeftUp = () => setMoveKeyState('p2', 'left', false);
      const onP2RightDown = () => setMoveKeyState('p2', 'right', true);
      const onP2RightUp = () => setMoveKeyState('p2', 'right', false);
      const onP2CrouchDown = () => setCrouchState('p2', true);
      const onP2CrouchUp = () => setCrouchState('p2', false);
      const onP2JumpDown = () => this.handleKeyboardJump('p2');

      const onP1PunchDown = () => this.handleKeyboardAction('p1', 'punch');
      const onP1KickDown = () => this.handleKeyboardAction('p1', 'kick');
      const onP2PunchDown = () => this.handleKeyboardAction('p2', 'punch');
      const onP2KickDown = () => this.handleKeyboardAction('p2', 'kick');

      const keyBindings = [
        ['keydown-A', onP1LeftDown],
        ['keyup-A', onP1LeftUp],
        ['keydown-D', onP1RightDown],
        ['keyup-D', onP1RightUp],
        ['keydown-S', onP1CrouchDown],
        ['keyup-S', onP1CrouchUp],
        ['keydown-W', onP1JumpDown],
        ['keydown-LEFT', onP2LeftDown],
        ['keyup-LEFT', onP2LeftUp],
        ['keydown-RIGHT', onP2RightDown],
        ['keyup-RIGHT', onP2RightUp],
        ['keydown-DOWN', onP2CrouchDown],
        ['keyup-DOWN', onP2CrouchUp],
        ['keydown-UP', onP2JumpDown],
        ['keydown-J', onP1PunchDown],
        ['keydown-K', onP1KickDown],
      ];

      keyBindings.forEach(([eventName, handler]) => {
        keyboard.on(eventName, handler);
      });

      const onAnyKeyDown = (event) => {
        if (event && event.key === '?') {
          this.toggleDebugOverlay();
        }
        this.detectKeyboard();
      };
      keyboard.on('keydown', onAnyKeyDown);

      const registerKeyDown = (code, handler) => {
        const key = keyboard.addKey(code);
        key.on('down', handler);
        return key;
      };

      const p2PunchKeys = [
        Phaser.Input.Keyboard.KeyCodes.ONE,
        Phaser.Input.Keyboard.KeyCodes.NUMPAD_ONE,
      ].map((code) => registerKeyDown(code, onP2PunchDown));
      const p2KickKeys = [
        Phaser.Input.Keyboard.KeyCodes.TWO,
        Phaser.Input.Keyboard.KeyCodes.NUMPAD_TWO,
      ].map((code) => registerKeyDown(code, onP2KickDown));

      this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
        keyBindings.forEach(([eventName, handler]) => {
          keyboard.off(eventName, handler);
        });
        keyboard.off('keydown', onAnyKeyDown);
        p2PunchKeys.forEach((key) => key.off('down', onP2PunchDown));
        p2KickKeys.forEach((key) => key.off('down', onP2KickDown));
      });
    }

    detectKeyboard() {
      if (this._forceJoystick) {
        this.updateTouchControlsVisibility();
        return;
      }
      if (this._forceKeyboard) {
        if (!this._keyboardDetected) {
          this._keyboardDetected = true;
        }
        this.updateTouchControlsVisibility();
        return;
      }
      if (this._keyboardDetected) {
        return;
      }
      this._keyboardDetected = true;
      this.updateTouchControlsVisibility();
    }

    updateTouchControlsVisibility() {
      const visible = !this._keyboardDetected;
      this.touchButtonsList.forEach((button) => {
        if (!button) {
          return;
        }
        if (!visible) {
          this.setButtonActive(button, false);
        }
        button.setVisible(visible);
        if (button.input) {
          button.input.enabled = visible;
        }
      });
      this.joystickList.forEach((joystick) => {
        if (!joystick) {
          return;
        }
        joystick.setVisible(visible);
        joystick.setControlEnabled(visible);
      });
      if (visible || (this.diagnosticsActive() && this._joyDiagModes.joystickOnly)) {
        this.hideLegacyTouchContainers();
      }
    }

    updateSafeAreaInsets() {
      if (typeof window === 'undefined' || !window.getComputedStyle) {
        this.safeAreaInsets = { top: 0, right: 0, bottom: 0, left: 0 };
        this.positionNetDiagOverlay();
        return;
      }
      const root = document.documentElement;
      const styles = window.getComputedStyle(root);
      const parseInset = (prop) => {
        const value = parseFloat(styles.getPropertyValue(prop));
        return Number.isFinite(value) ? value : 0;
      };
      this.safeAreaInsets = {
        top: parseInset('--safe-area-inset-top'),
        right: parseInset('--safe-area-inset-right'),
        bottom: parseInset('--safe-area-inset-bottom'),
        left: parseInset('--safe-area-inset-left'),
      };
      this.positionNetDiagOverlay();
    }

    createDebugOverlay() {
      const text = this.add
        .text(0, 0, '', {
          fontFamily: 'Menlo, Monaco, Consolas, monospace',
          fontSize: '15px',
          color: '#e6f6ff',
          align: 'left',
          backgroundColor: 'rgba(6, 14, 22, 0.75)',
        })
        .setOrigin(0, 0);
      text.setStyle({ stroke: '#0bb4ff', strokeThickness: 1 });
      text.setPadding(10, 8, 14, 10);
      text.setLineSpacing(6);
      text.setScrollFactor(0);
      text.setDepth(40);
      text.setAlpha(1);
      text.setVisible(false);
      this.debugText = text;
      this.positionDebugOverlay();
      this.updateDebugOverlay();
    }

    positionDebugOverlay() {
      if (!this.debugText) {
        return;
      }
      const safeInsets = this.safeAreaInsets || {};
      const topInset = typeof safeInsets.top === 'number' ? safeInsets.top : 0;
      const leftInset = typeof safeInsets.left === 'number' ? safeInsets.left : 0;
      const topOffset = topInset + 12;
      const leftOffset = leftInset + 12;
      this.debugText.setPosition(leftOffset, topOffset);
    }

    updateDebugOverlay() {
      if (!this.debugText) {
        return;
      }
      if (!this.debugOverlayVisible || !this.diagnosticsActive()) {
        this.debugText.setText('');
        this.debugText.setVisible(false);
        return;
      }
      const hudText = this.renderDiagHUD();
      this.debugText.setText(hudText || '');
      this.debugText.setVisible(true);
    }

    createNetDiagOverlay() {
      if (this.netDiagText || !this.add || typeof this.add.text !== 'function') {
        return;
      }
      const text = this.add
        .text(0, 0, '', {
          fontFamily: 'Menlo, Monaco, Consolas, monospace',
          fontSize: '12px',
          color: '#b2f3ff',
          align: 'right',
          backgroundColor: 'rgba(6, 12, 20, 0.72)',
        })
        .setOrigin(1, 0)
        .setScrollFactor(0)
        .setDepth(52);
      text.setPadding(8, 6, 10, 6);
      if (typeof text.setStroke === 'function') {
        text.setStroke('#0bb4ff', 1);
      }
      text.setVisible(false);
      this.netDiagText = text;
      this.positionNetDiagOverlay();
    }

    positionNetDiagOverlay() {
      if (!this.netDiagText) {
        return;
      }
      const safeInsets = this.safeAreaInsets || {};
      const topInset = typeof safeInsets.top === 'number' ? safeInsets.top : 0;
      const rightInset = typeof safeInsets.right === 'number' ? safeInsets.right : 0;
      const topOffset = topInset + 12;
      const rightOffset = rightInset + 12;
      let width = 0;
      if (this.scale && this.scale.gameSize) {
        width = this.scale.gameSize.width || 0;
      } else if (typeof window !== 'undefined') {
        width = window.innerWidth || 0;
      }
      const x = Math.max(width - rightOffset, 0);
      this.netDiagText.setPosition(x, topOffset);
    }

    updateNetDiagOverlay(diag) {
      this._netDiagLast = diag || null;
      if (!diag || !diag.visible) {
        if (this.netDiagText) {
          this.netDiagText.setText('');
          this.netDiagText.setVisible(false);
        }
        return;
      }
      if (!this.netDiagText) {
        this.createNetDiagOverlay();
      }
      if (!this.netDiagText) {
        return;
      }
      const formatAge = (value) => {
        if (!Number.isFinite(value)) {
          return '—';
        }
        if (value < 1) {
          return '<1ms';
        }
        if (value >= 1000) {
          const seconds = value / 1000;
          return `${Math.round(seconds * 100) / 100}s`;
        }
        return `${Math.round(value)}ms`;
      };
      const roleLabel = diag.role ? String(diag.role).toUpperCase() : 'SOLO';
      const peers = Number.isFinite(diag.peers) ? diag.peers : 0;
      const inputAge = formatAge(diag.inputAgeMs);
      const stateAge = formatAge(diag.stateAgeMs);
      const lines = [`Role: ${roleLabel}`, `Peers: ${peers}`, `Input: ${inputAge}`, `State: ${stateAge}`];
      this.netDiagText.setText(lines.join('\n'));
      this.netDiagText.setVisible(true);
      this.positionNetDiagOverlay();
    }

    destroyNetDiagOverlay() {
      if (this.netDiagText) {
        this.netDiagText.destroy();
        this.netDiagText = null;
      }
    }

    renderRemotePlayers(players, options = {}) {
      const list = Array.isArray(players) ? players : [];
      if (!this.remotePlayerLabels) {
        this.remotePlayerLabels = new Map();
      }
      if (!this.remoteFighters) {
        this.remoteFighters = new Map();
      }
      if (!this.remoteControlledSlots) {
        this.remoteControlledSlots = new Set();
      }
      if (options && options.playArea) {
        this.applyRemotePlayArea(options.playArea);
      }

      const activeRemoteSlots = new Set();
      const seen = new Set();
      list.forEach((player) => {
        if (!player || !player.id) {
          return;
        }
        seen.add(player.id);
        const slot = typeof player.slot === 'string' ? player.slot : null;
        if (slot) {
          activeRemoteSlots.add(slot);
        }
        this.updateRemotePlayerActor(player);

        let label = this.remotePlayerLabels.get(player.id);
        if (!label) {
          if (!this.add || typeof this.add.text !== 'function') {
            return;
          }
          label = this.add
            .text(0, 0, '', {
              fontFamily: 'Inter, "Segoe UI", sans-serif',
              fontSize: '14px',
              color: '#f6fbff',
              align: 'center',
              backgroundColor: 'rgba(6, 12, 20, 0.5)',
            })
            .setOrigin(0.5, 1)
            .setDepth(31);
          this.remotePlayerLabels.set(player.id, label);
        }
        const name = typeof player.name === 'string' && player.name.trim() ? player.name.trim() : 'Player';
        label.setText(name);
        const x = Number.isFinite(player.x) ? player.x : 0;
        const y = Number.isFinite(player.y) ? player.y : 0;
        label.setPosition(x, y - 46);
        label.setVisible(true);
      });

      this.remotePlayerLabels.forEach((label, id) => {
        if (!seen.has(id)) {
          label.setVisible(false);
        }
      });

      this.remoteFighters.forEach((fighter, id) => {
        if (!seen.has(id) && fighter) {
          fighter.setVisible(false);
        }
      });

      if (this.remoteControlledSlots) {
        this.remoteControlledSlots.forEach((slot) => {
          if (!activeRemoteSlots.has(slot)) {
            this.releaseRemoteControlledSlot(slot);
          }
        });
        this.remoteControlledSlots = activeRemoteSlots;
      } else {
        this.remoteControlledSlots = activeRemoteSlots;
      }
    }

    updateRemotePlayerActor(player) {
      if (!player || !player.id) {
        return;
      }
      const slot = typeof player.slot === 'string' ? player.slot : null;
      const fighter = this.getFighterForSlot(slot);
      if (fighter) {
        this.markFighterAsRemoteControlled(fighter, slot);
        this.writeSnapshotToFighter(fighter, player);
        return;
      }

      let ghost = this.remoteFighters.get(player.id);
      if (!ghost || !ghost.scene) {
        ghost = this.createRemoteGhostFighter(player);
        if (!ghost) {
          return;
        }
        this.remoteFighters.set(player.id, ghost);
      }
      this.writeSnapshotToFighter(ghost, player);
    }

    getFighterForSlot(slot) {
      if (!slot) {
        return null;
      }
      const fighters = Array.isArray(this._fighters) ? this._fighters : [];
      if (slot === 'p1') {
        return fighters[0] || null;
      }
      if (slot === 'p2') {
        return fighters[1] || null;
      }
      return null;
    }

    markFighterAsRemoteControlled(fighter, slot) {
      if (!fighter) {
        return;
      }
      if (this.remoteControlledSlots) {
        this.remoteControlledSlots.add(slot);
      }
      fighter.isRemoteReplica = true;
      const body = fighter.body ? /** @type {Phaser.Physics.Arcade.Body} */ (fighter.body) : null;
      if (body) {
        body.enable = false;
        if (typeof body.setAllowGravity === 'function') {
          body.setAllowGravity(false);
        } else {
          body.allowGravity = false;
        }
        body.moves = false;
        if (typeof body.setVelocity === 'function') {
          body.setVelocity(0, 0);
        }
      }
    }

    releaseRemoteControlledSlot(slot) {
      if (!slot) {
        return;
      }
      const fighter = this.getFighterForSlot(slot);
      if (!fighter) {
        return;
      }
      fighter.isRemoteReplica = false;
      const body = fighter.body ? /** @type {Phaser.Physics.Arcade.Body} */ (fighter.body) : null;
      if (body) {
        body.enable = true;
        if (typeof body.setAllowGravity === 'function') {
          body.setAllowGravity(true);
        } else {
          body.allowGravity = true;
        }
        body.moves = true;
      }
    }

    createRemoteGhostFighter(player) {
      if (!this.add) {
        return null;
      }
      const slot = typeof player.slot === 'string' ? player.slot : null;
      const color = slot === 'p2' ? 0xff3b30 : 0x4cd964;
      const ghost = new Stick(this, 0, 0, { facing: 1, color });
      ghost.setDepth(10);
      const body = ghost.body ? /** @type {Phaser.Physics.Arcade.Body} */ (ghost.body) : null;
      if (body) {
        body.enable = false;
        if (typeof body.setAllowGravity === 'function') {
          body.setAllowGravity(false);
        } else {
          body.allowGravity = false;
        }
        body.moves = false;
      }
      return ghost;
    }

    writeSnapshotToFighter(fighter, player) {
      if (!fighter || !player) {
        return;
      }
      const x = Number.isFinite(player.x) ? player.x : fighter.x;
      const y = Number.isFinite(player.y) ? player.y : fighter.y;
      if (typeof fighter.setPosition === 'function') {
        fighter.setPosition(x, y);
      } else {
        fighter.x = x;
        fighter.y = y;
      }
      if (typeof fighter.setFacing === 'function') {
        fighter.setFacing(player.facing === -1 ? -1 : 1);
      }
      if (Number.isFinite(player.hp)) {
        fighter.hp = player.hp;
      }
      if (typeof fighter.setVisible === 'function') {
        fighter.setVisible(true);
      }
      if (typeof fighter.setAlpha === 'function') {
        fighter.setAlpha(1);
      }
    }

    applyRemotePlayArea(playArea) {
      if (!playArea || typeof playArea !== 'object') {
        return;
      }
      const x = Number.isFinite(playArea.x) ? playArea.x : 0;
      const y = Number.isFinite(playArea.y) ? playArea.y : 0;
      const w = Number.isFinite(playArea.w) ? playArea.w : 0;
      const h = Number.isFinite(playArea.h) ? playArea.h : 0;
      this.playArea = { x, y, w, h };
      if (this.physics && this.physics.world) {
        this.physics.world.setBounds(x, y, w, h, true, true, true, true);
      }
      if (this.cameras && this.cameras.main) {
        this.cameras.main.setBounds(x, y, w, h);
      }
      this.updatePlayAreaBorder();
      this.updatePlayAreaDiagnostics(true);
    }

    clearRemotePlayerLabels() {
      if (!this.remotePlayerLabels) {
        return;
      }
      this.remotePlayerLabels.forEach((label) => {
        if (label && typeof label.destroy === 'function') {
          label.destroy();
        }
      });
      this.remotePlayerLabels.clear();
      this.clearRemoteFighters();
      if (this.remoteControlledSlots) {
        this.remoteControlledSlots.forEach((slot) => this.releaseRemoteControlledSlot(slot));
        this.remoteControlledSlots.clear();
      }
    }

    clearRemoteFighters() {
      if (!this.remoteFighters) {
        return;
      }
      this.remoteFighters.forEach((fighter) => {
        if (fighter && typeof fighter.destroy === 'function') {
          fighter.destroy();
        }
      });
      this.remoteFighters.clear();
    }

    clearNetworkMomentaryFlags(slot) {
      const state = this.getPlayerInput(slot);
      if (!state) {
        return;
      }
      state.punchPressed = false;
      state.kickPressed = false;
      state.jumpUp = false;
      state.jumpForward = false;
      state.jumpBack = false;
    }

    getFighterSnapshots() {
      const fighters = Array.isArray(this._fighters) ? this._fighters : [];
      return fighters.map((fighter, index) => {
        const slot = index === 0 ? 'p1' : 'p2';
        if (!fighter) {
          return { slot, x: 0, y: 0, vx: 0, vy: 0, hp: 100, facing: 1, onGround: true };
        }
        const hp = typeof fighter.hp === 'number' && Number.isFinite(fighter.hp) ? fighter.hp : 100;
        const x = typeof fighter.x === 'number' && Number.isFinite(fighter.x) ? fighter.x : 0;
        const y = typeof fighter.y === 'number' && Number.isFinite(fighter.y) ? fighter.y : 0;
        const body = fighter.body ? /** @type {Phaser.Physics.Arcade.Body} */ (fighter.body) : null;
        const velocity = body && body.velocity ? body.velocity : null;
        const vx = velocity && Number.isFinite(velocity.x) ? velocity.x : 0;
        const vy = velocity && Number.isFinite(velocity.y) ? velocity.y : 0;
        const bodyOnFloor =
          body && typeof body.onFloor === 'function' ? body.onFloor.call(body) : false;
        const onGround = !!(
          body &&
          ((body.blocked && body.blocked.down) || (body.touching && body.touching.down) || bodyOnFloor)
        );
        const facing = fighter.facing === -1 ? -1 : 1;
        return { slot, x, y, vx, vy, hp, facing, onGround };
      });
    }

    toggleDebugOverlay(forceState) {
      if (this.diagnosticsActive()) {
        this.debugOverlayVisible = true;
        this.updateDebugOverlay();
        return;
      }
      if (typeof forceState === 'boolean') {
        this.debugOverlayVisible = forceState;
      } else {
        this.debugOverlayVisible = !this.debugOverlayVisible;
      }
      this.updateDebugOverlay();
    }
  }

  const determineRendererType = () => {
    if (typeof window === 'undefined' || !window.location) {
      return Phaser.AUTO;
    }
    try {
      const params = new URLSearchParams(window.location.search || '');
      return params.get('forceCanvas') === '1' ? Phaser.CANVAS : Phaser.AUTO;
    } catch (error) {
      return Phaser.AUTO;
    }
  };

  const scaleConfig = {
    mode: Phaser.Scale.RESIZE,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  };
  if (!NO_FULLSCREEN) {
    scaleConfig.fullscreenTarget = 'game-root';
  }

  const config = {
    type: determineRendererType(),
    parent: 'game-root',
    backgroundColor: '#111',
    physics: {
      default: 'arcade',
      arcade: {
        gravity: { y: GRAVITY_Y },
        debug: false,
      },
    },
    scale: scaleConfig,
    scene: [MainScene],
  };

  Boot.milestone('phaser-configured');

  const startGame = () =>
    Boot.guard('game-start', () => {
      Boot.milestone('dom-ready');
      const game = new Phaser.Game(config);
      Boot.milestone('phaser-created');

      const resizeHandler = () => {
        if (!game || !game.scale) {
          return;
        }
        game.scale.resize(window.innerWidth, window.innerHeight);
      };

      window.addEventListener('resize', resizeHandler);
      Boot.milestone('resize-hooked');

      Boot.milestone('boot-complete');
      Boot.ready('Running');
      return game;
    });

  const runWhenReady = () => {
    startGame();
  };

  Boot.milestone('dom-listener');
  if (typeof document !== 'undefined' && document && document.readyState) {
    if (document.readyState === 'complete' || document.readyState === 'interactive') {
      runWhenReady();
    } else {
      window.addEventListener('load', runWhenReady, { once: true });
    }
  } else {
    window.addEventListener('load', runWhenReady, { once: true });
  }
})();
