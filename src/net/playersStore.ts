import { getPlayersCollection } from './firestoreCompat';

export type PlayerPresence = {
  uid: string;
  name?: string;
  color?: string;
  x: number;
  y: number;
  dir: 'L' | 'R';
  ts?: unknown;
};

export type PlayerMap = Map<string, PlayerPresence>;

type SnapshotDoc = {
  id: string;
  data: () => Record<string, unknown> | undefined;
};

type QuerySnapshot = {
  forEach: (callback: (doc: SnapshotDoc) => void) => void;
};

type Unsubscribe = () => void;

type OnSnapshotCallback = (snapshot: QuerySnapshot) => void;

type PlayersCollection = ReturnType<typeof getPlayersCollection> & {
  onSnapshot: (callback: OnSnapshotCallback, onError?: (error: unknown) => void) => Unsubscribe;
};

function normalizePresence(doc: SnapshotDoc): PlayerPresence {
  const data = doc.data() || {};
  const uid = typeof data.uid === 'string' && data.uid.trim() ? data.uid : doc.id;
  const name = typeof data.name === 'string' ? data.name : undefined;
  const color = typeof data.color === 'string' ? data.color : undefined;
  const x = typeof data.x === 'number' ? data.x : 0;
  const y = typeof data.y === 'number' ? data.y : 0;
  const dirValue = data.dir === 'L' || data.dir === 'R' ? data.dir : 'R';
  const presence: PlayerPresence = {
    uid,
    name,
    color,
    x,
    y,
    dir: dirValue,
  };
  if (typeof data.ts !== 'undefined') {
    presence.ts = data.ts;
  }
  return presence;
}

export function watchPlayers(
  roomCode: string,
  selfUid: string,
  onChange: (players: PlayerMap) => void,
): () => void {
  const collection = getPlayersCollection(roomCode) as PlayersCollection;
  const state: {
    cache: PlayerMap;
    sawSelfRemote: boolean;
  } = {
    cache: new Map(),
    sawSelfRemote: false,
  };

  const unsubscribe = collection.onSnapshot(
    (snapshot) => {
      const next: PlayerMap = new Map();
      snapshot.forEach((doc) => {
        const presence = normalizePresence(doc);
        next.set(doc.id, presence);
      });

      const hasSelfRemote = next.has(selfUid);
      if (hasSelfRemote) {
        state.sawSelfRemote = true;
      }

      if (next.size === 0 && !state.sawSelfRemote) {
        const localSelf = state.cache.get(selfUid);
        if (localSelf) {
          next.set(selfUid, localSelf);
        }
      }

      state.cache = next;
      console.log('[players] snapshot', {
        count: next.size,
        hasSelfRemote,
      });
      onChange(new Map(state.cache));
    },
    (error) => {
      console.error('[players] snapshot ERROR', error);
    },
  );

  return () => {
    try {
      unsubscribe();
    } catch (error) {
      // ignore unsubscribe failure
    }
  };
}
