// Canvas drawing for the office: a warm modern 2.5D style (textured floors, windows with light, detailed furniture,
// soft shadows, gentle animation). Everything is drawn from code, so there are no image files to license or load.
import type { AvatarStyle, Item, MapDef, Zone } from './types';
import { itemSize } from './world';

export const TILE = 36;

export const SKIN_TONES = ['#f6d3b3', '#e8b98f', '#c98d63', '#9c6644', '#6f4a33', '#4a3022'];
export const HAIR_COLORS = ['#1c1917', '#3f2a1d', '#7c4a21', '#c08a3e', '#d8d3c9', '#b91c1c', '#4f46e5'];
export const SHIRT_COLORS = ['#2563eb', '#0ea5a4', '#16a34a', '#f59e0b', '#dc2626', '#9333ea', '#ec4899', '#475569'];
export const PANTS_COLORS = ['#334155', '#1e293b', '#475569', '#78350f', '#1e3a8a', '#14532d'];

type Hair = AvatarStyle['hairStyle'];

/** A stable default look from someone's id, until they pick their own. */
export function defaultAvatar(id: string): AvatarStyle {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return {
    skin: SKIN_TONES[h % SKIN_TONES.length],
    hair: HAIR_COLORS[(h >> 3) % HAIR_COLORS.length],
    shirt: SHIRT_COLORS[(h >> 6) % SHIRT_COLORS.length],
    hairStyle: ((h >> 9) % 6) as Hair,
    outfit: ((h >> 12) % 3) as 0 | 1 | 2,
    accessory: ([0, 0, 0, 1, 2, 3][(h >> 14) % 6]) as 0 | 1 | 2 | 3,
    pants: PANTS_COLORS[(h >> 17) % PANTS_COLORS.length],
  };
}

const hexRe = /^#[0-9a-fA-F]{6}$/;
/** Avatar read from the network or database: any bad field falls back to the default look for that id. */
export function cleanAvatar(raw: unknown, id: string): AvatarStyle {
  const d = defaultAvatar(id);
  if (!raw || typeof raw !== 'object') return d;
  const o = raw as Record<string, unknown>;
  const col = (v: unknown, fb: string) => (typeof v === 'string' && hexRe.test(v) ? v : fb);
  const pick = <T extends number>(v: unknown, allowed: readonly number[], fb: T): T => (typeof v === 'number' && allowed.includes(v) ? (v as T) : fb);
  return {
    skin: col(o.skin, d.skin),
    hair: col(o.hair, d.hair),
    shirt: col(o.shirt, d.shirt),
    hairStyle: pick<Hair>(o.hairStyle, [0, 1, 2, 3, 4, 5], d.hairStyle),
    outfit: pick<0 | 1 | 2>(o.outfit, [0, 1, 2], d.outfit),
    accessory: pick<0 | 1 | 2 | 3>(o.accessory, [0, 1, 2, 3], d.accessory),
    pants: col(o.pants, d.pants),
  };
}

// ---------- small helpers ----------

