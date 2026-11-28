// The AI executives are drawn here, in their own finer style: a grown-up figure with real proportions, a tailored suit with lapels, a shirt and tie,
// creased trousers, polished shoes, shaded skin and hair, small detailed faces, and a soft light under their feet. Everyone else in the office keeps
// the friendly cartoon look. Pure canvas drawing (no images); the figure is about 44 pixels tall, a little more than a tile.
//
// Directions follow the office: 0 facing the viewer, 1 facing left, 2 facing right, 3 facing away (the view of someone typing at a desk).

import type { AvatarStyle } from './types';

type Ctx = CanvasRenderingContext2D;
const T = 36; // the tile size of the office
const SIZE = 1.22; // the executives stand taller than the people in the office

export interface ExecutiveFigure {
  x: number; y: number; dir: 0 | 1 | 2 | 3; moving: boolean; seated?: boolean; typing?: boolean;
  name: string; avatar: AvatarStyle; dot?: string; tagLift?: number; id?: string;
}

// ---- colour helpers --------------------------------------------------------------------------------------------------------------------------
function rgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return [128, 128, 128];
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function mix(a: string, b: string, t: number): string {
  const [r1, g1, b1] = rgb(a), [r2, g2, b2] = rgb(b);
  const f = (x: number, y: number) => Math.round(x + (y - x) * t);
  return `rgb(${f(r1, r2)},${f(g1, g2)},${f(b1, b2)})`;
}
const darker = (c: string, t: number) => mix(c.startsWith('#') ? c : '#808080', '#000000', t);
const lighter = (c: string, t: number) => mix(c.startsWith('#') ? c : '#808080', '#ffffff', t);

function rrect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
function ell(ctx: Ctx, x: number, y: number, rx: number, ry: number, fill: string) {
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
}

// ---- the figure -----------------------------------------------------------------------------------------------------------------------------
const HIP = -17, SHOULDER = -30, NECK = -32, HEAD_Y = -37, HEAD_RY = 5.6, HEAD_RX = 4.7;

interface Look {
  skin: string; skinShade: string; hair: string; hairLight: string; hairStyle: number; outfit: number;
  shirt: string; jacket: number; jacketColor: string; inner: string; tie: number; tieColor: string;
  pants: string; shoes: number; shoeColor: string; glasses: number; extra: number; beard: number; accessory: number;
}
function lookOf(a: AvatarStyle): Look {
  return {
    skin: a.skin, skinShade: darker(a.skin, 0.2), hair: a.hair, hairLight: lighter(a.hair, 0.28), hairStyle: a.hairStyle, outfit: a.outfit,
    shirt: a.shirt, jacket: a.jacket, jacketColor: a.jacketColor, inner: a.inner, tie: a.tie, tieColor: a.tieColor,
    pants: a.pants, shoes: a.shoes, shoeColor: a.shoeColor, glasses: a.glasses, extra: a.extra, beard: a.beard, accessory: a.accessory,
  };
}

