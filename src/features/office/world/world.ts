// Pure world logic: furniture catalogue, collision, walking, dead reckoning, rooms, and placement rules.
// No React, no canvas, no network, so it is unit tested.
import type { Item, ItemDef, ItemType, MapDef, TileEdits, Zone } from './types';

export const ITEM_DEFS: Record<ItemType, ItemDef> = {
  desk: { w: 2, h: 1, solid: true, label: 'Desk' },
  chair: { w: 1, h: 1, solid: true, label: 'Chair' },
  computer: { w: 1, h: 1, solid: false, label: 'Computer' },
  plant: { w: 1, h: 1, solid: true, label: 'Plant' },
  sofa: { w: 3, h: 1, solid: true, label: 'Sofa' },
  table: { w: 3, h: 2, solid: true, label: 'Table' },
  shelf: { w: 2, h: 1, solid: true, label: 'Shelf' },
  rug: { w: 3, h: 2, solid: false, label: 'Rug' },
  whiteboard: { w: 2, h: 1, solid: true, label: 'Whiteboard' },
  lamp: { w: 1, h: 1, solid: false, label: 'Lamp' },
  coffee: { w: 1, h: 1, solid: true, label: 'Coffee machine' },
  bin: { w: 1, h: 1, solid: false, label: 'Bin' },
  flowers: { w: 1, h: 1, solid: true, label: 'Flowers' },
  tree: { w: 1, h: 2, solid: true, label: 'Tree' },
  grass: { w: 3, h: 2, solid: false, label: 'Grass' },
  papers: { w: 1, h: 1, solid: false, label: 'Papers' },
  mug: { w: 1, h: 1, solid: false, label: 'Coffee cup' },
  tv: { w: 2, h: 1, solid: true, label: 'Screen' },
  printer: { w: 1, h: 1, solid: true, label: 'Printer' },
  cooler: { w: 1, h: 1, solid: true, label: 'Water cooler' },
  beanbag: { w: 1, h: 1, solid: true, label: 'Beanbag' },
  coffeetable: { w: 2, h: 1, solid: true, label: 'Coffee table' },
  laptop: { w: 1, h: 1, solid: false, label: 'Laptop' },
  books: { w: 1, h: 1, solid: false, label: 'Books' },
  plate: { w: 1, h: 1, solid: false, label: 'Plate of food' },
  globe: { w: 1, h: 1, solid: false, label: 'Globe' },
  trophy: { w: 1, h: 1, solid: false, label: 'Trophy' },
  headphones: { w: 1, h: 1, solid: false, label: 'Headphones' },
  pizza: { w: 1, h: 1, solid: false, label: 'Pizza box' },
  mat: { w: 2, h: 1, solid: false, label: 'Mat' },
  balloons: { w: 1, h: 1, solid: false, label: 'Balloons' },
  cactus: { w: 1, h: 1, solid: true, label: 'Cactus' },
  bamboo: { w: 1, h: 2, solid: true, label: 'Bamboo' },
  hedge: { w: 2, h: 1, solid: true, label: 'Hedge' },
  fountain: { w: 3, h: 3, solid: true, label: 'Fountain' },
  pond: { w: 10, h: 6, solid: true, label: 'Pond' },
  waterfall: { w: 5, h: 4, solid: true, label: 'Waterfall' },
  sea: { w: 16, h: 5, solid: true, label: 'Sea' },
  sand: { w: 14, h: 4, solid: false, label: 'Beach sand' },
  beachchair: { w: 2, h: 1, solid: true, label: 'Beach lounger' },
  umbrella: { w: 2, h: 2, solid: true, label: 'Beach umbrella' },
  towel: { w: 2, h: 1, solid: false, label: 'Beach towel' },
  sandcastle: { w: 1, h: 1, solid: true, label: 'Sandcastle' },
  dock: { w: 2, h: 5, solid: false, label: 'Wooden jetty' },
  boat: { w: 3, h: 2, solid: false, label: 'Rowing boat' },
  dogball: { w: 2, h: 2, solid: false, label: 'Dog playing fetch' },
  pinetree: { w: 2, h: 3, solid: true, label: 'Pine tree' },
  campfire: { w: 2, h: 2, solid: true, label: 'Campfire' },
  log: { w: 2, h: 1, solid: true, label: 'Log seat' },
  stump: { w: 1, h: 1, solid: true, label: 'Tree stump' },
  tent: { w: 3, h: 2, solid: true, label: 'Camping tent' },
  mushrooms: { w: 1, h: 1, solid: false, label: 'Mushrooms' },
  firewood: { w: 1, h: 1, solid: true, label: 'Firewood' },
  lantern: { w: 1, h: 1, solid: false, label: 'Camp lantern' },
  coffeebar: { w: 4, h: 1, solid: true, label: 'Coffee and snack bar' },
  standingdesk: { w: 2, h: 1, solid: true, label: 'Standing desk' },
  execdesk: { w: 3, h: 2, solid: true, label: 'Executive desk' },
  cornerdesk: { w: 2, h: 2, solid: true, label: 'Corner desk' },
  dualmonitor: { w: 1, h: 1, solid: false, label: 'Two monitors' },
  ultrawide: { w: 1, h: 1, solid: false, label: 'Ultrawide monitor' },
  barchart: { w: 2, h: 1, solid: true, label: 'Sales chart' },
  orgchart: { w: 3, h: 1, solid: true, label: 'Team chart' },
  worldmap: { w: 3, h: 1, solid: true, label: 'World map' },
  kanban: { w: 3, h: 1, solid: true, label: 'Task board' },
  sunflowers: { w: 1, h: 1, solid: true, label: 'Sunflowers' },
  orchid: { w: 1, h: 1, solid: true, label: 'Orchid' },
  lavender: { w: 1, h: 1, solid: true, label: 'Lavender' },
  tulips: { w: 1, h: 1, solid: true, label: 'Tulips' },
  monstera: { w: 1, h: 1, solid: true, label: 'Monstera plant' },
  filecabinet: { w: 1, h: 1, solid: true, label: 'Filing cabinet' },
  foosball: { w: 2, h: 1, solid: true, label: 'Table football' },
  tabletennis: { w: 3, h: 2, solid: true, label: 'Table tennis' },
  phonebooth: { w: 1, h: 2, solid: true, label: 'Quiet phone booth' },
  arcade: { w: 1, h: 1, solid: true, label: 'Arcade machine' },
  gong: { w: 1, h: 1, solid: true, label: 'Gong' },
  gametable: { w: 2, h: 2, solid: true, label: 'Game table' },
  pollboard: { w: 2, h: 1, solid: true, label: 'Poll board' },
  eventboard: { w: 3, h: 1, solid: true, label: 'Events board' },
  podium: { w: 1, h: 1, solid: true, label: 'Podium and microphone' },
  flowerbed: { w: 3, h: 1, solid: true, label: 'Flower bed' },
  rocks: { w: 1, h: 1, solid: true, label: 'Rocks' },
  birdbath: { w: 1, h: 1, solid: true, label: 'Bird bath' },
  palm: { w: 1, h: 2, solid: true, label: 'Palm tree' },
  bench: { w: 2, h: 1, solid: true, label: 'Bench' },
  piano: { w: 2, h: 2, solid: true, label: 'Piano' },
  fireplace: { w: 2, h: 1, solid: true, label: 'Fireplace' },
  fishtank: { w: 2, h: 1, solid: true, label: 'Fish tank' },
  speaker: { w: 1, h: 1, solid: true, label: 'Speaker' },
  stool: { w: 1, h: 1, solid: true, label: 'Stool' },
  roundtable: { w: 2, h: 2, solid: true, label: 'Round table' },
  frame: { w: 1, h: 1, solid: true, label: 'Picture' },
  vending: { w: 1, h: 2, solid: true, label: 'Vending machine' },
  dog: { w: 1, h: 1, solid: false, label: 'Dog' },
  wallclock: { w: 4, h: 1, solid: true, label: 'Wall clock' },
  valueswall: { w: 4, h: 1, solid: true, label: 'Core values wall' },
  noticeboard: { w: 3, h: 1, solid: true, label: 'Notice board' },
  bike: { w: 1, h: 1, solid: false, label: 'Hoverboard' },
  kart: { w: 1, h: 1, solid: false, label: 'Hoverboard' },
  cat: { w: 1, h: 1, solid: false, label: 'Cat' },
};

