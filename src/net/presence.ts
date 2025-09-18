import { getPlayerDoc, getServerTimestamp } from './firestoreCompat';

type PresenceOptions = {
  name?: string;
  color?: string;
};

type SpawnPoint = {
  x: number;
  y: number;
};

type EnterRoomHandle = {
  ref: ReturnType<typeof getPlayerDoc>;
  cleanup: () => Promise<void>;
  meta: { name: string; color: string; spawn: SpawnPoint };
};

const HEARTBEAT_INTERVAL_MS = 15000;

const DEFAULT_COLORS = ['#37A9FF', '#FF6B6B', '#FFD166', '#06D6A0', '#C792EA', '#FFA500'];

function randomSpawn(): SpawnPoint {
  const padding = 20;
  const width = 800;
  const height = 440;
  return {
    x: padding + Math.random() * (width - 2 * padding),
    y: padding + Math.random() * (height - 2 * padding),
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
  const spawn = randomSpawn();
  const color = typeof options.color === 'string' && options.color.trim() ? options.color : randomColor();
  const name = typeof options.name === 'string' && options.name.trim() ? options.name : 'Player';

  const payload = {
    uid,
    name,
    color,
    x: spawn.x,
    y: spawn.y,
    dir: 'R',
    ts: getServerTimestamp(),
  };

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