type Ctx = CanvasRenderingContext2D;

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
  for (let y = 0; y < map.h; y++) {
    for (let x = 0; x < map.w; x++) {
      if (map.walls[y][x]) continue;
      const px = x * TILE;
      const py = y * TILE;
      const z = zoneAt(x, y);
      if (z?.kind === 'lounge') {
        // wooden planks, each a slightly different shade, seams staggered row by row
        for (let r = 0; r < 3; r++) {
          const off = ((x + y + r) % 2) * 0.5;
          ctx.fillStyle = h2(x * 3 + r, y) > 0.5 ? c.woodA : c.woodB;
          ctx.fillRect(px, py + r * 12, TILE, 12);
          ctx.fillStyle = c.plank;
          ctx.fillRect(px, py + r * 12 + 11, TILE, 1);
          ctx.fillRect(px + TILE * off + 6, py + r * 12, 1, 11);
        }
      } else if (z?.kind === 'meeting') {
        // carpet with a woven speckle
        ctx.fillStyle = c.carpet;
        ctx.fillRect(px, py, TILE, TILE);
        ctx.fillStyle = c.carpetDot;
        for (let i = 0; i < 6; i++) ctx.fillRect(px + h2(x * 7 + i, y) * (TILE - 2), py + h2(x, y * 7 + i) * (TILE - 2), 2, 2);
      } else if (z?.kind === 'portal') {
        ctx.fillStyle = theme.dark ? '#16503d' : '#bbf7d0';
        ctx.fillRect(px, py, TILE, TILE);
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
  const c = pal(theme.dark);
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
        // windows along the outer top wall
        if (y === 0 && x % 4 !== 0 && x < map.w - 1) {
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

export function drawZoneLabels(ctx: Ctx, zones: Zone[], theme: Theme) {
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '600 12px system-ui, sans-serif';
  for (const z of zones) {
    if (z.kind === 'area') continue;
    const cx = (z.x + z.w / 2) * TILE;
    const cy = (z.y + 0.5) * TILE + (z.kind === 'portal' ? 0 : 6);
    const w = ctx.measureText(z.name).width + 18;
    ctx.fillStyle = 'rgba(15,23,42,0.18)';
    rr(ctx, cx - w / 2 + 1, cy - 10, w, 22, 11);
    ctx.fill();
    ctx.fillStyle = theme.dark ? 'rgba(15,23,42,0.8)' : 'rgba(255,255,255,0.92)';
    rr(ctx, cx - w / 2, cy - 11, w, 22, 11);
    ctx.fill();
    ctx.fillStyle = z.kind === 'portal' ? '#10b981' : z.kind === 'meeting' ? '#3b82f6' : '#f59e0b';
    disc(ctx, cx - w / 2 + 9, cy, 3, ctx.fillStyle);
    ctx.fillStyle = theme.dark ? '#e2e8f0' : '#1e293b';
    ctx.fillText(z.name, cx + 4, cy + 0.5);
  }
}

// ---------- furniture ----------

const TOP: Item['t'][] = ['computer', 'papers', 'mug'];

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
  switch (item.t) {
    case 'rug': {
      const base = ['#7c83e8', '#e08aa6', '#5fb5a8', '#d9a35f'][Math.floor(seed * 4)];
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
      ctx.fillStyle = '#a3774a';
      rr(ctx, x + 1, y + 6, W - 2, H - 9, 6);
      ctx.fill();
      // the top
      ctx.fillStyle = vgrad(ctx, y + 2, y + H - 9, '#ecd0a8', '#d6ad7c');
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
      ctx.fillStyle = '#9d7143';
      rr(ctx, x + 2, y + 6, W - 4, H - 9, 13);
      ctx.fill();
      ctx.fillStyle = vgrad(ctx, y + 3, y + H - 8, '#eed2aa', '#d9b283');
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
      const c = ['#475569', '#2f6f9f', '#4f5d95', '#2f7f6f'][Math.floor(seed * 4)];
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
      ctx.fillStyle = vgrad(ctx, y + 21, y + 33, '#d27a4d', '#b5593a');
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
        const col = FLOWER_COLORS[(i + Math.floor(seed * 6)) % 6];
        for (let p = 0; p < 5; p++) {
          const a = (p / 5) * Math.PI * 2 + i;
          disc(ctx, bx + Math.cos(a) * 2.6, by + Math.sin(a) * 2.6, 2.1, col);
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
      const base = SOFA_COLORS[Math.floor(seed * SOFA_COLORS.length)];
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
      const c = BEAN_COLORS[Math.floor(seed * BEAN_COLORS.length)];
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
      ctx.fillStyle = '#7d5532';
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
      ctx.fillStyle = '#fcd34d';
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

/** Sort key so things lower on the screen draw over things behind them. */
export function depth(item: Item): number {
  const { h } = itemSize(item);
  if (item.t === 'rug' || item.t === 'grass') return -100 + item.y;
  if (TOP.includes(item.t)) return item.y + 1.2; // always on top of the desk it sits on
  return item.y + h;
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
}

export function drawPerson(ctx: Ctx, p: DrawPerson, t: number, theme: Theme) {
  const a = p.avatar;
  const px = p.x * TILE;
  const py = p.y * TILE;
  const bob = p.moving ? Math.sin(t / 90) * 1.5 : Math.sin(t / 700) * 0.5;
  const step = p.moving ? Math.sin(t / 90) : 0;
  const side = p.dir === 1 || p.dir === 2;
  const back = p.dir === 3;
  const fx = p.dir === 1 ? -1 : p.dir === 2 ? 1 : 0; // which way the face looks
  const hy = py - 17 + bob;

  // a soft ring under me, and the ground shadow
  if (p.isMe) {
    ctx.strokeStyle = `rgba(59,130,246,${0.45 + 0.2 * Math.sin(t / 400)})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(px, py + 11, 14, 6, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  ellipse(ctx, px, py + 11, 11, 4.5, 'rgba(15,23,42,0.24)');

  // hair that hangs behind the body (long hair, hood) goes first
  const hairBack = () => {
    ctx.fillStyle = a.hair;
    if (a.hairStyle === 1) { rr(ctx, px - 9.5, hy - 4, 19, back ? 22 : 16, 7); ctx.fill(); }
    if (a.hairStyle === 4) disc(ctx, px, hy - 2, 11.5, a.hair);
  };
  if (a.hairStyle === 1 || a.hairStyle === 4) hairBack();
  if (a.outfit === 1) {
    ctx.fillStyle = shade(a.shirt, -0.2);
    ctx.beginPath();
    ctx.arc(px, py - 11 + bob, 9.5, Math.PI * 0.95, Math.PI * 2.05);
    ctx.fill();
  }

  // legs and shoes
  const lift = (s: number) => (s > 0 ? -1.6 : 0);
  ctx.fillStyle = a.pants;
  rr(ctx, px - 6.5, py + 2 + lift(step), 5.5, 8, 2);
  ctx.fill();
  rr(ctx, px + 1, py + 2 + lift(-step), 5.5, 8, 2);
  ctx.fill();
  ctx.fillStyle = '#0f172a';
  rr(ctx, px - 7.5 + fx * 1.5, py + 9 + lift(step), 7, 3.2, 1.6);
  ctx.fill();
  rr(ctx, px + 0.5 + fx * 1.5, py + 9 + lift(-step), 7, 3.2, 1.6);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.fillRect(px - 7 + fx * 1.5, py + 11, 6, 0.8);
  ctx.fillRect(px + 1 + fx * 1.5, py + 11, 6, 0.8);

  // arms swing opposite to the legs
  const sleeveLong = a.outfit !== 0;
  const arm = (dx: number, swing: number) => {
    const ay = py - 9 + bob + swing * 1.6;
    ctx.fillStyle = a.shirt;
    rr(ctx, px + dx - 2.4, ay, 4.8, sleeveLong ? 10 : 5, 2.4);
    ctx.fill();
    if (!sleeveLong) {
      ctx.fillStyle = a.skin;
      rr(ctx, px + dx - 2.2, ay + 4, 4.4, 5, 2.2);
      ctx.fill();
    } else {
      disc(ctx, px + dx, ay + 10.5, 2.3, a.skin);
    }
  };
  if (!side) { arm(-10.5, -step); arm(10.5, step); } else arm(fx * -1, -step);

  // body
  const tw = a.outfit === 1 ? 20 : 18;
  ctx.fillStyle = vgrad(ctx, py - 11 + bob, py + 4 + bob, shade(a.shirt, 0.12), shade(a.shirt, -0.12));
  rr(ctx, px - tw / 2, py - 11 + bob, tw, 15, 6);
  ctx.fill();
  if (!back) {
    if (a.outfit === 0) {
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
    ctx.beginPath();
    ctx.arc(px, hy - 1, 9, Math.PI, Math.PI * 2);
    ctx.fill();
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
    for (const e of eyes) {
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
    if (a.accessory === 1) {
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = 1.2;
      for (const e of eyes) { ctx.beginPath(); ctx.arc(e, eyeY, 3.2, 0, Math.PI * 2); ctx.stroke(); }
      if (!side) { ctx.beginPath(); ctx.moveTo(eyes[0] + 3.2, eyeY); ctx.lineTo(eyes[1] - 3.2, eyeY); ctx.stroke(); }
    }
  }
  if (a.accessory === 2) {
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
  if (a.accessory === 3) {
    const cap = shade(a.shirt, -0.1);
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

  // name tag
  ctx.font = '600 11px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const w = ctx.measureText(p.name).width + 16;
  const ty = py - 38 + bob;
  ctx.fillStyle = 'rgba(15,23,42,0.25)';
  rr(ctx, px - w / 2 + 1, ty - 8, w, 18, 9);
  ctx.fill();
  ctx.fillStyle = p.isMe ? 'rgba(37,99,235,0.96)' : theme.dark ? 'rgba(15,23,42,0.88)' : 'rgba(15,23,42,0.82)';
  rr(ctx, px - w / 2, ty - 9, w, 18, 9);
  ctx.fill();
  ctx.fillStyle = p.isMe ? '#bfdbfe' : '#34d399';
  disc(ctx, px - w / 2 + 7, ty, 2.2, ctx.fillStyle);
  ctx.fillStyle = '#fff';
  ctx.fillText(p.name, px + 3, ty + 0.5);

  // live camera bubble above the name tag, like Gather
  const v = p.bubble;
  if (v && v.readyState >= 2 && v.videoWidth > 0) {
    const bw = 64;
    const bh = 48;
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
    const edge = p.isMe ? '#3b82f6' : '#ffffff';
    ctx.strokeStyle = edge;
    ctx.lineWidth = 2;
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