/** Small things that sit on top of a desk or table (one of each kind per tile). */
export const TOP_ITEMS: ItemType[] = ['computer', 'papers', 'mug', 'laptop', 'books', 'plate', 'globe', 'trophy', 'headphones', 'pizza', 'dualmonitor', 'ultrawide'];

export const PLAYER_RADIUS = 0.3;
export const WALK_SPEED = 5.8; // tiles per second

/** Size of an item in tiles after rotation. */
export function itemSize(item: Pick<Item, 't' | 'r'>): { w: number; h: number } {
  const d = ITEM_DEFS[item.t];
  return (item.r ?? 0) % 2 === 1 ? { w: d.h, h: d.w } : { w: d.w, h: d.h };
}

/** Things you can walk up to and press F on. */
export const INTERACTIVE: Partial<Record<ItemType, string>> = {
  wallclock: 'Clocks',
  valueswall: 'Core values',
  noticeboard: 'Notice board',
  bike: 'Ride the hoverboard',
  kart: 'Ride the hoverboard',
  gong: 'Ring the gong',
  arcade: 'Play a game',
  pollboard: 'Open the polls',
  eventboard: 'See what is on',
  podium: 'Speak to the office',
  foosball: 'Play table football',
  tabletennis: 'Play table tennis',
  kanban: 'Open the task board',
  gametable: 'Play a game',
  chair: 'Sit down',
  stool: 'Sit down',
  beanbag: 'Sit down',
  sofa: 'Sit down',
  bench: 'Sit down',
  beachchair: 'Lie back',
  log: 'Sit on the log',
  stump: 'Sit down',
};

