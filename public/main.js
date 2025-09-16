(function () {
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
      this.inputState = {
        left: false,
        right: false,
        punch: false,
        kick: false,
      };
      this._momentaryActions = new Set();
      this._touchButtonsByKey = {};
      this._touchButtonMetrics = {
        width: 96,
        height: 96,
        margin: 24,
        gap: 16,
      };
      this._pointerHoldStates = {
        left: new Set(),
        right: new Set(),
      };
      this._keyboardHoldStates = {
        left: false,
        right: false,
      };
      const nav = typeof navigator !== 'undefined' ? navigator : null;
      const hasTouchSupport =
        (nav && typeof nav.maxTouchPoints === 'number' && nav.maxTouchPoints > 0) ||
        (typeof window !== 'undefined' && 'ontouchstart' in window);
      this._keyboardDetected = !hasTouchSupport;
      this._fighters = [];
    }

    preload() {}

    create() {
      this.cameras.main.setBackgroundColor('#111');

      centerText(this, 'Stick-Fight', -28, { fontSize: '56px', fontStyle: '700' });
      centerText(this, 'Main Scene Ready', 28, { fontSize: '24px', color: '#bbbbbb' });

      this.registerTouchPrevention();
      this.createTouchControls();
      this.registerKeyboardControls();

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

      (this._centeredElements || []).forEach((updatePosition) => updatePosition());
      this.positionTouchButtons();

      if (this.physics && this.physics.world) {
        this.physics.world.setBounds(0, 0, width, height);
      }

      if (this._fighters) {
        this._fighters.forEach((fighter) => fighter.update());
      }
    }

    update(time, delta) {
      this.dt = Math.min(delta, 50) / 1000;
      this.clearMomentaryActions();

      this._fighters.forEach((fighter) => fighter.update(this.dt));
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

    registerTouchPrevention() {
      const canvas = this.sys.game.canvas;
      if (canvas) {
        canvas.style.touchAction = 'none';
        if (!canvas._preventScrollAttached) {
          canvas.addEventListener('touchstart', preventDefaultScroll, { passive: false });
          canvas.addEventListener('touchmove', preventDefaultScroll, { passive: false });
          canvas._preventScrollAttached = true;
        }
      }
    }

    createTouchControls() {
      if (this.input) {
        this.input.addPointer(2);
      }

      this._touchButtonsByKey.left = this.createTouchButton('◀', { fontSize: '42px' });
      this._touchButtonsByKey.right = this.createTouchButton('▶', { fontSize: '42px' });
      this._touchButtonsByKey.punch = this.createTouchButton('Punch', { fontSize: '26px' });
      this._touchButtonsByKey.kick = this.createTouchButton('Kick', { fontSize: '26px' });

      this.bindHoldButton(this._touchButtonsByKey.left, 'left');
      this.bindHoldButton(this._touchButtonsByKey.right, 'right');
      this.bindTapButton(this._touchButtonsByKey.punch, 'punch');
      this.bindTapButton(this._touchButtonsByKey.kick, 'kick');

      this.positionTouchButtons();
      this.updateTouchControlsVisibility();
    }

    createTouchButton(label, textStyleOverrides = {}) {
      const { width, height } = this._touchButtonMetrics;
      const container = this.add.container(0, 0);
      container.setSize(width, height);
      container.setScrollFactor(0);
      container.setDepth(1000);

      const background = this.add.rectangle(0, 0, width, height, 0x333333);
      background.setOrigin(0.5, 0.5);
      background.setAlpha(0.65);
      background.setStrokeStyle(2, 0xffffff, 0.25);

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

      container.setInteractive(
        new Phaser.Geom.Rectangle(-width / 2, -height / 2, width, height),
        Phaser.Geom.Rectangle.Contains
      );

      return container;
    }

    bindHoldButton(button, stateKey) {
      if (!button || !this._pointerHoldStates[stateKey]) {
        return;
      }

      const pointerSet = this._pointerHoldStates[stateKey];
      const handlePointerDown = (pointer) => {
        this.preventPointerDefault(pointer);
        pointerSet.add(pointer.id);
        this.updateDirectionalState(stateKey);
      };

      const releasePointer = (pointer) => {
        pointerSet.delete(pointer.id);
        this.updateDirectionalState(stateKey);
      };

      button.on('pointerdown', handlePointerDown);
      button.on('pointerup', releasePointer);
      button.on('pointerupoutside', releasePointer);
      button.on('pointerout', (pointer) => {
        if (!pointer.isDown) {
          releasePointer(pointer);
        }
      });
    }

    bindTapButton(button, stateKey) {
      if (!button) {
        return;
      }

      const handlePointerDown = (pointer) => {
        this.preventPointerDefault(pointer);
        this.triggerMomentary(stateKey);
        this.setButtonActive(button, true);
      };

      const clearHighlight = () => {
        this.setButtonActive(button, false);
      };

      button.on('pointerdown', handlePointerDown);
      button.on('pointerup', clearHighlight);
      button.on('pointerupoutside', clearHighlight);
      button.on('pointerout', (pointer) => {
        if (!pointer.isDown) {
          clearHighlight();
        }
      });
    }

    preventPointerDefault(pointer) {
      if (pointer && pointer.event && pointer.event.cancelable !== false) {
        pointer.event.preventDefault();
      }
    }

    positionTouchButtons() {
      const buttons = this._touchButtonsByKey;
      if (!buttons.left || !buttons.right || !buttons.punch || !buttons.kick) {
        return;
      }

      const { width, height } = this.scale.gameSize;
      const { width: buttonWidth, height: buttonHeight, margin, gap } = this._touchButtonMetrics;
      const baseY = height - margin - buttonHeight / 2;

      buttons.left.setPosition(margin + buttonWidth / 2, baseY);
      buttons.right.setPosition(margin + buttonWidth / 2 + buttonWidth + gap, baseY);

      const rightBaseX = width - margin - buttonWidth / 2;
      buttons.kick.setPosition(rightBaseX, baseY);
      buttons.punch.setPosition(rightBaseX - (buttonWidth + gap), baseY);
    }

    setButtonActive(button, isActive) {
      if (!button || !button.buttonBackground) {
        return;
      }
      const alpha = isActive ? 0.9 : button.baseAlpha || 0.65;
      button.buttonBackground.setAlpha(alpha);
    }

    triggerMomentary(stateKey) {
      this.inputState[stateKey] = true;
      this._momentaryActions.add(stateKey);
    }

    clearMomentaryActions() {
      if (!this._momentaryActions.size) {
        return;
      }
      this._momentaryActions.forEach((stateKey) => {
        this.inputState[stateKey] = false;
        const button = this._touchButtonsByKey[stateKey];
        if (button && (!this._pointerHoldStates[stateKey] || this._pointerHoldStates[stateKey].size === 0)) {
          this.setButtonActive(button, false);
        }
      });
      this._momentaryActions.clear();
    }

    updateDirectionalState(stateKey) {
      const pointerActive = this._pointerHoldStates[stateKey] && this._pointerHoldStates[stateKey].size > 0;
      const keyboardActive = this._keyboardHoldStates[stateKey] || false;
      const isActive = pointerActive || keyboardActive;
      this.inputState[stateKey] = isActive;
      this.setButtonActive(this._touchButtonsByKey[stateKey], pointerActive);
    }

    registerKeyboardControls() {
      if (!this.input || !this.input.keyboard) {
        return;
      }

      const keyboard = this.input.keyboard;

      const onLeftDown = () => {
        this._keyboardHoldStates.left = true;
        this.updateDirectionalState('left');
        this.detectKeyboard();
      };
      const onLeftUp = () => {
        this._keyboardHoldStates.left = false;
        this.updateDirectionalState('left');
      };
      const onRightDown = () => {
        this._keyboardHoldStates.right = true;
        this.updateDirectionalState('right');
        this.detectKeyboard();
      };
      const onRightUp = () => {
        this._keyboardHoldStates.right = false;
        this.updateDirectionalState('right');
      };
      const onPunchDown = () => {
        this.triggerMomentary('punch');
        this.detectKeyboard();
      };
      const onKickDown = () => {
        this.triggerMomentary('kick');
        this.detectKeyboard();
      };
      const onAnyKeyDown = () => {
        this.detectKeyboard();
      };

      keyboard.on('keydown-A', onLeftDown);
      keyboard.on('keyup-A', onLeftUp);
      keyboard.on('keydown-D', onRightDown);
      keyboard.on('keyup-D', onRightUp);
      keyboard.on('keydown-J', onPunchDown);
      keyboard.on('keydown-K', onKickDown);
      keyboard.on('keydown', onAnyKeyDown);

      this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
        keyboard.off('keydown-A', onLeftDown);
        keyboard.off('keyup-A', onLeftUp);
        keyboard.off('keydown-D', onRightDown);
        keyboard.off('keyup-D', onRightUp);
        keyboard.off('keydown-J', onPunchDown);
        keyboard.off('keydown-K', onKickDown);
        keyboard.off('keydown', onAnyKeyDown);
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
      Object.values(this._touchButtonsByKey).forEach((button) => {
        if (button) {
          if (!visible) {
            this.setButtonActive(button, false);
          }
          button.setVisible(visible);
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
