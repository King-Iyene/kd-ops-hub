// Canvas drawing for the office: a warm modern 2.5D style (textured floors, windows with light, detailed furniture,
// soft shadows, gentle animation). Everything is drawn from code, so there are no image files to license or load.
import { DEFAULT_ZONES, to12h, zoneAbbr, zoneParts } from './clock';
import type { AvatarStyle, Item, MapDef, Zone } from './types';
import { TOP_ITEMS, itemSize } from './world';

export const TILE = 36;

export const SKIN_TONES = ['#f6d3b3', '#e8b98f', '#c98d63', '#9c6644', '#6f4a33', '#4a3022'];
export const HAIR_COLORS = ['#1c1917', '#3f2a1d', '#7c4a21', '#c08a3e', '#d8d3c9', '#b91c1c', '#4f46e5'];
export const SHIRT_COLORS = ['#2563eb', '#0ea5a4', '#16a34a', '#f59e0b', '#dc2626', '#9333ea', '#ec4899', '#475569'];
/** Colours a person can paint furniture in. */
export const ITEM_COLORS = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#14b8a6', '#3b82f6', '#8b5cf6', '#ec4899', '#64748b', '#f5f0e6'];

export const PANTS_COLORS = ['#334155', '#1e293b', '#475569', '#78350f', '#1e3a8a', '#14532d'];

type Hair = AvatarStyle['hairStyle'];

/** A stable default look from someone's id, until they pick their own. */
type LegacyAvatar = Omit<AvatarStyle, 'jacket' | 'jacketColor' | 'inner' | 'tie' | 'tieColor' | 'shoes' | 'shoeColor' | 'hat' | 'hatColor' | 'glasses' | 'extra'>;

/** The old single "accessory" slot, spread over the new hat, glasses, extra and tie slots. */
function fromAccessory(acc: number): { hat: AvatarStyle['hat']; glasses: AvatarStyle['glasses']; extra: AvatarStyle['extra']; tie: AvatarStyle['tie'] } {
  return {
    hat: acc === 3 ? 1 : acc === 5 ? 2 : acc === 6 ? 3 : 0,
    glasses: acc === 1 ? 1 : acc === 4 ? 2 : 0,
    extra: acc === 2 ? 1 : acc === 7 ? 2 : 0,
    tie: acc === 8 ? 2 : 0,
  };
}

/** An avatar in the old shape, given the new layers (nothing changes how it looks). */
export function upgradeAvatar(a: LegacyAvatar): AvatarStyle {
  const m = fromAccessory(a.accessory);
  return { ...a, accessory: 0, jacket: 0, jacketColor: '#1f2937', inner: '#f8fafc', tie: m.tie, tieColor: '#b91c1c', shoes: 0, shoeColor: '#0f172a', hat: m.hat, hatColor: a.shirt, glasses: m.glasses, extra: m.extra };
}

export function defaultAvatar(id: string, gender?: string | null): AvatarStyle {
  return upgradeAvatar(defaultAvatarBase(id, gender));
}

function defaultAvatarBase(id: string, gender?: string | null): LegacyAvatar {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  const g = (gender ?? '').toLowerCase();
  const from = <T,>(list: readonly T[], shift: number): T => list[(h >>> shift) % list.length];
  if (g === 'female') {
    return {
      skin: SKIN_TONES[h % SKIN_TONES.length],
      hair: HAIR_COLORS[(h >>> 3) % HAIR_COLORS.length],
      shirt: SHIRT_COLORS[(h >>> 6) % SHIRT_COLORS.length],
      hairStyle: from([1, 2, 4, 6, 7, 1, 2] as const, 9) as Hair,
      outfit: from([0, 2, 3, 4, 3, 4] as const, 12) as 0 | 1 | 2 | 3 | 4,
      accessory: from([0, 0, 0, 1, 5, 6] as const, 14) as 0 | 1 | 2 | 3 | 4 | 5 | 6,
      pants: PANTS_COLORS[(h >>> 17) % PANTS_COLORS.length],
      beard: 0,
    };
  }
  if (g === 'male') {
    return {
      skin: SKIN_TONES[h % SKIN_TONES.length],
      hair: HAIR_COLORS[(h >>> 3) % HAIR_COLORS.length],
      shirt: SHIRT_COLORS[(h >>> 6) % SHIRT_COLORS.length],
      hairStyle: from([0, 0, 5, 3, 4, 7, 0] as const, 9) as Hair,
      outfit: from([0, 1, 2, 0, 2] as const, 12) as 0 | 1 | 2 | 3 | 4,
      accessory: from([0, 0, 0, 1, 2, 3, 4] as const, 14) as 0 | 1 | 2 | 3 | 4 | 5 | 6,
      pants: PANTS_COLORS[(h >>> 17) % PANTS_COLORS.length],
      beard: from([0, 0, 1, 2, 3, 0] as const, 20) as 0 | 1 | 2 | 3,
    };
  }
  return {
    skin: SKIN_TONES[h % SKIN_TONES.length],
    hair: HAIR_COLORS[(h >>> 3) % HAIR_COLORS.length],
    shirt: SHIRT_COLORS[(h >>> 6) % SHIRT_COLORS.length],
    hairStyle: ((h >>> 9) % 6) as Hair,
    outfit: ((h >>> 12) % 3) as 0 | 1 | 2,
    accessory: ([0, 0, 0, 1, 2, 3][(h >>> 14) % 6]) as 0 | 1 | 2 | 3,
    pants: PANTS_COLORS[(h >>> 17) % PANTS_COLORS.length],
    beard: 0,
  };
}

const hexRe = /^#[0-9a-fA-F]{6}$/;
/** Avatar read from the network or database: any bad field falls back to the default look for that id. */
export function cleanAvatar(raw: unknown, id: string, gender?: string | null): AvatarStyle {
  const d = defaultAvatar(id, gender);
  if (!raw || typeof raw !== 'object') return d;
  const o = raw as Record<string, unknown>;
  const col = (v: unknown, fb: string) => (typeof v === 'string' && hexRe.test(v) ? v : fb);
  const pick = <T extends number>(v: unknown, allowed: readonly number[], fb: T): T => (typeof v === 'number' && allowed.includes(v) ? (v as T) : fb);
  // an avatar saved before the layers existed carries the old accessory slot: turn it into hat, glasses, extra and tie
  const hasLayers = ['jacket', 'tie', 'hat', 'glasses', 'extra', 'shoes'].some((k) => k in o);
  const oldAcc = pick<0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8>(o.accessory, [0, 1, 2, 3, 4, 5, 6, 7, 8], 0);
  const mig = hasLayers ? { hat: d.hat, glasses: d.glasses, extra: d.extra, tie: d.tie } : o.accessory === undefined ? { hat: d.hat, glasses: d.glasses, extra: d.extra, tie: d.tie } : fromAccessory(oldAcc);
  const shirtNow = col(o.shirt, d.shirt);
  const layers = {
    jacket: pick<AvatarStyle['jacket']>(o.jacket, [0, 1, 2, 3, 4], d.jacket),
    jacketColor: col(o.jacketColor, d.jacketColor),
    inner: col(o.inner, d.inner),
    tie: pick<AvatarStyle['tie']>(o.tie, [0, 1, 2, 3], mig.tie),
    tieColor: col(o.tieColor, d.tieColor),
    shoes: pick<AvatarStyle['shoes']>(o.shoes, [0, 1, 2, 3], d.shoes),
    shoeColor: col(o.shoeColor, d.shoeColor),
    hat: pick<AvatarStyle['hat']>(o.hat, [0, 1, 2, 3, 4], mig.hat),
    hatColor: col(o.hatColor, hasLayers ? d.hatColor : shirtNow),
    glasses: pick<AvatarStyle['glasses']>(o.glasses, [0, 1, 2], mig.glasses),
    extra: pick<AvatarStyle['extra']>(o.extra, [0, 1, 2], mig.extra),
  };
  return {
    skin: col(o.skin, d.skin),
    hair: col(o.hair, d.hair),
    shirt: col(o.shirt, d.shirt),
    hairStyle: pick<Hair>(o.hairStyle, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10], d.hairStyle),
    outfit: pick<0 | 1 | 2 | 3 | 4 | 5 | 6>(o.outfit, [0, 1, 2, 3, 4, 5, 6], d.outfit),
    accessory: 0,
    pants: col(o.pants, d.pants),
    beard: pick<0 | 1 | 2 | 3>(o.beard, [0, 1, 2, 3], d.beard),
    ...layers,
  };
}

// ---------- small helpers ----------

type Ctx = CanvasRenderingContext2D;

/** Things the page tells the drawing code (the clock's places, board headings). */
/** Where each pet is right now, filled in by the canvas (a pet with no entry stays at its spot). */
export interface PetDraw { x: number; y: number; face: 1 | -1; view?: 'side' | 'front' | 'back'; moving: boolean; carrying: boolean; awake: boolean }
export const officePets = new Map<string, PetDraw>();

export const officeInfo: { zones: string[]; titles: Record<string, string> } = { zones: DEFAULT_ZONES, titles: {} };

function rr(ctx: Ctx, x: number, y: number, w: number, h: number, r: number) {
  const rad = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.arcTo(x + w, y, x + w, y + h, rad);
  ctx.arcTo(x + w, y + h, x, y + h, rad);
  ctx.arcTo(x, y + h, x, y, rad);
  ctx.arcTo(x, y, x + w, y, rad);
  ctx.closePath();
}

function disc(ctx: Ctx, x: number, y: number, r: number, fill: string | CanvasGradient) {
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

function ellipse(ctx: Ctx, x: number, y: number, rx: number, ry: number, fill: string, rot = 0) {
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2);
  ctx.fill();
}

function vgrad(ctx: Ctx, y0: number, y1: number, c0: string, c1: string): CanvasGradient {
  const g = ctx.createLinearGradient(0, y0, 0, y1);
  g.addColorStop(0, c0);
  g.addColorStop(1, c1);
  return g;
}

/** A repeatable pseudo random number in [0, 1) from two integers. */
function h2(x: number, y: number): number {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** The same, from a piece of text (an item id), so each piece of furniture keeps its own look. */
function hs(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0) / 4294967296;
}

/** Lighten (amount > 0) or darken (amount < 0) a #rrggbb colour. */
function shade(hex: string, amount: number): string {
  if (typeof hex !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(hex)) return '#808080';
  const n = parseInt(hex.slice(1), 16);
  const t = amount < 0 ? 0 : 255;
  const p = Math.abs(amount);
  const c = (v: number) => Math.round((t - v) * p + v);
  return `rgb(${c((n >> 16) & 255)},${c((n >> 8) & 255)},${c(n & 255)})`;
}

export interface Theme {
  dark: boolean;
}

function pal(dark: boolean) {
  return dark
    ? {
        floorA: '#252f42', floorB: '#28334a', carpet: '#263f5e', carpetDot: '#365a82', woodA: '#5c4433', woodB: '#4d392b', plank: 'rgba(0,0,0,0.28)',
        wallCap: '#34415f', wallFront: '#1c2640', wallBase: '#0f1528', glassTop: '#14234a', glassBottom: '#2c4478', frame: '#4a5a80',
      }
    : {
        floorA: '#f4ead6', floorB: '#efe3cb', carpet: '#dcdaf3', carpetDot: '#c6c3ea', woodA: '#e9c496', woodB: '#dfb685', plank: 'rgba(120,70,20,0.22)',
        wallCap: '#a3b3c2', wallFront: '#7f93a6', wallBase: '#566a7d', glassTop: '#a9dcff', glassBottom: '#e6f6ff', frame: '#f1f5f9',
      };
}

// ---------- floor and walls ----------

export function drawFloor(ctx: Ctx, map: MapDef, theme: Theme, t = 0) {
  const c = pal(theme.dark);
  const zoneAt = (x: number, y: number) => map.zones.find((z) => z.kind !== 'area' && x >= z.x && x < z.x + z.w && y >= z.y && y < z.y + z.h);
  /** the ground here: the last zone with a floor that contains the tile */
  const floorOf = (x: number, y: number) => {
    const painted = map.floorOverrides?.[`${x},${y}`];
    if (painted) return painted;
    let f: string | undefined;
    for (const z of map.zones) if (z.floor && x >= z.x && x < z.x + z.w && y >= z.y && y < z.y + z.h) f = z.floor;
    return f;
  };
  for (let y = 0; y < map.h; y++) {
    for (let x = 0; x < map.w; x++) {
      if (map.walls[y][x]) continue;
      const px = x * TILE;
      const py = y * TILE;
      const z = zoneAt(x, y);
      const ff = floorOf(x, y);
      if (ff === 'grass') {
        ctx.fillStyle = (x + y) % 2 === 0 ? (theme.dark ? '#2b6b3b' : '#63c174') : (theme.dark ? '#276235' : '#58b86a');
        ctx.fillRect(px, py, TILE, TILE);
        ctx.strokeStyle = theme.dark ? '#1f4f2b' : '#3f9d55';
        ctx.lineWidth = 1;
        for (let i = 0; i < 7; i++) {
          const gx = px + h2(x * 11 + i, y) * (TILE - 3) + 1;
          const gy = py + h2(x, y * 11 + i) * (TILE - 6) + 5;
          ctx.beginPath();
          ctx.moveTo(gx, gy);
          ctx.lineTo(gx + (h2(i, x + y) - 0.5) * 2 + Math.sin(t / 1100 + gx) * 0.6, gy - 3.5);
          ctx.stroke();
        }
        if (h2(x * 3 + 1, y * 7 + 2) > 0.93) {
          const fx = px + 6 + h2(x, y) * 22;
          const fy = py + 6 + h2(y, x) * 22;
          disc(ctx, fx, fy, 2, ['#f9a8d4', '#fde047', '#ffffff', '#c4b5fd'][Math.floor(h2(x + 5, y + 9) * 4)]);
          disc(ctx, fx, fy, 0.8, '#f59e0b');
        }
      } else if (ff === 'stone') {
        ctx.fillStyle = (x + y) % 2 === 0 ? (theme.dark ? '#4a5160' : '#cfd3d9') : (theme.dark ? '#444b59' : '#c4c9d0');
        ctx.fillRect(px, py, TILE, TILE);
        ctx.fillStyle = 'rgba(0,0,0,0.12)';
        ctx.fillRect(px, py + TILE - 1, TILE, 1);
        ctx.fillRect(px + TILE - 1, py, 1, TILE);
        ctx.fillStyle = 'rgba(255,255,255,0.22)';
        ctx.fillRect(px, py, TILE, 1);
      } else if (ff === 'gray') {
        ctx.fillStyle = theme.dark ? '#3a4252' : '#aeb6c1';
        ctx.fillRect(px, py, TILE, TILE);
        for (let i = 0; i < 14; i++) {
          ctx.fillStyle = h2(x * 5 + i, y * 3) > 0.5 ? (theme.dark ? '#2f3644' : '#9aa3b0') : (theme.dark ? '#485064' : '#c3cad4');
          ctx.fillRect(px + h2(x * 9 + i, y) * (TILE - 2), py + h2(x, y * 9 + i) * (TILE - 2), 2, 2);
        }
      } else if (ff === 'carpet' || (z?.kind === 'meeting' && ff !== 'tile')) {
        ctx.fillStyle = c.carpet;
        ctx.fillRect(px, py, TILE, TILE);
        ctx.fillStyle = c.carpetDot;
        for (let i = 0; i < 6; i++) ctx.fillRect(px + h2(x * 7 + i, y) * (TILE - 2), py + h2(x, y * 7 + i) * (TILE - 2), 2, 2);
      } else if (z?.kind === 'lounge' && ff !== 'tile') {
        // wooden planks, each a slightly different shade, seams staggered row by row
        for (let r = 0; r < 3; r++) {
          const off = ((x + y + r) % 2) * 0.5;
          ctx.fillStyle = h2(x * 3 + r, y) > 0.5 ? c.woodA : c.woodB;
          ctx.fillRect(px, py + r * 12, TILE, 12);
          ctx.fillStyle = c.plank;
          ctx.fillRect(px, py + r * 12 + 11, TILE, 1);
          ctx.fillRect(px + TILE * off + 6, py + r * 12, 1, 11);
        }
      } else if (z?.kind === 'portal') {
        ctx.fillStyle = theme.dark ? '#16503d' : '#bbf7d0';
        ctx.fillRect(px, py, TILE, TILE);
      } else if (ff === 'wood') {
        // the headquarters floor: warm wide planks, seams staggered row by row
        for (let r = 0; r < 3; r++) {
          const off = ((x * 2 + y + r) % 3) / 3;
          ctx.fillStyle = h2(x * 3 + r, y + 40) > 0.5 ? (theme.dark ? '#6b4528' : '#cf8f50') : (theme.dark ? '#5f3d22' : '#c28145');
          ctx.fillRect(px, py + r * 12, TILE, 12);
          ctx.fillStyle = theme.dark ? 'rgba(0,0,0,0.3)' : 'rgba(90,50,20,0.35)';
          ctx.fillRect(px, py + r * 12 + 11, TILE, 1);
          ctx.fillRect(px + TILE * off + 4, py + r * 12, 1, 11);
          ctx.fillStyle = 'rgba(255,255,255,0.07)';
          ctx.fillRect(px, py + r * 12, TILE, 1);
        }
      } else {
        // polished tile with a soft highlight and fine grout
        ctx.fillStyle = (x + y) % 2 === 0 ? c.floorA : c.floorB;
        ctx.fillRect(px, py, TILE, TILE);
        ctx.fillStyle = theme.dark ? 'rgba(255,255,255,0.035)' : 'rgba(255,255,255,0.55)';
        ctx.fillRect(px, py, TILE, 1);
        ctx.fillRect(px, py, 1, TILE);
        ctx.fillStyle = theme.dark ? 'rgba(0,0,0,0.18)' : 'rgba(100,116,139,0.10)';
        ctx.fillRect(px, py + TILE - 1, TILE, 1);
        ctx.fillRect(px + TILE - 1, py, 1, TILE);
      }
    }
  }
  // doorways glow and breathe
  for (const z of map.zones) {
    if (z.kind !== 'portal') continue;
    const cx = (z.x + z.w / 2) * TILE;
    const cy = (z.y + z.h / 2) * TILE;
    const pulse = 0.55 + 0.25 * Math.sin(t / 420);
    const g = ctx.createRadialGradient(cx, cy, 2, cx, cy, z.w * TILE * 0.75);
    g.addColorStop(0, `rgba(52,211,153,${pulse})`);
    g.addColorStop(1, 'rgba(52,211,153,0)');
    ctx.fillStyle = g;
    ctx.fillRect((z.x - 1) * TILE, (z.y - 1) * TILE, (z.w + 2) * TILE, (z.h + 2) * TILE);
    ctx.strokeStyle = `rgba(16,185,129,${0.5 + 0.3 * Math.sin(t / 420)})`;
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 6]);
    ctx.lineDashOffset = -t / 60;
    rr(ctx, z.x * TILE + 3, z.y * TILE + 3, z.w * TILE - 6, z.h * TILE - 6, 8);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  // soft trim where a room meets the open floor
  for (const z of map.zones) {
    if (z.kind !== 'meeting' && z.kind !== 'lounge') continue;
    ctx.strokeStyle = theme.dark ? 'rgba(148,163,184,0.25)' : 'rgba(71,85,105,0.22)';
    ctx.lineWidth = 2;
    ctx.strokeRect(z.x * TILE + 1, z.y * TILE + 1, z.w * TILE - 2, z.h * TILE - 2);
  }
}

export function drawWalls(ctx: Ctx, map: MapDef, theme: Theme, t = 0) {
  const hq = map.style === 'hq';
  const c = hq
    ? { ...pal(theme.dark), ...(theme.dark ? { wallCap: '#6b4a33', wallFront: '#4a2e1a', wallBase: '#2f1c0f' } : { wallCap: '#a4714b', wallFront: '#7a4a2a', wallBase: '#4f2f19' }) }
    : pal(theme.dark);
  for (let y = 0; y < map.h; y++) {
    for (let x = 0; x < map.w; x++) {
      if (!map.walls[y][x]) continue;
      const px = x * TILE;
      const py = y * TILE;
      const floorBelow = y + 1 < map.h && !map.walls[y + 1][x];
      if (floorBelow) {
        // shadow thrown on the floor
        const sh = ctx.createLinearGradient(0, py + TILE, 0, py + TILE + 12);
        sh.addColorStop(0, 'rgba(15,23,42,0.28)');
        sh.addColorStop(1, 'rgba(15,23,42,0)');
        ctx.fillStyle = sh;
        ctx.fillRect(px, py + TILE, TILE, 12);
        // the face of the wall: a lighter top edge, the painted front, and a skirting board
        ctx.fillStyle = vgrad(ctx, py, py + TILE, c.wallFront, shade(c.wallFront, theme.dark ? -0.25 : -0.15));
        ctx.fillRect(px, py, TILE, TILE);
        ctx.fillStyle = c.wallCap;
        ctx.fillRect(px, py, TILE, 7);
        ctx.fillStyle = 'rgba(255,255,255,0.18)';
        ctx.fillRect(px, py, TILE, 1);
        ctx.fillStyle = c.wallBase;
        ctx.fillRect(px, py + TILE - 5, TILE, 5);
        if (hq) {
          // brick courses with staggered joints
          ctx.strokeStyle = 'rgba(0,0,0,0.24)';
          ctx.lineWidth = 1;
          for (let r = 1; r < 5; r++) {
            const yy = py + 6 + r * 5;
            ctx.beginPath();
            ctx.moveTo(px, yy);
            ctx.lineTo(px + TILE, yy);
            ctx.stroke();
            for (let bx = (r % 2) * 9 + 4; bx < TILE; bx += 18) {
              ctx.beginPath();
              ctx.moveTo(px + bx, yy - 5);
              ctx.lineTo(px + bx, yy);
              ctx.stroke();
            }
          }
        }
        // windows along the outer top wall
        if (!hq && y === 0 && x % 4 !== 0 && x < map.w - 1) {
          const gx = px + 3;
          const gy = py + 9;
          ctx.fillStyle = c.frame;
          rr(ctx, gx - 1, gy - 1, TILE - 4, TILE - 17, 3);
          ctx.fill();
          ctx.fillStyle = vgrad(ctx, gy, gy + TILE - 19, c.glassTop, c.glassBottom);
          rr(ctx, gx + 1, gy + 1, TILE - 8, TILE - 21, 2);
          ctx.fill();
          if (theme.dark) {
            ctx.fillStyle = 'rgba(255,255,255,0.8)';
            for (let i = 0; i < 3; i++) ctx.fillRect(gx + 3 + h2(x, i) * (TILE - 14), gy + 3 + h2(i, x) * 5, 1, 1);
          } else {
            ctx.fillStyle = 'rgba(255,255,255,0.7)';
            ellipseFill(ctx, gx + 8 + ((t / 2500 + x) % 1) * 4, gy + 5, 5, 2);
          }
          ctx.fillStyle = c.frame;
          ctx.fillRect(gx + (TILE - 8) / 2, gy + 1, 1.5, TILE - 21);
        }
      } else {
        // the top of a wall seen from above
        ctx.fillStyle = c.wallCap;
        ctx.fillRect(px, py, TILE, TILE);
        ctx.fillStyle = 'rgba(255,255,255,0.12)';
        ctx.fillRect(px, py, TILE, 1);
        ctx.fillStyle = 'rgba(0,0,0,0.12)';
        ctx.fillRect(px, py + TILE - 2, TILE, 2);
      }
    }
  }
}

function ellipseFill(ctx: Ctx, x: number, y: number, rx: number, ry: number) {
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
}

/** A name plate on the wall above a private office, with the owner's face. */
function drawPlaque(ctx: Ctx, z: Zone, theme: Theme) {
  const s = z.sign;
  if (!s) return;
  const x = z.x * TILE + 3;
  const y = (z.y - 1) * TILE + 7;
  const w = z.w * TILE - 6;
  const hh = 22;
  ctx.fillStyle = 'rgba(15,23,42,0.3)';
  rr(ctx, x + 1, y + 2, w, hh, 4);
  ctx.fill();
  ctx.fillStyle = theme.dark ? '#d9cdb0' : '#f3ead3';
  rr(ctx, x, y, w, hh, 4);
  ctx.fill();
  ctx.strokeStyle = '#7a4a22';
  ctx.lineWidth = 2;
  rr(ctx, x + 1, y + 1, w - 2, hh - 2, 3);
  ctx.stroke();
  ctx.font = '800 10px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#4a2c12';
  let text = s.name.toUpperCase();
  const room = w - (s.avatar ? 34 : 14);
  while (text.length > 3 && ctx.measureText(text).width > room) text = text.slice(0, -2);
  if (text !== s.name.toUpperCase()) text += '…';
  ctx.fillText(text, x + (s.avatar ? 27 : 8), y + hh / 2 + 0.5);
  if (s.avatar) {
    ctx.save();
    ctx.translate(x + 5.5, y + hh / 2 - 8.5);
    ctx.beginPath();
    ctx.arc(8.5, 8.5, 8.5, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = 'rgba(148,163,184,0.5)';
    ctx.fillRect(0, 0, 17, 17);
    const k = 17 / 27;
    ctx.scale(k, k);
    try { drawPerson(ctx, { x: 13.5 / TILE, y: (14.5 + 17) / TILE, dir: 0, moving: false, name: '', avatar: s.avatar, isMe: false }, 0, theme); } catch { /* the plate stays plain */ }
    ctx.restore();
  }
}

/** One desk seat: a soft outline around it, and the owner's name when it is taken. */
function drawSeat(ctx: Ctx, z: Zone, theme: Theme) {
  const s = z.sign;
  const claimed = !!s && s.name !== 'Free seat';
  const x = z.x * TILE + 2;
  const y = z.y * TILE + 2;
  const w = z.w * TILE - 4;
  const h = z.h * TILE - 4;
  ctx.save();
  if (claimed) {
    ctx.fillStyle = 'rgba(99,102,241,0.10)';
    rr(ctx, x, y, w, h, 10);
    ctx.fill();
    ctx.strokeStyle = 'rgba(99,102,241,0.55)';
    ctx.lineWidth = 1.5;
  } else {
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = theme.dark ? 'rgba(203,213,225,0.28)' : 'rgba(71,85,105,0.3)';
    ctx.lineWidth = 1;
  }
  rr(ctx, x, y, w, h, 10);
  ctx.stroke();
  ctx.setLineDash([]);
  if (claimed && s) {
    const parts = s.name.trim().split(/\s+/);
    const label = parts.length > 1 ? parts[0] + ' ' + parts[parts.length - 1][0] + '.' : parts[0];
    ctx.font = '700 8px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const pw = Math.min(w - 2, ctx.measureText(label).width + 10);
    ctx.fillStyle = 'rgba(30,41,59,0.92)';
    rr(ctx, x + w / 2 - pw / 2, y - 6, pw, 12, 6);
    ctx.fill();
    ctx.fillStyle = '#f8fafc';
    ctx.fillText(label, x + w / 2, y + 0.5);
  }
  ctx.restore();
}

export function drawZoneLabels(ctx: Ctx, zones: Zone[], theme: Theme) {
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '600 12px system-ui, sans-serif';
  for (const z of zones) {
    if (z.seat) { drawSeat(ctx, z, theme); ctx.textAlign = 'center'; ctx.font = '600 12px system-ui, sans-serif'; continue; }
    if (z.sign) { drawPlaque(ctx, z, theme); ctx.textAlign = 'center'; ctx.font = '600 12px system-ui, sans-serif'; continue; }
    if (z.kind === 'area' || z.kind === 'office') continue;
    const cx = (z.x + z.w / 2) * TILE;
    const cy = (z.y + 0.5) * TILE + (z.kind === 'portal' ? 0 : 6);
    const w = ctx.measureText(z.name).width + 30;
    const h = 22;
    const x0 = cx - w / 2;
    const y0 = cy - h / 2;
    // the slab: a soft shadow on the floor, then pale (or dark) marble with a faint vein
    ctx.fillStyle = 'rgba(15,23,42,0.22)';
    rr(ctx, x0 + 1, y0 + 3, w, h, 6);
    ctx.fill();
    const g = ctx.createLinearGradient(x0, y0, x0 + w, y0 + h);
    if (theme.dark) { g.addColorStop(0, '#3b4252'); g.addColorStop(0.5, '#2b3040'); g.addColorStop(1, '#383e4e'); }
    else { g.addColorStop(0, '#f6f4ef'); g.addColorStop(0.5, '#e4e1da'); g.addColorStop(1, '#f1eee8'); }
    ctx.fillStyle = g;
    rr(ctx, x0, y0, w, h, 6);
    ctx.fill();
    ctx.strokeStyle = theme.dark ? 'rgba(148,163,184,0.18)' : 'rgba(120,113,108,0.2)';
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    ctx.moveTo(x0 + w * 0.18, y0 + h);
    ctx.bezierCurveTo(x0 + w * 0.3, y0 + h * 0.55, x0 + w * 0.42, y0 + h * 0.7, x0 + w * 0.55, y0 + h * 0.2);
    ctx.moveTo(x0 + w * 0.7, y0 + h);
    ctx.bezierCurveTo(x0 + w * 0.78, y0 + h * 0.6, x0 + w * 0.86, y0 + h * 0.5, x0 + w * 0.95, y0);
    ctx.stroke();
    // bevelled edge: bright on top, dim underneath
    ctx.lineWidth = 1;
    ctx.strokeStyle = theme.dark ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.95)';
    rr(ctx, x0 + 0.5, y0 + 0.5, w - 1, h - 1, 6);
    ctx.stroke();
    ctx.strokeStyle = theme.dark ? 'rgba(0,0,0,0.4)' : 'rgba(87,83,78,0.35)';
    ctx.beginPath();
    ctx.moveTo(x0 + 3, y0 + h - 0.5);
    ctx.lineTo(x0 + w - 3, y0 + h - 0.5);
    ctx.stroke();
    // a small engraved colour dot, then the name cut into the stone (shadow above-left, light edge below-right)
    const dotx = x0 + 11;
    const tint = z.kind === 'portal' ? '#10b981' : z.kind === 'meeting' ? '#3b82f6' : '#f59e0b';
    ctx.fillStyle = theme.dark ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.9)';
    disc(ctx, dotx + 0.6, cy + 0.9, 3, ctx.fillStyle);
    disc(ctx, dotx, cy, 3, tint);
    const tx = cx + 6;
    ctx.fillStyle = theme.dark ? 'rgba(255,255,255,0.16)' : 'rgba(255,255,255,0.95)';
    ctx.fillText(z.name, tx + 0.6, cy + 1.4);
    ctx.fillStyle = theme.dark ? '#cbd5e1' : '#57534e';
    ctx.fillText(z.name, tx, cy + 0.6);
    ctx.fillStyle = theme.dark ? 'rgba(0,0,0,0.35)' : 'rgba(41,37,36,0.28)';
    ctx.fillText(z.name, tx - 0.3, cy + 0.3);
  }
}

// ---------- furniture ----------

const TOP: Item['t'][] = TOP_ITEMS;

function softShadow(ctx: Ctx, x: number, y: number, W: number, H: number, r = 8) {
  for (const [grow, a] of [[5, 0.06], [3, 0.08], [1, 0.1]] as const) {
    ctx.fillStyle = `rgba(15,23,42,${a})`;
    rr(ctx, x + 1 - grow + 2, y + 5 - grow + 2, W - 2 + grow * 2, H - 2 + grow * 2, r + grow);
    ctx.fill();
  }
}