/** Whole-body drawing in local coordinates: (0, 0) is the middle of the feet, y grows downwards. */
function body(ctx: Ctx, L: Look, dir: number, step: number, seated: boolean, typing: boolean, t: number) {
  const back = dir === 3;
  const side = dir === 1 || dir === 2;
  const dress = L.outfit === 3 || L.outfit === 4 || L.outfit === 5;
  const suit = L.outfit === 2 && L.jacket > 0;
  const top = suit ? L.jacketColor : L.outfit === 2 ? L.shirt : L.shirt;
  const swing = step * 3.4;
  const lift = seated ? 0 : Math.abs(step) * 0.8;

  // ---- legs and shoes (hidden behind the chair and desk when seated)
  if (!seated) {
    const legsTop = HIP - 1;
    const drawLeg = (cx: number, off: number, front: boolean) => {
      const dx = side ? off * 0.9 : 0;
      const dy = side ? 0 : -Math.max(0, off) * 0.6;
      const w = side ? 5.2 : 4.7;
      const lx = cx + dx - w / 2;
      const grad = ctx.createLinearGradient(lx, 0, lx + w, 0);
      const base = dress ? L.skin : L.pants;
      grad.addColorStop(0, lighter(base, 0.08)); grad.addColorStop(1, darker(base, 0.22));
      ctx.fillStyle = grad;
      rrect(ctx, lx, legsTop, w, -legsTop - 3 + dy, 1.6);
      ctx.fill();
      if (!dress) { ctx.fillStyle = 'rgba(0,0,0,0.16)'; ctx.fillRect(lx + w / 2 - 0.3, legsTop + 3, 0.6, -legsTop - 7 + dy); } // the crease
      // shoe
      const sy = -3.2 + dy;
      const shoeW = side ? 7.4 : 5.4;
      const sx = side ? (dir === 2 ? lx : lx - 2.2) : lx - 0.3;
      const sc = L.shoeColor.startsWith('#') ? L.shoeColor : '#111827';
      const sg = ctx.createLinearGradient(0, sy, 0, sy + 3.4);
      sg.addColorStop(0, lighter(sc, L.shoes === 0 ? 0.0 : 0.22)); sg.addColorStop(1, darker(sc, 0.35));
      ctx.fillStyle = sg;
      rrect(ctx, sx, sy, shoeW, 3.6, 1.5);
      ctx.fill();
      if (L.shoes === 1) { ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.fillRect(sx + 1, sy + 0.6, shoeW * 0.45, 0.7); }
      if (L.shoes === 0) { ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.fillRect(sx, sy + 2.9, shoeW, 0.8); }
      void front;
    };
    if (side) { drawLeg(0, -swing, false); drawLeg(0, swing, true); }
    else { drawLeg(-2.6, step > 0 ? step : 0, true); drawLeg(2.6, step < 0 ? -step : 0, true); }
  }

  // ---- arms behind the body (side view)
  const armW = 4.1;
  const handY = seated ? SHOULDER + 9 : HIP + 2;
  const drawArm = (sx: number, sway: number, front: boolean) => {
    const ax = sx;
    const h = handY - SHOULDER;
    const bend = seated ? (typing ? Math.sin(t / 70 + sx) * 0.9 : 0) : 0;
    const gradient = ctx.createLinearGradient(ax - armW / 2, 0, ax + armW / 2, 0);
    gradient.addColorStop(0, lighter(top, 0.1)); gradient.addColorStop(1, darker(top, 0.25));
    ctx.fillStyle = gradient;
    ctx.save();
    ctx.translate(ax, SHOULDER + 1);
    if (seated) ctx.rotate((sx < 0 ? 1 : -1) * (back ? 0.28 : 0.2));
    rrect(ctx, -armW / 2, 0, armW, h + sway + bend, 1.6);
    ctx.fill();
    // cuff and hand
    const cy = h + sway + bend - 1;
    if (suit) { ctx.fillStyle = L.inner.startsWith('#') ? L.inner : '#f8fafc'; ctx.fillRect(-armW / 2 + 0.3, cy - 1.6, armW - 0.6, 1.2); }
    ell(ctx, 0, cy + 1.9, 1.9, 2.2, L.skin);
    ctx.restore();
    void front;
  };
  if (side) drawArm(dir === 2 ? -1 : 1, -swing * 0.8, false);

  // ---- torso
  const shoulderHalf = side ? 4.3 : 7.8;
  const waistHalf = side ? 4 : 6;
  const torsoBottom = dress ? HIP + 10 : HIP + 1.5;
  const tg = ctx.createLinearGradient(-shoulderHalf, 0, shoulderHalf, 0);
  tg.addColorStop(0, lighter(top, 0.12)); tg.addColorStop(0.55, top); tg.addColorStop(1, darker(top, 0.28));
  ctx.fillStyle = tg;
  ctx.beginPath();
  ctx.moveTo(-shoulderHalf, SHOULDER + 1.5);
  ctx.quadraticCurveTo(-shoulderHalf, SHOULDER - 0.6, -shoulderHalf + 2, SHOULDER - 0.8);
  ctx.lineTo(shoulderHalf - 2, SHOULDER - 0.8);
  ctx.quadraticCurveTo(shoulderHalf, SHOULDER - 0.6, shoulderHalf, SHOULDER + 1.5);
  ctx.lineTo(waistHalf + (dress ? 2.6 : 0), torsoBottom);
  ctx.lineTo(-waistHalf - (dress ? 2.6 : 0), torsoBottom);
  ctx.closePath();
  ctx.fill();
  // a soft highlight down the shoulder, and a hem line
  ctx.fillStyle = 'rgba(255,255,255,0.10)';
  ctx.fillRect(-shoulderHalf + 1.2, SHOULDER, 1.6, 9);
  if (dress) {
    // a skirt that flares a little to the knee
    const sk = ctx.createLinearGradient(-8, 0, 8, 0);
    sk.addColorStop(0, lighter(top, 0.08)); sk.addColorStop(1, darker(top, 0.3));
    ctx.fillStyle = sk;
    ctx.beginPath();
    ctx.moveTo(-waistHalf - 2.6, HIP + 7);
    ctx.lineTo(waistHalf + 2.6, HIP + 7);
    ctx.lineTo(7.4, HIP + 15);
    ctx.lineTo(-7.4, HIP + 15);
    ctx.closePath();
    ctx.fill();
  }

  if (!back && !side) {
    if (suit) {
      // shirt, tie and lapels
      const inner = L.inner.startsWith('#') ? L.inner : '#f8fafc';
      ctx.fillStyle = inner;
      ctx.beginPath(); ctx.moveTo(-2.6, SHOULDER - 0.6); ctx.lineTo(2.6, SHOULDER - 0.6); ctx.lineTo(1.2, SHOULDER + 11); ctx.lineTo(-1.2, SHOULDER + 11); ctx.closePath(); ctx.fill();
      if (L.tie === 1 || L.tie === 2) {
        const tc = L.tieColor.startsWith('#') ? L.tieColor : '#991b1b';
        if (L.tie === 2) { ctx.fillStyle = tc; ctx.fillRect(-2.4, SHOULDER + 0.2, 1.7, 1.8); ctx.fillRect(0.7, SHOULDER + 0.2, 1.7, 1.8); ell(ctx, 0, SHOULDER + 1.1, 0.9, 0.9, darker(tc, 0.25)); }
        else {
          ctx.fillStyle = tc;
          ctx.beginPath(); ctx.moveTo(-0.9, SHOULDER + 0.4); ctx.lineTo(0.9, SHOULDER + 0.4); ctx.lineTo(1.5, SHOULDER + 9.6); ctx.lineTo(0, SHOULDER + 11.2); ctx.lineTo(-1.5, SHOULDER + 9.6); ctx.closePath(); ctx.fill();
          ctx.fillStyle = 'rgba(255,255,255,0.28)'; ctx.fillRect(-0.2, SHOULDER + 2, 0.5, 6);
        }
      }
      if (L.tie === 3) { ctx.fillStyle = L.tieColor.startsWith('#') ? L.tieColor : '#b91c1c'; rrect(ctx, -3.4, SHOULDER - 0.4, 6.8, 2.6, 1.2); ctx.fill(); }
      // the jacket's two fronts with lapels
      ctx.fillStyle = darker(top, 0.12);
      ctx.beginPath(); ctx.moveTo(-3.2, SHOULDER - 0.8); ctx.lineTo(-0.2, SHOULDER + 11.4); ctx.lineTo(-3.6, SHOULDER + 12.8); ctx.lineTo(-6.2, SHOULDER + 2); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(3.2, SHOULDER - 0.8); ctx.lineTo(0.2, SHOULDER + 11.4); ctx.lineTo(3.6, SHOULDER + 12.8); ctx.lineTo(6.2, SHOULDER + 2); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = lighter(top, 0.3); ctx.lineWidth = 0.5;
      ctx.beginPath(); ctx.moveTo(-3.2, SHOULDER - 0.6); ctx.lineTo(-0.1, SHOULDER + 11.2); ctx.moveTo(3.2, SHOULDER - 0.6); ctx.lineTo(0.1, SHOULDER + 11.2); ctx.stroke();
      if (L.jacket === 4) { ctx.fillStyle = darker(top, 0.15); for (const by of [3, 6.2, 9.4]) ell(ctx, 0, SHOULDER + by, 0.6, 0.6, 'rgba(255,255,255,0.6)'); }
      else { ell(ctx, 0.2, SHOULDER + 9.8, 0.55, 0.55, 'rgba(255,255,255,0.55)'); }
      // a pocket square
      ell(ctx, 4.3, SHOULDER + 5.2, 1.0, 0.7, 'rgba(255,255,255,0.75)');
    } else if (L.outfit === 6) {
      // a patterned top
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      for (let i = 0; i < 6; i++) { const px = -4 + (i % 3) * 4; const py = SHOULDER + 3 + Math.floor(i / 3) * 5; ctx.beginPath(); ctx.moveTo(px, py - 1.4); ctx.lineTo(px + 1.4, py); ctx.lineTo(px, py + 1.4); ctx.lineTo(px - 1.4, py); ctx.closePath(); ctx.fill(); }
    } else if (L.outfit === 1) {
      ctx.fillStyle = 'rgba(0,0,0,0.18)'; rrect(ctx, -3.6, SHOULDER + 8, 7.2, 3.2, 1.2); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 0.5; ctx.beginPath(); ctx.moveTo(-1.2, SHOULDER); ctx.lineTo(-1.2, SHOULDER + 5); ctx.moveTo(1.2, SHOULDER); ctx.lineTo(1.2, SHOULDER + 5); ctx.stroke();
    } else if (L.outfit === 4 || L.outfit === 3) {
      ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 0.6; ctx.beginPath(); ctx.moveTo(-2.4, SHOULDER); ctx.quadraticCurveTo(0, SHOULDER + 3.6, 2.4, SHOULDER); ctx.stroke();
      ctx.fillStyle = 'rgba(0,0,0,0.2)'; ctx.fillRect(-5, HIP - 2.6, 10, 1.2); // a belt
    }
    if (L.jacket > 0 && L.outfit !== 2) {
      // a jacket over a casual top
      ctx.fillStyle = L.jacketColor.startsWith('#') ? L.jacketColor : '#1f2937';
      ctx.fillRect(-shoulderHalf, SHOULDER - 0.4, 3.2, 14); ctx.fillRect(shoulderHalf - 3.2, SHOULDER - 0.4, 3.2, 14);
    }
  } else if (back && suit) {
    ctx.strokeStyle = darker(top, 0.25); ctx.lineWidth = 0.6;
    ctx.beginPath(); ctx.moveTo(0, SHOULDER); ctx.lineTo(0, HIP + 1); ctx.stroke();
  }

  // belt and trousers' waist for a suit
  if (suit && !dress) { ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(-waistHalf, torsoBottom - 1, waistHalf * 2, 1); }

  // ---- arms in front
  if (!side) { drawArm(-shoulderHalf - 1.2, -swing * 0.8, true); drawArm(shoulderHalf + 1.2, swing * 0.8, true); }
  else drawArm(dir === 2 ? 1.2 : -1.2, swing * 0.8, true);

  // ---- neck
  ctx.fillStyle = darker(L.skin, 0.12);
  ctx.fillRect(-1.8, NECK - 1.2, 3.6, 3.4);
  void lift;
}

