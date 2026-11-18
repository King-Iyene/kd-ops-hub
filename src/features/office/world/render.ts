// Canvas drawing for the office: a clean modern flat style (soft floors, extruded walls, rounded furniture, shadows).
// Everything is drawn from code, so there are no image files to license or load.
import type { AvatarStyle, Item, MapDef, Zone } from './types';
import { itemSize } from './world';

export const TILE = 36;

export const SKIN_TONES = ['#f6d3b3', '#e8b98f', '#c98d63', '#9c6644', '#6f4a33', '#4a3022'];
export const HAIR_COLORS = ['#1c1917', '#3f2a1d', '#7c4a21', '#c08a3e', '#d8d3c9', '#b91c1c', '#4f46e5'];
export const SHIRT_COLORS = ['#2563eb', '#0ea5a4', '#16a34a', '#f59e0b', '#dc2626', '#9333ea', '#ec4899', '#475569'];

/** A stable default look from someone's id, until they pick their own. */
export function defaultAvatar(id: string): AvatarStyle {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return {
    skin: SKIN_TONES[h % SKIN_TONES.length],
    hair: HAIR_COLORS[(h >> 3) % HAIR_COLORS.length],
    shirt: SHIRT_COLORS[(h >> 6) % SHIRT_COLORS.length],
    hairStyle: ((h >> 9) % 4) as 0 | 1 | 2 | 3,
  };
}

const hex = /^#[0-9a-fA-F]{6}$/;
/** Avatar read from the network or database: any bad field falls back to the default look for that id. */
export function cleanAvatar(raw: unknown, id: string): AvatarStyle {
  const d = defaultAvatar(id);
  if (!raw || typeof raw !== 'object') return d;
  const o = raw as Record<string, unknown>;
  const col = (v: unknown, fb: string) => (typeof v === 'string' && hex.test(v) ? v : fb);
  const hs = typeof o.hairStyle === 'number' && [0, 1, 2, 3].includes(o.hairStyle) ? (o.hairStyle as 0 | 1 | 2 | 3) : d.hairStyle;
  return { skin: col(o.skin, d.skin), hair: col(o.hair, d.hair), shirt: col(o.shirt, d.shirt), hairStyle: hs };
}

function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rad = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.arcTo(x + w, y, x + w, y + h, rad);
  ctx.arcTo(x + w, y + h, x, y + h, rad);
  ctx.arcTo(x, y + h, x, y, rad);
  ctx.arcTo(x, y, x + w, y, rad);
  ctx.closePath();
}

export interface Theme {
  dark: boolean;
}

function floorColors(theme: Theme) {
  return theme.dark
    ? { a: '#2a3345', b: '#2d374a', meeting: '#26405c', lounge: '#4a3a2c', portal: '#1f6f54', wall: '#10172a', wallTop: '#27324d', void: '#0b1020' }
    : { a: '#eef2f8', b: '#e8edf5', meeting: '#dbeafe', lounge: '#fde9cf', portal: '#bbf7d0', wall: '#334155', wallTop: '#64748b', void: '#cbd5e1' };
}

export function drawFloor(ctx: CanvasRenderingContext2D, map: MapDef, theme: Theme) {
  const c = floorColors(theme);
  for (let y = 0; y < map.h; y++) {
    for (let x = 0; x < map.w; x++) {
      if (map.walls[y][x]) continue;
      ctx.fillStyle = (x + y) % 2 === 0 ? c.a : c.b;
      ctx.fillRect(x * TILE, y * TILE, TILE, TILE);
    }
  }
  for (const z of map.zones) {
    if (z.kind === 'area') continue;
    ctx.fillStyle = z.kind === 'meeting' ? c.meeting : z.kind === 'lounge' ? c.lounge : c.portal;
    ctx.globalAlpha = z.kind === 'portal' ? 0.9 : 0.85;
    for (let y = z.y; y < z.y + z.h; y++) for (let x = z.x; x < z.x + z.w; x++) if (!map.walls[y]?.[x]) ctx.fillRect(x * TILE, y * TILE, TILE, TILE);
    ctx.globalAlpha = 1;
  }
}

