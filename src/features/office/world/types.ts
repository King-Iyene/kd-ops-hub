// Shared types for the virtual office world. Positions are in tiles (1 tile = 1 unit); x grows right, y grows down.

export type ItemType =
  | 'desk' | 'chair' | 'computer' | 'plant' | 'sofa' | 'table' | 'shelf' | 'rug' | 'whiteboard' | 'lamp' | 'coffee' | 'bin'
  | 'flowers' | 'tree' | 'grass' | 'papers' | 'mug' | 'tv' | 'printer' | 'cooler' | 'beanbag' | 'coffeetable'
  | 'laptop' | 'books' | 'plate' | 'globe' | 'trophy' | 'headphones' | 'pizza' | 'mat' | 'balloons' | 'cactus' | 'bamboo'
  | 'hedge' | 'fountain' | 'palm' | 'bench' | 'piano' | 'fireplace' | 'fishtank' | 'speaker' | 'stool' | 'roundtable'
  | 'frame' | 'vending' | 'dog' | 'cat' | 'wallclock' | 'valueswall' | 'missionwall' | 'noticeboard' | 'bike' | 'kart'
  | 'pond' | 'waterfall' | 'sea' | 'sand' | 'flowerbed' | 'rocks' | 'birdbath'
  | 'beachchair' | 'umbrella' | 'towel' | 'sandcastle' | 'dock' | 'boat' | 'dogball'
  | 'pinetree' | 'campfire' | 'log' | 'stump' | 'tent' | 'mushrooms' | 'firewood' | 'lantern' | 'coffeebar'
  | 'gamingchair' | 'diningchair' | 'barstool' | 'executivechair' | 'rockingchair'
  | 'longtable' | 'worktable' | 'sidetable' | 'conference' | 'bed' | 'singlebed' | 'nightstand' | 'wardrobe' | 'dresser' | 'mirror' | 'clothesrack' | 'mannequin' | 'shoerack' | 'armchair' | 'loveseat' | 'ottoman'
  | 'standingdesk' | 'execdesk' | 'cornerdesk' | 'dualmonitor' | 'ultrawide' | 'barchart' | 'orgchart' | 'worldmap' | 'kanban' | 'sunflowers' | 'orchid' | 'lavender' | 'tulips' | 'monstera' | 'filecabinet' | 'foosball' | 'tabletennis' | 'phonebooth' | 'arcade' | 'gong' | 'gametable' | 'pollboard' | 'eventboard' | 'podium' | 'mailbox';

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
export type FloorKind = 'wood' | 'grass' | 'stone' | 'gray' | 'carpet' | 'scifi';

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
  /** an open-plan area that can be claimed like an office, but is not a private room (voice is not walled in) */
  open?: boolean;
  /** one desk seat: claimable, private (voice stays inside it) and lockable, like a tiny office */
  seat?: boolean;
}

/** Changes an admin painted onto the building: tiles made wall or open, and floors painted. */
export interface TileEdits { wallsOn: number[]; wallsOff: number[]; floors: Record<string, string> }

export interface MapDef {
  w: number;
  h: number;
  /** floors painted over the zones' floors, by 'x,y' */
  floorOverrides?: Record<string, string>;
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
  /** 0 short, 1 long, 2 bun, 3 none, 4 curly, 5 quiff, 6 braids, 7 afro, 8 bob, 9 mohawk, 10 locs */
  hairStyle: number;
  /** 0 t-shirt, 1 hoodie, 2 blazer, 3 dress, 4 blouse and skirt, 5 kaftan, 6 ankara print top */
  outfit: number;
  /** 0 none, 1 glasses, 2 headset, 3 cap, 4 sunglasses, 5 beanie, 6 head wrap, 7 earrings, 8 bow tie */
  accessory: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
  /** 0 none, 1 stubble, 2 moustache, 3 full beard */
  beard: number;
  pants: string;
  // layers of clothing and accessories, each with its own colour (older saved avatars get these filled in)
  /** 0 none, 1 blazer, 2 denim jacket, 3 bomber, 4 waistcoat */
  jacket: 0 | 1 | 2 | 3 | 4;
  jacketColor: string;
  /** the shirt worn underneath, seen at the collar of a jacket or behind a tie */
  inner: string;
  /** 0 none, 1 necktie, 2 bow tie, 3 scarf */
  tie: 0 | 1 | 2 | 3;
  tieColor: string;
  /** 0 sneakers, 1 formal shoes, 2 boots, 3 sandals */
  shoes: number;
  shoeColor: string;
  /** 0 none, 1 cap, 2 beanie, 3 head wrap, 4 beret */
  hat: number;
  hatColor: string;
  /** 0 none, 1 glasses, 2 sunglasses */
  glasses: number;
  /** 0 none, 1 headset, 2 earrings */
  extra: number;
  /** 0 trousers, 1 shorts, 2 capri, 3 leggings */
  bottom: number;
  /** a full character costume: 0 none, then robot, zombie, ghost, pirate, rat, alien, clown, skeleton, cat, dog, bear, astronaut, ninja, wizard, knight, superhero, devil, angel, pumpkin, banana, duck */
  costume: number;
  /** 0 none, 1 walking stick, 2 crutches (and a leg in a cast), 3 wheelchair (and a leg in a cast); older avatars do not have it */
  aid?: number;
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
