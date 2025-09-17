(function () {
  const SPEED = 220;
  const ACCEL = 1200;
  const FRICTION = 1600;
  const AIR_ACCEL = 620;
  const AIR_DRAG = 2.25;
  const MAX_VEL = 240;
  const JUMP_SPEED = 560;
  const JUMP_HORIZONTAL_SPEED = 260;
  const CROUCH_SPEED_SCALE = 0.35;
  const JOYSTICK_RADIUS = 92;
  const JOYSTICK_DEADZONE = 0.22;
  const JOYSTICK_JUMP_THRESHOLD = 0.48;
  const JOYSTICK_JUMP_HORIZONTAL_THRESHOLD = 0.32;
  const JOYSTICK_CROUCH_THRESHOLD = 0.45;
  const GRAVITY_Y = 2200;
  const MIN_LAYOUT_WIDTH = 320;
  const MIN_LAYOUT_HEIGHT = 180;
  const LAYOUT_POLL_INTERVAL = 16;
  const LAYOUT_POLL_TIMEOUT = 500;

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
      this.radius = config.radius || JOYSTICK_RADIUS;
      this.innerRadius = config.innerRadius || Math.max(this.radius * 0.4, 28);
      this.deadzone =
        typeof config.deadzone === 'number' ? Math.max(0, config.deadzone) : JOYSTICK_DEADZONE;
      this.hitPadding = typeof config.hitPadding === 'number' ? config.hitPadding : 28;
      this.pointerId = null;
      this.vector = new Phaser.Math.Vector2(0, 0);
      this.magnitude = 0;
      this.enabled = true;
      this.synthetic = {
        active: false,
        vector: new Phaser.Math.Vector2(0, 0),
      };

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

      this.on('pointerdown', this.handlePointerDown, this);
      this.on('pointermove', this.handlePointerMove, this);
      this.on('pointerup', this.handlePointerUp, this);
      this.on('pointerupoutside', this.handlePointerUp, this);
      this.on('pointercancel', this.handlePointerUp, this);
      this.on('pointerout', this.handlePointerUp, this);
      this.on('lostpointercapture', this.handlePointerUp, this);

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
      if (this.magnitude <= this.deadzone) {
        return false;
      }
      return this.pointerId !== null || this.synthetic.active;
    }

    handlePointerDown(pointer) {
      if (!this.enabled) {
        return;
      }
      this.synthetic.active = false;
      const pointerId = this.getPointerId(pointer);
      if (this.pointerId !== null && this.pointerId !== pointerId) {
        return;
      }
      this.pointerId = pointerId;
      if (this.scene && typeof this.scene.preventPointerDefault === 'function') {
        this.scene.preventPointerDefault(pointer);
      }
      this.updateFromPointer(pointer);
      this.emit('joystickstart', this.vector);
    }

    handlePointerMove(pointer) {
      if (!this.enabled) {
        return;
      }
      this.synthetic.active = false;
      const pointerId = this.getPointerId(pointer);
      if (this.pointerId !== pointerId) {
        return;
      }
      if (this.scene && typeof this.scene.preventPointerDefault === 'function') {
        this.scene.preventPointerDefault(pointer);
      }
      this.updateFromPointer(pointer);
      this.emit('joystickmove', this.vector);
    }

    handlePointerUp(pointer) {
      const pointerId = this.getPointerId(pointer);
      if (this.pointerId !== null && pointerId !== null && this.pointerId !== pointerId) {
        return;
      }
      if (this.scene && typeof this.scene.preventPointerDefault === 'function') {
        this.scene.preventPointerDefault(pointer);
      }
      this.reset();
      this.emit('joystickend');
    }

    updateFromPointer(pointer) {
      const worldX = typeof pointer.worldX === 'number' ? pointer.worldX : pointer.x;
      const worldY = typeof pointer.worldY === 'number' ? pointer.worldY : pointer.y;
      const dx = worldX - this.x;
      const dy = worldY - this.y;
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
      this.synthetic.active = false;
    }

    reset() {
      this.pointerId = null;
      this.vector.set(0, 0);
      this.magnitude = 0;
      this.synthetic.active = false;
      this.synthetic.vector.set(0, 0);
      if (this.knob) {
        this.knob.setPosition(0, 0);
      }
    }

    getVector() {
      return { x: this.vector.x, y: this.vector.y, magnitude: this.magnitude };
    }

    setSyntheticInput(x, y) {
      if (!this.enabled || this.pointerId !== null) {
        return;
      }
      const clampedX = Phaser.Math.Clamp(x, -1, 1);
      const clampedY = Phaser.Math.Clamp(y, -1, 1);
      this.synthetic.active = true;
      this.synthetic.vector.set(clampedX, clampedY);

      const magnitude = Phaser.Math.Clamp(
        Math.sqrt(clampedX * clampedX + clampedY * clampedY),
        0,
        1
      );
      this.magnitude = magnitude;
      this.vector.set(clampedX, clampedY);

      if (this.knob) {
        this.knob.setPosition(this.vector.x * this.radius, this.vector.y * this.radius);
      }
    }

    clearSyntheticInput() {
      if (!this.synthetic.active || this.pointerId !== null) {
        return;
      }
      this.synthetic.active = false;
      this.synthetic.vector.set(0, 0);
      this.vector.set(0, 0);
      this.magnitude = 0;
      if (this.knob) {
        this.knob.setPosition(0, 0);
      }
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
        joystickRadius: JOYSTICK_RADIUS,
      };
      const nav = typeof navigator !== 'undefined' ? navigator : null;
      const win = typeof window !== 'undefined' ? window : null;

      this._forceJoystick = false;
      this._forceKeyboard = false;
      this._joyDiagEnabled = false;
      this._joyTestEnabled = false;
      this._joyDiagVelocityElapsed = 0;
      this._joyTestElapsed = 0;
      this._joyTestDirection = 1;
      this._joyTestInterval = 1.2;
      this._joyTestNeedsLog = true;

      const parseDebugFlag = (value) => {
        if (typeof value !== 'string') {
          return false;
        }
        const normalized = value.trim().toLowerCase();
        return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
      };

      if (win && win.location && typeof win.location.search === 'string') {
        if (typeof URLSearchParams === 'function') {
          const params = new URLSearchParams(win.location.search);
          this._forceJoystick = parseDebugFlag(params.get('forceJoystick'));
          this._forceKeyboard = parseDebugFlag(params.get('forceKeyboard'));
          this._joyDiagEnabled = parseDebugFlag(params.get('joydiag'));
          this._joyTestEnabled = parseDebugFlag(params.get('joytest'));
        } else {
          const searchLower = win.location.search.toLowerCase();
          this._forceJoystick = /[?&]forcejoystick=(1|true|yes|on)\b/.test(searchLower);
          this._forceKeyboard = /[?&]forcekeyboard=(1|true|yes|on)\b/.test(searchLower);
          this._joyDiagEnabled = /[?&]joydiag=(1|true|yes|on)\b/.test(searchLower);
          this._joyTestEnabled = /[?&]joytest=(1|true|yes|on)\b/.test(searchLower);
        }
      }

      if (!this._joyDiagEnabled) {
        this._joyTestEnabled = false;
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
      this._layoutReady = false;
      this._layoutReadyLogPrinted = false;
      this._resizeDebounceEvent = null;
      this._pendingResizeSize = null;
      this.joystickSnapshots = {
        p1: this.createJoystickSnapshot(),
        p2: this.createJoystickSnapshot(),
      };
      this.joystickPrevDirections = {
        p1: { up: false, forward: false, back: false },
        p2: { up: false, forward: false, back: false },
      };
    }

    preload() {}

    create() {
      this.cameras.main.setBackgroundColor('#111');

      this.titleText = centerText(this, 'Stick-Fight', -28, { fontSize: '56px', fontStyle: '700' });
      if (this.titleText && this.titleText.setInteractive) {
        this.titleText.setInteractive({ useHandCursor: false });
        this.titleText.on('pointerdown', (pointer) => {
          this.preventPointerDefault(pointer);
          this.toggleDebugOverlay();
        });
      }
      centerText(this, 'Main Scene Ready', 28, { fontSize: '24px', color: '#bbbbbb' });

      this.registerTouchPrevention();
      this.createTouchControls();
      this.registerKeyboardControls();
      this.createDebugOverlay();

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

      this.clampFightersToWorld();
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
      this.physics.world.setBounds(0, 0, width, height);
    }

    clampFightersToWorld() {
      if (!this._fighters || !this.physics || !this.physics.world) {
        return;
      }
      const bounds = this.physics.world.bounds;
      if (!bounds || bounds.width <= 0 || bounds.height <= 0) {
        return;
      }

      this._fighters.forEach((fighter) => {
        if (!fighter) {
          return;
        }
        const body = /** @type {Phaser.Physics.Arcade.Body} */ (fighter.body);
        if (!body) {
          return;
        }

        const halfWidth = body.width / 2;
        const halfHeight = body.height / 2;
        const minX = bounds.x + halfWidth;
        const maxX = bounds.right - halfWidth;
        const minY = bounds.y + halfHeight;
        const maxY = bounds.bottom - halfHeight;

        const clampedX = Phaser.Math.Clamp(fighter.x, minX, maxX);
        const clampedY = Phaser.Math.Clamp(fighter.y, minY, maxY);

        if (clampedX !== fighter.x) {
          fighter.setX(clampedX);
          body.setVelocityX(0);
        }

        if (clampedY !== fighter.y) {
          fighter.setY(clampedY);
          body.setVelocityY(0);
        }

        fighter.setAlpha(1);
        fighter.setVisible(true);
      });
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
        camera.centerOn(safeWidth / 2, safeHeight / 2);
      }

      this.updateSafeAreaInsets();

      (this._centeredElements || []).forEach((updatePosition) => updatePosition());
      this.positionTouchButtons();
      this.positionDebugOverlay();

      if (this._layoutReady) {
        this.refreshWorldBounds(size);
        this.clampFightersToWorld();
      }
    }

    update(time, delta) {
      this.dt = Math.min(delta, 50) / 1000;
      if (this._joyDiagEnabled && this._joyTestEnabled) {
        this.runJoyTestSimulation(this.dt);
      } else {
        this.clearJoyTestSimulation();
      }
      this.reconcileInputState();

      if (this._fighters && this._fighters.length) {
        const [p1, p2] = this._fighters;
        if (p1) {
          if (this._joyDiagEnabled) {
            console.log('[joydiag] p1 input', {
              moveX: this.p1Input.moveX,
              crouch: this.p1Input.crouch,
              jumpUp: this.p1Input.jumpUp,
              jumpForward: this.p1Input.jumpForward,
              jumpBack: this.p1Input.jumpBack,
            });
          }
          this.updateFighterMovement(p1, this.p1Input, p2, this.dt);
        }
        if (p2) {
          if (this._joyDiagEnabled) {
            console.log('[joydiag] p2 input', {
              moveX: this.p2Input.moveX,
              crouch: this.p2Input.crouch,
              jumpUp: this.p2Input.jumpUp,
              jumpForward: this.p2Input.jumpForward,
              jumpBack: this.p2Input.jumpBack,
            });
          }
          this.updateFighterMovement(p2, this.p2Input, p1, this.dt);
        }
      }

      if (this._joyDiagEnabled) {
        this._joyDiagVelocityElapsed += this.dt;
        if (this._joyDiagVelocityElapsed >= 1) {
          this._joyDiagVelocityElapsed -= 1;
          this._fighters.forEach((fighter, index) => {
            if (!fighter || !fighter.body || !fighter.body.velocity) {
              return;
            }
            console.log(`[joydiag] fighter${index + 1} velocity`, {
              x: fighter.body.velocity.x,
              y: fighter.body.velocity.y,
            });
          });
        }
      }

      this._fighters.forEach((fighter) => fighter.update(this.dt));
      this.resetMomentaryInputFlags();
      this.updateDebugOverlay();
    }

    runJoyTestSimulation(dt) {
      const interval = Math.max(this._joyTestInterval, 0.1);
      this._joyTestElapsed += dt;

      if (this._joyTestNeedsLog) {
        console.log('[joytest] synthetic joystick direction: right (initial)');
        this._joyTestNeedsLog = false;
      }

      while (this._joyTestElapsed >= interval) {
        this._joyTestElapsed -= interval;
        this._joyTestDirection *= -1;
        const directionLabel = this._joyTestDirection > 0 ? 'right' : 'left';
        console.log(`[joytest] synthetic joystick direction: ${directionLabel}`);
      }

      const vectorX = 0.85 * this._joyTestDirection;
      const vectorY = 0;
      ['p1', 'p2'].forEach((player) => {
        const joystick = this.virtualJoysticks[player];
        if (joystick && typeof joystick.setSyntheticInput === 'function') {
          joystick.setSyntheticInput(vectorX, vectorY);
        }
      });
    }

    clearJoyTestSimulation() {
      this._joyTestElapsed = 0;
      this._joyTestDirection = 1;
      if (!this._joyTestNeedsLog) {
        this._joyTestNeedsLog = true;
      }
      ['p1', 'p2'].forEach((player) => {
        const joystick = this.virtualJoysticks[player];
        if (joystick && typeof joystick.clearSyntheticInput === 'function') {
          joystick.clearSyntheticInput();
        }
      });
    }

    reconcileInputState() {
      this.updateJoystickSnapshots();

      ['p1', 'p2'].forEach((player) => {
        const state = this.getPlayerInput(player);
        if (!state) {
          return;
        }

        const joystick = this.joystickSnapshots[player];
        const keyboardMoveX = this.determineKeyboardMoveX(player);
        const moveX = keyboardMoveX !== 0 ? keyboardMoveX : joystick.moveX;
        state.moveX = Phaser.Math.Clamp(moveX, -1, 1);

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

      const joystickP1 = new VirtualJoystick(this, 0, 0, {
        radius: this.touchButtonLayout.joystickRadius,
        deadzone: JOYSTICK_DEADZONE,
      });
      const joystickP2 = new VirtualJoystick(this, 0, 0, {
        radius: this.touchButtonLayout.joystickRadius,
        deadzone: JOYSTICK_DEADZONE,
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

      createButton('p1', 'punch', 'Punch', { fontSize: '26px' });
      createButton('p1', 'kick', 'Kick', { fontSize: '26px' });

      createButton('p2', 'punch', 'Punch', { fontSize: '26px' });
      createButton('p2', 'kick', 'Kick', { fontSize: '26px' });

      this.positionTouchButtons();
      this.updateTouchControlsVisibility();
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
      };

      const handlePointerEnd = (pointer) => {
        if (pointer && typeof pointer.id !== 'undefined') {
          pointerSet.delete(pointer.id);
        }
        this.updateActionHoldState(player, key);
        this.preventPointerDefault(pointer);
      };

      button.on('pointerdown', handlePointerDown);
      ['pointerup', 'pointerupoutside', 'pointerout', 'pointercancel', 'lostpointercapture'].forEach(
        (eventName) => {
          button.on(eventName, handlePointerEnd);
        }
      );

      this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
        button.off('pointerdown', handlePointerDown);
        ['pointerup', 'pointerupoutside', 'pointerout', 'pointercancel', 'lostpointercapture'].forEach(
          (eventName) => {
            button.off(eventName, handlePointerEnd);
          }
        );
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
      if (event && typeof event.preventDefault === 'function' && event.cancelable !== false) {
        event.preventDefault();
      }
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
      if (visible) {
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
          fontSize: '16px',
          color: '#00e7ff',
          align: 'center',
        })
        .setOrigin(0.5, 0);
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
      const { width } = this.scale.gameSize;
      const safeInsets = this.safeAreaInsets || {};
      const topInset = typeof safeInsets.top === 'number' ? safeInsets.top : 0;
      const topOffset = topInset + 12;
      this.debugText.setPosition(width / 2, topOffset);
    }

    updateDebugOverlay() {
      if (!this.debugText) {
        return;
      }
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
      this.debugText.setText(lines.join('\n'));
      this.debugText.setVisible(this.debugOverlayVisible);
    }

    toggleDebugOverlay(forceState) {
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