export function drawWalls(ctx: CanvasRenderingContext2D, map: MapDef, theme: Theme) {
  const c = floorColors(theme);
  for (let y = 0; y < map.h; y++) {
    for (let x = 0; x < map.w; x++) {
      if (!map.walls[y][x]) continue;
      // wall body with a lighter top face and a soft shadow on the floor below
      if (y + 1 < map.h && !map.walls[y + 1][x]) {
        ctx.fillStyle = 'rgba(15,23,42,0.18)';
        ctx.fillRect(x * TILE, (y + 1) * TILE, TILE, 7);
      }
      ctx.fillStyle = c.wall;
      ctx.fillRect(x * TILE, y * TILE, TILE, TILE);
      ctx.fillStyle = c.wallTop;
      ctx.fillRect(x * TILE, y * TILE, TILE, TILE - 9);
    }
  }
}

export function drawZoneLabels(ctx: CanvasRenderingContext2D, zones: Zone[], theme: Theme) {
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '600 12px system-ui, sans-serif';
  for (const z of zones) {
    if (z.kind === 'area') continue;
    const cx = (z.x + z.w / 2) * TILE;
    const cy = (z.y + (z.kind === 'portal' ? 0.5 : 0.5)) * TILE + (z.kind === 'portal' ? 0 : 6);
    const label = z.name;
    const w = ctx.measureText(label).width + 16;
    ctx.fillStyle = theme.dark ? 'rgba(15,23,42,0.75)' : 'rgba(255,255,255,0.85)';
    rr(ctx, cx - w / 2, cy - 11, w, 22, 11);
    ctx.fill();
    ctx.fillStyle = theme.dark ? '#e2e8f0' : '#1e293b';
    ctx.fillText(label, cx, cy + 0.5);
  }
}

