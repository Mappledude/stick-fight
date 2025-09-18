import { CANVAS_H, CANVAS_W, STAGE_Y } from '../constants/room';
import type { Player, PlayerMap } from './PlayerTypes';

type RendererOptions = {
  canvas: HTMLCanvasElement;
  getPlayers: () => PlayerMap;
  selfUid?: string | null;
};

type StopRenderer = () => void;

const BACKGROUND_COLOR = '#000000';
const BORDER_COLOR = '#ffffff';
const MIDLINE_COLOR = '#ff2a2a';
const NAME_FILL = '#ffffff';

const HEAD_RADIUS = 10;
const BODY_HEIGHT = 32;
const ARM_LENGTH = 18;
const LEG_LENGTH = 18;

function ensureCanvasSize(canvas: HTMLCanvasElement): void {
  if (canvas.width !== CANVAS_W) {
    canvas.width = CANVAS_W;
  }
  if (canvas.height !== CANVAS_H) {
    canvas.height = CANVAS_H;
  }
}

function drawStickFigure(
  context: CanvasRenderingContext2D,
  player: Player,
  isSelf: boolean,
): void {
  context.save();
  context.translate(Math.round(player.x), Math.round(player.y));
  context.lineWidth = isSelf ? 4 : 2;
  context.strokeStyle = player.color || '#ffffff';
  context.lineCap = 'round';
  context.lineJoin = 'round';

  // Body
  context.beginPath();
  context.moveTo(0, -BODY_HEIGHT);
  context.lineTo(0, 0);
  context.stroke();

  // Head
  context.beginPath();
  context.arc(0, -BODY_HEIGHT - HEAD_RADIUS, HEAD_RADIUS, 0, Math.PI * 2);
  context.stroke();

  // Arms
  context.beginPath();
  if (player.dir === 'L') {
    context.moveTo(0, -BODY_HEIGHT + HEAD_RADIUS);
    context.lineTo(-ARM_LENGTH, -BODY_HEIGHT + HEAD_RADIUS + 6);
    context.moveTo(0, -BODY_HEIGHT + HEAD_RADIUS);
    context.lineTo(ARM_LENGTH * 0.4, -BODY_HEIGHT + HEAD_RADIUS + 4);
  } else {
    context.moveTo(0, -BODY_HEIGHT + HEAD_RADIUS);
    context.lineTo(ARM_LENGTH, -BODY_HEIGHT + HEAD_RADIUS + 6);
    context.moveTo(0, -BODY_HEIGHT + HEAD_RADIUS);
    context.lineTo(-ARM_LENGTH * 0.4, -BODY_HEIGHT + HEAD_RADIUS + 4);
  }
  context.stroke();

  // Legs
  context.beginPath();
  context.moveTo(0, 0);
  context.lineTo(-LEG_LENGTH, LEG_LENGTH);
  context.moveTo(0, 0);
  context.lineTo(LEG_LENGTH, LEG_LENGTH);
  context.stroke();

  if (player.name) {
    context.font = '12px system-ui, sans-serif';
    context.textAlign = 'center';
    context.fillStyle = NAME_FILL;
    context.fillText(player.name, 0, -BODY_HEIGHT - HEAD_RADIUS - 10);
  }

  if (isSelf) {
    context.globalAlpha = 0.2;
    context.beginPath();
    context.arc(0, 0, LEG_LENGTH + 6, 0, Math.PI * 2);
    context.fillStyle = player.color || '#ffffff';
    context.fill();
    context.globalAlpha = 1;
  }

  context.restore();
}

function drawStage(context: CanvasRenderingContext2D): void {
  context.fillStyle = BACKGROUND_COLOR;
  context.fillRect(0, 0, CANVAS_W, CANVAS_H);

  context.strokeStyle = BORDER_COLOR;
  context.lineWidth = 2;
  context.strokeRect(1, 1, CANVAS_W - 2, CANVAS_H - 2);

  context.strokeStyle = MIDLINE_COLOR;
  context.lineWidth = 2;
  context.beginPath();
  context.moveTo(0, STAGE_Y);
  context.lineTo(CANVAS_W, STAGE_Y);
  context.stroke();
}

export function startRenderer(options: RendererOptions): StopRenderer {
  const { canvas, getPlayers, selfUid = null } = options;
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Canvas 2D context is not available.');
  }

  ensureCanvasSize(canvas);

  let rafId: number | null = null;

  const renderFrame = () => {
    drawStage(context);

    const players = getPlayers();
    for (const player of players.values()) {
      drawStickFigure(context, player, player.uid === selfUid);
    }

    rafId = window.requestAnimationFrame(renderFrame);
  };

  rafId = window.requestAnimationFrame(renderFrame);

  return () => {
    if (rafId !== null) {
      window.cancelAnimationFrame(rafId);
      rafId = null;
    }
  };
}