function hair(ctx: Ctx, L: Look, dir: number) {
  const back = dir === 3;
  const side = dir === 1 || dir === 2;
  const cx = 0, cy = HEAD_Y;
  const h = L.hair.startsWith('#') ? L.hair : '#222222';
  const g = ctx.createLinearGradient(cx - 5, cy - 6, cx + 5, cy + 4);
  g.addColorStop(0, lighter(h, 0.2)); g.addColorStop(0.5, h); g.addColorStop(1, darker(h, 0.25));
  ctx.fillStyle = g;
  const cap = (r = 1) => { ctx.beginPath(); ctx.ellipse(cx, cy - 1.3, HEAD_RX + 0.7 * r, HEAD_RY + 0.3, 0, Math.PI, 0); ctx.closePath(); ctx.fill(); };
  switch (L.hairStyle) {
    case 3: break; // none
    case 1: { // long
      ctx.beginPath(); ctx.ellipse(cx, cy - 0.4, HEAD_RX + 1.2, HEAD_RY + 0.8, 0, 0, Math.PI * 2); ctx.fill();
      rrect(ctx, cx - HEAD_RX - 1.4, cy - 1, 2.6, 12, 1.2); ctx.fill(); rrect(ctx, cx + HEAD_RX - 1.2, cy - 1, 2.6, 12, 1.2); ctx.fill();
      break;
    }
    case 8: { // bob
      ctx.beginPath(); ctx.ellipse(cx, cy - 0.3, HEAD_RX + 1.2, HEAD_RY + 0.7, 0, 0, Math.PI * 2); ctx.fill();
      rrect(ctx, cx - HEAD_RX - 1.2, cy - 1, 2.4, 7.4, 1.2); ctx.fill(); rrect(ctx, cx + HEAD_RX - 1.2, cy - 1, 2.4, 7.4, 1.2); ctx.fill();
      break;
    }
    case 2: { cap(1); ell(ctx, cx, cy - HEAD_RY - 1.6, 2.7, 2.4, h); break; } // bun
    case 7: { ctx.beginPath(); ctx.ellipse(cx, cy - 1.2, HEAD_RX + 2.6, HEAD_RY + 2.4, 0, 0, Math.PI * 2); ctx.fill(); break; } // afro
    case 4: { for (let i = -2; i <= 2; i++) ell(ctx, cx + i * 2.1, cy - HEAD_RY + 0.6 + Math.abs(i) * 0.5, 2.2, 2.2, h); cap(1); break; } // curly
    case 5: { cap(1); ctx.beginPath(); ctx.ellipse(cx + 1, cy - HEAD_RY - 0.4, HEAD_RX, 2.4, 0, 0, Math.PI * 2); ctx.fill(); break; } // quiff
    case 6: { cap(1); for (const sx of [-1, 1]) { rrect(ctx, cx + sx * (HEAD_RX - 0.4) - 0.8, cy - 1, 1.6, 11, 0.8); ctx.fill(); } break; } // braids
    case 10: { cap(1); for (let i = -2; i <= 2; i++) { rrect(ctx, cx + i * 2 - 0.7, cy - 2, 1.4, 8 + (2 - Math.abs(i)), 0.7); ctx.fill(); } break; } // locs
    default: { cap(1); } // short
  }
  // a sheen on the hair
  if (L.hairStyle !== 3 && !back) { ctx.strokeStyle = 'rgba(255,255,255,0.22)'; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.arc(cx - 0.6, cy - 1.4, HEAD_RX - 0.4, Math.PI * 1.15, Math.PI * 1.65); ctx.stroke(); }
  void side;
}

