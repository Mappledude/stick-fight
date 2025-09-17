(function (global) {
  'use strict';

  if (!global || typeof global !== 'object') {
    return;
  }

  const config = Object.freeze({
    apiKey: 'AIzaSyCTrS0i1Xz9Ll9cSPYnS3sh2g6Pfm7eNcQ',
    authDomain: 'stick-fight-pigeon.firebaseapp.com',
    projectId: 'stick-fight-pigeon',
    storageBucket: 'stick-fight-pigeon.appspot.com',
    messagingSenderId: '1035698723456',
    appId: '1:1035698723456:web:13b6cf2b2a9f4e12a8c7b1',
    measurementId: 'G-8X0PQR1XYZ',
  });

  const boot = global.__StickFightBoot;
  const logCfgError = (message) => {
    const line = '[CFG][ERR] ' + message;
    if (boot && typeof boot.error === 'function') {
      boot.error('CFG', message);
    }
    if (typeof console !== 'undefined' && console && typeof console.error === 'function') {
      console.error(line);
    }
  };

  const ensureField = (field, minLength) => {
    const value = config[field];
    const isString = typeof value === 'string';
    const actualLength = isString ? value.length : 0;
    if (!isString || actualLength < minLength) {
      const reason = !isString || actualLength === 0 ? 'missing' : 'too short';
      logCfgError(field + ' ' + reason + ' in firebase config');
      throw new Error('CFG_INVALID_FIELD: ' + field);
    }
    return value;
  };

  const apiKey = ensureField('apiKey', 6);
  const authDomain = ensureField('authDomain', 1);
  const projectId = ensureField('projectId', 1);
  ensureField('appId', 1);

  const apiKeyLen = apiKey.length;
  const apiKeyHead = apiKey.slice(0, 6);
  const source =
    typeof window !== 'undefined' && global === window
      ? 'window'
      : typeof globalThis !== 'undefined' && global === globalThis
      ? 'globalThis'
      : 'unknown';
  const logDetails =
    'source=' +
    source +
    ' projectId=' +
    projectId +
    ' authDomain=' +
    authDomain +
    ' apiKeyLen=' +
    apiKeyLen +
    ' apiKeyHead=' +
    apiKeyHead;
  const logLine = '[CFG] ' + logDetails;

  if (boot && typeof boot.log === 'function') {
    boot.log('CFG', logDetails);
  }
  if (typeof console !== 'undefined' && console && typeof console.info === 'function') {
    console.info(logLine);
  }

  global.__FIREBASE_CONFIG__ = config;
  global.STICKFIGHT_FIREBASE_CONFIG = config;
  global.STICK_FIGHT_FIREBASE_CONFIG = config;
  global.STICKFIGHT_FIREBASE_OPTIONS = config;
})(typeof window !== 'undefined' ? window : typeof globalThis !== 'undefined' ? globalThis : this);
