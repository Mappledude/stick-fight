(function () {
  const preventDefaultScroll = (event) => {
    if (event.touches && event.touches.length > 1) {
      return;
    }
    event.preventDefault();
  };

  document.body.addEventListener('touchmove', preventDefaultScroll, { passive: false });

  class ShellScene extends Phaser.Scene {
    constructor() {
      super({ key: 'ShellScene' });
      this.centerText = null;
    }

    preload() {}

    create() {
      this.cameras.main.setBackgroundColor('#000000');
      this.centerText = this.add.text(0, 0, 'Stick-Fight (Shell)', {
        fontFamily: 'Arial, sans-serif',
        fontSize: '48px',
        color: '#ffffff',
      }).setOrigin(0.5, 0.5);

      this.scale.on('resize', this.handleResize, this);
      const { width, height } = this.scale.gameSize;
      this.handleResize({ width, height });
    }

    handleResize(gameSize) {
      const { width, height } = gameSize;
      const camera = this.cameras.main;
      camera.setViewport(0, 0, width, height);
      this.centerText.setPosition(width / 2, height / 2);
    }

    update() {}
  }

  const config = {
    type: Phaser.AUTO,
    parent: 'game-root',
    backgroundColor: '#000000',
    scale: {
      mode: Phaser.Scale.RESIZE,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    scene: ShellScene,
  };

  window.addEventListener('load', () => {
    const game = new Phaser.Game(config);

    window.addEventListener('resize', () => {
      game.scale.resize(window.innerWidth, window.innerHeight);
    });
  });
})();
