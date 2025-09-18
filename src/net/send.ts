type LocalContext = {
  roomId: string;
  uid: string;
};

let localContext: LocalContext | null = null;

export function setLocalContext(roomId: string, uid: string): void {
  localContext = { roomId, uid };
}

export function clearLocalContext(): void {
  localContext = null;
}