function drawItem(ctx: CanvasRenderingContext2D, item: Item, dark: boolean) {
  const { w, h } = itemSize(item);
  const x = item.x * TILE;
  const y = item.y * TILE;
  const W = w * TILE;
  const H = h * TILE;
  const shadow = () => {
    ctx.fillStyle = 'rgba(15,23,42,0.16)';
    rr(ctx, x + 3, y + 5, W - 2, H - 2, 8);
    ctx.fill();
  };
  switch (item.t) {
    case 'rug': {
      ctx.fillStyle = dark ? '#4c4f9a' : '#a5b4fc';
      ctx.globalAlpha = 0.75;
      rr(ctx, x + 2, y + 2, W - 4, H - 4, 12);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.strokeStyle = dark ? '#8187e6' : '#6366f1';
      ctx.lineWidth = 2;
      rr(ctx, x + 8, y + 8, W - 16, H - 16, 8);
      ctx.stroke();
      break;
    }
    case 'desk': {
      shadow();
      ctx.fillStyle = '#b98a5e';
      rr(ctx, x + 1, y + 2, W - 2, H - 4, 7);
      ctx.fill();
      ctx.fillStyle = '#d9b48a';
      rr(ctx, x + 1, y + 2, W - 2, H - 10, 7);
      ctx.fill();
      break;
    }
    case 'table': {
      shadow();
      ctx.fillStyle = '#c79a6b';
      rr(ctx, x + 2, y + 3, W - 4, H - 6, 12);
      ctx.fill();
      ctx.fillStyle = '#e3c39c';
      rr(ctx, x + 2, y + 3, W - 4, H - 14, 12);
      ctx.fill();
      break;
    }
    case 'computer': {
      ctx.fillStyle = '#0f172a';
      rr(ctx, x + 8, y + 4, TILE - 16, 15, 3);
      ctx.fill();
      ctx.fillStyle = '#38bdf8';
      rr(ctx, x + 10, y + 6, TILE - 20, 11, 2);
      ctx.fill();
      ctx.fillStyle = '#334155';
      ctx.fillRect(x + TILE / 2 - 2, y + 19, 4, 5);
      ctx.fillRect(x + TILE / 2 - 7, y + 24, 14, 3);
      break;
    }
    case 'chair': {
      ctx.fillStyle = 'rgba(15,23,42,0.18)';
      ctx.beginPath();
      ctx.ellipse(x + TILE / 2, y + TILE / 2 + 5, 11, 7, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#475569';
      ctx.beginPath();
      ctx.arc(x + TILE / 2, y + TILE / 2 + 2, 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#64748b';
      ctx.beginPath();
      ctx.arc(x + TILE / 2, y + TILE / 2, 8, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'plant': {
      ctx.fillStyle = 'rgba(15,23,42,0.18)';
      ctx.beginPath();
      ctx.ellipse(x + TILE / 2, y + TILE - 5, 11, 5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#c2693f';
      rr(ctx, x + 10, y + 20, 16, 12, 4);
      ctx.fill();
      ctx.fillStyle = '#16a34a';
      for (const [dx, dy, r] of [[18, 12, 9], [11, 16, 7], [25, 16, 7], [18, 7, 6]] as const) {
        ctx.beginPath();
        ctx.arc(x + dx, y + dy, r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = '#22c55e';
      ctx.beginPath();
      ctx.arc(x + 16, y + 10, 5, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'sofa': {
      shadow();
      ctx.fillStyle = '#4f6df5';
      rr(ctx, x + 1, y + 3, W - 2, H - 5, 10);
      ctx.fill();
      ctx.fillStyle = '#6b86ff';
      for (let i = 0; i < w; i++) {
        rr(ctx, x + 4 + i * TILE, y + 8, TILE - 8, H - 14, 7);
        ctx.fill();
      }
      break;
    }
    case 'shelf': {
      shadow();
      ctx.fillStyle = '#92643f';
      rr(ctx, x + 1, y + 2, W - 2, H - 3, 5);
      ctx.fill();
      const cols = ['#ef4444', '#3b82f6', '#f59e0b', '#10b981', '#8b5cf6'];
      for (let i = 0; i < w * 5; i++) {
        ctx.fillStyle = cols[i % cols.length];
        ctx.fillRect(x + 5 + i * ((W - 10) / (w * 5)), y + 6, 4, 14);
      }
      break;
    }
    case 'whiteboard': {
      shadow();
      ctx.fillStyle = '#94a3b8';
      rr(ctx, x + 1, y + 2, W - 2, H - 4, 4);
      ctx.fill();
      ctx.fillStyle = '#f8fafc';
      rr(ctx, x + 4, y + 5, W - 8, H - 12, 3);
      ctx.fill();
      ctx.strokeStyle = '#3b82f6';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x + 10, y + 14);
      ctx.lineTo(x + W * 0.45, y + 12);
      ctx.moveTo(x + 10, y + 20);
      ctx.lineTo(x + W * 0.6, y + 18);
      ctx.stroke();
      break;
    }
    case 'lamp': {
      ctx.fillStyle = 'rgba(250,204,21,0.25)';
      ctx.beginPath();
      ctx.arc(x + TILE / 2, y + TILE / 2, 15, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#facc15';
      ctx.beginPath();
      ctx.arc(x + TILE / 2, y + TILE / 2, 6, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'coffee': {
      shadow();
      ctx.fillStyle = '#1f2937';
      rr(ctx, x + 6, y + 4, TILE - 12, TILE - 8, 5);
      ctx.fill();
      ctx.fillStyle = '#ef4444';
      ctx.fillRect(x + 12, y + 9, 5, 3);
      ctx.fillStyle = '#e5e7eb';
      ctx.fillRect(x + 12, y + 18, 12, 8);
      break;
    }
    case 'bin': {
      ctx.fillStyle = '#64748b';
      rr(ctx, x + 11, y + 11, 14, 17, 3);
      ctx.fill();
      ctx.fillStyle = '#94a3b8';
      rr(ctx, x + 9, y + 9, 18, 4, 2);
      ctx.fill();
      break;
    }
  }
}

/** Sort key so things lower on the screen draw over things behind them. */
export function depth(item: Item): number {
  const { h } = itemSize(item);
  if (item.t === 'rug') return -100 + item.y;
  if (item.t === 'computer') return item.y + 1.2; // always on top of the desk it sits on
  return item.y + h;
}

export function drawItems(ctx: CanvasRenderingContext2D, items: Item[], theme: Theme) {
  const sorted = [...items].sort((a, b) => depth(a) - depth(b));
  for (const it of sorted) drawItem(ctx, it, theme.dark);
}

export interface DrawPerson {
  x: number;
  y: number;
  dir: 0 | 1 | 2 | 3;
  moving: boolean;
  name: string;
  avatar: AvatarStyle;
  isMe: boolean;
}

export function drawPerson(ctx: CanvasRenderingContext2D, p: DrawPerson, t: number, theme: Theme) {
  const px = p.x * TILE;
  const py = p.y * TILE;
  const bob = p.moving ? Math.sin(t / 90) * 1.6 : Math.sin(t / 600) * 0.5;
  // shadow
  ctx.fillStyle = 'rgba(15,23,42,0.22)';
  ctx.beginPath();
  ctx.ellipse(px, py + 11, 10, 4.5, 0, 0, Math.PI * 2);
  ctx.fill();
  // legs
  ctx.fillStyle = '#334155';
  const step = p.moving ? Math.sin(t / 90) * 2.5 : 0;
  rr(ctx, px - 6, py + 2 + (step > 0 ? 0 : -1), 5, 9, 2);
  ctx.fill();
  rr(ctx, px + 1, py + 2 + (step > 0 ? -1 : 0), 5, 9, 2);
  ctx.fill();
  // body
  ctx.fillStyle = p.avatar.shirt;
  rr(ctx, px - 9, py - 11 + bob, 18, 15, 6);
  ctx.fill();
  // head
  ctx.fillStyle = p.avatar.skin;
  ctx.beginPath();
  ctx.arc(px, py - 17 + bob, 8.5, 0, Math.PI * 2);
  ctx.fill();
  // hair
  ctx.fillStyle = p.avatar.hair;
  const hy = py - 17 + bob;
  if (p.dir === 3) {
    ctx.beginPath();
    ctx.arc(px, hy, 8.6, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.beginPath();
    ctx.arc(px, hy - 1, 8.8, Math.PI, Math.PI * 2);
    ctx.fill();
    if (p.avatar.hairStyle === 1) {
      rr(ctx, px - 9, hy - 2, 4, 12, 2);
      ctx.fill();
      rr(ctx, px + 5, hy - 2, 4, 12, 2);
      ctx.fill();
    } else if (p.avatar.hairStyle === 2) {
      ctx.beginPath();
      ctx.arc(px, hy - 10, 4, 0, Math.PI * 2);
      ctx.fill();
    } else if (p.avatar.hairStyle === 3) {
      ctx.fillStyle = p.avatar.skin;
      ctx.beginPath();
      ctx.arc(px, hy - 1, 8.6, Math.PI, Math.PI * 2);
      ctx.fill();
    }
  }
  // eyes
  if (p.dir !== 3) {
    ctx.fillStyle = '#0f172a';
    const ex = p.dir === 1 ? -3 : p.dir === 2 ? 3 : 0;
    ctx.beginPath();
    ctx.arc(px - 3 + ex, hy + 1, 1.3, 0, Math.PI * 2);
    ctx.arc(px + 3 + ex, hy + 1, 1.3, 0, Math.PI * 2);
    ctx.fill();
  }
  // name tag
  ctx.font = '600 11px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const w = ctx.measureText(p.name).width + 14;
  const ty = py - 36 + bob;
  ctx.fillStyle = p.isMe ? 'rgba(37,99,235,0.92)' : theme.dark ? 'rgba(15,23,42,0.82)' : 'rgba(15,23,42,0.78)';
  rr(ctx, px - w / 2, ty - 9, w, 18, 9);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.fillText(p.name, px, ty + 0.5);
}
