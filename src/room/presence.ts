import type { Player, PlayerMap } from './PlayerTypes';

type FirebaseNamespace = {
  firestore?: () => FirebaseFirestore;
};

type FirebaseFirestore = {
  doc: (path: string) => FirebaseDocRef;
  collection: (path: string) => FirebaseCollectionRef;
};

type FirebaseDocRef = {
  set?: (data: unknown, options?: Record<string, unknown>) => Promise<unknown>;
  update?: (data: unknown) => Promise<unknown>;
  delete?: () => Promise<unknown>;
};

type FirebaseCollectionRef = {
  onSnapshot?: (callback: (snapshot: unknown) => unknown) => () => void;
};

type PresenceOptions = {
  roomCode: string;
  selfUid: string;
  players: PlayerMap;
  getLocalPlayer: () => Player | undefined;
};

type PresenceHandle = {
  updateSelf: (player: Player) => Promise<void>;
  stop: () => void;
};

type SnapshotDoc = {
  id: string;
  data: () => unknown;
};

type QuerySnapshot = {
  empty?: boolean;
  docs?: SnapshotDoc[];
  forEach?: (callback: (doc: SnapshotDoc) => void) => void;
};

function getFirebase(): FirebaseFirestore | null {
  if (typeof window === 'undefined') {
    return null;
  }
  const firebase = (window as unknown as { firebase?: FirebaseNamespace }).firebase;
  if (!firebase || typeof firebase.firestore !== 'function') {
    return null;
  }
  try {
    const firestore = firebase.firestore();
    if (firestore && typeof firestore.doc === 'function' && typeof firestore.collection === 'function') {
      return firestore;
    }
  } catch (error) {
    return null;
  }
  return null;
}

function parsePlayer(uid: string, raw: unknown): Player | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const data = raw as Record<string, unknown>;
  const name = typeof data.name === 'string' ? data.name : '';
  const color = typeof data.color === 'string' ? data.color : '#ffffff';
  const x = typeof data.x === 'number' && Number.isFinite(data.x) ? data.x : 0;
  const y = typeof data.y === 'number' && Number.isFinite(data.y) ? data.y : 0;
  const dirValue = data.dir === 'L' || data.dir === 'R' ? data.dir : 'R';

  return {
    uid,
    name,
    color,
    x,
    y,
    dir: dirValue,
  };
}

function handleSnapshot(
  snapshot: QuerySnapshot,
  options: { players: PlayerMap; selfUid: string },
): void {
  const { players, selfUid } = options;
  const seen = new Set<string>();

  const consumeDoc = (doc: SnapshotDoc) => {
    if (!doc || typeof doc.id !== 'string' || typeof doc.data !== 'function') {
      return;
    }
    const payload = parsePlayer(doc.id, doc.data());
    if (!payload) {
      return;
    }
    seen.add(payload.uid);
    if (payload.uid === selfUid) {
      const local = players.get(selfUid);
      players.set(selfUid, local ?? payload);
      return;
    }
    players.set(payload.uid, payload);
  };

  if (snapshot.forEach) {
    snapshot.forEach(consumeDoc);
  } else if (Array.isArray(snapshot.docs)) {
    for (const doc of snapshot.docs) {
      consumeDoc(doc);
    }
  }

  for (const uid of Array.from(players.keys())) {
    if (uid === selfUid) {
      continue;
    }
    if (!seen.has(uid)) {
      players.delete(uid);
    }
  }
}

const NOOP_HANDLE: PresenceHandle = {
  updateSelf: async () => {
    // no-op when Firebase is unavailable
  },
  stop: () => {
    // nothing to clean up
  },
};

export function startPresence(options: PresenceOptions): PresenceHandle {
  const { roomCode, selfUid, players, getLocalPlayer } = options;
  const firestore = getFirebase();
  if (!firestore) {
    return NOOP_HANDLE;
  }

  const docRef = firestore.doc(`rooms/${roomCode}/players/${selfUid}`) as FirebaseDocRef;
  const collectionRef = firestore.collection(`rooms/${roomCode}/players`) as FirebaseCollectionRef;

  const localPlayer = getLocalPlayer();
  if (localPlayer && typeof docRef.set === 'function') {
    void docRef.set(localPlayer, { merge: true }).catch(() => undefined);
  }

  players.set(selfUid, localPlayer ?? players.get(selfUid) ?? {
    uid: selfUid,
    name: '',
    color: '#ffffff',
    x: 0,
    y: 0,
    dir: 'R',
  });

  let unsubscribe: (() => void) | null = null;
  if (collectionRef && typeof collectionRef.onSnapshot === 'function') {
    unsubscribe = collectionRef.onSnapshot((snapshot: unknown) => {
      if (!snapshot || typeof snapshot !== 'object') {
        return;
      }
      handleSnapshot(snapshot as QuerySnapshot, { players, selfUid });
    });
  }

  const updateSelf = async (player: Player) => {
    players.set(selfUid, player);
    if (docRef && typeof docRef.set === 'function') {
      try {
        await docRef.set(player, { merge: true });
      } catch (error) {
        // best-effort update
      }
    }
  };

  const stop = () => {
    if (unsubscribe) {
      unsubscribe();
      unsubscribe = null;
    }
  };

  return { updateSelf, stop };
}
