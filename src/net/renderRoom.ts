import { CANVAS_H, CANVAS_W, STAGE_Y } from '../constants/room';
import type { PlayerMap, PlayerPresence } from './playersStore';

type RendererOptions = {
  canvas: HTMLCanvasElement;
  getPlayers: () => PlayerMap;
  selfUid: string;
};

type StopRenderer = () => void;

const STAGE_COLOR = '#fff';

export function startRenderer(options: RendererOptions): StopRenderer {
  const { canvas, getPlayers, selfUid } = options;
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Canvas 2D context is not available.');
  }
  const width = CANVAS_W;
  const height = CANVAS_H;
  if (canvas.width !== width) {
    canvas.width = width;
  }
  if (canvas.height !== height) {
    canvas.height = height;
  }
  let rafId: number | null = null;
  let lastLog = Number.NEGATIVE_INFINITY;

  const drawStick = (player: PlayerPresence | undefined) => {
    if (!player) {
      return;
    }
    const x = Math.round(player.x);
    const y = Math.round(player.y);
    context.save();
    context.translate(x, y);
    context.strokeStyle = player.color || '#37A9FF';
    context.lineWidth = player.uid === selfUid ? 3 : 2;

    context.beginPath();
    context.arc(0, -14, 6, 0, Math.PI * 2);
    context.stroke();

    context.beginPath();
    context.moveTo(0, -8);
    context.lineTo(0, 12);
    context.stroke();

    context.beginPath();
    if (player.dir === 'R') {
      context.moveTo(0, -2);
      context.lineTo(10, 6);
      context.moveTo(0, -2);
      context.lineTo(-8, 4);
    } else {
      context.moveTo(0, -2);
      context.lineTo(-10, 6);
      context.moveTo(0, -2);
      context.lineTo(8, 4);
    }
    context.stroke();

    context.beginPath();
    context.moveTo(0, 12);
    context.lineTo(8, 22);
    context.moveTo(0, 12);
    context.lineTo(-8, 22);
    context.stroke();

    if (player.name) {
      context.font = '10px system-ui';
      context.textAlign = 'center';
      context.fillStyle = '#fff';
      context.fillText(player.name, 0, -24);
    }

    if (player.uid === selfUid) {
      context.beginPath();
      context.arc(0, 0, 18, 0, Math.PI * 2);
      context.globalAlpha = 0.15;
      context.fillStyle = '#fff';
      context.fill();
      context.globalAlpha = 1;
    }

    context.restore();
  };

  const drawFrame = () => {
    context.clearRect(0, 0, width, height);
    context.fillStyle = '#000';
    context.fillRect(0, 0, width, height);
    context.strokeStyle = STAGE_COLOR;
    context.lineWidth = 2;
    context.strokeRect(1, 1, width - 2, height - 2);

    context.beginPath();
    context.moveTo(0, STAGE_Y);
    context.lineTo(width, STAGE_Y);
    context.stroke();

    const players = Array.from(getPlayers().values());
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    if (now - lastLog > 1000) {
      console.log('[render] players', players.map((player) => ({
        uid: player?.uid,
        x: player?.x,
        y: player?.y,
        dir: player?.dir,
      })));
      lastLog = now;
    }
    for (const player of players) {
      drawStick(player);
    }

    rafId = requestAnimationFrame(drawFrame);
  };

  rafId = requestAnimationFrame(drawFrame);

  return () => {
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
  };
}
