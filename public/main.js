(function () {
  const SPEED = 220;
  const ACCEL = 1200;
  const FRICTION = 1600;
  const MAX_VEL = 240;

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

    const text = scene.add.text(0, 0, content, textStyle).setOrigin(0.5, 0.5);

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

  class Stick extends Phaser.GameObjects.Container {
    constructor(scene, x, y, config = {}) {
      super(scene, x, y);

      scene.add.existing(this);

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

      this.add([legLeft, legRight, torso, armLeft, armRight, head]);

      this.setSize(28, 64);

      this.hp = 100;
      this.facing = config.facing === -1 ? -1 : 1;
      this.isAttacking = false;

      scene.physics.add.existing(this);
      const body = /** @type {Phaser.Physics.Arcade.Body} */ (this.body);
      body.setAllowGravity(false);
      body.setCollideWorldBounds(true);
      body.setSize(28, 64, true);

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

    setX(x) {
      return super.setX(x);
    }

    setY(y) {
      return super.setY(y);
    }

    update() {
      const body = /** @type {Phaser.Physics.Arcade.Body} */ (this.body);
      if (!body) {
        return;
      }

      const bounds = this.scene.physics.world.bounds;
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
        p1: { left: false, right: false },
        p2: { left: false, right: false },
      };
      this.touchButtons = { p1: {}, p2: {} };
      this.touchButtonsList = [];
      this.touchButtonLayout = {
        size: 80,
        gap: 18,
        margin: 28,
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
      this.positionTouchButtons();
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

      if (this._fighters && this._fighters.length) {
        const [p1, p2] = this._fighters;
        if (p1) {
          this.updateFighterMovement(p1, this.p1Input, p2, dt);
        }
        if (p2) {
          this.updateFighterMovement(p2, this.p2Input, p1, dt);
        }
      }

      this._fighters.forEach((fighter) => fighter.update(dt));
      this.resetMomentaryInputFlags();
      this.updateDebugOverlay();
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

      let targetVelocity = 0;
      const canControl = !fighter.isAttacking;
      if (canControl && input) {
        const leftActive = !!input.left;
        const rightActive = !!input.right;
        if (leftActive && !rightActive) {
          targetVelocity = -SPEED;
        } else if (rightActive && !leftActive) {
          targetVelocity = SPEED;
        }
      }

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
      const centerY = bounds.y + bounds.height / 2;
      const startY = Phaser.Math.Clamp(centerY, minY, maxY);

      const p1 = new Stick(this, p1X, startY, { facing: 1, color: 0x4cd964 });
      const p2 = new Stick(this, p2X, startY, { facing: -1, color: 0xff3b30 });

      p1.setFacing(1);
      p2.setFacing(-1);

      this._fighters = [p1, p2];
    }

    createPlayerInputState() {
      return {
        left: false,
        right: false,
        punch: false,
        kick: false,
        punchPressed: false,
        kickPressed: false,
      };
    }

    createPointerState() {
      return {
        left: new Set(),
        right: new Set(),
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
      text.setDepth(1500);
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
      const format = (value) => (value ? 'T' : 'F');
      const p1 = this.p1Input;
      const p2 = this.p2Input;
      const lines = [
        `P1 L:${format(p1.left)} R:${format(p1.right)} P:${format(p1.punch)} K:${format(p1.kick)}`,
        `P2 L:${format(p2.left)} R:${format(p2.right)} P:${format(p2.punch)} K:${format(p2.kick)}`,
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
        const mode = key === 'left' || key === 'right' ? 'directional' : 'action';
        this.configureButtonInteraction(button, player, key, mode);
        return button;
      };

      createButton('p1', 'left', '◀', { fontSize: '42px' });
      createButton('p1', 'right', '▶', { fontSize: '42px' });
      createButton('p1', 'punch', 'Punch', { fontSize: '26px' });
      createButton('p1', 'kick', 'Kick', { fontSize: '26px' });

      createButton('p2', 'left', '◀', { fontSize: '42px' });
      createButton('p2', 'right', '▶', { fontSize: '42px' });
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
      container.setDepth(1000);

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

    configureButtonInteraction(button, player, key, mode) {
      if (!button) {
        return;
      }
      const pointerSet = this.pointerStates[player][key];

      const handlePointerDown = (pointer) => {
        this.preventPointerDefault(pointer);
        if (pointer && typeof pointer.id !== 'undefined') {
          pointerSet.add(pointer.id);
        }
        if (mode === 'directional') {
          this.syncDirectionalState(player, key);
        } else {
          this.handleActionPress(player, key);
          this.updateActionHoldState(player, key);
        }
      };

      const handlePointerEnd = (pointer) => {
        if (pointer && typeof pointer.id !== 'undefined') {
          pointerSet.delete(pointer.id);
        }
        if (mode === 'directional') {
          this.syncDirectionalState(player, key);
        } else {
          this.updateActionHoldState(player, key);
        }
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

    syncDirectionalState(player, key) {
      const pointerActive = this.pointerStates[player][key]?.size > 0;
      const keyboardActive = this.keyboardHoldStates[player]?.[key] || false;
      const isActive = pointerActive || keyboardActive;
      const state = this.getPlayerInput(player);
      if (state) {
        state[key] = isActive;
      }
      const button = this.touchButtons[player]?.[key];
      if (button) {
        this.setButtonActive(button, pointerActive);
      }
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

    positionTouchButtons() {
      const p1 = this.touchButtons.p1;
      const p2 = this.touchButtons.p2;
      if (!p1.left || !p1.right || !p1.punch || !p1.kick || !p2.left || !p2.right || !p2.punch || !p2.kick) {
        return;
      }

      const { width, height } = this.scale.gameSize;
      const { size, gap, margin } = this.touchButtonLayout;
      const safe = this.safeAreaInsets || { top: 0, right: 0, bottom: 0, left: 0 };
      const step = size + gap;
      const baseY = height - safe.bottom - margin - size / 2;

      const leftBaseX = safe.left + margin + size / 2;
      p1.left.setPosition(leftBaseX, baseY);
      p1.right.setPosition(leftBaseX + step, baseY);
      p1.punch.setPosition(leftBaseX, baseY - step);
      p1.kick.setPosition(leftBaseX + step, baseY - step);

      const rightBaseX = width - safe.right - margin - size / 2;
      p2.right.setPosition(rightBaseX, baseY);
      p2.left.setPosition(rightBaseX - step, baseY);
      p2.kick.setPosition(rightBaseX, baseY - step);
      p2.punch.setPosition(rightBaseX - step, baseY - step);
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

      const setDirectionalKeyState = (player, key, isActive) => {
        const keyboardStates = this.keyboardHoldStates[player];
        if (!keyboardStates) {
          return;
        }
        keyboardStates[key] = isActive;
        this.syncDirectionalState(player, key);
        if (isActive) {
          this.detectKeyboard();
        }
      };

      const onP1LeftDown = () => setDirectionalKeyState('p1', 'left', true);
      const onP1LeftUp = () => setDirectionalKeyState('p1', 'left', false);
      const onP1RightDown = () => setDirectionalKeyState('p1', 'right', true);
      const onP1RightUp = () => setDirectionalKeyState('p1', 'right', false);

      const onP2LeftDown = () => setDirectionalKeyState('p2', 'left', true);
      const onP2LeftUp = () => setDirectionalKeyState('p2', 'left', false);
      const onP2RightDown = () => setDirectionalKeyState('p2', 'right', true);
      const onP2RightUp = () => setDirectionalKeyState('p2', 'right', false);

      const onP1PunchDown = () => this.handleKeyboardAction('p1', 'punch');
      const onP1KickDown = () => this.handleKeyboardAction('p1', 'kick');
      const onP2PunchDown = () => this.handleKeyboardAction('p2', 'punch');
      const onP2KickDown = () => this.handleKeyboardAction('p2', 'kick');

      const keyBindings = [
        ['keydown-A', onP1LeftDown],
        ['keyup-A', onP1LeftUp],
        ['keydown-D', onP1RightDown],
        ['keyup-D', onP1RightUp],
        ['keydown-LEFT', onP2LeftDown],
        ['keyup-LEFT', onP2LeftUp],
        ['keydown-RIGHT', onP2RightDown],
        ['keyup-RIGHT', onP2RightUp],
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
