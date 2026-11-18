// Shared types for the virtual office world. Positions are in tiles (1 tile = 1 unit); x grows right, y grows down.

export type ItemType =
  | 'desk' | 'chair' | 'computer' | 'plant' | 'sofa' | 'table' | 'shelf' | 'rug' | 'whiteboard' | 'lamp' | 'coffee' | 'bin'
  | 'flowers' | 'tree' | 'grass' | 'papers' | 'mug' | 'tv' | 'printer' | 'cooler' | 'beanbag' | 'coffeetable'
  | 'laptop' | 'books' | 'plate' | 'globe' | 'trophy' | 'headphones' | 'pizza' | 'mat' | 'balloons' | 'cactus' | 'bamboo'
  | 'hedge' | 'fountain' | 'palm' | 'bench' | 'piano' | 'fireplace' | 'fishtank' | 'speaker' | 'stool' | 'roundtable'
  | 'frame' | 'vending' | 'dog' | 'cat';

/** A piece of furniture. r is the rotation in quarter turns (a 2x1 desk rotated once becomes 1x2). */
export interface Item { id: string; t: ItemType; x: number; y: number; r?: 0 | 1 | 2 | 3; /** paint colour: an index into ITEM_COLORS (none = the original look) */ c?: number }

export interface ItemDef {
  /** size in tiles, before rotation */
  w: number;
  h: number;
  /** blocks walking */
  solid: boolean;
  label: string;
}

export type ZoneKind = 'meeting' | 'lounge' | 'area' | 'portal' | 'office';

/** What the ground looks like: wood planks, grass, stone paving, grey carpet, lavender carpet. */
export type FloorKind = 'wood' | 'grass' | 'stone' | 'gray' | 'carpet';

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
  /** the ground inside this rectangle (the last zone listed wins where they overlap) */
  floor?: FloorKind;
  /** a name plate drawn on the wall above a private office */
  sign?: { name: string; avatar?: AvatarStyle };
}

export interface MapDef {
  w: number;
  h: number;
  /** 'hq' draws brick walls and no sky windows */
  style?: 'office' | 'hq';
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
  /** 0 short, 1 long, 2 bun, 3 none, 4 curly, 5 quiff */
  hairStyle: 0 | 1 | 2 | 3 | 4 | 5;
  /** 0 t-shirt, 1 hoodie, 2 blazer */
  outfit: 0 | 1 | 2;
  /** 0 none, 1 glasses, 2 headset, 3 cap */
  accessory: 0 | 1 | 2 | 3;
  pants: string;
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