function steam(ctx: Ctx, x: number, y: number, t: number, seed: number, dark: boolean) {
  ctx.strokeStyle = dark ? 'rgba(226,232,240,0.45)' : 'rgba(100,116,139,0.4)';
  ctx.lineWidth = 1.4;
  ctx.lineCap = 'round';
  for (let i = 0; i < 2; i++) {
    const ph = (t / 700 + seed + i * 0.5) % 1;
    ctx.globalAlpha = 1 - ph;
    ctx.beginPath();
    ctx.moveTo(x + i * 3 - 1.5, y - ph * 9);
    ctx.quadraticCurveTo(x + i * 3 - 1.5 + Math.sin(t / 300 + i) * 2.5, y - ph * 9 - 3, x + i * 3 - 1.5, y - ph * 9 - 6);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

const FLOWER_COLORS = ['#f472b6', '#fbbf24', '#a78bfa', '#fb7185', '#fb923c', '#f8fafc'];
const SOFA_COLORS = ['#4f6df5', '#0d9488', '#e0577a', '#d99a2b', '#7c5cdb'];
const BEAN_COLORS = ['#f97316', '#14b8a6', '#8b5cf6', '#ef4444', '#eab308'];

function drawItem(ctx: Ctx, item: Item, dark: boolean, t: number) {
  const { w, h } = itemSize(item);
  const x = item.x * TILE;
  const y = item.y * TILE;
  const W = w * TILE;
  const H = h * TILE;
  const seed = hs(item.id);
  const sway = Math.sin(t / 900 + seed * 6.28);
  const col = item.c !== undefined ? ITEM_COLORS[item.c] : undefined;
  if (drawExtra(ctx, item, dark, t, col, x, y, W, H, seed)) return;
  switch (item.t) {
    case 'rug': {
      const base = col ?? ['#7c83e8', '#e08aa6', '#5fb5a8', '#d9a35f'][Math.floor(seed * 4)];
      ctx.fillStyle = shade(base, dark ? -0.35 : 0.1);
      rr(ctx, x + 2, y + 2, W - 4, H - 4, 12);
      ctx.fill();
      ctx.strokeStyle = shade(base, dark ? 0.1 : -0.25);
      ctx.lineWidth = 2;
      rr(ctx, x + 6, y + 6, W - 12, H - 12, 9);
      ctx.stroke();
      ctx.strokeStyle = shade(base, dark ? 0.35 : 0.5);
      ctx.lineWidth = 1.5;
      for (let i = 0; i < w * 2; i++) {
        const cx = x + W / 2 + (i - (w * 2 - 1) / 2) * 12;
        ctx.beginPath();
        ctx.moveTo(cx, y + H / 2 - 7);
        ctx.lineTo(cx + 6, y + H / 2);
        ctx.lineTo(cx, y + H / 2 + 7);
        ctx.lineTo(cx - 6, y + H / 2);
        ctx.closePath();
        ctx.stroke();
      }
      ctx.strokeStyle = shade(base, dark ? -0.1 : -0.1);
      ctx.lineWidth = 1;
      for (let i = 0; i < H / 4; i++) {
        ctx.beginPath();
        ctx.moveTo(x, y + 4 + i * 4);
        ctx.lineTo(x + 3, y + 4 + i * 4);
        ctx.moveTo(x + W, y + 4 + i * 4);
        ctx.lineTo(x + W - 3, y + 4 + i * 4);
        ctx.stroke();
      }
      break;
    }
    case 'grass': {
      ctx.fillStyle = vgrad(ctx, y, y + H, '#5ee08a', '#2fb865');
      rr(ctx, x + 1, y + 1, W - 2, H - 2, 14);
      ctx.fill();
      ctx.strokeStyle = '#1f9e57';
      ctx.lineWidth = 1.2;
      ctx.lineCap = 'round';
      for (let i = 0; i < 90; i++) {
        const gx = x + 4 + h2(i, 3) * (W - 8);
        const gy = y + 4 + h2(7, i) * (H - 8);
        const lean = (h2(i, 9) - 0.5) * 3 + sway * 0.8;
        ctx.beginPath();
        ctx.moveTo(gx, gy);
        ctx.lineTo(gx + lean, gy - 4);
        ctx.stroke();
      }
      for (let i = 0; i < 9; i++) {
        const fx = x + 8 + h2(i, 21) * (W - 16);
        const fy = y + 8 + h2(33, i) * (H - 16);
        disc(ctx, fx, fy, 2.3, i % 3 === 0 ? '#fde047' : '#ffffff');
        disc(ctx, fx, fy, 0.9, '#f59e0b');
      }
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.lineWidth = 1.5;
      rr(ctx, x + 2.5, y + 2.5, W - 5, H - 5, 13);
      ctx.stroke();
      break;
    }
    case 'desk': {
      softShadow(ctx, x, y, W, H, 7);
      // legs and the front edge
      ctx.fillStyle = '#7a5532';
      ctx.fillRect(x + 4, y + H - 6, 4, 5);
      ctx.fillRect(x + W - 8, y + H - 6, 4, 5);
      ctx.fillStyle = col ? shade(col, -0.25) : '#a3774a';
      rr(ctx, x + 1, y + 6, W - 2, H - 9, 6);
      ctx.fill();
      // the top
      ctx.fillStyle = vgrad(ctx, y + 2, y + H - 9, col ? shade(col, 0.4) : '#ecd0a8', col ? shade(col, 0.05) : '#d6ad7c');
      rr(ctx, x + 1, y + 2, W - 2, H - 11, 6);
      ctx.fill();
      ctx.strokeStyle = 'rgba(120,80,40,0.14)';
      ctx.lineWidth = 1;
      for (let i = 0; i < 4; i++) {
        const gy = y + 7 + i * 4;
        ctx.beginPath();
        ctx.moveTo(x + 6, gy);
        ctx.bezierCurveTo(x + W * 0.3, gy - 1.5, x + W * 0.6, gy + 1.5, x + W - 6, gy);
        ctx.stroke();
      }
      ctx.fillStyle = 'rgba(255,255,255,0.4)';
      ctx.fillRect(x + 6, y + 3, W - 12, 1);
      // drawer
      ctx.fillStyle = '#8a6038';
      rr(ctx, x + W - 24, y + H - 12, 18, 7, 2);
      ctx.fill();
      ctx.fillStyle = '#e5c9a0';
      ctx.fillRect(x + W - 18, y + H - 9.5, 6, 2);
      break;
    }
    case 'table': {
      softShadow(ctx, x, y, W, H, 14);
      ctx.fillStyle = col ? shade(col, -0.3) : '#9d7143';
      rr(ctx, x + 2, y + 6, W - 4, H - 9, 13);
      ctx.fill();
      ctx.fillStyle = vgrad(ctx, y + 3, y + H - 8, col ? shade(col, 0.45) : '#eed2aa', col ? shade(col, 0.05) : '#d9b283');
      rr(ctx, x + 2, y + 3, W - 4, H - 12, 13);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      rr(ctx, x + 9, y + 7, W * 0.38, 3, 2);
      ctx.fill();
      // a little vase in the middle
      const vx = x + W / 2;
      const vy = y + H / 2 - 4;
      ellipse(ctx, vx, vy + 5, 5, 2.4, 'rgba(15,23,42,0.2)');
      ctx.fillStyle = '#e2e8f0';
      rr(ctx, vx - 3, vy - 2, 6, 8, 2);
      ctx.fill();
      for (let i = 0; i < 3; i++) disc(ctx, vx + (i - 1) * 3.2 + sway * 0.5, vy - 5 - (i === 1 ? 2 : 0), 2.6, FLOWER_COLORS[(i + Math.floor(seed * 6)) % 6]);
      break;
    }
    case 'coffeetable': {
      softShadow(ctx, x, y, W, H, 9);
      ctx.fillStyle = '#475569';
      rr(ctx, x + 2, y + 6, W - 4, H - 8, 8);
      ctx.fill();
      ctx.fillStyle = dark ? 'rgba(125,180,230,0.55)' : 'rgba(186,222,255,0.9)';
      rr(ctx, x + 3, y + 3, W - 6, H - 11, 8);
      ctx.fill();
      ctx.fillStyle = '#ef4444';
      ctx.save();
      ctx.translate(x + 18, y + H / 2 - 3);
      ctx.rotate(-0.18);
      ctx.fillRect(-7, -5, 14, 10);
      ctx.fillStyle = '#fbbf24';
      ctx.fillRect(-6, -4, 12, 3);
      ctx.restore();
      ctx.strokeStyle = 'rgba(255,255,255,0.7)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x + W - 20, y + 8);
      ctx.lineTo(x + W - 8, y + 6);
      ctx.stroke();
      break;
    }
    case 'computer': {
      // monitor with animated screen, keyboard and mouse
      ctx.fillStyle = 'rgba(15,23,42,0.18)';
      rr(ctx, x + 9, y + 18, 22, 4, 2);
      ctx.fill();
      ctx.fillStyle = '#111827';
      rr(ctx, x + 7, y + 1, 22, 16, 3);
      ctx.fill();
      ctx.fillStyle = vgrad(ctx, y + 3, y + 15, '#0ea5e9', '#6366f1');
      rr(ctx, x + 9, y + 3, 18, 12, 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.78)';
      const tick = Math.floor(t / 1100 + seed * 9);
      for (let i = 0; i < 4; i++) ctx.fillRect(x + 11, y + 5 + i * 2.6, 3 + h2(tick, i + 1) * 11, 1.4);
      if (Math.floor(t / 500) % 2 === 0) ctx.fillRect(x + 11 + 4, y + 13, 1.5, 1.6);
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      ctx.beginPath();
      ctx.moveTo(x + 9, y + 3);
      ctx.lineTo(x + 19, y + 3);
      ctx.lineTo(x + 9, y + 11);
      ctx.fill();
      ctx.fillStyle = '#334155';
      ctx.fillRect(x + 16, y + 17, 4, 3);
      ctx.fillRect(x + 12, y + 20, 12, 2);
      ctx.fillStyle = '#e2e8f0';
      rr(ctx, x + 9, y + 25, 19, 6, 2);
      ctx.fill();
      ctx.fillStyle = '#94a3b8';
      for (let i = 0; i < 6; i++) ctx.fillRect(x + 11 + i * 2.7, y + 27, 1.7, 1.4);
      ctx.fillStyle = '#cbd5e1';
      rr(ctx, x + 30, y + 26, 3.5, 5, 1.7);
      ctx.fill();
      break;
    }
    case 'papers': {
      for (let k = 0; k < 3; k++) {
        ctx.save();
        ctx.translate(x + 15 + k * 3, y + 19 - k * 1.5);
        ctx.rotate((seed + k * 0.37 - 0.5) * 0.6);
        ctx.fillStyle = 'rgba(15,23,42,0.18)';
        ctx.fillRect(-7, -9, 14, 18);
        ctx.fillStyle = k === 2 ? '#ffffff' : '#f1f5f9';
        ctx.fillRect(-7.5, -9.5, 14, 18);
        if (k === 2) {
          ctx.fillStyle = '#94a3b8';
          for (let i = 0; i < 5; i++) ctx.fillRect(-5, -6 + i * 3, i === 4 ? 6 : 10, 1);
          ctx.fillStyle = '#3b82f6';
          ctx.fillRect(-5, -7.6, 5, 1.2);
        }
        ctx.restore();
      }
      ctx.strokeStyle = '#2563eb';
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(x + 27, y + 28);
      ctx.lineTo(x + 33, y + 22);
      ctx.stroke();
      break;
    }
    case 'mug': {
      ellipse(ctx, x + 19, y + 28, 7, 2.5, 'rgba(15,23,42,0.2)');
      ctx.fillStyle = '#f8fafc';
      rr(ctx, x + 13, y + 18, 11, 10, 3);
      ctx.fill();
      ctx.strokeStyle = '#f8fafc';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x + 25, y + 23, 3, -Math.PI / 2, Math.PI / 2);
      ctx.stroke();
      ellipse(ctx, x + 18.5, y + 19, 5, 1.5, '#6b3f1d');
      ctx.fillStyle = '#ef4444';
      ctx.fillRect(x + 13, y + 23, 11, 2);
      steam(ctx, x + 18.5, y + 16, t, seed, dark);
      break;
    }
    case 'chair': {
      ellipse(ctx, x + TILE / 2, y + TILE / 2 + 7, 12, 6, 'rgba(15,23,42,0.2)');
      ctx.strokeStyle = '#1f2937';
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2 + 0.3;
        ctx.beginPath();
        ctx.moveTo(x + TILE / 2, y + TILE / 2 + 6);
        ctx.lineTo(x + TILE / 2 + Math.cos(a) * 9, y + TILE / 2 + 6 + Math.sin(a) * 4);
        ctx.stroke();
      }
      const c = col ?? ['#475569', '#2f6f9f', '#4f5d95', '#2f7f6f'][Math.floor(seed * 4)];
      const g = ctx.createRadialGradient(x + TILE / 2 - 3, y + TILE / 2 - 3, 1, x + TILE / 2, y + TILE / 2, 11);
      g.addColorStop(0, shade(c, 0.3));
      g.addColorStop(1, c);
      disc(ctx, x + TILE / 2, y + TILE / 2 + 2, 10, g);
      ctx.strokeStyle = shade(c, -0.3);
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.arc(x + TILE / 2, y + TILE / 2 + 1, 11, Math.PI * 1.12, Math.PI * 1.88);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.25)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(x + TILE / 2, y + TILE / 2 + 1, 11, Math.PI * 1.2, Math.PI * 1.45);
      ctx.stroke();
      break;
    }
    case 'plant': {
      ellipse(ctx, x + TILE / 2, y + TILE - 4, 12, 5, 'rgba(15,23,42,0.2)');
      // pot
      ctx.fillStyle = vgrad(ctx, y + 21, y + 33, col ? shade(col, 0.1) : '#d27a4d', col ? shade(col, -0.2) : '#b5593a');
      ctx.beginPath();
      ctx.moveTo(x + 10, y + 21);
      ctx.lineTo(x + 26, y + 21);
      ctx.lineTo(x + 24, y + 33);
      ctx.lineTo(x + 12, y + 33);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#c9683f';
      rr(ctx, x + 8.5, y + 19, 19, 4, 2);
      ctx.fill();
      ellipse(ctx, x + 18, y + 20, 8, 1.6, '#4a2f1c');
      // leaves
      const leaves = [[-9, -6, -0.9], [9, -6, 0.9], [-5, -12, -0.4], [5, -12, 0.4], [0, -14, 0], [-12, -1, -1.2], [12, -1, 1.2]] as const;
      for (const [dx, dy, rot] of leaves) {
        ctx.save();
        ctx.translate(x + 18, y + 20);
        ctx.rotate(rot * 0.35 + sway * 0.04 * (dx < 0 ? -1 : 1));
        ctx.fillStyle = '#15803d';
        ctx.beginPath();
        ctx.ellipse(dx * 0.7, dy, 4.6, 8.5, rot * 0.6, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#22c55e';
        ctx.beginPath();
        ctx.ellipse(dx * 0.7 - 1, dy - 1, 2.4, 6.5, rot * 0.6, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
      break;
    }
    case 'flowers': {
      ellipse(ctx, x + TILE / 2, y + TILE - 4, 11, 4.5, 'rgba(15,23,42,0.2)');
      ctx.fillStyle = vgrad(ctx, y + 22, y + 33, '#f8fafc', '#cbd5e1');
      rr(ctx, x + 10, y + 22, 16, 11, 4);
      ctx.fill();
      ctx.strokeStyle = '#16a34a';
      ctx.lineWidth = 1.5;
      for (let i = 0; i < 5; i++) {
        const bx = x + 18 + (i - 2) * 5 + sway * 0.8;
        const by = y + 8 + Math.abs(i - 2) * 2.2;
        ctx.beginPath();
        ctx.moveTo(x + 18, y + 23);
        ctx.quadraticCurveTo(x + 18 + (i - 2) * 2, y + 16, bx, by + 2);
        ctx.stroke();
        const bloom = col ?? FLOWER_COLORS[(i + Math.floor(seed * 6)) % 6];
        for (let p = 0; p < 5; p++) {
          const a = (p / 5) * Math.PI * 2 + i;
          disc(ctx, bx + Math.cos(a) * 2.6, by + Math.sin(a) * 2.6, 2.1, bloom);
        }
        disc(ctx, bx, by, 1.6, '#fbbf24');
      }
      break;
    }
    case 'tree': {
      ellipse(ctx, x + TILE / 2, y + H - 4, 13, 5, 'rgba(15,23,42,0.22)');
      ctx.fillStyle = vgrad(ctx, y + H - 18, y + H - 2, '#475569', '#334155');
      rr(ctx, x + 9, y + H - 19, 18, 17, 4);
      ctx.fill();
      ctx.fillStyle = '#6b4a2b';
      ctx.fillRect(x + 16, y + H - 36, 4, 18);
      const blobs = [[18, -4, 12], [8, 6, 9], [28, 6, 9], [18, 14, 10], [10, 20, 8], [26, 20, 8], [18, 1, 8]] as const;
      for (const [dx, dy, r] of blobs) {
        const ox = sway * (1 + (H - dy) / 60) * 0.6;
        disc(ctx, x + dx + ox, y + dy + 6, r, '#15803d');
        disc(ctx, x + dx + ox - 2, y + dy + 4, r * 0.62, '#22a45a');
        disc(ctx, x + dx + ox - 3, y + dy + 2, r * 0.3, '#4ade80');
      }
      break;
    }
    case 'sofa': {
      softShadow(ctx, x, y, W, H, 10);
      const base = col ?? SOFA_COLORS[Math.floor(seed * SOFA_COLORS.length)];
      ctx.fillStyle = shade(base, -0.25);
      rr(ctx, x + 1, y + 2, W - 2, H - 4, 10);
      ctx.fill();
      ctx.fillStyle = base;
      rr(ctx, x + 1, y + 2, W - 2, H - 12, 10);
      ctx.fill();
      for (let i = 0; i < w; i++) {
        ctx.fillStyle = shade(base, 0.12);
        rr(ctx, x + 8 + i * TILE, y + 8, TILE - 7, H - 16, 7);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.18)';
        rr(ctx, x + 10 + i * TILE, y + 9, TILE - 11, 3, 2);
        ctx.fill();
      }
      ctx.fillStyle = shade(base, -0.12);
      rr(ctx, x, y + 5, 8, H - 8, 5);
      ctx.fill();
      rr(ctx, x + W - 8, y + 5, 8, H - 8, 5);
      ctx.fill();
      // a throw pillow
      ctx.save();
      ctx.translate(x + W - 17, y + 16);
      ctx.rotate(0.35);
      ctx.fillStyle = seed > 0.5 ? '#fbbf24' : '#f8fafc';
      rr(ctx, -6, -6, 12, 12, 3);
      ctx.fill();
      ctx.strokeStyle = 'rgba(15,23,42,0.18)';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.restore();
      break;
    }
    case 'beanbag': {
      ellipse(ctx, x + TILE / 2, y + TILE - 6, 13, 5, 'rgba(15,23,42,0.2)');
      const c = col ?? BEAN_COLORS[Math.floor(seed * BEAN_COLORS.length)];
      const g = ctx.createRadialGradient(x + 14, y + 14, 2, x + 18, y + 20, 16);
      g.addColorStop(0, shade(c, 0.3));
      g.addColorStop(1, shade(c, -0.15));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(x + 18, y + 21, 13, 11, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = shade(c, -0.3);
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(x + 11, y + 17);
      ctx.quadraticCurveTo(x + 18, y + 22, x + 25, y + 17);
      ctx.stroke();
      break;
    }
    case 'shelf': {
      softShadow(ctx, x, y, W, H, 5);
      ctx.fillStyle = col ?? '#7d5532';
      rr(ctx, x + 1, y + 1, W - 2, H - 2, 5);
      ctx.fill();
      ctx.fillStyle = dark ? '#2a2230' : '#3a2a1e';
      ctx.fillRect(x + 4, y + 4, W - 8, H - 11);
      const cols = ['#ef4444', '#3b82f6', '#f59e0b', '#10b981', '#8b5cf6', '#ec4899', '#14b8a6'];
      let bx = x + 5;
      let i = 0;
      while (bx < x + W - 11) {
        const bw = 3 + Math.floor(h2(i, item.x * 3 + item.y) * 3);
        const bh = 11 + Math.floor(h2(item.x, i + 4) * 8);
        ctx.fillStyle = cols[Math.floor(h2(i, 77 + item.x) * cols.length)];
        ctx.fillRect(bx, y + 4 + (21 - bh), bw, bh);
        ctx.fillStyle = 'rgba(255,255,255,0.25)';
        ctx.fillRect(bx, y + 4 + (21 - bh), 1, bh);
        bx += bw + 1;
        i++;
      }
      // a little plant on the end
      disc(ctx, x + W - 10, y + 12, 3.4, '#22c55e');
      ctx.fillStyle = '#c9683f';
      ctx.fillRect(x + W - 12.5, y + 14, 5, 5);
      ctx.fillStyle = '#9a6b42';
      ctx.fillRect(x + 4, y + 25, W - 8, 2);
      break;
    }
    case 'whiteboard': {
      softShadow(ctx, x, y, W, H, 4);
      ctx.fillStyle = '#94a3b8';
      rr(ctx, x + 1, y + 1, W - 2, H - 4, 4);
      ctx.fill();
      ctx.fillStyle = '#f8fafc';
      rr(ctx, x + 4, y + 4, W - 8, H - 11, 3);
      ctx.fill();
      ctx.fillStyle = 'rgba(15,23,42,0.06)';
      ctx.fillRect(x + 5, y + 5, W - 10, 3);
      // sticky notes and a little diagram
      const notes = ['#fde047', '#fb7185', '#7dd3fc'];
      notes.forEach((c, i) => {
        ctx.save();
        ctx.translate(x + 12 + i * 11, y + 11);
        ctx.rotate((i - 1) * 0.12);
        ctx.fillStyle = c;
        ctx.fillRect(-4, -4, 8, 8);
        ctx.restore();
      });
      ctx.strokeStyle = '#2563eb';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(x + W - 28, y + 8, 8, 6);
      ctx.strokeRect(x + W - 15, y + 8, 8, 6);
      ctx.beginPath();
      ctx.moveTo(x + W - 20, y + 11);
      ctx.lineTo(x + W - 15, y + 11);
      ctx.stroke();
      ctx.fillStyle = '#64748b';
      ctx.fillRect(x + W / 2 - 8, y + H - 8, 16, 3);
      break;
    }
    case 'lamp': {
      ellipse(ctx, x + TILE / 2, y + TILE - 5, 8, 3, 'rgba(15,23,42,0.22)');
      ctx.fillStyle = '#475569';
      ctx.fillRect(x + TILE / 2 - 1, y + 14, 2.5, 18);
      ctx.fillStyle = '#334155';
      rr(ctx, x + TILE / 2 - 6, y + 30, 12, 3, 1.5);
      ctx.fill();
      ctx.fillStyle = col ?? '#fcd34d';
      ctx.beginPath();
      ctx.moveTo(x + TILE / 2 - 9, y + 16);
      ctx.lineTo(x + TILE / 2 + 9, y + 16);
      ctx.lineTo(x + TILE / 2 + 5, y + 4);
      ctx.lineTo(x + TILE / 2 - 5, y + 4);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.45)';
      ctx.fillRect(x + TILE / 2 - 4, y + 6, 3, 9);
      break;
    }
    case 'coffee': {
      softShadow(ctx, x, y, W, H, 5);
      ctx.fillStyle = '#1f2937';
      rr(ctx, x + 6, y + 3, TILE - 12, TILE - 6, 5);
      ctx.fill();
      ctx.fillStyle = '#374151';
      rr(ctx, x + 6, y + 3, TILE - 12, 8, 5);
      ctx.fill();
      disc(ctx, x + 12, y + 8, 1.6, Math.floor(t / 700) % 2 ? '#22c55e' : '#166534');
      disc(ctx, x + 18, y + 8, 1.6, '#ef4444');
      ctx.fillStyle = '#9ca3af';
      ctx.fillRect(x + 16, y + 13, 4, 4);
      ctx.fillStyle = '#f8fafc';
      rr(ctx, x + 13, y + 20, 10, 8, 2);
      ctx.fill();
      ellipse(ctx, x + 18, y + 21, 4, 1.2, '#6b3f1d');
      steam(ctx, x + 18, y + 18, t, seed, dark);
      break;
    }
    case 'bin': {
      ellipse(ctx, x + TILE / 2, y + 30, 9, 3, 'rgba(15,23,42,0.2)');
      ctx.fillStyle = vgrad(ctx, y + 11, y + 29, '#94a3b8', '#64748b');
      ctx.beginPath();
      ctx.moveTo(x + 10, y + 12);
      ctx.lineTo(x + 26, y + 12);
      ctx.lineTo(x + 24, y + 29);
      ctx.lineTo(x + 12, y + 29);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#cbd5e1';
      rr(ctx, x + 8.5, y + 9, 19, 4, 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(15,23,42,0.18)';
      ctx.lineWidth = 1;
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.moveTo(x + 15 + i * 3, y + 15);
        ctx.lineTo(x + 15.5 + i * 2.6, y + 27);
        ctx.stroke();
      }
      break;
    }
    case 'tv': {
      softShadow(ctx, x, y, W, H, 4);
      ctx.fillStyle = '#0b1220';
      rr(ctx, x + 2, y + 2, W - 4, H - 11, 4);
      ctx.fill();
      const hue = (t / 40 + seed * 360) % 360;
      ctx.fillStyle = vgrad(ctx, y + 4, y + H - 11, `hsl(${hue},70%,45%)`, `hsl(${(hue + 60) % 360},70%,35%)`);
      rr(ctx, x + 4, y + 4, W - 8, H - 15, 3);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      for (let i = 0; i < 6; i++) {
        const bh = 3 + (Math.sin(t / 300 + i * 1.3) + 1) * 4;
        ctx.fillRect(x + 10 + i * ((W - 24) / 6), y + H - 13 - bh, 5, bh);
      }
      ctx.fillStyle = '#334155';
      ctx.fillRect(x + W / 2 - 2, y + H - 9, 4, 5);
      rr(ctx, x + W / 2 - 10, y + H - 5, 20, 3, 1.5);
      ctx.fill();
      break;
    }
    case 'printer': {
      softShadow(ctx, x, y, W, H, 5);
      ctx.fillStyle = '#cbd5e1';
      rr(ctx, x + 5, y + 10, TILE - 10, 18, 4);
      ctx.fill();
      ctx.fillStyle = '#e2e8f0';
      rr(ctx, x + 5, y + 10, TILE - 10, 7, 4);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(x + 10, y + 4, TILE - 20, 8);
      ctx.fillStyle = '#94a3b8';
      ctx.fillRect(x + 12, y + 6, 12, 1);
      ctx.fillRect(x + 12, y + 8.5, 8, 1);
      ctx.fillStyle = '#334155';
      ctx.fillRect(x + 9, y + 21, TILE - 18, 2);
      disc(ctx, x + TILE - 10, y + 14, 1.5, Math.floor(t / 500) % 3 ? '#22c55e' : '#14532d');
      break;
    }
    case 'cooler': {
      softShadow(ctx, x, y, W, H, 5);
      ctx.fillStyle = '#e2e8f0';
      rr(ctx, x + 9, y + 12, 18, 21, 4);
      ctx.fill();
      ctx.fillStyle = 'rgba(96,165,250,0.85)';
      rr(ctx, x + 11, y - 1, 14, 15, 6);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.45)';
      rr(ctx, x + 13, y + 1, 3, 9, 1.5);
      ctx.fill();
      ctx.fillStyle = '#3b82f6';
      ctx.fillRect(x + 14, y + 19, 3, 3);
      ctx.fillStyle = '#ef4444';
      ctx.fillRect(x + 20, y + 19, 3, 3);
      ctx.fillStyle = '#f8fafc';
      rr(ctx, x + 14, y + 25, 8, 6, 1.5);
      ctx.fill();
      break;
    }
  }
}

// ---------- more objects (decor, plants, tech, things for desks) ----------

function pot(ctx: Ctx, x: number, y: number, col: string | undefined) {
  ctx.fillStyle = vgrad(ctx, y + 23, y + 33, col ? shade(col, 0.1) : '#d27a4d', col ? shade(col, -0.2) : '#b5593a');
  ctx.beginPath();
  ctx.moveTo(x + 10, y + 23);
  ctx.lineTo(x + 26, y + 23);
  ctx.lineTo(x + 24, y + 33);
  ctx.lineTo(x + 12, y + 33);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = col ? shade(col, -0.05) : '#c9683f';
  rr(ctx, x + 8.5, y + 21, 19, 4, 2);
  ctx.fill();
}

