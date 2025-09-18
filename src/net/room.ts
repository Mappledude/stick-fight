import { enterRoom, leaveRoom } from './presence';
import { watchPlayers, type PlayerMap, type PlayerPresence } from './playersStore';
import { attachControls } from './controls';
import { startRenderer } from './renderRoom';

type PresenceHandle = ReturnType<typeof enterRoom> extends Promise<infer R> ? R : never;

export type RoomMountOptions = {
  roomCode: string;
  uid: string;
  canvas: HTMLCanvasElement;
  name?: string;
  color?: string;
  onPlayersChange?: (players: PlayerMap) => void;
};

export type RoomHandle = {
  unmount: () => Promise<void>;
};

export async function mountRoom(options: RoomMountOptions): Promise<RoomHandle> {
  const { roomCode, uid, canvas, name, color, onPlayersChange } = options;
  const playersState: PlayerMap = new Map();
  let selfSprite: PlayerPresence | null = null;

  const notify = () => {
    if (typeof onPlayersChange === 'function') {
      onPlayersChange(new Map(playersState));
    }
  };

  const getPlayers = () => playersState;
  const getPlayer = (id: string) => playersState.get(id);
  const setLocalPos = ({ x, y, dir }: { x: number; y: number; dir: 'L' | 'R' }) => {
    const existing = playersState.get(uid) || selfSprite;
    const base: PlayerPresence = existing || {
      uid,
      name: name || `You-${uid.slice(0, 4)}`,
      color: color || '#37A9FF',
      x,
      y,
      dir,
    };
    const next: PlayerPresence = { ...base, x, y, dir };
    playersState.set(uid, next);
    selfSprite = next;
    notify();
  };

  let presenceHandle: PresenceHandle | null = null;
  let unsubscribe: (() => void) | null = null;
  let detachControls: (() => void) | null = null;
  let stopRenderer: (() => void) | null = null;

  try {
    presenceHandle = await enterRoom(roomCode, uid, { name, color });
    const { payload } = presenceHandle;
    playersState.set(uid, { ...payload });
    selfSprite = { ...payload };
    notify();

    unsubscribe = watchPlayers(roomCode, uid, (map) => {
      map.forEach((value, key) => {
        if (key === uid) {
          const local = playersState.get(uid) || selfSprite;
          const merged = local
            ? { ...value, x: local.x, y: local.y, dir: local.dir }
            : value;
          playersState.set(uid, merged);
          selfSprite = merged;
        } else {
          playersState.set(key, value);
        }
      });

      if (!map.has(uid) && selfSprite) {
        playersState.set(uid, selfSprite);
      }

      Array.from(playersState.keys()).forEach((key) => {
        if (key !== uid && !map.has(key)) {
          playersState.delete(key);
        }
      });

      notify();
    });

    detachControls = attachControls({ roomCode, uid, getPlayer, setLocalPos });
    stopRenderer = startRenderer({ canvas, getPlayers, selfUid: uid });
  } catch (error) {
    if (detachControls) {
      detachControls();
    }
    if (stopRenderer) {
      stopRenderer();
    }
    if (unsubscribe) {
      unsubscribe();
    }
    if (presenceHandle) {
      try {
        await leaveRoom(roomCode, uid, presenceHandle);
      } catch (cleanupError) {
        // ignore cleanup failure
      }
    }
    throw error;
  }

  return {
    unmount: async () => {
      detachControls?.();
      stopRenderer?.();
      unsubscribe?.();
      if (presenceHandle) {
        try {
          await leaveRoom(roomCode, uid, presenceHandle);
        } catch (error) {
          // ignore cleanup failure
        }
      }
    },
  };
}
