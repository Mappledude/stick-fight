import * as functions from 'firebase-functions';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

if (getApps().length === 0) {
  initializeApp();
}

const RATE_LIMIT_MAX_CALLS = 5;
const RATE_LIMIT_WINDOW_MS = 60_000;
const rateLimitBuckets = new Map<string, number[]>();

const allowedOriginPatterns = [/^https:\/\/([^.]+\.)*web\.app$/i, /^https:\/\/([^.]+\.)*firebaseapp\.com$/i];

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
  if (!origin) {
    throw new functions.https.HttpsError('permission-denied', 'Missing origin header.');
  }

  if (!allowedOriginPatterns.some((pattern) => pattern.test(origin))) {
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

export const grantAdminByCode = functions.https.onCall(async (data: GrantAdminRequest, context: functions.https.CallableContext) => {
  const callableContext = context as CallableContextWithRequest;
  const origin = getRequestOrigin(callableContext);
  assertAllowedOrigin(origin);

  const ip = getRequestIp(callableContext);
  enforceRateLimit(ip);

  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Authentication is required.');
  }

  if (data?.code !== '808080') {
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
