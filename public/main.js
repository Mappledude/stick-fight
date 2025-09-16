(function () {
  const SPEED = 220;
  const ACCEL = 1200;
  const FRICTION = 1600;
  const MAX_VEL = 240;

  const FIGHTER_GRAVITY = 2200;
  const FIGHTER_JUMP_VELOCITY = -800;
  const FIGHTER_JUMP_HORIZONTAL_IMPULSE = 180;
  const CROUCH_SPEED_FACTOR = 0.6;
  const GROUND_OFFSET = 120;

  const JOYSTICK_RADIUS = 68;
  const JOYSTICK_KNOB_RADIUS = 26;
  const JOYSTICK_DEADZONE = 0.15;
  const JOYSTICK_RETURN_DURATION = 150;
  const JOYSTICK_CROUCH_THRESHOLD = 0.5;
  const JOYSTICK_JUMP_MAG_THRESHOLD = 0.6;
  const JOYSTICK_JUMP_Y_THRESHOLD = -0.5;
  const JOYSTICK_JUMP_HORIZONTAL_THRESHOLD = 0.35;

  const FIGHTER_DEPTH = 10;
  const HUD_DEPTH = 20;
  const JOYSTICK_DEPTH = 25;
  const BUTTON_DEPTH = 30;
  const DEBUG_DEPTH = 40;

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
      .setDepth(HUD_DEPTH);

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
    constructor(scene, x, y, options = {}) {
      super(scene, x, y);

      this.scene = scene;
      scene.add.existing(this);

      this.radius = options.radius ?? JOYSTICK_RADIUS;
      this.knobRadius = options.knobRadius ?? JOYSTICK_KNOB_RADIUS;
      this.deadzone = options.deadzone ?? JOYSTICK_DEADZONE;
      this.returnDuration = options.returnDuration ?? JOYSTICK_RETURN_DURATION;
      this.preventDefault = options.preventDefault || (() => {});

      this.pointerId = null;
      this.pressed = false;
      this.normX = 0;
      this.normY = 0;
      this.magnitude = 0;
      this.angleRad = 0;

      this.setSize(this.radius * 2, this.radius * 2);
      this.setScrollFactor(0);
      this.setDepth(options.depth ?? JOYSTICK_DEPTH);

      const outer = scene.add.circle(0, 0, this.radius, 0xffffff, 0.25);
      outer.setStrokeStyle(2, 0xffffff, 0.45);
      outer.setAlpha(0.25);

      const knob = scene.add.circle(0, 0, this.knobRadius, 0xffffff, 0.45);
      knob.setStrokeStyle(2, 0xffffff, 0.65);
      knob.setAlpha(0.45);

      this.outer = outer;
      this.knob = knob;
      this.baseOuterAlpha = outer.alpha;
      this.baseKnobAlpha = knob.alpha;
      this.activeOuterAlpha = options.activeOuterAlpha ?? 0.38;
      this.activeKnobAlpha = options.activeKnobAlpha ?? 0.65;

      this.add([outer, knob]);

      this.isVirtualJoystick = true;

      this.setInteractive(
        new Phaser.Geom.Circle(0, 0, this.radius),
        Phaser.Geom.Circle.Contains
      );

      this.on('pointerdown', this.handlePointerDown, this);
      this.on('pointermove', this.handlePointerMove, this);
      ['pointerup', 'pointerupoutside', 'pointercancel', 'pointerout', 'lostpointercapture'].forEach(
        (eventName) => {
          this.on(eventName, this.handlePointerUp, this);
        }
      );

      this.handleGlobalPointerMove = (pointer) => {
        if (this.pointerId === null || pointer.id !== this.pointerId) {
          return;
        }
        const local = this.getLocalPoint(pointer);
        this.moveKnobTo(local.x, local.y);
      };

      if (scene.input) {
        scene.input.on('pointermove', this.handleGlobalPointerMove, this);
      }

      this.once(Phaser.GameObjects.Events.DESTROY, () => {
        if (scene.input) {
          scene.input.off('pointermove', this.handleGlobalPointerMove, this);
        }
        this.stopKnobTween();
      });
    }

    getLocalPoint(pointer) {
      const point = new Phaser.Math.Vector2();
      if (pointer && pointer.positionToCamera) {
        pointer.positionToCamera(this.scene.cameras.main, point);
      } else {
        point.set(pointer.worldX ?? pointer.x ?? 0, pointer.worldY ?? pointer.y ?? 0);
      }
      return new Phaser.Math.Vector2(point.x - this.x, point.y - this.y);
    }

    handlePointerDown(pointer) {
      if (this.pointerId !== null) {
        return;
      }
      this.pointerId = pointer.id;
      this.pressed = true;
      this.stopKnobTween();
      const local = this.getLocalPoint(pointer);
      this.moveKnobTo(local.x, local.y);
      this.updateAppearance(true);
      this.capturePointer(pointer);
      this.preventDefault(pointer);
    }

    handlePointerMove(pointer) {
      if (this.pointerId === null || pointer.id !== this.pointerId) {
        return;
      }
      const local = this.getLocalPoint(pointer);
      this.moveKnobTo(local.x, local.y);
      this.preventDefault(pointer);
    }

    handlePointerUp(pointer) {
      if (this.pointerId === null || pointer.id !== this.pointerId) {
        return;
      }
      this.releasePointer(pointer);
      this.pointerId = null;
      this.pressed = false;
      this.startReturnTween();
      this.updateAppearance(false);
      this.preventDefault(pointer);
    }

    moveKnobTo(x, y) {
      const distance = Math.sqrt(x * x + y * y);
      if (distance > this.radius) {
        const ratio = this.radius / distance;
        x *= ratio;
        y *= ratio;
      }
      this.knob.setPosition(x, y);
      this.updateNormalizedFromVector(x, y);
    }

    updateNormalizedFromVector(x, y) {
      const distance = Math.sqrt(x * x + y * y);
      const magnitude = distance === 0 ? 0 : Math.min(1, distance / this.radius);

      if (magnitude < this.deadzone || distance === 0) {
        this.normX = 0;
        this.normY = 0;
        this.magnitude = 0;
        this.angleRad = 0;
        return;
      }

      const scaledMagnitude = Phaser.Math.Clamp(
        (magnitude - this.deadzone) / (1 - this.deadzone),
        0,
        1
      );

      const unitX = x / distance;
      const unitY = y / distance;

      this.normX = unitX * scaledMagnitude;
      this.normY = unitY * scaledMagnitude;
      this.magnitude = scaledMagnitude;
      this.angleRad = Math.atan2(unitY, unitX);
    }

    startReturnTween() {
      this.stopKnobTween();
      this.knobTween = this.scene.tweens.add({
        targets: this.knob,
        x: 0,
        y: 0,
        duration: this.returnDuration,
        ease: 'Cubic.Out',
        onUpdate: () => {
          this.updateNormalizedFromVector(this.knob.x, this.knob.y);
        },
        onComplete: () => {
          this.knobTween = null;
          this.updateNormalizedFromVector(0, 0);
        },
      });
    }

    stopKnobTween() {
      if (this.knobTween && this.knobTween.stop) {
        this.knobTween.stop();
        this.knobTween = null;
      }
    }

    capturePointer(pointer) {
      const event = pointer && pointer.event;
      if (!event || !event.target || typeof event.target.setPointerCapture !== 'function') {
        return;
      }
      if (pointer.pointerId !== undefined) {
        try {
          event.target.setPointerCapture(pointer.pointerId);
        } catch (error) {
          // Ignore capture errors (e.g., target gone).
        }
      }
    }

    releasePointer(pointer) {
      const event = pointer && pointer.event;
      if (!event || !event.target || typeof event.target.releasePointerCapture !== 'function') {
        return;
      }
      if (pointer.pointerId !== undefined) {
        try {
          event.target.releasePointerCapture(pointer.pointerId);
        } catch (error) {
          // Ignore release errors.
        }
      }
    }

    updateAppearance(isActive) {
      const outerAlpha = isActive ? this.activeOuterAlpha : this.baseOuterAlpha;
      const knobAlpha = isActive ? this.activeKnobAlpha : this.baseKnobAlpha;
      this.outer.setAlpha(outerAlpha);
      this.knob.setAlpha(knobAlpha);
    }

    reset() {
      this.pointerId = null;
      this.pressed = false;
      this.stopKnobTween();
      this.knob.setPosition(0, 0);
      this.updateNormalizedFromVector(0, 0);
      this.updateAppearance(false);
    }

    setControlEnabled(enabled) {
      if (this.input) {
        this.input.enabled = enabled;
      }
      if (!enabled) {
        this.reset();
      }
      return this;
    }
  }

  class Stick extends Phaser.GameObjects.Container {
    constructor(scene, x, y, config = {}) {
      super(scene, x, y);

      scene.add.existing(this);

      this.setDepth(FIGHTER_DEPTH);

      const color = config.color ?? 0xffffff;
      const lineWidth = config.lineWidth ?? 4;

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
      this.add(parts);

      this.bodyParts = parts.map((part) => ({ gameObject: part, baseY: part.y }));

      this.baseBodyWidth = 28;
      this.baseBodyHeight = 64;
      this.crouchBodyHeight = 44;
      this.crouchVisualOffset = 8;
      this.visualOffset = 0;

      this.setSize(this.baseBodyWidth, this.baseBodyHeight);

      this.hp = 100;
      this.facing = config.facing === -1 ? -1 : 1;
      this.isAttacking = false;
      this.isCrouching = false;

      this.vy = 0;
      this.onGround = true;

      scene.physics.add.existing(this);
      const body = /** @type {Phaser.Physics.Arcade.Body} */ (this.body);
      body.setAllowGravity(false);
      body.setCollideWorldBounds(true);
      body.setSize(this.baseBodyWidth, this.baseBodyHeight, true);

      this.setFacing(this.facing);
      this.updateVisualOffset(0);
    }

    updateVisualOffset(offset) {
      if (this.visualOffset === offset) {
        return;
      }
      this.visualOffset = offset;
      (this.bodyParts || []).forEach((entry) => {
        if (entry && entry.gameObject && typeof entry.gameObject.setY === 'function') {
          entry.gameObject.setY(entry.baseY + offset);
        }
      });
    }

    setFacing(direction) {
      const dir = direction >= 0 ? 1 : -1;
      this.facing = dir;
      this.setScale(dir, 1);
      return this;
    }

    setCrouching(isCrouching) {
      const shouldCrouch = !!isCrouching;
      if (this.isCrouching === shouldCrouch) {
        return;
      }
      this.isCrouching = shouldCrouch;
      const body = /** @type {Phaser.Physics.Arcade.Body} */ (this.body);
      if (body) {
        const width = this.baseBodyWidth;
        const height = shouldCrouch ? this.crouchBodyHeight : this.baseBodyHeight;
        body.setSize(width, height);
        const offsetY = this.baseBodyHeight / 2 - height;
        body.setOffset(-width / 2, offsetY);
      }
      this.updateVisualOffset(shouldCrouch ? this.crouchVisualOffset : 0);
    }

    applyJump(horizontalImpulse = 0) {
      this.vy = FIGHTER_JUMP_VELOCITY;
      this.onGround = false;
      const body = /** @type {Phaser.Physics.Arcade.Body} */ (this.body);
      if (body) {
        const currentVx = body.velocity.x ?? 0;
        const newVx = Phaser.Math.Clamp(
          currentVx + horizontalImpulse,
          -MAX_VEL,
          MAX_VEL
        );
        body.setVelocityX(newVx);
        body.setVelocityY(0);
      }
    }

    setX(x) {
      return super.setX(x);
    }

    setY(y) {
      return super.setY(y);
    }

    update(dt = 0) {
      const body = /** @type {Phaser.Physics.Arcade.Body} */ (this.body);
      if (!body) {
        return;
      }

      const delta = Number.isFinite(dt) ? dt : 0;
      if (!this.onGround) {
        this.vy += FIGHTER_GRAVITY * delta;
      } else if (this.vy > 0) {
        this.vy = 0;
      }

      let newY = this.y + this.vy * delta;
      const groundY =
        this.scene && typeof this.scene.getGroundY === 'function'
          ? this.scene.getGroundY()
          : newY;

      if (newY >= groundY) {
        newY = groundY;
        if (this.vy > 0) {
          this.vy = 0;
        }
        this.onGround = true;
      } else {
        this.onGround = false;
      }

      const bounds = this.scene.physics.world.bounds;
      const topLimit = bounds.y + body.height / 2;
      if (newY < topLimit) {
        newY = topLimit;
        if (this.vy < 0) {
          this.vy = 0;
        }
      }

      super.setY(newY);

      const halfWidth = body.width / 2;
      const clampedX = Phaser.Math.Clamp(this.x, bounds.x + halfWidth, bounds.right - halfWidth);
      if (clampedX !== this.x) {
        super.setX(clampedX);
        body.setVelocityX(0);
      }

      body.setVelocityY(0);
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
        p1: { left: false, right: false, up: false, down: false },
        p2: { left: false, right: false, up: false, down: false },
      };
      this.touchButtons = { p1: {}, p2: {} };
      this.touchButtonsList = [];
      this.virtualJoysticks = { p1: null, p2: null };
      this.joystickList = [];
      this.joystickJumpStates = {
        p1: { active: false, direction: null },
        p2: { active: false, direction: null },
      };
      this.touchButtonLayout = {
        size: 80,
        gap: 18,
        margin: 28,
      };
      this.joystickLayout = {
        margin: 34,
      };
      const nav = typeof navigator !== 'undefined' ? navigator : null;
      const hasTouchSupport =
        (nav && typeof nav.maxTouchPoints === 'number' && nav.maxTouchPoints > 0) ||
        (typeof window !== 'undefined' && 'ontouchstart' in window);
      this._keyboardDetected = !hasTouchSupport;
      this._fighters = [];
      this.safeAreaInsets = { top: 0, right: 0, bottom: 0, left: 0 };
      this.debugOverlayVisible = false;
      this.debugText = null;
      this.groundOffset = GROUND_OFFSET;
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

      this.spawnFighters();

      const pointerDownHandler = (pointer) => {
        if (pointer && (pointer.pointerType === 'touch' || pointer.pointerType === 'pen')) {
          if (this._keyboardDetected) {
            this._keyboardDetected = false;
            this.updateTouchControlsVisibility();
          }
        }
      };
      this.input.on('pointerdown', pointerDownHandler);
      this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
        this.input.off('pointerdown', pointerDownHandler);
      });
    }

    handleResize(gameSize) {
      const { width, height } = gameSize || this.scale.gameSize;
      const camera = this.cameras.main;
      camera.setViewport(0, 0, width, height);
      camera.centerOn(width / 2, height / 2);

      this.updateSafeAreaInsets();

      (this._centeredElements || []).forEach((updatePosition) => updatePosition());
      this.positionTouchControls();
      this.positionDebugOverlay();

      if (this.physics && this.physics.world) {
        this.physics.world.setBounds(0, 0, width, height);
      }

      if (this._fighters) {
        this._fighters.forEach((fighter) => fighter.update());
      }
    }

    update(time, delta) {
      this.dt = Math.min(delta, 50) / 1000;
      const dt = this.dt;

      this.updateInputsFromKeyboard();
      this.updateInputsFromJoysticks();

      if (this._fighters && this._fighters.length) {
        const [p1, p2] = this._fighters;
        if (p1) {
          this.updateFighterMovement(p1, this.p1Input, p2, dt, 'p1');
        }
        if (p2) {
          this.updateFighterMovement(p2, this.p2Input, p1, dt, 'p2');
        }
      }

      this._fighters.forEach((fighter) => fighter.update(dt));
      this.updateDebugOverlay();
      this.resetMomentaryInputFlags();
    }

    updateFighterMovement(fighter, input, opponent, dt, playerKey) {
      if (!fighter || !input) {
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

      const canControl = !fighter.isAttacking;
      const forwardSign = playerKey === 'p2' ? -1 : 1;

      const rawMove = Phaser.Math.Clamp(input.moveX ?? 0, -1, 1);
      const moveValue = canControl ? rawMove : 0;
      const shouldCrouch = !!input.crouch && fighter.onGround;
      fighter.setCrouching(shouldCrouch);

      const maxSpeed = shouldCrouch ? SPEED * CROUCH_SPEED_FACTOR : SPEED;
      const targetVelocity = moveValue * maxSpeed;

      const acceleration = targetVelocity === 0 ? FRICTION : ACCEL;
      let vx = body.velocity.x;

      if (targetVelocity > vx) {
        vx = Math.min(vx + acceleration * dt, targetVelocity);
      } else if (targetVelocity < vx) {
        vx = Math.max(vx - acceleration * dt, targetVelocity);
      }

      vx = Phaser.Math.Clamp(vx, -MAX_VEL, MAX_VEL);
      if (targetVelocity === 0 && Math.abs(vx) < 1) {
        vx = 0;
      }

      body.setVelocityX(vx);

      if (fighter.onGround) {
        let jumpDirection = null;
        if (input.jumpForward) {
          jumpDirection = 'forward';
        } else if (input.jumpBack) {
          jumpDirection = 'back';
        } else if (input.jumpUp) {
          jumpDirection = 'up';
        }
        if (jumpDirection) {
          let impulse = 0;
          if (jumpDirection === 'forward') {
            impulse = forwardSign * FIGHTER_JUMP_HORIZONTAL_IMPULSE;
          } else if (jumpDirection === 'back') {
            impulse = -forwardSign * FIGHTER_JUMP_HORIZONTAL_IMPULSE;
          }
          fighter.setCrouching(false);
          fighter.applyJump(impulse);
        }
      }
    }

    spawnFighters() {
      if (!this.physics || !this.physics.world) {
        return;
      }

      const bounds = this.physics.world.bounds;
      const paddingX = 160;
      const safeHalfWidth = 14;
      const safeHalfHeight = 32;

      const minX = bounds.x + safeHalfWidth;
      const maxX = bounds.right - safeHalfWidth;
      const minY = bounds.y + safeHalfHeight;
      const maxY = bounds.bottom - safeHalfHeight;

      const p1X = Phaser.Math.Clamp(bounds.x + paddingX, minX, maxX);
      const p2X = Phaser.Math.Clamp(bounds.right - paddingX, minX, maxX);
      const groundY = this.getGroundY();
      const startY = Phaser.Math.Clamp(groundY, minY, maxY);

      const p1 = new Stick(this, p1X, startY, { facing: 1, color: 0x4cd964 });
      const p2 = new Stick(this, p2X, startY, { facing: -1, color: 0xff3b30 });

      p1.setFacing(1);
      p2.setFacing(-1);
      p1.setY(startY);
      p2.setY(startY);
      p1.vy = 0;
      p2.vy = 0;
      p1.onGround = true;
      p2.onGround = true;

      this._fighters = [p1, p2];
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

    getPlayerInput(player) {
      return player === 'p2' ? this.p2Input : this.p1Input;
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

    getGroundY() {
      const { height } = this.scale.gameSize;
      return height - this.groundOffset;
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
      text.setDepth(DEBUG_DEPTH);
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
      const topOffset = (this.safeAreaInsets?.top || 0) + 12;
      this.debugText.setPosition(width / 2, topOffset);
    }

    updateDebugOverlay() {
      if (!this.debugText) {
        return;
      }
      const bool = (value) => (value ? 'T' : 'F');
      const num = (value) => {
        if (!Number.isFinite(value)) {
          return '0.00';
        }
        return value.toFixed(2);
      };
      const fighterInfo = this._fighters || [];
      const [p1Fighter, p2Fighter] = fighterInfo;
      const p1 = this.p1Input || {};
      const p2 = this.p2Input || {};
      const formatLine = (label, state, fighter) => {
        const groundState = fighter ? (fighter.onGround ? 'G' : 'A') : '-';
        const vy = fighter && Number.isFinite(fighter.vy) ? fighter.vy.toFixed(0) : '0';
        return `${label} MX:${num(state.moveX ?? 0)} CR:${bool(state.crouch)} J[U/F/B]:${bool(
          state.jumpUp
        )}/${bool(state.jumpForward)}/${bool(state.jumpBack)} P:${bool(state.punch)} K:${bool(
          state.kick
        )} G:${groundState} VY:${vy}`;
      };
      const lines = [formatLine('P1', p1, p1Fighter), formatLine('P2', p2, p2Fighter)];
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

      const joystickOptions = {
        radius: JOYSTICK_RADIUS,
        knobRadius: JOYSTICK_KNOB_RADIUS,
        deadzone: JOYSTICK_DEADZONE,
        returnDuration: JOYSTICK_RETURN_DURATION,
        depth: JOYSTICK_DEPTH,
        preventDefault: (pointer) => this.preventPointerDefault(pointer),
      };

      const p1Joystick = new VirtualJoystick(this, 0, 0, joystickOptions);
      const p2Joystick = new VirtualJoystick(this, 0, 0, joystickOptions);
      this.virtualJoysticks.p1 = p1Joystick;
      this.virtualJoysticks.p2 = p2Joystick;
      this.joystickList = [p1Joystick, p2Joystick];

      const tintJoystick = (joystick, color) => {
        if (!joystick) {
          return;
        }
        if (joystick.outer && typeof joystick.outer.setFillStyle === 'function') {
          joystick.outer.setFillStyle(color, joystick.outer.alpha);
          joystick.outer.setStrokeStyle(2, color, 0.45);
        }
        if (joystick.knob && typeof joystick.knob.setFillStyle === 'function') {
          joystick.knob.setFillStyle(color, joystick.knob.alpha);
          joystick.knob.setStrokeStyle(2, color, 0.7);
        }
      };

      tintJoystick(p1Joystick, 0x4cd964);
      tintJoystick(p2Joystick, 0xff3b30);

      const createButton = (player, key, label, textStyleOverrides = {}) => {
        const button = this.createTouchButton(label, textStyleOverrides);
        this.touchButtons[player][key] = button;
        this.touchButtonsList.push(button);
        button.activePointers = this.pointerStates[player][key];
        this.configureButtonInteraction(button, player, key);
        return button;
      };

      createButton('p1', 'punch', 'Punch', { fontSize: '26px' });
      createButton('p1', 'kick', 'Kick', { fontSize: '26px' });

      createButton('p2', 'punch', 'Punch', { fontSize: '26px' });
      createButton('p2', 'kick', 'Kick', { fontSize: '26px' });

      this.positionTouchControls();
      this.updateTouchControlsVisibility();
    }

    createTouchButton(label, textStyleOverrides = {}) {
      const { size } = this.touchButtonLayout;
      const container = this.add.container(0, 0);
      container.setSize(size, size);
      container.setScrollFactor(0);
      container.setDepth(BUTTON_DEPTH);

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

    updateInputsFromKeyboard() {
      ['p1', 'p2'].forEach((player) => {
        const state = this.getPlayerInput(player);
        const keyboardStates = this.keyboardHoldStates[player];
        if (!state || !keyboardStates) {
          return;
        }
        const left = !!keyboardStates.left;
        const right = !!keyboardStates.right;
        let moveX = 0;
        if (left && !right) {
          moveX = -1;
        } else if (right && !left) {
          moveX = 1;
        }
        state.moveX = moveX;
        state.crouch = !!keyboardStates.down;
      });
    }

    handleKeyboardJump(player) {
      const state = this.getPlayerInput(player);
      if (!state) {
        return;
      }
      const keyboardStates = this.keyboardHoldStates[player] || {};
      const left = !!keyboardStates.left;
      const right = !!keyboardStates.right;
      let horizontal = 0;
      if (right && !left) {
        horizontal = 1;
      } else if (left && !right) {
        horizontal = -1;
      }
      const forwardSign = player === 'p2' ? -1 : 1;
      if (horizontal === 0) {
        state.jumpUp = true;
      } else if (horizontal === forwardSign) {
        state.jumpForward = true;
      } else {
        state.jumpBack = true;
      }
      this.detectKeyboard();
    }

    updateInputsFromJoysticks() {
      this.processJoystickInput('p1', this.virtualJoysticks.p1, 1);
      this.processJoystickInput('p2', this.virtualJoysticks.p2, -1);
    }

    processJoystickInput(player, joystick, forwardSign) {
      const state = this.getPlayerInput(player);
      const keyboardStates = this.keyboardHoldStates[player] || {};
      const jumpState = this.joystickJumpStates[player] || {
        active: false,
        direction: null,
      };
      this.joystickJumpStates[player] = jumpState;

      if (!state || !joystick || !joystick.input || !joystick.input.enabled) {
        jumpState.active = false;
        jumpState.direction = null;
        state && (state.crouch = !!keyboardStates.down);
        return;
      }

      const keyboardMove = state.moveX ?? 0;
      const joystickMove = Phaser.Math.Clamp(joystick.normX ?? 0, -1, 1);
      if (Math.abs(joystickMove) >= Math.abs(keyboardMove)) {
        state.moveX = joystickMove;
      }

      const joystickCrouch = (joystick.normY ?? 0) >= JOYSTICK_CROUCH_THRESHOLD;
      state.crouch = joystickCrouch || !!keyboardStates.down;

      const magnitude = joystick.magnitude ?? 0;
      const verticalActive = (joystick.normY ?? 0) <= JOYSTICK_JUMP_Y_THRESHOLD;
      let newDirection = null;
      if (magnitude >= JOYSTICK_JUMP_MAG_THRESHOLD && verticalActive) {
        const forwardComponent = (joystick.normX ?? 0) * forwardSign;
        if (forwardComponent > JOYSTICK_JUMP_HORIZONTAL_THRESHOLD) {
          newDirection = 'forward';
        } else if (forwardComponent < -JOYSTICK_JUMP_HORIZONTAL_THRESHOLD) {
          newDirection = 'back';
        } else {
          newDirection = 'up';
        }
      }

      if (newDirection) {
        if (!jumpState.active) {
          if (newDirection === 'forward') {
            state.jumpForward = true;
          } else if (newDirection === 'back') {
            state.jumpBack = true;
          } else {
            state.jumpUp = true;
          }
        }
        jumpState.active = true;
        jumpState.direction = newDirection;
      } else if (jumpState.active) {
        jumpState.active = false;
        jumpState.direction = null;
      }
    }

    updateActionHoldState(player, key) {
      const pointerActive = this.pointerStates[player][key]?.size > 0;
      const state = this.getPlayerInput(player);
      if (state) {
        state[key] = pointerActive;
      }
      const button = this.touchButtons[player]?.[key];
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
        if (!(this.pointerStates[player].punch?.size > 0)) {
          state.punch = false;
        }
        if (!(this.pointerStates[player].kick?.size > 0)) {
          state.kick = false;
        }
      });
    }

    preventPointerDefault(pointer) {
      const event = pointer && (pointer.event || pointer.originalEvent);
      if (event && typeof event.preventDefault === 'function' && event.cancelable !== false) {
        event.preventDefault();
      }
    }

    positionTouchControls() {
      const { width, height } = this.scale.gameSize;
      const safe = this.safeAreaInsets || { top: 0, right: 0, bottom: 0, left: 0 };
      const margin = this.joystickLayout?.margin ?? 32;

      const baseJoystickY = height - safe.bottom - margin - JOYSTICK_RADIUS;
      const minButtonY = safe.top + margin + this.touchButtonLayout.size / 2;

      const p1Joystick = this.virtualJoysticks.p1;
      const p2Joystick = this.virtualJoysticks.p2;

      if (p1Joystick) {
        p1Joystick.setPosition(safe.left + margin + JOYSTICK_RADIUS, baseJoystickY);
      }
      if (p2Joystick) {
        p2Joystick.setPosition(width - safe.right - margin - JOYSTICK_RADIUS, baseJoystickY);
      }

      const { size, gap } = this.touchButtonLayout;
      const horizontalOffset = size / 2 + gap / 2;
      const verticalOffset = JOYSTICK_RADIUS + gap + size / 2;

      const p1Buttons = this.touchButtons.p1 || {};
      if (p1Buttons.punch && p1Buttons.kick) {
        const centerX = p1Joystick ? p1Joystick.x : safe.left + margin + JOYSTICK_RADIUS;
        const centerY = p1Joystick ? p1Joystick.y : baseJoystickY;
        const buttonY = Math.max(minButtonY, centerY - verticalOffset);
        p1Buttons.punch.setPosition(centerX - horizontalOffset, buttonY);
        p1Buttons.kick.setPosition(centerX + horizontalOffset, buttonY);
      }

      const p2Buttons = this.touchButtons.p2 || {};
      if (p2Buttons.punch && p2Buttons.kick) {
        const centerX = p2Joystick ? p2Joystick.x : width - safe.right - margin - JOYSTICK_RADIUS;
        const centerY = p2Joystick ? p2Joystick.y : baseJoystickY;
        const buttonY = Math.max(minButtonY, centerY - verticalOffset);
        p2Buttons.punch.setPosition(centerX - horizontalOffset, buttonY);
        p2Buttons.kick.setPosition(centerX + horizontalOffset, buttonY);
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

      const setHoldState = (player, key, isActive) => {
        const keyboardStates = this.keyboardHoldStates[player];
        if (!keyboardStates) {
          return;
        }
        keyboardStates[key] = isActive;
        this.updateInputsFromKeyboard();
        if (isActive) {
          this.detectKeyboard();
        }
      };

      const onP1LeftDown = () => setHoldState('p1', 'left', true);
      const onP1LeftUp = () => setHoldState('p1', 'left', false);
      const onP1RightDown = () => setHoldState('p1', 'right', true);
      const onP1RightUp = () => setHoldState('p1', 'right', false);

      const onP2LeftDown = () => setHoldState('p2', 'left', true);
      const onP2LeftUp = () => setHoldState('p2', 'left', false);
      const onP2RightDown = () => setHoldState('p2', 'right', true);
      const onP2RightUp = () => setHoldState('p2', 'right', false);

      const onP1CrouchDown = () => setHoldState('p1', 'down', true);
      const onP1CrouchUp = () => setHoldState('p1', 'down', false);
      const onP2CrouchDown = () => setHoldState('p2', 'down', true);
      const onP2CrouchUp = () => setHoldState('p2', 'down', false);

      const onP1JumpDown = (event) => {
        if (event && event.repeat) {
          this.detectKeyboard();
          return;
        }
        setHoldState('p1', 'up', true);
        this.handleKeyboardJump('p1');
      };
      const onP1JumpUp = () => setHoldState('p1', 'up', false);

      const onP2JumpDown = (event) => {
        if (event && event.repeat) {
          this.detectKeyboard();
          return;
        }
        setHoldState('p2', 'up', true);
        this.handleKeyboardJump('p2');
      };
      const onP2JumpUp = () => setHoldState('p2', 'up', false);

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
        ['keyup-W', onP1JumpUp],
        ['keydown-LEFT', onP2LeftDown],
        ['keyup-LEFT', onP2LeftUp],
        ['keydown-RIGHT', onP2RightDown],
        ['keyup-RIGHT', onP2RightUp],
        ['keydown-DOWN', onP2CrouchDown],
        ['keyup-DOWN', onP2CrouchUp],
        ['keydown-UP', onP2JumpDown],
        ['keyup-UP', onP2JumpUp],
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
    }
  }

  const config = {
    type: Phaser.AUTO,
    parent: 'game-root',
    backgroundColor: '#111',
    physics: {
      default: 'arcade',
      arcade: {
        gravity: { y: 0 },
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
