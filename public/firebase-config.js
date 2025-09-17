const globalScope = typeof window !== 'undefined' ? window : typeof globalThis !== 'undefined' ? globalThis : this;

export function getFirebaseConfig() {
  const fb = globalScope && typeof globalScope.firebase === 'object' ? globalScope.firebase : undefined;
  if (fb && Array.isArray(fb.apps) && fb.apps.length > 0) {
    const opts = fb.apps[0].options || {};
    console.info(
      '[CFG] source=firebase-app projectId=' + opts.projectId,
      'authDomain=' + opts.authDomain,
      'apiKeyLen=' + String(opts.apiKey || '').length,
      'apiKeyHead=' + String(opts.apiKey || '').slice(0, 6)
    );
    return opts;
  }

  const cfg = globalScope && typeof globalScope === 'object' ? globalScope.__FIREBASE_CONFIG__ : undefined;
  if (!cfg) {
    throw new Error('[CFG][ERR] missing=window.__FIREBASE_CONFIG__ source=window');
  }

  const { apiKey, authDomain, projectId, appId, storageBucket } = cfg;
  const missing = ['apiKey', 'authDomain', 'projectId', 'appId', 'storageBucket'].filter((key) => {
    const value = cfg[key];
    return value === undefined || value === null || value === '';
  });
  if (missing.length > 0 || String(apiKey || '').length < 20) {
    throw new Error('[CFG][ERR] invalid keys missing=' + missing.join(','));
  }

  console.info(
    '[CFG] source=window projectId=' + projectId,
    'authDomain=' + authDomain,
    'apiKeyLen=' + String(apiKey).length,
    'apiKeyHead=' + String(apiKey).slice(0, 6)
  );
  return cfg;
}

if (globalScope && typeof globalScope === 'object') {
  if (!globalScope.__StickFightFirebaseConfigModule) {
    globalScope.__StickFightFirebaseConfigModule = { getFirebaseConfig };
  } else {
    globalScope.__StickFightFirebaseConfigModule.getFirebaseConfig = getFirebaseConfig;
  }
  if (typeof globalScope.getFirebaseConfig !== 'function') {
    globalScope.getFirebaseConfig = getFirebaseConfig;
  }
}

if (typeof module === 'object' && module && typeof module.exports !== 'undefined') {
  module.exports = { getFirebaseConfig };
}
