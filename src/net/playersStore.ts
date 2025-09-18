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
  onChange: (players: PlayerMap) => void,
): () => void {
  const collection = getPlayersCollection(roomCode) as PlayersCollection;
  const unsubscribe = collection.onSnapshot((snapshot) => {
    const map: PlayerMap = new Map();
    snapshot.forEach((doc) => {
      const presence = normalizePresence(doc);
      map.set(doc.id, presence);
    });
    onChange(map);
  });
  return () => {
    try {
      unsubscribe();
    } catch (error) {
      // ignore unsubscribe failure
    }
  };
}
