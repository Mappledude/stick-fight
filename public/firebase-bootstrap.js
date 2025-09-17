import { getFirebaseConfig } from './firebase-config.js';

const globalScope = typeof window !== 'undefined' ? window : typeof globalThis !== 'undefined' ? globalThis : this;
const scriptType = 'classic';
const sdk = 'compat';

export function initFirebase() {
  const fb = globalScope && typeof globalScope.firebase === 'object' ? globalScope.firebase : undefined;
  const appsLength = fb && fb.apps && typeof fb.apps.length === 'number' ? fb.apps.length : 0;
  console.info(
    '[INIT] sdk=' +
      sdk +
      ' scriptType=' +
      scriptType +
      ' appInitRequested=yes reusedApp=' +
      (appsLength > 0 ? 'yes' : 'no') +
      ' apps=' +
      appsLength
  );

  if (!fb || typeof fb.initializeApp !== 'function') {
    throw new Error('[INIT][ERR] firebase namespace unavailable');
  }

  if (appsLength > 0) {
    return fb.apps[0];
  }

  const cfg = getFirebaseConfig();
  return fb.initializeApp(cfg);
}

if (globalScope && typeof globalScope === 'object') {
  globalScope.__StickFightFirebaseBootstrap = {
    initFirebase,
    getFirebaseConfig,
  };
  if (typeof globalScope.initFirebase !== 'function') {
    globalScope.initFirebase = initFirebase;
  }
}
