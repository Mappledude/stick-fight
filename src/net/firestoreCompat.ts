const FIRESTORE_PATH_PREFIX = 'rooms';

export type FirestoreNamespace = {
  firestore?: () => FirestoreCompat;
};

export type FirestoreCompat = {
  doc: (path: string) => FirestoreDocRef;
  collection: (path: string) => FirestoreCollectionRef;
};

export type FirestoreDocRef = {
  set: (data: Record<string, unknown>, options?: Record<string, unknown>) => Promise<unknown>;
  update: (data: Record<string, unknown>) => Promise<unknown>;
  delete: () => Promise<unknown>;
  onSnapshot?: (...args: unknown[]) => unknown;
};

export type FirestoreCollectionRef = {
  doc: (id: string) => FirestoreDocRef;
  onSnapshot: (callback: (...args: unknown[]) => unknown) => () => void;
  where?: (...args: unknown[]) => unknown;
};

function getFirebaseNamespace(): FirestoreNamespace {
  if (typeof window === 'undefined') {
    throw new Error('Firestore SDK is not available in this environment.');
  }
  const firebase = (window as Record<string, unknown>).firebase as FirestoreNamespace | undefined;
  if (!firebase || typeof firebase.firestore !== 'function') {
    throw new Error('Firestore SDK failed to load.');
  }
  return firebase;
}

export function getFirestore(): FirestoreCompat {
  const firebase = getFirebaseNamespace();
  const firestoreFactory = firebase.firestore;
  if (typeof firestoreFactory !== 'function') {
    throw new Error('Firestore SDK is not available.');
  }
  return firestoreFactory();
}

export function getServerTimestamp(): unknown {
  const firebase = getFirebaseNamespace();
  const namespace = firebase.firestore as unknown as { FieldValue?: { serverTimestamp?: () => unknown } };
  const serverTimestampFn = namespace && namespace.FieldValue && namespace.FieldValue.serverTimestamp;
  if (typeof serverTimestampFn === 'function') {
    return serverTimestampFn();
  }
  return new Date();
}

export function getPlayersCollection(roomCode: string): FirestoreCollectionRef {
  const firestore = getFirestore();
  if (typeof firestore.collection === 'function') {
    const roomsCollection = firestore.collection(FIRESTORE_PATH_PREFIX);
    if (roomsCollection && typeof roomsCollection.doc === 'function') {
      const roomRef = roomsCollection.doc(roomCode);
      if (roomRef && typeof roomRef.collection === 'function') {
        return roomRef.collection('players') as unknown as FirestoreCollectionRef;
      }
    }
  }
  throw new Error('Failed to access players collection.');
}

export function getPlayerDoc(roomCode: string, uid: string): FirestoreDocRef {
  const firestore = getFirestore();
  if (typeof firestore.doc === 'function') {
    return firestore.doc(`${FIRESTORE_PATH_PREFIX}/${roomCode}/players/${uid}`);
  }
  const players = getPlayersCollection(roomCode);
  if (players && typeof players.doc === 'function') {
    return players.doc(uid);
  }
  throw new Error('Firestore API does not support document access.');
}
