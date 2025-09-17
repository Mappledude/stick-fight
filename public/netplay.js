(function (global) {
  'use strict';

  const PROTOCOL_VERSION = 1;
  const INPUT_SEND_INTERVAL_MS = 50;
  const STATE_SEND_INTERVAL_MS = 150;
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
    connections: new Map(),
    peerInputs: {},
    remotePlayers: [],
    lastInputSentAt: null,
    lastInputReceivedAt: null,
    lastStateBroadcastAt: null,
    lastStateReceivedAt: null,
    diagTimer: null,
    unsubPlayers: null,
    guestSessionUnsub: null,
    guestCandidateUnsub: null,
    stateBroadcastTimer: null,
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
  }

  function removePlayerFromDirectory(peerId) {
    if (typeof peerId !== 'string') {
      return;
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
      if (runtime.lastStateReceivedAt) {
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
          const peerId = doc.id;
          const data = doc.data() || {};
          const name = data.name || 'Player';
          if (change.type === 'removed') {
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
          updatePlayerDirectory(peerId, name);
          if (runtime.role === 'host' && peerId !== runtime.localPeerId) {
            ensureHostConnection(peerId);
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
          if (!runtime.slotAssignments.p1 && data.isHost) {
            runtime.slotAssignments.p1 = peerId;
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
      updateDiagnosticsOverlay();
    };
  }

  function startHostRuntime() {
    if (runtime.stateBroadcastTimer) {
      return;
    }
    runtime.stateBroadcastTimer = setInterval(broadcastHostState, STATE_SEND_INTERVAL_MS);
  }

  function buildStateSnapshot() {
    if (!runtime.scene || typeof runtime.scene.getFighterSnapshots !== 'function') {
      return [];
    }
    const fighters = runtime.scene.getFighterSnapshots();
    if (!Array.isArray(fighters)) {
      return [];
    }
    return fighters
      .map((fighter) => {
        if (!fighter || !fighter.slot) {
          return null;
        }
        const peerId = runtime.slotAssignments[fighter.slot];
        if (!peerId) {
          return null;
        }
        return {
          id: peerId,
          name: getPlayerName(peerId),
          x: Number.isFinite(fighter.x) ? fighter.x : 0,
          y: Number.isFinite(fighter.y) ? fighter.y : 0,
          hp: Number.isFinite(fighter.hp) ? fighter.hp : 100,
        };
      })
      .filter(Boolean);
  }

  function broadcastHostState() {
    const players = buildStateSnapshot();
    if (!players.length) {
      return;
    }
    const now = nowMs();
    const message = { t: Math.floor(Date.now()), players };
    const serialized = serializeJSON(message);
    if (!serialized) {
      return;
    }
    let sentCount = 0;
    runtime.connections.forEach((connection) => {
      if (!connection || !connection.stateChannel) {
        return;
      }
      if (connection.stateChannel.readyState !== 'open') {
        return;
      }
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
    }
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
      runtime.remotePlayers = payload.players.filter((player) => player && player.id !== runtime.localPeerId);
      const now = nowMs();
      runtime.lastStateReceivedAt = now;
      connection.statePacketsWindow += 1;
      connection.lastStateReceivedAt = now;
      if (runtime.scene && typeof runtime.scene.renderRemotePlayers === 'function') {
        runtime.scene.renderRemotePlayers(runtime.remotePlayers);
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
    runtime.remotePlayers = [];
    runtime.peerInputs = {};
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
