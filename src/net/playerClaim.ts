import { getDeviceId, ensureSignedInUser } from '../lib/identity';

type CollectionReference = {
  doc: (path: string) => any;
};

type Firestore = {
  doc?: (path: string) => any;
  collection?: (path: string) => CollectionReference;
  runTransaction: <T>(updateFn: (transaction: any) => Promise<T>) => Promise<T>;
};

type FirestoreNamespace = (() => Firestore) & {
  FieldValue?: { serverTimestamp?: () => any };
};

type FirebaseNamespace = {
  firestore?: FirestoreNamespace;
};

type PlayerDoc = {
  uid: string;
  deviceId: string;
  nick: string;
  joinedAt: unknown;
  lastSeenAt: unknown;
  hp: number;
};

type HeartbeatHandle = {
  stop: () => void;
};

type ClaimResult = {
  uid: string;
  deviceId: string;
  heartbeat: HeartbeatHandle;
};

const HEARTBEAT_MS = 15000;
const ERR_DEVICE_MISMATCH = 'ERR_DEVICE_MISMATCH';

function getFirebase(): FirebaseNamespace | undefined {
  if (typeof window === 'undefined') {
    return undefined;
  }
  const firebase = (window as any).firebase;
  if (firebase && typeof firebase.firestore === 'function') {
    return firebase;
  }
  return undefined;
}

function getFirestore(): Firestore {
  const firebase = getFirebase();
  if (!firebase || typeof firebase.firestore !== 'function') {
    throw new Error('Firestore SDK is not available.');
  }
  return firebase.firestore();
}

function getPlayerRef(firestore: Firestore, roomId: string, uid: string) {
  if (typeof firestore.doc === 'function') {
    return firestore.doc(`rooms/${roomId}/players/${uid}`);
  }
  if (typeof firestore.collection === 'function') {
    const rooms = firestore.collection('rooms');
    const roomRef: any = rooms.doc(roomId);
    const players = roomRef && typeof roomRef.collection === 'function' ? roomRef.collection('players') : null;
    if (players && typeof players.doc === 'function') {
      return players.doc(uid);
    }
  }
  throw new Error('Firestore API does not support document access.');
}

function serverTimestamp() {
  const firebase = getFirebase();
  if (firebase && firebase.firestore && firebase.firestore.FieldValue &&
    typeof firebase.firestore.FieldValue.serverTimestamp === 'function') {
    return firebase.firestore.FieldValue.serverTimestamp();
  }
  return new Date();
}

function createHeartbeat(ref: any): HeartbeatHandle {
  let stopped = false;

  const send = () => {
    if (stopped) {
      return Promise.resolve();
    }
    try {
      return ref.update({ lastSeenAt: serverTimestamp() }).catch(() => undefined);
    } catch (error) {
      return Promise.resolve();
    }
  };

  const intervalId = setInterval(() => {
    send();
  }, HEARTBEAT_MS);

  const cleanupListeners: Array<() => void> = [];

  const stop = () => {
    if (stopped) {
      return;
    }
    stopped = true;
    clearInterval(intervalId);
    send();
    cleanupListeners.forEach((fn) => {
      try {
        fn();
      } catch (error) {
        // ignore cleanup failure
      }
    });
  };

  if (typeof window !== 'undefined') {
    const visibilityHandler = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
        stop();
      }
    };
    window.addEventListener('visibilitychange', visibilityHandler, { passive: true });
    cleanupListeners.push(() => window.removeEventListener('visibilitychange', visibilityHandler));

    const exitHandler = () => stop();
    window.addEventListener('pagehide', exitHandler);
    window.addEventListener('beforeunload', exitHandler);
    cleanupListeners.push(() => {
      window.removeEventListener('pagehide', exitHandler);
      window.removeEventListener('beforeunload', exitHandler);
    });
  }

  return { stop };
}

export async function claimPlayer(roomId: string, nick: string): Promise<ClaimResult> {
  if (!roomId) {
    throw new Error('roomId is required.');
  }
  const { user } = await ensureSignedInUser();
  const deviceId = getDeviceId();
  const firestore = getFirestore();
  const ref = getPlayerRef(firestore, roomId, user.uid);

  await firestore.runTransaction(async (transaction: any) => {
    const snapshot = await transaction.get(ref);
    const existing = snapshot && typeof snapshot.data === 'function' ? snapshot.data() : null;
    if (existing && existing.deviceId && existing.deviceId !== deviceId) {
      const error = new Error(ERR_DEVICE_MISMATCH);
      (error as any).code = ERR_DEVICE_MISMATCH;
      (error as any).uid = user.uid;
      throw error;
    }
    const now = serverTimestamp();
    const payload: PlayerDoc = {
      uid: user.uid,
      deviceId,
      nick,
      joinedAt: existing && existing.joinedAt ? existing.joinedAt : now,
      lastSeenAt: now,
      hp: typeof (existing && existing.hp) === 'number' ? existing.hp : 100,
    };
    transaction.set(ref, payload, { merge: true });
  });

  const heartbeat = createHeartbeat(ref);
  return { uid: user.uid, deviceId, heartbeat };
}

export { ERR_DEVICE_MISMATCH };
export type { HeartbeatHandle, ClaimResult };
