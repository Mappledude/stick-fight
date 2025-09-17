(function () {
  function isMobileUA() {
    var ua = (navigator && navigator.userAgent) ? navigator.userAgent : '';
    ua = ua.toLowerCase();
    return /iphone|ipad|ipod|android|mobile/.test(ua);
  }

  const SPEED = 220;
  const ACCEL = 1200;
  const FRICTION = 1600;
  const AIR_ACCEL = 620;
  const AIR_DRAG = 2.25;
  const MAX_VEL = 240;
  const JUMP_SPEED = 560;
  const JUMP_HORIZONTAL_SPEED = 260;
  const CROUCH_SPEED_SCALE = 0.35;
  const JOY_OUTER_R_BASE = 92;
  const JOY_KNOB_R_BASE = Math.round(JOY_OUTER_R_BASE * 0.4);
  const JOY_MOBILE_SCALE = isMobileUA() ? 0.7 : 1;
  const JOY_OUTER_R = Math.round(JOY_OUTER_R_BASE * JOY_MOBILE_SCALE);
  const JOY_KNOB_R = Math.round(JOY_KNOB_R_BASE * JOY_MOBILE_SCALE);
  const JOY_HIT_PADDING = 10;
  const JOYSTICK_DEADZONE = 0.22;
  const JOYSTICK_JUMP_THRESHOLD = 0.48;
  const JOYSTICK_JUMP_HORIZONTAL_THRESHOLD = 0.32;
  const JOYSTICK_CROUCH_THRESHOLD = 0.45;
  const GRAVITY_Y = 2200;
  const MIN_LAYOUT_WIDTH = 320;
  const MIN_LAYOUT_HEIGHT = 180;
  const LAYOUT_POLL_INTERVAL = 16;
  const LAYOUT_POLL_TIMEOUT = 500;
  const JOY_TRACE_INTERVAL = 250;
  const PLAY_ASPECT_MIN = 4 / 3;
  const PLAY_ASPECT_MAX = 16 / 9;

  function parsePlayPadOverride(value) {
    if (typeof value !== 'string') {
      return null;
    }
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }
    const parsed = parseFloat(trimmed);
    if (!Number.isFinite(parsed) || parsed < 0) {
      return null;
    }
    return parsed;
  }

  function shrinkRect(rect, factor) {
    if (!rect) {
      return rect;
    }
    var ratio = 1 - (typeof factor === 'number' ? factor : 0);
    if (ratio < 0) {
      ratio = 0;
    }
    var cx = rect.x + rect.w * 0.5;
    var cy = rect.y + rect.h * 0.5;
    var w2 = rect.w * ratio;
    var h2 = rect.h * ratio;
    return { x: cx - w2 * 0.5, y: cy - h2 * 0.5, w: w2, h: h2 };
  }

  function computePlayArea(viewW, viewH, padOverride) {
    const safeViewW = Math.max(Math.round(viewW || 0), 0);
    const safeViewH = Math.max(Math.round(viewH || 0), 0);
    const PAD = 12;
    const EDGE = Math.round(Math.min(safeViewW, safeViewH) * 0.03);
    const resolvedPad = typeof padOverride === 'number' ? Math.max(padOverride, 0) : Math.max(PAD, EDGE);

    const availableWidth = Math.max(safeViewW - resolvedPad * 2, MIN_LAYOUT_WIDTH);
    const availableHeight = Math.max(safeViewH - resolvedPad * 2, MIN_LAYOUT_HEIGHT);

    let width = availableWidth;
    let height = availableHeight;

    if (width <= 0 || height <= 0) {
      width = Math.max(width, MIN_LAYOUT_WIDTH);
      height = Math.max(height, MIN_LAYOUT_HEIGHT);
    }

    let aspect = width / height;

    if (aspect < PLAY_ASPECT_MIN) {
      const targetHeight = width / PLAY_ASPECT_MIN;
      if (targetHeight >= MIN_LAYOUT_HEIGHT) {
        height = Math.min(height, targetHeight);
      } else {
        const targetWidth = height * PLAY_ASPECT_MIN;
        width = Math.max(MIN_LAYOUT_WIDTH, Math.min(width, targetWidth));
      }
    } else if (aspect > PLAY_ASPECT_MAX) {
      const targetWidth = height * PLAY_ASPECT_MAX;
      if (targetWidth >= MIN_LAYOUT_WIDTH) {
        width = Math.min(width, targetWidth);
      } else {
        const targetHeight = width / PLAY_ASPECT_MAX;
        height = Math.max(MIN_LAYOUT_HEIGHT, Math.min(height, targetHeight));
      }
    }

    width = Math.max(Math.min(width, availableWidth), MIN_LAYOUT_WIDTH);
    height = Math.max(Math.min(height, availableHeight), MIN_LAYOUT_HEIGHT);

    const x = Math.round((safeViewW - width) / 2);
    const y = Math.round((safeViewH - height) / 2);

    let result = { x, y, w: Math.round(width), h: Math.round(height) };

    if (isMobileUA()) {
      const shrunk = shrinkRect(result, 0.3);
      if (shrunk && typeof shrunk.w === 'number' && typeof shrunk.h === 'number') {
        const centerX = shrunk.x + shrunk.w * 0.5;
        const centerY = shrunk.y + shrunk.h * 0.5;
        const width2 = Math.max(shrunk.w, MIN_LAYOUT_WIDTH);
        const height2 = Math.max(shrunk.h, MIN_LAYOUT_HEIGHT);
        result = {
          x: Math.round(centerX - width2 * 0.5),
          y: Math.round(centerY - height2 * 0.5),
          w: Math.round(width2),
          h: Math.round(height2),
        };
      } else {
        result = {
          x: Math.round(result.x),
          y: Math.round(result.y),
          w: Math.round(result.w),
          h: Math.round(result.h),
        };
      }
    }

    return result;
  }

  function clampToPlay(target, play) {
    if (!target || !play) {
      return { changedX: false, changedY: false };
    }
    const body = target.body || null;
    const halfWidth = body && typeof body.halfWidth === 'number'
      ? body.halfWidth
      : body && typeof body.width === 'number'
      ? body.width / 2
      : 14;
    const halfHeight = body && typeof body.halfHeight === 'number'
      ? body.halfHeight
      : body && typeof body.height === 'number'
      ? body.height / 2
      : 32;

    const minX = play.x + halfWidth;
    const maxX = play.x + play.w - halfWidth;
    const minY = play.y + halfHeight;
    const maxY = play.y + play.h - halfHeight;

    const clampedX = Phaser.Math.Clamp(target.x, minX, maxX);
    const clampedY = Phaser.Math.Clamp(target.y, minY, maxY);

    const changedX = clampedX !== target.x;
    const changedY = clampedY !== target.y;

    if (changedX) {
      if (typeof target.setX === 'function') {
        target.setX(clampedX);
      } else {
        target.x = clampedX;
      }
    }

    if (changedY) {
      if (typeof target.setY === 'function') {
        target.setY(clampedY);
      } else {
        target.y = clampedY;
      }
    }

    return { changedX, changedY };
  }

  const traceControls = (() => {
    const state = {
      lastTraceTime: 0,
      overlay: null,
    };

    const getSceneTime = (scene) => {
      if (scene && scene.time && typeof scene.time.now === 'number') {
        return scene.time.now;
      }
      return Date.now();
    };

    const ensureOverlay = (scene) => {
      if (!scene || !scene.add) {
        return null;
      }
      if (state.overlay && state.overlay.scene === scene) {
        return state.overlay;
      }
      if (state.overlay && state.overlay.scene !== scene) {
        state.overlay.destroy();
        state.overlay = null;
      }

      const text = scene.add
        .text(12, 12, '', {
          fontFamily: 'monospace',
          fontSize: '12px',
          color: '#00ff99',
        })
        .setOrigin(0, 0)
        .setScrollFactor(0)
        .setDepth(1000)
        .setVisible(true);

      state.overlay = text;

      if (scene.events && typeof scene.events.once === 'function') {
        scene.events.once('shutdown', () => {
          if (state.overlay) {
            state.overlay.destroy();
            state.overlay = null;
          }
        });
      }

      return text;
    };

    const hideOverlay = () => {
      if (!state.overlay) {
        return;
      }
      if (!state.overlay.scene) {
        state.overlay = null;
        return;
      }
      state.overlay.setVisible(false);
      if (typeof state.overlay.setText === 'function') {
        state.overlay.setText('');
      }
    };

    const extractPointerMeta = (joystick) => {
      if (!joystick || !joystick._joyDiagLastEvent) {
        return null;
      }
      const last = joystick._joyDiagLastEvent;
      return {
        type: last.type,
        pointerId: last.pointerId,
        clientX: last.clientX,
        clientY: last.clientY,
        preventDefault: !!last.preventDefault,
      };
    };

    return function traceControls(scene) {
      const diagnosticsActive = !!(
        scene &&
        typeof scene.diagnosticsActive === 'function' &&
        scene.diagnosticsActive()
      );

      if (!diagnosticsActive) {
        hideOverlay();
        return;
      }

      const overlay = ensureOverlay(scene);
      if (overlay) {
        overlay.setVisible(true);
      }

      const now = getSceneTime(scene);
      const payload = [];

      const players = ['p1', 'p2'];
      for (let index = 0; index < players.length; index += 1) {
        const playerKey = players[index];
        const joystick = scene && scene.virtualJoysticks ? scene.virtualJoysticks[playerKey] : null;
        const vector = joystick ? joystick.getVector() : { x: 0, y: 0, magnitude: 0 };
        const pressed = !!(joystick && joystick.isActive && joystick.isActive());
        const pointerMeta = extractPointerMeta(joystick);
        const inputSnapshot = scene && scene.joystickSnapshots ? scene.joystickSnapshots[playerKey] : null;
        const mappedInput = scene && typeof scene.getPlayerInput === 'function'
          ? scene.getPlayerInput(playerKey)
          : null;
        const fighter = scene && scene._fighters ? scene._fighters[index] : null;
        const body = fighter ? /** @type {Phaser.Physics.Arcade.Body} */ (fighter.body) : null;
        const bodyOnFloor = body && body.onFloor && typeof body.onFloor === 'function'
          ? body.onFloor.call(body)
          : false;
        const onGround = !!(
          body &&
          (body.blocked && body.blocked.down || body.touching && body.touching.down || bodyOnFloor)
        );
        const canControl = fighter ? !fighter.isAttacking : false;
        const resolvedMoveX = mappedInput ? Phaser.Math.Clamp(mappedInput.moveX || 0, -1, 1) : 0;
        const moveInput = canControl ? resolvedMoveX : 0;
        let targetVelocity = moveInput * SPEED;
        if (fighter && fighter.isCrouching) {
          targetVelocity *= CROUCH_SPEED_SCALE;
        }
        const velocityX = body && body.velocity ? body.velocity.x : 0;
        const inputReset = !!(joystick && joystick._joyDiagInputReset);
        if (joystick) {
          joystick._joyDiagInputReset = false;
        }

        const data = {
          player: playerKey,
          joystick: {
            pressed,
            normX: vector.x,
            normY: vector.y,
            mag: vector.magnitude,
          },
          pointer: pointerMeta,
          inputs: {
            joystick: inputSnapshot
              ? {
                  moveX: inputSnapshot.moveX,
                  crouch: inputSnapshot.crouch,
                  jumpUp: inputSnapshot.jumpUp,
                  jumpForward: inputSnapshot.jumpForward,
                  jumpBack: inputSnapshot.jumpBack,
                }
              : null,
            mapped: mappedInput
              ? {
                  moveX: mappedInput.moveX,
                  crouch: mappedInput.crouch,
                  jumpUp: mappedInput.jumpUp,
                  jumpForward: mappedInput.jumpForward,
                  jumpBack: mappedInput.jumpBack,
                }
              : null,
          },
          movement: {
            targetV: targetVelocity,
            velocityX,
            onGround,
            isAttacking: fighter ? !!fighter.isAttacking : false,
          },
          inputReset,
        };

        if (index === 0 || joystick || fighter) {
          payload.push(data);
        }

        if (diagnosticsActive && joystick && typeof scene.logJoyDiag === 'function') {
          scene.logJoyDiag('joystick:deadzone', {
            context: 'trace',
            player: playerKey,
            radius: typeof joystick.radius === 'number' ? joystick.radius : null,
            deadzone: typeof joystick.deadzone === 'number' ? joystick.deadzone : null,
            magnitude: vector.magnitude,
            source: scene._joystickDeadzoneSource || 'default',
          });
        }

        if (index === 0 && overlay) {
          const format = (value, digits = 2) =>
            typeof value === 'number' && isFinite(value) ? value.toFixed(digits) : '0.00';
          const overlayText =
            `P1 press:${pressed ? '1' : '0'} ` +
            `nx:${format(vector.x)} ` +
            `mx:${format(resolvedMoveX)} ` +
            `vel:${format(velocityX, 1)}`;
          overlay.setText(overlayText);
        }
      }

      if (now - state.lastTraceTime >= JOY_TRACE_INTERVAL) {
        state.lastTraceTime = now;
        if (scene && typeof scene.logJoyDiag === 'function') {
          scene.logJoyDiag('trace', { time: now, players: payload });
        } else if (typeof console !== 'undefined' && console) {
          console.log('[JoyDiag] trace', { time: now, players: payload });
        }
      }
    };
  })();

  const preventDefaultScroll = (event) => {
    if (event.touches && event.touches.length > 1) {
      return;
    }
    event.preventDefault();
  };

  document.body.addEventListener('touchmove', preventDefaultScroll, { passive: false });

  const centerText = (scene, content, offsetY = 0, style = {}) => {
    const textStyle = {
      fontFamily: 'Arial, sans-serif',
      fontSize: '48px',
      color: '#ffffff',
      align: 'center',
      ...style,
    };

    const text = scene.add
      .text(0, 0, content, textStyle)
      .setOrigin(0.5, 0.5)
      .setDepth(20)
      .setAlpha(1)
      .setVisible(true);

    const updatePosition = () => {
      const { width, height } = scene.scale.gameSize;
      text.setPosition(width / 2, height / 2 + offsetY);
    };

    updatePosition();

    if (!scene._centeredElements) {
      scene._centeredElements = [];
    }
    scene._centeredElements.push(updatePosition);

    return text;
  };

  class VirtualJoystick extends Phaser.GameObjects.Container {
    constructor(scene, x, y, config = {}) {
      super(scene, x, y);

      scene.add.existing(this);
      this.radius = typeof config.radius === 'number' ? config.radius : JOY_OUTER_R;
      const resolvedInnerRadius =
        typeof config.innerRadius === 'number' ? config.innerRadius : JOY_KNOB_R;
      this.innerRadius = Math.max(12, Math.min(resolvedInnerRadius, this.radius));
      this.deadzone =
        typeof config.deadzone === 'number' ? Math.max(0, config.deadzone) : JOYSTICK_DEADZONE;
      const providedHitPadding =
        typeof config.hitPadding === 'number' ? config.hitPadding : JOY_HIT_PADDING;
      this.hitPadding = Math.max(providedHitPadding, JOY_HIT_PADDING);
      this.playerKey = config.playerKey || null;
      this.pointerId = null;
      this.vector = new Phaser.Math.Vector2(0, 0);
      this.magnitude = 0;
      this.enabled = true;
      this._joyDiagLastEvent = null;
      this._joyDiagInputReset = false;

      this.setScrollFactor(0);
      this.setSize((this.radius + this.hitPadding) * 2, (this.radius + this.hitPadding) * 2);
      this.setDepth(25);
      this.setAlpha(1);
      this.setVisible(true);

      const outer = scene.add.circle(0, 0, this.radius, 0x000000, 0.32);
      outer.setStrokeStyle(4, 0xffffff, 0.65);

      const inner = scene.add.circle(0, 0, this.innerRadius, 0xffffff, 0.78);
      inner.setStrokeStyle(2, 0xffffff, 0.92);

      this.add([outer, inner]);
      this.outerRing = outer;
      this.knob = inner;

      this.setInteractive(
        new Phaser.Geom.Circle(0, 0, this.radius + this.hitPadding),
        Phaser.Geom.Circle.Contains
      );

      if (this.diagnosticsEnabled()) {
        const hitRadius = this.radius + this.hitPadding;
        const sceneInput = scene.input || null;
        const interactive = this.input || null;
        const hitArea = interactive && interactive.hitArea ? interactive.hitArea : null;
        const hitAreaType = hitArea
          ? hitArea.type || (hitArea.constructor && hitArea.constructor.name) || null
          : null;
        const hitAreaSize = hitArea
          ? {
              radius: typeof hitArea.radius === 'number' ? hitArea.radius : null,
              width:
                typeof hitArea.width === 'number'
                  ? hitArea.width
                  : typeof hitArea.radius === 'number'
                  ? hitArea.radius * 2
                  : null,
              height:
                typeof hitArea.height === 'number'
                  ? hitArea.height
                  : typeof hitArea.radius === 'number'
                  ? hitArea.radius * 2
                  : null,
            }
          : null;

        this.logDiagnostics('setup', {
          hasInput: !!interactive,
          inputPlugin: {
            enabled: sceneInput ? !!sceneInput.enabled : null,
          },
          hitArea: { radius: hitRadius, diameter: hitRadius * 2 },
          hitAreaMeta: hitArea
            ? {
                type: hitAreaType,
                size: hitAreaSize,
              }
            : null,
          cursor: interactive ? interactive.cursor : null,
          depths: {
            container: this.depth,
            outerRing: this.outerRing ? this.outerRing.depth : undefined,
            knob: this.knob ? this.knob.depth : undefined,
          },
        });
      }

      this.on(
        'pointerdown',
        function (pointer) {
          this.handlePointerDown(pointer, 'pointerdown');
        },
        this
      );
      this.on(
        'pointermove',
        function (pointer) {
          this.handlePointerMove(pointer, 'pointermove');
        },
        this
      );
      this.on(
        'pointerup',
        function (pointer) {
          this.handlePointerUp(pointer, 'pointerup');
        },
        this
      );
      this.on(
        'pointerupoutside',
        function (pointer) {
          this.handlePointerUp(pointer, 'pointerupoutside');
        },
        this
      );
      this.on(
        'pointercancel',
        function (pointer) {
          this.handlePointerUp(pointer, 'pointercancel');
        },
        this
      );
      this.on(
        'pointerout',
        function (pointer) {
          this.handlePointerUp(pointer, 'pointerout');
        },
        this
      );
      this.on(
        'lostpointercapture',
        function (pointer) {
          this.handlePointerUp(pointer, 'lostpointercapture');
        },
        this
      );

      if (this.diagnosticsEnabled()) {
        const source = scene && scene._joystickDeadzoneSource ? scene._joystickDeadzoneSource : 'default';
        this.logDiagnostics('deadzone', {
          context: 'create',
          radius: this.radius,
          deadzone: this.deadzone,
          magnitude: this.magnitude,
          source,
        });
      }

      this.scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
        this.reset();
        this.destroy(true);
      });
    }

    getPointerId(pointer) {
      if (!pointer) {
        return null;
      }
      if (typeof pointer.id !== 'undefined') {
        return pointer.id;
      }
      if (typeof pointer.pointerId !== 'undefined') {
        return pointer.pointerId;
      }
      if (typeof pointer.identifier !== 'undefined') {
        return pointer.identifier;
      }
      return 'mouse';
    }

    setControlEnabled(enabled) {
      this.enabled = !!enabled;
      if (this.input) {
        this.input.enabled = this.enabled;
      }
      if (!this.enabled) {
        this.reset();
      }
    }

    isEnabled() {
      return this.enabled;
    }

    isActive() {
      return this.pointerId !== null && this.magnitude > this.deadzone;
    }

    handlePointerDown(pointer, eventType = 'pointerdown') {
      const outcome = this.withDiagnostics(eventType, pointer, (ptr, pointerId, diag) => {
        if (!this.enabled) {
          return false;
        }
        if (this.pointerId !== null && this.pointerId !== pointerId) {
          return false;
        }
        this.pointerId = pointerId;
        if (this.scene && typeof this.scene.preventPointerDefault === 'function') {
          diag.preventDefault = this.scene.preventPointerDefault(ptr);
        }
        this.updateFromPointer(ptr);
        this.emit('joystickstart', this.vector);
        return true;
      });
      if (this.diagnosticsEnabled() && outcome) {
        this.storeJoyDiagEvent(eventType, pointer, outcome.pointerId, outcome.diagContext);
      }
      return outcome.result;
    }

    handlePointerMove(pointer, eventType = 'pointermove') {
      const outcome = this.withDiagnostics(eventType, pointer, (ptr, pointerId, diag) => {
        if (!this.enabled) {
          return false;
        }
        if (this.pointerId !== pointerId) {
          return false;
        }
        if (this.scene && typeof this.scene.preventPointerDefault === 'function') {
          diag.preventDefault = this.scene.preventPointerDefault(ptr);
        }
        this.updateFromPointer(ptr);
        this.emit('joystickmove', this.vector);
        return true;
      });
      if (this.diagnosticsEnabled() && outcome) {
        this.storeJoyDiagEvent(eventType, pointer, outcome.pointerId, outcome.diagContext);
      }
      return outcome.result;
    }

    handlePointerUp(pointer, eventType = 'pointerup') {
      const outcome = this.withDiagnostics(eventType, pointer, (ptr, pointerId, diag) => {
        if (this.pointerId !== null && pointerId !== null && this.pointerId !== pointerId) {
          return false;
        }
        if (this.scene && typeof this.scene.preventPointerDefault === 'function') {
          diag.preventDefault = this.scene.preventPointerDefault(ptr);
        }
        this.reset();
        this.emit('joystickend');
        return true;
      });
      if (this.diagnosticsEnabled() && outcome) {
        this.storeJoyDiagEvent(eventType, pointer, outcome.pointerId, outcome.diagContext);
      }
      return outcome.result;
    }

    getLocalPointerDelta(pointer) {
      if (!pointer) {
        return { x: 0, y: 0 };
      }
      const worldX = typeof pointer.worldX === 'number' ? pointer.worldX : pointer.x;
      const worldY = typeof pointer.worldY === 'number' ? pointer.worldY : pointer.y;
      return { x: worldX - this.x, y: worldY - this.y };
    }

    updateFromPointer(pointer) {
      const { x: dx, y: dy } = this.getLocalPointerDelta(pointer);
      const distance = Math.sqrt(dx * dx + dy * dy);
      const clampedDistance = Math.min(distance, this.radius);
      const angle = Math.atan2(dy, dx);
      const knobX = Math.cos(angle) * clampedDistance;
      const knobY = Math.sin(angle) * clampedDistance;

      this.knob.setPosition(knobX, knobY);

      const normalizedMagnitude = clampedDistance / this.radius;
      if (normalizedMagnitude < this.deadzone) {
        this.vector.set(0, 0);
        this.magnitude = 0;
        return;
      }

      this.magnitude = normalizedMagnitude;
      this.vector.set(
        Phaser.Math.Clamp(knobX / this.radius, -1, 1),
        Phaser.Math.Clamp(knobY / this.radius, -1, 1)
      );
    }

    diagnosticsEnabled() {
      return !!(this.scene && this.scene._joyDiagEnabled);
    }

    logDiagnostics(eventType, details) {
      const payload = Object.assign({ player: this.playerKey || null }, details);
      const scene = this.scene;
      if (scene && typeof scene.logJoyDiag === 'function') {
        scene.logJoyDiag(`joystick:${eventType}`, payload);
        return;
      }
      console.log('[VirtualJoystick]', eventType, payload);
    }

    withDiagnostics(eventType, pointer, handler) {
      const diagnosticsActive = this.diagnosticsEnabled();
      const pointerId = this.getPointerId(pointer);
      const prevKnobPos = this.knob
        ? { x: this.knob.x, y: this.knob.y }
        : { x: 0, y: 0 };
      const localDelta = diagnosticsActive ? this.getLocalPointerDelta(pointer) : null;
      const diagContext = { preventDefault: null };

      const result = handler(pointer, pointerId, diagContext);

      if (diagnosticsActive) {
        const newKnobPos = this.knob
          ? { x: this.knob.x, y: this.knob.y }
          : { x: 0, y: 0 };
        const moved = newKnobPos.x !== prevKnobPos.x || newKnobPos.y !== prevKnobPos.y;
        this.logDiagnostics(eventType, {
          eventType,
          pointerId,
          local: localDelta,
          pointer: this.extractPointerScreenPage(pointer),
          knob: { previous: prevKnobPos, next: newKnobPos },
          moved,
          result,
          preventDefault: diagContext.preventDefault,
        });
      }

      return { result, pointerId, diagContext };
    }

    extractPointerScreenPage(pointer) {
      if (!pointer) {
        return null;
      }
      const event = pointer.event || pointer.originalEvent || null;
      const getCoord = (prop) => {
        if (typeof pointer[prop] === 'number') {
          return pointer[prop];
        }
        if (event && typeof event[prop] === 'number') {
          return event[prop];
        }
        return null;
      };
      const screenX = getCoord('screenX');
      const screenY = getCoord('screenY');
      const pageX = getCoord('pageX');
      const pageY = getCoord('pageY');
      if (screenX === null && screenY === null && pageX === null && pageY === null) {
        return null;
      }
      return {
        screen: { x: screenX, y: screenY },
        page: { x: pageX, y: pageY },
      };
    }

    storeJoyDiagEvent(eventType, pointer, pointerId, diagContext) {
      if (!this.diagnosticsEnabled()) {
        return;
      }
      const event = pointer && (pointer.event || pointer.originalEvent);
      const getCoord = (prop) => {
        if (pointer && typeof pointer[prop] === 'number') {
          return pointer[prop];
        }
        if (event && typeof event[prop] === 'number') {
          return event[prop];
        }
        return null;
      };

      let preventDefault = null;
      if (diagContext && typeof diagContext.preventDefault !== 'undefined') {
        preventDefault = diagContext.preventDefault;
      }
      if (preventDefault === null && event) {
        preventDefault = !!event.defaultPrevented;
      }

      this._joyDiagLastEvent = {
        type: eventType,
        pointerId,
        clientX: getCoord('clientX'),
        clientY: getCoord('clientY'),
        preventDefault: !!preventDefault,
      };
    }

    reset() {
      this.pointerId = null;
      this.vector.set(0, 0);
      this.magnitude = 0;
      if (this.knob) {
        this.knob.setPosition(0, 0);
      }
      if (this.diagnosticsEnabled()) {
        this._joyDiagInputReset = true;
      }
    }

    getVector() {
      return { x: this.vector.x, y: this.vector.y, magnitude: this.magnitude };
    }
  }

  class Stick extends Phaser.GameObjects.Container {
    constructor(scene, x, y, config = {}) {
      super(scene, x, y);

      scene.add.existing(this);
      this.setDepth(10);
      this.setAlpha(1);
      this.setVisible(true);

      const color = config.color != null ? config.color : 0xffffff;
      const lineWidth = config.lineWidth != null ? config.lineWidth : 4;

      const head = scene.add.circle(0, -20, 10, color, 1);
      head.setStrokeStyle(2, color, 1);

      const torso = scene.add.line(0, 0, 0, -10, 0, 12, color, 1);
      torso.setLineWidth(lineWidth, lineWidth);

      const armLeft = scene.add.line(0, -4, 0, -4, -14, 4, color, 1);
      armLeft.setLineWidth(lineWidth, lineWidth);

      const armRight = scene.add.line(0, -4, 0, -4, 14, 4, color, 1);
      armRight.setLineWidth(lineWidth, lineWidth);

      const legLeft = scene.add.line(0, 12, 0, 12, -10, 28, color, 1);
      legLeft.setLineWidth(lineWidth, lineWidth);

      const legRight = scene.add.line(0, 12, 0, 12, 10, 28, color, 1);
      legRight.setLineWidth(lineWidth, lineWidth);

      const parts = [legLeft, legRight, torso, armLeft, armRight, head];
      parts.forEach((part) => {
        if (part && typeof part.setAlpha === 'function') {
          part.setAlpha(1);
        }
        if (part && typeof part.setVisible === 'function') {
          part.setVisible(true);
        }
      });

      this.add(parts);

      this.setSize(28, 64);

      this.baseBodySize = { width: 28, height: 64 };
      this.crouchBodySize = { width: 28, height: 44 };
      this.crouchOffset = (this.baseBodySize.height - this.crouchBodySize.height) / 2;
      this._crouchOffsetApplied = 0;
      this.isCrouching = false;
      this.hp = 100;
      this.facing = config.facing === -1 ? -1 : 1;
      this.isAttacking = false;

      scene.physics.add.existing(this);
      const body = /** @type {Phaser.Physics.Arcade.Body} */ (this.body);
      body.setAllowGravity(true);
      body.setCollideWorldBounds(true);
      body.setSize(this.baseBodySize.width, this.baseBodySize.height, true);
      body.setMaxVelocity(MAX_VEL, JUMP_SPEED * 1.3);
      body.setDrag(0, 0);
      body.setBounce(0, 0);

      this.setScale(this.facing, 1);
    }

    setFacing(direction) {
      const dir = direction >= 0 ? 1 : -1;
      if (dir !== this.facing) {
        this.facing = dir;
        this.setScale(dir, 1);
      }
      return this;
    }

    setCrouching(crouching) {
      const body = /** @type {Phaser.Physics.Arcade.Body} */ (this.body);
      if (!body) {
        return this;
      }
      const shouldCrouch = !!crouching;
      if (shouldCrouch === this.isCrouching) {
        return this;
      }

      if (shouldCrouch) {
        body.setSize(this.baseBodySize.width, this.crouchBodySize.height, true);
        super.setY(this.y + this.crouchOffset);
        this._crouchOffsetApplied = this.crouchOffset;
      } else {
        body.setSize(this.baseBodySize.width, this.baseBodySize.height, true);
        if (this._crouchOffsetApplied) {
          super.setY(this.y - this._crouchOffsetApplied);
        }
        this._crouchOffsetApplied = 0;
      }

      this.isCrouching = shouldCrouch;
      return this;
    }

    update() {
      const body = /** @type {Phaser.Physics.Arcade.Body} */ (this.body);
      if (!body) {
        return;
      }

      const bounds = this.scene.physics.world.bounds;
      if (!bounds || bounds.width <= 0 || bounds.height <= 0) {
        return;
      }
      const halfWidth = body.width / 2;
      const halfHeight = body.height / 2;

      const clampedX = Phaser.Math.Clamp(this.x, bounds.x + halfWidth, bounds.right - halfWidth);
      const clampedY = Phaser.Math.Clamp(this.y, bounds.y + halfHeight, bounds.bottom - halfHeight);

      if (clampedX !== this.x) {
        super.setX(clampedX);
        body.setVelocityX(0);
      }

      if (clampedY !== this.y) {
        super.setY(clampedY);
        body.setVelocityY(0);
      }
    }
  }

  class MainScene extends Phaser.Scene {
    constructor() {
      super({ key: 'MainScene' });
      this.dt = 0;
      this._centeredElements = [];
      this.titleText = null;
      this.p1Input = this.createPlayerInputState();
      this.p2Input = this.createPlayerInputState();
      this.pointerStates = {
        p1: this.createPointerState(),
        p2: this.createPointerState(),
      };
      this.keyboardHoldStates = {
        p1: { left: false, right: false, crouch: false },
        p2: { left: false, right: false, crouch: false },
      };
      this.keyboardJumpQueue = {
        p1: { up: false, forward: false, back: false },
        p2: { up: false, forward: false, back: false },
      };
      this.touchButtons = { p1: {}, p2: {} };
      this.virtualJoysticks = { p1: null, p2: null };
      this.touchButtonsList = [];
      this.joystickList = [];
      this.touchButtonLayout = {
        size: 80,
        gap: 18,
        margin: 28,
        joystickRadius: JOY_OUTER_R,
      };
      const nav = typeof navigator !== 'undefined' ? navigator : null;
      const win = typeof window !== 'undefined' ? window : null;

      this._joystickDeadzone = JOYSTICK_DEADZONE;
      this._joystickDeadzoneSource = 'default';
      this._forceJoystick = false;
      this._forceKeyboard = false;
      this._joyDiagEnabled = false;
      this._joyDiagModes = this.getDefaultJoyDiagModes();

      this.playArea = { x: 0, y: 0, w: MIN_LAYOUT_WIDTH, h: MIN_LAYOUT_HEIGHT };
      this._playAreaPadOverride = null;
      this.playBorder = null;
      this._playAreaDiagText = null;
      this._playAreaDiagGrid = null;
      this._playAreaDiagLastText = null;

      const parseDebugFlag = (value) => {
        if (typeof value !== 'string') {
          return false;
        }
        const normalized = value.trim().toLowerCase();
        return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
      };

      if (win && win.location && typeof win.location.search === 'string') {
        const searchString = win.location.search;
        const joyDiagParser =
          win &&
          win.StickFightJoyDiag &&
          typeof win.StickFightJoyDiag.parseJoyDiagConfig === 'function'
            ? win.StickFightJoyDiag.parseJoyDiagConfig
            : null;
        const parsedJoyDiag = joyDiagParser ? joyDiagParser(searchString) : null;

        if (typeof URLSearchParams === 'function') {
          const params = new URLSearchParams(searchString);
          this._forceJoystick = parseDebugFlag(params.get('forceJoystick'));
          this._forceKeyboard = parseDebugFlag(params.get('forceKeyboard'));

          const playPadOverride = parsePlayPadOverride(params.get('playpad'));
          if (playPadOverride !== null) {
            this._playAreaPadOverride = playPadOverride;
          }

          if (parsedJoyDiag) {
            this.applyJoyDiagConfig(parsedJoyDiag);
          } else {
            this.applyJoyDiagConfig({
              enabled: parseDebugFlag(params.get('joydiag')),
              modes: {
                noControls: parseDebugFlag(params.get('nocontrols')),
                noJoystick: parseDebugFlag(params.get('nojoystick')),
                joystickOnly: parseDebugFlag(params.get('joyonly')),
                joyTest: parseDebugFlag(params.get('joytest')),
              },
            });
          }

          this.applyJoyDiagDeadzoneOverride(params.get('dz'), '?dz=');
        } else {
          const searchLower = searchString.toLowerCase();
          this._forceJoystick = /[?&]forcejoystick=(1|true|yes|on)\b/.test(searchLower);
          this._forceKeyboard = /[?&]forcekeyboard=(1|true|yes|on)\b/.test(searchLower);

          const playPadMatch = searchString.match(/[?&]playpad=([^&#]*)/i);
          const playPadValue = playPadMatch ? decodeURIComponent(playPadMatch[1]) : null;
          const playPadOverride = parsePlayPadOverride(playPadValue);
          if (playPadOverride !== null) {
            this._playAreaPadOverride = playPadOverride;
          }

          if (parsedJoyDiag) {
            this.applyJoyDiagConfig(parsedJoyDiag);
          } else {
            const joyDiagEnabled = /[?&]joydiag=(1|true|yes|on)\b/.test(searchLower);
            this.applyJoyDiagConfig({
              enabled: joyDiagEnabled,
              modes: {
                noControls:
                  joyDiagEnabled && /[?&]nocontrols=(1|true|yes|on)\b/.test(searchLower),
                noJoystick:
                  joyDiagEnabled && /[?&]nojoystick=(1|true|yes|on)\b/.test(searchLower),
                joystickOnly:
                  joyDiagEnabled && /[?&]joyonly=(1|true|yes|on)\b/.test(searchLower),
                joyTest: joyDiagEnabled && /[?&]joytest=(1|true|yes|on)\b/.test(searchLower),
              },
            });
          }

          const dzMatch = searchString.match(/[?&]dz=([^&#]*)/i);
          const dzValue = dzMatch ? decodeURIComponent(dzMatch[1]) : null;
          this.applyJoyDiagDeadzoneOverride(dzValue, '?dz=');
        }
      }

      const phaserTouchDevice =
        this.sys &&
        this.sys.game &&
        this.sys.game.device &&
        this.sys.game.device.input &&
        this.sys.game.device.input.touch;

      const hasTouchSupport = [
        nav && typeof nav.maxTouchPoints === 'number' && nav.maxTouchPoints > 0,
        nav && typeof nav.msMaxTouchPoints === 'number' && nav.msMaxTouchPoints > 0,
        win && 'ontouchstart' in win,
        win && typeof win.matchMedia === 'function' && win.matchMedia('(pointer: coarse)').matches,
        phaserTouchDevice,
      ].some(Boolean);

      if (this._forceKeyboard) {
        this._keyboardDetected = true;
      } else if (this._forceJoystick) {
        this._keyboardDetected = false;
      } else {
        this._keyboardDetected = !hasTouchSupport;
      }
      this._fighters = [];
      this.safeAreaInsets = { top: 0, right: 0, bottom: 0, left: 0 };
      this.debugOverlayVisible = false;
      this.debugText = null;
      this._joyDiagLogState = {
        css: { create: false, resize: false },
        depth: { create: false, resize: false },
      };
      this._joyTestLogPrinted = false;
      this._layoutReady = false;
      this._layoutReadyLogPrinted = false;
      this._resizeDebounceEvent = null;
      this._pendingResizeSize = null;
      this._joyDiagFrameIndex = 0;
      this._joyDiagFrameState = null;
      this._joyDiagOrderState = { lastSignature: null, lastFrame: null };
      this.joystickSnapshots = {
        p1: this.createJoystickSnapshot(),
        p2: this.createJoystickSnapshot(),
      };
      this.joystickPrevDirections = {
        p1: { up: false, forward: false, back: false },
        p2: { up: false, forward: false, back: false },
      };
    }

    getDefaultJoyDiagModes() {
      return {
        noControls: false,
        noJoystick: false,
        joystickOnly: false,
        joyTest: false,
      };
    }

    resetJoyDiagModes() {
      if (!this._joyDiagModes) {
        this._joyDiagModes = this.getDefaultJoyDiagModes();
        return;
      }
      Object.assign(this._joyDiagModes, this.getDefaultJoyDiagModes());
    }

    applyJoyDiagConfig(config) {
      const safeConfig = config || {};
      const modes = safeConfig.modes || {};
      this._joyDiagEnabled = !!safeConfig.enabled;
      if (!this._joyDiagEnabled) {
        this.resetJoyDiagModes();
        this._joystickDeadzone = JOYSTICK_DEADZONE;
        this._joystickDeadzoneSource = 'default';
        return;
      }
      this._joyDiagModes.noControls = !!modes.noControls;
      this._joyDiagModes.noJoystick = !!modes.noJoystick;
      this._joyDiagModes.joystickOnly = !!modes.joystickOnly;
      this._joyDiagModes.joyTest = !!modes.joyTest;
    }

    getJoystickDeadzone() {
      const value = this._joystickDeadzone;
      return typeof value === 'number' && isFinite(value) ? value : JOYSTICK_DEADZONE;
    }

    applyJoyDiagDeadzoneOverride(rawValue, sourceLabel) {
      const defaultDeadzone = JOYSTICK_DEADZONE;
      this._joystickDeadzone = defaultDeadzone;
      this._joystickDeadzoneSource = 'default';

      if (!this._joyDiagEnabled) {
        return;
      }

      if (typeof rawValue !== 'string' || rawValue.trim() === '') {
        return;
      }

      const parsed = parseFloat(rawValue);
      if (!Number.isFinite(parsed)) {
        this._joystickDeadzone = defaultDeadzone;
        if (this.diagnosticsActive()) {
          this.logJoyDiag('joystick:deadzone', {
            context: 'config',
            source: 'default',
            raw: rawValue,
            applied: this._joystickDeadzone,
            default: defaultDeadzone,
            overrideApplied: false,
          });
        }
        return;
      }

      const minDeadzone = 0;
      const maxDeadzone = 0.9;
      const clamped = Phaser.Math.Clamp(parsed, minDeadzone, maxDeadzone);

      this._joystickDeadzone = clamped;
      this._joystickDeadzoneSource = sourceLabel || 'override';

      if (this.diagnosticsActive()) {
        const payload = {
          context: 'config',
          source: this._joystickDeadzoneSource,
          raw: rawValue,
          applied: clamped,
          default: defaultDeadzone,
          overrideApplied: true,
          note: `${this._joystickDeadzoneSource} override active`,
        };
        if (clamped !== parsed) {
          payload.requested = parsed;
        }
        this.logJoyDiag('joystick:deadzone', payload);
      }
    }

    diagnosticsActive() {
      return !!this._joyDiagEnabled;
    }

    logJoyDiag(topic, payload) {
      if (!this.diagnosticsActive()) {
        return;
      }
      if (typeof console === 'undefined' || !console) {
        return;
      }
      const consoleFn = typeof console.info === 'function' ? console.info : console.log;
      try {
        consoleFn.call(console, `[JoyDiag] ${topic}`, payload);
      } catch (error) {
        console.log(`[JoyDiag] ${topic}`, payload, error);
      }
    }

    runJoyDiagChecks(context) {
      if (!this.diagnosticsActive()) {
        return;
      }
      this.auditCssConfiguration(context);
      this.auditDisplayDepths(context);
    }

    extractPointerId(pointer) {
      if (!pointer) {
        return null;
      }
      if (typeof pointer.id !== 'undefined') {
        return pointer.id;
      }
      if (typeof pointer.pointerId !== 'undefined') {
        return pointer.pointerId;
      }
      if (typeof pointer.identifier !== 'undefined') {
        return pointer.identifier;
      }
      return 'mouse';
    }

    logRendererOverride() {
      if (!this.diagnosticsActive()) {
        return;
      }
      if (typeof window === 'undefined' || !window.location) {
        return;
      }
      try {
        const params = new URLSearchParams(window.location.search || '');
        if (params.get('forceCanvas') === '1') {
          this.logJoyDiag('renderer', 'forceCanvas=1 override active');
        }
      } catch (error) {
        this.logJoyDiag('renderer', { error: error && error.message ? error.message : error });
      }
    }

    auditCssConfiguration(context) {
      if (!this.diagnosticsActive()) {
        return;
      }
      const state = this._joyDiagLogState && this._joyDiagLogState.css;
      const contextKey = context === 'resize' ? 'resize' : 'create';
      if (state && state[contextKey]) {
        return;
      }
      if (state) {
        state[contextKey] = true;
      }

      const details = { context: contextKey, canvas: null, root: null };
      if (
        typeof window !== 'undefined' &&
        window.getComputedStyle &&
        typeof document !== 'undefined'
      ) {
        const canvas = this.sys && this.sys.game ? this.sys.game.canvas : null;
        if (canvas) {
          const canvasStyle = canvas.style || {};
          const canvasStyles = window.getComputedStyle(canvas);
          details.canvas = {
            touchAction: canvasStyles.getPropertyValue('touch-action') || canvasStyle.touchAction || '',
            overscrollBehavior:
              canvasStyles.getPropertyValue('overscroll-behavior') || canvasStyle.overscrollBehavior || '',
            userSelect:
              canvasStyles.getPropertyValue('user-select') ||
              canvasStyle.userSelect ||
              canvasStyles.getPropertyValue('-webkit-user-select') ||
              canvasStyle.webkitUserSelect ||
              '',
          };
        }
        const root = document && document.documentElement ? document.documentElement : null;
        if (root) {
          const rootStyle = root.style || {};
          const rootStyles = window.getComputedStyle(root);
          details.root = {
            touchAction:
              rootStyles.getPropertyValue('touch-action') || rootStyle.touchAction || '',
            overscrollBehavior:
              rootStyles.getPropertyValue('overscroll-behavior') || rootStyle.overscrollBehavior || '',
            userSelect:
              rootStyles.getPropertyValue('user-select') ||
              rootStyle.userSelect ||
              rootStyles.getPropertyValue('-webkit-user-select') ||
              rootStyle.webkitUserSelect ||
              '',
          };
        }
      }

      this.logJoyDiag('css', details);
    }

    auditDisplayDepths(context) {
      if (!this.diagnosticsActive()) {
        return;
      }
      const state = this._joyDiagLogState && this._joyDiagLogState.depth;
      const contextKey = context === 'resize' ? 'resize' : 'create';
      if (state && state[contextKey]) {
        return;
      }
      if (state) {
        state[contextKey] = true;
      }

      const children = this.children && this.children.list ? this.children.list : [];
      const audit = [];
      for (let index = 0; index < children.length; index += 1) {
        const child = children[index];
        if (!child) {
          continue;
        }
        const entry = {
          index,
          type: child.type || (child.constructor ? child.constructor.name : 'Unknown'),
          depth: typeof child.depth === 'number' ? child.depth : null,
          name: child.name || null,
          width: typeof child.displayWidth === 'number' ? child.displayWidth : null,
          height: typeof child.displayHeight === 'number' ? child.displayHeight : null,
        };
        audit.push(entry);
      }

      this.logJoyDiag('depth', { context: contextKey, objects: audit });
    }

    ensureJoyDiagHudVisible() {
      if (!this.diagnosticsActive()) {
        return;
      }
      this.debugOverlayVisible = true;
      this.updateDebugOverlay();
    }

    runJoyTestSimulation() {
      if (!this.diagnosticsActive() || !this._joyDiagModes.joyTest) {
        return;
      }
      if (!this._joyTestLogPrinted) {
        this._joyTestLogPrinted = true;
        this.logJoyDiag('joytest', 'Simulated joystick input active');
      }

      const createPlayerAssertionState = () => ({
        pointerActive: false,
        pointerEngaged: false,
        moveObserved: false,
        velocityChanged: false,
        baselineVelocityX: null,
        velocitySampled: false,
        velocitySamples: 0,
        lastVelocityX: null,
      });

      const resetPlayerAssertionState = (state) => {
        if (!state) {
          return;
        }
        state.pointerActive = false;
        state.pointerEngaged = false;
        state.moveObserved = false;
        state.velocityChanged = false;
        state.baselineVelocityX = null;
        state.velocitySampled = false;
        state.velocitySamples = 0;
        state.lastVelocityX = null;
      };

      const now = this.time && typeof this.time.now === 'number' ? this.time.now : Date.now();
      if (!this._joyTestSimState) {
        this._joyTestSimState = {
          nextTick: now,
          stepIndex: -1,
          pointerByPlayer: {},
          sequence: [
            { normX: 0.8, normY: 0.1, mirrorX: true },
            { normX: 0.55, normY: -0.85, mirrorX: true },
            { normX: 0, normY: -1, mirrorX: false },
            { release: true },
            { normX: -0.75, normY: 0.35, mirrorX: true },
          ],
          assertion: {
            players: {
              p1: createPlayerAssertionState(),
              p2: createPlayerAssertionState(),
            },
          },
        };
      }

      const state = this._joyTestSimState;
      if (!state.assertion) {
        state.assertion = {
          players: {
            p1: createPlayerAssertionState(),
            p2: createPlayerAssertionState(),
          },
        };
      }
      if (now < state.nextTick) {
        return;
      }

      state.nextTick = now + 1000;
      state.stepIndex = (state.stepIndex + 1) % state.sequence.length;
      const step = state.sequence[state.stepIndex];

      const players = ['p1', 'p2'];
      const fighters = Array.isArray(this._fighters) ? this._fighters : [];
      for (let i = 0; i < players.length; i += 1) {
        const player = players[i];
        const joystick = this.virtualJoysticks[player];
        if (!joystick || !joystick.isEnabled()) {
          continue;
        }

        const playerAssertion = state.assertion.players[player] || createPlayerAssertionState();
        state.assertion.players[player] = playerAssertion;

        let pointer = state.pointerByPlayer[player];
        if (!pointer) {
          const pointerId = `joytest:${player}`;
          pointer = {
            id: pointerId,
            pointerId,
            identifier: pointerId,
            x: joystick.x,
            y: joystick.y,
            worldX: joystick.x,
            worldY: joystick.y,
          };
          state.pointerByPlayer[player] = pointer;
        }

        if (step.release) {
          if (joystick.pointerId !== null) {
            joystick.handlePointerUp(pointer, 'joytest:release');
          }
          playerAssertion.pointerActive = false;
          continue;
        }

        const applyPointerPosition = (targetX, targetY) => {
          const radius = joystick.radius || JOY_OUTER_R;
          const clampedX = Phaser.Math.Clamp(targetX, -1, 1) * radius;
          const clampedY = Phaser.Math.Clamp(targetY, -1, 1) * radius;
          const worldX = joystick.x + clampedX;
          const worldY = joystick.y + clampedY;
          pointer.x = worldX;
          pointer.y = worldY;
          pointer.worldX = worldX;
          pointer.worldY = worldY;
        };

        const targetNormX = step.mirrorX && player === 'p2' ? -step.normX : step.normX;
        const targetNormY = step.normY;
        applyPointerPosition(targetNormX, targetNormY);

        if (joystick.pointerId === null) {
          resetPlayerAssertionState(playerAssertion);
          playerAssertion.pointerActive = true;
          playerAssertion.pointerEngaged = true;
          const fighter = fighters[i];
          const body = fighter && fighter.body && fighter.body.velocity ? fighter.body : null;
          if (body && typeof body.velocity.x === 'number') {
            playerAssertion.baselineVelocityX = body.velocity.x;
            playerAssertion.lastVelocityX = body.velocity.x;
            playerAssertion.velocitySampled = true;
            playerAssertion.velocitySamples = 1;
          }
          joystick.handlePointerDown(pointer, 'joytest:down');
        }
        playerAssertion.pointerActive = true;
        joystick.handlePointerMove(pointer, 'joytest:move');

        if (playerAssertion.pointerActive) {
          const inputState = player === 'p2' ? this.p2Input : this.p1Input;
          if (
            inputState &&
            typeof inputState.moveX === 'number' &&
            Math.abs(inputState.moveX) > 0.001
          ) {
            playerAssertion.moveObserved = true;
          }

          const fighter = fighters[i];
          const body = fighter && fighter.body && fighter.body.velocity ? fighter.body : null;
          if (body && typeof body.velocity.x === 'number') {
            if (!playerAssertion.velocitySampled) {
              playerAssertion.baselineVelocityX = body.velocity.x;
              playerAssertion.lastVelocityX = body.velocity.x;
              playerAssertion.velocitySampled = true;
              playerAssertion.velocitySamples = 1;
            } else {
              playerAssertion.velocitySamples += 1;
              playerAssertion.lastVelocityX = body.velocity.x;
            }
            if (!playerAssertion.velocityChanged) {
              const diff = Math.abs(
                body.velocity.x - (playerAssertion.baselineVelocityX || 0)
              );
              if (diff > 0.001) {
                playerAssertion.velocityChanged = true;
              }
            }
          }
        }
      }

      if (step.release) {
        const report = { players: {} };
        let success = true;
        for (let index = 0; index < players.length; index += 1) {
          const player = players[index];
          const assertion = state.assertion.players[player];
          if (!assertion) {
            continue;
          }

          const engaged = !!assertion.pointerEngaged;
          const moveObserved = !!assertion.moveObserved;
          const velocityChanged = !!assertion.velocityChanged;
          const velocitySamples = assertion.velocitySamples || 0;
          const baselineVelocityX = assertion.baselineVelocityX;
          const lastVelocityX = assertion.lastVelocityX;

          report.players[player] = {
            engaged,
            moveObserved,
            velocityChanged,
            velocitySamples,
            baselineVelocityX,
            lastVelocityX,
          };

          if (engaged) {
            if (!moveObserved) {
              success = false;
              this.logJoyDiag('joytest:assert', `PIPELINE BREAK: mapping (${player})`);
            } else if (!velocityChanged) {
              success = false;
              const detail = velocitySamples > 1 ? '' : ' (no velocity update)';
              this.logJoyDiag('joytest:assert', `PIPELINE BREAK: movement (${player})${detail}`);
            }
          }

          resetPlayerAssertionState(assertion);
        }

        this.logJoyDiag('joytest:assert', {
          success,
          players: report.players,
        });
      }
    }

    getJoystickDiagnostics(player) {
      const snapshot = this.joystickSnapshots[player];
      const joystick = this.virtualJoysticks[player];
      const vector = joystick ? joystick.getVector() : { x: 0, y: 0, magnitude: 0 };
      const active = joystick ? joystick.isActive() : false;
      const normX = Number.isFinite(vector.x) ? vector.x : 0;
      const normY = Number.isFinite(vector.y) ? vector.y : 0;
      const magnitude = Number.isFinite(vector.magnitude) ? vector.magnitude : 0;
      const angle = active ? Phaser.Math.RadToDeg(Math.atan2(normY, normX)) : 0;
      const input = this.getPlayerInput(player);
      return {
        player,
        active,
        snapshot,
        normX,
        normY,
        magnitude,
        angle,
        buttons: input
          ? {
              punch: !!input.punch,
              kick: !!input.kick,
              crouch: !!input.crouch,
            }
          : { punch: false, kick: false, crouch: false },
      };
    }

    renderDiagHUD() {
      if (!this.diagnosticsActive()) {
        return '';
      }
      const lines = [];
      const renderer = this.sys && this.sys.game ? this.sys.game.config : null;
      const renderType = renderer && typeof renderer.renderType === 'number' ? renderer.renderType : null;
      const usingCanvas = renderType === Phaser.CANVAS;
      if (usingCanvas) {
        lines.push('Renderer: Canvas (forceCanvas=1)');
      } else {
        lines.push('Renderer: Auto');
      }

      const formatButton = (pressed) => (pressed ? 'YES' : 'NO').padEnd(3, ' ');

      const players = ['p1', 'p2'];
      for (let i = 0; i < players.length; i += 1) {
        const player = players[i];
        const diag = this.getJoystickDiagnostics(player);
        if (!diag.snapshot) {
          continue;
        }
        const moveX = Number.isFinite(diag.snapshot.moveX) ? diag.snapshot.moveX : 0;
        if (lines.length) {
          lines.push('');
        }
        const buttonLine =
          `  Pressed: Punch ${formatButton(diag.buttons.punch)}  Kick ${formatButton(diag.buttons.kick)}  Crouch ${formatButton(diag.buttons.crouch)}`;
        const normLine = `  normX: ${diag.normX.toFixed(2)}    normY: ${diag.normY.toFixed(2)}`;
        const angleLine = `  angle: ${diag.angle.toFixed(1)}°    magnitude: ${diag.magnitude.toFixed(2)}`;
        const stateLine = `  moveX: ${moveX.toFixed(2)}    active: ${diag.active ? 'yes' : 'no'}`;

        lines.push(`${player.toUpperCase()}`);
        lines.push(buttonLine);
        lines.push(normLine);
        lines.push(angleLine);
        lines.push(stateLine);
      }
      return lines.join('\n');
    }

    renderLegacyHUD() {
      const format = (value) => (value ? 'T' : 'F');
      const formatMove = (value) => {
        const safe = Number.isFinite(value) ? value : 0;
        return safe.toFixed(2);
      };
      const p1 = this.p1Input;
      const p2 = this.p2Input;
      const lines = [
        `P1 MX:${formatMove(p1.moveX)} C:${format(p1.crouch)} JU:${format(p1.jumpUp)} JF:${format(
          p1.jumpForward
        )} JB:${format(p1.jumpBack)} P:${format(p1.punch)} K:${format(p1.kick)}`,
        `P2 MX:${formatMove(p2.moveX)} C:${format(p2.crouch)} JU:${format(p2.jumpUp)} JF:${format(
          p2.jumpForward
        )} JB:${format(p2.jumpBack)} P:${format(p2.punch)} K:${format(p2.kick)}`,
      ];
      return lines.join('\n');
    }

    preload() {}

    create() {
      this.cameras.main.setBackgroundColor('#111');

      if (!this.playBorder && this.add && typeof this.add.graphics === 'function') {
        this.playBorder = this.add.graphics();
        this.playBorder.setDepth(9);
      }

      if (this.diagnosticsActive() && typeof console !== 'undefined' && console) {
        const modes = [];
        if (this._joyDiagModes.noControls) {
          modes.push('nocontrols');
        }
        if (this._joyDiagModes.noJoystick) {
          modes.push('nojoystick');
        }
        if (this._joyDiagModes.joystickOnly) {
          modes.push('joyonly');
        }
        if (this._joyDiagModes.joyTest) {
          modes.push('joytest');
        }
        const modeSummary = modes.length > 0 ? modes.join(', ') : 'default';
        const consoleFn = typeof console.info === 'function' ? console.info : console.log;
        consoleFn.call(console, `[JoyDiag] Active mode: ${modeSummary}`);
      }

      this.logRendererOverride();

      if (this.diagnosticsActive()) {
        const inputManager = this.input && this.input.manager ? this.input.manager : null;
        if (inputManager) {
          const config = inputManager.config || {};
          const touchPlugin = inputManager.touch || null;
          const topOnlyValue =
            typeof inputManager.topOnly === 'boolean'
              ? inputManager.topOnly
              : !!inputManager.topOnly;
          const touchDetails = touchPlugin
            ? {
                available: true,
                enabled:
                  typeof touchPlugin.enabled === 'boolean'
                    ? touchPlugin.enabled
                    : !!touchPlugin.enabled,
                capture: typeof touchPlugin.capture === 'boolean' ? touchPlugin.capture : null,
              }
            : { available: false };

          this.logJoyDiag('input', {
            pointersTotal:
              typeof inputManager.pointersTotal === 'number' ? inputManager.pointersTotal : null,
            pointersMax:
              typeof config.activePointers === 'number' ? config.activePointers : null,
            touch: touchDetails,
            setTopOnly: {
              value: topOnlyValue,
              method: typeof inputManager.setTopOnly,
            },
            config: {
              touch: typeof config.touch !== 'undefined' ? config.touch : null,
              inputQueue:
                typeof config.inputQueue !== 'undefined' ? config.inputQueue : null,
              disableContextMenu:
                typeof config.disableContextMenu !== 'undefined'
                  ? config.disableContextMenu
                  : null,
            },
          });
        }
      }

      const skipCenterText = this.diagnosticsActive() && this._joyDiagModes.joystickOnly;
      if (!skipCenterText) {
        this.titleText = centerText(this, 'Stick-Fight', -28, { fontSize: '56px', fontStyle: '700' });
        if (this.titleText && this.titleText.setInteractive) {
          this.titleText.setInteractive({ useHandCursor: false });
          this.titleText.on('pointerdown', (pointer) => {
            this.preventPointerDefault(pointer);
            this.toggleDebugOverlay();
          });
        }
        centerText(this, 'Main Scene Ready', 28, { fontSize: '24px', color: '#bbbbbb' });
      }

      this.registerTouchPrevention();
      this.createTouchControls();
      this.registerKeyboardControls();
      this.createDebugOverlay();
      this.logTouchControlsCreationDiagnostics();

      if (this.diagnosticsActive()) {
        this.ensureJoyDiagHudVisible();
        this.runJoyDiagChecks('create');
      } else {
        this.updateDebugOverlay();
      }

      this.scale.on('resize', this.handleResize, this);
      this.handleResize(this.scale.gameSize);

      this.waitForValidSize(() => this.initWorldAndSpawn());

      const pointerDownHandler = (pointer) => {
        if (this._forceKeyboard) {
          return;
        }
        let pointerEventType;
        if (pointer && pointer.event) {
          pointerEventType = pointer.event.type;
        }
        const isTouchPointer =
          !!pointer &&
          (pointer.pointerType === 'touch' ||
            pointer.pointerType === 'pen' ||
            pointer.wasTouch === true ||
            (typeof pointerEventType === 'string' && pointerEventType.startsWith('touch')));
        if (!isTouchPointer) {
          return;
        }
        const wasKeyboard = this._keyboardDetected;
        if (wasKeyboard) {
          this._keyboardDetected = false;
        }
        if (wasKeyboard || this._forceJoystick) {
          this.updateTouchControlsVisibility();
        }
      };
      this.input.on('pointerdown', pointerDownHandler);
      this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
        this.input.off('pointerdown', pointerDownHandler);
      });
    }

    waitForValidSize(callback) {
      const start =
        typeof performance !== 'undefined' && typeof performance.now === 'function'
          ? performance.now()
          : Date.now();

      const checkSize = () => {
        const size = this.scale ? this.scale.gameSize : null;
        const width = size ? size.width : 0;
        const height = size ? size.height : 0;

        if (width >= MIN_LAYOUT_WIDTH && height >= MIN_LAYOUT_HEIGHT) {
          if (!this._layoutReadyLogPrinted) {
            console.info(
              `[StickFight] layout ready: ${Math.round(width)}x${Math.round(height)}`
            );
            this._layoutReadyLogPrinted = true;
          }
          if (typeof callback === 'function') {
            callback();
          }
          return;
        }

        const now =
          typeof performance !== 'undefined' && typeof performance.now === 'function'
            ? performance.now()
            : Date.now();

        if (now - start >= LAYOUT_POLL_TIMEOUT) {
          if (!this._layoutReadyLogPrinted) {
            const reportedWidth = Math.round(width || 0);
            const reportedHeight = Math.round(height || 0);
            console.warn(
              `[StickFight] layout timeout after ${LAYOUT_POLL_TIMEOUT}ms (size: ${reportedWidth}x${reportedHeight})`
            );
            this._layoutReadyLogPrinted = true;
          }
          if (typeof callback === 'function') {
            callback();
          }
          return;
        }

        if (this.time && typeof this.time.delayedCall === 'function') {
          this.time.delayedCall(LAYOUT_POLL_INTERVAL, checkSize);
        } else if (
          typeof window !== 'undefined' &&
          typeof window.requestAnimationFrame === 'function'
        ) {
          window.requestAnimationFrame(checkSize);
        } else {
          setTimeout(checkSize, LAYOUT_POLL_INTERVAL);
        }
      };

      checkSize();
    }

    initWorldAndSpawn() {
      if (!this.physics || !this.physics.world) {
        return;
      }

      if (!this._layoutReady) {
        this._layoutReady = true;
      }

      const scaleSize = this.scale ? this.scale.gameSize : null;
      const pending = this._pendingResizeSize;
      const size =
        pending && pending.width >= MIN_LAYOUT_WIDTH && pending.height >= MIN_LAYOUT_HEIGHT
          ? pending
          : scaleSize;

      const fallbackScaleSize = this.scale ? this.scale.gameSize : null;
      const resolvedSource = size || fallbackScaleSize;
      const resolvedSize = resolvedSource
        ? { width: resolvedSource.width || 0, height: resolvedSource.height || 0 }
        : null;

      this.refreshWorldBounds(resolvedSize);

      if (!this._fighters || this._fighters.length === 0) {
        this.spawnFighters();
      }

      this.clampFightersToPlayArea();
      this.applyResize(resolvedSize);
      this._pendingResizeSize = resolvedSize;
    }

    refreshWorldBounds(gameSize) {
      if (!this.physics || !this.physics.world) {
        return;
      }
      const size = gameSize || this.scale.gameSize;
      if (!size) {
        return;
      }
      const width = Math.max(typeof size.width === 'number' ? size.width : 0, MIN_LAYOUT_WIDTH);
      const height = Math.max(
        typeof size.height === 'number' ? size.height : 0,
        MIN_LAYOUT_HEIGHT
      );
      const play = computePlayArea(width, height, this._playAreaPadOverride);
      this.playArea = play;

      if (this.diagnosticsActive()) {
        this.logJoyDiag('layout:playArea', {
          mobile: isMobileUA(),
          scale: JOY_MOBILE_SCALE,
          play: {
            x: play ? play.x : null,
            y: play ? play.y : null,
            w: play ? play.w : null,
            h: play ? play.h : null,
          },
          joystick: {
            outer: JOY_OUTER_R,
            knob: JOY_KNOB_R,
            hit: JOY_OUTER_R + JOY_HIT_PADDING,
          },
        });
      }
      this.physics.world.setBounds(play.x, play.y, play.w, play.h, true, true, true, true);

      const camera = this.cameras ? this.cameras.main : null;
      if (camera) {
        camera.setBounds(play.x, play.y, play.w, play.h);
        camera.setScroll(play.x, play.y);
      }

      this.updatePlayAreaBorder();
      this.updatePlayAreaDiagnostics(true);
    }

    clampFightersToPlayArea() {
      if (!this._fighters || !this.playArea) {
        return;
      }
      this._fighters.forEach((fighter) => {
        if (!fighter) {
          return;
        }
        const body = /** @type {Phaser.Physics.Arcade.Body} */ (fighter.body);
        const play = this.playArea;
        const result = clampToPlay(fighter, play);

        if (body) {
          if (result.changedX) {
            body.setVelocityX(0);
          }
          if (result.changedY) {
            body.setVelocityY(0);
          }
        }

        if (fighter.setAlpha) {
          fighter.setAlpha(1);
        }
        if (fighter.setVisible) {
          fighter.setVisible(true);
        }
      });
    }

    updatePlayAreaBorder() {
      if (!this.playBorder || !this.playArea) {
        return;
      }

      const play = this.playArea;
      const border = this.playBorder;

      border.clear();

      if (!play || play.w <= 0 || play.h <= 0) {
        border.setVisible(false);
        return;
      }

      border.setVisible(true);
      border.setDepth(9);
      border.lineStyle(3, 0xffffff, 0.8);
      border.strokeRect(
        play.x + 0.5,
        play.y + 0.5,
        Math.max(play.w - 1, 0),
        Math.max(play.h - 1, 0)
      );

      if (play.w > 12 && play.h > 12) {
        border.lineStyle(1, 0xffffff, 0.25);
        border.strokeRect(
          play.x + 6.5,
          play.y + 6.5,
          Math.max(play.w - 13, 0),
          Math.max(play.h - 13, 0)
        );
      }
    }

    updatePlayAreaDiagnostics(forceRedraw) {
      const play = this.playArea;
      if (!play) {
        return;
      }

      const diagnosticsActive = this.diagnosticsActive();
      if (!diagnosticsActive) {
        if (this._playAreaDiagText) {
          this._playAreaDiagText.setVisible(false);
        }
        if (this._playAreaDiagGrid) {
          this._playAreaDiagGrid.clear();
          this._playAreaDiagGrid.setVisible(false);
        }
        return;
      }

      const label =
        'Play: ' +
        Math.round(play.x) +
        ',' +
        Math.round(play.y) +
        ' ' +
        Math.round(play.w) +
        '×' +
        Math.round(play.h);

      const needsCreate = !this._playAreaDiagText || !this._playAreaDiagGrid;
      const shouldRedraw = forceRedraw || needsCreate || this._playAreaDiagLastText !== label;

      if (shouldRedraw) {
        if (!this._playAreaDiagText && this.add && typeof this.add.text === 'function') {
          this._playAreaDiagText = this.add
            .text(12, 108, '', {
              fontFamily: 'monospace',
              fontSize: '12px',
              color: '#00ffee',
            })
            .setOrigin(0, 0)
            .setScrollFactor(0)
            .setDepth(60);
        }

        if (this._playAreaDiagText) {
          this._playAreaDiagText.setText(label);
          this._playAreaDiagText.setVisible(true);
        }

        if (!this._playAreaDiagGrid && this.add && typeof this.add.graphics === 'function') {
          this._playAreaDiagGrid = this.add.graphics();
          this._playAreaDiagGrid.setDepth(8);
        }

        const grid = this._playAreaDiagGrid;
        if (grid) {
          grid.clear();

          if (play.w > 0 && play.h > 0) {
            const baseStep = Math.max(48, Math.round(Math.min(play.w, play.h) / 6));
            const step = Math.max(24, baseStep);
            const useLineBetween = grid.lineBetween && typeof grid.lineBetween === 'function';
            grid.lineStyle(1, 0xffffff, 0.08);
            if (useLineBetween) {
              for (let x = play.x + step; x < play.x + play.w; x += step) {
                grid.lineBetween(x, play.y + 2, x, play.y + play.h - 2);
              }
              for (let y = play.y + step; y < play.y + play.h; y += step) {
                grid.lineBetween(play.x + 2, y, play.x + play.w - 2, y);
              }
            } else {
              grid.beginPath();
              for (let x = play.x + step; x < play.x + play.w; x += step) {
                grid.moveTo(x, play.y + 2);
                grid.lineTo(x, play.y + play.h - 2);
              }
              for (let y = play.y + step; y < play.y + play.h; y += step) {
                grid.moveTo(play.x + 2, y);
                grid.lineTo(play.x + play.w - 2, y);
              }
              grid.strokePath();
            }
          }
          grid.setVisible(true);
        }
        this._playAreaDiagLastText = label;

        if (typeof console !== 'undefined' && console && typeof console.info === 'function') {
          console.info('[PlayArea] ' + label);
        }
      } else {
        if (this._playAreaDiagText) {
          this._playAreaDiagText.setVisible(true);
        }
        if (this._playAreaDiagGrid) {
          this._playAreaDiagGrid.setVisible(true);
        }
      }
    }

    handleResize(gameSize) {
      const sourceSize = gameSize || this.scale.gameSize;
      if (!sourceSize) {
        return;
      }

      this._pendingResizeSize = {
        width: sourceSize.width,
        height: sourceSize.height,
      };

      const runResize = () => {
        this._resizeDebounceEvent = null;
        const pending = this._pendingResizeSize || this.scale.gameSize;
        this.applyResize(pending);
      };

      if (!this.time || typeof this.time.delayedCall !== 'function') {
        runResize();
        return;
      }

      if (this._resizeDebounceEvent) {
        this._resizeDebounceEvent.remove(false);
      }

      this._resizeDebounceEvent = this.time.delayedCall(0, runResize);
    }

    applyResize(gameSize) {
      const size = gameSize || this.scale.gameSize;
      if (!size) {
        return;
      }
      const width = typeof size.width === 'number' ? size.width : this.scale.gameSize.width;
      const height = typeof size.height === 'number' ? size.height : this.scale.gameSize.height;
      const safeWidth = Math.max(width || 0, 1);
      const safeHeight = Math.max(height || 0, 1);

      const camera = this.cameras.main;
      if (camera) {
        camera.setViewport(0, 0, safeWidth, safeHeight);
      }

      this.updateSafeAreaInsets();

      (this._centeredElements || []).forEach((updatePosition) => updatePosition());
      this.positionTouchButtons();
      this.positionDebugOverlay();

      if (this._layoutReady) {
        this.refreshWorldBounds(size);
        this.clampFightersToPlayArea();
      } else {
        this.updatePlayAreaDiagnostics(false);
      }

      if (this.diagnosticsActive()) {
        this.runJoyDiagChecks('resize');
      }
    }

    update(time, delta) {
      this.dt = Math.min(delta, 50) / 1000;

      this._joyDiagFrameIndex = (this._joyDiagFrameIndex || 0) + 1;
      const diagnosticsActive = this.diagnosticsActive();
      if (diagnosticsActive) {
        this._joyDiagFrameState = {
          frame: this._joyDiagFrameIndex,
          order: [],
          sources: {},
          overrideEvents: [],
          preResetMoveX: this.p1Input ? this.p1Input.moveX : null,
        };
      } else {
        this._joyDiagFrameState = null;
      }

      this.reconcileInputState();

      if (this._fighters && this._fighters.length) {
        const [p1, p2] = this._fighters;
        if (p1) {
          if (this._joyDiagFrameState) {
            this._joyDiagFrameState.order.push('updateFighterMovement:p1');
          }
          this.updateFighterMovement(p1, this.p1Input, p2, this.dt);
        }
        if (p2) {
          if (this._joyDiagFrameState) {
            this._joyDiagFrameState.order.push('updateFighterMovement:p2');
          }
          this.updateFighterMovement(p2, this.p2Input, p1, this.dt);
        }
      }

      this._fighters.forEach((fighter) => fighter.update(this.dt));

      if (this._joyDiagFrameState) {
        this._joyDiagFrameState.preResetMoveX = this.p1Input ? this.p1Input.moveX : null;
      }

      this.updatePlayAreaDiagnostics(false);

      this.resetMomentaryInputFlags();

      if (this._joyDiagFrameState) {
        const afterReset = this.p1Input ? this.p1Input.moveX : null;
        if (afterReset !== this._joyDiagFrameState.preResetMoveX) {
          this._joyDiagFrameState.overrideEvents.push({
            type: 'endOfFrameReset',
            stage: 'resetMomentaryInputFlags',
            before: this._joyDiagFrameState.preResetMoveX,
            after: afterReset,
          });
        }
      }

      this.updateDebugOverlay();
      traceControls(this);

      if (this._joyDiagFrameState) {
        this.flushJoyDiagFrameDiagnostics();
      }
    }

    reconcileInputState() {
      this.updateJoystickSnapshots();

      if (this._joyDiagFrameState) {
        const order = this._joyDiagFrameState.order;
        if (!order.includes('reconcile')) {
          order.push('reconcile');
        }
      }

      ['p1', 'p2'].forEach((player) => {
        const state = this.getPlayerInput(player);
        if (!state) {
          return;
        }

        const joystick = this.joystickSnapshots[player];
        const keyboardMoveX = this.determineKeyboardMoveX(player);
        const joystickMoveX = joystick ? joystick.moveX : 0;
        const joystickHasInput = Math.abs(joystickMoveX) > 0.0001;
        const keyboardHasInput = keyboardMoveX !== 0;
        const forcingKeyboard = player === 'p1' && this._forceKeyboard;
        let moveSource = 'joystick';
        let resolvedMoveX = joystickMoveX;
        let overrideType = null;

        if (forcingKeyboard || keyboardHasInput) {
          resolvedMoveX = keyboardHasInput ? keyboardMoveX : 0;
          moveSource = keyboardHasInput ? 'keyboard' : 'keyboard-forced';
          if (player === 'p1' && joystickHasInput && resolvedMoveX !== joystickMoveX) {
            overrideType = forcingKeyboard ? 'forceKeyboard' : 'keyboardFallback';
          }
        }

        state.moveX = Phaser.Math.Clamp(resolvedMoveX, -1, 1);

        if (this._joyDiagFrameState) {
          const frameState = this._joyDiagFrameState;
          frameState.sources[player] = {
            source: moveSource,
            keyboard: keyboardMoveX,
            joystick: joystickMoveX,
            forced: forcingKeyboard && !keyboardHasInput,
          };
          if (player === 'p1' && overrideType) {
            frameState.overrideEvents.push({
              type: overrideType,
              stage: 'reconcileInputState',
              keyboard: keyboardMoveX,
              joystick: joystickMoveX,
              applied: state.moveX,
            });
          }
        }

        const holds = this.keyboardHoldStates[player];
        const holdCrouch = holds && holds.crouch ? holds.crouch : false;
        const crouch = holdCrouch || joystick.crouch;
        state.crouch = !!crouch;

        const jumpQueue = this.keyboardJumpQueue[player];
        if (jumpQueue) {
          if (jumpQueue.forward) {
            state.jumpForward = true;
          }
          if (jumpQueue.back) {
            state.jumpBack = true;
          }
          if (jumpQueue.up) {
            state.jumpUp = true;
          }
        }

        if (joystick.jumpForward) {
          state.jumpForward = true;
        }
        if (joystick.jumpBack) {
          state.jumpBack = true;
        }
        if (joystick.jumpUp) {
          state.jumpUp = true;
        }
      });
    }


    flushJoyDiagFrameDiagnostics() {
      const frameState = this._joyDiagFrameState;
      this._joyDiagFrameState = null;
      if (!frameState) {
        return;
      }
      const orderState = this._joyDiagOrderState || (this._joyDiagOrderState = {});
      const order = frameState.order ? frameState.order.slice() : [];
      const reconcileIndex = order.indexOf('reconcile');
      const firstMovementIndex = order.findIndex((entry) =>
        typeof entry === 'string' && entry.startsWith('updateFighterMovement')
      );
      const reconcileBeforeMovement =
        reconcileIndex !== -1 && (firstMovementIndex === -1 || reconcileIndex < firstMovementIndex);
      const signature = order.length ? order.join('>') : 'none';

      if (this.diagnosticsActive()) {
        if (!orderState.lastSignature || orderState.lastSignature !== signature) {
          orderState.lastSignature = signature;
          orderState.lastFrame = frameState.frame;
          const payload = {
            frame: frameState.frame,
            order,
            reconcileBeforeMovement,
            moveSources: frameState.sources || {},
          };
          const topOnly = this.buildTopOnlyDiagnostics();
          if (topOnly) {
            payload.topOnly = topOnly;
          }
          this.logJoyDiag('controls:order', payload);
        }
        const overrides = frameState.overrideEvents || [];
        const seen = new Set();
        overrides.forEach((event) => {
          if (!event || !event.type) {
            return;
          }
          const key = `${event.type}:${event.stage}`;
          if (seen.has(key)) {
            return;
          }
          seen.add(key);
          this.logJoyDiag('controls:override', {
            frame: frameState.frame,
            ...event,
          });
        });
      }
    }

    buildTopOnlyDiagnostics() {
      const inputPlugin = this.input;
      const manager = inputPlugin && inputPlugin.manager ? inputPlugin.manager : null;
      if (!manager) {
        return null;
      }
      const active = !!manager.topOnly;
      const result = { active };
      if (!active) {
        return result;
      }

      const pointers = manager.pointers || [];
      const camera = this.cameras && this.cameras.main ? this.cameras.main : null;
      const sceneChildren = this.children && this.children.list ? this.children.list : [];
      const pointerDetails = {};
      ['p1', 'p2'].forEach((playerKey) => {
        const joystick = this.virtualJoysticks ? this.virtualJoysticks[playerKey] : null;
        if (!joystick) {
          return;
        }
        const pointerId =
          typeof joystick.pointerId === 'number' || typeof joystick.pointerId === 'string'
            ? joystick.pointerId
            : null;
        if (pointerId === null) {
          return;
        }
        const pointer = pointers.find((ptr) => ptr && ptr.id === pointerId);
        if (!pointer) {
          pointerDetails[playerKey] = {
            pointerId,
            joystickIsTop: null,
          };
          return;
        }
        const hitTest =
          typeof manager.hitTest === 'function'
            ? manager.hitTest(pointer, sceneChildren, camera)
            : null;
        const topObject = Array.isArray(hitTest) && hitTest.length > 0 ? hitTest[0] : null;
        let joystickIsTop = false;
        if (topObject) {
          if (topObject === joystick) {
            joystickIsTop = true;
          } else if (topObject.parentContainer) {
            let parent = topObject.parentContainer;
            while (parent && !joystickIsTop) {
              if (parent === joystick) {
                joystickIsTop = true;
              }
              parent = parent.parentContainer;
            }
          }
        }
        pointerDetails[playerKey] = {
          pointerId,
          pointerX: typeof pointer.x === 'number' ? pointer.x : null,
          pointerY: typeof pointer.y === 'number' ? pointer.y : null,
          joystickIsTop,
          topObjectType: topObject
            ? topObject.name || topObject.type || (topObject.constructor && topObject.constructor.name)
            : null,
        };
      });

      if (Object.keys(pointerDetails).length > 0) {
        result.pointers = pointerDetails;
      }
      return result;
    }

    createPlayerInputState() {
      return {
        moveX: 0,
        crouch: false,
        jumpUp: false,
        jumpForward: false,
        jumpBack: false,
        punch: false,
        kick: false,
        punchPressed: false,
        kickPressed: false,
      };
    }

    createPointerState() {
      return {
        punch: new Set(),
        kick: new Set(),
      };
    }

    createJoystickSnapshot() {
      return {
        moveX: 0,
        crouch: false,
        jumpUp: false,
        jumpForward: false,
        jumpBack: false,
      };
    }

    getPlayerInput(player) {
      return player === 'p2' ? this.p2Input : this.p1Input;
    }

    updateJoystickSnapshots() {
      ['p1', 'p2'].forEach((player) => {
        const joystick = this.virtualJoysticks[player];
        const snapshot = this.joystickSnapshots[player];
        snapshot.moveX = 0;
        snapshot.crouch = false;
        snapshot.jumpUp = false;
        snapshot.jumpForward = false;
        snapshot.jumpBack = false;

        const prev = this.joystickPrevDirections[player];
        if (!joystick || !joystick.isEnabled()) {
          prev.up = false;
          prev.forward = false;
          prev.back = false;
          return;
        }

        const vector = joystick.getVector();
        if (!joystick.isActive()) {
          prev.up = false;
          prev.forward = false;
          prev.back = false;
          return;
        }

        snapshot.moveX = Phaser.Math.Clamp(vector.x, -1, 1);

        const crouchActive = vector.y >= JOYSTICK_CROUCH_THRESHOLD;
        snapshot.crouch = crouchActive;

        const upActive = vector.y <= -JOYSTICK_JUMP_THRESHOLD;
        const forwardActive = upActive && vector.x >= JOYSTICK_JUMP_HORIZONTAL_THRESHOLD;
        const backActive = upActive && vector.x <= -JOYSTICK_JUMP_HORIZONTAL_THRESHOLD;

        if (forwardActive && !prev.forward) {
          snapshot.jumpForward = true;
        } else if (backActive && !prev.back) {
          snapshot.jumpBack = true;
        } else if (upActive && !prev.up && !forwardActive && !backActive) {
          snapshot.jumpUp = true;
        }

        prev.up = upActive;
        prev.forward = forwardActive;
        prev.back = backActive;
      });

      this.runJoyTestSimulation();
    }

    determineKeyboardMoveX(player) {
      const states = this.keyboardHoldStates[player];
      if (!states) {
        return 0;
      }
      const left = !!states.left;
      const right = !!states.right;
      if (left === right) {
        return 0;
      }
      return right ? 1 : -1;
    }

    handleKeyboardJump(player) {
      const queue = this.keyboardJumpQueue[player];
      const holds = this.keyboardHoldStates[player];
      if (!queue || !holds) {
        return;
      }
      const horizontal = holds.right === holds.left ? 0 : holds.right ? 1 : -1;
      if (horizontal > 0) {
        queue.forward = true;
      } else if (horizontal < 0) {
        queue.back = true;
      } else {
        queue.up = true;
      }
      this.detectKeyboard();
    }

    updateFighterMovement(fighter, input, opponent, dt) {
      if (!fighter) {
        return;
      }

      const body = /** @type {Phaser.Physics.Arcade.Body} */ (fighter.body);
      if (!body) {
        return;
      }

      if (opponent) {
        const facingDirection = opponent.x >= fighter.x ? 1 : -1;
        fighter.setFacing(facingDirection);
      }

      const bodyOnFloor =
        body.onFloor && typeof body.onFloor === 'function' ? body.onFloor.call(body) : false;
      const onGround = body.blocked.down || body.touching.down || bodyOnFloor;
      const canControl = !fighter.isAttacking;

      const wantsCrouch = !!(input && input.crouch && onGround && canControl);
      fighter.setCrouching(wantsCrouch);

      let moveInput = 0;
      if (canControl && input) {
        moveInput = Phaser.Math.Clamp(input.moveX || 0, -1, 1);
      }
      if (!canControl) {
        moveInput = 0;
      }

      let targetVelocity = moveInput * SPEED;
      if (fighter.isCrouching) {
        targetVelocity *= CROUCH_SPEED_SCALE;
      }

      const acceleration = onGround
        ? targetVelocity === 0
          ? FRICTION
          : ACCEL
        : AIR_ACCEL;

      let vx = body.velocity.x;
      if (targetVelocity > vx) {
        vx = Math.min(vx + acceleration * dt, targetVelocity);
      } else if (targetVelocity < vx) {
        vx = Math.max(vx - acceleration * dt, targetVelocity);
      } else if (targetVelocity === 0 && onGround) {
        const frictionStep = FRICTION * dt;
        if (vx > frictionStep) {
          vx -= frictionStep;
        } else if (vx < -frictionStep) {
          vx += frictionStep;
        } else {
          vx = 0;
        }
      }

      if (!onGround) {
        vx = Phaser.Math.Clamp(Phaser.Math.Linear(vx, targetVelocity, dt * AIR_DRAG), -MAX_VEL, MAX_VEL);
      }

      body.setVelocityX(Phaser.Math.Clamp(vx, -MAX_VEL, MAX_VEL));

      if (input && canControl) {
        const wantsJumpForward = !!input.jumpForward;
        const wantsJumpBack = !!input.jumpBack;
        const wantsJumpUp = !!input.jumpUp;
        const jumpRequested = wantsJumpForward || wantsJumpBack || wantsJumpUp;
        if (jumpRequested && onGround) {
          if (fighter.isCrouching) {
            fighter.setCrouching(false);
          }
          const horizontalDir = wantsJumpForward ? 1 : wantsJumpBack ? -1 : 0;
          const horizontalVelocity =
            horizontalDir !== 0 ? horizontalDir * JUMP_HORIZONTAL_SPEED : body.velocity.x;
          body.setVelocityY(-JUMP_SPEED);
          if (horizontalDir !== 0) {
            body.setVelocityX(Phaser.Math.Clamp(horizontalVelocity, -MAX_VEL, MAX_VEL));
          }
        }
      }
    }

    spawnFighters() {
      if (!this.physics || !this.physics.world) {
        return;
      }

      if (!this._fighters) {
        this._fighters = [];
      }
      if (this._fighters.length) {
        return;
      }

      const bounds = this.physics.world.bounds;
      if (!bounds || bounds.width <= 0 || bounds.height <= 0) {
        return;
      }

      const safeHalfWidth = 14;
      const safeHalfHeight = 32;
      const groundOffset = Math.max(64, safeHalfHeight + 16);

      const spawnY = Phaser.Math.Clamp(
        bounds.bottom - groundOffset,
        bounds.y + safeHalfHeight,
        bounds.bottom - safeHalfHeight
      );

      const spawnX1 = Phaser.Math.Clamp(
        bounds.x + bounds.width * 0.22,
        bounds.x + safeHalfWidth,
        bounds.right - safeHalfWidth
      );
      const spawnX2 = Phaser.Math.Clamp(
        bounds.x + bounds.width * 0.78,
        bounds.x + safeHalfWidth,
        bounds.right - safeHalfWidth
      );

      const p1 = new Stick(this, spawnX1, spawnY, { facing: 1, color: 0x4cd964 });
      const p2 = new Stick(this, spawnX2, spawnY, { facing: -1, color: 0xff3b30 });

      p1.setFacing(1).setAlpha(1).setVisible(true);
      p2.setFacing(-1).setAlpha(1).setVisible(true);

      this._fighters = [p1, p2];
    }

    registerTouchPrevention() {
      const canvas = this.sys.game.canvas;
      if (canvas) {
        canvas.style.touchAction = 'none';
        canvas.style.webkitUserSelect = 'none';
        canvas.style.userSelect = 'none';
        if (!canvas._preventScrollAttached) {
          canvas.addEventListener('touchstart', preventDefaultScroll, { passive: false });
          canvas.addEventListener('touchmove', preventDefaultScroll, { passive: false });
          canvas._preventScrollAttached = true;
        }
      }
    }

    createTouchControls() {
      if (this.diagnosticsActive() && this._joyDiagModes.noControls) {
        return;
      }

      if (this.input) {
        this.input.addPointer(7);
      }

      const createButton = (player, key, label, textStyleOverrides = {}) => {
        const button = this.createTouchButton(label, textStyleOverrides);
        this.touchButtons[player][key] = button;
        this.touchButtonsList.push(button);
        button.activePointers = this.pointerStates[player][key];
        this.configureButtonInteraction(button, player, key);
        return button;
      };

      const diagnosticsActive = this.diagnosticsActive();
      const joystickOnly = diagnosticsActive && this._joyDiagModes.joystickOnly;
      const createJoysticks =
        joystickOnly || !(diagnosticsActive && this._joyDiagModes.noJoystick);
      const createButtons = !joystickOnly;

      if (createJoysticks) {
        const joystickRadius = this.touchButtonLayout.joystickRadius;
        const joystickDeadzone = this.getJoystickDeadzone();
        const joystickP1 = new VirtualJoystick(this, 0, 0, {
          radius: joystickRadius,
          deadzone: joystickDeadzone,
          playerKey: 'p1',
        });
        const joystickP2 = new VirtualJoystick(this, 0, 0, {
          radius: joystickRadius,
          deadzone: joystickDeadzone,
          playerKey: 'p2',
        });

        const onJoystickInput = () => {
          if (this._forceKeyboard) {
            return;
          }
          if (this._keyboardDetected) {
            this._keyboardDetected = false;
            this.updateTouchControlsVisibility();
          } else if (this._forceJoystick) {
            this.updateTouchControlsVisibility();
          }
        };

        joystickP1.on('joystickstart', onJoystickInput);
        joystickP2.on('joystickstart', onJoystickInput);
        joystickP1.on('joystickmove', () => {});
        joystickP2.on('joystickmove', () => {});

        this.virtualJoysticks.p1 = joystickP1;
        this.virtualJoysticks.p2 = joystickP2;
        this.joystickList.push(joystickP1, joystickP2);
      } else {
        this.virtualJoysticks.p1 = null;
        this.virtualJoysticks.p2 = null;
      }

      if (createButtons) {
        createButton('p1', 'punch', 'Punch', { fontSize: '26px' });
        createButton('p1', 'kick', 'Kick', { fontSize: '26px' });

        createButton('p2', 'punch', 'Punch', { fontSize: '26px' });
        createButton('p2', 'kick', 'Kick', { fontSize: '26px' });
      }

      this.positionTouchButtons();
      this.updateTouchControlsVisibility();

      if (joystickOnly) {
        this.hideLegacyTouchContainers();
      }
    }

    logTouchControlsCreationDiagnostics() {
      if (!this.diagnosticsActive()) {
        return;
      }

      const describeInputState = (inputState) => {
        if (!inputState) {
          return { exists: false };
        }
        const ctor = inputState.constructor ? inputState.constructor.name : null;
        return {
          exists: true,
          constructor: ctor,
          hasMoveX: Object.prototype.hasOwnProperty.call(inputState, 'moveX'),
        };
      };

      const overlayDepths = {
        titleText:
          this.titleText && typeof this.titleText.depth === 'number' ? this.titleText.depth : null,
        debugText:
          this.debugText && typeof this.debugText.depth === 'number' ? this.debugText.depth : null,
      };

      const legacySources = [
        this.legacyTouchControls,
        this.legacyTouchButtons,
        this.legacyDPad,
        this.legacyDpad,
        this.legacyDpadButtons,
        this.dpad,
        this.dpadContainer,
        this.arrowControls,
        this.arrowButtons,
      ];

      const legacyDepths = [];
      const visited = new Set();
      const recordLegacyDepth = (item) => {
        if (!item || visited.has(item)) {
          return;
        }
        visited.add(item);
        if (Array.isArray(item)) {
          item.forEach(recordLegacyDepth);
          return;
        }
        if (typeof item.depth === 'number') {
          legacyDepths.push(item.depth);
        }
        if (item.container && item.container !== item) {
          recordLegacyDepth(item.container);
        }
      };
      legacySources.forEach(recordLegacyDepth);

      const legacySummary = legacyDepths.length
        ? {
            depths: legacyDepths.slice().sort((a, b) => a - b),
            highest: Math.max(...legacyDepths),
          }
        : { depths: [], highest: null };

      const describeJoystick = (playerKey) => {
        const joystick = this.virtualJoysticks ? this.virtualJoysticks[playerKey] : null;
        if (!joystick) {
          return { exists: false };
        }

        const ctor = joystick.constructor ? joystick.constructor.name : null;
        const interactive = joystick.input || null;
        const hitArea = interactive && interactive.hitArea ? interactive.hitArea : null;
        const hitAreaRadius = hitArea && typeof hitArea.radius === 'number' ? hitArea.radius : null;
        const joystickDepth = typeof joystick.depth === 'number' ? joystick.depth : null;
        const overlayComparisons = {};
        Object.keys(overlayDepths).forEach((key) => {
          const overlayDepth = overlayDepths[key];
          overlayComparisons[key] =
            joystickDepth !== null && typeof overlayDepth === 'number'
              ? joystickDepth - overlayDepth
              : null;
        });

        const outerDepth = joystick.outerRing && typeof joystick.outerRing.depth === 'number'
          ? joystick.outerRing.depth
          : null;
        const knobDepth = joystick.knob && typeof joystick.knob.depth === 'number'
          ? joystick.knob.depth
          : null;

        const joystickAboveLegacy =
          legacySummary.highest !== null && joystickDepth !== null
            ? joystickDepth >= legacySummary.highest
            : null;
        const legacyOverlaysAbove =
          joystickDepth !== null
            ? legacyDepths.filter((depth) => typeof depth === 'number' && depth > joystickDepth)
            : [];

        return {
          exists: true,
          constructor: ctor,
          depth: joystickDepth,
          overlayDepthDelta: overlayComparisons,
          legacy: {
            highestLegacyDepth: legacySummary.highest,
            joystickAboveAllLegacy: joystickAboveLegacy,
            overlaysAboveJoystick: legacyOverlaysAbove,
          },
          interactiveZone: {
            hitRadius: hitAreaRadius,
            effectiveRadius:
              typeof joystick.radius === 'number' && typeof joystick.hitPadding === 'number'
                ? joystick.radius + joystick.hitPadding
                : null,
            ownerIsJoystick:
              interactive && interactive.gameObject ? interactive.gameObject === joystick : null,
          },
          knobDepth: knobDepth,
          outerRingDepth: outerDepth,
          knobAboveOuter:
            knobDepth !== null && outerDepth !== null ? knobDepth > outerDepth : null,
        };
      };

      const reconcileSource =
        typeof this.reconcileInputState === 'function' ? String(this.reconcileInputState) : '';
      const assignsMoveX = /state\.moveX\s*=/.test(reconcileSource);

      this.logJoyDiag('controls:create', {
        joysticks: {
          p1: describeJoystick('p1'),
          p2: describeJoystick('p2'),
        },
        inputs: {
          p1: describeInputState(this.p1Input),
          p2: describeInputState(this.p2Input),
        },
        reconcile: {
          hasMethod: typeof this.reconcileInputState === 'function',
          assignsMoveX,
        },
        overlays: overlayDepths,
        legacy: legacySummary,
      });
    }

    hideLegacyTouchContainers() {
      const hideLegacyDirectionalControl = (control) => {
        if (!control) {
          return;
        }
        const hideSingle = (item) => {
          if (!item) {
            return;
          }
          if (typeof item.setVisible === 'function') {
            item.setVisible(false);
          }
          if (typeof item.setActive === 'function') {
            item.setActive(false);
          }
          if (item.input) {
            item.input.enabled = false;
          }
        };
        if (Array.isArray(control)) {
          control.forEach(hideSingle);
          return;
        }
        hideSingle(control);
        if (typeof control === 'object') {
          hideLegacyDirectionalControl(control.left);
          hideLegacyDirectionalControl(control.right);
          hideLegacyDirectionalControl(control.up);
          hideLegacyDirectionalControl(control.down);
          if (control.container && control.container !== control) {
            hideLegacyDirectionalControl(control.container);
          }
        }
      };
      [
        this.legacyTouchControls,
        this.legacyTouchButtons,
        this.legacyDPad,
        this.legacyDpad,
        this.legacyDpadButtons,
        this.dpad,
        this.dpadContainer,
        this.arrowControls,
        this.arrowButtons,
      ].forEach(hideLegacyDirectionalControl);
    }

    createTouchButton(label, textStyleOverrides = {}) {
      const { size } = this.touchButtonLayout;
      const container = this.add.container(0, 0);
      container.setSize(size, size);
      container.setScrollFactor(0);
      container.setDepth(30);

      const background = this.add.rectangle(0, 0, size, size, 0x333333);
      background.setOrigin(0.5, 0.5);
      background.setAlpha(0.65);
      background.setStrokeStyle(2, 0xffffff, 0.28);

      const textStyle = {
        fontFamily: 'Arial, sans-serif',
        fontSize: '32px',
        fontStyle: '700',
        color: '#ffffff',
        align: 'center',
        ...textStyleOverrides,
      };

      const labelText = this.add.text(0, 0, label, textStyle).setOrigin(0.5, 0.5);

      container.add([background, labelText]);
      container.buttonBackground = background;
      container.buttonLabel = labelText;
      container.baseAlpha = 0.65;

      const hitPadding = 20;
      const hitWidth = size + hitPadding;
      const hitHeight = size + hitPadding;

      container.setInteractive({
        hitArea: new Phaser.Geom.Rectangle(-hitWidth / 2, -hitHeight / 2, hitWidth, hitHeight),
        hitAreaCallback: Phaser.Geom.Rectangle.Contains,
        useHandCursor: false,
        draggable: false,
      });
      if (container.input) {
        container.input.enabled = true;
      }

      return container;
    }

    configureButtonInteraction(button, player, key) {
      if (!button) {
        return;
      }
      const pointerSet = this.pointerStates[player][key];

      const handlePointerDown = (pointer) => {
        this.preventPointerDefault(pointer);
        if (pointer && typeof pointer.id !== 'undefined') {
          pointerSet.add(pointer.id);
        }
        this.handleActionPress(player, key);
        this.updateActionHoldState(player, key);
        if (this.diagnosticsActive()) {
          const local = pointer
            ? { x: pointer.x - button.x, y: pointer.y - button.y }
            : null;
          this.logJoyDiag('button:pointerdown', {
            player,
            key,
            pointerId: this.extractPointerId(pointer),
            eventType: pointer && pointer.event ? pointer.event.type : 'pointerdown',
            local,
          });
        }
      };

      const handlePointerEnd = (pointer, eventName) => {
        if (pointer && typeof pointer.id !== 'undefined') {
          pointerSet.delete(pointer.id);
        }
        this.updateActionHoldState(player, key);
        this.preventPointerDefault(pointer);
        if (this.diagnosticsActive()) {
          const local = pointer
            ? { x: pointer.x - button.x, y: pointer.y - button.y }
            : null;
          this.logJoyDiag('button:pointerup', {
            player,
            key,
            pointerId: this.extractPointerId(pointer),
            eventType: eventName,
            pointerEventType: pointer && pointer.event ? pointer.event.type : null,
            local,
          });
        }
      };

      button.on('pointerdown', handlePointerDown);
      const pointerEndHandlers = [];
      ['pointerup', 'pointerupoutside', 'pointerout', 'pointercancel', 'lostpointercapture'].forEach(
        (eventName) => {
          const handler = (pointer) => handlePointerEnd(pointer, eventName);
          pointerEndHandlers.push([eventName, handler]);
          button.on(eventName, handler);
        }
      );

      this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
        button.off('pointerdown', handlePointerDown);
        pointerEndHandlers.forEach(([eventName, handler]) => {
          button.off(eventName, handler);
        });
      });
    }

    handleActionPress(player, key) {
      const state = this.getPlayerInput(player);
      if (!state) {
        return;
      }
      state[key] = true;
      const pressedKey = `${key}Pressed`;
      if (pressedKey in state) {
        state[pressedKey] = true;
      }
    }

    handleKeyboardAction(player, key) {
      this.handleActionPress(player, key);
      this.detectKeyboard();
    }

    updateActionHoldState(player, key) {
      const pointerSet = this.pointerStates[player][key];
      const pointerActive = pointerSet ? pointerSet.size > 0 : false;
      const state = this.getPlayerInput(player);
      if (state) {
        state[key] = pointerActive;
      }
      const buttonGroup = this.touchButtons[player];
      const button = buttonGroup ? buttonGroup[key] : undefined;
      if (button) {
        this.setButtonActive(button, pointerActive);
      }
    }

    resetMomentaryInputFlags() {
      ['p1', 'p2'].forEach((player) => {
        const state = this.getPlayerInput(player);
        if (!state) {
          return;
        }
        state.punchPressed = false;
        state.kickPressed = false;
        state.jumpUp = false;
        state.jumpForward = false;
        state.jumpBack = false;
        const punchSet = this.pointerStates[player].punch;
        if (!(punchSet && punchSet.size > 0)) {
          state.punch = false;
        }
        const kickSet = this.pointerStates[player].kick;
        if (!(kickSet && kickSet.size > 0)) {
          state.kick = false;
        }
        const queue = this.keyboardJumpQueue[player];
        if (queue) {
          queue.up = false;
          queue.forward = false;
          queue.back = false;
        }
      });
    }

    preventPointerDefault(pointer) {
      const event = pointer && (pointer.event || pointer.originalEvent);
      const cancelable = !!(event && event.cancelable !== false);
      const defaultPreventedBefore = !!(event && event.defaultPrevented);
      let preventDefaultCalled = false;
      if (cancelable && event && typeof event.preventDefault === 'function') {
        event.preventDefault();
        preventDefaultCalled = true;
      }
      const defaultPreventedAfter = !!(event && event.defaultPrevented);
      return {
        cancelable,
        preventDefaultCalled,
        defaultPreventedBefore,
        defaultPreventedAfter,
      };
    }

    positionTouchButtons() {
      const { width, height } = this.scale.gameSize;
      const { size, gap, margin, joystickRadius } = this.touchButtonLayout;
      const safe = this.safeAreaInsets || { top: 0, right: 0, bottom: 0, left: 0 };
      const buttonSpacing = size + gap;
      const joystickY = height - safe.bottom - margin - joystickRadius;
      const buttonsBaseY = height - safe.bottom - margin - size / 2;
      const buttonOffset = buttonSpacing / 2;

      const joystickP1 = this.virtualJoysticks.p1;
      if (joystickP1) {
        joystickP1.setPosition(safe.left + margin + joystickRadius, joystickY);
      }

      const joystickP2 = this.virtualJoysticks.p2;
      if (joystickP2) {
        joystickP2.setPosition(width - safe.right - margin - joystickRadius, joystickY);
      }

      const p1Punch = this.touchButtons.p1.punch;
      const p1Kick = this.touchButtons.p1.kick;
      if (p1Punch && p1Kick) {
        const baseX =
          (joystickP1 ? joystickP1.x + joystickRadius + margin + size / 2 : safe.left + margin + size / 2);
        p1Punch.setPosition(baseX, buttonsBaseY - buttonOffset);
        p1Kick.setPosition(baseX, buttonsBaseY + buttonOffset);
      }

      const p2Punch = this.touchButtons.p2.punch;
      const p2Kick = this.touchButtons.p2.kick;
      if (p2Punch && p2Kick) {
        const baseX =
          (joystickP2
            ? joystickP2.x - joystickRadius - margin - size / 2
            : width - safe.right - margin - size / 2);
        p2Punch.setPosition(baseX, buttonsBaseY - buttonOffset);
        p2Kick.setPosition(baseX, buttonsBaseY + buttonOffset);
      }
    }

    setButtonActive(button, isActive) {
      if (!button || !button.buttonBackground) {
        return;
      }
      const alpha = isActive ? 0.95 : button.baseAlpha || 0.65;
      button.buttonBackground.setAlpha(alpha);
    }

    registerKeyboardControls() {
      if (!this.input || !this.input.keyboard) {
        return;
      }

      const keyboard = this.input.keyboard;

      const setMoveKeyState = (player, key, isActive) => {
        const keyboardStates = this.keyboardHoldStates[player];
        if (!keyboardStates) {
          return;
        }
        keyboardStates[key] = isActive;
        if (isActive) {
          this.detectKeyboard();
        }
      };

      const setCrouchState = (player, isActive) => {
        const keyboardStates = this.keyboardHoldStates[player];
        if (!keyboardStates) {
          return;
        }
        keyboardStates.crouch = isActive;
        if (isActive) {
          this.detectKeyboard();
        }
      };

      const onP1LeftDown = () => setMoveKeyState('p1', 'left', true);
      const onP1LeftUp = () => setMoveKeyState('p1', 'left', false);
      const onP1RightDown = () => setMoveKeyState('p1', 'right', true);
      const onP1RightUp = () => setMoveKeyState('p1', 'right', false);
      const onP1CrouchDown = () => setCrouchState('p1', true);
      const onP1CrouchUp = () => setCrouchState('p1', false);
      const onP1JumpDown = () => this.handleKeyboardJump('p1');

      const onP2LeftDown = () => setMoveKeyState('p2', 'left', true);
      const onP2LeftUp = () => setMoveKeyState('p2', 'left', false);
      const onP2RightDown = () => setMoveKeyState('p2', 'right', true);
      const onP2RightUp = () => setMoveKeyState('p2', 'right', false);
      const onP2CrouchDown = () => setCrouchState('p2', true);
      const onP2CrouchUp = () => setCrouchState('p2', false);
      const onP2JumpDown = () => this.handleKeyboardJump('p2');

      const onP1PunchDown = () => this.handleKeyboardAction('p1', 'punch');
      const onP1KickDown = () => this.handleKeyboardAction('p1', 'kick');
      const onP2PunchDown = () => this.handleKeyboardAction('p2', 'punch');
      const onP2KickDown = () => this.handleKeyboardAction('p2', 'kick');

      const keyBindings = [
        ['keydown-A', onP1LeftDown],
        ['keyup-A', onP1LeftUp],
        ['keydown-D', onP1RightDown],
        ['keyup-D', onP1RightUp],
        ['keydown-S', onP1CrouchDown],
        ['keyup-S', onP1CrouchUp],
        ['keydown-W', onP1JumpDown],
        ['keydown-LEFT', onP2LeftDown],
        ['keyup-LEFT', onP2LeftUp],
        ['keydown-RIGHT', onP2RightDown],
        ['keyup-RIGHT', onP2RightUp],
        ['keydown-DOWN', onP2CrouchDown],
        ['keyup-DOWN', onP2CrouchUp],
        ['keydown-UP', onP2JumpDown],
        ['keydown-J', onP1PunchDown],
        ['keydown-K', onP1KickDown],
      ];

      keyBindings.forEach(([eventName, handler]) => {
        keyboard.on(eventName, handler);
      });

      const onAnyKeyDown = (event) => {
        if (event && event.key === '?') {
          this.toggleDebugOverlay();
        }
        this.detectKeyboard();
      };
      keyboard.on('keydown', onAnyKeyDown);

      const registerKeyDown = (code, handler) => {
        const key = keyboard.addKey(code);
        key.on('down', handler);
        return key;
      };

      const p2PunchKeys = [
        Phaser.Input.Keyboard.KeyCodes.ONE,
        Phaser.Input.Keyboard.KeyCodes.NUMPAD_ONE,
      ].map((code) => registerKeyDown(code, onP2PunchDown));
      const p2KickKeys = [
        Phaser.Input.Keyboard.KeyCodes.TWO,
        Phaser.Input.Keyboard.KeyCodes.NUMPAD_TWO,
      ].map((code) => registerKeyDown(code, onP2KickDown));

      this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
        keyBindings.forEach(([eventName, handler]) => {
          keyboard.off(eventName, handler);
        });
        keyboard.off('keydown', onAnyKeyDown);
        p2PunchKeys.forEach((key) => key.off('down', onP2PunchDown));
        p2KickKeys.forEach((key) => key.off('down', onP2KickDown));
      });
    }

    detectKeyboard() {
      if (this._forceJoystick) {
        this.updateTouchControlsVisibility();
        return;
      }
      if (this._forceKeyboard) {
        if (!this._keyboardDetected) {
          this._keyboardDetected = true;
        }
        this.updateTouchControlsVisibility();
        return;
      }
      if (this._keyboardDetected) {
        return;
      }
      this._keyboardDetected = true;
      this.updateTouchControlsVisibility();
    }

    updateTouchControlsVisibility() {
      const visible = !this._keyboardDetected;
      this.touchButtonsList.forEach((button) => {
        if (!button) {
          return;
        }
        if (!visible) {
          this.setButtonActive(button, false);
        }
        button.setVisible(visible);
        if (button.input) {
          button.input.enabled = visible;
        }
      });
      this.joystickList.forEach((joystick) => {
        if (!joystick) {
          return;
        }
        joystick.setVisible(visible);
        joystick.setControlEnabled(visible);
      });
      if (visible || (this.diagnosticsActive() && this._joyDiagModes.joystickOnly)) {
        this.hideLegacyTouchContainers();
      }
    }

    updateSafeAreaInsets() {
      if (typeof window === 'undefined' || !window.getComputedStyle) {
        this.safeAreaInsets = { top: 0, right: 0, bottom: 0, left: 0 };
        return;
      }
      const root = document.documentElement;
      const styles = window.getComputedStyle(root);
      const parseInset = (prop) => {
        const value = parseFloat(styles.getPropertyValue(prop));
        return Number.isFinite(value) ? value : 0;
      };
      this.safeAreaInsets = {
        top: parseInset('--safe-area-inset-top'),
        right: parseInset('--safe-area-inset-right'),
        bottom: parseInset('--safe-area-inset-bottom'),
        left: parseInset('--safe-area-inset-left'),
      };
    }

    createDebugOverlay() {
      const text = this.add
        .text(0, 0, '', {
          fontFamily: 'Menlo, Monaco, Consolas, monospace',
          fontSize: '15px',
          color: '#e6f6ff',
          align: 'left',
          backgroundColor: 'rgba(6, 14, 22, 0.75)',
        })
        .setOrigin(0, 0);
      text.setStyle({ stroke: '#0bb4ff', strokeThickness: 1 });
      text.setPadding(10, 8, 14, 10);
      text.setLineSpacing(6);
      text.setScrollFactor(0);
      text.setDepth(40);
      text.setAlpha(1);
      text.setVisible(false);
      this.debugText = text;
      this.positionDebugOverlay();
      this.updateDebugOverlay();
    }

    positionDebugOverlay() {
      if (!this.debugText) {
        return;
      }
      const safeInsets = this.safeAreaInsets || {};
      const topInset = typeof safeInsets.top === 'number' ? safeInsets.top : 0;
      const leftInset = typeof safeInsets.left === 'number' ? safeInsets.left : 0;
      const topOffset = topInset + 12;
      const leftOffset = leftInset + 12;
      this.debugText.setPosition(leftOffset, topOffset);
    }

    updateDebugOverlay() {
      if (!this.debugText) {
        return;
      }
      if (!this.debugOverlayVisible || !this.diagnosticsActive()) {
        this.debugText.setText('');
        this.debugText.setVisible(false);
        return;
      }
      const hudText = this.renderDiagHUD();
      this.debugText.setText(hudText || '');
      this.debugText.setVisible(true);
    }

    toggleDebugOverlay(forceState) {
      if (this.diagnosticsActive()) {
        this.debugOverlayVisible = true;
        this.updateDebugOverlay();
        return;
      }
      if (typeof forceState === 'boolean') {
        this.debugOverlayVisible = forceState;
      } else {
        this.debugOverlayVisible = !this.debugOverlayVisible;
      }
      this.updateDebugOverlay();
    }
  }

  const determineRendererType = () => {
    if (typeof window === 'undefined' || !window.location) {
      return Phaser.AUTO;
    }
    try {
      const params = new URLSearchParams(window.location.search || '');
      return params.get('forceCanvas') === '1' ? Phaser.CANVAS : Phaser.AUTO;
    } catch (error) {
      return Phaser.AUTO;
    }
  };

  const config = {
    type: determineRendererType(),
    parent: 'game-root',
    backgroundColor: '#111',
    physics: {
      default: 'arcade',
      arcade: {
        gravity: { y: GRAVITY_Y },
        debug: false,
      },
    },
    scale: {
      mode: Phaser.Scale.RESIZE,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    scene: [MainScene],
  };

  window.addEventListener('load', () => {
    const game = new Phaser.Game(config);

    window.addEventListener('resize', () => {
      game.scale.resize(window.innerWidth, window.innerHeight);
    });
  });
})();