/** Furniture you can sit on (one person to a seat). */
export const SEAT_TYPES: ItemType[] = ['chair', 'stool', 'beanbag', 'sofa', 'bench', 'beachchair', 'log', 'stump'];

/** The seat under a point (the tile of a chair, sofa, bench... that covers it), if any. */
export function seatAt(items: Item[], x: number, y: number): { item: Item; x: number; y: number } | null {
  const cx = Math.floor(x), cy = Math.floor(y);
  for (const it of items) {
    if (!SEAT_TYPES.includes(it.t)) continue;
    const { w, h } = itemSize(it);
    if (cx >= it.x && cy >= it.y && cx < it.x + w && cy < it.y + h) return { item: it, x: cx + 0.5, y: cy + 0.5 };
  }
  return null;
}

/** How much faster a power bike is than walking. */
export const RIDE_SPEED = 1.9;

/** The interactive thing closest to a point, if one is within reach. */
export function nearestInteractive(items: Item[], x: number, y: number, reach = 1.25): Item | null {
  // games, boards, the podium and the gong come first, then a bike or kart, and a seat only when nothing else is within reach.
  // (A kart somebody parked beside a game must not stop you opening the game: it wins only when you are practically on top of it.)
  let best: Item | null = null;
  let bd = Infinity;
  let veh: Item | null = null;
  let vd = Infinity;
  let seat: Item | null = null;
  let sd = Infinity;
  for (const it of items) {
    if (!INTERACTIVE[it.t]) continue;
    const { w, h } = itemSize(it);
    const dx = Math.max(it.x - x, 0, x - (it.x + w));
    const dy = Math.max(it.y - y, 0, y - (it.y + h));
    const d = Math.hypot(dx, dy);
    const isSeat = SEAT_TYPES.includes(it.t);
    const isVehicle = it.t === 'bike' || it.t === 'kart';
    const r = isVehicle ? Math.min(reach, 1.05) : isSeat ? Math.min(reach, 0.8) : reach;
    if (d > r) continue;
    if (isSeat) { if (d < sd) { seat = it; sd = d; } }
    else if (isVehicle) { if (d < vd) { veh = it; vd = d; } }
    else if (d < bd) { best = it; bd = d; }
  }
  if (best && veh) return vd < 0.5 && vd < bd - 0.2 ? veh : best;
  // seats never get the F prompt: you sit by clicking one
  void seat; void sd;
  return best ?? veh;
}

