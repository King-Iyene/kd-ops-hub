// Shared types for the virtual office world. Positions are in tiles (1 tile = 1 unit); x grows right, y grows down.

export type ItemType =
  | 'desk' | 'chair' | 'computer' | 'plant' | 'sofa' | 'table' | 'shelf' | 'rug' | 'whiteboard' | 'lamp' | 'coffee' | 'bin';

/** A piece of furniture. r is the rotation in quarter turns (a 2x1 desk rotated once becomes 1x2). */
export interface Item { id: string; t: ItemType; x: number; y: number; r?: 0 | 1 | 2 | 3 }

export interface ItemDef {
  /** size in tiles, before rotation */
  w: number;
  h: number;
  /** blocks walking */
  solid: boolean;
  label: string;
}

export type ZoneKind = 'meeting' | 'lounge' | 'area' | 'portal';

/** A named rectangle of the floor: a meeting room, the lounge, or a doorway into another space. */
export interface Zone {
  id: string;
  name: string;
  kind: ZoneKind;
  x: number;
  y: number;
  w: number;
  h: number;
  /** portals only: 'team' = this person's company office, 'mine' = the person's own office */
  target?: 'team' | 'mine';
}

export interface MapDef {
  w: number;
  h: number;
  /** walls[y][x] is true for a wall tile */
  walls: boolean[][];
  zones: Zone[];
  spawn: { x: number; y: number };
  /** the template's furniture; a saved layout can replace it */
  items: Item[];
  /** the rectangle furniture may be placed in (inside the walls) */
  buildArea: { x: number; y: number; w: number; h: number };
}

export interface AvatarStyle {
  skin: string;
  hair: string;
  shirt: string;
  hairStyle: 0 | 1 | 2 | 3;
}

export interface PlayerState {
  id: string;
  name: string;
  x: number;
  y: number;
  /** velocity in tiles per second (0 when standing) */
  vx: number;
  vy: number;
  /** facing: 0 down, 1 left, 2 right, 3 up */
  dir: 0 | 1 | 2 | 3;
  avatar: AvatarStyle;
  /** when this state was received, ms */
  at: number;
}