function head(ctx: Ctx, L: Look, dir: number, typing: boolean, t: number) {
  const back = dir === 3;
  const side = dir === 1 || dir === 2;
  const fx = dir === 1 ? -1 : 1;
  ctx.save();
  if (side) ctx.scale(fx, 1);
  // hair behind the head (long styles)
  if (L.hairStyle === 1 || L.hairStyle === 8 || L.hairStyle === 7) hair(ctx, L, dir);
  // ears
  if (!back) { ell(ctx, -HEAD_RX - 0.2, HEAD_Y + 0.6, 0.9, 1.5, L.skinShade); ell(ctx, HEAD_RX + 0.2, HEAD_Y + 0.6, 0.9, 1.5, L.skinShade); }
  // the head, lit from the upper left
  const hg = ctx.createRadialGradient(-1.2, HEAD_Y - 1.6, 0.6, 0, HEAD_Y, HEAD_RY + 1.4);
  hg.addColorStop(0, lighter(L.skin, 0.16)); hg.addColorStop(0.7, L.skin); hg.addColorStop(1, L.skinShade);
  ctx.fillStyle = hg;
  ctx.beginPath(); ctx.ellipse(0, HEAD_Y, HEAD_RX, HEAD_RY, 0, 0, Math.PI * 2); ctx.fill();
  if (!back) {
    const eyeY = HEAD_Y - 0.3;
    const look = side ? 1.1 : 0;
    const eyes = side ? [1.9] : [-1.9, 1.9];
    for (const ex of eyes) {
      ell(ctx, ex + look * 0.4, eyeY, 1.05, 0.8, '#ffffff');
      ell(ctx, ex + look * 0.8, eyeY + 0.05, 0.55, 0.62, '#1b1410');
      ctx.fillStyle = '#ffffff'; ctx.fillRect(ex + look * 0.8 - 0.3, eyeY - 0.35, 0.3, 0.3);
      ctx.strokeStyle = darker(L.hair.startsWith('#') ? L.hair : '#222222', 0.1); ctx.lineWidth = 0.55;
      ctx.beginPath(); ctx.moveTo(ex - 1.1 + look * 0.4, eyeY - 1.5); ctx.lineTo(ex + 1.1 + look * 0.4, eyeY - 1.7); ctx.stroke();
    }
    // nose and mouth
    ctx.strokeStyle = 'rgba(0,0,0,0.22)'; ctx.lineWidth = 0.55;
    ctx.beginPath(); ctx.moveTo(side ? 3.6 : 0, HEAD_Y + 0.8); ctx.lineTo(side ? 4.1 : 0.5, HEAD_Y + 2.1); ctx.lineTo(side ? 3.2 : -0.3, HEAD_Y + 2.2); ctx.stroke();
    ctx.strokeStyle = darker(L.skin, 0.45); ctx.lineWidth = 0.7;
    const talk = typing ? 0 : 0;
    ctx.beginPath(); ctx.moveTo(side ? 1.6 : -1.3, HEAD_Y + 3.4 + talk); ctx.quadraticCurveTo(side ? 2.4 : 0, HEAD_Y + 4.1 + talk, side ? 3.2 : 1.3, HEAD_Y + 3.4 + talk); ctx.stroke();
    // beard and moustache
    if (L.beard > 0) {
      const hc = L.hair.startsWith('#') ? L.hair : '#222222';
      ctx.fillStyle = L.beard === 1 ? 'rgba(0,0,0,0.20)' : hc;
      ctx.beginPath(); ctx.ellipse(0, HEAD_Y + 2.4, HEAD_RX - 0.4, HEAD_RY - 1.6, 0, 0.1, Math.PI - 0.1); ctx.fill();
      if (L.beard >= 2) { ctx.fillStyle = hc; ctx.fillRect(-1.8, HEAD_Y + 2.1, 3.6, 0.9); }
    }
    // glasses
    if (L.glasses === 1 || L.accessory === 1) {
      ctx.strokeStyle = '#111827'; ctx.lineWidth = 0.75;
      for (const ex of eyes) { rrect(ctx, ex - 1.6 + look * 0.4, eyeY - 1.3, 3.2, 2.6, 0.9); ctx.stroke(); }
      if (!side) { ctx.beginPath(); ctx.moveTo(-0.3, eyeY); ctx.lineTo(0.3, eyeY); ctx.stroke(); }
    }
    // earrings
    if (L.extra === 2) for (const ex of side ? [-HEAD_RX] : [-HEAD_RX - 0.2, HEAD_RX + 0.2]) ell(ctx, ex, HEAD_Y + 2.4, 0.9, 0.9, '#d6ac50');
  }
  if (L.hairStyle !== 1 && L.hairStyle !== 8 && L.hairStyle !== 7) hair(ctx, L, dir);
  else if (!back) {
    // the fringe of a long style in front
    ctx.fillStyle = L.hair.startsWith('#') ? L.hair : '#222222';
    ctx.beginPath(); ctx.ellipse(0, HEAD_Y - 2.3, HEAD_RX + 0.3, 2.2, 0, Math.PI, 0); ctx.fill();
  }
  // a headset
  if (L.extra === 1) {
    ctx.strokeStyle = '#1f2937'; ctx.lineWidth = 1.1;
    ctx.beginPath(); ctx.arc(0, HEAD_Y - 0.6, HEAD_RX + 0.9, Math.PI * 1.05, Math.PI * 1.95); ctx.stroke();
    ell(ctx, -HEAD_RX - 0.9, HEAD_Y + 0.3, 1.5, 2, '#111827'); ell(ctx, HEAD_RX + 0.9, HEAD_Y + 0.3, 1.5, 2, '#111827');
    if (!back && !side) { ctx.strokeStyle = '#111827'; ctx.lineWidth = 0.7; ctx.beginPath(); ctx.moveTo(-HEAD_RX - 0.7, HEAD_Y + 1.8); ctx.quadraticCurveTo(-3, HEAD_Y + 5, -1, HEAD_Y + 4.6); ctx.stroke(); ell(ctx, -1, HEAD_Y + 4.6, 0.8, 0.6, '#0b1220'); }
  }
  ctx.restore();
  void t;
}

