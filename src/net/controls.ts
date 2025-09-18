import { getPlayerDoc } from './firestoreCompat';
import type { PlayerPresence } from './playersStore';

type ControlsOptions = {
  roomCode: string;
  uid: string;
  getPlayer: (uid: string) => PlayerPresence | undefined;
  setLocalPos: (payload: { x: number; y: number; dir: 'L' | 'R' }) => void;
};

type DetachControls = () => void;

const MOVE_SPEED = 2.5;
const WRITE_INTERVAL_MS = 100;

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export function attachControls(options: ControlsOptions): DetachControls {
  const { roomCode, uid, getPlayer, setLocalPos } = options;
  const keys = new Set<string>();
  const ref = getPlayerDoc(roomCode, uid);
  let lastWrite = 0;
  let rafId: number | null = null;

  const handleKeyDown = (event: KeyboardEvent) => {
    keys.add(event.key);
  };

  const handleKeyUp = (event: KeyboardEvent) => {
    keys.delete(event.key);
  };

  const tick = () => {
    const player = getPlayer(uid);
    const now = typeof performance !== 'undefined' && typeof performance.now === 'function'
      ? performance.now()
      : Date.now();

    if (player) {
      let dx = 0;
      let dy = 0;
      if (keys.has('ArrowLeft') || keys.has('a') || keys.has('A')) {
        dx -= 1;
      }
      if (keys.has('ArrowRight') || keys.has('d') || keys.has('D')) {
        dx += 1;
      }
      if (keys.has('ArrowUp') || keys.has('w') || keys.has('W')) {
        dy -= 1;
      }
      if (keys.has('ArrowDown') || keys.has('s') || keys.has('S')) {
        dy += 1;
      }

      if (dx !== 0 || dy !== 0) {
        const magnitude = Math.hypot(dx, dy) || 1;
        const normX = dx / magnitude;
        const normY = dy / magnitude;
        const nextDir: 'L' | 'R' = normX < 0 ? 'L' : normX > 0 ? 'R' : player.dir;
        const nextX = clamp(player.x + normX * MOVE_SPEED, 8, 792);
        const nextY = clamp(player.y + normY * MOVE_SPEED, 8, 432);

        setLocalPos({ x: nextX, y: nextY, dir: nextDir });

        const moved = Math.abs(nextX - player.x) + Math.abs(nextY - player.y) > 0.5 || nextDir !== player.dir;
        if (moved && now - lastWrite >= WRITE_INTERVAL_MS) {
          lastWrite = now;
          void ref.update({ x: nextX, y: nextY, dir: nextDir }).catch(() => undefined);
        }
      }
    }

    rafId = requestAnimationFrame(tick);
  };

  window.addEventListener('keydown', handleKeyDown);
  window.addEventListener('keyup', handleKeyUp);
  rafId = requestAnimationFrame(tick);

  return () => {
    window.removeEventListener('keydown', handleKeyDown);
    window.removeEventListener('keyup', handleKeyUp);
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
  };
}
