(function (global) {
  'use strict';

  const SPEED = 220;
  const ACCEL = 1200;
  const FRICTION = 1600;
  const JUMP_V = 560;
  const GRAVITY = 2200;
  const HALF_WIDTH = 14;
  const HALF_HEIGHT = 32;
  const DEFAULT_PLAY_RECT = { x: 0, y: 0, width: 960, height: 540 };
  const JUMP_IMPULSE = SPEED * 0.35;

  function clamp(value, min, max) {
    if (!Number.isFinite(value)) {
      return min;
    }
    if (value < min) {
      return min;
    }
    if (value > max) {
      return max;
    }
    return value;
  }

  function normalizePlayRect(rect) {
    if (!rect || typeof rect !== 'object') {
      return { x: DEFAULT_PLAY_RECT.x, y: DEFAULT_PLAY_RECT.y, width: DEFAULT_PLAY_RECT.width, height: DEFAULT_PLAY_RECT.height };
    }
    const width = Number(rect.width !== undefined ? rect.width : rect.w);
    const height = Number(rect.height !== undefined ? rect.height : rect.h);
    const resolvedWidth = Number.isFinite(width) && width > HALF_WIDTH * 2 ? width : DEFAULT_PLAY_RECT.width;
    const resolvedHeight = Number.isFinite(height) && height > HALF_HEIGHT * 2 ? height : DEFAULT_PLAY_RECT.height;
    const x = Number(rect.x);
    const y = Number(rect.y);
    return {
      x: Number.isFinite(x) ? x : DEFAULT_PLAY_RECT.x,
      y: Number.isFinite(y) ? y : DEFAULT_PLAY_RECT.y,
      width: resolvedWidth,
      height: resolvedHeight,
    };
  }

  function createDefaultSpawnPoints(playRect) {
    const floorY = playRect.y + playRect.height - HALF_HEIGHT;
    return [
      { x: playRect.x + playRect.width * 0.22, y: floorY, facing: 1 },
      { x: playRect.x + playRect.width * 0.78, y: floorY, facing: -1 },
    ];
  }

  function normalizeSpawn(spawn, playRect, defaultFacing) {
    const fallbackX = playRect.x + playRect.width * 0.5;
    const fallbackY = playRect.y + playRect.height - HALF_HEIGHT;
    let facing = defaultFacing;
    if (!Number.isFinite(facing) || facing === 0) {
      facing = 1;
    }
    if (!spawn || typeof spawn !== 'object') {
      return { x: fallbackX, y: fallbackY, facing };
    }
    const x = Number(spawn.x);
    const y = Number(spawn.y);
    const providedFacing = Number(spawn.facing);
    if (Number.isFinite(providedFacing) && providedFacing !== 0) {
      facing = providedFacing > 0 ? 1 : -1;
    }
    return {
      x: Number.isFinite(x) ? x : fallbackX,
      y: Number.isFinite(y) ? y : fallbackY,
      facing,
    };
  }

  function computeSpawnPoints(spawnList, playRect) {
    const defaults = createDefaultSpawnPoints(playRect);
    if (!Array.isArray(spawnList) || spawnList.length === 0) {
      return defaults;
    }
    return spawnList.map((spawn, index) => {
      const fallback = defaults[index % defaults.length];
      const fallbackFacing = fallback ? fallback.facing : index % 2 === 0 ? 1 : -1;
      return normalizeSpawn(spawn, playRect, fallbackFacing);
    });
  }

  function clonePlayer(player) {
    return {
      id: player.id,
      slot: player.slot || null,
      name: player.name || 'Player',
      x: player.x,
      y: player.y,
      vx: player.vx,
      vy: player.vy,
      onGround: !!player.onGround,
      facing: player.facing || 1,
      halfWidth: player.halfWidth,
      halfHeight: player.halfHeight,
    };
  }

  function normalizeInput(input) {
    if (!input || typeof input !== 'object') {
      return { mx: 0, ju: 0 };
    }
    const mx = clamp(Number(input.mx !== undefined ? input.mx : input.moveX) || 0, -1, 1);
    let ju = Number(input.ju !== undefined ? input.ju : input.jumpDirection);
    if (!Number.isFinite(ju)) {
      if (input.jumpForward) {
        ju = 1;
      } else if (input.jumpBack) {
        ju = -1;
      } else {
        ju = 0;
      }
    }
    ju = Math.max(-1, Math.min(1, Math.trunc(ju)));
    return { mx, ju };
  }

  function clampPlayerToPlayRect(player, playRect) {
    const minX = playRect.x + player.halfWidth;
    const maxX = playRect.x + playRect.width - player.halfWidth;
    const minY = playRect.y + player.halfHeight;
    const maxY = playRect.y + playRect.height - player.halfHeight;

    if (player.x < minX) {
      player.x = minX;
      if (player.vx < 0) {
        player.vx = 0;
      }
    } else if (player.x > maxX) {
      player.x = maxX;
      if (player.vx > 0) {
        player.vx = 0;
      }
    }

    if (player.y < minY) {
      player.y = minY;
      if (player.vy < 0) {
        player.vy = 0;
      }
    }

    if (player.y >= maxY) {
      player.y = maxY;
      if (player.vy > 0) {
        player.vy = 0;
      }
      player.onGround = true;
    } else if (player.vy !== 0) {
      player.onGround = false;
    }
  }

  function updateFacing(players) {
    if (!players || players.length < 2) {
      return;
    }
    for (let i = 0; i < players.length; i += 1) {
      const player = players[i];
      let nearest = null;
      let nearestDistance = Infinity;
      for (let j = 0; j < players.length; j += 1) {
        if (i === j) {
          continue;
        }
        const other = players[j];
        const distance = Math.abs(other.x - player.x);
        if (distance < nearestDistance) {
          nearestDistance = distance;
          nearest = other;
        }
      }
      if (nearest) {
        const delta = nearest.x - player.x;
        player.facing = delta >= 0 ? 1 : -1;
      }
    }
  }

  function serverFixedStep(registry, dt) {
    if (!registry || !Number.isFinite(dt) || dt <= 0) {
      return;
    }
    const players = Array.from(registry.players.values());
    const playRect = registry.playRect;
    for (let i = 0; i < players.length; i += 1) {
      const player = players[i];
      const input = registry.inputs.get(player.id) || { mx: 0, ju: 0 };
      const moveInput = clamp(input.mx || 0, -1, 1);
      const targetVx = moveInput * SPEED;
      if (targetVx > player.vx) {
        player.vx = Math.min(player.vx + ACCEL * dt, targetVx);
      } else if (targetVx < player.vx) {
        player.vx = Math.max(player.vx - ACCEL * dt, targetVx);
      } else if (targetVx === 0 && player.onGround) {
        const frictionStep = FRICTION * dt;
        if (player.vx > frictionStep) {
          player.vx -= frictionStep;
        } else if (player.vx < -frictionStep) {
          player.vx += frictionStep;
        } else {
          player.vx = 0;
        }
      }

      const jumpDir = input.ju || 0;
      if (jumpDir !== 0 && player.onGround) {
        player.vy = -JUMP_V;
        player.onGround = false;
        player.vx += jumpDir * JUMP_IMPULSE;
      }

      player.x += player.vx * dt;
      player.vy += GRAVITY * dt;
      player.y += player.vy * dt;

      clampPlayerToPlayRect(player, playRect);
    }

    updateFacing(players);
  }

  function createRegistry(options) {
    const opts = options && typeof options === 'object' ? options : {};
    const registry = {
      playRect: normalizePlayRect(opts.playRect),
      baseSpawnPoints: Array.isArray(opts.spawnPoints) ? opts.spawnPoints.slice() : null,
      spawnPoints: [],
      players: new Map(),
      inputs: new Map(),
    };

    registry.spawnPoints = computeSpawnPoints(registry.baseSpawnPoints, registry.playRect);

    registry.ensurePlayer = function ensurePlayer(id, info) {
      if (typeof id !== 'string' || !id) {
        return null;
      }
      const existing = registry.players.get(id);
      if (existing) {
        if (info && typeof info === 'object') {
          if (typeof info.name === 'string' && info.name.trim()) {
            existing.name = info.name.trim();
          }
          if (typeof info.slot === 'string' && !existing.slot) {
            existing.slot = info.slot;
          }
        }
        return existing;
      }

      const details = info && typeof info === 'object' ? info : {};
      const slot = typeof details.slot === 'string' ? details.slot : null;

      let spawn = details.spawn;
      if (!spawn) {
        if (slot === 'p1' && registry.spawnPoints.length > 0) {
          spawn = registry.spawnPoints[0];
        } else if (slot === 'p2' && registry.spawnPoints.length > 1) {
          spawn = registry.spawnPoints[1];
        } else {
          const index = registry.players.size % registry.spawnPoints.length;
          spawn = registry.spawnPoints[index] || registry.spawnPoints[0];
        }
      }
      spawn = normalizeSpawn(spawn, registry.playRect, spawn && spawn.facing ? spawn.facing : 1);

      const player = {
        id,
        slot,
        name: typeof details.name === 'string' && details.name.trim() ? details.name.trim() : 'Player',
        x: spawn.x,
        y: spawn.y,
        vx: 0,
        vy: 0,
        onGround: true,
        facing: spawn.facing || 1,
        halfWidth: Number.isFinite(details.halfWidth) ? details.halfWidth : HALF_WIDTH,
        halfHeight: Number.isFinite(details.halfHeight) ? details.halfHeight : HALF_HEIGHT,
      };

      registry.players.set(id, player);
      registry.inputs.set(id, { mx: 0, ju: 0 });
      clampPlayerToPlayRect(player, registry.playRect);
      return player;
    };

    registry.removePlayer = function removePlayer(id) {
      if (typeof id !== 'string') {
        return false;
      }
      registry.inputs.delete(id);
      return registry.players.delete(id);
    };

    registry.setInput = function setInput(id, input) {
      if (typeof id !== 'string') {
        return;
      }
      const normalized = normalizeInput(input);
      registry.inputs.set(id, normalized);
    };

    registry.fixedStep = function fixedStep(dt) {
      serverFixedStep(registry, dt);
    };

    registry.getPlayer = function getPlayer(id) {
      const player = registry.players.get(id);
      return player ? clonePlayer(player) : null;
    };

    registry.getPlayers = function getPlayers() {
      return Array.from(registry.players.values()).map(clonePlayer);
    };

    registry.setPlayRect = function setPlayRect(rect) {
      registry.playRect = normalizePlayRect(rect);
      registry.spawnPoints = computeSpawnPoints(registry.baseSpawnPoints, registry.playRect);
      registry.players.forEach((player) => {
        clampPlayerToPlayRect(player, registry.playRect);
      });
    };

    return registry;
  }

  const api = {
    SPEED,
    ACCEL,
    FRICTION,
    JUMP_V,
    GRAVITY,
    createRegistry,
    serverFixedStep,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }

  if (global && typeof global === 'object') {
    const existing = global.StickFightHostServer && typeof global.StickFightHostServer === 'object'
      ? global.StickFightHostServer
      : {};
    existing.SPEED = SPEED;
    existing.ACCEL = ACCEL;
    existing.FRICTION = FRICTION;
    existing.JUMP_V = JUMP_V;
    existing.GRAVITY = GRAVITY;
    existing.createRegistry = createRegistry;
    existing.serverFixedStep = serverFixedStep;
    global.StickFightHostServer = existing;
  }
})(typeof window !== 'undefined' ? window : typeof globalThis !== 'undefined' ? globalThis : this);

