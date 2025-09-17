(function (global) {
  'use strict';

  const PROTOCOL_VERSION = 1;
  const INPUT_SEND_INTERVAL_MS = 50;
  const STATE_SEND_INTERVAL_MS = 120;
  const FALLBACK_STATE_MIN_INTERVAL_MS = 200;
  const INPUT_STALE_MS = 1500;
  const DIAG_UPDATE_INTERVAL_MS = 250;
  const RATE_LOG_INTERVAL_MS = 5000;
  const ICE_SERVER_CONFIG = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };

  const runtime = {
    started: false,
    diagnosticsEnabled: detectDiagnosticsFlag(),
    firestore: null,
    roomRef: null,
    role: 'solo',
    localPeerId: null,
    playerName: '',
    roomId: null,
    scene: null,
    localSlot: 'p1',
    slotAssignments: {},
    playerDirectory: {},
    playerPeerIdsByUid: {},
    connections: new Map(),
    peerInputs: {},
    remotePlayers: [],
    tick: 0,
// Netplay runtime fields (merged)
this.registry = (typeof this.registry !== 'undefined') ? this.registry : null;        // from main
this.remotePlayArea = (typeof this.remotePlayArea !== 'undefined') ? this.remotePlayArea : null;  // from 4d

    lastInputSentAt: null,
    lastInputReceivedAt: null,
    lastStateBroadcastAt: null,
    lastStateReceivedAt: null,
    lastStateTimestamp: null,
    lastStateTick: null,
    lastSnapshotLatencyMs: null,
    diagTimer: null,
    unsubPlayers: null,
    guestSessionUnsub: null,
    guestCandidateUnsub: null,
    stateBroadcastTimer: null,
    serverStepTimer: null,
    hostTick: 0,
    lastFallbackStateWriteAt: null,
  };

  function detectDiagnosticsFlag() {
    if (typeof window === 'undefined' || !window.location) {
      return false;
    }
    try {
      const params = new URLSearchParams(window.location.search || '');
      const value = params.get('netdiag');
      if (!value) {
        return false;
      }
      const normalized = value.trim().toLowerCase();
      return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
    } catch (error) {
      return false;
    }
  }

  function nowMs() {
    return typeof performance !== 'undefined' && typeof performance.now === 'function'
      ? performance.now()
      : Date.now();
  }

  function clamp(value, min, max) {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      return min;
    }
    if (value < min) {
      return min;
    }
    if (value > max) {
      return max;
    }
    return value;
  }

  const SERVER_FIXED_STEP_DT = 1 / 60;
  const SERVER_FIXED_STEP_MS = 1000 / 60;

  function getHostServerModule() {
    const server = global.StickFightHostServer;
    if (!server || typeof server.createRegistry !== 'function') {
      return null;
    }
    return server;
  }

  function determinePlayRect() {
    const scene = runtime.scene;
    if (!scene || !scene.playArea) {
      return null;
    }
    const play = scene.playArea;
    const width = Number(play.w !== undefined ? play.w : play.width);
    const height = Number(play.h !== undefined ? play.h : play.height);
    if (!Number.isFinite(width) || !Number.isFinite(height)) {
      return null;
    }
    const x = Number(play.x);
    const y = Number(play.y);
    return {
      x: Number.isFinite(x) ? x : 0,
      y: Number.isFinite(y) ? y : 0,
      width,
      height,
    };
  }

  function getSlotForPeer(peerId) {
    if (!peerId || !runtime.slotAssignments) {
      return null;
    }
    const entries = Object.keys(runtime.slotAssignments);
    for (let i = 0; i < entries.length; i += 1) {
      const slot = entries[i];
      if (runtime.slotAssignments[slot] === peerId) {
        return slot;
      }
    }
    return null;
  }

  function ensureHostRegistry() {
    if (runtime.role !== 'host') {
      return null;
    }
    const server = getHostServerModule();
    if (!server) {
      return null;
    }
    if (!runtime.registry || typeof runtime.registry.ensurePlayer !== 'function') {
      const playRect = determinePlayRect();
      runtime.registry = server.createRegistry(playRect ? { playRect } : {});
    }
    if (runtime.registry && typeof runtime.registry.setPlayRect === 'function') {
      const playRect = determinePlayRect();
      if (playRect) {
        runtime.registry.setPlayRect(playRect);
      }
    }
    return runtime.registry;
  }

  function ensureHostServerPlayer(peerId) {
    if (!peerId || runtime.role !== 'host') {
      return;
    }
    const registry = ensureHostRegistry();
    if (!registry || typeof registry.ensurePlayer !== 'function') {
      return;
    }
    registry.ensurePlayer(peerId, { slot: getSlotForPeer(peerId), name: getPlayerName(peerId) });
  }

  function updateRegistryPlayerName(peerId, name) {
    if (!peerId || runtime.role !== 'host') {
      return;
    }
    const registry = ensureHostRegistry();
    if (!registry || typeof registry.ensurePlayer !== 'function') {
      return;
    }
    registry.ensurePlayer(peerId, { slot: getSlotForPeer(peerId), name });
  }

  function normalizePeerInput(payload) {
    if (!payload || typeof payload !== 'object') {
      return { mx: 0, ju: 0 };
    }
    const move = clamp(Number(payload.mx !== undefined ? payload.mx : payload.moveX) || 0, -1, 1);
    let jump = Number(payload.ju);
    if (!Number.isFinite(jump)) {
      jump = 0;
    }
    if (jump > 1) {
      jump = 1;
    } else if (jump < -1) {
      jump = -1;
    } else {
      jump = Math.trunc(jump);
    }
    return { mx: move, ju: jump };
  }

  function readLocalInput() {
    if (!runtime.scene || typeof runtime.scene.getPlayerInput !== 'function') {
      return { mx: 0, ju: 0 };
    }
    const state = runtime.scene.getPlayerInput(runtime.localSlot);
    if (!state) {
      return { mx: 0, ju: 0 };
    }
    const move = clamp(Number(state.moveX) || 0, -1, 1);
    let jumpDir = 0;
    if (state.jumpForward) {
      jumpDir = 1;
    } else if (state.jumpBack) {
      jumpDir = -1;
    }
    return { mx: move, ju: jumpDir };
  }

  function stepHostServer(dtOverride) {
    if (runtime.role !== 'host') {
      return;
    }
    const registry = ensureHostRegistry();
    if (!registry || typeof registry.fixedStep !== 'function') {
      return;
    }
    const dt = Number.isFinite(dtOverride) && dtOverride > 0 ? dtOverride : SERVER_FIXED_STEP_DT;

    const localPeerId = runtime.localPeerId;
    if (localPeerId) {
      ensureHostServerPlayer(localPeerId);
      registry.setInput(localPeerId, readLocalInput());
    }

    runtime.connections.forEach((connection, peerId) => {
      if (!peerId) {
        return;
      }
      ensureHostServerPlayer(peerId);
      const entry = runtime.peerInputs[peerId];
      if (entry && entry.payload && entry.payload.p) {
        registry.setInput(peerId, normalizePeerInput(entry.payload.p));
      }
    });

    registry.fixedStep(dt);

// Host authoritative tick (uint32 wrap). Guests mirror this from snapshots.
runtime.hostTick = ((runtime.hostTick ?? 0) + 1) >>> 0;

// Back-compat alias: keep runtime.tick in sync for any legacy reads.
runtime.tick = runtime.hostTick;

    const snapshot = registry.getPlayers();
    runtime.remotePlayers = snapshot
      .filter((player) => player && player.id !== runtime.localPeerId)
      .map((player) => ({
        id: player.id,
        name: getPlayerName(player.id),
        x: player.x,
        y: player.y,
        facing: player.facing,
      }));

    if (runtime.scene && typeof runtime.scene.renderRemotePlayers === 'function') {
      runtime.scene.renderRemotePlayers(runtime.remotePlayers);
    }
  }

  function getStickFightNet() {
    const net = global.StickFightNet;
    if (!net || typeof net.ensureFirestore !== 'function') {
      return null;
    }
    return net;
  }

  function ensureFirestore() {
    try {
      const net = getStickFightNet();
      return net ? net.ensureFirestore() : null;
    } catch (error) {
      console.error('[Net] Failed to initialize Firestore', error);
      return null;
    }
  }

  function updatePlayerDirectory(peerId, name) {
    const safeId = typeof peerId === 'string' ? peerId : null;
    if (!safeId) {
      return;
    }
    const resolvedName = typeof name === 'string' && name.trim() ? name.trim() : 'Player';
    runtime.playerDirectory[safeId] = { name: resolvedName };
    if (runtime.role === 'host') {
      updateRegistryPlayerName(safeId, resolvedName);
    }
  }

  function removePlayerFromDirectory(peerId) {
    if (typeof peerId !== 'string') {
      return;
    }
    if (runtime.role === 'host' && runtime.registry && typeof runtime.registry.removePlayer === 'function') {
      if (peerId !== runtime.localPeerId) {
        runtime.registry.removePlayer(peerId);
      }
    }
    delete runtime.playerDirectory[peerId];
  }

  function getPlayerName(peerId) {
    if (typeof peerId !== 'string') {
      return 'Player';
    }
    const entry = runtime.playerDirectory[peerId];
    if (!entry || typeof entry.name !== 'string') {
      return 'Player';
    }
    return entry.name;
  }

  function safeParseJSON(text) {
    try {
      return JSON.parse(text);
    } catch (error) {
      console.warn('[Net] Failed to parse JSON payload', error);
      return null;
    }
  }

  function serializeJSON(value) {
    try {
      return JSON.stringify(value);
    } catch (error) {
      console.warn('[Net] Failed to serialize payload', error, value);
      return null;
    }
  }

  function ensureDiagnosticsTimer() {
    if (runtime.diagTimer) {
      return;
    }
    runtime.diagTimer = setInterval(updateDiagnosticsOverlay, DIAG_UPDATE_INTERVAL_MS);
  }

  function stopDiagnosticsTimer() {
    if (runtime.diagTimer) {
      clearInterval(runtime.diagTimer);
      runtime.diagTimer = null;
    }
  }

  function reportDiagnostics(diag) {
    runtime.lastDiag = diag;
    if (runtime.scene && typeof runtime.scene.updateNetDiagOverlay === 'function') {
      runtime.scene.updateNetDiagOverlay(diag);
    }
  }

  function computePeerCount() {
    let count = 0;
    runtime.connections.forEach((connection) => {
      if (!connection) {
        return;
      }
      const stateOpen = connection.stateChannel && connection.stateChannel.readyState === 'open';
      const inputOpen = connection.inputChannel && connection.inputChannel.readyState === 'open';
      if (stateOpen || inputOpen) {
        count += 1;
      }
    });
    return count;
  }

  function updateDiagnosticsOverlay() {
    const now = nowMs();
    const peers = computePeerCount();
    let inputAge = null;
    let stateAge = null;

    if (runtime.role === 'guest') {
      if (runtime.lastInputSentAt) {
        inputAge = now - runtime.lastInputSentAt;
      }
      if (Number.isFinite(runtime.lastSnapshotLatencyMs)) {
        stateAge = runtime.lastSnapshotLatencyMs;
      } else if (runtime.lastStateReceivedAt) {
        stateAge = now - runtime.lastStateReceivedAt;
      }
    } else if (runtime.role === 'host') {
      if (runtime.lastInputReceivedAt) {
        inputAge = now - runtime.lastInputReceivedAt;
      }
      if (runtime.lastStateBroadcastAt) {
        stateAge = now - runtime.lastStateBroadcastAt;
      }
    }

    const diag = {
      role: runtime.role,
      peers,
      inputAgeMs: Number.isFinite(inputAge) ? Math.max(inputAge, 0) : null,
      stateAgeMs: Number.isFinite(stateAge) ? Math.max(stateAge, 0) : null,
      visible: runtime.diagnosticsEnabled && runtime.started,
    };

    reportDiagnostics(diag);
  }

  function handleLobbyDismissed() {
    if (runtime.started) {
      return;
    }
    const net = getStickFightNet();
    if (!net || !net.state || !net.state.roomId || !net.state.peerId) {
      return;
    }

    runtime.started = true;
    runtime.role = net.state.isHost ? 'host' : 'guest';
    runtime.localPeerId = net.state.peerId;
    runtime.playerName = net.state.playerName || 'Player';
    runtime.roomId = net.state.roomId;
    runtime.localSlot = net.state.isHost ? 'p1' : 'p2';
    runtime.slotAssignments = {};
    runtime.tick = 0;
    runtime.lastStateTick = null;
    if (net.state.isHost) {
      runtime.slotAssignments.p1 = runtime.localPeerId;
    } else {
      runtime.slotAssignments.p2 = runtime.localPeerId;
    }
    updatePlayerDirectory(runtime.localPeerId, runtime.playerName);

    runtime.firestore = ensureFirestore();
    if (!runtime.firestore) {
      return;
    }

    runtime.roomRef = runtime.firestore.collection('rooms').doc(runtime.roomId);
    if (!runtime.roomRef) {
      console.error('[Net] Failed to resolve room reference');
      return;
    }

    watchPlayersCollection();

    if (runtime.role === 'host') {
      startHostRuntime();
    } else {
      startGuestRuntime();
    }

    ensureDiagnosticsTimer();
    updateDiagnosticsOverlay();
  }

  function watchPlayersCollection() {
    if (!runtime.roomRef || runtime.unsubPlayers) {
      return;
    }
    const playersRef = runtime.roomRef.collection('players');
    runtime.unsubPlayers = playersRef.onSnapshot(
      (snapshot) => {
        snapshot.docChanges().forEach((change) => {
          const doc = change.doc;
          if (!doc) {
            return;
          }
          const uid = doc.id;
          const data = (typeof doc.data === 'function' ? doc.data() : {}) || {};
          const peerId = data.peerId || (uid ? runtime.playerPeerIdsByUid[uid] : null);
          if (!peerId) {
            if (change.type === 'removed' && uid && runtime.playerPeerIdsByUid[uid]) {
              const storedPeerId = runtime.playerPeerIdsByUid[uid];
              delete runtime.playerPeerIdsByUid[uid];
              removePlayerFromDirectory(storedPeerId);
              if (runtime.role === 'host') {
                teardownConnection(storedPeerId);
              }
            } else if (change.type !== 'removed') {
              console.warn('[Net] Player document missing peerId', { uid });
            }
            return;
          }
          if (change.type === 'removed') {
            delete runtime.playerPeerIdsByUid[uid];
            removePlayerFromDirectory(peerId);
            if (
              runtime.role === 'host' &&
              runtime.scene &&
              typeof runtime.scene.onNetPeerLeft === 'function'
            ) {
              try {
                runtime.scene.onNetPeerLeft(peerId);
              } catch (err) {
                console.warn('[Net] Failed to notify scene of peer removal', err);
              }
            }
            if (runtime.role === 'host') {
              teardownConnection(peerId);
            }
            return;
          }

          runtime.playerPeerIdsByUid[uid] = peerId;
          const name = data.name || 'Player';
          updatePlayerDirectory(peerId, name);

          if (!runtime.slotAssignments.p1 && data.isHost) {
            runtime.slotAssignments.p1 = peerId;
          }

          if (runtime.role === 'host') {
            ensureHostServerPlayer(peerId);
            if (peerId !== runtime.localPeerId) {
              ensureHostConnection(peerId);
            }
          }

          if (
            change.type === 'added' &&
            runtime.role === 'host' &&
            runtime.scene &&
            typeof runtime.scene.onNetPeerJoined === 'function'
          ) {
            try {
              runtime.scene.onNetPeerJoined(peerId, { isLocal: peerId === runtime.localPeerId });
            } catch (err) {
              console.warn('[Net] Failed to notify scene of peer join', err);
            }
          }
        });
      },
      (error) => {
        console.error('[Net] Players listener error', error);
      }
    );
  }

  function createConnectionRecord(peerId) {
    return {
      peerId,
      pc: null,
      inputChannel: null,
      stateChannel: null,
      seenCandidates: new Set(),
      seenRemoteCandidates: new Set(),
      inputSeq: 0,
      inputSendInterval: null,
      stateSendInterval: null,
      inputPacketsWindow: 0,
      statePacketsWindow: 0,
      lastInputReceivedAt: null,
      lastStateSentAt: null,
      lastStateReceivedAt: null,
      rateTimers: [],
    };
  }

  function clearConnectionRateTimers(connection) {
    if (!connection || !Array.isArray(connection.rateTimers)) {
      return;
    }
    connection.rateTimers.forEach((timer) => clearInterval(timer));
    connection.rateTimers = [];
  }

  function teardownConnection(peerId) {
    const record = runtime.connections.get(peerId);
    if (!record) {
      return;
    }
    if (record.inputSendInterval) {
      clearInterval(record.inputSendInterval);
      record.inputSendInterval = null;
    }
    if (record.stateSendInterval) {
      clearInterval(record.stateSendInterval);
      record.stateSendInterval = null;
    }
    if (record.inputChannel) {
      try {
        record.inputChannel.close();
      } catch (error) {
        // ignore
      }
    }
    if (record.stateChannel) {
      try {
        record.stateChannel.close();
      } catch (error) {
        // ignore
      }
    }
    if (record.pc) {
      try {
        record.pc.close();
      } catch (error) {
        // ignore
      }
    }
    if (record.candidatesUnsub) {
      record.candidatesUnsub();
      record.candidatesUnsub = null;
    }
    if (record.sessionUnsub) {
      record.sessionUnsub();
      record.sessionUnsub = null;
    }
    clearConnectionRateTimers(record);
    runtime.connections.delete(peerId);
    if (runtime.registry && typeof runtime.registry.removePlayer === 'function' && peerId !== runtime.localPeerId) {
      runtime.registry.removePlayer(peerId);
    }
    if (runtime.peerInputs && Object.prototype.hasOwnProperty.call(runtime.peerInputs, peerId)) {
      delete runtime.peerInputs[peerId];
    }
    updateDiagnosticsOverlay();
  }

  function ensureHostConnection(peerId) {
    if (runtime.connections.has(peerId)) {
      return;
    }
    const connection = createConnectionRecord(peerId);
    runtime.connections.set(peerId, connection);
    setupHostPeerConnection(connection).catch((error) => {
      console.error('[Net] Host connection failed', error);
      teardownConnection(peerId);
    });
  }

  async function setupHostPeerConnection(connection) {
    const peerId = connection.peerId;
    const pc = new RTCPeerConnection(ICE_SERVER_CONFIG);
    connection.pc = pc;

    const stateChannel = pc.createDataChannel('state', { ordered: true });
    connection.stateChannel = stateChannel;

    let hostStateRateTimer = null;
    stateChannel.onopen = () => {
      console.log('[Net] State channel open →', peerId);
      hostStateRateTimer = setInterval(() => {
        if (connection.statePacketsWindow > 0) {
          const rate = connection.statePacketsWindow / (RATE_LOG_INTERVAL_MS / 1000);
          console.log('[Net] Snapshot send rate →', peerId, `${rate.toFixed(2)} pkt/s`);
          connection.statePacketsWindow = 0;
        }
      }, RATE_LOG_INTERVAL_MS);
      connection.rateTimers.push(hostStateRateTimer);
      updateDiagnosticsOverlay();
    };
    stateChannel.onclose = () => {
      console.log('[Net] State channel closed →', peerId);
      if (hostStateRateTimer) {
        clearInterval(hostStateRateTimer);
        connection.rateTimers = connection.rateTimers.filter((timer) => timer !== hostStateRateTimer);
        hostStateRateTimer = null;
      }
      updateDiagnosticsOverlay();
    };
    stateChannel.onerror = (event) => {
      console.warn('[Net] State channel error', event);
    };

    pc.ondatachannel = (event) => {
      const channel = event.channel;
      if (!channel) {
        return;
      }
      if (channel.label === 'input') {
        connection.inputChannel = channel;
        setupHostInputChannel(connection, channel);
      }
    };

    pc.onicecandidate = (event) => {
      if (!event || !event.candidate) {
        return;
      }
      sendIceCandidate(peerId, event.candidate, runtime.localPeerId);
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
        teardownConnection(peerId);
      }
    };

    if (!runtime.slotAssignments.p2) {
      runtime.slotAssignments.p2 = peerId;
    }
    ensureHostServerPlayer(peerId);

    const sessionDoc = runtime.roomRef.collection('webrtc').doc(peerId);
    connection.sessionDoc = sessionDoc;
    connection.sessionUnsub = sessionDoc.onSnapshot(async (doc) => {
      const data = doc.data() || {};
      if (!connection.answerSet && data.answer && data.answer.type && data.answer.sdp) {
        try {
          await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
          connection.answerSet = true;
          console.log('[Net] Host applied answer from', peerId);
        } catch (error) {
          console.error('[Net] Failed to set remote description for', peerId, error);
        }
      }
    });

    connection.candidatesUnsub = sessionDoc
      .collection('candidates')
      .onSnapshot((snapshot) => {
        snapshot.docChanges().forEach((change) => {
          if (change.type !== 'added') {
            return;
          }
          const id = change.doc.id;
          if (connection.seenRemoteCandidates.has(id)) {
            return;
          }
          connection.seenRemoteCandidates.add(id);
          const payload = change.doc.data() || {};
          if (payload.from === runtime.localPeerId) {
            return;
          }
          if (!payload.candidate) {
            return;
          }
          try {
            pc.addIceCandidate(new RTCIceCandidate(payload.candidate));
          } catch (error) {
            console.error('[Net] Failed to add ICE candidate (host)', error);
          }
        });
      });

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    await sessionDoc.set(
      {
        version: PROTOCOL_VERSION,
        from: runtime.localPeerId,
        to: peerId,
        offer: { type: offer.type, sdp: offer.sdp },
        updatedAt: Date.now(),
      },
      { merge: true }
    );

    console.log('[Net] Host created offer for', peerId);
  }

  function setupHostInputChannel(connection, channel) {
    const peerId = connection.peerId;
    channel.onopen = () => {
      console.log('[Net] Input channel open ←', peerId);
      updateDiagnosticsOverlay();
    };
    channel.onclose = () => {
      console.log('[Net] Input channel closed ←', peerId);
      updateDiagnosticsOverlay();
    };
    channel.onerror = (event) => {
      console.warn('[Net] Input channel error', event);
    };
    channel.onmessage = (event) => {
      const payload = typeof event.data === 'string' ? safeParseJSON(event.data) : null;
      if (!payload || typeof payload !== 'object') {
        return;
      }
      if (!payload.p) {
        return;
      }
      const now = nowMs();
      runtime.peerInputs[peerId] = {
        payload,
        receivedAt: now,
        stale: typeof payload.t === 'number' ? now - payload.t > INPUT_STALE_MS : false,
      };
      if (
        runtime.role === 'host' &&
        runtime.scene &&
        typeof runtime.scene.onPeerInput === 'function'
      ) {
        try {
          runtime.scene.onPeerInput(peerId, runtime.peerInputs[peerId]);
        } catch (err) {
          console.warn('[Net] Scene peer input handling failed', err);
        }
      }
      connection.lastInputReceivedAt = now;
      runtime.lastInputReceivedAt = now;
      const moveX = clamp(Number(payload.p.mx) || 0, -1, 1);
      const crouch = !!payload.p.cr;
      const punch = !!payload.p.pu;
      const kick = !!payload.p.ki;
      const jumpDir = typeof payload.p.ju === 'number' ? payload.p.ju : 0;
      console.log(
        '[Net] Input packet',
        peerId,
        JSON.stringify({ mx: moveX, cr: crouch, pu: punch, ki: kick, ju: jumpDir })
      );
      if (runtime.registry && typeof runtime.registry.setInput === 'function') {
        runtime.registry.setInput(peerId, normalizePeerInput(payload.p));
      }
      updateDiagnosticsOverlay();
    };
  }

  function startHostRuntime() {
    ensureHostRegistry();
    ensureHostServerPlayer(runtime.localPeerId);
    runtime.hostTick = 0;
    runtime.lastFallbackStateWriteAt = null;
    if (!runtime.serverStepTimer) {
      const interval = Math.max(1, Math.round(SERVER_FIXED_STEP_MS));
      runtime.serverStepTimer = setInterval(() => stepHostServer(), interval);
    }
    stepHostServer();
    if (runtime.stateBroadcastTimer) {
      return;
    }
    runtime.stateBroadcastTimer = setInterval(broadcastHostState, STATE_SEND_INTERVAL_MS);
  }

  function buildStateSnapshot() {
    const registry = runtime.registry;
    if (!registry || typeof registry.getPlayers !== 'function') {
      return { players: [], play: null };
    }

    const players = registry.getPlayers();
    const sanitizedPlayers = Array.isArray(players)
      ? players
          .map((player) => {
            if (!player || typeof player !== 'object') {
              return null;
            }
            const id = typeof player.id === 'string' ? player.id : null;
            if (!id) {
              return null;
            }
            const slot = typeof player.slot === 'string' && player.slot ? player.slot : getSlotForPeer(id);
            return {
              id,
              slot: typeof slot === 'string' ? slot : null,
              name: typeof player.name === 'string' ? player.name : getPlayerName(id),
              x: Number.isFinite(player.x) ? player.x : 0,
              y: Number.isFinite(player.y) ? player.y : 0,
              vx: Number.isFinite(player.vx) ? player.vx : 0,
              vy: Number.isFinite(player.vy) ? player.vy : 0,
              hp: Number.isFinite(player.hp) ? player.hp : 100,
              facing: player.facing === -1 ? -1 : 1,
              onGround: !!player.onGround,
            };
          })
          .filter(Boolean)
      : [];

    const playRect = registry.playRect;
    const play = playRect && typeof playRect === 'object'
      ? {
          x: Number.isFinite(playRect.x) ? playRect.x : 0,
          y: Number.isFinite(playRect.y) ? playRect.y : 0,
          w: Number.isFinite(playRect.width) ? playRect.width : 0,
          h: Number.isFinite(playRect.height) ? playRect.height : 0,
        }
      : null;
// unified return (sanitized players + tick info)
const hostTick = ((runtime.hostTick ?? runtime.tick ?? 0) >>> 0);
return {
  players: sanitizedPlayers,   // do not leak internal fields
  play,
  // clocks
  hostTick,                    // canonical authoritative tick
  tick: hostTick               // back-compat for older readers
};

  }

  function broadcastHostState() {
    const snapshot = buildStateSnapshot();
    const players = snapshot.players || [];
    if (!players.length) {
      return;
    }
    const now = nowMs();
    const message = { t: Math.floor(Date.now()), tick: runtime.tick, players, play: snapshot.play };
    const serialized = serializeJSON(message);
    if (!serialized) {
      return;
    }
    let sentCount = 0;
    let hasOpenStateChannel = false;
    runtime.connections.forEach((connection) => {
      if (!connection || !connection.stateChannel) {
        return;
      }
      if (connection.stateChannel.readyState !== 'open') {
        return;
      }
      hasOpenStateChannel = true;
      try {
        connection.stateChannel.send(serialized);
        connection.lastStateSentAt = now;
        connection.statePacketsWindow += 1;
        sentCount += 1;
      } catch (error) {
        console.warn('[Net] Failed to send state to', connection.peerId, error);
      }
    });
    if (sentCount > 0) {
      runtime.lastStateBroadcastAt = now;
      return;
    }

    if (hasOpenStateChannel) {
      return;
    }

    maybeWriteFallbackState(snapshot);
  }

  function maybeWriteFallbackState(snapshot) {
    if (runtime.role !== 'host') {
      return;
    }
    if (!runtime.roomRef) {
      return;
    }
    if (!snapshot || typeof snapshot !== 'object') {
      return;
    }
    const now = Date.now();
    if (
      Number.isFinite(runtime.lastFallbackStateWriteAt) &&
      now - runtime.lastFallbackStateWriteAt < FALLBACK_STATE_MIN_INTERVAL_MS
    ) {
      return;
    }

    runtime.lastFallbackStateWriteAt = now;

    const net = getStickFightNet();
    const fieldValue = net && net.state ? net.state.fieldValue : null;
    const updatedAt =
      fieldValue && typeof fieldValue.serverTimestamp === 'function'
        ? fieldValue.serverTimestamp()
        : new Date(now);

    const payload = {
      tick: Number.isFinite(runtime.hostTick) ? runtime.hostTick : 0,
      state: snapshot,
      updatedAt,
    };

    runtime.roomRef
      .set(payload, { merge: true })
      .catch((error) => {
        console.error('[Net] Failed to write fallback state snapshot', error);
        runtime.lastFallbackStateWriteAt = null;
      });
  }

  function sendIceCandidate(docId, candidate, from) {
    if (!runtime.roomRef) {
      return;
    }
    const payload = candidate && typeof candidate.toJSON === 'function' ? candidate.toJSON() : candidate;
    if (!payload) {
      return;
    }
    const ref = runtime.roomRef.collection('webrtc').doc(docId).collection('candidates');
    ref
      .add({
        from,
        candidate: payload,
        createdAt: Date.now(),
      })
      .catch((error) => {
        console.error('[Net] Failed to write ICE candidate', error);
      });
  }

  function startGuestRuntime() {
    const sessionDoc = runtime.roomRef.collection('webrtc').doc(runtime.localPeerId);
    runtime.guestSessionDoc = sessionDoc;

    runtime.guestCandidateUnsub = sessionDoc
      .collection('candidates')
      .onSnapshot((snapshot) => {
        const connection = runtime.connections.get(runtime.hostPeerId);
        snapshot.docChanges().forEach((change) => {
          if (change.type !== 'added') {
            return;
          }
          const id = change.doc.id;
          if (connection && connection.seenRemoteCandidates && connection.seenRemoteCandidates.has(id)) {
            return;
          }
          if (connection && connection.seenRemoteCandidates) {
            connection.seenRemoteCandidates.add(id);
          }
          const payload = change.doc.data() || {};
          if (!payload.candidate || payload.from === runtime.localPeerId) {
            return;
          }
          if (connection && connection.pc) {
            try {
              connection.pc.addIceCandidate(new RTCIceCandidate(payload.candidate));
            } catch (error) {
              console.error('[Net] Guest failed to add ICE candidate', error);
            }
          }
        });
      });

    runtime.guestSessionUnsub = sessionDoc.onSnapshot(async (doc) => {
      const data = doc.data() || {};
      if (data.offer && data.offer.sdp && data.offer.type && !runtime.guestOfferHandled) {
        runtime.guestOfferHandled = true;
        await handleGuestOffer(data);
      }
    });
  }

  async function handleGuestOffer(data) {
    const offer = data.offer;
    const hostPeerId = typeof data.from === 'string' ? data.from : null;
    if (hostPeerId) {
      runtime.hostPeerId = hostPeerId;
      runtime.slotAssignments.p1 = hostPeerId;
    }
    if (!runtime.connections.has(hostPeerId || 'host')) {
      const id = hostPeerId || 'host';
      const connection = createConnectionRecord(id);
      runtime.connections.set(id, connection);
    }
    const peerKey = hostPeerId || 'host';
    const connection = runtime.connections.get(peerKey);
    const pc = new RTCPeerConnection(ICE_SERVER_CONFIG);
    connection.pc = pc;

    const inputChannel = pc.createDataChannel('input', { ordered: true });
    connection.inputChannel = inputChannel;
    setupGuestInputChannel(connection, inputChannel);

    pc.ondatachannel = (event) => {
      const channel = event.channel;
      if (!channel) {
        return;
      }
      if (channel.label === 'state') {
        connection.stateChannel = channel;
        setupGuestStateChannel(connection, channel);
      }
    };

    pc.onicecandidate = (event) => {
      if (!event || !event.candidate) {
        return;
      }
      sendIceCandidate(runtime.localPeerId, event.candidate, runtime.localPeerId);
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
        teardownConnection(peerKey);
      }
    };

    try {
      await pc.setRemoteDescription(new RTCSessionDescription(offer));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      await runtime.guestSessionDoc.set(
        {
          version: PROTOCOL_VERSION,
          answer: { type: answer.type, sdp: answer.sdp },
          updatedAt: Date.now(),
        },
        { merge: true }
      );
      console.log('[Net] Guest answered offer from host');
    } catch (error) {
      console.error('[Net] Guest failed to complete handshake', error);
    }
  }

  function setupGuestInputChannel(connection, channel) {
    let inputRateTimer = null;
    channel.onopen = () => {
      console.log('[Net] Input channel ready → host');
      connection.inputSendInterval = setInterval(() => sendGuestInput(connection), INPUT_SEND_INTERVAL_MS);
      inputRateTimer = setInterval(() => {
        if (connection.inputPacketsWindow > 0) {
          const rate = connection.inputPacketsWindow / (RATE_LOG_INTERVAL_MS / 1000);
          console.log('[Net] Input send rate', rate.toFixed(2), 'pkt/s');
          connection.inputPacketsWindow = 0;
        }
      }, RATE_LOG_INTERVAL_MS);
      connection.rateTimers.push(inputRateTimer);
      updateDiagnosticsOverlay();
    };
    channel.onclose = () => {
      console.log('[Net] Input channel closed → host');
      if (connection.inputSendInterval) {
        clearInterval(connection.inputSendInterval);
        connection.inputSendInterval = null;
      }
      if (inputRateTimer) {
        clearInterval(inputRateTimer);
        connection.rateTimers = connection.rateTimers.filter((timer) => timer !== inputRateTimer);
        inputRateTimer = null;
      }
      updateDiagnosticsOverlay();
    };
    channel.onerror = (event) => {
      console.warn('[Net] Input channel error', event);
    };
  }

  function setupGuestStateChannel(connection, channel) {
    let stateRateTimer = null;
    channel.onopen = () => {
      console.log('[Net] State channel ready ← host');
      stateRateTimer = setInterval(() => {
        if (connection.statePacketsWindow > 0) {
          const rate = connection.statePacketsWindow / (RATE_LOG_INTERVAL_MS / 1000);
          console.log('[Net] State recv rate', rate.toFixed(2), 'pkt/s');
          connection.statePacketsWindow = 0;
        }
      }, RATE_LOG_INTERVAL_MS);
      connection.rateTimers.push(stateRateTimer);
      updateDiagnosticsOverlay();
    };
    channel.onclose = () => {
      console.log('[Net] State channel closed ← host');
      if (stateRateTimer) {
        clearInterval(stateRateTimer);
        connection.rateTimers = connection.rateTimers.filter((timer) => timer !== stateRateTimer);
        stateRateTimer = null;
      }
      updateDiagnosticsOverlay();
    };
    channel.onerror = (event) => {
      console.warn('[Net] State channel error', event);
    };
    channel.onmessage = (event) => {
      const payload = typeof event.data === 'string' ? safeParseJSON(event.data) : null;
      if (!payload || !Array.isArray(payload.players)) {
        return;
      }
      const tickValue = Number.isFinite(payload.tick) ? payload.tick : null;

      const sanitizedPlayers = payload.players
        .map((player) => {
          if (!player || typeof player !== 'object') {
            return null;
          }
          const id = typeof player.id === 'string' ? player.id : null;
          if (!id) {
            return null;
          }
          return {
            id,
            slot: typeof player.slot === 'string' ? player.slot : null,
            name: typeof player.name === 'string' ? player.name : '',
            x: Number.isFinite(player.x) ? player.x : 0,
            y: Number.isFinite(player.y) ? player.y : 0,
            vx: Number.isFinite(player.vx) ? player.vx : 0,
            vy: Number.isFinite(player.vy) ? player.vy : 0,
            hp: Number.isFinite(player.hp) ? player.hp : 100,
            facing: player.facing === -1 ? -1 : 1,
            onGround: !!player.onGround,
          };
        })
        .filter((player) => player && player.id !== runtime.localPeerId);
      runtime.remotePlayers = sanitizedPlayers;
      const now = nowMs();
      runtime.lastStateReceivedAt = now;
      connection.statePacketsWindow += 1;
      connection.lastStateReceivedAt = now;
      const timestamp = typeof payload.t === 'number' ? payload.t : null;
      runtime.lastStateTimestamp = timestamp;
      runtime.lastStateTick = tickValue;
      runtime.lastSnapshotLatencyMs = Number.isFinite(timestamp) ? Math.max(Date.now() - timestamp, 0) : null;
      const playArea = payload.play;
      runtime.remotePlayArea =
        playArea && typeof playArea === 'object'
          ? {
              x: Number.isFinite(playArea.x) ? playArea.x : 0,
              y: Number.isFinite(playArea.y) ? playArea.y : 0,
              w: Number.isFinite(playArea.w) ? playArea.w : 0,
              h: Number.isFinite(playArea.h) ? playArea.h : 0,
            }
          : null;
      if (runtime.scene) {
        if (typeof runtime.scene.applyRemotePlayArea === 'function') {
          runtime.scene.applyRemotePlayArea(runtime.remotePlayArea);
        }
        if (typeof runtime.scene.renderRemotePlayers === 'function') {
          runtime.scene.renderRemotePlayers(runtime.remotePlayers, { playArea: runtime.remotePlayArea });
        }
      }
      updateDiagnosticsOverlay();
    };
  }

  function sendGuestInput(connection) {
    if (!connection || !connection.inputChannel || connection.inputChannel.readyState !== 'open') {
      return;
    }
    if (!runtime.scene || typeof runtime.scene.getPlayerInput !== 'function') {
      return;
    }
    const state = runtime.scene.getPlayerInput(runtime.localSlot);
    if (!state) {
      return;
    }

    const now = nowMs();
    const moveX = clamp(Number(state.moveX) || 0, -1, 1);
    const crouch = !!state.crouch;
    const punch = !!state.punchPressed;
    const kick = !!state.kickPressed;
    let jumpDir = 0;
    if (state.jumpForward) {
      jumpDir = 1;
    } else if (state.jumpBack) {
      jumpDir = -1;
    } else if (state.jumpUp) {
      jumpDir = 0;
    }

    const message = {
      t: Math.floor(Date.now()),
      seq: ++connection.inputSeq,
      p: {
        mx: moveX,
        cr: crouch,
        pu: punch,
        ki: kick,
        ju: jumpDir,
      },
    };

    const serialized = serializeJSON(message);
    if (!serialized) {
      return;
    }
    try {
      connection.inputChannel.send(serialized);
      connection.inputPacketsWindow += 1;
      runtime.lastInputSentAt = now;
      if (typeof runtime.scene.clearNetworkMomentaryFlags === 'function') {
        runtime.scene.clearNetworkMomentaryFlags(runtime.localSlot);
      }
    } catch (error) {
      console.warn('[Net] Failed to send input packet', error);
    }
  }

  function attachScene(scene) {
    if (!scene || runtime.scene === scene) {
      return;
    }
    runtime.scene = scene;
    if (runtime.role === 'host') {
      ensureHostRegistry();
      stepHostServer();
    }
    if (runtime.lastDiag && typeof scene.updateNetDiagOverlay === 'function') {
      scene.updateNetDiagOverlay(runtime.lastDiag);
    }
    if (Array.isArray(runtime.remotePlayers) && typeof scene.renderRemotePlayers === 'function') {
      scene.renderRemotePlayers(runtime.remotePlayers);
    }
    if (scene.events && typeof scene.events.once === 'function') {
      scene.events.once('shutdown', () => {
        if (runtime.scene === scene) {
          runtime.scene = null;
        }
      });
    }
  }

  function detachScene(scene) {
    if (runtime.scene === scene) {
      runtime.scene = null;
    }
  }

  function cleanup() {
    stopDiagnosticsTimer();
    runtime.connections.forEach((connection, peerId) => {
      teardownConnection(peerId);
    });
    runtime.connections.clear();
    if (runtime.unsubPlayers) {
      runtime.unsubPlayers();
      runtime.unsubPlayers = null;
    }
    if (runtime.guestSessionUnsub) {
      runtime.guestSessionUnsub();
      runtime.guestSessionUnsub = null;
    }
    if (runtime.guestCandidateUnsub) {
      runtime.guestCandidateUnsub();
      runtime.guestCandidateUnsub = null;
    }
    if (runtime.stateBroadcastTimer) {
      clearInterval(runtime.stateBroadcastTimer);
      runtime.stateBroadcastTimer = null;
    }
    if (runtime.serverStepTimer) {
      clearInterval(runtime.serverStepTimer);
      runtime.serverStepTimer = null;
    }
    runtime.hostTick = 0;
    runtime.lastFallbackStateWriteAt = null;
    runtime.registry = null;
    runtime.tick = 0;
    runtime.remotePlayers = [];
    runtime.remotePlayArea = null;
    runtime.peerInputs = {};
    runtime.lastStateTimestamp = null;
    runtime.lastStateTick = null;
    runtime.lastSnapshotLatencyMs = null;
    updateDiagnosticsOverlay();
  }

  function init() {
    if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
      window.addEventListener('stickfight:lobbyDismissed', handleLobbyDismissed, { once: false });
    }
    const net = getStickFightNet();
    if (net && net.state && net.state.initialized) {
      setTimeout(handleLobbyDismissed, 0);
    }
  }

  init();

  global.StickFightNetplay = {
    PROTOCOL_VERSION,
    attachScene,
    detachScene,
    cleanup,
    get state() {
      return runtime;
    },
  };
})(typeof window !== 'undefined' ? window : this);
