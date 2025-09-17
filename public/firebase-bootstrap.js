/* public/firebase-bootstrap.js
 * Canonical Firebase compat bootstrap for classic <script> builds.
 * - Uses Hosting auto-init (/__/firebase/init.js) or window.__FIREBASE_CONFIG__.
 * - Single initializeApp with reuse.
 * - Exact logging format required by our checks.
 * - No ES module exports (classic only).
 */

(function (global) {
  'use strict';

  // ---------- utilities ----------
  function i(msg) { try { console.info(msg); } catch (_) {} }
  function e(msg, err) {
    try { console.error(msg, err || ''); } catch (_) {}
  }

  function getFB() {
    return (global && global.firebase) || null; // compat namespace
  }

  // Resolve config (prefer existing app -> window.__FIREBASE_CONFIG__)
  function resolveFirebaseConfig() {
    const fb = getFB();

    // 1) If Hosting auto-init already ran, reuse that app's options
    if (fb && fb.apps && fb.apps.length > 0) {
      const opts = fb.apps[0].options || {};
      const k = String(opts.apiKey || '');
      i(
        `[CFG] source=firebase-app projectId=${opts.projectId} authDomain=${opts.authDomain} apiKeyLen=${k.length} apiKeyHead=${k.slice(0, 6)}`
      );
      return opts;
    }

    // 2) window.__FIREBASE_CONFIG__ (manual injection)
    const cfg = global.__FIREBASE_CONFIG__ || null;
    if (cfg) {
      const k = String(cfg.apiKey || '');
      i(
        `[CFG] source=window projectId=${cfg.projectId} authDomain=${cfg.authDomain} apiKeyLen=${k.length} apiKeyHead=${k.slice(0, 6)}`
      );
      return cfg;
    }

    // 3) No config available
    throw new Error('[CFG][ERR] missing=config source=bootstrap');
  }

  // Initialize (or reuse) compat app; do not call this in safe-mode
  function initFirebase(options) {
    const fb = getFB();
    const scriptType = 'classic';
    const sdk = 'compat';

    const already = fb && fb.apps ? fb.apps.length : 0;
    i(
      `[INIT] sdk=${sdk} scriptType=${scriptType} appInitRequested=yes reusedApp=${
        already ? 'yes' : 'no'
      } apps=${already}`
    );

    if (already) {
      // Reuse the first app created (by /__/firebase/init.js or earlier call)
      return fb.apps[0];
    }

    const cfg = options || resolveFirebaseConfig();

    // Basic validation (early, readable failures)
    var missing = [];
    ['apiKey', 'authDomain', 'projectId', 'appId', 'storageBucket'].forEach(function (k) {
      if (!cfg || !cfg[k]) missing.push(k);
    });
    if (missing.length || String(cfg.apiKey).length < 20) {
      throw new Error('[CFG][ERR] invalid keys missing=' + missing.join(','));
    }

    return fb.initializeApp(cfg);
  }

  // Compat auth getter (ensures app first)
  function getAuthCompat() {
    const fb = getFB();
    const app = initFirebase(); // will reuse if already initialized
    return fb.auth(app);
  }

  // Sign in anonymously with logs & clear banner path on error
  async function ensureSignedInUser() {
    const auth = getAuthCompat();
    i('[AUTH] auth-instance-ready');

    if (auth.currentUser) {
      i('[AUTH] result code=ok uid=' + auth.currentUser.uid);
      return { auth: auth, user: auth.currentUser };
    }

    i('[AUTH] start');
    try {
      const cred = await auth.signInAnonymously();
      const user = (cred && cred.user) || auth.currentUser;
      if (!user) throw new Error('no-user-after-anon');
      i('[AUTH] result code=ok uid=' + user.uid);
      return { auth: auth, user: user };
    } catch (err) {
      const code = (err && err.code) || 'error';
      const msg = (err && err.message) || String(err);
      i('[AUTH] result code=' + code + ' message=' + msg);
      e('[ERROR] AUTH: Firebase Auth failed', err);
      // Surface to any banner UI if present
      try {
        if (typeof global.showFatalBanner === 'function') {
          global.showFatalBanner('Auth failed: ' + code);
        }
      } catch (_) {}
      throw err;
    }
  }

  // Public API (classic—no ESM exports)
  global.FirebaseBootstrap = {
    resolveFirebaseConfig: resolveFirebaseConfig,
    initFirebase: initFirebase,
    getAuthCompat: getAuthCompat,
    ensureSignedInUser: ensureSignedInUser
  };
})(window);
