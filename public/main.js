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

  class MainScene extends Phaser.Scene {
    constructor() {
      super({ key: 'MainScene' });
      this.dt = 0;
      this._centeredElements = [];
    }

    preload() {}

    create() {
      this.cameras.main.setBackgroundColor('#111');

      centerText(this, 'Stick-Fight', -28, { fontSize: '56px', fontStyle: '700' });
      centerText(this, 'Main Scene Ready', 28, { fontSize: '24px', color: '#bbbbbb' });

      this.scale.on('resize', this.handleResize, this);
      this.handleResize(this.scale.gameSize);
    }

    handleResize(gameSize) {
      const { width, height } = gameSize || this.scale.gameSize;
      const camera = this.cameras.main;
      camera.setViewport(0, 0, width, height);
      camera.centerOn(width / 2, height / 2);

      (this._centeredElements || []).forEach((updatePosition) => updatePosition());
    }

    update(time, delta) {
      this.dt = Math.min(delta, 50) / 1000;
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