/** Returns true when it drew the item (so the main switch can skip it). */
function drawExtra(ctx: Ctx, item: Item, dark: boolean, t: number, col: string | undefined, x: number, y: number, W: number, H: number, seed: number): boolean {
  const sway = Math.sin(t / 900 + seed * 6.28);
  const cx = x + W / 2;
  const cy = y + H / 2;
  switch (item.t) {
    case 'bike': {
      // a parked bike faces the way it was left (rotation 1 means facing left)
      bikeSprite(ctx, cx, cy + 4, 'side', item.r === 1 ? -1 : 1, 0, col);
      return true;
    }
    case 'kart': {
      kartSprite(ctx, cx, cy + 4, 'side', item.r === 1 ? -1 : 1, 0, col, 'under');
      kartSprite(ctx, cx, cy + 4, 'side', item.r === 1 ? -1 : 1, 0, col, 'over');
      return true;
    }
    case 'wallclock': {
      // a row of digital clocks, one for each place
      const zs = officeInfo.zones.length ? officeInfo.zones : DEFAULT_ZONES;
      const n = zs.length;
      ctx.fillStyle = dark ? '#2f2216' : '#8a5a2b';
      rr(ctx, x + 2, y + 3, W - 4, H - 6, 7);
      ctx.fill();
      const now = Date.now();
      const slot = (W - 12) / n;
      for (let i = 0; i < n; i++) {
        const sx = x + 6 + i * slot;
        ctx.fillStyle = '#0b1220';
        rr(ctx, sx + 1.5, y + 6, slot - 3, H - 12, 4);
        ctx.fill();
        ctx.strokeStyle = '#3b2a18';
        ctx.lineWidth = 1;
        rr(ctx, sx + 1.5, y + 6, slot - 3, H - 12, 4);
        ctx.stroke();
        const { h, m, s } = zoneParts(zs[i], now);
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = '700 7px system-ui, sans-serif';
        ctx.fillStyle = '#fbbf24';
        const t12 = to12h(h);
        ctx.fillText(zoneAbbr(zs[i], now), sx + slot / 2, y + 11.5);
        const colon = s % 2 === 0 ? ':' : ' ';
        const main = t12.h12 + colon + String(m).padStart(2, '0');
        ctx.font = '700 ' + (n === 3 ? 12 : 15) + 'px ui-monospace, Menlo, Consolas, monospace';
        const mw = ctx.measureText(main).width;
        ctx.font = '700 8px system-ui, sans-serif';
        const ampm = t12.pm ? 'PM' : 'AM';
        const aw = ctx.measureText(ampm).width;
        const x0 = sx + slot / 2 - (mw + aw + 2) / 2;
        ctx.textAlign = 'left';
        ctx.font = '700 ' + (n === 3 ? 12 : 15) + 'px ui-monospace, Menlo, Consolas, monospace';
        ctx.fillStyle = '#34d399';
        ctx.shadowColor = 'rgba(52,211,153,0.7)';
        ctx.shadowBlur = 5;
        ctx.fillText(main, x0, y + 23);
        ctx.shadowBlur = 0;
        ctx.font = '700 8px system-ui, sans-serif';
        ctx.fillStyle = '#fbbf24';
        ctx.fillText(ampm, x0 + mw + 2, y + 25);
      }
      return true;
    }
    case 'valueswall': {
      ctx.fillStyle = vgrad(ctx, y, y + H, '#24325c', '#162040');
      rr(ctx, x + 2, y + 3, W - 4, H - 6, 6);
      ctx.fill();
      ctx.strokeStyle = '#e0b04a';
      ctx.lineWidth = 2;
      rr(ctx, x + 3, y + 4, W - 6, H - 8, 5);
      ctx.stroke();
      const title = (officeInfo.titles[item.id] ?? 'Our core values').toUpperCase().slice(0, 26);
      ctx.font = '800 9px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#f6d98a';
      ctx.fillText(title, x + W / 2, y + 14);
      ['#f59e0b', '#10b981', '#3b82f6', '#ec4899', '#8b5cf6'].forEach((c, i) => {
        const px = x + W / 2 + (i - 2) * 16;
        ctx.fillStyle = c;
        ctx.beginPath();
        ctx.moveTo(px, y + 21);
        ctx.lineTo(px + 4, y + 25);
        ctx.lineTo(px, y + 29);
        ctx.lineTo(px - 4, y + 25);
        ctx.closePath();
        ctx.fill();
      });
      // a soft shine that slides across now and then
      const sx = ((t / 3200) % 1.6 - 0.3) * W;
      const g = ctx.createLinearGradient(x + sx - 14, y, x + sx + 14, y);
      g.addColorStop(0, 'rgba(255,255,255,0)');
      g.addColorStop(0.5, 'rgba(255,255,255,0.2)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      rr(ctx, x + 3, y + 4, W - 6, H - 8, 5);
      ctx.fill();
      return true;
    }
    case 'noticeboard': {
      ctx.fillStyle = '#7a4b22';
      rr(ctx, x + 2, y + 3, W - 4, H - 6, 5);
      ctx.fill();
      ctx.fillStyle = '#cf9a5a';
      rr(ctx, x + 5, y + 6, W - 10, H - 12, 3);
      ctx.fill();
      const notes = ['#fde68a', '#bfdbfe', '#fbcfe8', '#bbf7d0', '#fed7aa'];
      for (let i = 0; i < 5; i++) {
        const nx = x + 10 + i * ((W - 28) / 5);
        const ny = y + 9 + (i % 2) * 4;
        ctx.save();
        ctx.translate(nx + 7, ny + 7);
        ctx.rotate(Math.sin(t / 1400 + i * 1.7) * 0.05 + (i - 2) * 0.03);
        ctx.fillStyle = notes[i];
        ctx.fillRect(-7, -7, 14, 13);
        ctx.fillStyle = 'rgba(15,23,42,0.35)';
        ctx.fillRect(-5, -3, 10, 1);
        ctx.fillRect(-5, 0, 7, 1);
        disc(ctx, 0, -6, 1.3, '#dc2626');
        ctx.restore();
      }
      return true;
    }
    // --- things that sit on a desk or table ---
    case 'laptop': {
      ctx.fillStyle = 'rgba(15,23,42,0.18)';
      rr(ctx, x + 6, y + 24, 25, 4, 2);
      ctx.fill();
      ctx.fillStyle = col ? shade(col, -0.3) : '#475569';
      rr(ctx, x + 5, y + 16, 26, 10, 3);
      ctx.fill();
      ctx.fillStyle = '#cbd5e1';
      ctx.fillRect(x + 8, y + 19, 20, 5);
      ctx.fillStyle = col ?? '#1e293b';
      rr(ctx, x + 8, y + 3, 20, 14, 2);
      ctx.fill();
      ctx.fillStyle = vgrad(ctx, y + 5, y + 16, '#38bdf8', '#818cf8');
      rr(ctx, x + 9.5, y + 4.5, 17, 11, 1.5);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      for (let i = 0; i < 3; i++) ctx.fillRect(x + 11, y + 6.5 + i * 3, 4 + h2(Math.floor(t / 1300) + i, 4) * 9, 1.3);
      break;
    }
    case 'books': {
      const cs = col ? [col, shade(col, 0.3), shade(col, -0.25)] : ['#ef4444', '#3b82f6', '#22c55e'];
      for (let i = 0; i < 3; i++) {
        ctx.fillStyle = 'rgba(15,23,42,0.2)';
        rr(ctx, x + 7 + i * 1.5, y + 24 - i * 5, 22, 5.5, 1.5);
        ctx.fill();
        ctx.fillStyle = cs[i];
        rr(ctx, x + 6 + i * 1.5, y + 22 - i * 5, 22, 5.5, 1.5);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.6)';
        ctx.fillRect(x + 8 + i * 1.5, y + 23.5 - i * 5, 18, 1.2);
      }
      break;
    }
    case 'plate': {
      ellipse(ctx, x + 18, y + 25, 12, 5, 'rgba(15,23,42,0.2)');
      ellipse(ctx, x + 18, y + 20, 12, 7, '#f8fafc');
      ellipse(ctx, x + 18, y + 20, 8.5, 4.8, '#e2e8f0');
      disc(ctx, x + 15, y + 19.5, 2.6, '#ef4444');
      disc(ctx, x + 20.5, y + 20.5, 2.4, '#fbbf24');
      disc(ctx, x + 18.5, y + 17.8, 1.8, '#22c55e');
      ctx.strokeStyle = '#94a3b8';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(x + 5, y + 14);
      ctx.lineTo(x + 5, y + 26);
      ctx.moveTo(x + 31, y + 14);
      ctx.lineTo(x + 31, y + 26);
      ctx.stroke();
      break;
    }
    case 'globe': {
      ellipse(ctx, x + 18, y + 27, 8, 2.5, 'rgba(15,23,42,0.22)');
      ctx.fillStyle = '#475569';
      rr(ctx, x + 12, y + 24, 12, 3, 1.5);
      ctx.fill();
      ctx.strokeStyle = col ?? '#b45309';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(x + 18, y + 14, 11.5, Math.PI * 0.55, Math.PI * 1.35);
      ctx.stroke();
      const g = ctx.createRadialGradient(x + 15, y + 11, 1, x + 18, y + 14, 10);
      g.addColorStop(0, '#7dd3fc');
      g.addColorStop(1, '#0ea5e9');
      disc(ctx, x + 18, y + 14, 9.5, g);
      ctx.save();
      ctx.beginPath();
      ctx.arc(x + 18, y + 14, 9.5, 0, Math.PI * 2);
      ctx.clip();
      ctx.fillStyle = '#4ade80';
      const spin = (t / 90) % 40;
      for (const [bx, by, r] of [[0, 8, 5], [9, 15, 4], [20, 10, 6], [30, 17, 4]] as const) {
        const px = x + 6 + ((bx - spin + 80) % 40);
        ellipse(ctx, px, y + by + 3, r, r * 0.8, '#4ade80');
      }
      ctx.restore();
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.ellipse(x + 18, y + 14, 4.5, 9.5, 0, 0, Math.PI * 2);
      ctx.stroke();
      break;
    }
    case 'trophy': {
      ellipse(ctx, x + 18, y + 27, 8, 2.5, 'rgba(15,23,42,0.2)');
      ctx.fillStyle = '#92400e';
      rr(ctx, x + 11, y + 23, 14, 4, 1.5);
      ctx.fill();
      ctx.fillStyle = vgrad(ctx, y + 6, y + 22, '#fde047', '#d97706');
      ctx.beginPath();
      ctx.moveTo(x + 11, y + 7);
      ctx.lineTo(x + 25, y + 7);
      ctx.quadraticCurveTo(x + 25, y + 18, x + 18, y + 19);
      ctx.quadraticCurveTo(x + 11, y + 18, x + 11, y + 7);
      ctx.fill();
      ctx.fillRect(x + 16.5, y + 18, 3, 5);
      ctx.strokeStyle = '#d97706';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(x + 10.5, y + 11, 3, Math.PI * 0.5, Math.PI * 1.5);
      ctx.arc(x + 25.5, y + 11, 3, Math.PI * 1.5, Math.PI * 0.5);
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.fillRect(x + 13.5, y + 8, 2, 7);
      break;
    }
    case 'headphones': {
      ctx.strokeStyle = col ?? '#1f2937';
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.arc(x + 18, y + 20, 9, Math.PI * 1.05, Math.PI * 1.95);
      ctx.stroke();
      ctx.fillStyle = col ? shade(col, -0.2) : '#111827';
      rr(ctx, x + 6, y + 17, 6, 10, 3);
      ctx.fill();
      rr(ctx, x + 24, y + 17, 6, 10, 3);
      ctx.fill();
      ctx.fillStyle = '#ef4444';
      ctx.fillRect(x + 7.5, y + 20, 3, 1.5);
      ctx.fillRect(x + 25.5, y + 20, 3, 1.5);
      break;
    }
    case 'pizza': {
      ctx.fillStyle = 'rgba(15,23,42,0.2)';
      rr(ctx, x + 6, y + 9, 25, 20, 2);
      ctx.fill();
      ctx.fillStyle = '#e9d5a8';
      rr(ctx, x + 5, y + 7, 25, 20, 2);
      ctx.fill();
      disc(ctx, x + 17.5, y + 17, 8.5, '#fbbf24');
      disc(ctx, x + 17.5, y + 17, 7, '#f59e0b');
      for (const [px, py] of [[14, 14], [20, 15], [16, 20], [21, 20], [18, 12]] as const) disc(ctx, x + px, y + py, 1.7, '#dc2626');
      ctx.fillStyle = '#16a34a';
      ctx.fillRect(x + 17, y + 17, 2, 1.5);
      break;
    }
    // --- floor ---
    case 'mat': {
      const base = col ?? ['#e5484d', '#3b82f6', '#14b8a6', '#a855f7'][Math.floor(seed * 4)];
      ctx.fillStyle = 'rgba(15,23,42,0.13)';
      rr(ctx, x + 3, y + 8, W - 4, H - 10, 8);
      ctx.fill();
      ctx.fillStyle = base;
      rr(ctx, x + 2, y + 5, W - 4, H - 10, 8);
      ctx.fill();
      ctx.strokeStyle = shade(base, 0.55);
      ctx.lineWidth = 2;
      rr(ctx, x + 7, y + 10, W - 14, H - 20, 5);
      ctx.stroke();
      ctx.strokeStyle = shade(base, -0.25);
      ctx.lineWidth = 1;
      for (let i = 0; i < 9; i++) {
        ctx.beginPath();
        ctx.moveTo(x + 14 + i * 5.5, y + 13);
        ctx.lineTo(x + 14 + i * 5.5, y + H - 13);
        ctx.stroke();
      }
      break;
    }
    // --- plants and garden ---
    case 'balloons': {
      const cs = col ? [col, shade(col, 0.3), shade(col, -0.2)] : ['#f472b6', '#fbbf24', '#60a5fa'];
      ellipse(ctx, x + 18, y + 32, 5, 1.8, 'rgba(15,23,42,0.25)');
      [[-9, 0], [0, -4], [9, 1]].forEach(([dx, dy], i) => {
        const bx = x + 18 + dx + sway * 1.6 * (i % 2 ? 1 : -1);
        const by = y + 12 + dy;
        ctx.strokeStyle = 'rgba(100,116,139,0.85)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x + 18, y + 31);
        ctx.quadraticCurveTo(x + 18 + dx * 0.4, y + 23, bx, by + 8);
        ctx.stroke();
        ellipse(ctx, bx, by, 6, 7.5, cs[i]);
        ellipse(ctx, bx - 2, by - 2.5, 1.8, 2.6, 'rgba(255,255,255,0.55)');
      });
      break;
    }
    case 'cactus': {
      ellipse(ctx, x + 18, y + 33, 11, 4, 'rgba(15,23,42,0.2)');
      pot(ctx, x, y, col);
      ctx.fillStyle = vgrad(ctx, y + 6, y + 24, '#4ade80', '#15803d');
      rr(ctx, x + 14, y + 7, 8, 18, 4);
      ctx.fill();
      rr(ctx, x + 7, y + 15, 8, 4, 2);
      ctx.fill();
      rr(ctx, x + 7, y + 11, 4, 9, 2);
      ctx.fill();
      rr(ctx, x + 21, y + 13, 8, 4, 2);
      ctx.fill();
      rr(ctx, x + 25, y + 9, 4, 9, 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.7)';
      ctx.lineWidth = 0.8;
      for (let i = 0; i < 5; i++) {
        ctx.beginPath();
        ctx.moveTo(x + 18, y + 10 + i * 3);
        ctx.lineTo(x + 20.5, y + 9 + i * 3);
        ctx.moveTo(x + 18, y + 11 + i * 3);
        ctx.lineTo(x + 15.5, y + 10 + i * 3);
        ctx.stroke();
      }
      disc(ctx, x + 18, y + 6, 2.6, '#f472b6');
      disc(ctx, x + 18, y + 6, 1, '#fde047');
      break;
    }
    case 'bamboo': {
      ellipse(ctx, cx, y + H - 4, 12, 4.5, 'rgba(15,23,42,0.2)');
      pot(ctx, x, y + H - 36, col ?? '#475569');
      for (let s = 0; s < 4; s++) {
        const sx = x + 12 + s * 4.2;
        const top = y + 4 + (s % 2) * 7;
        const lean = sway * (1.5 + s * 0.3);
        ctx.strokeStyle = s % 2 ? '#65a30d' : '#84cc16';
        ctx.lineWidth = 3.2;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(sx, y + H - 14);
        ctx.lineTo(sx + lean, top);
        ctx.stroke();
        ctx.strokeStyle = '#365314';
        ctx.lineWidth = 1;
        for (let r = top + 8; r < y + H - 16; r += 11) {
          ctx.beginPath();
          ctx.moveTo(sx - 1.6 + lean * ((r - top) / (y + H - 14 - top)) * 0.0, r);
          ctx.lineTo(sx + 1.6, r);
          ctx.stroke();
        }
        ctx.fillStyle = '#4d7c0f';
        ellipse(ctx, sx + lean + 4, top + 5, 5, 1.8, '#4d7c0f', 0.5);
        ellipse(ctx, sx + lean - 4, top + 10, 5, 1.8, '#65a30d', -0.5);
      }
      break;
    }
    case 'palm': {
      ellipse(ctx, cx, y + H - 4, 13, 5, 'rgba(15,23,42,0.22)');
      ctx.strokeStyle = '#92400e';
      ctx.lineWidth = 5;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(cx, y + H - 8);
      ctx.quadraticCurveTo(cx + 5, y + H * 0.45, cx + 2 + sway * 1.5, y + 14);
      ctx.stroke();
      ctx.strokeStyle = '#b45309';
      ctx.lineWidth = 1;
      for (let i = 0; i < 6; i++) { ctx.beginPath(); ctx.moveTo(cx - 2, y + 18 + i * 8); ctx.lineTo(cx + 5, y + 18 + i * 8); ctx.stroke(); }
      const hx = cx + 2 + sway * 1.5;
      for (let i = 0; i < 7; i++) {
        const ang = (i / 7) * Math.PI * 2 + sway * 0.06;
        ctx.save();
        ctx.translate(hx, y + 14);
        ctx.rotate(ang);
        ctx.fillStyle = i % 2 ? '#16a34a' : '#22c55e';
        ctx.beginPath();
        ctx.ellipse(13, 0, 14, 3.6, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
      disc(ctx, hx, y + 15, 2.6, '#92400e');
      break;
    }
    case 'hedge': {
      softShadow(ctx, x, y, W, H, 8);
      ctx.fillStyle = '#166534';
      rr(ctx, x + 1, y + 6, W - 2, H - 9, 9);
      ctx.fill();
      for (let i = 0; i < 26; i++) {
        const px = x + 4 + h2(i, 3) * (W - 8);
        const py = y + 7 + h2(8, i) * (H - 16);
        disc(ctx, px, py, 3.2 + h2(i, 5) * 2.6, i % 3 ? '#22a45a' : '#4ade80');
      }
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      rr(ctx, x + 5, y + 8, W - 10, 3, 2);
      ctx.fill();
      break;
    }
    case 'fountain': {
      const R = Math.min(W, H) / 2;
      ellipse(ctx, cx, cy + 4, R, R * 0.92, 'rgba(15,23,42,0.18)');
      disc(ctx, cx, cy, R - 2, '#cbd5e1');
      disc(ctx, cx, cy, R - 7, '#94a3b8');
      const wg = ctx.createRadialGradient(cx - 8, cy - 8, 4, cx, cy, R - 9);
      wg.addColorStop(0, '#bae6fd');
      wg.addColorStop(1, '#38bdf8');
      disc(ctx, cx, cy, R - 10, wg);
      for (let k = 0; k < 4; k++) {
        const ph = ((t / 55 + k * 11) % 44) / 44;
        ctx.strokeStyle = `rgba(255,255,255,${0.6 * (1 - ph)})`;
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.arc(cx, cy, 10 + ph * (R - 22), 0, Math.PI * 2);
        ctx.stroke();
      }
      disc(ctx, cx, cy, 11, '#cbd5e1');
      disc(ctx, cx, cy, 7, '#e2e8f0');
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2;
        const ph = ((t / 420 + i * 0.13) % 1);
        const rr2 = 6 + ph * 22;
        ctx.fillStyle = `rgba(255,255,255,${0.9 * (1 - ph)})`;
        ctx.beginPath();
        ctx.arc(cx + Math.cos(a) * rr2, cy + Math.sin(a) * rr2, 1.8, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case 'pond': {
      drawPondItem(ctx, x, y, W, H, t, seed);
      break;
    }
    case 'waterfall': {
      softShadow(ctx, x, y, W, H, 6);
      // the rock face
      ctx.fillStyle = '#6b6560';
      rr(ctx, x + 2, y + 2, W - 4, H * 0.66, 9);
      ctx.fill();
      for (const [rx2, ry2, rw, rh, rc] of [[0.1, 0.05, 0.34, 0.3, '#857d77'], [0.58, 0.04, 0.3, 0.34, '#7a726c'], [0.04, 0.34, 0.28, 0.26, '#74706a'], [0.7, 0.36, 0.26, 0.24, '#8a827b']] as const) {
        ctx.fillStyle = rc;
        rr(ctx, x + W * rx2, y + H * ry2, W * rw, H * rh, 6);
        ctx.fill();
      }
      ctx.fillStyle = '#4d7c0f';
      for (let i = 0; i < 6; i++) disc(ctx, x + 8 + i * (W - 16) / 5, y + 5 + (i % 2) * 2, 4 + (i % 3), '#4d7c0f');
      // the falling water
      const wx0 = x + W * 0.3, ww = W * 0.4;
      ctx.fillStyle = vgrad(ctx, y + 8, y + H * 0.8, '#e0f2fe', '#7dd3fc');
      rr(ctx, wx0, y + 8, ww, H * 0.74, 5);
      ctx.fill();
      ctx.lineWidth = 1.8;
      ctx.lineCap = 'round';
      for (let i = 0; i < 9; i++) {
        const sx = wx0 + 4 + (i / 8) * (ww - 8);
        const ph = ((t / 520 + i * 0.37) % 1);
        const y1 = y + 10 + ph * (H * 0.6);
        ctx.strokeStyle = `rgba(255,255,255,${0.9 - ph * 0.3})`;
        ctx.beginPath(); ctx.moveTo(sx, y1); ctx.lineTo(sx, y1 + 11); ctx.stroke();
      }
      // the pool at the bottom, with foam and rising mist
      const py = y + H * 0.86;
      ctx.fillStyle = '#0e7490';
      ctx.beginPath(); ctx.ellipse(cx, py, W * 0.44, H * 0.13, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#38bdf8';
      ctx.beginPath(); ctx.ellipse(cx, py - 1, W * 0.4, H * 0.1, 0, 0, Math.PI * 2); ctx.fill();
      for (let k = 0; k < 6; k++) {
        const ph = ((t / 700 + k / 6) % 1);
        ctx.fillStyle = `rgba(255,255,255,${0.75 * (1 - ph)})`;
        ctx.beginPath(); ctx.ellipse(cx + (k - 2.5) * 7, py - 2, 5 + ph * 5, 2 + ph * 2, 0, 0, Math.PI * 2); ctx.fill();
      }
      for (let k = 0; k < 7; k++) {
        const ph = ((t / 1600 + k * 0.17) % 1);
        ctx.fillStyle = `rgba(255,255,255,${0.28 * (1 - ph)})`;
        ctx.beginPath(); ctx.arc(cx + (k - 3) * 6 + Math.sin(t / 700 + k) * 3, py - 6 - ph * 22, 4 + ph * 6, 0, Math.PI * 2); ctx.fill();
      }
      break;
    }
    case 'sea': {
      drawSeaItem(ctx, x, y, W, H, t, seed);
      break;
    }
    case 'sand': {
      drawSandItem(ctx, x, y, W, H, seed);
      break;
    }
    case 'dogball': {
      drawDogBall(ctx, x, y, W, H, t, seed);
      break;
    }
    case 'gametable': { drawGameTable(ctx, x, y, W, H, t, seed); break; }
    case 'gong': { drawGong(ctx, x, y, W, H, t, seed); break; }
    case 'standingdesk': { drawStandingDesk(ctx, x, y, W, H, t, seed, col); break; }
    case 'execdesk': { drawExecDesk(ctx, x, y, W, H, col); break; }
    case 'cornerdesk': { drawCornerDesk(ctx, x, y, W, H, col); break; }
    case 'dualmonitor': { drawMonitors(ctx, x, y, t, seed, 2); break; }
    case 'ultrawide': { drawMonitors(ctx, x, y, t, seed, 1); break; }
    case 'barchart': { drawBarChart(ctx, x, y, W, H, t); break; }
    case 'orgchart': { drawOrgChart(ctx, x, y, W, H); break; }
    case 'worldmap': { drawWorldMap(ctx, x, y, W, H, t); break; }
    case 'kanban': { drawKanban(ctx, x, y, W, H, seed); break; }
    case 'sunflowers': case 'orchid': case 'lavender': case 'tulips': case 'monstera': { drawBloom(ctx, item.t, x, y, W, H, t, seed, col); break; }
    case 'filecabinet': { drawFileCabinet(ctx, x, y, W, H, col); break; }
    case 'foosball': { drawFoosball(ctx, x, y, W, H, t, seed); break; }
    case 'tabletennis': { drawTableTennis(ctx, x, y, W, H, t); break; }
    case 'phonebooth': { drawPhoneBooth(ctx, x, y, W, H, t, col); break; }
    case 'arcade': { drawArcade(ctx, x, y, W, H, t, seed); break; }
    case 'pinetree': { drawPine(ctx, x, y, W, H, t, seed); break; }
    case 'campfire': { drawCampfire(ctx, x, y, W, H, t, seed); break; }
    case 'log': { drawLog(ctx, x, y, W, H, seed); break; }
    case 'stump': { drawStump(ctx, x, y, W, H); break; }
    case 'tent': { drawTent(ctx, x, y, W, H, col, t); break; }
    case 'mushrooms': { drawMushrooms(ctx, x, y, W, H, seed); break; }
    case 'firewood': { drawFirewood(ctx, x, y, W, H); break; }
    case 'lantern': { drawLantern(ctx, x, y, W, H, t, seed); break; }
    case 'coffeebar': { drawCoffeeBar(ctx, x, y, W, H, t, seed); break; }
    case 'beachchair': {
      drawBeachChair(ctx, x, y, W, H, col, seed);
      break;
    }
    case 'umbrella': {
      drawUmbrella(ctx, x, y, W, H, col, t, seed);
      break;
    }
    case 'towel': {
      drawTowel(ctx, x, y, W, H, col, seed);
      break;
    }
    case 'sandcastle': {
      drawSandcastle(ctx, x, y, W, H, t, seed);
      break;
    }
    case 'dock': {
      drawDock(ctx, x, y, W, H, t);
      break;
    }
    case 'boat': {
      drawBoat(ctx, x, y, W, H, t, seed);
      break;
    }
    case 'flowerbed': {
      for (let b = 0; b < 3; b++) {
        const sec = t / 1000;
        const bx = x + W / 2 + Math.sin(sec * (0.55 + b * 0.13) + b * 2.1 + seed * 5) * (W * 0.46);
        const by = y + H * 0.1 - 6 + Math.sin(sec * (1.1 + b * 0.2) + b * 1.7) * 7 - (Math.sin(sec * 0.3 + b) + 1) * 9;
        drawButterfly(ctx, bx, by, t, b);
      }
      ctx.fillStyle = '#6b4423';
      rr(ctx, x + 1, y + H * 0.45, W - 2, H * 0.5, 6);
      ctx.fill();
      ctx.fillStyle = '#7c5a36';
      rr(ctx, x + 3, y + H * 0.5, W - 6, 4, 2);
      ctx.fill();
      const heads = ['#f43f5e', '#fbbf24', '#a855f7', '#fb923c', '#f9a8d4', '#38bdf8', '#fde047', '#ef4444', '#c084fc'];
      for (let i = 0; i < 9; i++) {
        const fx2 = x + 7 + i * ((W - 14) / 8);
        const sway = Math.sin(t / 750 + i * 1.3 + seed * 5) * 1.6;
        const top = y + 6 + (i % 3) * 3;
        ctx.strokeStyle = '#16a34a';
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(fx2, y + H * 0.7); ctx.quadraticCurveTo(fx2 + sway * 0.5, (y + H * 0.7 + top) / 2, fx2 + sway, top + 3); ctx.stroke();
        ctx.fillStyle = heads[i % heads.length];
        for (let p = 0; p < 5; p++) { const an = (p / 5) * Math.PI * 2; disc(ctx, fx2 + sway + Math.cos(an) * 2.6, top + Math.sin(an) * 2.6, 2.1, heads[i % heads.length]); }
        disc(ctx, fx2 + sway, top, 1.6, '#fde68a');
      }
      break;
    }
    case 'rocks': {
      ellipse(ctx, cx, y + H - 6, 14, 5, 'rgba(15,23,42,0.22)');
      ellipse(ctx, cx - 5, cy + 5, 9, 7, '#78716c');
      ellipse(ctx, cx + 6, cy + 7, 7, 5.5, '#8a847d');
      ellipse(ctx, cx + 1, cy, 7, 6, '#a29c95');
      ellipse(ctx, cx - 1, cy - 2, 3.4, 2, 'rgba(255,255,255,0.3)');
      ctx.fillStyle = '#4d7c0f';
      disc(ctx, cx - 9, cy + 9, 2, '#4d7c0f');
      break;
    }
    case 'birdbath': {
      ellipse(ctx, cx, y + H - 5, 11, 4, 'rgba(15,23,42,0.2)');
      ctx.fillStyle = '#a8a29e';
      rr(ctx, cx - 4, cy, 8, 15, 3);
      ctx.fill();
      ellipse(ctx, cx, cy - 1, 13, 6, '#d6d3d1');
      ellipse(ctx, cx, cy - 2, 11, 4.6, '#7dd3fc');
      const ph = ((t / 1500 + seed) % 1);
      ctx.strokeStyle = `rgba(255,255,255,${0.6 * (1 - ph)})`;
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.ellipse(cx + 2, cy - 2, 2 + ph * 8, 1 + ph * 3, 0, 0, Math.PI * 2); ctx.stroke();
      // a small bird that hops on and off the rim
      const hop = Math.max(0, Math.sin(t / 900 + seed * 7));
      if (hop > 0.05) {
        const bx = cx - 9, by = cy - 8 - hop * 3;
        ellipse(ctx, bx, by, 4, 3, '#78716c');
        disc(ctx, bx + 3.2, by - 1.6, 2, '#78716c');
        ctx.fillStyle = '#fbbf24';
        ctx.beginPath(); ctx.moveTo(bx + 5, by - 1.6); ctx.lineTo(bx + 7.4, by - 1); ctx.lineTo(bx + 5, by - 0.4); ctx.fill();
      }
      break;
    }
    // --- furniture and decor ---
    case 'stool': {
      ellipse(ctx, cx, y + 31, 10, 4, 'rgba(15,23,42,0.2)');
      const c = col ?? ['#f59e0b', '#0ea5e9', '#ec4899', '#22c55e'][Math.floor(seed * 4)];
      ctx.strokeStyle = '#334155';
      ctx.lineWidth = 2;
      for (const dx of [-6, 6]) { ctx.beginPath(); ctx.moveTo(cx + dx * 0.5, y + 20); ctx.lineTo(cx + dx, y + 31); ctx.stroke(); }
      const g = ctx.createRadialGradient(cx - 3, y + 14, 1, cx, y + 17, 11);
      g.addColorStop(0, shade(c, 0.3));
      g.addColorStop(1, c);
      disc(ctx, cx, y + 18, 10, g);
      break;
    }
    case 'bench': {
      softShadow(ctx, x, y, W, H, 5);
      ctx.fillStyle = '#334155';
      ctx.fillRect(x + 6, y + H - 8, 4, 6);
      ctx.fillRect(x + W - 10, y + H - 8, 4, 6);
      const wood = col ?? '#b07b45';
      for (let i = 0; i < 3; i++) {
        ctx.fillStyle = vgrad(ctx, y + 4 + i * 8, y + 10 + i * 8, shade(wood, 0.2), shade(wood, -0.1));
        rr(ctx, x + 2, y + 4 + i * 7, W - 4, 6, 2);
        ctx.fill();
      }
      break;
    }
    case 'roundtable': {
      const R = Math.min(W, H) / 2;
      ellipse(ctx, cx, cy + 4, R, R * 0.9, 'rgba(15,23,42,0.2)');
      const wood = col ?? '#d8b283';
      disc(ctx, cx, cy, R - 2, shade(wood, -0.3));
      const g = ctx.createRadialGradient(cx - 10, cy - 10, 3, cx, cy, R - 4);
      g.addColorStop(0, shade(wood, 0.45));
      g.addColorStop(1, wood);
      disc(ctx, cx, cy, R - 5, g);
      ctx.fillStyle = '#e2e8f0';
      rr(ctx, cx - 3, cy - 6, 6, 8, 2);
      ctx.fill();
      for (let i = 0; i < 3; i++) disc(ctx, cx + (i - 1) * 3.4 + sway * 0.5, cy - 9 - (i === 1 ? 2 : 0), 2.6, FLOWER_COLORS[(i + Math.floor(seed * 6)) % 6]);
      break;
    }
    case 'piano': {
      softShadow(ctx, x, y, W, H, 12);
      ctx.fillStyle = '#0f172a';
      ctx.beginPath();
      ctx.moveTo(x + 5, y + H - 20);
      ctx.lineTo(x + 5, y + 14);
      ctx.quadraticCurveTo(x + 5, y + 4, x + 20, y + 4);
      ctx.lineTo(x + W - 6, y + 4);
      ctx.quadraticCurveTo(x + W - 4, y + 4, x + W - 4, y + 14);
      ctx.quadraticCurveTo(x + W * 0.55, y + H * 0.45, x + W - 4, y + H - 20);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.14)';
      ctx.beginPath();
      ctx.ellipse(x + W * 0.38, y + 20, 15, 7, -0.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#f8fafc';
      rr(ctx, x + 5, y + H - 21, W - 10, 10, 2);
      ctx.fill();
      ctx.fillStyle = '#0f172a';
      for (let i = 0; i < 9; i++) ctx.fillRect(x + 9 + i * ((W - 20) / 9), y + H - 21, 3, 6);
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(x + 5, y + H - 11, W - 10, 3);
      disc(ctx, cx, y + H - 4, 6.5, '#334155');
      break;
    }
    case 'fireplace': {
      softShadow(ctx, x, y, W, H, 4);
      ctx.fillStyle = '#9a3412';
      rr(ctx, x + 1, y + 1, W - 2, H - 2, 4);
      ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      for (let r = 0; r < 4; r++) for (let c2 = 0; c2 < 8; c2++) ctx.fillRect(x + 3 + c2 * 8.5 + (r % 2) * 4, y + 3 + r * 8, 6.5, 1);
      ctx.fillStyle = '#1c1917';
      rr(ctx, x + 14, y + 8, W - 28, H - 12, 3);
      ctx.fill();
      for (let i = 0; i < 4; i++) {
        const fx = x + 22 + i * ((W - 44) / 3);
        const fh = 8 + (Math.sin(t / 130 + i * 1.7) + 1) * 3.5;
        ellipse(ctx, fx, y + H - 6 - fh / 2, 4.2, fh / 2, i % 2 ? '#f97316' : '#ef4444');
        ellipse(ctx, fx, y + H - 6 - fh / 3, 2.4, fh / 3, '#fde047');
      }
      ctx.fillStyle = '#78350f';
      rr(ctx, x - 1, y + 1, W + 2, 6, 2);
      ctx.fill();
      break;
    }
    case 'fishtank': {
      softShadow(ctx, x, y, W, H, 4);
      ctx.fillStyle = '#334155';
      rr(ctx, x + 1, y + 2, W - 2, H - 4, 5);
      ctx.fill();
      ctx.fillStyle = vgrad(ctx, y + 4, y + H - 6, '#67e8f9', '#0891b2');
      rr(ctx, x + 4, y + 5, W - 8, H - 12, 3);
      ctx.fill();
      ctx.fillStyle = '#fde68a';
      ctx.fillRect(x + 4, y + H - 11, W - 8, 5);
      for (let i = 0; i < 4; i++) { ctx.strokeStyle = '#16a34a'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(x + 10 + i * 14, y + H - 10); ctx.quadraticCurveTo(x + 12 + i * 14 + sway * 2, y + H - 17, x + 10 + i * 14, y + H - 22); ctx.stroke(); }
      for (let i = 0; i < 3; i++) {
        const fx = x + 8 + ((Math.sin(t / 1400 + i * 2.1) + 1) / 2) * (W - 24);
        const dirR = Math.cos(t / 1400 + i * 2.1) > 0;
        const fy = y + 10 + i * 5 + Math.sin(t / 500 + i) * 1.5;
        ellipse(ctx, fx, fy, 4, 2.4, ['#fb923c', '#f472b6', '#fbbf24'][i]);
        ctx.fillStyle = ['#fb923c', '#f472b6', '#fbbf24'][i];
        ctx.beginPath();
        ctx.moveTo(fx + (dirR ? -4 : 4), fy);
        ctx.lineTo(fx + (dirR ? -7 : 7), fy - 2.4);
        ctx.lineTo(fx + (dirR ? -7 : 7), fy + 2.4);
        ctx.fill();
      }
      for (let i = 0; i < 4; i++) {
        const ph = ((t / 1600 + i * 0.27) % 1);
        ctx.fillStyle = `rgba(255,255,255,${0.7 * (1 - ph)})`;
        ctx.beginPath();
        ctx.arc(x + 12 + i * 15, y + H - 12 - ph * (H - 22), 1.6, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = 'rgba(255,255,255,0.2)';
      rr(ctx, x + 6, y + 6, W * 0.4, 3, 2);
      ctx.fill();
      break;
    }
    case 'speaker': {
      softShadow(ctx, x, y, W, H, 5);
      ctx.fillStyle = col ?? '#111827';
      rr(ctx, x + 7, y + 3, TILE - 14, TILE - 6, 5);
      ctx.fill();
      const beat = 1 + Math.sin(t / 130) * 0.12;
      disc(ctx, x + 18, y + 12, 4 * beat, '#374151');
      disc(ctx, x + 18, y + 12, 2, '#9ca3af');
      disc(ctx, x + 18, y + 24, 6 * beat, '#374151');
      disc(ctx, x + 18, y + 24, 3.2, '#9ca3af');
      break;
    }
    case 'frame': {
      softShadow(ctx, x, y, W, H, 3);
      ctx.strokeStyle = '#78350f';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x + 10, y + 30);
      ctx.lineTo(x + 18, y + 16);
      ctx.lineTo(x + 26, y + 30);
      ctx.stroke();
      ctx.fillStyle = col ?? '#92400e';
      rr(ctx, x + 5, y + 3, 26, 22, 2);
      ctx.fill();
      ctx.fillStyle = '#fefce8';
      rr(ctx, x + 8, y + 6, 20, 16, 1);
      ctx.fill();
      const pal2 = ['#f97316', '#3b82f6', '#22c55e', '#ec4899', '#eab308'];
      for (let i = 0; i < 4; i++) disc(ctx, x + 11 + h2(Math.floor(seed * 99), i) * 14, y + 9 + h2(i, Math.floor(seed * 77)) * 10, 2.5 + h2(i, 9) * 3, pal2[(i + Math.floor(seed * 5)) % 5]);
      break;
    }
    case 'vending': {
      softShadow(ctx, x, y, W, H, 5);
      const body = col ?? '#dc2626';
      ctx.fillStyle = shade(body, -0.15);
      rr(ctx, x + 3, y + 2, TILE - 6, H - 4, 5);
      ctx.fill();
      ctx.fillStyle = body;
      rr(ctx, x + 3, y + 2, TILE - 6, H - 8, 5);
      ctx.fill();
      ctx.fillStyle = dark ? '#082f49' : '#e0f2fe';
      rr(ctx, x + 6, y + 6, TILE - 12, H * 0.55, 3);
      ctx.fill();
      const cs = ['#ef4444', '#fbbf24', '#22c55e', '#3b82f6', '#f472b6'];
      for (let r = 0; r < 4; r++) for (let c2 = 0; c2 < 3; c2++) { ctx.fillStyle = cs[(r * 3 + c2) % 5]; rr(ctx, x + 8 + c2 * 7, y + 8 + r * 9, 5, 7, 1.5); ctx.fill(); }
      ctx.fillStyle = '#0f172a';
      rr(ctx, x + 8, y + H - 22, TILE - 16, 8, 2);
      ctx.fill();
      disc(ctx, x + TILE - 10, y + H - 28, 1.5, Math.floor(t / 600) % 2 ? '#22c55e' : '#14532d');
      break;
    }
    case 'dog': {
      // a dog of its own breed that trots around its spot, turns, pauses, and wags its tail
      const k = t / 1000;
      const live = officePets.get(item.id);
      const breed = dogBreed(col, seed);
      if (live && live.view && live.view !== 'side') {
        drawPetEnd(ctx, live.x * TILE, live.y * TILE - 8, 'dog', live.view, breed, k, live.moving, !!live.carrying);
        break;
      }
      const px = live ? live.x * TILE : cx + Math.sin(k * 0.7 + seed * 6) * 30;
      const py = live ? live.y * TILE - 8 : cy + 4 + Math.sin(k * 0.5 + seed * 3) * 10;
      const vx = Math.cos(k * 0.7 + seed * 6);
      const face = live ? live.face : vx >= 0 ? 1 : -1;
      const moving = live ? live.moving : Math.abs(vx) > 0.2;
      ellipse(ctx, px, py + 8, 11 * breed.len, 3.5, 'rgba(15,23,42,0.22)');
      ctx.save();
      ctx.translate(px, py);
      ctx.scale(face, 1);
      drawDogBody(ctx, breed, k, moving, !!live?.carrying);
      ctx.restore();
      break;
    }
    case 'cat': {
      const lv = officePets.get(item.id);
      const cb = catBreed(col, seed);
      if (lv && lv.awake && lv.view && lv.view !== 'side') {
        drawPetEnd(ctx, lv.x * TILE, lv.y * TILE - 8, 'cat', lv.view, cb, t / 1000, lv.moving, false);
        break;
      }
      if (lv && lv.awake) {
        // an awake cat: walks, tail up, ears pricked
        ellipse(ctx, lv.x * TILE, lv.y * TILE, 10 * cb.fluff, 3, 'rgba(15,23,42,0.2)');
        ctx.save();
        ctx.translate(lv.x * TILE, lv.y * TILE - 8);
        ctx.scale(lv.face, 1);
        drawCatBody(ctx, cb, t / 1000, lv.moving);
        ctx.restore();
        break;
      }
      // a cat asleep in a curl, breathing, with drifting Zs
      const br = 1 + Math.sin(t / 650 + seed * 4) * 0.035;
      const fur = cb.coat;
      const sx = lv ? lv.x * TILE : cx;
      const sy = lv ? lv.y * TILE - 14 : y + 22;
      ellipse(ctx, sx, sy + 7, 12 * cb.fluff, 3.6, 'rgba(15,23,42,0.2)');
      ctx.save();
      ctx.translate(sx, sy);
      ctx.scale(br, br);
      ellipse(ctx, 0, 0, 11.5 * cb.fluff, 7.5 * cb.fluff, fur);
      if (cb.pattern === 'tabby' || cb.pattern === 'ginger') { ctx.strokeStyle = cb.mark ?? shade(fur, -0.3); ctx.lineWidth = 1.5; for (let q = -3; q <= 3; q++) { ctx.beginPath(); ctx.moveTo(q * 2.8, -6); ctx.lineTo(q * 2.8 + 1, -1); ctx.stroke(); } }
      if (cb.pattern === 'calico') { disc(ctx, 3, -2, 3.4, '#f59e0b'); disc(ctx, -2, 3, 3, '#1f2937'); }
      if (cb.pattern === 'tux') ellipse(ctx, 1, 3, 6, 3, '#f8fafc');
      ctx.strokeStyle = cb.pattern === 'points' ? (cb.mark ?? '#4b3a2a') : fur;
      ctx.lineWidth = 3.2 * (cb.fluff > 1.05 ? 1.3 : 1);
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.arc(1, 1, 9, Math.PI * 0.15, Math.PI * 0.95);
      ctx.stroke();
      disc(ctx, -6, -2, 5, cb.pattern === 'points' ? (cb.mark ?? '#4b3a2a') : fur);
      ctx.fillStyle = cb.pattern === 'points' ? (cb.mark ?? '#4b3a2a') : fur;
      ctx.beginPath();
      ctx.moveTo(-10, -5);
      ctx.lineTo(-8.8, -10);
      ctx.lineTo(-5.8, -6.2);
      ctx.moveTo(-3, -6.4);
      ctx.lineTo(-1.6, -10.4);
      ctx.lineTo(0.4, -5);
      ctx.fill();
      ctx.strokeStyle = '#111827';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(-8, -2.6, 1.1, 0, Math.PI);
      ctx.moveTo(-4.4, -2.6);
      ctx.arc(-4.4 + 0.2, -2.6, 1.1, 0, Math.PI);
      ctx.stroke();
      ctx.restore();
      const z = ((t / 1800 + seed) % 1);
      ctx.fillStyle = `rgba(100,116,139,${0.9 * (1 - z)})`;
      ctx.font = '700 9px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('z', sx + 8 + z * 7, sy - 12 - z * 9);
      ctx.fillText('Z', sx + 12 + z * 9, sy - 16 - z * 12);
      break;
    }
    default:
      return false;
  }
  return true;
}

/** A dog or cat seen from the front (walking towards you) or the back (walking away). */
function drawPetEnd(ctx: Ctx, px: number, py: number, kind: 'dog' | 'cat', view: 'front' | 'back', breed: DogBreed | CatBreed, k: number, moving: boolean, carrying: boolean) {
  const coat = breed.coat;
  const dark = shade(coat, -0.28);
  const light = shade(coat, 0.3);
  const bob = moving ? -Math.abs(Math.sin(k * 11)) * 1.4 : 0;
  ellipse(ctx, px, py + 8, 10, 3.4, 'rgba(15,23,42,0.22)');
  ctx.save();
  ctx.translate(px, py + bob);
  ctx.lineCap = 'round';
  // legs: the pair nearest the ground steps in turn
  const sw = moving ? Math.sin(k * 11) : 0;
  ctx.fillStyle = dark;
  rr(ctx, -6 - Math.max(0, sw) * 0.5, 2 - Math.max(0, sw) * 1.5, 3, 6.5, 1.3);
  ctx.fill();
  rr(ctx, 3 + Math.max(0, -sw) * 0.5, 2 - Math.max(0, -sw) * 1.5, 3, 6.5, 1.3);
  ctx.fill();
  if (view === 'back') {
    // tail up and wagging
    ctx.strokeStyle = coat;
    ctx.lineWidth = kind === 'dog' ? 3 : 2.6;
    ctx.beginPath();
    ctx.moveTo(0, -3);
    ctx.quadraticCurveTo(Math.sin(k * (kind === 'dog' ? 15 : 5)) * 5, -9, Math.sin(k * (kind === 'dog' ? 15 : 5)) * 6, -14);
    ctx.stroke();
  }
  // body
  ellipse(ctx, 0, -1.5, 8.2, 7, coat);
  ellipse(ctx, 0, 1.5, 5.4, 3, light);
  // head
  const hy = view === 'front' ? -9.5 : -9;
  disc(ctx, 0, hy, 5.8, coat);
  const dg = kind === 'dog' ? (breed as DogBreed) : null;
  const ct = kind === 'cat' ? (breed as CatBreed) : null;
  const earCol = dg ? (dg.ear === 'flop' || dg.ear === 'long' || dg.ear === 'rose' ? (dg.pattern === 'mask' || dg.pattern === 'tricolor' || dg.pattern === 'spots' ? (dg.mark ?? dark) : dark) : coat) : ct?.pattern === 'points' ? (ct.mark ?? dark) : coat;
  if (dg) {
    if (dg.ear === 'prick' || dg.ear === 'big') {
      ctx.fillStyle = earCol;
      ctx.beginPath();
      ctx.moveTo(-5.4, hy - 1); ctx.lineTo(-4.4, hy - (dg.ear === 'big' ? 11 : 8.4)); ctx.lineTo(-1, hy - 4.6);
      ctx.moveTo(5.4, hy - 1); ctx.lineTo(4.4, hy - (dg.ear === 'big' ? 11 : 8.4)); ctx.lineTo(1, hy - 4.6);
      ctx.fill();
    } else {
      const eh = dg.ear === 'long' ? 5.4 : dg.ear === 'rose' ? 2.6 : 4;
      ellipse(ctx, -5.4, hy + 0.5, 2.2, eh, earCol, 0.2);
      ellipse(ctx, 5.4, hy + 0.5, 2.2, eh, earCol, -0.2);
    }
    if (dg.pattern === 'mask' || dg.pattern === 'husky') { ctx.fillStyle = dg.pattern === 'husky' ? '#f8fafc' : (dg.mark ?? dark); ctx.beginPath(); ctx.ellipse(0, hy + 2.2, 3.6, 3, 0, 0, Math.PI * 2); ctx.fill(); }
  } else {
    ctx.fillStyle = earCol;
    ctx.beginPath();
    ctx.moveTo(-5.6, hy - 2); ctx.lineTo(-4.6, hy - 8.6); ctx.lineTo(-1.2, hy - 4.6);
    ctx.moveTo(5.6, hy - 2); ctx.lineTo(4.6, hy - 8.6); ctx.lineTo(1.2, hy - 4.6);
    ctx.fill();
    if (ct && (ct.pattern === 'tabby' || ct.pattern === 'ginger')) { ctx.strokeStyle = ct.mark ?? shade(coat, -0.3); ctx.lineWidth = 0.9; for (const q of [-2.6, 0, 2.6]) { ctx.beginPath(); ctx.moveTo(q, hy - 5.4); ctx.lineTo(q, hy - 2.6); ctx.stroke(); } }
    if (ct && ct.pattern === 'tux') { ctx.fillStyle = '#f8fafc'; ctx.beginPath(); ctx.ellipse(0, hy + 2.4, 2.6, 3.4, 0, 0, Math.PI * 2); ctx.fill(); }
    if (ct && ct.pattern === 'points') { ctx.fillStyle = ct.mark ?? '#4b3a2a'; ctx.beginPath(); ctx.ellipse(0, hy + 1.6, 3.2, 3.4, 0, 0, Math.PI * 2); ctx.fill(); }
  }
  if (dg && (dg.pattern === 'spots')) { ctx.fillStyle = dg.mark ?? '#111827'; for (const [qx, qy] of [[-4, -3], [3, -1], [-1, 2], [4, 4]] as const) { disc(ctx, qx, qy, 1.3, dg.mark ?? '#111827'); } }
  if (dg && (dg.pattern === 'saddle' || dg.pattern === 'tricolor') && view === 'back') { ctx.fillStyle = dg.mark ?? '#1f2937'; ctx.beginPath(); ctx.ellipse(0, -2, 5.4, 5, 0, 0, Math.PI * 2); ctx.fill(); }
  if (view === 'front') {
    const eyeC = dg?.eye ?? ct?.eye ?? '#111827';
    disc(ctx, -2.3, hy - 0.6, 0.95, eyeC);
    disc(ctx, 2.3, hy - 0.6, 0.95, eyeC);
    ellipse(ctx, 0, hy + 2.6, 2.4, 1.7, light);
    disc(ctx, 0, hy + 1.9, 1, '#111827');
    if (kind === 'dog' && moving) ellipse(ctx, 0, hy + 4.8, 1.2, 1.8 + Math.sin(k * 14) * 0.4, '#f472b6');
    if (carrying) { disc(ctx, 0, hy + 5.4, 2.8, '#d9f99d'); }
  } else {
    ctx.fillStyle = 'rgba(15,23,42,0.12)';
    ctx.beginPath();
    ctx.arc(0, hy, 5.8, 0, Math.PI * 2);
    ctx.fill();
  }
  // a little red collar on the dog
  if (kind === 'dog' && view === 'front') { ctx.fillStyle = '#dc2626'; rr(ctx, -3.6, hy + 4.6, 7.2, 1.8, 0.9); ctx.fill(); }
  ctx.restore();
}


/** An irregular, natural outline (a closed loop of points around the origin, scaled by k). Each pond gets its own shape from its seed. */
function pondOutline(seed: number, k: number): [number, number][] {
  const pts: [number, number][] = [];
  const s1 = seed * 11, s2 = seed * 7 + 1.3, s3 = seed * 5 + 2.1;
  for (let i = 0; i < 36; i++) {
    const th = (i / 36) * Math.PI * 2;
    const r = (1 + 0.13 * Math.sin(3 * th + s1) + 0.08 * Math.sin(5 * th + s2) + 0.05 * Math.sin(2 * th + s3)) * k;
    pts.push([Math.cos(th) * r, Math.sin(th) * r]);
  }
  return pts;
}
function pondPath(ctx: Ctx, pts: [number, number][], cx: number, cy: number, rx: number, ry: number) {
  const n = pts.length;
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const p0 = pts[i], p1 = pts[(i + 1) % n], pm = pts[(i + n - 1) % n];
    if (i === 0) ctx.moveTo(cx + ((pm[0] + p0[0]) / 2) * rx, cy + ((pm[1] + p0[1]) / 2) * ry);
    ctx.quadraticCurveTo(cx + p0[0] * rx, cy + p0[1] * ry, cx + ((p0[0] + p1[0]) / 2) * rx, cy + ((p0[1] + p1[1]) / 2) * ry);
  }
  ctx.closePath();
}

/**
 * A natural pond: an irregular shoreline of mud and pebbles, shallow and deep water, a little stream running in and out,
 * currents drifting across it, a slow eddy, lily pads, reeds, and koi that swim along (one leaps now and then).
 */
function drawPondItem(ctx: Ctx, x: number, y: number, W: number, H: number, t: number, seed: number) {
  const cx = x + W / 2, cy = y + H / 2 + 1;
  const rx = W / 2 - 6, ry = H / 2 - 6;
  const outline = pondOutline(seed, 0.86);
  const sec = t / 1000;

  // the stream: it runs in from the left and out at the lower right, with banks of earth
  const inlet: [number, number][] = [[x + 1, cy - ry * 0.3], [x + W * 0.12, cy - ry * 0.34], [cx - rx * 0.78, cy - ry * 0.12]];
  const outlet: [number, number][] = [[cx + rx * 0.7, cy + ry * 0.25], [x + W * 0.9, cy + ry * 0.45], [x + W - 1, cy + ry * 0.42]];
  const stroke = (path: [number, number][], width: number, style: string, dash?: number[], offset = 0) => {
    ctx.strokeStyle = style;
    ctx.lineWidth = width;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.setLineDash(dash ?? []);
    ctx.lineDashOffset = offset;
    ctx.beginPath();
    ctx.moveTo(path[0][0], path[0][1]);
    ctx.quadraticCurveTo(path[1][0], path[1][1], path[2][0], path[2][1]);
    ctx.stroke();
    ctx.setLineDash([]);
  };

  // damp earth around the water, then the muddy bank
  ctx.fillStyle = 'rgba(70,52,30,0.18)';
  pondPath(ctx, outline, cx, cy + 3, rx + 9, ry + 9);
  ctx.fill();
  ctx.fillStyle = '#8a6f4d';
  pondPath(ctx, outline, cx, cy, rx + 5, ry + 5);
  ctx.fill();
  ctx.fillStyle = '#a58a62';
  pondPath(ctx, outline, cx, cy - 0.5, rx + 3, ry + 3);
  ctx.fill();
  stroke(inlet, 21, '#8a6f4d');
  stroke(outlet, 19, '#8a6f4d');

  // pebbles along the shore
  for (let i = 0; i < 36; i += 1) {
    const [px, py] = outline[i];
    const r = 1.2 + ((i * 7 + seed * 13) % 5) * 0.55;
    ctx.fillStyle = ['#9ca3af', '#78716c', '#d6d3d1', '#a8a29e', '#6b7280'][(i + Math.floor(seed * 9)) % 5];
    ctx.beginPath();
    ctx.ellipse(cx + px * (rx + 4.4), cy + py * (ry + 4.4), r * 1.3, r, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // shallow water at the edge, deeper towards the middle
  ctx.fillStyle = '#7fd6c8';
  pondPath(ctx, outline, cx, cy, rx + 1, ry + 1);
  ctx.fill();
  stroke(inlet, 14, '#7fd6c8');
  stroke(outlet, 12, '#7fd6c8');
  ctx.save();
  pondPath(ctx, outline, cx, cy, rx, ry);
  ctx.clip();
  const deep = ctx.createRadialGradient(cx - rx * 0.15, cy - ry * 0.1, 3, cx, cy, Math.max(rx, ry) * 0.95);
  deep.addColorStop(0, '#0b5c7a');
  deep.addColorStop(0.55, '#1b86a0');
  deep.addColorStop(1, '#6fcfd0');
  ctx.fillStyle = deep;
  ctx.fillRect(x, y, W, H);

  // light patterns on the bottom, drifting slowly
  for (let i = 0; i < 7; i++) {
    const lx = cx + Math.sin(sec * 0.4 + i * 1.9) * rx * 0.55;
    const ly = cy + Math.cos(sec * 0.33 + i * 2.4) * ry * 0.5;
    const g = ctx.createRadialGradient(lx, ly, 0, lx, ly, 14);
    g.addColorStop(0, 'rgba(180,255,245,0.16)');
    g.addColorStop(1, 'rgba(180,255,245,0)');
    ctx.fillStyle = g;
    ctx.fillRect(lx - 14, ly - 14, 28, 28);
  }

  // the current: wavy streaks of light drifting across, left to right, faster in the middle
  ctx.lineCap = 'round';
  ctx.lineWidth = 1.3;
  for (let k = 0; k < 18; k++) {
    const by = cy - ry * 0.95 + (k / 17) * ry * 1.9;
    const mid = 1 - Math.abs(by - cy) / ry;
    const speed = 16 + mid * 26 + (k % 4) * 5;
    const x0 = ((sec * speed + k * 53 + seed * 70) % (W + 50)) + x - 25;
    ctx.strokeStyle = `rgba(255,255,255,${(0.12 + 0.2 * mid + (k % 3) * 0.04).toFixed(3)})`;
    ctx.beginPath();
    for (let j = 0; j <= 6; j++) {
      const px = x0 + j * 4.2;
      const py = by + Math.sin(px / 9 + sec * 1.7 + k) * 1.7;
      if (j === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.stroke();
  }
  // a slow eddy turning near the middle
  for (let k = 0; k < 3; k++) {
    ctx.strokeStyle = `rgba(255,255,255,${0.14 - k * 0.03})`;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.ellipse(cx + rx * 0.18, cy + ry * 0.08, 8 + k * 6, 4 + k * 3, sec * 0.6 + k, 0.3, Math.PI * 1.5 + 0.3);
    ctx.stroke();
  }
  // glints of sun
  for (let k = 0; k < 14; k++) {
    const tw = (Math.sin(sec * 2.2 + k * 2.3) + 1) / 2;
    ctx.fillStyle = `rgba(255,255,255,${(0.75 * tw * tw).toFixed(3)})`;
    ctx.fillRect(cx + Math.sin(k * 5.1 + seed * 9) * rx * 0.85, cy + Math.cos(k * 3.7 + seed * 5) * ry * 0.8, 2, 1.4);
  }
  // sky reflected on the surface
  const sheen = ctx.createLinearGradient(x, y, x + W * 0.7, y + H * 0.9);
  sheen.addColorStop(0, 'rgba(255,255,255,0.2)');
  sheen.addColorStop(0.5, 'rgba(255,255,255,0)');
  ctx.fillStyle = sheen;
  ctx.fillRect(x, y, W, H);

  // lily pads with a lotus
  for (const [lx, ly, lr, a0] of [[-0.42, 0.22, 7.5, 0.5], [-0.12, -0.3, 6, 2.1], [0.4, 0.3, 8, 3.6], [0.22, -0.18, 5, 5]] as const) {
    const px = cx + lx * rx + Math.sin(sec * 0.5 + a0) * 0.8, py = cy + ly * ry + Math.cos(sec * 0.45 + a0) * 0.6;
    ctx.fillStyle = 'rgba(8,60,40,0.3)';
    ctx.beginPath(); ctx.ellipse(px + 1, py + 1.5, lr, lr * 0.6, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#2fae5f';
    ctx.beginPath(); ctx.ellipse(px, py, lr, lr * 0.6, 0, a0 % 1 + 0.25, Math.PI * 2 - 0.1); ctx.lineTo(px, py); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.3)';
    ctx.lineWidth = 0.8;
    ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px + lr * 0.7, py - lr * 0.2); ctx.stroke();
  }
  const lotX = cx - 0.12 * rx, lotY = cy - 0.3 * ry;
  for (let p = 0; p < 6; p++) { const an = (p / 6) * Math.PI * 2; ctx.fillStyle = '#f9a8d4'; ctx.beginPath(); ctx.ellipse(lotX + Math.cos(an) * 2.6, lotY - 2 + Math.sin(an) * 1.5, 2.3, 1.4, an, 0, Math.PI * 2); ctx.fill(); }
  disc(ctx, lotX, lotY - 2, 1.5, '#fde047');

  // koi following the current in gentle loops, each turned the way it swims
  const kois = ['#fb923c', '#f8fafc', '#f59e0b', '#fb7185'];
  for (let i = 0; i < 4; i++) {
    const a = sec / (2.9 + i * 0.7) + i * 1.9 + seed * 6;
    const fx = cx + Math.cos(a) * rx * (0.5 + i * 0.07);
    const fy = cy + Math.sin(a) * ry * (0.46 + i * 0.07);
    const head = Math.atan2(Math.cos(a) * ry * (0.46 + i * 0.07), -Math.sin(a) * rx * (0.5 + i * 0.07));
    ctx.save();
    ctx.translate(fx, fy);
    ctx.rotate(head);
    ctx.fillStyle = 'rgba(0,40,60,0.18)';
    ctx.beginPath(); ctx.ellipse(1, 3, 6.5, 2.6, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = kois[i];
    const wag = Math.sin(sec * 7 + i) * 1.8;
    ctx.beginPath(); ctx.ellipse(0, 0, 6.2, 2.6, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(-4.4, wag * 0.35, 3.6, 1.8, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.moveTo(-6.2, wag * 0.5); ctx.lineTo(-11, -2.8 + wag); ctx.lineTo(-11, 2.8 + wag); ctx.closePath(); ctx.fill();
    ctx.fillStyle = i % 2 ? '#fb923c' : '#f8fafc';
    ctx.beginPath(); ctx.ellipse(1, -0.6, 2.4, 1.1, 0, 0, Math.PI * 2); ctx.fill();
    disc(ctx, 4, -0.8, 0.6, '#111827');
    ctx.restore();
  }
  ctx.restore();

  // now and then a fish leaps out, with a ring of splash where it lands
  const jp = ((sec + seed * 9) % 7.5) / 1.2;
  if (jp < 1) {
    const jx = cx - rx * 0.25 + jp * rx * 0.35, jy = cy + ry * 0.2;
    const hgt = Math.sin(Math.PI * jp) * 16;
    ctx.save();
    ctx.translate(jx, jy - hgt);
    ctx.rotate((jp - 0.5) * 2.4);
    ctx.fillStyle = '#fb923c';
    ctx.beginPath(); ctx.ellipse(0, 0, 6, 2.6, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.moveTo(-5, 0); ctx.lineTo(-10, -3); ctx.lineTo(-10, 3); ctx.closePath(); ctx.fill();
    disc(ctx, 3, -0.6, 0.7, '#111827');
    ctx.restore();
    for (const edge of [0.04, 0.96]) {
      const ph = Math.abs(jp - edge) / 0.2;
      if (ph < 1) {
        ctx.strokeStyle = `rgba(255,255,255,${0.85 * (1 - ph)})`;
        ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.ellipse(jx, jy, 3 + ph * 13, 1.5 + ph * 5.5, 0, 0, Math.PI * 2); ctx.stroke();
      }
    }
  }

  // frogs sitting on the lily pads: now and then one hops to another pad, with a ripple where it lands, and croaks
  const pads: [number, number][] = [[-0.42, 0.22], [-0.12, -0.3], [0.4, 0.3], [0.22, -0.18]];
  const padAt = (k: number): [number, number] => [cx + pads[k][0] * rx, cy + pads[k][1] * ry];
  for (const [fa, fb, off] of [[0, 2, 0], [1, 3, 4.6]] as const) {
    const cyc = ((sec + off + seed * 3) % 9) / 9;
    const a0 = padAt(fa), b0 = padAt(fb);
    let fxp = a0[0], fyp = a0[1], air = 0, croak = 0, onB = false;
    if (cyc < 0.1) { const u = cyc / 0.1; fxp = a0[0] + (b0[0] - a0[0]) * u; fyp = a0[1] + (b0[1] - a0[1]) * u; air = Math.sin(Math.PI * u) * 9; }
    else if (cyc < 0.5) { fxp = b0[0]; fyp = b0[1]; onB = true; croak = cyc > 0.28 && cyc < 0.4 ? Math.abs(Math.sin((cyc - 0.28) * 70)) : 0; }
    else if (cyc < 0.6) { const u = (cyc - 0.5) / 0.1; fxp = b0[0] + (a0[0] - b0[0]) * u; fyp = b0[1] + (a0[1] - b0[1]) * u; air = Math.sin(Math.PI * u) * 9; }
    else { croak = cyc > 0.8 && cyc < 0.9 ? Math.abs(Math.sin((cyc - 0.8) * 70)) : 0; }
    const landed = cyc < 0.1 ? 1 : cyc < 0.6 && cyc > 0.5 ? 1 : 0;
    if (!landed || air < 0.5) {
      // a ripple spreads from a pad a moment after a landing
      const since = cyc < 0.5 ? cyc - 0.1 : cyc < 0.7 ? cyc - 0.6 : 1;
      if (since >= 0 && since < 0.1) { ctx.strokeStyle = `rgba(255,255,255,${0.7 * (1 - since / 0.1)})`; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.ellipse(onB || cyc > 0.6 ? (cyc < 0.7 ? a0[0] : a0[0]) : b0[0], cyc < 0.5 ? b0[1] : a0[1], 4 + (since / 0.1) * 12, 2 + (since / 0.1) * 5, 0, 0, Math.PI * 2); ctx.stroke(); }
    }
    const fy2 = fyp - air - 2;
    ctx.fillStyle = 'rgba(0,40,60,0.25)';
    ctx.beginPath(); ctx.ellipse(fxp + 1, fyp + 1, 4.4, 1.8, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#4ade80';
    ctx.beginPath(); ctx.ellipse(fxp, fy2, 4.6, 3.1, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#22a35a';
    ctx.beginPath(); ctx.ellipse(fxp - 3.6, fy2 + 1.2, 2.2, 1.3, -0.5, 0, Math.PI * 2); ctx.ellipse(fxp + 3.6, fy2 + 1.2, 2.2, 1.3, 0.5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#4ade80';
    disc(ctx, fxp - 2, fy2 - 3, 1.7, '#4ade80'); disc(ctx, fxp + 2, fy2 - 3, 1.7, '#4ade80');
    disc(ctx, fxp - 2, fy2 - 3.2, 0.8, '#111827'); disc(ctx, fxp + 2, fy2 - 3.2, 0.8, '#111827');
    if (croak > 0.05) { ctx.fillStyle = '#d9f99d'; ctx.beginPath(); ctx.ellipse(fxp, fy2 + 2.2, 1.8 + croak * 2, 1 + croak * 1.6, 0, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.font = '700 6px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.fillText('ribbit', fxp, fy2 - 8 - croak * 2); }
  }
  // a dragonfly hovering and darting over the water
  {
    const dx = cx + Math.sin(sec * 0.9 + seed * 4) * rx * 0.55 + Math.sin(sec * 2.3) * 4;
    const dy = cy + Math.cos(sec * 0.7 + seed * 2) * ry * 0.4 - 10 + Math.sin(sec * 3.1) * 2;
    ctx.fillStyle = 'rgba(0,40,60,0.18)';
    ctx.beginPath(); ctx.ellipse(dx, dy + 12, 4, 1.4, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#0ea5e9'; ctx.lineWidth = 1.6; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(dx - 4, dy); ctx.lineTo(dx + 4, dy); ctx.stroke();
    disc(ctx, dx + 4.4, dy, 1.3, '#0369a1');
    ctx.fillStyle = 'rgba(224,242,254,0.65)';
    const w = Math.sin(sec * 60) * 1.4;
    ctx.beginPath(); ctx.ellipse(dx - 1, dy - 2.4 - w, 4, 1.2, -0.3, 0, Math.PI * 2); ctx.ellipse(dx + 1.4, dy - 2.4 - w, 4, 1.2, 0.3, 0, Math.PI * 2); ctx.ellipse(dx - 1, dy + 2.4 + w, 4, 1.2, 0.3, 0, Math.PI * 2); ctx.ellipse(dx + 1.4, dy + 2.4 + w, 4, 1.2, -0.3, 0, Math.PI * 2); ctx.fill();
  }

  // the stream flowing: moving dashes of light along both channels
  const flow = -sec * 26;
  stroke(inlet, 2, 'rgba(255,255,255,0.55)', [5, 9], flow);
  stroke(outlet, 2, 'rgba(255,255,255,0.5)', [5, 9], flow);

  // reeds and cattails round the edge, swaying, with tufts of grass between
  ctx.lineCap = 'round';
  for (const idx of [5, 6, 17, 18, 26, 31]) {
    const [px, py] = outline[idx];
    const bx = cx + px * (rx + 5), by = cy + py * (ry + 5);
    for (let r = 0; r < 4; r++) {
      const sway = Math.sin(sec * 1.1 + idx + r) * 2.2;
      const hgt = 16 + ((idx + r) % 3) * 4;
      ctx.strokeStyle = r % 2 ? '#4d7c0f' : '#65a30d';
      ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(bx + r * 2 - 3, by); ctx.quadraticCurveTo(bx + r * 2 - 3 + sway * 0.4, by - hgt * 0.5, bx + r * 2 - 3 + sway, by - hgt); ctx.stroke();
      if (r % 2 === 0) { ctx.fillStyle = '#78350f'; ctx.beginPath(); ctx.ellipse(bx + r * 2 - 3 + sway, by - hgt, 1.5, 3.2, sway * 0.05, 0, Math.PI * 2); ctx.fill(); }
    }
  }
  ctx.strokeStyle = '#3f7d14';
  ctx.lineWidth = 1.2;
  for (let i = 0; i < 36; i += 3) {
    const [px, py] = outline[i];
    const bx = cx + px * (rx + 7), by = cy + py * (ry + 7);
    const sway = Math.sin(sec * 1.4 + i) * 1.2;
    for (let g = -1; g <= 1; g++) { ctx.beginPath(); ctx.moveTo(bx + g * 2, by); ctx.lineTo(bx + g * 2.6 + sway, by - 4 - (g === 0 ? 2 : 0)); ctx.stroke(); }
  }
}


/** A tiny deterministic random number for drawing textures: the same place always gets the same grain. */
function grain(seed: number, i: number): number {
  const v = Math.sin(i * 127.1 + seed * 311.7) * 43758.5453;
  return v - Math.floor(v);
}

/** The sea: deep blue turning to bright shallows, swells rolling in, lines of surf that break into foam on the shore, glitter. */
function drawSeaItem(ctx: Ctx, x: number, y: number, W: number, H: number, t: number, seed: number) {
  const sec = t / 1000;
  ctx.save();
  rr(ctx, x, y, W, H, 12);
  ctx.clip();
  const g = ctx.createLinearGradient(0, y, 0, y + H);
  g.addColorStop(0, '#093f7a');
  g.addColorStop(0.35, '#0f6fb3');
  g.addColorStop(0.65, '#1fa6cf');
  g.addColorStop(0.88, '#5fd0d8');
  g.addColorStop(1, '#b9efe2');
  ctx.fillStyle = g;
  ctx.fillRect(x, y, W, H);
  // broad swells drifting towards the shore
  for (let i = 0; i < 6; i++) {
    const yy = y + (((sec * 7 + i * (H / 6)) % H) + H) % H;
    const sw = ctx.createLinearGradient(0, yy - 14, 0, yy + 14);
    sw.addColorStop(0, 'rgba(255,255,255,0)');
    sw.addColorStop(0.5, 'rgba(255,255,255,0.08)');
    sw.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = sw;
    ctx.fillRect(x, yy - 14, W, 28);
  }
  // fine ripples
  ctx.lineWidth = 1;
  for (let r = 0; r < 16; r++) {
    const base = y + 8 + (r / 15) * (H - 16);
    ctx.strokeStyle = `rgba(255,255,255,${(0.07 + 0.12 * (r / 15)).toFixed(3)})`;
    ctx.beginPath();
    for (let px = x; px <= x + W; px += 5) {
      const wy = base + Math.sin(px / 17 + sec * 0.9 + r * 1.7) * 2.2 + Math.sin(px / 41 - sec * 0.5 + r) * 1.6;
      if (px === x) ctx.moveTo(px, wy); else ctx.lineTo(px, wy);
    }
    ctx.stroke();
  }
  // sunlit shallows: wobbling bright cells on the sand below
  for (let k = 0; k < 90; k++) {
    const sx = x + grain(seed, k) * W;
    const sy = y + H * 0.55 + grain(seed, k + 300) * H * 0.4;
    const tw = (Math.sin(sec * 1.6 + k * 1.3) + 1) / 2;
    ctx.fillStyle = `rgba(255,255,255,${(0.12 + 0.22 * tw).toFixed(3)})`;
    ctx.beginPath();
    ctx.ellipse(sx + Math.sin(sec * 0.7 + k) * 3, sy, 4 + tw * 3, 1.3, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  // lines of surf rolling in and breaking into foam
  for (let f = 0; f < 4; f++) {
    const ph = ((sec / 7 + f / 4) % 1);
    const fy = y + H * 0.18 + ph * H * 0.8;
    const strength = Math.sin(Math.PI * Math.min(1, ph * 1.15));
    ctx.strokeStyle = `rgba(255,255,255,${(0.7 * strength).toFixed(3)})`;
    ctx.lineWidth = 2.2 + ph * 3;
    ctx.beginPath();
    for (let px = x; px <= x + W; px += 4) {
      const wy = fy + Math.sin(px / 19 + f * 2.3 + sec * 0.6) * (3 + ph * 4);
      if (px === x) ctx.moveTo(px, wy); else ctx.lineTo(px, wy);
    }
    ctx.stroke();
    ctx.strokeStyle = `rgba(255,255,255,${(0.28 * strength).toFixed(3)})`;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    for (let px = x; px <= x + W; px += 4) {
      const wy = fy - 6 - ph * 3 + Math.sin(px / 23 + f * 1.9 + sec * 0.6) * (3 + ph * 4);
      if (px === x) ctx.moveTo(px, wy); else ctx.lineTo(px, wy);
    }
    ctx.stroke();
    for (let k = 0; k < 40; k++) {
      const px = x + grain(seed, k + f * 50) * W;
      ctx.fillStyle = `rgba(255,255,255,${(0.55 * strength).toFixed(3)})`;
      ctx.fillRect(px, fy + Math.sin(px / 19 + f * 2.3 + sec * 0.6) * (3 + ph * 4) + 2, 1.6, 1.6);
    }
  }
  // the last wash of foam running up the beach and back
  const run = (Math.sin(sec * 0.85 + seed * 3) + 1) / 2;
  ctx.fillStyle = 'rgba(255,255,255,0.88)';
  ctx.beginPath();
  ctx.moveTo(x, y + H);
  for (let px = x; px <= x + W; px += 4) ctx.lineTo(px, y + H - 3 - run * 7 + Math.sin(px / 9 + sec * 1.3) * 2.2);
  ctx.lineTo(x + W, y + H);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.4)';
  ctx.beginPath();
  ctx.moveTo(x, y + H);
  for (let px = x; px <= x + W; px += 4) ctx.lineTo(px, y + H - 9 - run * 9 + Math.sin(px / 11 - sec * 1.1) * 3);
  ctx.lineTo(x + W, y + H);
  ctx.closePath();
  ctx.fill();
  // sun glitter
  for (let k = 0; k < 40; k++) {
    const tw = Math.max(0, Math.sin(sec * 3 + k * 2.1));
    if (tw < 0.2) continue;
    const gx = x + grain(seed, k + 700) * W, gy = y + grain(seed, k + 900) * H * 0.8;
    ctx.fillStyle = `rgba(255,255,255,${(0.9 * tw).toFixed(3)})`;
    ctx.fillRect(gx - 2, gy, 5, 1);
    ctx.fillRect(gx, gy - 2, 1, 5);
  }
  ctx.restore();
}

/** Beach sand: dark and damp near the water, dry and pale further up, with grain, wind ripples, shells, driftwood, seaweed and footprints. */
function drawSandItem(ctx: Ctx, x: number, y: number, W: number, H: number, seed: number) {
  ctx.save();
  rr(ctx, x, y, W, H, 14);
  ctx.clip();
  const g = ctx.createLinearGradient(0, y, 0, y + H);
  g.addColorStop(0, '#bfa874');
  g.addColorStop(0.16, '#d8c18c');
  g.addColorStop(0.4, '#ecd8a6');
  g.addColorStop(1, '#f5e8c4');
  ctx.fillStyle = g;
  ctx.fillRect(x, y, W, H);
  // a wavy damp line where the last wave reached
  ctx.strokeStyle = 'rgba(110,90,55,0.22)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let px = x; px <= x + W; px += 5) {
    const wy = y + H * 0.2 + Math.sin(px / 23 + seed * 5) * 3 + Math.sin(px / 9) * 1;
    if (px === x) ctx.moveTo(px, wy); else ctx.lineTo(px, wy);
  }
  ctx.stroke();
  // the grain of the sand
  const n = Math.floor((W * H) / 14);
  for (let i = 0; i < n; i++) {
    const gx = x + grain(seed, i) * W, gy = y + grain(seed, i + 5000) * H;
    const k = grain(seed, i + 9000);
    ctx.fillStyle = k < 0.45 ? 'rgba(160,125,70,0.30)' : k < 0.8 ? 'rgba(255,255,255,0.40)' : 'rgba(120,95,55,0.25)';
    ctx.fillRect(gx, gy, 1.3, 1.3);
  }
  // wind ripples
  ctx.lineWidth = 1.3;
  for (let r = 0; r < Math.floor(W / 24); r++) {
    const rx2 = x + 14 + grain(seed, r + 11000) * (W - 40);
    const ry2 = y + H * 0.3 + grain(seed, r + 12000) * H * 0.62;
    ctx.strokeStyle = 'rgba(165,130,80,0.30)';
    ctx.beginPath();
    ctx.arc(rx2, ry2, 7 + grain(seed, r + 13000) * 8, Math.PI * 1.1, Math.PI * 1.9);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.beginPath();
    ctx.arc(rx2, ry2 + 2, 7 + grain(seed, r + 13000) * 8, Math.PI * 1.1, Math.PI * 1.9);
    ctx.stroke();
  }
  // seaweed washed up along the damp line
  for (let k = 0; k < Math.floor(W / 40); k++) {
    const sx = x + 10 + grain(seed, k + 14000) * (W - 20);
    const sy = y + H * 0.2 + Math.sin(sx / 23 + seed * 5) * 3 + 3;
    ctx.strokeStyle = k % 2 ? '#4a5d23' : '#2f4a2a';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.bezierCurveTo(sx + 5, sy - 3, sx + 9, sy + 3, sx + 14, sy - 1);
    ctx.stroke();
  }
  // a piece of driftwood
  const dx = x + W * (0.2 + grain(seed, 77) * 0.2), dy = y + H * 0.45;
  ctx.save();
  ctx.translate(dx, dy);
  ctx.rotate(-0.25);
  ctx.fillStyle = 'rgba(90,70,40,0.2)';
  rr(ctx, -13, 3, 28, 6, 3);
  ctx.fill();
  ctx.fillStyle = '#a07a52';
  rr(ctx, -14, 0, 28, 6, 3);
  ctx.fill();
  ctx.fillStyle = '#c29c70';
  rr(ctx, -12, 0.8, 22, 1.6, 0.8);
  ctx.fill();
  disc(ctx, 6, 3, 1.1, '#6b4f30');
  ctx.restore();
  // shells, pebbles, a starfish
  for (let k = 0; k < Math.floor(W / 30); k++) {
    const sx = x + 12 + grain(seed, k + 15000) * (W - 24), sy = y + H * 0.3 + grain(seed, k + 16000) * H * 0.62;
    if (k % 3 === 0) {
      ctx.fillStyle = '#fbcfe8';
      ctx.beginPath(); ctx.arc(sx, sy, 3.6, Math.PI, 0); ctx.fill();
      ctx.strokeStyle = '#f472b6'; ctx.lineWidth = 0.7;
      for (let q = -2; q <= 2; q++) { ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx + q * 1.5, sy - 3.6); ctx.stroke(); }
    } else if (k % 3 === 1) {
      ctx.fillStyle = 'rgba(80,65,40,0.25)';
      ctx.beginPath(); ctx.ellipse(sx + 1, sy + 1.5, 3, 1.6, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#9ca3af';
      ctx.beginPath(); ctx.ellipse(sx, sy, 3, 2.2, 0, 0, Math.PI * 2); ctx.fill();
    } else {
      ctx.fillStyle = '#fb923c';
      ctx.beginPath();
      for (let q = 0; q < 10; q++) { const rad = q % 2 ? 2.2 : 5; const an = -Math.PI / 2 + (q * Math.PI) / 5; ctx.lineTo(sx + Math.cos(an) * rad, sy + Math.sin(an) * rad); }
      ctx.closePath(); ctx.fill();
    }
  }
  // footprints wandering across
  for (let k = 0; k < 9; k++) {
    const fx = x + W * 0.55 + k * 11, fy2 = y + H * 0.55 + Math.sin(k * 0.9) * 7 + (k % 2 ? 3 : -3);
    ctx.fillStyle = 'rgba(120,95,55,0.28)';
    ctx.beginPath(); ctx.ellipse(fx, fy2, 3.4, 1.7, 0.2, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.beginPath(); ctx.ellipse(fx - 0.6, fy2 - 0.6, 2.8, 1.2, 0.2, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

/** A beach lounger seen from above: wooden frame, striped cushion, a pillow at the head. */
function drawBeachChair(ctx: Ctx, x: number, y: number, W: number, H: number, col: string | undefined, seed: number) {
  const cloth = col ?? ['#2563eb', '#ef4444', '#f59e0b', '#14b8a6'][Math.floor(seed * 4)];
  ctx.fillStyle = 'rgba(70,50,25,0.22)';
  rr(ctx, x + 6, y + 8, W - 8, H - 6, 8);
  ctx.fill();
  ctx.fillStyle = '#8b5e34';
  rr(ctx, x + 3, y + 4, W - 8, H - 10, 7);
  ctx.fill();
  ctx.fillStyle = '#b07a46';
  rr(ctx, x + 4, y + 5, W - 10, 3, 2);
  ctx.fill();
  ctx.save();
  rr(ctx, x + 6, y + 8, W - 14, H - 17, 5);
  ctx.clip();
  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(x, y, W, H);
  ctx.fillStyle = cloth;
  for (let k = 0; k < 7; k++) ctx.fillRect(x + 6 + k * ((W - 14) / 7), y, (W - 14) / 14, H);
  const sh = ctx.createLinearGradient(x, y, x, y + H);
  sh.addColorStop(0, 'rgba(255,255,255,0.18)');
  sh.addColorStop(1, 'rgba(0,0,0,0.12)');
  ctx.fillStyle = sh;
  ctx.fillRect(x, y, W, H);
  ctx.restore();
  ctx.fillStyle = '#fef3c7';
  rr(ctx, x + 7, y + 10, 12, H - 21, 5);
  ctx.fill();
  ctx.fillStyle = 'rgba(0,0,0,0.08)';
  rr(ctx, x + 7, y + H - 20, 12, 5, 3);
  ctx.fill();
  disc(ctx, x + W - 7, y + H - 7, 2.2, '#6b4423');
}

/** A beach umbrella from above: a round striped canopy with a long shadow across the sand. */
function drawUmbrella(ctx: Ctx, x: number, y: number, W: number, H: number, col: string | undefined, t: number, seed: number) {
  const cx = x + W / 2, cy = y + H / 2 - 2;
  const R2 = Math.min(W, H) / 2 - 3;
  const a = col ?? ['#ef4444', '#facc15', '#2563eb', '#ec4899'][Math.floor(seed * 4)];
  ctx.fillStyle = 'rgba(70,50,25,0.24)';
  ctx.beginPath(); ctx.ellipse(cx + 12, cy + 12, R2, R2 * 0.8, 0.35, 0, Math.PI * 2); ctx.fill();
  const sway = Math.sin(t / 1700 + seed * 6) * 0.6;
  const segs = 8;
  for (let i = 0; i < segs; i++) {
    const a0 = (i / segs) * Math.PI * 2 + sway * 0.02, a1 = ((i + 1) / segs) * Math.PI * 2 + sway * 0.02;
    ctx.fillStyle = i % 2 ? '#fffdf5' : a;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, R2, a0, a1);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.12)';
    ctx.lineWidth = 0.8;
    ctx.stroke();
  }
  // scalloped rim
  ctx.fillStyle = 'rgba(0,0,0,0.1)';
  for (let i = 0; i < segs; i++) {
    const am = ((i + 0.5) / segs) * Math.PI * 2;
    ctx.beginPath();
    ctx.arc(cx + Math.cos(am) * (R2 - 1), cy + Math.sin(am) * (R2 - 1), 3.2, 0, Math.PI * 2);
    ctx.fill();
  }
  const hi = ctx.createRadialGradient(cx - R2 * 0.35, cy - R2 * 0.4, 2, cx, cy, R2);
  hi.addColorStop(0, 'rgba(255,255,255,0.35)');
  hi.addColorStop(0.7, 'rgba(255,255,255,0)');
  ctx.fillStyle = hi;
  ctx.beginPath(); ctx.arc(cx, cy, R2, 0, Math.PI * 2); ctx.fill();
  disc(ctx, cx, cy, 3.2, '#e5e7eb');
  disc(ctx, cx - 0.6, cy - 0.6, 1.4, '#ffffff');
}

/** A striped beach towel with fringed ends. */
function drawTowel(ctx: Ctx, x: number, y: number, W: number, H: number, col: string | undefined, seed: number) {
  const a = col ?? ['#f97316', '#0ea5e9', '#ec4899', '#22c55e'][Math.floor(seed * 4)];
  ctx.fillStyle = 'rgba(70,50,25,0.2)';
  rr(ctx, x + 5, y + 7, W - 8, H - 12, 3);
  ctx.fill();
  ctx.save();
  ctx.translate(x + W / 2, y + H / 2);
  ctx.rotate(-0.06 + (seed - 0.5) * 0.1);
  const w = W - 12, h = H - 12;
  ctx.fillStyle = '#fffbeb';
  rr(ctx, -w / 2, -h / 2, w, h, 3);
  ctx.fill();
  ctx.save();
  rr(ctx, -w / 2, -h / 2, w, h, 3);
  ctx.clip();
  ctx.fillStyle = a;
  for (let k = 0; k < 5; k++) ctx.fillRect(-w / 2 + 4 + k * (w / 5), -h / 2, w / 12, h);
  ctx.fillStyle = 'rgba(0,0,0,0.07)';
  ctx.fillRect(-w / 2, h * 0.1, w, 2);
  ctx.restore();
  ctx.strokeStyle = '#fef3c7';
  ctx.lineWidth = 1;
  for (let k = 0; k < 10; k++) {
    const fy = -h / 2 + 2 + k * (h / 9.5);
    ctx.beginPath(); ctx.moveTo(-w / 2, fy); ctx.lineTo(-w / 2 - 3, fy + 0.5); ctx.moveTo(w / 2, fy); ctx.lineTo(w / 2 + 3, fy + 0.5); ctx.stroke();
  }
  ctx.restore();
}

// ---------- dog and cat breeds ----------

type DogPattern = 'plain' | 'saddle' | 'spots' | 'mask' | 'husky' | 'tricolor' | 'patches';
export interface DogBreed {
  name: string;
  coat: string;
  /** the second colour (saddle, spots, mask, patches) */
  mark?: string;
  belly?: string;
  pattern: DogPattern;
  ear: 'flop' | 'prick' | 'long' | 'big' | 'rose';
  tail: 'wag' | 'otter' | 'curl' | 'stub';
  /** body length, body depth, leg length, head size, snout length (1 is average) */
  len: number; depth: number; leg: number; head: number; snout: number;
  eye?: string;
}
export const DOG_BREEDS: DogBreed[] = [
  { name: 'Labrador', coat: '#e2b45e', belly: '#f2d79a', pattern: 'plain', ear: 'flop', tail: 'otter', len: 1.04, depth: 1.05, leg: 1, head: 1.05, snout: 1.05 },
  { name: 'German Shepherd', coat: '#c58a3a', mark: '#1f2937', belly: '#e0b878', pattern: 'saddle', ear: 'prick', tail: 'wag', len: 1.1, depth: 1, leg: 1.05, head: 1, snout: 1.25 },
  { name: 'Dalmatian', coat: '#f8fafc', mark: '#111827', belly: '#ffffff', pattern: 'spots', ear: 'flop', tail: 'wag', len: 1.08, depth: 0.95, leg: 1.12, head: 0.98, snout: 1.1 },
  { name: 'Husky', coat: '#8f9aa8', mark: '#1e293b', belly: '#f8fafc', pattern: 'husky', ear: 'prick', tail: 'curl', len: 1.05, depth: 1.02, leg: 1, head: 1, snout: 1, eye: '#38bdf8' },
  { name: 'Beagle', coat: '#f6ecd6', mark: '#7a4a21', belly: '#ffffff', pattern: 'tricolor', ear: 'long', tail: 'wag', len: 0.95, depth: 0.95, leg: 0.85, head: 1, snout: 0.95 },
  { name: 'Corgi', coat: '#e08a3a', mark: '#f8fafc', belly: '#ffffff', pattern: 'patches', ear: 'big', tail: 'stub', len: 1.12, depth: 0.95, leg: 0.5, head: 1.02, snout: 1 },
  { name: 'Pug', coat: '#dcc59b', mark: '#2b2118', belly: '#efe0bd', pattern: 'mask', ear: 'rose', tail: 'curl', len: 0.82, depth: 1.14, leg: 0.7, head: 1.18, snout: 0.45 },
  { name: 'Local breed', coat: '#c68642', mark: '#7c4a21', belly: '#e9c58f', pattern: 'plain', ear: 'prick', tail: 'wag', len: 1, depth: 0.88, leg: 1.18, head: 0.92, snout: 1.15 },
];
export function dogBreed(col: string | undefined, seed: number): DogBreed {
  const b = DOG_BREEDS[Math.floor(seed * DOG_BREEDS.length) % DOG_BREEDS.length];
  return col ? { ...b, coat: col } : b;
}

type CatPattern = 'plain' | 'tabby' | 'points' | 'tux' | 'calico' | 'ginger' | 'fluffy';
export interface CatBreed {
  name: string;
  coat: string;
  mark?: string;
  pattern: CatPattern;
  /** how big and fluffy (1 is a sleek cat) */
  fluff: number;
  eye: string;
}
export const CAT_BREEDS: CatBreed[] = [
  { name: 'Tabby', coat: '#a98965', mark: '#5b4630', pattern: 'tabby', fluff: 1, eye: '#84cc16' },
  { name: 'Black cat', coat: '#27303f', pattern: 'plain', fluff: 1, eye: '#facc15' },
  { name: 'Siamese', coat: '#f1e4c8', mark: '#4b3a2a', pattern: 'points', fluff: 0.95, eye: '#38bdf8' },
  { name: 'Ginger', coat: '#f59e0b', mark: '#c2410c', pattern: 'ginger', fluff: 1.02, eye: '#84cc16' },
  { name: 'Tuxedo', coat: '#1f2937', pattern: 'tux', fluff: 1, eye: '#84cc16' },
  { name: 'Calico', coat: '#f8fafc', mark: '#f59e0b', pattern: 'calico', fluff: 1, eye: '#a3e635' },
  { name: 'Persian', coat: '#f3f4f6', pattern: 'fluffy', fluff: 1.2, eye: '#fb923c' },
  { name: 'Grey fluffy cat', coat: '#94a3b8', mark: '#64748b', pattern: 'fluffy', fluff: 1.15, eye: '#facc15' },
];
export function catBreed(col: string | undefined, seed: number): CatBreed {
  const b = CAT_BREEDS[Math.floor(seed * CAT_BREEDS.length) % CAT_BREEDS.length];
  return col ? { ...b, coat: col } : b;
}

/** A dog of the given breed from the side, centred on the middle of its body (the caller moves and flips the canvas). */
function drawDogBody(ctx: Ctx, b: DogBreed, k: number, moving: boolean, carrying: boolean, mode: 'office' | 'beach' = 'office') {
  const coat = b.coat;
  const dark = shade(coat, -0.28);
  const belly = b.belly ?? shade(coat, 0.3);
  const mark = b.mark ?? dark;
  const bx = 10.5 * b.len, by = 6.2 * b.depth;
  const legH = 6.5 * b.leg;
  // tail
  ctx.strokeStyle = coat;
  ctx.lineCap = 'round';
  const wag = Math.sin(k * (mode === 'beach' ? 12 : 15));
  if (b.tail === 'otter') {
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(-bx + 1, -3); ctx.quadraticCurveTo(-bx - 4, -2 + wag * 1.4, -bx - 7, 0 + wag * 2); ctx.stroke();
  } else if (b.tail === 'curl') {
    ctx.lineWidth = 3.2;
    ctx.beginPath(); ctx.moveTo(-bx + 1, -4); ctx.bezierCurveTo(-bx - 5, -7, -bx - 3, -14 + wag, -bx + 3, -11); ctx.stroke();
  } else if (b.tail === 'stub') {
    disc(ctx, -bx + 0.5, -4 + wag * 0.4, 2.1, coat);
  } else {
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(-bx + 1.5, -3); ctx.quadraticCurveTo(-bx - 4, -8 + wag * 3, -bx - 3, -12 + wag * 2); ctx.stroke();
  }
  // legs (the far pair a little darker)
  for (const [lx, ph, far] of [[-bx * 0.57, 0, true], [-bx * 0.24, Math.PI, false], [bx * 0.38, Math.PI, true], [bx * 0.7, 0, false]] as const) {
    const swing = moving ? Math.sin(k * 11 + ph) * (mode === 'beach' ? 3.4 : 2.6) : 0;
    ctx.fillStyle = far ? shade(coat, -0.34) : (b.pattern === 'patches' || b.pattern === 'tricolor' || b.pattern === 'husky' ? belly : dark);
    rr(ctx, lx - 1.4 + swing, 2 + (6.5 - legH) * 0.4, 2.8, legH - (moving && swing < 0 ? 1 : 0), 1.2);
    ctx.fill();
  }
  // body
  ellipse(ctx, 0, -1.5, bx, by, coat);
  ellipse(ctx, 0, 1, bx * 0.76, by * 0.52, belly);
  if (b.pattern === 'saddle') ellipse(ctx, -1, -4.4, bx * 0.66, by * 0.5, mark, 0);
  if (b.pattern === 'tricolor') { ellipse(ctx, -1, -4.2, bx * 0.6, by * 0.5, '#1f2937'); ellipse(ctx, 4.5, -1, 3.6, 2.6, mark); }
  if (b.pattern === 'patches') { ellipse(ctx, -2, -3.6, bx * 0.55, by * 0.55, coat); ellipse(ctx, bx * 0.6, 0.4, 3, 3.6, mark); }
  if (b.pattern === 'husky') ellipse(ctx, -1, -4.8, bx * 0.82, by * 0.42, mark);
  if (b.pattern === 'spots') { for (const [qx, qy, qr] of [[-6, -3, 1.9], [-2, -5, 1.4], [2, -2, 2], [6, -4, 1.5], [-4, 1, 1.3], [8, 0, 1.2], [0, 1.5, 1.1]] as const) disc(ctx, qx * b.len, qy, qr, mark); }
  // head
  const hs = b.head;
  const hx = bx * 0.95;
  disc(ctx, hx, -6.5, 5.4 * hs, coat);
  if (b.pattern === 'husky') { ctx.fillStyle = mark; ctx.beginPath(); ctx.arc(hx, -6.5, 5.4 * hs, Math.PI * 1.05, Math.PI * 1.95); ctx.fill(); ellipse(ctx, hx + 2.6, -4.6, 3.4 * hs, 2.8 * hs, '#f8fafc'); }
  if (b.pattern === 'mask') ellipse(ctx, hx + 3.2, -4.4, 3.8 * hs, 3.2 * hs, mark);
  const snx = hx + 4.6 * b.snout * 0.9 + 0.4;
  ellipse(ctx, snx, -4.8, 3.4 * b.snout, 2.4 * hs, b.pattern === 'mask' ? mark : shade(coat, 0.25));
  disc(ctx, snx + 2.8 * b.snout, -5.2, 1.3, '#111827');
  disc(ctx, hx + 1.8, -7.8, 1, b.eye ?? '#111827');
  // ears
  if (b.ear === 'prick' || b.ear === 'big') {
    const eh = b.ear === 'big' ? 9 : 7;
    ctx.fillStyle = b.pattern === 'saddle' || b.pattern === 'husky' ? mark : coat;
    ctx.beginPath(); ctx.moveTo(hx - 3.6, -9); ctx.lineTo(hx - 1.4, -9 - eh); ctx.lineTo(hx + 1.6, -10); ctx.closePath(); ctx.fill();
    ctx.fillStyle = shade(coat, 0.3);
    ctx.beginPath(); ctx.moveTo(hx - 2.8, -9.4); ctx.lineTo(hx - 1.4, -9 - eh * 0.7); ctx.lineTo(hx + 0.4, -10); ctx.closePath(); ctx.fill();
  } else {
    const long = b.ear === 'long' ? 1.5 : b.ear === 'rose' ? 0.55 : 1;
    ellipse(ctx, hx - 2.4, -10.5 + (b.ear === 'long' ? 3 : 0) + Math.sin(k * 6) * 0.5, 2.4 * hs, 3.8 * long * hs, b.pattern === 'mask' || b.pattern === 'tricolor' || b.pattern === 'spots' ? mark : dark, 0.45);
  }
  // collar and tongue
  ctx.fillStyle = '#dc2626';
  rr(ctx, hx - 5.6, -6, 3, 6, 1.3);
  ctx.fill();
  if (moving) ellipse(ctx, snx + 0.8, -2.2, 1.4, 2 + Math.sin(k * 14) * 0.4, '#f472b6');
  if (carrying) { disc(ctx, snx + 4.8, -2.5, 3.2, mode === 'beach' ? '#38bdf8' : '#d9f99d'); ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.arc(snx + 4.8, -2.5, 3.2, 0.4, 2.6); ctx.stroke(); }
}

/** A cat of the given breed, awake and walking, from the side. */
function drawCatBody(ctx: Ctx, b: CatBreed, k: number, moving: boolean) {
  const coat = b.coat;
  const f = b.fluff;
  const mark = b.mark ?? shade(coat, -0.3);
  const point = b.pattern === 'points' ? mark : coat;
  // the tail: long and thin, or a big plume for the fluffy breeds
  ctx.strokeStyle = b.pattern === 'points' ? mark : coat;
  ctx.lineWidth = (b.pattern === 'fluffy' ? 4.6 : 2.6);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-8 * f, -3);
  ctx.quadraticCurveTo(-15 * f, -6 + Math.sin(k * 4) * 2, -13 * f, -15);
  ctx.stroke();
  if (b.pattern === 'tabby' || b.pattern === 'ginger') { ctx.strokeStyle = mark; ctx.lineWidth = 2.6; ctx.setLineDash([2, 3]); ctx.beginPath(); ctx.moveTo(-8 * f, -3); ctx.quadraticCurveTo(-15 * f, -6 + Math.sin(k * 4) * 2, -13 * f, -15); ctx.stroke(); ctx.setLineDash([]); }
  for (const [lx, ph] of [[-5.5, 0], [-2, Math.PI], [4, Math.PI], [7, 0]] as const) {
    const sw = moving ? Math.sin(k * 12 + ph) * 2.4 : 0;
    ctx.fillStyle = b.pattern === 'points' ? mark : b.pattern === 'tux' || b.pattern === 'calico' ? '#f8fafc' : shade(coat, -0.2);
    rr(ctx, lx * f - 1.2 + sw, 2, 2.4, 6, 1);
    ctx.fill();
  }
  ellipse(ctx, 0, -1.5, 9.5 * f, 5.2 * f, coat);
  if (b.pattern === 'fluffy') { ellipse(ctx, 7, -1, 4 * f, 5 * f, shade(coat, 0.12)); }
  if (b.pattern === 'tabby' || b.pattern === 'ginger') { ctx.strokeStyle = mark; ctx.lineWidth = 1.3; for (let q = -3; q <= 3; q++) { ctx.beginPath(); ctx.moveTo(q * 2.6, -5.8 * f); ctx.lineTo(q * 2.6 + 0.8, -1.5); ctx.stroke(); } }
  if (b.pattern === 'tux') ellipse(ctx, 4, 1.4, 5, 3, '#f8fafc');
  if (b.pattern === 'calico') { ellipse(ctx, -3, -3, 3.6, 2.4, '#f59e0b'); ellipse(ctx, 3, -1, 3, 2.4, '#1f2937'); }
  // head
  disc(ctx, 9 * f, -5, 4.6 * f, b.pattern === 'points' ? shade(coat, -0.05) : coat);
  if (b.pattern === 'points') ellipse(ctx, 10.4 * f, -4.4, 3, 2.6, mark);
  if (b.pattern === 'tux') ellipse(ctx, 11 * f, -3.8, 2.6, 2.4, '#f8fafc');
  ctx.fillStyle = point;
  ctx.beginPath();
  ctx.moveTo(6 * f, -8.5); ctx.lineTo(7 * f, -13); ctx.lineTo(9.6 * f, -9);
  ctx.moveTo(10 * f, -9); ctx.lineTo(12.4 * f, -12.6); ctx.lineTo(13 * f, -7.6);
  ctx.fill();
  disc(ctx, 11 * f, -5.8, 0.95, b.eye);
  disc(ctx, 13.4 * f - (b.pattern === 'fluffy' ? 1.2 : 0), -4.2, 0.9, '#f472b6');
}

/** One breed drawn on its own, centred on (0, 0): for pickers and previews. */
export function drawBreedPortrait(ctx: Ctx, kind: 'dog' | 'cat', index: number, t: number, moving = false) {
  if (kind === 'dog') drawDogBody(ctx, DOG_BREEDS[index % DOG_BREEDS.length], t / 1000, moving, false);
  else drawCatBody(ctx, CAT_BREEDS[index % CAT_BREEDS.length], t / 1000, moving);
}

/** A round game table with a board, cards and dice, and a screen glowing on one side. */
function drawGameTable(ctx: Ctx, x: number, y: number, W: number, H: number, t: number, seed: number) {
  const cx = x + W / 2, cy = y + H / 2 + 2;
  softShadow(ctx, x, y, W, H, 12);
  ellipse(ctx, cx, cy + 3, W * 0.42, H * 0.38, 'rgba(60,35,15,0.35)');
  const g = ctx.createRadialGradient(cx - 8, cy - 8, 3, cx, cy, W * 0.42);
  g.addColorStop(0, '#2f9e6d'); g.addColorStop(1, '#1b6b4a');
  ctx.fillStyle = '#7a4b2a'; ctx.beginPath(); ctx.ellipse(cx, cy, W * 0.43, H * 0.4, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(cx, cy, W * 0.37, H * 0.33, 0, 0, Math.PI * 2); ctx.fill();
  // a fan of cards, dice and counters
  ctx.save(); ctx.translate(cx - 12, cy - 4);
  for (let i = 0; i < 4; i++) { ctx.save(); ctx.rotate(-0.5 + i * 0.3); ctx.fillStyle = '#f8fafc'; rr(ctx, -4, -9, 8, 12, 1.5); ctx.fill(); ctx.fillStyle = i % 2 ? '#dc2626' : '#111827'; ctx.fillRect(-1.5, -6, 3, 3); ctx.restore(); }
  ctx.restore();
  const roll = Math.floor(t / 1800 + seed * 7) % 6;
  ctx.fillStyle = '#f8fafc'; rr(ctx, cx + 8, cy - 3, 7, 7, 1.5); ctx.fill();
  ctx.fillStyle = '#111827'; for (let i = 0; i <= roll % 3; i++) disc(ctx, cx + 10 + (i % 2) * 3, cy - 1 + Math.floor(i / 2) * 3, 0.9, '#111827');
  for (const [dx, dy, c] of [[4, 8, '#ef4444'], [8, 9, '#3b82f6'], [12, 8, '#facc15'], [-4, 9, '#a855f7']] as const) disc(ctx, cx + dx, cy + dy, 2, c);
  // a small glowing screen on the rim says it is playable
  const on = 0.7 + Math.sin(t / 500 + seed * 9) * 0.3;
  ctx.fillStyle = `rgba(56,189,248,${on})`; rr(ctx, cx - 5, y + 2, 10, 5, 1.5); ctx.fill();
}

/** A big brass gong on a wooden frame. */
function drawGong(ctx: Ctx, x: number, y: number, W: number, H: number, t: number, seed: number) {
  const cx = x + W / 2;
  ellipse(ctx, cx + 2, y + H - 3, 14, 4, 'rgba(30,20,10,0.28)');
  ctx.fillStyle = '#6b4423';
  rr(ctx, x + 3, y + 6, 4, H - 8, 1.5); ctx.fill();
  rr(ctx, x + W - 7, y + 6, 4, H - 8, 1.5); ctx.fill();
  rr(ctx, x + 2, y + 4, W - 4, 4, 2); ctx.fill();
  rr(ctx, x + 1, y + H - 6, 9, 4, 2); ctx.fill();
  rr(ctx, x + W - 10, y + H - 6, 9, 4, 2); ctx.fill();
  const sway = Math.sin(t / 700 + seed * 5) * 0.6;
  const gy = y + H / 2 + 3;
  const g = ctx.createRadialGradient(cx - 3, gy - 3, 1, cx, gy, 11);
  g.addColorStop(0, '#fde68a'); g.addColorStop(0.55, '#d4a017'); g.addColorStop(1, '#8a5a0b');
  ctx.strokeStyle = '#d6c8a8'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(cx - 6, y + 8); ctx.lineTo(cx - 5 + sway, gy - 9); ctx.moveTo(cx + 6, y + 8); ctx.lineTo(cx + 5 + sway, gy - 9); ctx.stroke();
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx + sway, gy, 10.5, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#7a4f08'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(cx + sway, gy, 10.5, 0, Math.PI * 2); ctx.stroke();
  ctx.strokeStyle = 'rgba(122,79,8,0.45)'; ctx.beginPath(); ctx.arc(cx + sway, gy, 6.5, 0, Math.PI * 2); ctx.stroke();
  disc(ctx, cx + sway, gy, 2.4, '#b8860b');
  ctx.fillStyle = '#7c2d12'; ctx.beginPath(); ctx.arc(x + W - 5, y + H - 9, 2.6, 0, Math.PI * 2); ctx.fill();
}

const WOODS = ['#c08a55', '#a9794a', '#8a5a33', '#e4c9a0'];

function deskTop(ctx: Ctx, x: number, y: number, W: number, H: number, wood: string) {
  softShadow(ctx, x, y, W, H, 6);
  ctx.fillStyle = shade(wood, -0.35);
  rr(ctx, x + 2, y + H * 0.55, W - 4, H * 0.45 - 1, 4);
  ctx.fill();
  ctx.fillStyle = vgrad(ctx, y + 3, y + H * 0.7, shade(wood, 0.18), wood);
  rr(ctx, x + 1, y + 3, W - 2, H * 0.62, 6);
  ctx.fill();
  ctx.strokeStyle = 'rgba(70,40,15,0.22)';
  ctx.lineWidth = 1;
  for (let i = 1; i < 4; i++) { ctx.beginPath(); ctx.moveTo(x + 6, y + 3 + i * (H * 0.62) / 4); ctx.lineTo(x + W - 6, y + 3 + i * (H * 0.62) / 4); ctx.stroke(); }
  ctx.fillStyle = 'rgba(255,255,255,0.22)';
  rr(ctx, x + 4, y + 4, W - 8, 2.2, 1);
  ctx.fill();
}

/** A sit-stand desk: a white top on two steel legs, with a little height display. */
function drawStandingDesk(ctx: Ctx, x: number, y: number, W: number, H: number, t: number, seed: number, col: string | undefined) {
  softShadow(ctx, x, y, W, H, 4);
  ctx.fillStyle = '#94a3b8';
  rr(ctx, x + 6, y + 15, 5, H - 17, 2); ctx.fill();
  rr(ctx, x + W - 11, y + 15, 5, H - 17, 2); ctx.fill();
  ctx.fillStyle = '#64748b';
  rr(ctx, x + 2, y + H - 5, 16, 3, 1.5); ctx.fill();
  rr(ctx, x + W - 18, y + H - 5, 16, 3, 1.5); ctx.fill();
  ctx.fillStyle = vgrad(ctx, y + 3, y + 17, shade(col ?? '#e2e8f0', 0.2), col ?? '#cbd5e1');
  rr(ctx, x + 1, y + 3, W - 2, 14, 5); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  rr(ctx, x + 4, y + 4.5, W - 8, 2, 1); ctx.fill();
  ctx.fillStyle = '#0f172a';
  rr(ctx, x + W - 22, y + 10, 14, 5, 1.5); ctx.fill();
  ctx.fillStyle = '#4ade80';
  ctx.font = '700 4.4px ui-monospace, monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(String(105 + Math.floor(seed * 20)) + 'cm', x + W - 15, y + 12.6);
  const up = 0.5 + Math.sin(t / 2600 + seed * 6) * 0;
  disc(ctx, x + 12, y + 10.5, 1.4 + up, '#38bdf8');
}

/** A big executive desk: dark leather top, a drawer pedestal on each side and a brass lamp. */
function drawExecDesk(ctx: Ctx, x: number, y: number, W: number, H: number, col: string | undefined) {
  const wood = col ?? '#7a4b2a';
  softShadow(ctx, x, y, W, H, 8);
  ctx.fillStyle = shade(wood, -0.3);
  rr(ctx, x + 3, y + H * 0.38, 20, H * 0.6, 4); ctx.fill();
  rr(ctx, x + W - 23, y + H * 0.38, 20, H * 0.6, 4); ctx.fill();
  ctx.fillStyle = shade(wood, -0.1);
  for (const dx of [5, W - 21]) for (let i = 0; i < 3; i++) { rr(ctx, x + dx, y + H * 0.42 + i * 11, 16, 9, 2); ctx.fill(); ctx.fillStyle = '#e4c36a'; ctx.fillRect(x + dx + 6, y + H * 0.42 + 3.5 + i * 11, 4, 1.6); ctx.fillStyle = shade(wood, -0.1); }
  ctx.fillStyle = vgrad(ctx, y + 4, y + H * 0.5, shade(wood, 0.16), wood);
  rr(ctx, x + 1, y + 4, W - 2, H * 0.46, 7); ctx.fill();
  ctx.fillStyle = '#1f2a1f';
  rr(ctx, x + W / 2 - 24, y + 9, 48, H * 0.3, 3); ctx.fill();
  ctx.strokeStyle = '#d6b45a'; ctx.lineWidth = 1;
  rr(ctx, x + W / 2 - 24, y + 9, 48, H * 0.3, 3); ctx.stroke();
  ctx.fillStyle = '#d6b45a';
  ctx.beginPath(); ctx.arc(x + W - 14, y + 13, 4.5, Math.PI, 0); ctx.fill();
  ctx.fillRect(x + W - 15, y + 13, 2, 7);
  ctx.fillStyle = 'rgba(255,255,255,0.2)'; rr(ctx, x + 5, y + 6, W - 10, 2.4, 1); ctx.fill();
  ctx.fillStyle = '#f8fafc'; rr(ctx, x + 12, y + 12, 10, 12, 1); ctx.fill();
  ctx.fillStyle = '#94a3b8'; ctx.fillRect(x + 14, y + 15, 6, 1); ctx.fillRect(x + 14, y + 18, 6, 1); ctx.fillRect(x + 14, y + 21, 4, 1);
}

/** An L-shaped corner desk for two screens. */
function drawCornerDesk(ctx: Ctx, x: number, y: number, W: number, H: number, col: string | undefined) {
  const wood = col ?? '#b98a58';
  softShadow(ctx, x, y, W, H, 6);
  ctx.fillStyle = shade(wood, -0.38);
  rr(ctx, x + 3, y + 8, W - 6, 14, 4); ctx.fill();
  rr(ctx, x + 3, y + 8, 18, H - 12, 4); ctx.fill();
  ctx.fillStyle = vgrad(ctx, y + 3, y + 20, shade(wood, 0.2), wood);
  rr(ctx, x + 1, y + 3, W - 2, 16, 6); ctx.fill();
  ctx.fillStyle = vgrad(ctx, y + 3, y + H, shade(wood, 0.12), wood);
  rr(ctx, x + 1, y + 3, 20, H - 8, 6); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.22)';
  rr(ctx, x + 4, y + 4.5, W - 8, 2, 1); ctx.fill();
  rr(ctx, x + 3.5, y + 6, 2, H - 16, 1); ctx.fill();
  ctx.strokeStyle = 'rgba(70,40,15,0.2)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(x + 21, y + 4); ctx.lineTo(x + 21, y + 19); ctx.stroke();
}

/** One or two monitors on a stand with live charts on the screens. */
function drawMonitors(ctx: Ctx, x: number, y: number, t: number, seed: number, n: 1 | 2) {
  const screens = n === 2 ? [[x + 2, 14], [x + 18, 14]] : [[x + 2, 31]];
  ctx.fillStyle = 'rgba(15,23,42,0.18)';
  rr(ctx, x + 6, y + 20, 26, 4, 2); ctx.fill();
  const tick = Math.floor(t / 900 + seed * 9);
  screens.forEach(([sx, sw], k) => {
    ctx.fillStyle = '#111827';
    rr(ctx, sx, y + 3, sw, n === 2 ? 15 : 13, 2.5); ctx.fill();
    ctx.fillStyle = vgrad(ctx, y + 4.5, y + 16, k ? '#0f766e' : '#1e3a8a', k ? '#0ea5e9' : '#6366f1');
    rr(ctx, sx + 1.5, y + 4.5, sw - 3, n === 2 ? 12 : 10, 1.5); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    const bars = Math.floor((sw - 6) / 3);
    for (let i = 0; i < bars; i++) { const bh = 2 + h2(tick + k * 3, i + 1) * (n === 2 ? 8 : 6); ctx.fillRect(sx + 3 + i * 3, y + (n === 2 ? 15.5 : 13.5) - bh, 2, bh); }
    ctx.fillStyle = '#374151';
    ctx.fillRect(sx + sw / 2 - 1, y + (n === 2 ? 18 : 16), 2, 3);
  });
  ctx.fillStyle = '#4b5563';
  rr(ctx, x + 11, y + 20, 14, 2, 1); ctx.fill();
  ctx.fillStyle = '#e5e7eb'; rr(ctx, x + 7, y + 24, 22, 4, 1.5); ctx.fill();
}

function boardFrame(ctx: Ctx, x: number, y: number, W: number, H: number, face: string) {
  softShadow(ctx, x, y, W, H, 4);
  ctx.fillStyle = '#64748b';
  rr(ctx, x + 1, y + 1, W - 2, H - 4, 4); ctx.fill();
  ctx.fillStyle = face;
  rr(ctx, x + 4, y + 4, W - 8, H - 11, 3); ctx.fill();
}

/** A wall chart of sales: bars that grow in, a trend line and a target. */
function drawBarChart(ctx: Ctx, x: number, y: number, W: number, H: number, t: number) {
  boardFrame(ctx, x, y, W, H, '#f8fafc');
  const bx = x + 9, by = y + H - 13, bw = W - 18;
  ctx.strokeStyle = '#cbd5e1'; ctx.lineWidth = 1;
  for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(bx, by - 5 - i * 6); ctx.lineTo(bx + bw, by - 5 - i * 6); ctx.stroke(); }
  const vals = [0.35, 0.5, 0.42, 0.7, 0.62, 0.9];
  const grow = Math.min(1, ((t / 1000) % 9) / 1.4);
  vals.forEach((v, i) => { ctx.fillStyle = i === 5 ? '#16a34a' : '#3b82f6'; const bh = v * 20 * grow; ctx.fillRect(bx + 2 + i * (bw / 6), by - bh, bw / 6 - 3, bh); });
  ctx.strokeStyle = '#f97316'; ctx.lineWidth = 1.5; ctx.beginPath();
  vals.forEach((v, i) => { const px = bx + 2 + i * (bw / 6) + (bw / 12 - 1.5), py = by - v * 20 * grow - 2; if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py); });
  ctx.stroke();
  ctx.fillStyle = '#334155'; ctx.font = '700 5px system-ui, sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  ctx.fillText('SALES', x + 8, y + 9);
}

/** A team chart: a boss, a row of leads and their people. */
function drawOrgChart(ctx: Ctx, x: number, y: number, W: number, H: number) {
  boardFrame(ctx, x, y, W, H, '#fffbeb');
  const box = (cx: number, cy: number, c: string) => { ctx.fillStyle = c; rr(ctx, cx - 6, cy - 3.5, 12, 7, 2); ctx.fill(); };
  ctx.strokeStyle = '#94a3b8'; ctx.lineWidth = 1;
  const top = { x: x + W / 2, y: y + 11 };
  const mid = [x + W * 0.25, x + W * 0.5, x + W * 0.75].map((cx) => ({ x: cx, y: y + 23 }));
  ctx.beginPath(); ctx.moveTo(top.x, top.y + 4); ctx.lineTo(top.x, y + 17); ctx.moveTo(mid[0].x, y + 17); ctx.lineTo(mid[2].x, y + 17); mid.forEach((m) => { ctx.moveTo(m.x, y + 17); ctx.lineTo(m.x, m.y - 4); }); ctx.stroke();
  box(top.x, top.y, '#6366f1');
  mid.forEach((m, i) => box(m.x, m.y, ['#0ea5e9', '#10b981', '#f59e0b'][i]));
  for (const m of mid) disc(ctx, m.x, y + 35, 2.4, '#94a3b8');
}

/** A world map with glowing pins where the team works. */
function drawWorldMap(ctx: Ctx, x: number, y: number, W: number, H: number, t: number) {
  boardFrame(ctx, x, y, W, H, '#bfdbfe');
  ctx.fillStyle = '#86b87c';
  const land: [number, number, number, number][] = [[0.1, 0.25, 0.2, 0.28], [0.22, 0.58, 0.08, 0.2], [0.44, 0.2, 0.1, 0.18], [0.46, 0.42, 0.1, 0.3], [0.58, 0.2, 0.26, 0.26], [0.78, 0.6, 0.1, 0.12]];
  for (const [lx, ly, lw, lh] of land) { ctx.beginPath(); ctx.ellipse(x + 5 + (W - 10) * (lx + lw / 2), y + 5 + (H - 14) * (ly + lh / 2), (W - 10) * lw / 2, (H - 14) * lh / 2, 0, 0, Math.PI * 2); ctx.fill(); }
  const pins: [number, number, string][] = [[0.5, 0.5, '#ef4444'], [0.3, 0.32, '#f59e0b'], [0.72, 0.3, '#6366f1']];
  pins.forEach(([px, py, c], i) => {
    const cx = x + 5 + (W - 10) * px, cy = y + 5 + (H - 14) * py;
    const pulse = ((t / 1400 + i * 0.3) % 1);
    ctx.strokeStyle = c; ctx.globalAlpha = 1 - pulse; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.arc(cx, cy, 2 + pulse * 7, 0, Math.PI * 2); ctx.stroke(); ctx.globalAlpha = 1;
    disc(ctx, cx, cy, 2.2, c);
  });
}

/** A task board: three columns of sticky notes. */
function drawKanban(ctx: Ctx, x: number, y: number, W: number, H: number, seed: number) {
  boardFrame(ctx, x, y, W, H, '#f1f5f9');
  const cw = (W - 14) / 3;
  const heads = ['#94a3b8', '#3b82f6', '#16a34a'];
  for (let c = 0; c < 3; c++) {
    ctx.fillStyle = heads[c]; rr(ctx, x + 6 + c * cw, y + 6, cw - 3, 4, 1.5); ctx.fill();
    const n = 3 - c + (Math.floor(seed * 10) % 2);
    for (let i = 0; i < Math.min(3, n); i++) { ctx.fillStyle = ['#fde047', '#fb7185', '#7dd3fc', '#86efac'][(c + i) % 4]; ctx.fillRect(x + 7 + c * cw, y + 12 + i * 8, cw - 5, 6.4); }
  }
}

/** Flowers and a big leaf plant in a pot: each a different, hand-drawn shape. */
function drawBloom(ctx: Ctx, kind: string, x: number, y: number, W: number, H: number, t: number, seed: number, col: string | undefined) {
  const cx = x + W / 2, base = y + H - 5;
  const sway = Math.sin(t / 1100 + seed * 6) * 1.2;
  ellipse(ctx, cx + 2, base + 1, 11, 4, 'rgba(30,20,10,0.25)');
  const pot = col ?? (kind === 'orchid' ? '#f8fafc' : kind === 'monstera' ? '#334155' : '#c2703d');
  ctx.fillStyle = shade(pot, -0.2); rr(ctx, cx - 7, base - 9, 14, 10, 2.5); ctx.fill();
  ctx.fillStyle = pot; rr(ctx, cx - 8, base - 11, 16, 4, 2); ctx.fill();
  ctx.fillStyle = '#5b3a1e'; ctx.fillRect(cx - 6, base - 11, 12, 1.6);
  const stem = (sx: number, sy: number, ex: number, ey: number) => { ctx.strokeStyle = '#3f8f4a'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(sx, sy); ctx.quadraticCurveTo(sx + (ex - sx) * 0.2, sy - (sy - ey) * 0.6, ex + sway * 0.4, ey); ctx.stroke(); };
  if (kind === 'sunflowers') {
    for (const [dx, hgt, r] of [[-6, 20, 6], [0, 26, 7], [6, 18, 5.5]] as const) {
      const ex = cx + dx + sway * 0.6, ey = base - 11 - hgt;
      stem(cx + dx * 0.4, base - 11, ex, ey);
      for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; ctx.fillStyle = '#facc15'; ctx.beginPath(); ctx.ellipse(ex + Math.cos(a) * r * 0.85, ey + Math.sin(a) * r * 0.85, r * 0.5, r * 0.22, a, 0, Math.PI * 2); ctx.fill(); }
      disc(ctx, ex, ey, r * 0.55, '#6b3f16'); disc(ctx, ex - 1, ey - 1, r * 0.22, '#8a5a2a');
    }
  } else if (kind === 'orchid') {
    stem(cx, base - 11, cx + 5 + sway, base - 32);
    for (let i = 0; i < 4; i++) { const px = cx + 1 + i * 1.6 + sway * (i / 4), py = base - 18 - i * 5; for (const a of [0, 1.26, 2.5, 3.8, 5.0]) { ctx.fillStyle = i % 2 ? '#e879f9' : '#f0abfc'; ctx.beginPath(); ctx.ellipse(px + Math.cos(a) * 3.2, py + Math.sin(a) * 3.2, 3, 1.8, a, 0, Math.PI * 2); ctx.fill(); } disc(ctx, px, py, 1.4, '#fde047'); }
    ctx.fillStyle = '#2f8a46'; ctx.beginPath(); ctx.ellipse(cx - 7, base - 15, 7, 2.4, -0.5, 0, Math.PI * 2); ctx.fill(); ctx.beginPath(); ctx.ellipse(cx + 8, base - 14, 7, 2.4, 0.5, 0, Math.PI * 2); ctx.fill();
  } else if (kind === 'lavender') {
    for (let i = 0; i < 9; i++) { const dx = (i - 4) * 2.1, ex = cx + dx * 1.4 + sway * (0.4 + (i % 3) * 0.2), ey = base - 24 - (i % 3) * 3; stem(cx + dx * 0.5, base - 11, ex, ey); for (let k = 0; k < 6; k++) { ctx.fillStyle = k % 2 ? '#a78bfa' : '#8b5cf6'; ctx.beginPath(); ctx.ellipse(ex + (k % 2 ? 1 : -1) * 0.8, ey + k * 2.1, 1.5, 1.2, 0, 0, Math.PI * 2); ctx.fill(); } }
  } else if (kind === 'tulips') {
    for (const [dx, hgt, c] of [[-6, 18, '#ef4444'], [0, 24, '#f472b6'], [6, 17, '#fbbf24']] as const) {
      const ex = cx + dx + sway * 0.5, ey = base - 11 - hgt;
      stem(cx + dx * 0.4, base - 11, ex, ey);
      ctx.fillStyle = shade(c, -0.18); ctx.beginPath(); ctx.ellipse(ex, ey + 1, 4.4, 5.4, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = c; ctx.beginPath(); ctx.moveTo(ex - 4, ey + 1); ctx.lineTo(ex - 2.6, ey - 5); ctx.lineTo(ex, ey - 1.5); ctx.lineTo(ex + 2.6, ey - 5); ctx.lineTo(ex + 4, ey + 1); ctx.quadraticCurveTo(ex, ey + 6, ex - 4, ey + 1); ctx.fill();
    }
  } else {
    // monstera: big glossy split leaves
    for (const [dx, hgt, r, rot] of [[-7, 14, 9, -0.5], [7, 17, 10, 0.5], [0, 26, 11, 0]] as const) {
      const ex = cx + dx + sway * 0.7, ey = base - 11 - hgt;
      stem(cx + dx * 0.3, base - 11, ex, ey);
      ctx.save(); ctx.translate(ex, ey); ctx.rotate(rot + sway * 0.03);
      ctx.fillStyle = '#237a43'; ctx.beginPath(); ctx.ellipse(0, -2, r, r * 0.8, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#34a85a'; ctx.beginPath(); ctx.ellipse(-1, -3, r * 0.75, r * 0.55, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#17572f'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(0, 5); ctx.lineTo(0, -9); ctx.stroke();
      ctx.fillStyle = 'rgba(0,0,0,0.0)';
      for (const a of [-0.9, -0.3, 0.3, 0.9]) { ctx.fillStyle = '#e8f1e0'; ctx.beginPath(); ctx.ellipse(Math.sin(a) * r * 0.9, -2 + Math.cos(a) * 0.2 * r, 1.4, 2.6, a, 0, Math.PI * 2); ctx.fill(); }
      ctx.restore();
    }
  }
}

function drawFileCabinet(ctx: Ctx, x: number, y: number, W: number, H: number, col: string | undefined) {
  const c = col ?? '#94a3b8';
  softShadow(ctx, x, y, W, H, 4);
  ctx.fillStyle = shade(c, -0.25); rr(ctx, x + 6, y + 4, W - 12, H - 6, 3); ctx.fill();
  for (let i = 0; i < 3; i++) {
    ctx.fillStyle = vgrad(ctx, y + 6 + i * 9, y + 14 + i * 9, shade(c, 0.15), c); rr(ctx, x + 8, y + 6 + i * 9.4, W - 16, 8.4, 2); ctx.fill();
    ctx.fillStyle = '#1e293b'; rr(ctx, x + W / 2 - 4, y + 9.4 + i * 9.4, 8, 2.2, 1); ctx.fill();
    ctx.fillStyle = '#f8fafc'; ctx.fillRect(x + W / 2 - 3, y + 7.2 + i * 9.4, 6, 1.6);
  }
}

/** Table football: a green pitch with rods of little players that slide back and forth. */
function drawFoosball(ctx: Ctx, x: number, y: number, W: number, H: number, t: number, seed: number) {
  softShadow(ctx, x, y, W, H, 5);
  ctx.fillStyle = '#7c4a21'; rr(ctx, x + 1, y + 4, W - 2, H - 7, 5); ctx.fill();
  ctx.fillStyle = '#2f9e44'; rr(ctx, x + 5, y + 8, W - 10, H - 16, 3); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 1; ctx.strokeRect(x + 8, y + 10.5, W - 16, H - 21);
  ctx.beginPath(); ctx.moveTo(x + W / 2, y + 10.5); ctx.lineTo(x + W / 2, y + H - 10.5); ctx.stroke();
  for (let i = 0; i < 4; i++) {
    const rx = x + 14 + i * ((W - 28) / 3);
    const slide = Math.sin(t / 700 + i * 1.7 + seed * 5) * 3.4;
    ctx.strokeStyle = '#d1d5db'; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(rx, y + 3); ctx.lineTo(rx, y + H - 4); ctx.stroke();
    for (let k = 0; k < 3; k++) { ctx.fillStyle = i % 2 ? '#3b82f6' : '#ef4444'; ctx.fillRect(rx - 1.6, y + 12 + k * 7 + slide, 3.2, 4.6); }
  }
  const bx = x + W / 2 + Math.sin(t / 900) * 9, by = y + H / 2 + Math.cos(t / 620 + seed) * 2.2;
  disc(ctx, bx, by, 1.6, '#fff');
  ctx.fillStyle = '#111827'; rr(ctx, x + W - 4, y + H / 2 - 3, 4, 6, 1); ctx.fill(); rr(ctx, x, y + H / 2 - 3, 4, 6, 1); ctx.fill();
}

/** A table-tennis table with a net and a ball flying back and forth. */
function drawTableTennis(ctx: Ctx, x: number, y: number, W: number, H: number, t: number) {
  softShadow(ctx, x, y, W, H, 7);
  ctx.fillStyle = '#1e293b'; ctx.fillRect(x + 8, y + H - 10, 3, 8); ctx.fillRect(x + W - 11, y + H - 10, 3, 8);
  ctx.fillStyle = vgrad(ctx, y + 6, y + H - 8, '#1d4ed8', '#1e40af'); rr(ctx, x + 3, y + 6, W - 6, H - 15, 5); ctx.fill();
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.6; rr(ctx, x + 6, y + 9, W - 12, H - 21, 3); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x + 6, y + (H - 9) / 2 + 1); ctx.lineTo(x + W - 6, y + (H - 9) / 2 + 1); ctx.lineWidth = 1; ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.fillRect(x + W / 2 - 0.8, y + 4, 1.6, H - 12);
  ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 1; ctx.strokeRect(x + W / 2 - 2.5, y + 4, 5, H - 12);
  const ph = (t / 800) % 2, u = ph < 1 ? ph : 2 - ph;
  const bx = x + 14 + u * (W - 28), arc = Math.sin(u * Math.PI) * 7;
  ellipse(ctx, bx, y + H / 2 + 1, 2, 1, 'rgba(0,0,0,0.25)'); disc(ctx, bx, y + H / 2 - arc, 2, '#fb923c');
}

/** A soundproof phone booth with a frosted glass door and a "busy" light. */
function drawPhoneBooth(ctx: Ctx, x: number, y: number, W: number, H: number, t: number, col: string | undefined) {
  const c = col ?? '#334155';
  softShadow(ctx, x, y, W, H, 6);
  ctx.fillStyle = shade(c, -0.25); rr(ctx, x + 3, y + 2, W - 6, H - 4, 6); ctx.fill();
  ctx.fillStyle = c; rr(ctx, x + 3, y + 2, W - 6, 10, 5); ctx.fill();
  ctx.fillStyle = vgrad(ctx, y + 14, y + H - 6, 'rgba(186,230,253,0.85)', 'rgba(125,180,220,0.7)'); rr(ctx, x + 7, y + 14, W - 14, H - 22, 4); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x + 11, y + 20); ctx.lineTo(x + 17, y + 14); ctx.moveTo(x + 11, y + 30); ctx.lineTo(x + 24, y + 16); ctx.stroke();
  ctx.fillStyle = '#e2e8f0'; ctx.fillRect(x + W - 12, y + H * 0.55, 2, 8);
  const on = Math.floor(t / 900) % 5 !== 0;
  disc(ctx, x + W / 2, y + 7, 2.2, on ? '#22c55e' : '#166534');
  ctx.fillStyle = '#e2e8f0'; ctx.font = '700 4.6px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('QUIET', x + W / 2, y + H - 5);
}

/** An arcade cabinet with a glowing, changing screen and a joystick. */
function drawArcade(ctx: Ctx, x: number, y: number, W: number, H: number, t: number, seed: number) {
  softShadow(ctx, x, y, W, H, 4);
  const body = ['#7c3aed', '#dc2626', '#0ea5e9'][Math.floor(seed * 3)];
  ctx.fillStyle = shade(body, -0.25); rr(ctx, x + 6, y - 6, W - 12, H + 2, 4); ctx.fill();
  ctx.fillStyle = body; rr(ctx, x + 8, y - 6, W - 16, H, 4); ctx.fill();
  const hue = Math.floor(t / 400 + seed * 9) % 4;
  ctx.fillStyle = '#0b1020'; rr(ctx, x + 11, y - 2, W - 22, 13, 2); ctx.fill();
  const g = ctx.createLinearGradient(0, y - 2, 0, y + 11);
  g.addColorStop(0, ['#22d3ee', '#a3e635', '#f472b6', '#fbbf24'][hue]); g.addColorStop(1, '#312e81');
  ctx.fillStyle = g; rr(ctx, x + 12.5, y - 0.5, W - 25, 10, 1.5); ctx.fill();
  ctx.fillStyle = '#fff'; for (let i = 0; i < 4; i++) ctx.fillRect(x + 15 + h2(hue, i) * 10, y + 1.5 + i * 2, 2, 1.2);
  ctx.fillStyle = '#111827'; rr(ctx, x + 9, y + 13, W - 18, 8, 2); ctx.fill();
  disc(ctx, x + 15, y + 17, 2.4, '#ef4444'); ctx.fillStyle = '#e5e7eb'; ctx.fillRect(x + 14.4, y + 14, 1.2, 3);
  disc(ctx, x + W - 17, y + 17, 1.6, '#fde047'); disc(ctx, x + W - 12, y + 16, 1.6, '#60a5fa');
  ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.font = '700 4px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('PLAY', x + W / 2, y + 25);
}

/** A tall pine tree: layered dark boughs that sway a little in the wind. */
function drawPine(ctx: Ctx, x: number, y: number, W: number, H: number, t: number, seed: number) {
  const cx = x + W / 2;
  const base = y + H - 4;
  ellipse(ctx, cx + 3, base, W * 0.42, 5, 'rgba(15,40,20,0.3)');
  ctx.fillStyle = '#6b4423';
  rr(ctx, cx - 3.4, base - 17, 6.8, 16, 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  ctx.fillRect(cx + 0.8, base - 17, 2.6, 16);
  const tiers = 4;
  for (let k = 0; k < tiers; k++) {
    const top = y + 3 + k * ((H - 26) / tiers);
    const bot = y + 15 + k * ((H - 26) / tiers) + (H - 26) / tiers * 0.9;
    const half = W * 0.26 + k * ((W * 0.5 - W * 0.26) / (tiers - 1)) + 1;
    const sway = Math.sin(t / 1500 + seed * 6 + k * 0.5) * (0.6 + k * 0.35);
    const g = ctx.createLinearGradient(cx - half, 0, cx + half, 0);
    g.addColorStop(0, '#2f7d4a'); g.addColorStop(0.5, '#1f6137'); g.addColorStop(1, '#15492a');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(cx + sway * 0.4, top);
    ctx.quadraticCurveTo(cx + half * 0.6 + sway, (top + bot) / 2, cx + half + sway, bot);
    ctx.quadraticCurveTo(cx + sway, bot - 5, cx - half + sway, bot);
    ctx.quadraticCurveTo(cx - half * 0.6 + sway, (top + bot) / 2, cx + sway * 0.4, top);
    ctx.fill();
    ctx.strokeStyle = 'rgba(180,240,180,0.28)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(cx - half * 0.3 + sway, top + 6);
    ctx.lineTo(cx - half * 0.8 + sway, bot - 3);
    ctx.stroke();
  }
  ctx.fillStyle = '#92400e';
  for (const [px, py] of [[-6, 0.62], [5, 0.78]] as const) { ctx.beginPath(); ctx.ellipse(cx + px, y + H * py, 1.6, 2.4, 0.3, 0, Math.PI * 2); ctx.fill(); }
}

/** A campfire: a ring of stones, crossed logs, flames that flicker, sparks, smoke and a glow on the ground. */
function drawCampfire(ctx: Ctx, x: number, y: number, W: number, H: number, t: number, seed: number) {
  const cx = x + W / 2, cy = y + H / 2 + 5;
  const sec = t / 1000;
  const flick = 0.85 + Math.sin(sec * 11 + seed) * 0.08 + Math.sin(sec * 17.3) * 0.07;
  const glow = ctx.createRadialGradient(cx, cy - 4, 2, cx, cy - 4, 56 * flick);
  glow.addColorStop(0, 'rgba(255,170,60,0.45)');
  glow.addColorStop(0.5, 'rgba(255,120,30,0.16)');
  glow.addColorStop(1, 'rgba(255,100,20,0)');
  ctx.fillStyle = glow;
  ctx.beginPath(); ctx.arc(cx, cy - 4, 56 * flick, 0, Math.PI * 2); ctx.fill();
  ellipse(ctx, cx, cy + 1, 21, 10, 'rgba(30,20,10,0.55)');
  ellipse(ctx, cx, cy, 17, 8, '#2b1f16');
  // stones round the edge
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const sx = cx + Math.cos(a) * 18, sy = cy + Math.sin(a) * 8.4;
    ellipse(ctx, sx + 0.8, sy + 1.4, 4.2, 2.8, 'rgba(0,0,0,0.3)');
    ellipse(ctx, sx, sy, 4, 2.9, i % 2 ? '#9ca3af' : '#78716c');
    ellipse(ctx, sx - 1, sy - 0.8, 2, 1.1, 'rgba(255,255,255,0.35)');
  }
  // the logs
  ctx.lineCap = 'round';
  for (const [ang, col2] of [[-0.45, '#6b4423'], [0.5, '#7c5230'], [1.55, '#5a381c']] as const) {
    ctx.save();
    ctx.translate(cx, cy - 1);
    ctx.rotate(ang);
    ctx.fillStyle = col2; rr(ctx, -14, -2.6, 28, 5.2, 2.6); ctx.fill();
    ctx.fillStyle = '#b98a58'; ctx.beginPath(); ctx.ellipse(14, 0, 1.6, 2.6, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,140,40,0.55)'; rr(ctx, -9, -2.2, 18, 2, 1); ctx.fill();
    ctx.restore();
  }
  // glowing embers
  for (let i = 0; i < 6; i++) { const e = (Math.sin(sec * 3 + i * 2.1) + 1) / 2; disc(ctx, cx + (i - 2.5) * 4.4, cy - 1 + Math.sin(i * 3) * 2, 1.4, `rgba(255,${120 + e * 100},40,${0.6 + e * 0.4})`); }
  // flames: tall tongues of orange, yellow and a pale heart
  for (let i = 0; i < 6; i++) {
    const fx = cx + (i - 2.5) * 3.8;
    const hgt = (14 + Math.sin(sec * 9 + i * 1.9 + seed * 3) * 5 + Math.sin(sec * 15 + i) * 2.5) * (1 - Math.abs(i - 2.5) * 0.12);
    const lean = Math.sin(sec * 5 + i * 1.3) * 2.2;
    for (const [sc, col3] of [[1, '#f97316'], [0.7, '#fbbf24'], [0.4, '#fef9c3']] as const) {
      ctx.fillStyle = col3;
      ctx.beginPath();
      ctx.moveTo(fx - 3.2 * sc, cy - 2);
      ctx.quadraticCurveTo(fx - 3 * sc + lean * 0.4, cy - 2 - hgt * sc * 0.6, fx + lean * sc, cy - 2 - hgt * sc);
      ctx.quadraticCurveTo(fx + 3 * sc + lean * 0.4, cy - 2 - hgt * sc * 0.6, fx + 3.2 * sc, cy - 2);
      ctx.closePath();
      ctx.fill();
    }
  }
  // sparks drifting up
  for (let i = 0; i < 9; i++) {
    const ph = ((sec * 0.7 + i * 0.113 + seed) % 1);
    const sx = cx + Math.sin(i * 2.7 + sec * 1.6) * (6 + ph * 10);
    const sy = cy - 12 - ph * 42;
    ctx.fillStyle = `rgba(255,${190 - ph * 80},60,${1 - ph})`;
    ctx.fillRect(sx, sy, 1.6, 1.6);
  }
  // smoke curling up and thinning out
  for (let i = 0; i < 5; i++) {
    const ph = ((sec * 0.22 + i / 5) % 1);
    ctx.fillStyle = `rgba(120,120,125,${(0.16 * (1 - ph)).toFixed(3)})`;
    ctx.beginPath(); ctx.arc(cx + Math.sin(sec + i * 2) * (4 + ph * 12), cy - 24 - ph * 46, 4 + ph * 10, 0, Math.PI * 2); ctx.fill();
  }
}

/** A log to sit on, lying on its side with rings at the ends, bark and a little moss. */
function drawLog(ctx: Ctx, x: number, y: number, W: number, H: number, seed: number) {
  const cy = y + H / 2 + 2;
  ellipse(ctx, x + W / 2 + 2, cy + 9, W * 0.46, 4.2, 'rgba(30,20,10,0.28)');
  const g = ctx.createLinearGradient(0, cy - 9, 0, cy + 9);
  g.addColorStop(0, '#8b5e34'); g.addColorStop(0.5, '#6b4423'); g.addColorStop(1, '#4a2f17');
  ctx.fillStyle = g;
  rr(ctx, x + 5, cy - 9, W - 10, 17, 8);
  ctx.fill();
  ctx.strokeStyle = 'rgba(30,15,5,0.35)';
  ctx.lineWidth = 1;
  for (let i = 0; i < 6; i++) { const bx = x + 12 + i * ((W - 28) / 5) + (i % 2) * 3; ctx.beginPath(); ctx.moveTo(bx, cy - 8); ctx.quadraticCurveTo(bx + 2, cy, bx - 1, cy + 7); ctx.stroke(); }
  for (const ex of [x + 6, x + W - 6]) {
    ellipse(ctx, ex, cy, 4.2, 8.4, '#d8b98a');
    ctx.strokeStyle = '#9a7648'; ctx.lineWidth = 0.8;
    for (let r = 1; r <= 3; r++) { ctx.beginPath(); ctx.ellipse(ex, cy, r * 1.3, r * 2.6, 0, 0, Math.PI * 2); ctx.stroke(); }
  }
  ctx.fillStyle = 'rgba(80,140,50,0.8)';
  for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.ellipse(x + 16 + i * 14 + grain(seed, i) * 5, cy - 8, 4 + (i % 2), 1.8, 0, 0, Math.PI * 2); ctx.fill(); }
}

function drawStump(ctx: Ctx, x: number, y: number, W: number, H: number) {
  const cx = x + W / 2, cy = y + H / 2;
  ellipse(ctx, cx + 2, cy + 11, 13, 4.4, 'rgba(30,20,10,0.28)');
  ctx.fillStyle = '#6b4423';
  rr(ctx, cx - 11, cy - 2, 22, 13, 4);
  ctx.fill();
  ctx.strokeStyle = 'rgba(30,15,5,0.3)'; ctx.lineWidth = 1;
  for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.moveTo(cx - 8 + i * 5, cy); ctx.lineTo(cx - 8 + i * 5 - 1, cy + 9); ctx.stroke(); }
  ellipse(ctx, cx, cy - 2, 11.5, 6, '#d8b98a');
  ctx.strokeStyle = '#a07a52'; ctx.lineWidth = 0.9;
  for (let r = 1; r <= 4; r++) { ctx.beginPath(); ctx.ellipse(cx, cy - 2, r * 2.6, r * 1.3, 0, 0, Math.PI * 2); ctx.stroke(); }
}

/** A camping tent with its door flap open, pegs and guy ropes. */
function drawTent(ctx: Ctx, x: number, y: number, W: number, H: number, col: string | undefined, t: number) {
  const main = col ?? '#f97316';
  const cx = x + W / 2, base = y + H - 5;
  ellipse(ctx, cx + 4, base + 1, W * 0.46, 6, 'rgba(20,40,20,0.3)');
  ctx.strokeStyle = '#e5e7eb'; ctx.lineWidth = 0.9;
  for (const [sx, ex] of [[cx - W * 0.4, x + 1], [cx + W * 0.4, x + W - 1]] as const) { ctx.beginPath(); ctx.moveTo(sx, y + H * 0.55); ctx.lineTo(ex, base + 1); ctx.stroke(); ctx.fillStyle = '#6b7280'; ctx.fillRect(ex - 1, base, 2, 3); }
  // the roof: two slopes meeting at a ridge
  ctx.fillStyle = shade(main, -0.22);
  ctx.beginPath(); ctx.moveTo(cx, y + 6); ctx.lineTo(cx + W * 0.44, base - 1); ctx.lineTo(cx + W * 0.08, base - 1); ctx.closePath(); ctx.fill();
  const g = ctx.createLinearGradient(cx - W * 0.44, 0, cx, 0);
  g.addColorStop(0, shade(main, 0.18)); g.addColorStop(1, main);
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.moveTo(cx, y + 6); ctx.lineTo(cx - W * 0.44, base - 1); ctx.lineTo(cx + W * 0.08, base - 1); ctx.closePath(); ctx.fill();
  // the door: a dark opening with the flap pulled back
  ctx.fillStyle = '#1c1917';
  ctx.beginPath(); ctx.moveTo(cx - 1, y + 14); ctx.lineTo(cx + W * 0.2, base - 1); ctx.lineTo(cx - W * 0.16, base - 1); ctx.closePath(); ctx.fill();
  const flap = Math.sin(t / 1100) * 0.8;
  ctx.fillStyle = shade(main, 0.1);
  ctx.beginPath(); ctx.moveTo(cx - 1, y + 14); ctx.lineTo(cx - W * 0.16 + flap, base - 1); ctx.lineTo(cx - W * 0.28 + flap, base - 1); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(cx, y + 6); ctx.lineTo(cx, y + 14); ctx.stroke();
  // a sleeping bag peeking out
  ctx.fillStyle = '#2563eb';
  rr(ctx, cx - 6, base - 6, 13, 5, 2.5); ctx.fill();
}

function drawMushrooms(ctx: Ctx, x: number, y: number, W: number, H: number, seed: number) {
  const cx = x + W / 2, by = y + H - 8;
  for (const [dx, dy, s] of [[-7, 1, 0.9], [2, -1, 1.2], [8, 3, 0.75]] as const) {
    const mx = cx + dx, my = by + dy;
    ellipse(ctx, mx + 1, my + 2, 5 * s, 1.8, 'rgba(20,40,20,0.25)');
    ctx.fillStyle = '#f5ecd6';
    rr(ctx, mx - 1.8 * s, my - 6 * s, 3.6 * s, 7 * s, 1.6);
    ctx.fill();
    ctx.fillStyle = '#dc2626';
    ctx.beginPath(); ctx.ellipse(mx, my - 6 * s, 6 * s, 4.4 * s, 0, Math.PI, 0); ctx.fill();
    ctx.fillStyle = '#fff';
    for (const [qx, qy] of [[-2.6, -8], [1.4, -9], [3.4, -6.6]] as const) disc(ctx, mx + qx * s, my + qy * s * 0.95 + (seed > 0.5 ? 0 : 0.4), 0.9 * s, '#fff');
  }
}

function drawFirewood(ctx: Ctx, x: number, y: number, W: number, H: number) {
  const cx = x + W / 2, by = y + H - 6;
  ellipse(ctx, cx + 2, by + 2, 14, 4.4, 'rgba(30,20,10,0.28)');
  const logs: [number, number][] = [[-9, 0], [-3, 0], [3, 0], [9, 0], [-6, -6], [0, -6], [6, -6], [-3, -12], [3, -12]];
  for (const [lx, ly] of logs) {
    ctx.fillStyle = '#6b4423'; rr(ctx, cx + lx - 3.4, by + ly - 3.2, 6.8, 7, 3.2); ctx.fill();
    ellipse(ctx, cx + lx, by + ly, 2.6, 2.6, '#d8b98a');
    ctx.strokeStyle = '#a07a52'; ctx.lineWidth = 0.6; ctx.beginPath(); ctx.arc(cx + lx, by + ly, 1.3, 0, Math.PI * 2); ctx.stroke();
  }
}

/** A hanging camp lantern with a flickering glow. */
function drawLantern(ctx: Ctx, x: number, y: number, W: number, H: number, t: number, seed: number) {
  const cx = x + W / 2, cy = y + H / 2;
  const fl = 0.8 + Math.sin(t / 130 + seed * 9) * 0.1 + Math.sin(t / 53) * 0.06;
  const g = ctx.createRadialGradient(cx, cy - 4, 1, cx, cy - 4, 34 * fl);
  g.addColorStop(0, 'rgba(255,210,120,0.5)');
  g.addColorStop(1, 'rgba(255,190,90,0)');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(cx, cy - 4, 34 * fl, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#475569'; ctx.lineWidth = 1.6;
  ctx.beginPath(); ctx.moveTo(cx, y + 2); ctx.lineTo(cx, cy - 9); ctx.stroke();
  ctx.fillStyle = '#334155'; rr(ctx, cx - 5, cy - 9, 10, 3, 1); ctx.fill();
  ctx.fillStyle = `rgba(254,240,138,${0.85 * fl})`; rr(ctx, cx - 4, cy - 6, 8, 11, 2); ctx.fill();
  ctx.fillStyle = '#334155'; rr(ctx, cx - 5, cy + 4, 10, 3, 1); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.fillRect(cx - 1, cy - 4, 2, 6);
}

/** A coffee and snack bar: a wooden counter with an espresso machine (steaming), cups, jars and a tray of pastries. */
function drawCoffeeBar(ctx: Ctx, x: number, y: number, W: number, H: number, t: number, seed: number) {
  const sec = t / 1000;
  softShadow(ctx, x, y, W, H, 5);
  // the back shelf with jars
  ctx.fillStyle = '#5a3a22';
  rr(ctx, x + 2, y + 2, W - 4, 13, 3);
  ctx.fill();
  for (let i = 0; i < 7; i++) { ctx.fillStyle = ['#f59e0b', '#a16207', '#f8fafc', '#d97706'][i % 4]; rr(ctx, x + 8 + i * ((W - 24) / 6.4), y + 4, 8, 9, 2); ctx.fill(); ctx.fillStyle = '#e2e8f0'; ctx.fillRect(x + 8 + i * ((W - 24) / 6.4), y + 3, 8, 2); }
  // the counter
  const wg = ctx.createLinearGradient(0, y + 15, 0, y + H);
  wg.addColorStop(0, '#b98a58'); wg.addColorStop(0.35, '#a9794a'); wg.addColorStop(1, '#7a4e2a');
  ctx.fillStyle = wg;
  rr(ctx, x + 1, y + 15, W - 2, H - 16, 4);
  ctx.fill();
  ctx.fillStyle = '#e8d3a8';
  rr(ctx, x, y + 14, W, 6, 3);
  ctx.fill();
  ctx.strokeStyle = 'rgba(60,35,15,0.3)'; ctx.lineWidth = 1;
  for (let i = 1; i < 6; i++) { ctx.beginPath(); ctx.moveTo(x + i * (W / 6), y + 21); ctx.lineTo(x + i * (W / 6), y + H - 3); ctx.stroke(); }
  // the espresso machine with steam
  const mx = x + 16;
  ctx.fillStyle = '#cbd5e1'; rr(ctx, mx, y + 2, 28, 14, 3); ctx.fill();
  ctx.fillStyle = '#94a3b8'; rr(ctx, mx + 2, y + 10, 24, 5, 2); ctx.fill();
  ctx.fillStyle = '#334155'; rr(ctx, mx + 5, y + 4, 6, 4, 1); ctx.fill();
  disc(ctx, mx + 22, y + 6, 2.4, '#ef4444');
  for (let i = 0; i < 3; i++) { const ph = ((sec * 0.6 + i / 3) % 1); ctx.fillStyle = `rgba(255,255,255,${0.4 * (1 - ph)})`; ctx.beginPath(); ctx.arc(mx + 9 + Math.sin(sec * 2 + i) * 2, y - 2 - ph * 14, 2.5 + ph * 3.5, 0, Math.PI * 2); ctx.fill(); }
  // cups and a pastry tray
  for (const cxp of [x + 58, x + 66]) { ctx.fillStyle = '#f8fafc'; rr(ctx, cxp, y + 12, 6, 6, 2); ctx.fill(); ctx.fillStyle = '#7c4a21'; ctx.fillRect(cxp + 1, y + 12.6, 4, 1.2); }
  ctx.fillStyle = 'rgba(186,230,253,0.55)'; rr(ctx, x + W - 52, y + 8, 38, 11, 4); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 1; ctx.stroke();
  for (let i = 0; i < 4; i++) { ctx.fillStyle = ['#d97706', '#b45309', '#fbbf24', '#92400e'][i]; ctx.beginPath(); ctx.ellipse(x + W - 46 + i * 9, y + 15, 4, 3, 0.3, Math.PI, 0); ctx.fill(); }
  // the menu board on the front
  ctx.fillStyle = '#1f2937'; rr(ctx, x + W / 2 - 20, y + 24, 40, 11, 2); ctx.fill();
  ctx.fillStyle = '#f8fafc'; ctx.font = '700 6.5px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('COFFEE  SNACKS', x + W / 2, y + 29.6);
}

/** A butterfly with beating wings. */
function drawButterfly(ctx: Ctx, bx: number, by: number, t: number, i: number) {
  const flap = Math.abs(Math.sin(t / (85 + i * 14) + i * 2));
  const main = ['#f97316', '#38bdf8', '#e879f9', '#facc15'][i % 4];
  ctx.save();
  ctx.translate(bx, by);
  for (const sgn of [-1, 1]) {
    ctx.fillStyle = main;
    ctx.beginPath(); ctx.ellipse(sgn * (1 + 3 * flap), -1.6, 0.8 + 3.6 * flap, 3.3, sgn * 0.5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = shade(main, -0.2);
    ctx.beginPath(); ctx.ellipse(sgn * (0.8 + 2.2 * flap), 2, 0.6 + 2.4 * flap, 2.4, -sgn * 0.5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    disc(ctx, sgn * (1.4 + 2.4 * flap), -2.4, 0.7, 'rgba(255,255,255,0.7)');
  }
  ctx.fillStyle = '#1f2937';
  rr(ctx, -0.6, -3.6, 1.2, 7, 0.6);
  ctx.fill();
  ctx.strokeStyle = '#1f2937'; ctx.lineWidth = 0.6;
  ctx.beginPath(); ctx.moveTo(0, -3.6); ctx.lineTo(-1.6, -6); ctx.moveTo(0, -3.6); ctx.lineTo(1.6, -6); ctx.stroke();
  ctx.restore();
}

/** A small dog drawn from the side (used by the beach scene). */
function drawBeachDog(ctx: Ctx, dx: number, dy: number, face: 1 | -1, run: number, carrying: boolean, breed: DogBreed) {
  ellipse(ctx, dx, dy + 9, 11 * breed.len, 3.4, 'rgba(70,50,25,0.25)');
  ctx.save();
  ctx.translate(dx, dy - 1 - Math.abs(Math.sin(run * 2)) * 1.4 * (run ? 1 : 0));
  ctx.scale(face, 1);
  drawDogBody(ctx, breed, run / 2.4 + 1, run !== 0, carrying, 'beach');
  ctx.restore();
}

/** A dog and a beach ball: it chases the thrown ball, brings it back, and waits for the next throw. */
function drawDogBall(ctx: Ctx, x: number, y: number, W: number, H: number, t: number, seed: number) {
  const sec = t / 1000;
  const p = ((sec + seed * 5) % 7.5) / 7.5;
  const x0 = x + 14, x1 = x + W - 18, gy = y + H - 14;
  const breed = dogBreed(undefined, seed);
  let dogX = x0, face: 1 | -1 = 1, run = 0, carrying = false, ballX = x0 + 8, ballY = gy, rot = 0;
  const lerp = (a: number, b: number, u: number) => a + (b - a) * u;
  if (p < 0.14) { // the throw: the ball flies out in an arc
    const u = p / 0.14; ballX = lerp(x0 + 8, x1, u); ballY = gy - Math.sin(Math.PI * u) * 24; rot = u * 8; dogX = x0; run = 0;
  } else if (p < 0.5) { // the dog races after it while it bounces to a stop
    const u = (p - 0.14) / 0.36; dogX = lerp(x0, x1 - 6, Math.min(1, u * 1.15)); run = sec * 14; ballX = x1 + Math.min(1, u * 2) * 8; ballY = gy - Math.abs(Math.sin(u * 9)) * 6 * (1 - u); rot = 8 + u * 4;
  } else if (p < 0.56) { // picks it up
    dogX = x1 - 6; ballX = x1 + 8; ballY = gy; carrying = false; run = 0;
  } else if (p < 0.9) { // brings it back
    const u = (p - 0.56) / 0.34; dogX = lerp(x1 - 6, x0 + 2, u); face = -1; run = sec * 14; carrying = true; ballX = dogX - 16; ballY = gy - 2;
  } else { // drops it at their feet and wags
    dogX = x0 + 2; face = -1; ballX = x0 - 12; ballY = gy; run = 0; rot = 0;
  }
  if (!carrying) {
    ellipse(ctx, ballX, gy + 4, 5, 1.8, 'rgba(70,50,25,0.28)');
    ctx.save();
    ctx.translate(ballX, ballY - 4);
    ctx.rotate(rot);
    disc(ctx, 0, 0, 4.6, '#ffffff');
    for (const [ca, cc] of [[0, '#ef4444'], [2.1, '#38bdf8'], [4.2, '#facc15']] as const) { ctx.fillStyle = cc; ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, 4.6, ca, ca + 1.05); ctx.closePath(); ctx.fill(); }
    ctx.restore();
  }
  drawBeachDog(ctx, dogX, gy - 4, face, run, carrying, breed);
  if (p < 0.14 || p > 0.9) {
    // a happy wag at the start and the end
    ctx.fillStyle = 'rgba(244,63,94,0.9)';
    ctx.font = '700 9px system-ui, sans-serif'; ctx.textAlign = 'center';
    if (p > 0.92) ctx.fillText('♥', dogX, gy - 26 - ((p - 0.92) / 0.08) * 6);
  }
}

/** A little sandcastle with towers, battlements and a flag. */
function drawSandcastle(ctx: Ctx, x: number, y: number, W: number, H: number, t: number, seed: number) {
  const cx = x + W / 2, by = y + H - 6;
  ctx.fillStyle = 'rgba(70,50,25,0.22)';
  ctx.beginPath(); ctx.ellipse(cx + 3, by + 3, 15, 5, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#e2c78e';
  ctx.beginPath(); ctx.ellipse(cx, by, 15, 6, 0, 0, Math.PI * 2); ctx.fill();
  const tower = (tx: number, w: number, h: number, shade2: number) => {
    ctx.fillStyle = shade2 ? '#d6b775' : '#ecd7a2';
    rr(ctx, tx - w / 2, by - h, w, h, 1.5);
    ctx.fill();
    ctx.fillStyle = '#c9a862';
    for (let k = 0; k < 3; k++) ctx.fillRect(tx - w / 2 + k * (w / 2.4), by - h - 3, w / 4, 3);
    ctx.fillStyle = 'rgba(80,60,30,0.35)';
    rr(ctx, tx - 1.4, by - h * 0.55, 2.8, 4.4, 1.2);
    ctx.fill();
  };
  tower(cx - 9, 8, 12, 1);
  tower(cx + 9, 8, 12, 1);
  tower(cx, 11, 19, 0);
  const wave = Math.sin(t / 260 + seed * 4) * 1.6;
  ctx.strokeStyle = '#7c4a21';
  ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.moveTo(cx, by - 22); ctx.lineTo(cx, by - 32); ctx.stroke();
  ctx.fillStyle = '#ef4444';
  ctx.beginPath(); ctx.moveTo(cx, by - 32); ctx.lineTo(cx + 8 + wave, by - 29.5); ctx.lineTo(cx, by - 27); ctx.closePath(); ctx.fill();
  // a few shells set round the base
  disc(ctx, cx - 16, by + 1, 1.7, '#fbcfe8');
  disc(ctx, cx + 15, by + 2, 1.5, '#fde68a');
}

/** A wooden jetty running out into the water: planks, posts and a rope. */
function drawDock(ctx: Ctx, x: number, y: number, W: number, H: number, t: number) {
  ctx.fillStyle = 'rgba(0,40,60,0.28)';
  rr(ctx, x + 7, y + 6, W - 8, H - 4, 3);
  ctx.fill();
  const planks = Math.floor(H / 7);
  for (let k = 0; k < planks; k++) {
    const py = y + 2 + k * ((H - 4) / planks);
    ctx.fillStyle = k % 2 ? '#a9794a' : '#b98a58';
    ctx.fillRect(x + 5, py, W - 10, (H - 4) / planks - 1.4);
    ctx.fillStyle = 'rgba(255,255,255,0.14)';
    ctx.fillRect(x + 5, py, W - 10, 1.2);
    ctx.fillStyle = 'rgba(60,35,15,0.45)';
    ctx.fillRect(x + 8, py + 2.4, 1.4, 1.4);
    ctx.fillRect(x + W - 10, py + 2.4, 1.4, 1.4);
  }
  ctx.fillStyle = '#6b4423';
  ctx.fillRect(x + 3, y + 1, 3, H - 2);
  ctx.fillRect(x + W - 6, y + 1, 3, H - 2);
  for (let k = 0; k <= 3; k++) {
    const py = y + 5 + k * ((H - 14) / 3);
    disc(ctx, x + 4.5, py, 3.2, '#5a381c');
    disc(ctx, x + W - 4.5, py, 3.2, '#5a381c');
    disc(ctx, x + 4, py - 0.8, 1.1, '#8a6038');
    disc(ctx, x + W - 5, py - 0.8, 1.1, '#8a6038');
  }
  // a rope along one side that sways a little
  ctx.strokeStyle = '#e8d9b0';
  ctx.lineWidth = 1.4;
  for (let k = 0; k < 3; k++) {
    const p0 = y + 5 + k * ((H - 14) / 3), p1 = y + 5 + (k + 1) * ((H - 14) / 3);
    ctx.beginPath();
    ctx.moveTo(x + 4.5, p0);
    ctx.quadraticCurveTo(x + 7, (p0 + p1) / 2 + 3 + Math.sin(t / 900 + k) * 0.8, x + 4.5, p1);
    ctx.stroke();
  }
  // ripples where the posts meet the water
  const ph = ((t / 1800) % 1);
  ctx.strokeStyle = `rgba(255,255,255,${0.35 * (1 - ph)})`;
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.ellipse(x + 4.5, y + H - 4, 4 + ph * 7, 2 + ph * 3, 0, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath(); ctx.ellipse(x + W - 4.5, y + H - 4, 4 + ph * 7, 2 + ph * 3, 0, 0, Math.PI * 2); ctx.stroke();
}

/** A wooden rowing boat seen from above, bobbing and swaying on the water, with oars and a coil of rope. */
function drawBoat(ctx: Ctx, x: number, y: number, W: number, H: number, t: number, seed: number) {
  const sec = t / 1000;
  const cx = x + W / 2 + Math.sin(sec * 0.8 + seed * 5) * 1.4, cy = y + H / 2 + Math.cos(sec * 0.7 + seed * 3) * 1.6;
  const rot = Math.sin(sec * 0.6 + seed * 7) * 0.05;
  // water around it
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 1.2;
  const ph = ((sec / 2.2) % 1);
  ctx.beginPath(); ctx.ellipse(cx, cy, W / 2 - 2 + ph * 8, H / 2 - 2 + ph * 5, rot, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = 'rgba(0,40,60,0.28)';
  ctx.beginPath(); ctx.ellipse(cx + 4, cy + 6, W / 2 - 4, H / 2 - 5, rot, 0, Math.PI * 2); ctx.fill();
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(rot);
  const hw = W / 2 - 5, hh = H / 2 - 6;
  const hull = () => { ctx.beginPath(); ctx.moveTo(-hw, 0); ctx.quadraticCurveTo(-hw * 0.55, -hh * 1.15, hw * 0.35, -hh); ctx.quadraticCurveTo(hw * 0.85, -hh * 0.55, hw, 0); ctx.quadraticCurveTo(hw * 0.85, hh * 0.55, hw * 0.35, hh); ctx.quadraticCurveTo(-hw * 0.55, hh * 1.15, -hw, 0); ctx.closePath(); };
  hull();
  ctx.fillStyle = '#7a4e2a';
  ctx.fill();
  ctx.save();
  hull();
  ctx.clip();
  ctx.scale(0.86, 0.78);
  hull();
  ctx.fillStyle = '#c99a62';
  ctx.fill();
  ctx.restore();
  ctx.strokeStyle = 'rgba(80,50,20,0.35)';
  ctx.lineWidth = 0.8;
  for (let k = -3; k <= 3; k++) { ctx.beginPath(); ctx.moveTo(-hw * 0.7, k * (hh / 3.6)); ctx.lineTo(hw * 0.7, k * (hh / 3.6)); ctx.stroke(); }
  ctx.fillStyle = '#8b5a2b';
  for (const bx of [-hw * 0.35, hw * 0.12]) { rr(ctx, bx - 2.5, -hh * 0.82, 5, hh * 1.64, 1.5); ctx.fill(); }
  ctx.strokeStyle = '#5a381c';
  ctx.lineWidth = 1.2;
  hull();
  ctx.stroke();
  // oars resting across the seats
  ctx.strokeStyle = '#d6b57a';
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(-hw * 0.45, hh * 0.9); ctx.lineTo(hw * 0.2, -hh * 1.25); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(hw * 0.25, hh * 1.2); ctx.lineTo(-hw * 0.3, -hh * 0.95); ctx.stroke();
  ctx.fillStyle = '#e8d9b0';
  for (let k = 0; k < 3; k++) { ctx.beginPath(); ctx.ellipse(hw * 0.55, hh * 0.1, 4 - k, 2.2 - k * 0.5, 0, 0, Math.PI * 2); ctx.stroke(); }
  ctx.restore();
}

/** Sort key so things lower on the screen draw over things behind them. */
export function depth(item: Item): number {
  if (item.t === 'dog' || item.t === 'cat') { const live = officePets.get(item.id); if (live) return live.y + 0.4; }
  const { h } = itemSize(item);
  if (item.t === 'dock') return -60 + item.y;
  if (item.t === 'rug' || item.t === 'grass' || item.t === 'mat' || item.t === 'sand' || item.t === 'sea' || item.t === 'pond' || item.t === 'towel') return -100 + item.y;
  if (TOP.includes(item.t)) return item.y + 1.2; // always on top of the desk it sits on
  return item.y + h;
}

/** A ball in the air (it arcs from the thrower) or lying where it landed. */
export function drawBall(ctx: Ctx, b: { x: number; y: number; fromX: number; fromY: number; thrownAt: number }, now: number) {
  const k = Math.max(0, Math.min(1, (now - b.thrownAt) / 700));
  const bx = (b.fromX + (b.x - b.fromX) * k) * TILE;
  const by = (b.fromY + (b.y - b.fromY) * k) * TILE - Math.sin(k * Math.PI) * 44;
  ellipse(ctx, (b.fromX + (b.x - b.fromX) * k) * TILE, (b.fromY + (b.y - b.fromY) * k) * TILE + 5, 5, 2, 'rgba(15,23,42,0.25)');
  disc(ctx, bx, by, 4.2, '#bef264');
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(bx, by, 4.2, 0.5, 2.6);
  ctx.stroke();
}

export function drawItems(ctx: Ctx, items: Item[], theme: Theme, t = 0) {
  const sorted = [...items].sort((a, b) => depth(a) - depth(b));
  for (const it of sorted) drawItem(ctx, it, theme.dark, t);
}

// ---------- light and atmosphere ----------

/** Lamp glow, light from the windows with drifting dust, and a gentle tint for the time of day. */
export function drawLighting(ctx: Ctx, map: MapDef, items: Item[], theme: Theme, t: number) {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  // shafts of daylight under the windows along the top wall
  const windows: number[] = [];
  for (let x = 1; x < map.w - 1; x++) if (x % 4 !== 0 && map.walls[0][x] && !map.walls[1]?.[x]) windows.push(x);
  const drift = Math.sin(t / 5000) * 10;
  for (const x of windows) {
    const g = ctx.createLinearGradient(0, TILE, 0, TILE * 6);
    g.addColorStop(0, theme.dark ? 'rgba(150,180,255,0.07)' : 'rgba(255,240,200,0.20)');
    g.addColorStop(1, 'rgba(255,240,200,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(x * TILE + 2, TILE);
    ctx.lineTo((x + 1) * TILE - 2, TILE);
    ctx.lineTo((x + 1) * TILE + 56 + drift, TILE * 6);
    ctx.lineTo(x * TILE + 56 + drift, TILE * 6);
    ctx.closePath();
    ctx.fill();
  }
  // dust floating in the light
  if (windows.length) {
    ctx.fillStyle = theme.dark ? 'rgba(180,200,255,0.5)' : 'rgba(255,255,255,0.9)';
    for (let i = 0; i < 26; i++) {
      const wx = windows[Math.floor(h2(i, 5) * windows.length)];
      const ph = (t / (14000 + h2(i, 9) * 9000) + h2(i, 1)) % 1;
      const px = wx * TILE + h2(i, 2) * TILE + ph * 40 + Math.sin(t / 1200 + i) * 4;
      const py = TILE + ph * TILE * 5;
      ctx.globalAlpha = Math.sin(ph * Math.PI) * 0.7;
      ctx.fillRect(px, py, 1.6, 1.6);
    }
    ctx.globalAlpha = 1;
  }
  // lamps glow warm; screens glow cool after dark
  for (const it of items) {
    const cx = (it.x + 0.5) * TILE;
    const cy = (it.y + 0.5) * TILE;
    if (it.t === 'lamp') {
      const g = ctx.createRadialGradient(cx, cy, 2, cx, cy, TILE * 3);
      g.addColorStop(0, theme.dark ? 'rgba(255,200,110,0.45)' : 'rgba(255,205,120,0.22)');
      g.addColorStop(1, 'rgba(255,200,110,0)');
      ctx.fillStyle = g;
      ctx.fillRect(cx - TILE * 3, cy - TILE * 3, TILE * 6, TILE * 6);
    } else if (theme.dark && (it.t === 'computer' || it.t === 'tv')) {
      const r = it.t === 'tv' ? TILE * 2 : TILE * 1.1;
      const px = it.t === 'tv' ? cx + TILE / 2 : cx;
      const g = ctx.createRadialGradient(px, cy, 1, px, cy, r);
      g.addColorStop(0, 'rgba(90,160,255,0.22)');
      g.addColorStop(1, 'rgba(90,160,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(px - r, cy - r, r * 2, r * 2);
    }
  }
  ctx.restore();
  // evening and night tint in the light theme
  if (!theme.dark) {
    const hour = new Date().getHours() + new Date().getMinutes() / 60;
    const warm = hour >= 17 && hour < 20 ? (hour - 17) / 3 : 0;
    const night = hour >= 20 || hour < 6 ? 1 : hour < 7 ? 7 - hour : 0;
    if (warm > 0 || night > 0) {
      ctx.save();
      ctx.globalCompositeOperation = 'multiply';
      ctx.fillStyle = night > 0 ? `rgba(150,165,220,${0.2 * night})` : `rgba(255,190,130,${0.16 * warm})`;
      ctx.fillRect(0, 0, map.w * TILE, map.h * TILE);
      ctx.restore();
    }
  }
}

/** A soft darkening toward the corners of the screen, so the eye stays on the room. Draw in screen coordinates. */
export function drawVignette(ctx: Ctx, w: number, h: number, dark: boolean) {
  const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.45, w / 2, h / 2, Math.max(w, h) * 0.78);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, dark ? 'rgba(0,0,0,0.38)' : 'rgba(15,23,42,0.16)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}

// ---------- people ----------

/**
 * A power bike: side view when going left or right, front or back view when going up or down.
 * (px, py) is the middle of the ground under it; spin turns the wheels.
 */
function bikeSprite(ctx: Ctx, px: number, py: number, view: 'side' | 'front' | 'back', face: 1 | -1, spin: number, col?: string) {
  const body = col ?? '#dc2626';
  const dark = '#0f172a';
  const light = shade(body, 0.35);
  ellipse(ctx, px, py + 9, view === 'side' ? 18 : 8, 4, 'rgba(15,23,42,0.32)');
  ctx.save();
  ctx.translate(px, py);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (view === 'side') {
    ctx.scale(face, 1);
    // wheels: thick tyre, silver rim, spokes that turn, gold hub
    for (const wx of [-11.5, 11.5]) {
      disc(ctx, wx, 5, 7.6, dark);
      disc(ctx, wx, 5, 5.2, '#e2e8f0');
      disc(ctx, wx, 5, 4.2, '#475569');
      ctx.strokeStyle = '#cbd5e1';
      ctx.lineWidth = 0.9;
      ctx.beginPath();
      for (let k = 0; k < 4; k++) {
        const an = spin + (k * Math.PI) / 4;
        ctx.moveTo(wx - Math.cos(an) * 4.2, 5 - Math.sin(an) * 4.2);
        ctx.lineTo(wx + Math.cos(an) * 4.2, 5 + Math.sin(an) * 4.2);
      }
      ctx.stroke();
      disc(ctx, wx, 5, 1.5, '#facc15');
    }
    // front fork, rear swing arm and the engine block between the wheels
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 1.8;
    ctx.beginPath(); ctx.moveTo(11.5, 5); ctx.lineTo(8.5, -6); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-11.5, 5); ctx.lineTo(-3, 3); ctx.stroke();
    ctx.fillStyle = '#334155';
    rr(ctx, -5, 0, 11, 6.5, 2);
    ctx.fill();
    ctx.fillStyle = '#64748b';
    rr(ctx, -3, 1.4, 6, 1.6, 0.8);
    ctx.fill();
    // exhaust
    ctx.fillStyle = '#cbd5e1';
    rr(ctx, -15, 3.2, 10, 2.6, 1.3);
    ctx.fill();
    // fairing and tank: a swoosh from the tail up over the tank down to the nose
    const g = ctx.createLinearGradient(0, -9, 0, 5);
    g.addColorStop(0, light); g.addColorStop(0.5, body); g.addColorStop(1, shade(body, -0.35));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(-14, -2);
    ctx.quadraticCurveTo(-10, -5, -4, -4.5);
    ctx.quadraticCurveTo(2, -8, 7, -6.5);
    ctx.quadraticCurveTo(13, -4, 14.5, 0.5);
    ctx.lineTo(10, 3.5);
    ctx.lineTo(-3, 3);
    ctx.lineTo(-12, 2.5);
    ctx.closePath();
    ctx.fill();
    // a stripe and a highlight along the top
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(-9, -1); ctx.lineTo(10, -1.5); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.45)';
    ctx.beginPath(); ctx.moveTo(-3, -5.2); ctx.quadraticCurveTo(3, -7.6, 7, -6.2); ctx.stroke();
    // seat, windscreen, mirror and handlebar
    ctx.fillStyle = dark;
    rr(ctx, -12.5, -5.8, 9, 3, 1.5);
    ctx.fill();
    ctx.fillStyle = 'rgba(186,230,253,0.85)';
    ctx.beginPath(); ctx.moveTo(8.5, -6.5); ctx.lineTo(11.5, -11); ctx.lineTo(13, -6); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = dark;
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(8.5, -6.5); ctx.lineTo(7.5, -9.5); ctx.stroke();
    // lights: glowing headlamp and tail lamp
    const hg = ctx.createRadialGradient(15, -1, 0, 15, -1, 5);
    hg.addColorStop(0, 'rgba(254,240,138,0.9)'); hg.addColorStop(1, 'rgba(254,240,138,0)');
    ctx.fillStyle = hg;
    ctx.beginPath(); ctx.arc(15, -1, 5, 0, Math.PI * 2); ctx.fill();
    disc(ctx, 14.2, -1, 2, '#fef08a');
    disc(ctx, -14.2, -1.6, 1.5, '#f43f5e');
  } else {
    // front or back: the tyre, the body from ahead or behind, the bars and the lamps
    ctx.fillStyle = dark;
    rr(ctx, -3.2, -2, 6.4, 18, 2.8);
    ctx.fill();
    ctx.fillStyle = '#94a3b8';
    ctx.fillRect(-1.2, 1 + ((spin * 3) % 5), 2.4, 1.6);
    const g = ctx.createLinearGradient(-6, 0, 6, 0);
    g.addColorStop(0, shade(body, -0.3)); g.addColorStop(0.5, light); g.addColorStop(1, shade(body, -0.3));
    ctx.fillStyle = g;
    rr(ctx, -6, -6, 12, 13, 4);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.fillRect(-0.7, -5, 1.4, 11);
    ctx.strokeStyle = dark;
    ctx.lineWidth = 2.2;
    ctx.beginPath(); ctx.moveTo(-12, -8); ctx.lineTo(12, -8); ctx.stroke();
    disc(ctx, -12, -8, 1.6, '#94a3b8');
    disc(ctx, 12, -8, 1.6, '#94a3b8');
    if (view === 'front') {
      ctx.fillStyle = 'rgba(186,230,253,0.85)';
      ctx.beginPath(); ctx.moveTo(-4, -6); ctx.lineTo(0, -12); ctx.lineTo(4, -6); ctx.closePath(); ctx.fill();
      disc(ctx, 0, -1, 3.2, 'rgba(254,240,138,0.35)');
      disc(ctx, 0, -1, 2, '#fef08a');
    } else {
      disc(ctx, -3.4, 5, 1.6, '#f43f5e');
      disc(ctx, 3.4, 5, 1.6, '#f43f5e');
      ctx.fillStyle = '#cbd5e1';
      rr(ctx, -2.5, 8, 5, 2, 1);
      ctx.fill();
    }
  }
  ctx.restore();
}

/**
 * A go-kart: a low racing body with four fat wheels, a seat, a steering wheel, a rear engine and a number plate.
 * Drawn in two layers so the driver can sit inside it: 'under' (wheels, floor, engine, seat back) and 'over' (nose, steering wheel).
 */
function kartSprite(ctx: Ctx, px: number, py: number, view: 'side' | 'front' | 'back', face: 1 | -1, spin: number, col: string | undefined, layer: 'under' | 'over') {
  const body = col ?? '#dc2626';
  const dark = '#0f172a';
  const light = shade(body, 0.35);
  if (layer === 'under') ellipse(ctx, px, py + 9, view === 'side' ? 19 : 12, 4.4, 'rgba(15,23,42,0.3)');
  ctx.save();
  ctx.translate(px, py);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (view === 'side') {
    ctx.scale(face, 1);
    if (layer === 'under') {
      // rear wheel (big, slick), floor pan and the engine at the back
      for (const wx of [-12, 12]) {
        disc(ctx, wx, 5.5, 6.4, dark);
        disc(ctx, wx, 5.5, 3.6, '#cbd5e1');
        ctx.strokeStyle = '#64748b'; ctx.lineWidth = 1; ctx.beginPath();
        for (let k = 0; k < 3; k++) { const an = spin + (k * Math.PI) / 3; ctx.moveTo(wx - Math.cos(an) * 3.6, 5.5 - Math.sin(an) * 3.6); ctx.lineTo(wx + Math.cos(an) * 3.6, 5.5 + Math.sin(an) * 3.6); }
        ctx.stroke();
        disc(ctx, wx, 5.5, 1.2, '#facc15');
      }
      ctx.fillStyle = shade(body, -0.35);
      rr(ctx, -15, 0, 30, 5, 2.4); ctx.fill();
      // engine block and exhaust
      ctx.fillStyle = '#334155'; rr(ctx, -16, -5, 9, 8, 2); ctx.fill();
      ctx.fillStyle = '#94a3b8'; rr(ctx, -18, -2, 5, 2.4, 1.2); ctx.fill();
      // seat back
      ctx.fillStyle = '#1e293b'; rr(ctx, -8, -10, 6, 11, 2.4); ctx.fill();
    } else {
      // the side pod, nose cone, number plate and steering wheel
      const g = ctx.createLinearGradient(0, -7, 0, 5);
      g.addColorStop(0, light); g.addColorStop(0.5, body); g.addColorStop(1, shade(body, -0.3));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(-8, 1); ctx.lineTo(-4, -4); ctx.quadraticCurveTo(4, -5, 14, -2); ctx.lineTo(19, 0.5); ctx.lineTo(17, 4); ctx.lineTo(-8, 4); ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(5, 0, 3.4, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = dark; ctx.font = '700 5px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.save(); ctx.translate(5, 0.4); ctx.scale(face, 1); ctx.fillText('7', 0, 0); ctx.restore();
      ctx.strokeStyle = '#e2e8f0'; ctx.lineWidth = 1.3; ctx.beginPath(); ctx.moveTo(-3, 1.5); ctx.lineTo(15, 1.5); ctx.stroke();
      // front bumper and the steering wheel
      ctx.strokeStyle = '#475569'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(19, 4); ctx.lineTo(21, 4); ctx.stroke();
      ctx.strokeStyle = '#111827'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(9, -7); ctx.lineTo(12, -3); ctx.stroke();
      ctx.beginPath(); ctx.ellipse(8.4, -7.4, 2, 3, 0.5, 0, Math.PI * 2); ctx.stroke();
      disc(ctx, 20, 2, 1.4, '#fde047');
    }
  } else {
    // seen from the front or the back
    if (layer === 'under') {
      for (const wx of [-10.5, 10.5]) {
        ctx.fillStyle = dark; rr(ctx, wx - 3.2, -4, 6.4, 13, 2.6); ctx.fill();
        ctx.fillStyle = '#94a3b8'; ctx.fillRect(wx - 0.8, -2 + ((spin * 2.4) % 6), 1.6, 1.8);
      }
      ctx.fillStyle = shade(body, -0.3); rr(ctx, -8, -2, 16, 10, 3); ctx.fill();
      if (view === 'back') { ctx.fillStyle = '#334155'; rr(ctx, -6, -9, 12, 8, 2); ctx.fill(); ctx.fillStyle = '#94a3b8'; ctx.fillRect(-1, 0, 2, 4); }
      ctx.fillStyle = '#1e293b'; rr(ctx, -5, -10, 10, 6, 2.4); ctx.fill();
    } else {
      const g = ctx.createLinearGradient(-9, 0, 9, 0);
      g.addColorStop(0, shade(body, -0.25)); g.addColorStop(0.5, light); g.addColorStop(1, shade(body, -0.25));
      ctx.fillStyle = g;
      rr(ctx, -9, -3, 18, 11, 4); ctx.fill();
      ctx.fillStyle = '#fff'; rr(ctx, -2.8, -1, 5.6, 5.6, 2.6); ctx.fill();
      ctx.fillStyle = dark; ctx.font = '700 5px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('7', 0, 2);
      if (view === 'front') {
        disc(ctx, -6, 1, 1.5, '#fde047'); disc(ctx, 6, 1, 1.5, '#fde047');
        ctx.strokeStyle = '#111827'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.ellipse(0, -6, 4.6, 1.8, 0, 0, Math.PI * 2); ctx.stroke();
      } else { disc(ctx, -6, 2, 1.4, '#ef4444'); disc(ctx, 6, 2, 1.4, '#ef4444'); }
    }
  }
  ctx.restore();
}

export interface DrawPerson {
  x: number;
  y: number;
  dir: 0 | 1 | 2 | 3;
  moving: boolean;
  name: string;
  avatar: AvatarStyle;
  isMe: boolean;
  /** this person's live camera, drawn as a bubble above their head */
  bubble?: HTMLVideoElement | null;
  /** how big the bubble is drawn (1 is the normal size) */
  bubbleScale?: number;
  /** who this is (used to attach emoji reactions) */
  id?: string;
  /** an emoji for their status, shown in the name tag */
  status?: string;
  /** talking right now: a green glow on the picture and the name tag */
  speaking?: boolean;
  /** on a power bike */
  riding?: boolean;
  /** which vehicle they are on */
  vehicle?: 'bike' | 'kart';
  /** sitting down (on a bike or in a kart): the legs do not run, the hands are on the bars */
  seated?: boolean;
}

/** How far each person has walked in total, so the walk cycle always moves forward (x + y shrinks when walking left or up). */
const walked = new Map<string, { x: number; y: number; d: number; t: number }>();
function stridePhase(p: DrawPerson, t: number): number {
  const key = p.id ?? p.name;
  let w = walked.get(key);
  if (!w) { w = { x: p.x, y: p.y, d: 0, t }; walked.set(key, w); }
  if (w.t !== t) {
    const step = Math.hypot(p.x - w.x, p.y - w.y);
    if (step < 3) w.d += step; // a jump (teleport, new space) is not a walk
    w.x = p.x; w.y = p.y; w.t = t;
  }
  return (w.d * TILE) / 7.5;
}

export function drawPerson(ctx: Ctx, p: DrawPerson, t: number, theme: Theme) {
  if (p.riding) {
    const side = p.dir === 1 || p.dir === 2;
    const view = side ? 'side' : p.dir === 3 ? 'back' : 'front';
    const face = p.dir === 1 ? -1 : 1;
    const roll = p.moving ? stridePhase(p, t) * 1.6 : 0;
    if (p.vehicle === 'kart') {
      // a go-kart: the body and wheels first, the driver sitting low inside it, then the front of the kart over their lap
      kartSprite(ctx, p.x * TILE, p.y * TILE + 2, view, face, roll, undefined, 'under');
      ctx.save();
      ctx.translate(0, -4);
      drawPerson(ctx, { ...p, riding: false, seated: true }, t, theme);
      ctx.restore();
      kartSprite(ctx, p.x * TILE, p.y * TILE + 2, view, face, roll, undefined, 'over');
      return;
    }
    // the bike underneath, and the rider sitting on it
    bikeSprite(ctx, p.x * TILE, p.y * TILE + 2, view, face, roll);
    ctx.save();
    ctx.translate(0, -9);
    drawPerson(ctx, { ...p, riding: false, seated: true }, t, theme);
    ctx.restore();
    return;
  }
  const a = p.avatar;
  const px = p.x * TILE;
  const py = p.y * TILE;
  const ph = stridePhase(p, t); // one stride about every 1.2 tiles walked, counted along the way actually walked
  const step = p.moving && !p.seated ? Math.sin(ph) : 0;
  const bob = p.seated ? (p.moving ? Math.sin(t / 130) * 0.45 : 0) : p.moving ? -Math.abs(Math.cos(ph)) * 1.9 : Math.sin(t / 750) * 0.6;
  const lean = p.moving ? (p.dir === 1 ? -1.2 : p.dir === 2 ? 1.2 : 0) : 0;
  const side = p.dir === 1 || p.dir === 2;
  const back = p.dir === 3;
  const fx = p.dir === 1 ? -1 : p.dir === 2 ? 1 : 0; // which way the face looks
  const hy = py - 17 + bob;
  const dressy = a.outfit === 3 || a.outfit === 4;

  // a soft ring under me, and the ground shadow
  if (p.isMe) {
    ctx.strokeStyle = `rgba(59,130,246,${0.45 + 0.2 * Math.sin(t / 400)})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(px, py + 11, 14, 6, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  if (p.speaking) {
    ctx.strokeStyle = `rgba(52,211,153,${0.65 + 0.3 * Math.sin(t / 110)})`;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.ellipse(px, py + 11, 15 + Math.sin(t / 110) * 1.5, 6.5, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  ellipse(ctx, px, py + 11, 11 - bob * 0.4, 4.5 + bob * 0.25, 'rgba(15,23,42,0.24)');

  // hair that hangs behind the body (long hair, hood) goes first
  const hairBack = () => {
    ctx.fillStyle = a.hair;
    if (a.hairStyle === 1) { rr(ctx, px - 9.5, hy - 4, 19, back ? 22 : 16, 7); ctx.fill(); }
    if (a.hairStyle === 4) disc(ctx, px, hy - 2, 11.5, a.hair);
    if (a.hairStyle === 7) disc(ctx, px, hy - 3, 13.2, a.hair);
    if (a.hairStyle === 8) { rr(ctx, px - 9.8, hy - 4, 19.6, back ? 16 : 12, 6); ctx.fill(); }
    if (a.hairStyle === 10) {
      for (let k = 0; k < 6; k++) { rr(ctx, px - 10 + k * 4, hy - 3, 3.4, (back ? 19 : 14) + (k % 2) * 2, 1.7); ctx.fill(); }
    }
  };
  if (a.hairStyle === 1 || a.hairStyle === 4 || a.hairStyle === 7 || a.hairStyle === 8 || a.hairStyle === 10) hairBack();
  if (a.outfit === 1) {
    ctx.fillStyle = shade(a.shirt, -0.2);
    ctx.beginPath();
    ctx.arc(px, py - 11 + bob, 9.5, Math.PI * 0.95, Math.PI * 2.05);
    ctx.fill();
  }

  // legs and shoes
  const lift = (v: number) => -Math.max(0, v) * 2.6;
  const stride = side ? step * 4.5 : 0;
  ctx.fillStyle = dressy ? a.skin : a.pants;
  rr(ctx, px - 6.5 + stride, py + 2 + lift(step), 5.5, p.seated ? 4 : 8, 2);
  ctx.fill();
  rr(ctx, px + 1 - stride, py + 2 + lift(-step), 5.5, p.seated ? 4 : 8, 2);
  ctx.fill();
  const shoe = (sx: number, sy: number) => {
    const sc = a.shoeColor;
    if (a.shoes === 3) {
      // sandals: bare foot, two straps and a thin sole
      ctx.fillStyle = a.skin; rr(ctx, sx, sy + 9.4, 7, 2.6, 1.3); ctx.fill();
      ctx.fillStyle = sc; ctx.fillRect(sx + 1.5, sy + 9.4, 1.4, 2.6); ctx.fillRect(sx + 4.2, sy + 9.4, 1.4, 2.6);
      ctx.fillStyle = shade(sc, -0.3); ctx.fillRect(sx, sy + 11.6, 7, 0.9);
    } else if (a.shoes === 2) {
      // boots: a shaft up the ankle
      ctx.fillStyle = sc; rr(ctx, sx + 0.4, sy + 5.5, 5.8, 5.5, 1.5); ctx.fill(); rr(ctx, sx - 0.4, sy + 9, 7.6, 3.4, 1.6); ctx.fill();
      ctx.fillStyle = shade(sc, -0.35); ctx.fillRect(sx - 0.4, sy + 11.6, 7.6, 1);
      ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fillRect(sx + 1, sy + 6, 1.1, 3);
    } else if (a.shoes === 1) {
      // formal shoes: slim and polished
      ctx.fillStyle = sc; rr(ctx, sx - 0.4, sy + 9, 7.4, 3, 1.4); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.45)'; ctx.fillRect(sx + 1, sy + 9.5, 3, 0.8);
      ctx.fillStyle = shade(sc, -0.4); ctx.fillRect(sx - 0.4, sy + 11.6, 7.4, 0.8);
    } else {
      // sneakers: coloured upper, white sole, laces
      ctx.fillStyle = sc; rr(ctx, sx, sy + 9, 7, 3.2, 1.6); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.fillRect(sx - 0.2, sy + 11.2, 7.4, 1.1); ctx.fillRect(sx + 2.4, sy + 9.4, 2.6, 0.7);
    }
  };
  if (!p.seated) {
    shoe(px - 7.5 + fx * 1.5 + stride, py + lift(step));
    shoe(px + 0.5 + fx * 1.5 - stride, py + lift(-step));
  }

  // arms swing opposite to the legs
  const jacketSleeves = a.jacket >= 1 && a.jacket <= 3;
  const sleeveLong = a.outfit === 1 || a.outfit === 2 || jacketSleeves;
  const arm = (dx: number, swing: number) => {
    const ay = py - 9 + bob + swing * 1.6;
    const axs = side ? swing * 3.2 : 0;
    ctx.fillStyle = jacketSleeves ? a.jacketColor : a.shirt;
    rr(ctx, px + dx - 2.4 + axs + lean, ay, 4.8, sleeveLong ? 10 : 5, 2.4);
    ctx.fill();
    if (!sleeveLong) {
      ctx.fillStyle = a.skin;
      rr(ctx, px + dx - 2.2 + axs + lean, ay + 4, 4.4, 5, 2.2);
      ctx.fill();
    } else {
      disc(ctx, px + dx + axs + lean, ay + 10.5, 2.3, a.skin);
    }
  };
  if (!side) { arm(-10.5, -step); arm(10.5, step); } else arm(fx * -1, -step);

  // body
  const tw = a.outfit === 1 ? 20 : 18;
  ctx.fillStyle = vgrad(ctx, py - 11 + bob, py + 4 + bob, shade(a.shirt, 0.12), shade(a.shirt, -0.12));
  rr(ctx, px - tw / 2, py - 11 + bob, tw, 15, 6);
  ctx.fill();
  if (a.outfit === 6) {
    // an Ankara print: gold and white motifs in rows over the shirt colour
    ctx.save();
    rr(ctx, px - tw / 2, py - 11 + bob, tw, 15, 6);
    ctx.clip();
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 5; c++) {
        const mx = px - tw / 2 + 2 + c * 4.2 + (r % 2) * 2.1;
        const my = py - 9 + bob + r * 3.6;
        ctx.fillStyle = (r + c) % 2 ? '#d6ac50' : '#fff7e0';
        ctx.beginPath();
        ctx.moveTo(mx, my - 1.4); ctx.lineTo(mx + 1.4, my); ctx.lineTo(mx, my + 1.4); ctx.lineTo(mx - 1.4, my);
        ctx.closePath();
        ctx.fill();
      }
    }
    ctx.restore();
  }
  if (!back) {
    if (a.outfit === 0 || a.outfit >= 3) {
      ctx.fillStyle = a.skin;
      ctx.beginPath();
      ctx.arc(px, py - 11 + bob, 3.6, 0, Math.PI);
      ctx.fill();
    } else if (a.outfit === 1) {
      ctx.fillStyle = shade(a.shirt, -0.25);
      rr(ctx, px - 6, py - 3 + bob, 12, 5.5, 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.8)';
      ctx.lineWidth = 0.9;
      ctx.beginPath();
      ctx.moveTo(px - 2.5, py - 9 + bob);
      ctx.lineTo(px - 2.5, py - 4 + bob);
      ctx.moveTo(px + 2.5, py - 9 + bob);
      ctx.lineTo(px + 2.5, py - 4 + bob);
      ctx.stroke();
    } else {
      ctx.fillStyle = '#f8fafc';
      ctx.beginPath();
      ctx.moveTo(px - 4, py - 11 + bob);
      ctx.lineTo(px + 4, py - 11 + bob);
      ctx.lineTo(px, py - 2 + bob);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#e11d48';
      ctx.beginPath();
      ctx.moveTo(px - 1.3, py - 10 + bob);
      ctx.lineTo(px + 1.3, py - 10 + bob);
      ctx.lineTo(px + 1.8, py - 4 + bob);
      ctx.lineTo(px, py - 2.5 + bob);
      ctx.lineTo(px - 1.8, py - 4 + bob);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = shade(a.shirt, -0.35);
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(px - 4, py - 11 + bob);
      ctx.lineTo(px - 0.5, py - 1 + bob);
      ctx.moveTo(px + 4, py - 11 + bob);
      ctx.lineTo(px + 0.5, py - 1 + bob);
      ctx.stroke();
    }
  }

  // jacket: worn over the top, with the inner shirt showing at the collar
  if (a.jacket > 0) {
    const jw = tw + 2;
    const jc = a.jacketColor;
    const jg = vgrad(ctx, py - 11 + bob, py + 4 + bob, shade(jc, 0.12), shade(jc, -0.14));
    if (a.jacket === 4) {
      // a waistcoat: narrower, the shirt sleeves show either side
      ctx.fillStyle = jg;
      rr(ctx, px - (tw - 5) / 2, py - 10.5 + bob, tw - 5, 14, 4);
      ctx.fill();
    } else {
      ctx.fillStyle = jg;
      rr(ctx, px - jw / 2, py - 11.5 + bob, jw, 16, 6);
      ctx.fill();
    }
    if (!back) {
      // the opening at the front: the shirt underneath
      ctx.fillStyle = a.inner;
      ctx.beginPath();
      ctx.moveTo(px - 3.8, py - 11.2 + bob); ctx.lineTo(px + 3.8, py - 11.2 + bob); ctx.lineTo(px + 0.8, py - 1.5 + bob); ctx.lineTo(px - 0.8, py - 1.5 + bob);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = a.skin;
      ctx.beginPath(); ctx.arc(px, py - 11.2 + bob, 2.6, 0, Math.PI); ctx.fill();
      ctx.strokeStyle = shade(jc, -0.35);
      ctx.lineWidth = 0.9;
      ctx.beginPath(); ctx.moveTo(px - 3.8, py - 11.2 + bob); ctx.lineTo(px - 0.8, py - 1.5 + bob); ctx.moveTo(px + 3.8, py - 11.2 + bob); ctx.lineTo(px + 0.8, py - 1.5 + bob); ctx.stroke();
      if (a.jacket === 1) {
        // blazer: lapels, buttons and a breast pocket
        ctx.fillStyle = shade(jc, 0.2);
        ctx.beginPath(); ctx.moveTo(px - 3.8, py - 11.2 + bob); ctx.lineTo(px - 6.6, py - 7.5 + bob); ctx.lineTo(px - 2.4, py - 6 + bob); ctx.closePath(); ctx.fill();
        ctx.beginPath(); ctx.moveTo(px + 3.8, py - 11.2 + bob); ctx.lineTo(px + 6.6, py - 7.5 + bob); ctx.lineTo(px + 2.4, py - 6 + bob); ctx.closePath(); ctx.fill();
        disc(ctx, px + 1.9, py - 3 + bob, 0.8, '#e5e7eb'); disc(ctx, px + 1.9, py + 0.4 + bob, 0.8, '#e5e7eb');
        ctx.fillStyle = shade(jc, -0.25); ctx.fillRect(px - 7.4, py - 7.6 + bob, 3.4, 0.9);
      } else if (a.jacket === 2) {
        // denim: collar, pockets and stitching
        ctx.fillStyle = shade(jc, 0.18);
        ctx.fillRect(px - 5.2, py - 11.6 + bob, 3.2, 2.4); ctx.fillRect(px + 2, py - 11.6 + bob, 3.2, 2.4);
        ctx.strokeStyle = 'rgba(253,224,171,0.85)'; ctx.lineWidth = 0.6;
        for (const sx2 of [-6.2, 3.4]) { ctx.strokeRect(px + sx2, py - 8 + bob, 2.8, 2.6); }
        ctx.beginPath(); ctx.moveTo(px - 8.4, py + 1.8 + bob); ctx.lineTo(px + 8.4, py + 1.8 + bob); ctx.stroke();
        disc(ctx, px + 1.4, py - 5 + bob, 0.7, '#fcd34d'); disc(ctx, px + 1.4, py - 1.6 + bob, 0.7, '#fcd34d');
      } else if (a.jacket === 3) {
        // bomber: ribbed collar and hem, a zip down the middle
        ctx.fillStyle = shade(jc, -0.3);
        rr(ctx, px - jw / 2, py + 1.6 + bob, jw, 3, 1.4); ctx.fill();
        rr(ctx, px - 5.5, py - 12 + bob, 11, 3, 1.4); ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 0.8;
        ctx.beginPath(); ctx.moveTo(px, py - 9 + bob); ctx.lineTo(px, py + 2 + bob); ctx.stroke();
      } else {
        // waistcoat: buttons down the front
        for (let b = 0; b < 3; b++) disc(ctx, px, py - 8 + b * 3.2 + bob, 0.8, '#e5e7eb');
      }
    }
  }
  // a tie, bow tie or scarf
  if (a.tie > 0) {
    const ty = py - 10.6 + bob;
    if (a.tie === 1 && !back) {
      ctx.fillStyle = a.tieColor;
      ctx.beginPath(); ctx.moveTo(px - 1.8, ty); ctx.lineTo(px + 1.8, ty); ctx.lineTo(px + 1.1, ty + 2.2); ctx.lineTo(px - 1.1, ty + 2.2); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(px - 1.1, ty + 2.2); ctx.lineTo(px + 1.1, ty + 2.2); ctx.lineTo(px + 2, ty + 9.4); ctx.lineTo(px, ty + 11); ctx.lineTo(px - 2, ty + 9.4); ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.28)'; ctx.fillRect(px - 0.5, ty + 3, 0.9, 5);
    } else if (a.tie === 2 && !back) {
      ctx.fillStyle = a.tieColor;
      ctx.beginPath(); ctx.moveTo(px, ty + 0.4); ctx.lineTo(px - 5, ty - 2.2); ctx.lineTo(px - 5, ty + 3); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(px, ty + 0.4); ctx.lineTo(px + 5, ty - 2.2); ctx.lineTo(px + 5, ty + 3); ctx.closePath(); ctx.fill();
      disc(ctx, px, ty + 0.4, 1.6, shade(a.tieColor, -0.3));
    } else if (a.tie === 3) {
      ctx.fillStyle = a.tieColor;
      ctx.beginPath(); ctx.ellipse(px, ty + 0.4, 7, 2.8, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = shade(a.tieColor, -0.2);
      ctx.beginPath(); ctx.ellipse(px, ty + 1.4, 7, 1.6, 0, 0, Math.PI); ctx.fill();
      if (!back) { ctx.fillStyle = a.tieColor; rr(ctx, px + 1.2, ty + 1, 3.6, 8.4, 1.4); ctx.fill(); ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.fillRect(px + 1.8, ty + 7, 2.4, 0.8); ctx.fillRect(px + 1.8, ty + 8.4, 2.4, 0.8); }
    }
  }

  // dress or skirt: a flared skirt over the legs
  if (a.outfit === 5) {
    // a kaftan: a straight tunic to the knee with a trimmed hem and an embroidered neckline
    const sway = p.moving ? step * 1.2 : 0;
    ctx.fillStyle = vgrad(ctx, py - 4 + bob, py + 7 + bob, shade(a.shirt, 0.08), shade(a.shirt, -0.18));
    ctx.beginPath();
    ctx.moveTo(px - 9.4, py - 3 + bob);
    ctx.lineTo(px + 9.4, py - 3 + bob);
    ctx.lineTo(px + 10.4 + sway, py + 7 + bob);
    ctx.lineTo(px - 10.4 + sway, py + 7 + bob);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#d6ac50';
    ctx.fillRect(px - 10.4 + sway, py + 5.2 + bob, 20.8, 1.8);
    if (!back) { ctx.fillRect(px - 3.5, py - 10.5 + bob, 7, 1.4); ctx.fillRect(px - 0.7, py - 10.5 + bob, 1.4, 7); }
  }
  if (dressy) {
    const skirt = a.outfit === 3 ? a.shirt : a.pants;
    const sway = p.moving ? step * 1.6 : 0;
    ctx.fillStyle = vgrad(ctx, py - 4 + bob, py + 8 + bob, shade(skirt, 0.1), shade(skirt, -0.16));
    ctx.beginPath();
    ctx.moveTo(px - 8.6, py - 3 + bob);
    ctx.lineTo(px + 8.6, py - 3 + bob);
    ctx.lineTo(px + 12.5 + sway, py + 6.5 + bob);
    ctx.quadraticCurveTo(px, py + 9 + bob, px - 12.5 + sway, py + 6.5 + bob);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = shade(skirt, -0.3);
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    ctx.moveTo(px - 12.5 + sway, py + 6.5 + bob);
    ctx.quadraticCurveTo(px, py + 9 + bob, px + 12.5 + sway, py + 6.5 + bob);
    ctx.stroke();
    // a belt for the dress
    if (a.outfit === 3) { ctx.fillStyle = shade(a.shirt, -0.28); ctx.fillRect(px - 8.8, py - 4.2 + bob, 17.6, 2.2); }
  }

  // head
  const hg = ctx.createRadialGradient(px - 2, hy - 3, 1, px, hy, 10);
  hg.addColorStop(0, shade(a.skin, 0.12));
  hg.addColorStop(1, a.skin);
  disc(ctx, px, hy, 8.6, hg);
  disc(ctx, px - 8.4, hy + 1, 2, a.skin);
  disc(ctx, px + 8.4, hy + 1, 2, a.skin);

  // hair on top of the head
  ctx.fillStyle = a.hair;
  if (back) {
    disc(ctx, px, hy, 9, a.hair);
  } else if (a.hairStyle !== 3) {
    if (a.hairStyle !== 9) {
      ctx.beginPath();
      ctx.arc(px, hy - 1, 9, Math.PI, Math.PI * 2);
      ctx.fill();
    }
    if (a.hairStyle === 8) {
      ctx.beginPath();
      ctx.ellipse(px, hy - 4.5, 9, 3.6, 0, 0, Math.PI);
      ctx.fill();
    } else if (a.hairStyle === 9) {
      ctx.beginPath();
      ctx.ellipse(px + fx * 1.5, hy - 9, side ? 6 : 3.4, 7, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = shade(a.hair, -0.3);
      ctx.fillRect(px - 0.8 + fx * 1.5, hy - 14, 1.6, 8);
      ctx.fillStyle = a.hair;
    }
    if (a.hairStyle === 0) {
      ctx.beginPath();
      ctx.ellipse(px + (fx || -3), hy - 5, 7, 3.5, 0.15, 0, Math.PI * 2);
      ctx.fill();
    } else if (a.hairStyle === 1) {
      rr(ctx, px - 9.5, hy - 3, 4, 14, 2);
      ctx.fill();
      rr(ctx, px + 5.5, hy - 3, 4, 14, 2);
      ctx.fill();
    } else if (a.hairStyle === 2) {
      disc(ctx, px, hy - 11, 4.4, a.hair);
      ctx.fillStyle = shade(a.hair, -0.3);
      ctx.fillRect(px - 4, hy - 8.4, 8, 1.5);
    } else if (a.hairStyle === 4) {
      for (let i = 0; i < 7; i++) {
        const ang = Math.PI * (1.05 + i * 0.15);
        disc(ctx, px + Math.cos(ang) * 8, hy - 1 + Math.sin(ang) * 8, 4, a.hair);
      }
      disc(ctx, px, hy - 8, 5, a.hair);
    } else if (a.hairStyle === 5) {
      ctx.beginPath();
      ctx.ellipse(px + 2 + fx, hy - 9, 7, 4.2, 0.3, 0, Math.PI * 2);
      ctx.fill();
    } else if (a.hairStyle === 6) {
      for (const sx of [-1, 1]) {
        rr(ctx, px + sx * 8.2 - 1.8, hy - 2, 3.6, 19, 1.8);
        ctx.fill();
        ctx.fillStyle = shade(a.hair, -0.35);
        for (let k = 0; k < 5; k++) ctx.fillRect(px + sx * 8.2 - 1.8, hy + 1 + k * 3.4, 3.6, 0.8);
        ctx.fillStyle = a.hair;
      }
    } else if (a.hairStyle === 7) {
      disc(ctx, px, hy - 7, 8, a.hair);
    }
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.beginPath();
    ctx.ellipse(px - 3, hy - 7, 3.5, 1.4, -0.3, 0, Math.PI * 2);
    ctx.fill();
  }

  // face
  if (!back) {
    const ex = fx * 2.6;
    const eyeY = hy + 1;
    const eyes = side ? [px + ex + fx * 1.5] : [px - 3.2 + ex, px + 3.2 + ex];
    const blink = (t + p.x * 977) % 4300 < 130;
    for (const e of eyes) {
      if (blink) {
        ctx.strokeStyle = '#0f172a';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(e - 2, eyeY + 0.5);
        ctx.lineTo(e + 2, eyeY + 0.5);
        ctx.stroke();
        continue;
      }
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.ellipse(e, eyeY, 2.1, 2.3, 0, 0, Math.PI * 2);
      ctx.fill();
      disc(ctx, e + fx * 0.5, eyeY + 0.2, 1.3, '#0f172a');
      disc(ctx, e + fx * 0.5 + 0.5, eyeY - 0.4, 0.5, '#ffffff');
      ctx.strokeStyle = a.hair;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(e - 2, eyeY - 3.2);
      ctx.lineTo(e + 2, eyeY - 3.4);
      ctx.stroke();
    }
    // facial hair
    if (a.beard === 1) {
      ctx.fillStyle = a.hair;
      ctx.globalAlpha = 0.32;
      ctx.beginPath();
      ctx.arc(px, hy, 8.5, 0.12 * Math.PI, 0.88 * Math.PI);
      ctx.fill();
      ctx.globalAlpha = 1;
    } else if (a.beard === 2) {
      ctx.fillStyle = a.hair;
      ctx.beginPath();
      ctx.ellipse(px + ex * 0.8 + fx * 0.5, hy + 3, side ? 2.4 : 4.2, 1.3, 0, 0, Math.PI * 2);
      ctx.fill();
    } else if (a.beard === 3) {
      ctx.fillStyle = a.hair;
      ctx.beginPath();
      ctx.arc(px, hy, 8.9, 0.04 * Math.PI, 0.96 * Math.PI);
      ctx.closePath();
      ctx.fill();
      disc(ctx, px + ex * 0.8, hy + 3.8, 3.3, a.skin);
    }
    ctx.fillStyle = 'rgba(244,114,182,0.22)';
    if (!side) { disc(ctx, px - 5.5, hy + 4, 1.8, ctx.fillStyle); disc(ctx, px + 5.5, hy + 4, 1.8, ctx.fillStyle); }
    ctx.strokeStyle = shade(a.skin, -0.45);
    ctx.lineWidth = 1;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(px + ex * 0.8, hy + 4, 2.1, 0.15 * Math.PI, 0.85 * Math.PI);
    ctx.stroke();
    if (side) { ctx.fillStyle = shade(a.skin, -0.12); disc(ctx, px + fx * 8.2, hy + 2, 1.2, ctx.fillStyle); }

    // accessories
    if (a.glasses === 2) {
      ctx.fillStyle = '#0b1220';
      for (const e of eyes) { rr(ctx, e - 3.6, eyeY - 2.6, 7.2, 5, 2); ctx.fill(); }
      if (!side) ctx.fillRect(eyes[0] + 3.4, eyeY - 1.4, eyes[1] - eyes[0] - 6.8, 1.2);
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      for (const e of eyes) ctx.fillRect(e - 2.4, eyeY - 1.9, 2.2, 0.9);
    }
    if (a.glasses === 1) {
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = 1.2;
      for (const e of eyes) { ctx.beginPath(); ctx.arc(e, eyeY, 3.2, 0, Math.PI * 2); ctx.stroke(); }
      if (!side) { ctx.beginPath(); ctx.moveTo(eyes[0] + 3.2, eyeY); ctx.lineTo(eyes[1] - 3.2, eyeY); ctx.stroke(); }
    }
  }
  if (a.extra === 1) {
    ctx.strokeStyle = '#1f2937';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(px, hy - 1, 9.6, Math.PI * 1.02, Math.PI * 1.98);
    ctx.stroke();
    disc(ctx, px - 9.6, hy + 1, 2.8, '#111827');
    disc(ctx, px + 9.6, hy + 1, 2.8, '#111827');
    if (!back && !side) {
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(px - 9.6, hy + 3);
      ctx.quadraticCurveTo(px - 8, hy + 9, px - 2, hy + 8);
      ctx.stroke();
      disc(ctx, px - 2, hy + 8, 1.4, '#111827');
    }
  }
  if (a.hat === 1) {
    const cap = a.hatColor;
    ctx.fillStyle = cap;
    ctx.beginPath();
    ctx.arc(px, hy - 2, 9.4, Math.PI, Math.PI * 2);
    ctx.fill();
    if (!back) {
      ctx.beginPath();
      if (side) ctx.ellipse(px + fx * 8, hy - 2, 6, 2.2, 0, 0, Math.PI * 2);
      else ctx.ellipse(px, hy - 0.5, 8.5, 2.6, 0, 0, Math.PI);
      ctx.fill();
    }
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    disc(ctx, px, hy - 9, 1.2, ctx.fillStyle);
  }

  if (a.hat === 2) {
    const bc = a.hatColor;
    ctx.fillStyle = bc;
    ctx.beginPath();
    ctx.arc(px, hy - 2.5, 9.6, Math.PI, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = shade(bc, -0.2);
    rr(ctx, px - 9.8, hy - 4, 19.6, 3.6, 1.6);
    ctx.fill();
    disc(ctx, px, hy - 13, 2.4, shade(bc, 0.25));
  }
  if (a.hat === 4) {
    // a beret: a soft flat cap pulled to one side, with a little stalk
    ctx.fillStyle = a.hatColor;
    ctx.beginPath();
    ctx.ellipse(px + 1.6, hy - 7, 10.4, 4.6, -0.22, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = shade(a.hatColor, -0.22);
    ctx.beginPath();
    ctx.ellipse(px, hy - 3.4, 9.2, 1.8, 0, 0, Math.PI);
    ctx.fill();
    disc(ctx, px + 1.8, hy - 11.4, 1.1, shade(a.hatColor, -0.3));
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.beginPath(); ctx.ellipse(px - 2.4, hy - 8.4, 3.4, 1.1, -0.3, 0, Math.PI * 2); ctx.fill();
  }
  if (a.hat === 3) {
    const wc = a.hatColor;
    ctx.fillStyle = wc;
    ctx.beginPath();
    ctx.arc(px, hy - 1.5, 9.8, Math.PI * 0.96, Math.PI * 2.04);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(px + 1.5 + fx * 2, hy - 11.5, 8.5, 4.6, -0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = shade(wc, -0.3);
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    ctx.moveTo(px - 8, hy - 4);
    ctx.quadraticCurveTo(px, hy - 8, px + 8, hy - 3);
    ctx.stroke();
  }

  if (a.extra === 2 && !back) {
    for (const ex of side ? [px - fx * 6.5] : [px - 8.6, px + 8.6]) {
      disc(ctx, ex, hy + 4.4, 1.9, '#d6ac50');
      disc(ctx, ex - 0.4, hy + 3.9, 0.7, '#fff3c4');
    }
  }
  // name tag (skipped when there is no name, as in the avatar preview)
  ctx.font = '600 11px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const label = p.status ? `${p.status} ${p.name}` : p.name;
  const w = ctx.measureText(label).width + 16 + (p.status ? 0 : 0);
  const ty = py - 38 + bob;
  if (p.name) {
  ctx.fillStyle = 'rgba(15,23,42,0.25)';
  rr(ctx, px - w / 2 + 1, ty - 8, w, 18, 9);
  ctx.fill();
  ctx.fillStyle = p.isMe ? 'rgba(37,99,235,0.96)' : theme.dark ? 'rgba(15,23,42,0.88)' : 'rgba(15,23,42,0.82)';
  rr(ctx, px - w / 2, ty - 9, w, 18, 9);
  ctx.fill();
  if (!p.status) {
    ctx.fillStyle = p.isMe ? '#bfdbfe' : '#34d399';
    disc(ctx, px - w / 2 + 7, ty, 2.2, ctx.fillStyle);
  }
  ctx.fillStyle = '#fff';
  ctx.fillText(label, px + (p.status ? 0 : 3), ty + 0.5);
  }

  // live camera bubble above the name tag, like Gather
  const v = p.bubble;
  if (v && v.readyState >= 2 && v.videoWidth > 0) {
    const bk = p.bubbleScale ?? 1;
    const bw = 96 * bk;
    const bh = 72 * bk;
    const bx = px - bw / 2;
    const by = ty - 9 - 8 - bh;
    ctx.fillStyle = 'rgba(15,23,42,0.3)';
    rr(ctx, bx + 1, by + 3, bw, bh, 10);
    ctx.fill();
    ctx.save();
    rr(ctx, bx, by, bw, bh, 10);
    ctx.clip();
    const vr = v.videoWidth / v.videoHeight;
    const br = bw / bh;
    let sx = 0;
    let sy = 0;
    let sw = v.videoWidth;
    let sh = v.videoHeight;
    if (vr > br) { sw = v.videoHeight * br; sx = (v.videoWidth - sw) / 2; } else { sh = v.videoWidth / br; sy = (v.videoHeight - sh) / 2; }
    if (p.isMe) {
      ctx.translate(bx + bw, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(v, sx, sy, sw, sh, 0, by, bw, bh);
    } else {
      ctx.drawImage(v, sx, sy, sw, sh, bx, by, bw, bh);
    }
    ctx.restore();
    const edge = p.speaking ? '#34d399' : p.isMe ? '#3b82f6' : '#ffffff';
    if (p.speaking) {
      ctx.save();
      ctx.shadowColor = 'rgba(52,211,153,0.9)';
      ctx.shadowBlur = 12 + Math.sin(t / 110) * 4;
      ctx.strokeStyle = edge;
      ctx.lineWidth = 3;
      rr(ctx, bx, by, bw, bh, 10);
      ctx.stroke();
      ctx.restore();
    }
    ctx.strokeStyle = edge;
    ctx.lineWidth = p.speaking ? 3 : 2;
    rr(ctx, bx, by, bw, bh, 10);
    ctx.stroke();
    ctx.fillStyle = edge;
    ctx.beginPath();
    ctx.moveTo(px - 4, by + bh);
    ctx.lineTo(px + 4, by + bh);
    ctx.lineTo(px, by + bh + 5);
    ctx.closePath();
    ctx.fill();
  }
}
