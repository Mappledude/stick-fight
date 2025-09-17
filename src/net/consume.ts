import { consumeQueuedActions, PlayerAction } from '../lib/actions';

type Listener = (actions: PlayerAction[]) => void;

const listeners: Set<Listener> = new Set();
let pollingRoomId: string | null = null;
let pollTimer: ReturnType<typeof setInterval> | null = null;

function notify(actions: PlayerAction[]) {
  if (actions.length === 0) {
    return;
  }
  listeners.forEach((listener) => {
    try {
      listener(actions);
    } catch (error) {
      if (typeof console !== 'undefined' && console && typeof console.error === 'function') {
        console.error('[NET][CONSUME] listener failed', error);
      }
    }
  });
}

function tick() {
  if (!pollingRoomId) {
    return;
  }
  const actions = consumeQueuedActions(pollingRoomId);
  notify(actions);
}

export function startConsuming(roomId: string, intervalMs = 50): void {
  pollingRoomId = roomId;
  if (pollTimer) {
    clearInterval(pollTimer);
  }
  pollTimer = setInterval(tick, intervalMs);
}

export function stopConsuming(): void {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
  pollingRoomId = null;
}

export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
