const DEVICE_ID_KEY = 'deviceId';
const LOG_PREFIX = '[AUTH]';

function randomId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  const array = typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function'
    ? crypto.getRandomValues(new Uint8Array(16))
    : Array.from({ length: 16 }, () => Math.floor(Math.random() * 256));
  return Array.from(array, (value) => value.toString(16).padStart(2, '0')).join('');
}

export function getDeviceId(): string {
  try {
    const storage = typeof window !== 'undefined' ? window.localStorage : undefined;
    if (!storage) {
      return randomId();
    }
    const existing = storage.getItem(DEVICE_ID_KEY);
    if (typeof existing === 'string' && existing.length > 0) {
      return existing;
    }
    const next = randomId();
    storage.setItem(DEVICE_ID_KEY, next);
    return next;
  } catch (error) {
    return randomId();
  }
}

type FirebaseAuth = {
  currentUser: { uid: string } | null;
  signInAnonymously?: () => Promise<{ user: { uid: string } | null }>;
};

type FirebaseNamespace = {
  auth?: () => FirebaseAuth;
};

let signingIn: Promise<{ auth: FirebaseAuth; user: { uid: string } }> | null = null;

export async function ensureSignedInUser(): Promise<{ auth: FirebaseAuth; user: { uid: string } }>
{
  const firebaseNamespace: FirebaseNamespace | undefined =
    typeof window !== 'undefined' ? (window as any).firebase : undefined;
  if (!firebaseNamespace || typeof firebaseNamespace.auth !== 'function') {
    throw new Error('Firebase Auth SDK is not available.');
  }
  const auth = firebaseNamespace.auth();
  if (!auth) {
    throw new Error('Failed to obtain Firebase Auth instance.');
  }
  if (auth.currentUser) {
    const deviceId = getDeviceId();
    if (typeof console !== 'undefined' && console && typeof console.log === 'function') {
      console.log(`${LOG_PREFIX} uid=${auth.currentUser.uid} deviceId=${deviceId}`);
    }
    return { auth, user: auth.currentUser };
  }
  if (!signingIn) {
    if (typeof auth.signInAnonymously !== 'function') {
      throw new Error('Firebase Auth does not support anonymous sign-in.');
    }
    signingIn = auth
      .signInAnonymously()
      .then((cred) => {
        const user = (cred && cred.user) || auth.currentUser;
        if (!user) {
          throw new Error('Anonymous sign-in returned no user.');
        }
        return { auth, user };
      })
      .finally(() => {
        signingIn = null;
      });
  }
  const result = await signingIn;
  const deviceId = getDeviceId();
  if (typeof console !== 'undefined' && console && typeof console.log === 'function') {
    console.log(`${LOG_PREFIX} uid=${result.user.uid} deviceId=${deviceId}`);
  }
  return result;
}
