#!/usr/bin/env node

const { initializeApp, applicationDefault } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');

const uid = process.argv[2];

if (!uid) {
  console.error('Usage: node tools/set-claim.js <UID>');
  process.exit(1);
}

initializeApp({
  credential: applicationDefault(),
});

getAuth()
  .setCustomUserClaims(uid, { admin: true })
  .then(() => {
    console.log(`Admin claim set for UID: ${uid}`);
  })
  .catch((error) => {
    console.error('Failed to set admin claim:', error);
    process.exit(1);
  });
