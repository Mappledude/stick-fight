const test = require('node:test');
const assert = require('node:assert/strict');

const firebaseConfigModule = require('../public/firebase-config.js');

function resetGlobals() {
  delete global.firebase;
  delete global.__FIREBASE_CONFIG__;
}

test('throws when no Firebase config is available', () => {
  resetGlobals();
  assert.throws(() => {
    firebaseConfigModule.getFirebaseConfig();
  }, /missing=window.__FIREBASE_CONFIG__/);
});

test('reuses existing firebase app options when present', () => {
  resetGlobals();
  const options = Object.freeze({
    apiKey: 'A'.repeat(20),
    authDomain: 'stick-fight.firebaseapp.com',
    projectId: 'stick-fight',
    appId: '1:123:web:abc',
    storageBucket: 'stick-fight.appspot.com',
  });
  global.firebase = {
    apps: [
      {
        options,
      },
    ],
  };

  const result = firebaseConfigModule.getFirebaseConfig();

  assert.equal(result, options);
});

test('reads window config when firebase app is not initialized', () => {
  resetGlobals();
  global.__FIREBASE_CONFIG__ = {
    apiKey: 'B'.repeat(24),
    authDomain: 'stick-fight.web.app',
    projectId: 'stick-fight',
    appId: '1:456:web:def',
    storageBucket: 'stick-fight.appspot.com',
  };

  const result = firebaseConfigModule.getFirebaseConfig();

  assert.equal(result.projectId, 'stick-fight');
  assert.equal(result.appId, '1:456:web:def');
});

test('throws when config is missing required fields', () => {
  resetGlobals();
  global.__FIREBASE_CONFIG__ = {
    apiKey: 'short',
    projectId: 'missing-fields',
  };

  assert.throws(() => {
    firebaseConfigModule.getFirebaseConfig();
  }, /invalid keys/);
});
