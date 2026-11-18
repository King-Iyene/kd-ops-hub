// Pure world logic: furniture catalogue, collision, walking, dead reckoning, rooms, and placement rules.
// No React, no canvas, no network, so it is unit tested.
import type { Item, ItemDef, ItemType, MapDef, Zone } from './types';

export const ITEM_DEFS: Record<ItemType, ItemDef> = {
  desk: { w: 2, h: 1, solid: true, label: 'Desk' },
  chair: { w: 1, h: 1, solid: false, label: 'Chair' },
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
};

export const PLAYER_RADIUS = 0.3;
export const WALK_SPEED = 4.5; // tiles per second

/** Size of an item in tiles after rotation. */
export function itemSize(item: Pick<Item, 't' | 'r'>): { w: number; h: number } {
  const d = ITEM_DEFS[item.t];
  return (item.r ?? 0) % 2 === 1 ? { w: d.h, h: d.w } : { w: d.w, h: d.h };
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
  const rank: Record<Zone['kind'], number> = { portal: 0, meeting: 1, lounge: 2, area: 3 };
  return hits.sort((a, b) => rank[a.kind] - rank[b.kind])[0];
}

/** Tiles reachable on foot from a start tile (4-directional, one tile wide is enough to pass). */
export function reachable(solid: boolean[][], sx: number, sy: number): Set<string> {
  const seen = new Set<string>();
  const q: [number, number][] = [[Math.floor(sx), Math.floor(sy)]];
  const key = (x: number, y: number) => `${x},${y}`;
  while (q.length) {
    const [x, y] = q.pop()!;
    if (y < 0 || y >= solid.length || x < 0 || x >= solid[0].length || solid[y][x] || seen.has(key(x, y))) continue;
    seen.add(key(x, y));
    q.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
  }
  return seen;
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
  if (item.t === 'computer') {
    const surfaces = items.filter((i) => i.t === 'desk' || i.t === 'table');
    const onSurface = surfaces.some((s) => itemCells(s).some((c) => c.x === item.x && c.y === item.y));
    if (!onSurface) return { ok: false, reason: 'A computer goes on a desk' };
    if (items.some((i) => i.t === 'computer' && i.x === item.x && i.y === item.y)) return { ok: false, reason: 'Already a computer here' };
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
    const seen = reachable(solid, map.spawn.x, map.spawn.y);
    for (const z of map.zones) {
      if (z.kind === 'area') continue;
      const mid = { x: Math.floor(z.x + z.w / 2), y: Math.floor(z.y + z.h / 2) };
      // some tile of the zone must still be reachable
      let ok = false;
      for (let y = z.y; y < z.y + z.h && !ok; y++) for (let x = z.x; x < z.x + z.w && !ok; x++) if (seen.has(`${x},${y}`)) ok = true;
      if (!ok && !solid[mid.y]?.[mid.x]) return { ok: false, reason: 'That would block a door or room' };
    }
    if (!seen.has(`${Math.floor(map.spawn.x)},${Math.floor(map.spawn.y)}`)) return { ok: false, reason: 'That would block the entrance' };
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
    // computers are checked against the desks accepted so far, so order matters (desks first)
    const ordered = out;
    if (!canPlace(map, ordered, item).ok) continue;
    ids.add(id);
    out.push(item);
  }
  return out;
}
