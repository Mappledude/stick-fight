import { CANVAS_W, ROOM_PAD, STAGE_Y } from '../constants/room';
import { getPlayerDoc, getServerTimestamp } from './firestoreCompat';

type PresenceOptions = {
  name?: string;
  color?: string;
};

type SpawnPoint = {
  x: number;
  y: number;
  dir: 'L' | 'R';
};

type EnterRoomHandle = {
  ref: ReturnType<typeof getPlayerDoc>;
  cleanup: () => Promise<void>;
  meta: { name: string; color: string; spawn: SpawnPoint };
};

const HEARTBEAT_INTERVAL_MS = 15000;

const DEFAULT_COLORS = ['#37A9FF', '#FF6B6B', '#FFD166', '#06D6A0', '#C792EA', '#FFA500'];

function spawnOnStage(): SpawnPoint {
  const x = ROOM_PAD + Math.random() * (CANVAS_W - 2 * ROOM_PAD);
  return {
    x: Math.round(x),
    y: STAGE_Y,
    dir: 'R',
  };
}

function randomColor(): string {
  const index = Math.floor(Math.random() * DEFAULT_COLORS.length);
  return DEFAULT_COLORS[index] ?? '#37A9FF';
}

export async function enterRoom(
  roomCode: string,
  uid: string,
  options: PresenceOptions = {},
): Promise<EnterRoomHandle> {
  const ref = getPlayerDoc(roomCode, uid);
  const spawn = spawnOnStage();
  const color = typeof options.color === 'string' && options.color.trim() ? options.color : randomColor();
  const name = typeof options.name === 'string' && options.name.trim() ? options.name : 'Player';

  const payload = {
    uid,
    name,
    color,
    x: spawn.x,
    y: spawn.y,
    dir: spawn.dir,
    ts: getServerTimestamp(),
  };

  console.log('[presence] enterRoom', { roomCode, uid, payload });

  await ref.set(payload, { merge: true });

  let stopped = false;
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null;

  const sendHeartbeat = () => {
    if (stopped) {
      return Promise.resolve();
    }
    try {
      return ref.update({ ts: getServerTimestamp() }).catch(() => undefined);
    } catch (error) {
      return Promise.resolve();
    }
  };

  heartbeatTimer = setInterval(() => {
    void sendHeartbeat();
  }, HEARTBEAT_INTERVAL_MS);

  const unloadHandler = () => {
    void ref.delete().catch(() => undefined);
  };

  if (typeof window !== 'undefined') {
    window.addEventListener('beforeunload', unloadHandler);
    window.addEventListener('pagehide', unloadHandler);
  }

  const cleanup = async () => {
    if (stopped) {
      return;
    }
    stopped = true;
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }
    if (typeof window !== 'undefined') {
      window.removeEventListener('beforeunload', unloadHandler);
      window.removeEventListener('pagehide', unloadHandler);
    }
    try {
      await ref.delete();
    } catch (error) {
      // ignore cleanup failure
    }
  };

  return { ref, cleanup, meta: { name, color, spawn } };
}

export async function leaveRoom(
  roomCode: string,
  uid: string,
  handle?: EnterRoomHandle | null,
): Promise<void> {
  const ref = handle?.ref ?? getPlayerDoc(roomCode, uid);
  if (handle) {
    await handle.cleanup();
    return;
  }
  try {
    await ref.delete();
  } catch (error) {
    // ignore best-effort cleanup failure
  }
}

export type { EnterRoomHandle };
