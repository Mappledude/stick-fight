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

  global.STICKFIGHT_FIREBASE_CONFIG = config;
  global.STICK_FIGHT_FIREBASE_CONFIG = config;
  global.STICKFIGHT_FIREBASE_OPTIONS = config;
})(typeof window !== 'undefined' ? window : typeof globalThis !== 'undefined' ? globalThis : this);
