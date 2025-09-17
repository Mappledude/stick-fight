import { enqueueAction } from '../lib/actions';
import { ensureSignedInUser } from '../lib/identity';

type MovePayload = {
  ax: number;
  ay: number;
  mag?: number;
};

type LocalContext = {
  roomId: string;
  uid: string;
};

let localContext: LocalContext | null = null;

export function setLocalContext(roomId: string, uid: string): void {
  localContext = { roomId, uid };
}

function getContext(): LocalContext {
  if (localContext) {
    return localContext;
  }
  throw new Error('Local player context has not been established.');
}

export async function sendMove(payload: MovePayload): Promise<void> {
  const context = getContext();
  const { user } = await ensureSignedInUser();
  if (user.uid !== context.uid) {
    return;
  }
  enqueueAction(context.roomId, {
    type: 'MOVE',
    ax: payload.ax,
    ay: payload.ay,
    mag: payload.mag,
    actorUid: context.uid,
    createdByUid: context.uid,
  });
}

export async function sendPunch(): Promise<void> {
  const context = getContext();
  const { user } = await ensureSignedInUser();
  if (user.uid !== context.uid) {
    return;
  }
  enqueueAction(context.roomId, {
    type: 'PUNCH',
    actorUid: context.uid,
    createdByUid: context.uid,
  });
}

export async function sendKick(): Promise<void> {
  const context = getContext();
  const { user } = await ensureSignedInUser();
  if (user.uid !== context.uid) {
    return;
  }
  enqueueAction(context.roomId, {
    type: 'KICK',
    actorUid: context.uid,
    createdByUid: context.uid,
  });
}

export function clearLocalContext(): void {
  localContext = null;
}