/** Every tile an item covers. */
export function itemCells(item: Item): { x: number; y: number }[] {
  const { w, h } = itemSize(item);
  const out: { x: number; y: number }[] = [];
  for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) out.push({ x: item.x + dx, y: item.y + dy });
  return out;
}

/** The grid people collide with: walls, plus the tiles under solid furniture. */
export function buildSolid(map: MapDef, items: Item[]): boolean[][] {
  const solid = map.walls.map((row) => row.slice());
  for (const it of items) {
    if (!ITEM_DEFS[it.t].solid) continue;
    for (const c of itemCells(it)) if (solid[c.y] && c.x >= 0 && c.x < map.w) solid[c.y][c.x] = true;
  }
  return solid;
}

function blocked(solid: boolean[][], x: number, y: number): boolean {
  const cx = Math.floor(x);
  const cy = Math.floor(y);
  if (cy < 0 || cy >= solid.length || cx < 0 || cx >= solid[0].length) return true;
  return solid[cy][cx];
}

/** True if a person standing with centre (x, y) would overlap a blocked tile. */
export function collides(solid: boolean[][], x: number, y: number, r = PLAYER_RADIUS): boolean {
  return blocked(solid, x - r, y - r) || blocked(solid, x + r, y - r) || blocked(solid, x - r, y + r) || blocked(solid, x + r, y + r);
}

/** Move a person by (vx, vy) tiles per second for dt seconds, sliding along walls (each axis separately). */
export function advance(solid: boolean[][], x: number, y: number, vx: number, vy: number, dt: number): { x: number; y: number } {
  let nx = x;
  let ny = y;
  const tx = x + vx * dt;
  if (!collides(solid, tx, ny)) nx = tx;
  const ty = y + vy * dt;
  if (!collides(solid, nx, ty)) ny = ty;
  // caught on the corner of a wall or a piece of furniture while walking straight at it: ease round the corner instead of stopping dead
  if (nx === x && ny === y) {
    if (vx !== 0 && vy === 0) {
      for (const k of [0.15, 0.3, 0.45]) for (const sgn of [1, -1]) {
        if (!collides(solid, tx, y + sgn * k) && !collides(solid, x, y + sgn * k)) return { x, y: y + sgn * Math.min(k, Math.abs(vx) * dt * 0.9) };
      }
    } else if (vy !== 0 && vx === 0) {
      for (const k of [0.15, 0.3, 0.45]) for (const sgn of [1, -1]) {
        if (!collides(solid, x + sgn * k, ty) && !collides(solid, x + sgn * k, y)) return { x: x + sgn * Math.min(k, Math.abs(vy) * dt * 0.9), y };
      }
    }
  }
  return { x: nx, y: ny };
}

/** Velocity from held directions (left, right, up, down). Diagonals are not faster. */
export function inputVelocity(left: boolean, right: boolean, up: boolean, down: boolean): { vx: number; vy: number } {
  let vx = (right ? 1 : 0) - (left ? 1 : 0);
  let vy = (down ? 1 : 0) - (up ? 1 : 0);
  if (vx !== 0 && vy !== 0) {
    const k = Math.SQRT1_2;
    vx *= k;
    vy *= k;
  }
  return { vx: vx * WALK_SPEED, vy: vy * WALK_SPEED };
}