// ---- the whole thing: the light under the feet, the figure, the name tag -------------------------------------------------------------------------
export function drawExecutive(ctx: Ctx, p: ExecutiveFigure, t: number, dark: boolean): void {
  const L = lookOf(p.avatar);
  const px = p.x * T;
  const py = p.y * T;
  const feet = py + 11;
  const phase = p.moving ? t / 135 : 0;
  const step = p.moving && !p.seated ? Math.sin(phase) : 0;
  const bob = p.moving && !p.seated ? -Math.abs(Math.cos(phase)) * 1.1 : p.seated ? 0 : Math.sin(t / 900) * 0.3;
  const seatedDrop = p.seated ? 7 : 0;

  // ground shadow and a soft cool light under the feet (the sci-fi touch)
  if (!p.seated) {
    ell(ctx, px, feet + 1, 8.5, 3.1, 'rgba(8,14,28,0.35)');
    ctx.strokeStyle = `rgba(103,232,249,${0.28 + 0.1 * Math.sin(t / 700)})`;
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.ellipse(px, feet + 1, 11, 4, 0, 0, Math.PI * 2); ctx.stroke();
  } else {
    ell(ctx, px, feet - 1, 7, 2.6, 'rgba(8,14,28,0.22)');
  }

  ctx.save();
  ctx.translate(px, feet + bob + seatedDrop);
  ctx.scale(SIZE, SIZE);
  body(ctx, L, p.dir, step, !!p.seated, !!p.typing, t);
  head(ctx, L, p.dir, !!p.typing, t);
  ctx.restore();

  // name tag: deep glass with a thin cool edge, a status dot (the same look as everyone's)
  ctx.font = '600 9.5px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const dotW = p.dot ? 8 : 0;
  const w = ctx.measureText(p.name).width + 12 + dotW;
  const ty = py - 38 - Math.round(44 * (SIZE - 1)) - 6 - (p.tagLift ?? 0) + (p.seated ? 2 : 0);
  ctx.fillStyle = 'rgba(15,23,42,0.25)';
  rrect(ctx, px - w / 2 + 1, ty - 7, w, 14, 7); ctx.fill();
  ctx.fillStyle = dark ? 'rgba(3,26,38,0.92)' : 'rgba(4,38,53,0.88)';
  rrect(ctx, px - w / 2, ty - 7.5, w, 14, 7); ctx.fill();
  ctx.strokeStyle = 'rgba(0,236,255,0.38)'; ctx.lineWidth = 1;
  rrect(ctx, px - w / 2, ty - 7.5, w, 14, 7); ctx.stroke();
  if (p.dot) ell(ctx, px - w / 2 + 8, ty - 0.3, 2.3, 2.3, p.dot);
  ctx.fillStyle = '#e8fbff';
  ctx.fillText(p.name, px + dotW / 2, ty);
}
