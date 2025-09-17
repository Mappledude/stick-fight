const test = require('node:test');
const assert = require('node:assert/strict');

const firebaseConfigModule = require('../public/firebase-config.js');

const INLINE_CONFIG = firebaseConfigModule.__test.getInlineConfig();

const WINDOW_CONFIG = Object.freeze({
  apiKey: 'AIzaSyProdConfigApiKey1234567890',
  authDomain: 'stick-fight-prod.firebaseapp.com',
  projectId: 'stick-fight-prod',
  storageBucket: 'stick-fight-prod.appspot.com',
  messagingSenderId: '999999999999',
  appId: '1:999999999999:web:prodappid123456',
  measurementId: 'G-PROD12345',
});

function withNodeEnv(value, fn) {
  const previous = process.env.NODE_ENV;
  if (typeof value === 'undefined') {
    delete process.env.NODE_ENV;
  } else {
    process.env.NODE_ENV = value;
  }

  try {
    fn();
  } finally {
    if (typeof previous === 'undefined') {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = previous;
    }
  }
}

test('production environment uses window config by default', () => {
  withNodeEnv('production', () => {
    const scope = {
      location: { search: '' },
      __FIREBASE_CONFIG__: WINDOW_CONFIG,
    };

    const result = firebaseConfigModule.resolveFirebaseConfig(scope, INLINE_CONFIG);

    assert.equal(result.source, 'window');
    assert.equal(result.config.projectId, WINDOW_CONFIG.projectId);
  });
});

test('production environment ignores inline override', () => {
  withNodeEnv('production', () => {
    const scope = {
      location: { search: '?useInline=1' },
      __FIREBASE_CONFIG__: WINDOW_CONFIG,
    };

    const result = firebaseConfigModule.resolveFirebaseConfig(scope, INLINE_CONFIG);

    assert.equal(result.source, 'window');
    assert.equal(result.config.projectId, WINDOW_CONFIG.projectId);
  });
});

test('non-production inline override is respected', () => {
  withNodeEnv('development', () => {
    const scope = {
      location: { search: '?useInline=1' },
    };

    const infoLogs = [];
    const loggers = {
      info: (line) => {
        infoLogs.push(line);
      },
    };

    const result = firebaseConfigModule.resolveFirebaseConfig(scope, INLINE_CONFIG, loggers);

    assert.equal(result.source, 'inline-dev');
    assert.equal(result.config.projectId, INLINE_CONFIG.projectId);
    assert.ok(infoLogs.some((line) => /source=inline-dev/.test(line)));
  });
});