/** Facing from a velocity (keeps the old facing when standing still). */
export function facing(vx: number, vy: number, prev: 0 | 1 | 2 | 3): 0 | 1 | 2 | 3 {
  if (vx === 0 && vy === 0) return prev;
  if (Math.abs(vx) > Math.abs(vy)) return vx < 0 ? 1 : 2;
  return vy < 0 ? 3 : 0;
}

/**
 * Where someone else probably is now, from their last message. Used between updates so movement looks smooth
 * even though only direction changes are sent. Never walks through walls, and gives up after a few seconds
 * (a person who stopped sending is treated as standing still).
 */
export function extrapolate(
  solid: boolean[][],
  last: { x: number; y: number; vx: number; vy: number; at: number },
  now: number,
  maxSeconds = 3,
): { x: number; y: number } {
  const dt = Math.max(0, Math.min(maxSeconds, (now - last.at) / 1000));
  if ((last.vx === 0 && last.vy === 0) || dt === 0) return { x: last.x, y: last.y };
  // step in small slices so walls stop the walk the same way they do locally
  let x = last.x;
  let y = last.y;
  const slices = Math.max(1, Math.ceil(dt / (1 / 30)));
  const h = dt / slices;
  for (let i = 0; i < slices; i++) ({ x, y } = advance(solid, x, y, last.vx, last.vy, h));
  return { x, y };
}

/** The most specific zone at a position (meeting rooms and portals beat the general area). */
export function zoneAt(map: MapDef, x: number, y: number): Zone | null {
  const cx = Math.floor(x);
  const cy = Math.floor(y);
  const hits = map.zones.filter((z) => cx >= z.x && cx < z.x + z.w && cy >= z.y && cy < z.y + z.h);
  if (hits.length === 0) return null;
  const rank: Record<Zone['kind'], number> = { portal: 0, meeting: 1, office: 1, lounge: 2, area: 3 };
  return hits.sort((a, b) => rank[a.kind] - rank[b.kind])[0];
}

/** The map with an admin's painted walls and floors applied (tile index is y * width + x). */
export function applyTileEdits(map: MapDef, e: TileEdits | undefined): MapDef {
  if (!e || (!e.wallsOn?.length && !e.wallsOff?.length && !Object.keys(e.floors ?? {}).length)) return map;
  const walls = map.walls.map((r) => r.slice());
  const set = (i: number, v: boolean) => {
    if (!Number.isInteger(i) || i < 0 || i >= map.w * map.h) return;
    walls[Math.floor(i / map.w)][i % map.w] = v;
  };
  for (const i of e.wallsOn ?? []) set(i, true);
  for (const i of e.wallsOff ?? []) set(i, false);
  return { ...map, walls, floorOverrides: e.floors ?? {} };
}

/** A private room: a meeting room or someone's office (voice stays inside, it can be locked). */
export function isRoom(z: Zone | null | undefined): boolean {
  return !!z && (z.kind === 'meeting' || z.kind === 'office') && !z.open;
}

/** Tiles reachable on foot, as a flat grid (index y * width + x), 4-directional. Fast: used by every placement check. */
function reachGrid(solid: boolean[][], sx: number, sy: number): { seen: Uint8Array; w: number; h: number } {
  const h = solid.length;
  const w = solid[0]?.length ?? 0;
  const seen = new Uint8Array(w * h);
  const stack: number[] = [];
  const x0 = Math.floor(sx), y0 = Math.floor(sy);
  if (x0 >= 0 && y0 >= 0 && x0 < w && y0 < h && !solid[y0][x0]) { seen[y0 * w + x0] = 1; stack.push(y0 * w + x0); }
  while (stack.length) {
    const c = stack.pop()!;
    const x = c % w, y = (c - x) / w;
    if (x + 1 < w && !seen[c + 1] && !solid[y][x + 1]) { seen[c + 1] = 1; stack.push(c + 1); }
    if (x > 0 && !seen[c - 1] && !solid[y][x - 1]) { seen[c - 1] = 1; stack.push(c - 1); }
    if (y + 1 < h && !seen[c + w] && !solid[y + 1][x]) { seen[c + w] = 1; stack.push(c + w); }
    if (y > 0 && !seen[c - w] && !solid[y - 1][x]) { seen[c - w] = 1; stack.push(c - w); }
  }
  return { seen, w, h };
}

