import * as functions from 'firebase-functions';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';
import { join } from 'path';
import { compareBcrypt, hashBcrypt } from './utils/bcrypt';

if (getApps().length === 0) {
  initializeApp();
}

const firestore = getFirestore();
const settingsAppRef = firestore.doc('settings/app');
const playersCollection = firestore.collection('players');

const BCRYPT_SALT_ROUNDS = 10;
const DEFAULT_ADMIN_ADD_CODE = '808080';
const MAX_CODEWORD_COLLISION_ATTEMPTS = 20;

const RATE_LIMIT_MAX_CALLS = 5;
const RATE_LIMIT_WINDOW_MS = 60_000;
const rateLimitBuckets = new Map<string, number[]>();

const allowedOrigins = new Set([
  'https://stick-fight-pigeon.web.app',
  'https://stick-fight-pigeon.firebaseapp.com',
]);

const ADMIN_CODE = '808080';

type SettingsAppData = {
  adminAddCodeHash: string;
};

type SettingsDocResult = {
  ref: FirebaseFirestore.DocumentReference<FirebaseFirestore.DocumentData>;
  data: SettingsAppData;
};

const ensureSettingsAppDoc = async (): Promise<SettingsDocResult> => {
  const snapshot = await settingsAppRef.get();
  if (!snapshot.exists) {
    const adminAddCodeHash = await hashBcrypt(DEFAULT_ADMIN_ADD_CODE, BCRYPT_SALT_ROUNDS);
    await settingsAppRef.set(
      {
        adminAddCodeHash,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: false },
    );
    return { ref: settingsAppRef, data: { adminAddCodeHash } };
  }

  const rawData = snapshot.data() ?? {};
  const currentHash = typeof rawData.adminAddCodeHash === 'string' && rawData.adminAddCodeHash.length > 0 ? rawData.adminAddCodeHash : undefined;
  if (!currentHash) {
    const adminAddCodeHash = await hashBcrypt(DEFAULT_ADMIN_ADD_CODE, BCRYPT_SALT_ROUNDS);
    await settingsAppRef.set(
      {
        adminAddCodeHash,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
    return { ref: settingsAppRef, data: { adminAddCodeHash } };
  }

  return { ref: settingsAppRef, data: { adminAddCodeHash: currentHash } };
};

const verifyAdminAddCode = async (adminCode: string): Promise<SettingsDocResult> => {
  const settingsDoc = await ensureSettingsAppDoc();
  const isValid = await compareBcrypt(adminCode, settingsDoc.data.adminAddCodeHash);
  if (!isValid) {
    throw new functions.https.HttpsError('permission-denied', 'Invalid admin code.');
  }
  return settingsDoc;
};

const selectCodeWord = (attemptedWords: Set<string>): string | undefined => {
  if (attemptedWords.size >= WORD_LIST.length) {
    return undefined;
  }

  for (let attempt = 0; attempt < 10; attempt += 1) {
    const candidate = WORD_LIST[Math.floor(Math.random() * WORD_LIST.length)];
    if (!attemptedWords.has(candidate)) {
      attemptedWords.add(candidate);
      return candidate;
    }
  }

  for (const word of WORD_LIST) {
    if (!attemptedWords.has(word)) {
      attemptedWords.add(word);
      return word;
    }
  }

  return undefined;
};

const loadWordList = (): string[] => {
  const wordFilePath = join(__dirname, '../src/data/words4.txt');
  const fileContents = readFileSync(wordFilePath, 'utf8');
  const words = fileContents
    .split(/\r?\n/)
    .map((word) => word.trim().toUpperCase())
    .filter((word) => word.length === 4 && /^[A-Z]+$/.test(word));
  if (words.length === 0) {
    throw new Error('Word list is empty or invalid.');
  }
  return words;
};

const WORD_LIST = loadWordList();

type RawRequest = {
  get(header: string): string | undefined;
  headers: Record<string, string | string[] | undefined>;
  ip?: string;
};

type CallableContextWithRequest = functions.https.CallableContext & {
  rawRequest?: RawRequest;
};

const getRequestOrigin = (context: CallableContextWithRequest): string | undefined => {
  const origin = context.rawRequest?.get('origin') ?? context.rawRequest?.headers?.origin;
  return typeof origin === 'string' ? origin : Array.isArray(origin) ? origin[0] : undefined;
};

const getRequestIp = (context: CallableContextWithRequest): string => {
  const ipValue = context.rawRequest?.ip ?? context.rawRequest?.headers?.['x-forwarded-for'];
  if (typeof ipValue === 'string' && ipValue.length > 0) {
    return ipValue.split(',')[0].trim();
  }
  if (Array.isArray(ipValue) && ipValue.length > 0) {
    return ipValue[0];
  }
  return 'unknown';
};

const assertAllowedOrigin = (origin: string | undefined): void => {
  if (!origin || !allowedOrigins.has(origin)) {
    throw new functions.https.HttpsError('permission-denied', 'Origin not allowed.');
  }
};

const enforceRateLimit = (ip: string): void => {
  const now = Date.now();
  const windowStart = now - RATE_LIMIT_WINDOW_MS;
  const entries = rateLimitBuckets.get(ip) ?? [];
  const recentEntries = entries.filter((timestamp) => timestamp >= windowStart);

  if (recentEntries.length >= RATE_LIMIT_MAX_CALLS) {
    throw new functions.https.HttpsError('resource-exhausted', 'Too many requests. Please try again later.');
  }

  recentEntries.push(now);
  rateLimitBuckets.set(ip, recentEntries);
};

type GrantAdminRequest = {
  code?: unknown;
};

type CallableResponse = {
  ok: true;
};

type AdminAddPlayerRequest = {
  adminCode?: unknown;
  name?: unknown;
  color?: unknown;
};

type AdminSetAddCodeRequest = {
  adminCode?: unknown;
  newCode?: unknown;
};

const sanitizeName = (name: string): string => {
  const trimmed = name.trim();
  const maxLength = 64;
  return trimmed.length > maxLength ? trimmed.slice(0, maxLength) : trimmed;
};

const sanitizeColor = (color: string): string => color.trim().toUpperCase();

const validateHexColor = (color: string): boolean => /^#[0-9A-F]{6}$/.test(color.toUpperCase());

export const adminAddPlayer = functions.https.onCall(
  async (data: AdminAddPlayerRequest, context: functions.https.CallableContext) => {
    const callableContext = context as CallableContextWithRequest;
    const origin = getRequestOrigin(callableContext);
    assertAllowedOrigin(origin);

    const ip = getRequestIp(callableContext);
    enforceRateLimit(ip);

    const adminCode = typeof data?.adminCode === 'string' ? data.adminCode.trim() : '';
    if (!adminCode) {
      throw new functions.https.HttpsError('invalid-argument', 'Admin code is required.');
    }

    const nameValue = typeof data?.name === 'string' ? sanitizeName(data.name) : '';
    if (!nameValue) {
      throw new functions.https.HttpsError('invalid-argument', 'Player name is required.');
    }

    const colorValueRaw = typeof data?.color === 'string' ? sanitizeColor(data.color) : '';
    if (!validateHexColor(colorValueRaw)) {
      throw new functions.https.HttpsError('invalid-argument', 'Color must be a hex value like #RRGGBB.');
    }

    await verifyAdminAddCode(adminCode);

    const codeWord = await firestore.runTransaction(async (transaction) => {
      const attemptedWords = new Set<string>();
      const maxAttempts = Math.min(MAX_CODEWORD_COLLISION_ATTEMPTS, WORD_LIST.length);
      for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
        const candidate = selectCodeWord(attemptedWords);
        if (!candidate) {
          break;
        }

        const playerRef = playersCollection.doc(candidate);
        const playerSnapshot = await transaction.get(playerRef);
        if (!playerSnapshot.exists) {
          transaction.create(playerRef, {
            codeWord: candidate,
            name: nameValue,
            color: colorValueRaw,
            createdAt: FieldValue.serverTimestamp(),
            active: true,
          });
          return candidate;
        }
      }

      throw new functions.https.HttpsError('resource-exhausted', 'Unable to allocate a unique code word.');
    });

    console.log(`[PLAYER][ADD] codeWord=${codeWord} name=${nameValue}`);
    return { codeWord };
  },
);

export const adminSetAddCode = functions.https.onCall(
  async (data: AdminSetAddCodeRequest, context: functions.https.CallableContext) => {
    const callableContext = context as CallableContextWithRequest;
    const origin = getRequestOrigin(callableContext);
    assertAllowedOrigin(origin);

    const ip = getRequestIp(callableContext);
    enforceRateLimit(ip);

    const adminCode = typeof data?.adminCode === 'string' ? data.adminCode.trim() : '';
    if (!adminCode) {
      throw new functions.https.HttpsError('invalid-argument', 'Admin code is required.');
    }

    const newCode = typeof data?.newCode === 'string' ? data.newCode.trim() : '';
    if (newCode.length < 4 || newCode.length > 32) {
      throw new functions.https.HttpsError('invalid-argument', 'New code must be between 4 and 32 characters.');
    }

    const sanitizedNewCode = newCode;

    await verifyAdminAddCode(adminCode);

    const adminAddCodeHash = await hashBcrypt(sanitizedNewCode, BCRYPT_SALT_ROUNDS);
    await settingsAppRef.update({
      adminAddCodeHash,
      updatedAt: FieldValue.serverTimestamp(),
    });

    console.log('[SETTINGS][ADMIN_ADD_CODE] updated');

    const response: CallableResponse = { ok: true };
    return response;
  },
);

export const grantAdminByCode = functions.https.onCall(async (data: GrantAdminRequest, context: functions.https.CallableContext) => {
  const callableContext = context as CallableContextWithRequest;
  const ip = getRequestIp(callableContext);
  enforceRateLimit(ip);

  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Sign in required.');
  }

  const origin = getRequestOrigin(callableContext);
  assertAllowedOrigin(origin);

  const requestCode = typeof data?.code === 'string' ? data.code.trim() : undefined;
  if (requestCode !== ADMIN_CODE) {
    throw new functions.https.HttpsError('permission-denied', 'Invalid code.');
  }

  console.log(`[CLAIM][GRANT] uid=${context.auth.uid} by code`);
  await getAuth().setCustomUserClaims(context.auth.uid, { admin: true });
  const response: CallableResponse = { ok: true };
  return response;
});

export const revokeAdmin = functions.https.onCall(async (_data: unknown, context: functions.https.CallableContext) => {
  const callableContext = context as CallableContextWithRequest;
  const origin = getRequestOrigin(callableContext);
  assertAllowedOrigin(origin);

  const ip = getRequestIp(callableContext);
  enforceRateLimit(ip);

  if (context.auth?.token?.admin !== true) {
    throw new functions.https.HttpsError('permission-denied', 'Admin privileges required.');
  }

  console.log(`[CLAIM][REVOKE] uid=${context.auth.uid}`);
  await getAuth().setCustomUserClaims(context.auth.uid, { admin: false });
  const response: CallableResponse = { ok: true };
  return response;
});
