import { CANVAS_W, ROOM_PAD, STAGE_Y } from '../constants/room';
import type { Direction, Player } from './PlayerTypes';

type SpawnPoint = Pick<Player, 'x' | 'y' | 'dir'>;

const DEFAULT_DIRECTION: Direction = 'R';

export function spawnOnStage(): SpawnPoint {
  const minX = ROOM_PAD;
  const maxX = CANVAS_W - ROOM_PAD;
  const x = Math.round(minX + Math.random() * Math.max(0, maxX - minX));

  return {
    x,
    y: STAGE_Y,
    dir: DEFAULT_DIRECTION,
  };
}
