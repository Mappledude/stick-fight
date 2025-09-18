export type Direction = 'L' | 'R';

export type Player = {
  uid: string;
  name: string;
  color: string;
  x: number;
  y: number;
  dir: Direction;
};

export type PlayerMap = Map<string, Player>;
