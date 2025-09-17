const test = require('node:test');
const assert = require('node:assert/strict');

const HostServer = require('../public/net-server.js');

const { createRegistry, SPEED, ACCEL, FRICTION, JUMP_V, GRAVITY } = HostServer;

const DT = 1 / 60;

test('server applies horizontal acceleration toward target speed', () => {
  const registry = createRegistry();
  registry.ensurePlayer('host', { slot: 'p1' });
  registry.setInput('host', { mx: 1, ju: 0 });
  registry.fixedStep(DT);
  const player = registry.getPlayer('host');
  const expectedVx = Math.min(ACCEL * DT, SPEED);
  assert.ok(Math.abs(player.vx - expectedVx) < 1e-6);
  assert.ok(player.x > 0);
});

test('server applies ground friction when no input', () => {
  const registry = createRegistry();
  const internal = registry.ensurePlayer('p1', { slot: 'p1' });
  internal.vx = SPEED * 0.5;
  registry.setInput('p1', { mx: 0, ju: 0 });
  registry.fixedStep(DT);
  const updated = registry.getPlayer('p1');
  const expected = Math.max(SPEED * 0.5 - ACCEL * DT, 0);
  assert.ok(Math.abs(updated.vx - expected) < 1e-6);
});

test('server applies jump impulse and gravity', () => {
  const registry = createRegistry();
  const internal = registry.ensurePlayer('jumper', { slot: 'p1' });
  const startY = internal.y;
  registry.setInput('jumper', { mx: 0, ju: 1 });
  registry.fixedStep(DT);
  const player = registry.getPlayer('jumper');
  const expectedVy = -JUMP_V + GRAVITY * DT;
  assert.ok(Math.abs(player.vy - expectedVy) < 1e-6);
  assert.equal(player.onGround, false);
  assert.ok(player.y < startY);
  assert.ok(player.vx > 0);
});

test('server applies gravity while airborne', () => {
  const registry = createRegistry();
  const internal = registry.ensurePlayer('air', { slot: 'p1' });
  internal.onGround = false;
  internal.vy = 0;
  internal.y -= 80;
  registry.setInput('air', { mx: 0, ju: 0 });
  registry.fixedStep(DT);
  const player = registry.getPlayer('air');
  assert.ok(Math.abs(player.vy - GRAVITY * DT) < 1e-6);
  assert.equal(player.onGround, false);
});

test('server clamps to floor and resets velocity', () => {
  const registry = createRegistry();
  const internal = registry.ensurePlayer('floor', { slot: 'p1' });
  const floorY = registry.playRect.y + registry.playRect.height - internal.halfHeight;
  internal.y = floorY;
  internal.vy = 200;
  internal.onGround = false;
  registry.setInput('floor', { mx: 0, ju: 0 });
  registry.fixedStep(DT);
  const player = registry.getPlayer('floor');
  assert.equal(player.y, floorY);
  assert.equal(player.vy, 0);
  assert.equal(player.onGround, true);
});

test('server clamps to horizontal bounds and zeroes velocity', () => {
  const registry = createRegistry();
  const internal = registry.ensurePlayer('edge', { slot: 'p1' });
  const minX = registry.playRect.x + internal.halfWidth;
  internal.x = minX - 10;
  internal.vx = -SPEED;
  registry.setInput('edge', { mx: 0, ju: 0 });
  registry.fixedStep(DT);
  const player = registry.getPlayer('edge');
  assert.ok(player.x >= minX - 1e-6);
  assert.ok(player.vx >= 0);
});

test('server updates facing toward nearest opponent', () => {
  const registry = createRegistry();
  const p1 = registry.ensurePlayer('p1', { slot: 'p1' });
  const p2 = registry.ensurePlayer('p2', { slot: 'p2' });
  p2.x = p1.x + 120;
  registry.setInput('p1', { mx: 0, ju: 0 });
  registry.setInput('p2', { mx: 0, ju: 0 });
  registry.fixedStep(DT);
  let player = registry.getPlayer('p1');
  assert.equal(player.facing, 1);
  p2.x = p1.x - 120;
  registry.fixedStep(DT);
  player = registry.getPlayer('p1');
  assert.equal(player.facing, -1);
});
