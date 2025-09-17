const test = require('node:test');
const assert = require('node:assert/strict');

const {
  createDefaultJoyDiagModes,
  parseJoyDiagConfig,
} = require('../public/joydiag-config.js');

test('joyonly without joydiag does not enable diagnostics', () => {
  const result = parseJoyDiagConfig('?joyonly=1');
  assert.equal(result.enabled, false);
  assert.deepEqual(result.modes, createDefaultJoyDiagModes());
});