/** Tiles reachable on foot from a start tile (4-directional, one tile wide is enough to pass), as "x,y" keys. */
export function reachable(solid: boolean[][], sx: number, sy: number): Set<string> {
  const { seen, w, h } = reachGrid(solid, sx, sy);
  const out = new Set<string>();
  for (let i = 0; i < w * h; i++) if (seen[i]) out.add((i % w) + ',' + Math.floor(i / w));
  return out;
}

/**
 * A walking route from (sx, sy) to (tx, ty) as waypoints at tile centres (the start tile is left out), going around
 * walls and furniture. If the target tile is blocked the route ends next to it. Null when there is no way there.
 */
export function findPath(solid: boolean[][], sx: number, sy: number, tx: number, ty: number): { x: number; y: number }[] | null {
  const h = solid.length;
  const w = solid[0]?.length ?? 0;
  const s = { x: Math.floor(sx), y: Math.floor(sy) };
  const t = { x: Math.floor(tx), y: Math.floor(ty) };
  const open = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && !solid[y][x];
  if (!open(s.x, s.y)) return null;
  const prev = new Map<number, number>();
  const id = (x: number, y: number) => y * w + x;
  prev.set(id(s.x, s.y), -1);
  const q: [number, number][] = [[s.x, s.y]];
  let goal = -1;
  const targetOpen = open(t.x, t.y);
  for (let i = 0; i < q.length && goal < 0; i++) {
    const [x, y] = q[i];
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx;
      const ny = y + dy;
      // a blocked target (a person standing at a desk, say) counts as reached when we are next to it
      if (!targetOpen && nx === t.x && ny === t.y) { goal = id(x, y); break; }
      if (!open(nx, ny) || prev.has(id(nx, ny))) continue;
      prev.set(id(nx, ny), id(x, y));
      if (targetOpen && nx === t.x && ny === t.y) { goal = id(nx, ny); break; }
      q.push([nx, ny]);
    }
  }
  if (s.x === t.x && s.y === t.y) return [];
  if (goal < 0) return null;
  const tiles: { x: number; y: number }[] = [];
  for (let c = goal; c !== -1; c = prev.get(c) ?? -1) tiles.push({ x: (c % w) + 0.5, y: Math.floor(c / w) + 0.5 });
  tiles.reverse();
  tiles.shift(); // the start tile
  // keep only the corners: points in the middle of a straight run are not needed
  return tiles.filter((p, i) => {
    const a = i === 0 ? { x: s.x + 0.5, y: s.y + 0.5 } : tiles[i - 1];
    const b = tiles[i + 1];
    return !b || b.x - p.x !== p.x - a.x || b.y - p.y !== p.y - a.y;
  });
}

export type PlaceResult = { ok: true } | { ok: false; reason: string };

/**
 * Can this item go here? Rules: inside the build area and off the walls; solid furniture cannot overlap other
 * solid furniture; a computer must sit on a desk or table; and nothing may cut off a room, door or the entrance.
 * `items` must not include the item being placed (when moving an item, pass the list without it).
 */
