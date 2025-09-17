type BaseAction = {
  type: 'MOVE' | 'PUNCH' | 'KICK';
  actorUid: string;
  createdByUid?: string;
  createdAt?: number;
};

type MoveAction = BaseAction & {
  type: 'MOVE';
  ax: number;
  ay: number;
  mag?: number;
};

type PunchAction = BaseAction & {
  type: 'PUNCH';
};

type KickAction = BaseAction & {
  type: 'KICK';
};

type PlayerAction = MoveAction | PunchAction | KickAction;

const actionQueues: Map<string, PlayerAction[]> = new Map();

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return value > 0 ? max : min;
  }
  return Math.min(Math.max(value, min), max);
}

export function enqueueAction(roomId: string, action: PlayerAction): void {
  if (!roomId) {
    throw new Error('roomId is required');
  }
  if (!action || typeof action !== 'object') {
    throw new Error('action is required');
  }
  if (!action.actorUid) {
    throw new Error('actorUid is required');
  }
  const entry: PlayerAction = {
    ...action,
    ax: 'ax' in action ? clamp(action.ax, -1, 1) : undefined,
    ay: 'ay' in action ? clamp(action.ay, -1, 1) : undefined,
    mag: 'mag' in action ? clamp(action.mag ?? 0, 0, 1) : undefined,
    createdAt: action.createdAt ?? Date.now(),
  } as PlayerAction;

  const queue = actionQueues.get(roomId);
  if (queue) {
    queue.push(entry);
  } else {
    actionQueues.set(roomId, [entry]);
  }
}

export function consumeQueuedActions(roomId: string): PlayerAction[] {
  if (!roomId) {
    return [];
  }
  const queue = actionQueues.get(roomId);
  if (!queue || queue.length === 0) {
    return [];
  }
  actionQueues.set(roomId, []);
  return queue.slice();
}

export type { PlayerAction, MoveAction, PunchAction, KickAction };