export function canPlace(map: MapDef, items: Item[], item: Item): PlaceResult {
  const def = ITEM_DEFS[item.t];
  const cells = itemCells(item);
  const b = map.buildArea;
  for (const c of cells) {
    if (c.x < b.x || c.x >= b.x + b.w || c.y < b.y || c.y >= b.y + b.h) return { ok: false, reason: 'Outside the room' };
    if (map.walls[c.y]?.[c.x]) return { ok: false, reason: 'That is a wall' };
  }
  if (TOP_ITEMS.includes(item.t)) {
    const surfaces = items.filter((i) => i.t === 'desk' || i.t === 'standingdesk' || i.t === 'execdesk' || i.t === 'cornerdesk' || i.t === 'table' || i.t === 'coffeetable' || i.t === 'roundtable');
    const onSurface = surfaces.some((s) => itemCells(s).some((c) => c.x === item.x && c.y === item.y));
    if (!onSurface) return { ok: false, reason: `${ITEM_DEFS[item.t].label} goes on a desk or table` };
    if (items.some((i) => i.t === item.t && i.x === item.x && i.y === item.y)) return { ok: false, reason: `Already a ${ITEM_DEFS[item.t].label.toLowerCase()} here` };
    return { ok: true };
  }
  if (def.solid) {
    for (const other of items) {
      if (!ITEM_DEFS[other.t].solid) continue;
      const taken = new Set(itemCells(other).map((c) => `${c.x},${c.y}`));
      if (cells.some((c) => taken.has(`${c.x},${c.y}`))) return { ok: false, reason: 'Something is already there' };
    }
    // must not trap anyone or block a door
    const solid = buildSolid(map, [...items, item]);
    const rg = reachGrid(solid, map.spawn.x, map.spawn.y);
    const has = (x: number, y: number) => x >= 0 && y >= 0 && x < rg.w && y < rg.h && rg.seen[y * rg.w + x] === 1;
    for (const z of map.zones) {
      if (z.kind === 'area') continue;
      const mid = { x: Math.floor(z.x + z.w / 2), y: Math.floor(z.y + z.h / 2) };
      // some tile of the zone must still be reachable
      let ok = false;
      for (let y = z.y; y < z.y + z.h && !ok; y++) for (let x = z.x; x < z.x + z.w && !ok; x++) if (has(x, y) || (solid[y]?.[x] && (has(x + 1, y) || has(x - 1, y) || has(x, y + 1) || has(x, y - 1)))) ok = true;
      if (!ok && !solid[mid.y]?.[mid.x]) return { ok: false, reason: 'That would block a door or room' };
    }
    if (!has(Math.floor(map.spawn.x), Math.floor(map.spawn.y))) return { ok: false, reason: 'That would block the entrance' };
  }
  return { ok: true };
}

let counter = 0;
/** A short unique id for a new item. */
export function newItemId(): string {
  counter += 1;
  return `i${Date.now().toString(36)}${counter.toString(36)}`;
}

/**
 * Furniture read back from the database (or typed by someone): keep only well-formed items that are inside the
 * room, off the walls, and not overlapping other solid pieces, so a bad saved layout can never crash or trap anyone.
 */
export function sanitizeItems(map: MapDef, raw: unknown): Item[] {
  if (!Array.isArray(raw)) return map.items;
  const out: Item[] = [];
  const ids = new Set<string>();
  for (const r of raw.slice(0, 300)) {
    if (!r || typeof r !== 'object') continue;
    const o = r as Record<string, unknown>;
    if (typeof o.t !== 'string' || !(o.t in ITEM_DEFS)) continue;
    if (typeof o.x !== 'number' || typeof o.y !== 'number' || !Number.isInteger(o.x) || !Number.isInteger(o.y)) continue;
    const rot = (typeof o.r === 'number' && [0, 1, 2, 3].includes(o.r) ? o.r : 0) as 0 | 1 | 2 | 3;
    let id = typeof o.id === 'string' && o.id.length <= 40 ? o.id : newItemId();
    if (ids.has(id)) id = newItemId();
    const item: Item = { id, t: o.t as ItemType, x: o.x, y: o.y, r: rot };
    if (typeof o.c === 'number' && Number.isInteger(o.c) && o.c >= 0 && o.c < 10) item.c = o.c;
    // computers are checked against the desks accepted so far, so order matters (desks first)
    const ordered = out;
    if (!canPlace(map, ordered, item).ok) continue;
    ids.add(id);
    out.push(item);
  }
  return out;
}
