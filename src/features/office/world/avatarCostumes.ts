import type { AvatarStyle } from './types';
import { shade, type Pose } from './avatarParts';

type Ctx = CanvasRenderingContext2D;

function disc(ctx: Ctx, x: number, y: number, r: number, fill: string) { ctx.fillStyle = fill; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); }
function oval(ctx: Ctx, x: number, y: number, rx: number, ry: number, fill: string, rot = 0) { ctx.fillStyle = fill; ctx.beginPath(); ctx.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2); ctx.fill(); }
function box(ctx: Ctx, x: number, y: number, w: number, h: number, r: number, fill: string) {
  ctx.fillStyle = fill; ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); ctx.fill();
}

/** The names, in the order saved on the avatar (0 means none). */
export type CostumeKind = 'none' | 'robot' | 'zombie' | 'ghost' | 'pirate' | 'rat' | 'alien' | 'clown' | 'skeleton' | 'cat' | 'dog' | 'bear' | 'astronaut' | 'ninja' | 'wizard' | 'knight' | 'superhero' | 'devil' | 'angel' | 'pumpkin' | 'banana' | 'duck' | 'cyborg' | 'vampire' | 'mummy' | 'dinosaur' | 'penguin' | 'frog' | 'bunny' | 'fox' | 'unicorn' | 'bee';
export const COSTUME_KINDS: CostumeKind[] = ['none', 'robot', 'zombie', 'ghost', 'pirate', 'rat', 'alien', 'clown', 'skeleton', 'cat', 'dog', 'bear', 'astronaut', 'ninja', 'wizard', 'knight', 'superhero', 'devil', 'angel', 'pumpkin', 'banana', 'duck', 'cyborg', 'vampire', 'mummy', 'dinosaur', 'penguin', 'frog', 'bunny', 'fox', 'unicorn', 'bee'];

const BASE: Partial<AvatarStyle> = { jacket: 0, tie: 0, hat: 0, glasses: 0, extra: 0, beard: 0, accessory: 0 };

/** The plain clothes and colours a costume puts the avatar in (everything else is drawn over the top). */
export function costumeStyle(a: AvatarStyle): AvatarStyle {
  const k = COSTUME_KINDS[a.costume] ?? 'none';
  if (k === 'none') return a;
  const s: Partial<AvatarStyle> = { ...BASE, hairStyle: 3 };
  switch (k) {
    case 'robot': Object.assign(s, { skin: '#b9c4d2', shirt: '#8b97a7', pants: '#64748b', shoes: 2, shoeColor: '#475569', outfit: 0, bottom: 0 }); break;
    case 'zombie': Object.assign(s, { skin: '#8fb573', shirt: '#5b6b4a', pants: '#4b5563', shoes: 2, shoeColor: '#3f3f46', outfit: 0, hairStyle: 4, hair: '#3b3a2a', bottom: 0 }); break;
    case 'ghost': Object.assign(s, { skin: '#f8fafc', shirt: '#f8fafc', pants: '#f8fafc', outfit: 0, shoes: 0, shoeColor: '#f8fafc', bottom: 0 }); break;
    case 'pirate': Object.assign(s, { shirt: '#f8fafc', outfit: 0, jacket: 4, jacketColor: '#7f1d1d', inner: '#f8fafc', pants: '#3f2d1d', shoes: 2, shoeColor: '#2b1d10', beard: 3, hair: '#111827', hairStyle: a.hairStyle === 3 ? 0 : a.hairStyle, bottom: 0 }); break;
    case 'rat': Object.assign(s, { skin: '#a8a29e', shirt: '#78716c', pants: '#57534e', outfit: 0, shoes: 3, shoeColor: '#f9a8d4', bottom: 1 }); break;
    case 'alien': Object.assign(s, { skin: '#86efac', shirt: '#6d28d9', pants: '#4c1d95', outfit: 0, shoes: 2, shoeColor: '#312e81', bottom: 0 }); break;
    case 'clown': Object.assign(s, { skin: '#f8fafc', shirt: '#facc15', pants: '#2563eb', outfit: 0, shoes: 0, shoeColor: '#ef4444', hairStyle: 7, hair: '#ef4444', bottom: 0 }); break;
    case 'skeleton': Object.assign(s, { skin: '#f1f5f9', shirt: '#111827', pants: '#111827', outfit: 0, shoes: 0, shoeColor: '#f1f5f9', bottom: 0 }); break;
    case 'cat': Object.assign(s, { skin: '#f59e0b', shirt: '#f59e0b', pants: '#d97706', outfit: 0, shoes: 5, shoeColor: '#fcd34d', bottom: 1 }); break;
    case 'dog': Object.assign(s, { skin: '#c08a55', shirt: '#a16207', pants: '#854d0e', outfit: 0, shoes: 0, shoeColor: '#f8fafc', bottom: 1 }); break;
    case 'bear': Object.assign(s, { skin: '#8b5a2b', shirt: '#78461f', pants: '#78461f', outfit: 0, shoes: 5, shoeColor: '#8b5a2b', bottom: 1 }); break;
    case 'astronaut': Object.assign(s, { skin: a.skin, shirt: '#e5e7eb', pants: '#e5e7eb', outfit: 0, shoes: 2, shoeColor: '#9ca3af', hairStyle: a.hairStyle, bottom: 0 }); break;
    case 'ninja': Object.assign(s, { skin: a.skin, shirt: '#111827', pants: '#111827', outfit: 0, shoes: 2, shoeColor: '#111827', bottom: 0 }); break;
    case 'wizard': Object.assign(s, { shirt: '#4338ca', outfit: 13, beard: 6, hair: '#f1f5f9', hairStyle: 3, shoes: 5, shoeColor: '#4338ca', bottom: 0 }); break;
    case 'knight': Object.assign(s, { skin: a.skin, shirt: '#9ca3af', pants: '#6b7280', outfit: 0, shoes: 2, shoeColor: '#4b5563', bottom: 0 }); break;
    case 'superhero': Object.assign(s, { shirt: '#2563eb', pants: '#dc2626', outfit: 0, shoes: 2, shoeColor: '#dc2626', hairStyle: a.hairStyle, bottom: 0 }); break;
    case 'devil': Object.assign(s, { skin: '#ef4444', shirt: '#7f1d1d', pants: '#450a0a', outfit: 0, beard: 4, hair: '#111827', shoes: 2, shoeColor: '#111827', bottom: 0 }); break;
    case 'angel': Object.assign(s, { shirt: '#ffffff', outfit: 13, shoes: 3, shoeColor: '#fde68a', hairStyle: a.hairStyle, bottom: 0 }); break;
    case 'pumpkin': Object.assign(s, { skin: '#f97316', shirt: '#166534', pants: '#14532d', outfit: 0, shoes: 2, shoeColor: '#3f3f46', bottom: 0 }); break;
    case 'banana': Object.assign(s, { skin: '#fde047', shirt: '#facc15', pants: '#facc15', outfit: 0, shoes: 0, shoeColor: '#a16207', hairStyle: 3, bottom: 0 }); break;
    case 'cyborg': Object.assign(s, { skin: a.skin, shirt: '#334155', pants: '#1f2937', outfit: 0, shoes: 2, shoeColor: '#475569', hairStyle: a.hairStyle, bottom: 0 }); break;
    case 'vampire': Object.assign(s, { skin: '#e9e2f2', shirt: '#111827', pants: '#111827', outfit: 0, jacket: 1, jacketColor: '#450a0a', inner: '#f8fafc', tie: 2, tieColor: '#b91c1c', shoes: 1, shoeColor: '#111827', hairStyle: 16, hair: '#0f0f0f', bottom: 0 }); break;
    case 'mummy': Object.assign(s, { skin: '#e8d9b5', shirt: '#e8d9b5', pants: '#e8d9b5', outfit: 0, shoes: 0, shoeColor: '#e8d9b5', bottom: 0 }); break;
    case 'dinosaur': Object.assign(s, { skin: '#65a30d', shirt: '#65a30d', pants: '#4d7c0f', outfit: 0, shoes: 3, shoeColor: '#4d7c0f', bottom: 1 }); break;
    case 'penguin': Object.assign(s, { skin: '#1f2937', shirt: '#1f2937', pants: '#1f2937', outfit: 0, shoes: 3, shoeColor: '#fb923c', bottom: 1 }); break;
    case 'frog': Object.assign(s, { skin: '#4ade80', shirt: '#22c55e', pants: '#16a34a', outfit: 0, shoes: 3, shoeColor: '#fb923c', bottom: 1 }); break;
    case 'bunny': Object.assign(s, { skin: '#f8fafc', shirt: '#f1f5f9', pants: '#e2e8f0', outfit: 0, shoes: 3, shoeColor: '#fbcfe8', bottom: 1 }); break;
    case 'fox': Object.assign(s, { skin: '#f97316', shirt: '#ea580c', pants: '#9a3412', outfit: 0, shoes: 2, shoeColor: '#7c2d12', bottom: 1 }); break;
    case 'unicorn': Object.assign(s, { skin: '#fdf2f8', shirt: '#f5d0fe', pants: '#e9d5ff', outfit: 0, shoes: 3, shoeColor: '#fde68a', bottom: 0 }); break;
    case 'bee': Object.assign(s, { skin: '#fde047', shirt: '#facc15', pants: '#111827', outfit: 0, shoes: 2, shoeColor: '#111827', bottom: 0 }); break;
    case 'duck': Object.assign(s, { skin: '#fde047', shirt: '#fde047', pants: '#fde047', outfit: 0, shoes: 3, shoeColor: '#fb923c', bottom: 1 }); break;
  }
  return { ...a, ...s } as AvatarStyle;
}

/** What hangs behind the body: tails, capes, wings, a backpack. */
export function drawCostumeBack(ctx: Ctx, kind: CostumeKind, P: Pose) {
  const { px, py, hy, bob, fx, t, moving, step } = P;
  const sway = Math.sin(t / 260) * (moving ? 3 : 1.4) + step;
  switch (kind) {
    case 'rat': ctx.strokeStyle = '#f9a8d4'; ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(px - fx * 4, py + 4 + bob); ctx.quadraticCurveTo(px - fx * 16, py + 8 + sway, px - fx * 20 + (fx === 0 ? 14 : 0), py - 1 + sway * 1.4 + bob); ctx.stroke(); ctx.lineCap = 'butt'; break;
    case 'cat': ctx.strokeStyle = '#f59e0b'; ctx.lineWidth = 3.4; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(px + (fx === 0 ? 7 : -fx * 5), py + 3 + bob); ctx.quadraticCurveTo(px + (fx === 0 ? 17 : -fx * 17), py + 3 + sway, px + (fx === 0 ? 15 : -fx * 18), py - 12 + sway * 0.6 + bob); ctx.stroke(); ctx.lineCap = 'butt'; break;
    case 'dog': ctx.strokeStyle = '#a16207'; ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(px + (fx === 0 ? 6 : -fx * 5), py + 3 + bob); ctx.quadraticCurveTo(px + (fx === 0 ? 14 : -fx * 14), py - 2 + bob, px + (fx === 0 ? 14 : -fx * 16) + sway * 1.2, py - 9 + bob); ctx.stroke(); ctx.lineCap = 'butt'; break;
    case 'bear': disc(ctx, px - fx * 7 + (fx === 0 ? 0 : 0), py + 4 + bob, 3.4, '#78461f'); break;
    case 'devil': { ctx.strokeStyle = '#b91c1c'; ctx.lineWidth = 1.8; ctx.beginPath(); ctx.moveTo(px - fx * 4, py + 4 + bob); ctx.quadraticCurveTo(px - fx * 13, py + 11 + sway, px - fx * 17 + (fx === 0 ? 13 : 0), py + 2 + sway + bob); ctx.stroke(); ctx.fillStyle = '#b91c1c'; ctx.beginPath(); const tx = px - fx * 17 + (fx === 0 ? 13 : 0), ty = py + 2 + sway + bob; ctx.moveTo(tx, ty - 3); ctx.lineTo(tx + 3.6, ty + 1); ctx.lineTo(tx - 0.6, ty + 3); ctx.closePath(); ctx.fill(); break; }
    case 'vampire': { ctx.fillStyle = '#450a0a'; ctx.beginPath(); ctx.moveTo(px - 9, py - 10 + bob); ctx.lineTo(px + 9, py - 10 + bob); ctx.lineTo(px + 15 + sway * 1.4, py + 9 + bob); ctx.lineTo(px - 15 + sway * 1.4, py + 9 + bob); ctx.closePath(); ctx.fill(); ctx.fillStyle = '#7f1d1d'; ctx.beginPath(); ctx.moveTo(px - 9, py - 10 + bob); ctx.lineTo(px - 12, hy + 1); ctx.lineTo(px - 5, py - 10 + bob); ctx.closePath(); ctx.fill(); ctx.beginPath(); ctx.moveTo(px + 9, py - 10 + bob); ctx.lineTo(px + 12, hy + 1); ctx.lineTo(px + 5, py - 10 + bob); ctx.closePath(); ctx.fill(); break; }
    case 'dinosaur': { ctx.strokeStyle = '#4d7c0f'; ctx.lineWidth = 4.4; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(px - fx * 4 + (fx === 0 ? 5 : 0), py + 4 + bob); ctx.quadraticCurveTo(px - fx * 14 + (fx === 0 ? 14 : 0), py + 8 + sway, px - fx * 19 + (fx === 0 ? 17 : 0), py + 1 + sway * 1.3 + bob); ctx.stroke(); ctx.lineCap = 'butt'; ctx.fillStyle = '#a3e635'; for (let k = 0; k < 3; k++) { ctx.beginPath(); ctx.moveTo(px - 3 + k * 3, hy - 8); ctx.lineTo(px - 1.5 + k * 3, hy - 13); ctx.lineTo(px + k * 3, hy - 8); ctx.closePath(); ctx.fill(); } break; }
    case 'duck': oval(ctx, px - fx * 7 + (fx === 0 ? 0 : 0), py + 1 + bob, 4, 2.6, '#facc15', -0.4); break;
    case 'superhero': { ctx.fillStyle = '#dc2626'; ctx.beginPath(); ctx.moveTo(px - 8, py - 10 + bob); ctx.lineTo(px + 8, py - 10 + bob); ctx.lineTo(px + 14 + sway * 1.6, py + 9 + bob); ctx.lineTo(px - 14 + sway * 1.6, py + 9 + bob); ctx.closePath(); ctx.fill(); ctx.fillStyle = 'rgba(0,0,0,0.18)'; ctx.fillRect(px - 8, py - 10 + bob, 16, 2); break; }
    case 'angel': for (const s of [-1, 1]) { ctx.fillStyle = '#f8fafc'; ctx.beginPath(); ctx.moveTo(px + s * 5, py - 9 + bob); ctx.quadraticCurveTo(px + s * 24 + sway, py - 22 + bob, px + s * 21, py - 2 + bob); ctx.quadraticCurveTo(px + s * 14, py + 1 + bob, px + s * 8, py + 1 + bob); ctx.closePath(); ctx.fill(); ctx.strokeStyle = '#cbd5e1'; ctx.lineWidth = 0.8; for (const k of [0.3, 0.55, 0.8]) { ctx.beginPath(); ctx.moveTo(px + s * 6, py - 7 + bob); ctx.lineTo(px + s * (8 + 14 * k + sway * 0.4), py - 14 + 14 * k + bob); ctx.stroke(); } } break;
    case 'astronaut': box(ctx, px - 8, py - 12 + bob, 16, 15, 3, '#cbd5e1'); box(ctx, px - 6, py - 10 + bob, 12, 3, 1, '#94a3b8'); break;
    case 'ninja': ctx.fillStyle = '#dc2626'; ctx.beginPath(); ctx.moveTo(px - fx * 8, hy - 3); ctx.lineTo(px - fx * 17 - sway, hy + 2); ctx.lineTo(px - fx * 15 - sway, hy + 5); ctx.lineTo(px - fx * 8, hy - 0.4); ctx.closePath(); ctx.fill(); if (fx === 0) { ctx.beginPath(); ctx.moveTo(px + 7, hy - 3); ctx.lineTo(px + 16 + sway, hy + 3); ctx.lineTo(px + 14 + sway, hy + 6); ctx.lineTo(px + 7, hy - 0.4); ctx.closePath(); ctx.fill(); } break;
    case 'knight': ctx.fillStyle = '#dc2626'; ctx.beginPath(); ctx.moveTo(px - 3, hy - 9); ctx.quadraticCurveTo(px - fx * 12 - 4 - sway, hy - 14, px - fx * 11 - 6 - sway, hy - 3); ctx.lineTo(px - fx * 6, hy - 6); ctx.closePath(); ctx.fill(); break;
    case 'bunny': disc(ctx, px - fx * 7, py + 4 + bob, 3.4, '#ffffff'); disc(ctx, px - fx * 7.4, py + 3.6 + bob, 1.6, '#e2e8f0'); break;
    case 'fox': { ctx.lineCap = 'round'; ctx.strokeStyle = '#ea580c'; ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(px + (fx === 0 ? 6 : -fx * 5), py + 4 + bob); ctx.quadraticCurveTo(px + (fx === 0 ? 16 : -fx * 16), py + 6 + sway, px + (fx === 0 ? 16 : -fx * 19), py - 6 + sway * 0.7 + bob); ctx.stroke(); disc(ctx, px + (fx === 0 ? 16 : -fx * 19), py - 6 + sway * 0.7 + bob, 3.2, '#fff7ed'); ctx.lineCap = 'butt'; break; }
    case 'unicorn': { const rb = ['#ef4444', '#f59e0b', '#facc15', '#22c55e', '#38bdf8', '#a855f7']; ctx.lineCap = 'round'; ctx.lineWidth = 1.6; rb.forEach((c, k) => { ctx.strokeStyle = c; ctx.beginPath(); ctx.moveTo(px + (fx === 0 ? 6 : -fx * 5), py + 3 + bob + k * 0.9 - 2); ctx.quadraticCurveTo(px + (fx === 0 ? 14 : -fx * 14), py + 8 + sway + k, px + (fx === 0 ? 15 : -fx * 17), py + 1 + sway * 1.2 + bob + k * 0.9); ctx.stroke(); }); ctx.lineCap = 'butt'; break; }
    case 'bee': { const flap = Math.sin(t / 55) * 0.35; for (const sd of [-1, 1]) { ctx.fillStyle = 'rgba(224,242,254,0.8)'; ctx.beginPath(); ctx.ellipse(px + sd * 7, py - 13 + bob, 3.8, 8.6, sd * (0.5 + flap), 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = 'rgba(148,163,184,0.7)'; ctx.lineWidth = 0.7; ctx.stroke(); } break; }
    default: break;
  }
}

/** What goes over the avatar: masks, ears, helmets, faces, hats. */
export function drawCostumeFront(ctx: Ctx, kind: CostumeKind, a: AvatarStyle, P: Pose) {
  const { px, py, hy, bob, back, side, fx, t, ex } = P;
  const eyeY = hy + 1;
  const eyes = side ? [px + ex + fx * 1.5] : [px - 3.2 + ex, px + 3.2 + ex];
  switch (kind) {
    case 'robot': {
      ctx.fillStyle = '#9aa7b8'; ctx.beginPath(); ctx.roundRect(px - 9, hy - 9, 18, 18, 3.4); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillRect(px - 7.6, hy - 8, 3, 15);
      ctx.strokeStyle = '#64748b'; ctx.lineWidth = 1; ctx.beginPath(); ctx.roundRect(px - 9, hy - 9, 18, 18, 3.4); ctx.stroke();
      disc(ctx, px - 6.8, hy - 6.4, 0.9, '#64748b'); disc(ctx, px + 6.8, hy - 6.4, 0.9, '#64748b');
      // antenna that blinks
      ctx.strokeStyle = '#64748b'; ctx.lineWidth = 1.3; ctx.beginPath(); ctx.moveTo(px, hy - 9); ctx.lineTo(px, hy - 14); ctx.stroke();
      disc(ctx, px, hy - 15, 2, Math.floor(t / 450) % 2 ? '#ef4444' : '#7f1d1d');
      if (!back) {
        ctx.fillStyle = '#0f172a'; ctx.beginPath(); ctx.roundRect(px - 7.4, hy - 3.2, 14.8, 5.6, 2); ctx.fill();
        for (const e of eyes) { oval(ctx, e, eyeY - 0.4, 2, 1.7, '#22d3ee'); disc(ctx, e + 0.3, eyeY - 0.9, 0.6, '#ecfeff'); }
        ctx.fillStyle = '#475569'; ctx.fillRect(px - 4.6, hy + 4.4, 9.2, 3); ctx.fillStyle = '#94a3b8'; for (let k = 0; k < 4; k++) ctx.fillRect(px - 4 + k * 2.4, hy + 4.8, 1.2, 2.2);
      }
      // a light panel on the chest
      if (!back) { box(ctx, px - 4.6, py - 8.4 + bob, 9.2, 6, 1.4, '#334155'); for (let k = 0; k < 3; k++) disc(ctx, px - 2.6 + k * 2.6, py - 5.4 + bob, 1, ['#22c55e', '#facc15', '#ef4444'][(k + Math.floor(t / 500)) % 3]); }
      break;
    }
    case 'zombie': {
      if (!back) {
        ctx.strokeStyle = '#3f6212'; ctx.lineWidth = 0.9; ctx.beginPath(); ctx.moveTo(px - 5, hy - 6.4); ctx.lineTo(px + 1, hy - 4.6); ctx.stroke();
        for (let k = 0; k < 3; k++) { ctx.beginPath(); ctx.moveTo(px - 4 + k * 2, hy - 7.4); ctx.lineTo(px - 3.2 + k * 2, hy - 3.8); ctx.stroke(); }
        const e = eyes[eyes.length - 1];
        disc(ctx, e, eyeY, 3.1, '#f8fafc'); disc(ctx, e + fx * 0.5, eyeY + 0.2, 1.3, '#dc2626'); disc(ctx, e + fx * 0.5, eyeY + 0.2, 0.5, '#111827');
        ctx.strokeStyle = '#3f6212'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(px - 3 + ex, hy + 5.6); ctx.lineTo(px + 3 + ex, hy + 5.2); ctx.stroke();
        ctx.fillStyle = '#f8fafc'; for (let k = 0; k < 3; k++) ctx.fillRect(px - 1.6 + k * 1.6 + ex, hy + 5.1, 0.9, 1.6);
      }
      ctx.strokeStyle = '#3f6212'; ctx.lineWidth = 0.9; ctx.beginPath(); ctx.moveTo(px - 8, py + 2 + bob); for (let k = 0; k < 6; k++) ctx.lineTo(px - 8 + k * 3.2 + 1.6, py + 2 + bob + (k % 2 ? 2.2 : 0)); ctx.stroke();
      break;
    }
    case 'ghost': {
      const w = Math.sin(t / 300);
      const g = ctx.createLinearGradient(0, hy - 11, 0, py + 11);
      g.addColorStop(0, 'rgba(255,255,255,0.96)'); g.addColorStop(1, 'rgba(186,230,253,0.86)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(px, hy - 1, 11.4, Math.PI, Math.PI * 2);
      ctx.lineTo(px + 13.4, py + 8 + bob);
      for (let k = 0; k < 5; k++) { const x0 = px + 13.4 - k * 5.36; ctx.quadraticCurveTo(x0 - 1.34, py + 14 + bob + (k % 2 ? w * 1.6 : -w * 1.6), x0 - 2.68, py + 8 + bob); ctx.quadraticCurveTo(x0 - 4, py + 4 + bob, x0 - 5.36, py + 8 + bob); }
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(148,163,184,0.5)'; ctx.lineWidth = 0.8; ctx.stroke();
      if (!back) { for (const e of eyes) oval(ctx, e, eyeY + 0.4, 1.9, 2.8, '#0f172a'); oval(ctx, px + ex, hy + 6.4, 1.8, 2.4, '#0f172a'); }
      break;
    }
    case 'pirate': {
      // a black tricorn with a little skull, and an eye patch
      ctx.fillStyle = '#111827'; ctx.beginPath(); ctx.moveTo(px - 13, hy - 3); ctx.quadraticCurveTo(px - 8, hy - 15, px, hy - 11); ctx.quadraticCurveTo(px + 8, hy - 15, px + 13, hy - 3); ctx.quadraticCurveTo(px, hy - 1, px - 13, hy - 3); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#d6ac50'; ctx.lineWidth = 0.9; ctx.beginPath(); ctx.moveTo(px - 12.4, hy - 3.2); ctx.quadraticCurveTo(px, hy - 1, px + 12.4, hy - 3.2); ctx.stroke();
      if (!back) { disc(ctx, px, hy - 7, 1.8, '#f8fafc'); ctx.fillStyle = '#111827'; ctx.fillRect(px - 1, hy - 7.4, 0.8, 0.8); ctx.fillRect(px + 0.4, hy - 7.4, 0.8, 0.8); ctx.strokeStyle = '#111827'; ctx.lineWidth = 0.9; ctx.beginPath(); ctx.moveTo(px - 9, hy - 3.6); ctx.lineTo(eyes[0] + 2.8, hy + 3); ctx.stroke(); oval(ctx, eyes[0], hy + 1, 3.3, 3.2, '#111827', 0.2); }
      // red and white stripes across the shirt
      if (!back) { ctx.save(); ctx.beginPath(); ctx.roundRect(px - 9, py - 11 + bob, 18, 15, 6); ctx.clip(); ctx.fillStyle = 'rgba(220,38,38,0.85)'; for (let k = 0; k < 4; k++) ctx.fillRect(px - 10, py - 9 + bob + k * 4, 20, 1.8); ctx.restore(); }
      // a hook
      disc(ctx, px + 10.5, py + 1 + bob, 1.4, '#cbd5e1'); ctx.strokeStyle = '#cbd5e1'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(px + 10.5, py + 4 + bob, 2, -1.2, 2.4); ctx.stroke();
      break;
    }
    case 'rat': {
      for (const s of [-1, 1]) { disc(ctx, px + s * 8.2, hy - 7.4, 4.6, '#a8a29e'); disc(ctx, px + s * 8.2, hy - 7.4, 2.8, '#f9a8d4'); }
      if (!back) {
        oval(ctx, px + ex, hy + 4.6, 3.6, 2.8, '#d6d3d1'); disc(ctx, px + ex, hy + 3.6, 1.5, '#f472b6');
        ctx.fillStyle = '#f8fafc'; ctx.fillRect(px + ex - 1.5, hy + 5.8, 1.4, 2.2); ctx.fillRect(px + ex + 0.1, hy + 5.8, 1.4, 2.2);
        ctx.strokeStyle = 'rgba(15,23,42,0.5)'; ctx.lineWidth = 0.6; for (const s of side ? [fx] : [-1, 1]) for (const k of [-1.2, 0.8]) { ctx.beginPath(); ctx.moveTo(px + ex + s * 3, hy + 4.4 + k); ctx.lineTo(px + ex + s * 9, hy + 3.4 + k * 2); ctx.stroke(); }
      }
      break;
    }
    case 'alien': {
      ctx.strokeStyle = '#4ade80'; ctx.lineWidth = 1.3; for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(px + s * 4, hy - 8.4); ctx.quadraticCurveTo(px + s * 9 + Math.sin(t / 400) * s, hy - 14, px + s * 8, hy - 17); ctx.stroke(); disc(ctx, px + s * 8, hy - 17.4, 1.9, '#a3e635'); }
      if (!back) { for (const e of eyes) { oval(ctx, e, eyeY + 0.2, 3.2, 4, '#0f172a', e < px ? 0.4 : -0.4); disc(ctx, e - 0.8, eyeY - 1, 0.9, '#e2e8f0'); } oval(ctx, px + ex, hy + 6.6, 1.6, 0.7, '#166534'); }
      break;
    }
    case 'clown': {
      const cols = ['#ef4444', '#facc15', '#22c55e', '#3b82f6', '#a855f7'];
      for (let k = 0; k < 9; k++) { const an = Math.PI * (1.02 + k * 0.12); disc(ctx, px + Math.cos(an) * 10.4, hy - 1 + Math.sin(an) * 10, 3.6, cols[k % cols.length]); }
      if (!back) { disc(ctx, px + ex, hy + 3.6, 3, '#ef4444'); disc(ctx, px + ex - 0.8, hy + 2.8, 0.9, '#fecaca'); ctx.strokeStyle = '#ef4444'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.arc(px + ex, hy + 4.4, 5.4, 0.2 * Math.PI, 0.8 * Math.PI); ctx.stroke(); for (const e of eyes) { ctx.fillStyle = '#3b82f6'; ctx.beginPath(); for (let k = 0; k < 10; k++) { const r = k % 2 ? 1 : 2.4; const an = -Math.PI / 2 + (k * Math.PI) / 5; ctx.lineTo(e + Math.cos(an) * r, eyeY - 4 + Math.sin(an) * r); } ctx.closePath(); ctx.fill(); } }
      for (const s of [-1, 1]) disc(ctx, px + s * 4.4, py - 10.6 + bob, 3.2, s < 0 ? '#ef4444' : '#3b82f6');
      break;
    }
    case 'skeleton': {
      if (!back) {
        for (const e of eyes) oval(ctx, e, eyeY + 0.2, 2.6, 3, '#0f172a');
        ctx.fillStyle = '#0f172a'; ctx.beginPath(); ctx.moveTo(px + ex - 1.4, hy + 4.4); ctx.lineTo(px + ex + 1.4, hy + 4.4); ctx.lineTo(px + ex, hy + 2.8); ctx.closePath(); ctx.fill();
        ctx.fillRect(px + ex - 4, hy + 6.4, 8, 1.6); ctx.fillStyle = '#f1f5f9'; for (let k = 0; k < 4; k++) ctx.fillRect(px + ex - 3.6 + k * 2, hy + 6.4, 0.8, 1.6);
        ctx.strokeStyle = '#f1f5f9'; ctx.lineWidth = 1.2; for (let k = 0; k < 4; k++) { ctx.beginPath(); ctx.moveTo(px - 5, py - 9 + bob + k * 2.8); ctx.lineTo(px + 5, py - 9 + bob + k * 2.8); ctx.stroke(); } ctx.beginPath(); ctx.moveTo(px, py - 10 + bob); ctx.lineTo(px, py + 2 + bob); ctx.stroke();
      }
      break;
    }
    case 'cat': {
      for (const s of [-1, 1]) { ctx.fillStyle = '#f59e0b'; ctx.beginPath(); ctx.moveTo(px + s * 9, hy - 3); ctx.lineTo(px + s * 8, hy - 13); ctx.lineTo(px + s * 2.6, hy - 8); ctx.closePath(); ctx.fill(); ctx.fillStyle = '#fbcfe8'; ctx.beginPath(); ctx.moveTo(px + s * 7.6, hy - 5); ctx.lineTo(px + s * 7.4, hy - 10.6); ctx.lineTo(px + s * 4.4, hy - 7.4); ctx.closePath(); ctx.fill(); }
      if (!back) { ctx.fillStyle = '#ec4899'; ctx.beginPath(); ctx.moveTo(px + ex - 1.4, hy + 3); ctx.lineTo(px + ex + 1.4, hy + 3); ctx.lineTo(px + ex, hy + 4.4); ctx.closePath(); ctx.fill(); ctx.strokeStyle = 'rgba(15,23,42,0.55)'; ctx.lineWidth = 0.6; for (const s of side ? [fx] : [-1, 1]) for (const k of [-1, 1.2]) { ctx.beginPath(); ctx.moveTo(px + ex + s * 3, hy + 4 + k * 0.6); ctx.lineTo(px + ex + s * 9, hy + 4 + k * 2); ctx.stroke(); } ctx.strokeStyle = '#b45309'; ctx.lineWidth = 1; for (const s of [-1, 1]) for (let k = 0; k < 2; k++) { ctx.beginPath(); ctx.moveTo(px + s * 8.4, hy - 3 + k * 2); ctx.lineTo(px + s * 5.8, hy - 3 + k * 2); ctx.stroke(); } }
      break;
    }
    case 'dog': {
      for (const s of [-1, 1]) { ctx.fillStyle = '#6b4423'; ctx.beginPath(); ctx.ellipse(px + s * 9.4, hy + 1, 3.6, 7.4, s * 0.16, 0, Math.PI * 2); ctx.fill(); }
      if (!back) { oval(ctx, px + ex, hy + 5, 4.4, 3.2, '#e8cfa6'); oval(ctx, px + ex, hy + 3.4, 2.2, 1.6, '#111827'); oval(ctx, px + ex + 0.8, hy + 8, 1.5, 2.6 + Math.sin(t / 200) * 0.4, '#f472b6'); }
      break;
    }
    case 'bear': {
      for (const s of [-1, 1]) { disc(ctx, px + s * 7.6, hy - 8, 3.8, '#78461f'); disc(ctx, px + s * 7.6, hy - 8, 2, '#d6a77a'); }
      if (!back) { oval(ctx, px + ex, hy + 4.6, 4.2, 3.4, '#e8cfa6'); oval(ctx, px + ex, hy + 3, 2, 1.5, '#111827'); }
      break;
    }
    case 'astronaut': {
      ctx.fillStyle = 'rgba(186,230,253,0.22)'; ctx.beginPath(); ctx.arc(px, hy, 11.6, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#e5e7eb'; ctx.lineWidth = 2.6; ctx.beginPath(); ctx.arc(px, hy, 11.6, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.arc(px, hy, 9, Math.PI * 1.15, Math.PI * 1.45); ctx.stroke();
      if (!back) { box(ctx, px - 4.4, py - 9 + bob, 8.8, 5, 1.2, '#94a3b8'); disc(ctx, px - 2, py - 6.5 + bob, 1, '#ef4444'); disc(ctx, px + 2, py - 6.5 + bob, 1, '#22c55e'); ctx.fillStyle = '#2563eb'; ctx.fillRect(px + 5.4, py - 9.4 + bob, 3.2, 2.2); }
      break;
    }
    case 'ninja': {
      ctx.fillStyle = '#111827'; ctx.beginPath(); ctx.arc(px, hy - 1, 9, Math.PI, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.moveTo(px - 8.8, hy - 1); ctx.lineTo(px + 8.8, hy - 1); ctx.quadraticCurveTo(px + 8.8, hy + 8.8, px, hy + 9); ctx.quadraticCurveTo(px - 8.8, hy + 8.8, px - 8.8, hy - 1); ctx.fill();
      if (!back) { ctx.fillStyle = a.skin; ctx.fillRect(px - 8.4, hy - 3.4, 16.8, 5.6); for (const e of eyes) { disc(ctx, e, eyeY - 0.2, 1.7, '#f8fafc'); disc(ctx, e + fx * 0.4, eyeY - 0.1, 1, '#0f172a'); } ctx.strokeStyle = '#0f172a'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(eyes[0] - 3, eyeY - 3.2); ctx.lineTo(eyes[0] + 2.4, eyeY - 2.2); if (eyes[1]) { ctx.moveTo(eyes[1] - 2.4, eyeY - 2.2); ctx.lineTo(eyes[1] + 3, eyeY - 3.2); } ctx.stroke(); }
      ctx.fillStyle = '#dc2626'; ctx.fillRect(px - 9.2, hy - 5.4, 18.4, 2.6);
      break;
    }
    case 'wizard': {
      ctx.fillStyle = '#4338ca'; ctx.beginPath(); ctx.moveTo(px - 12, hy - 3); ctx.lineTo(px + 1.4, hy - 22); ctx.quadraticCurveTo(px + 5, hy - 13, px + 12, hy - 3); ctx.quadraticCurveTo(px, hy - 0.6, px - 12, hy - 3); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#facc15'; ctx.beginPath(); ctx.arc(px - 2, hy - 9, 1.4, 0, Math.PI * 2); ctx.fill(); disc(ctx, px + 3, hy - 13, 1, '#facc15'); disc(ctx, px + 5, hy - 6.4, 0.9, '#facc15');
      ctx.fillStyle = '#6366f1'; ctx.fillRect(px - 11.4, hy - 4.4, 22.8, 1.6);
      break;
    }
    case 'knight': {
      ctx.fillStyle = '#9ca3af'; ctx.beginPath(); ctx.arc(px, hy - 0.4, 9.8, Math.PI, Math.PI * 2); ctx.lineTo(px + 9.8, hy + 6); ctx.quadraticCurveTo(px, hy + 11, px - 9.8, hy + 6); ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.4)'; ctx.fillRect(px - 7, hy - 8, 2.6, 13);
      if (!back) { ctx.fillStyle = '#1f2937'; ctx.fillRect(px - 7.6 + ex * 0.4, hy - 1.4, 15.2, 2.4); ctx.fillRect(px - 0.7 + ex * 0.4, hy + 1, 1.4, 6); ctx.strokeStyle = '#6b7280'; ctx.lineWidth = 0.8; for (let k = 0; k < 3; k++) { ctx.beginPath(); ctx.moveTo(px - 5 + k * 3.6, hy + 3); ctx.lineTo(px - 5 + k * 3.6, hy + 7); ctx.stroke(); } box(ctx, px - 5, py - 9 + bob, 10, 8, 2, 'rgba(229,231,235,0.55)'); }
      ctx.fillStyle = '#dc2626'; ctx.beginPath(); ctx.ellipse(px, hy - 11, 2.4, 4.4, 0, 0, Math.PI * 2); ctx.fill();
      break;
    }
    case 'superhero': {
      if (!back) { ctx.fillStyle = '#dc2626'; ctx.beginPath(); ctx.moveTo(px - 9, eyeY - 3.4); ctx.lineTo(px + 9, eyeY - 3.4); ctx.lineTo(px + 8, eyeY + 2.8); ctx.quadraticCurveTo(px, eyeY + 1.4, px - 8, eyeY + 2.8); ctx.closePath(); ctx.fill(); for (const e of eyes) oval(ctx, e, eyeY - 0.4, 2, 1.4, '#f8fafc'); ctx.fillStyle = '#facc15'; ctx.beginPath(); ctx.moveTo(px, py - 9 + bob); ctx.lineTo(px + 5, py - 8 + bob); ctx.lineTo(px + 3.6, py - 2 + bob); ctx.lineTo(px, py + 0.4 + bob); ctx.lineTo(px - 3.6, py - 2 + bob); ctx.lineTo(px - 5, py - 8 + bob); ctx.closePath(); ctx.fill(); ctx.fillStyle = '#dc2626'; ctx.font = '700 6px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('K', px, py - 4.4 + bob); }
      ctx.fillStyle = '#facc15'; ctx.fillRect(px - 9, py + 0.6 + bob, 18, 2);
      break;
    }
    case 'devil': {
      for (const s of [-1, 1]) { ctx.fillStyle = '#7f1d1d'; ctx.beginPath(); ctx.moveTo(px + s * 7.4, hy - 6); ctx.quadraticCurveTo(px + s * 11, hy - 11, px + s * 7.6, hy - 15); ctx.quadraticCurveTo(px + s * 5.4, hy - 10, px + s * 3.6, hy - 8); ctx.closePath(); ctx.fill(); }
      if (!back) { ctx.strokeStyle = '#450a0a'; ctx.lineWidth = 1.2; for (const e of eyes) { ctx.beginPath(); ctx.moveTo(e - 2.6, eyeY - 3.6); ctx.lineTo(e + 2.6, eyeY - 2.2 * (e < px ? 1 : -1) - 1.4); ctx.stroke(); } ctx.strokeStyle = '#fecaca'; ctx.lineWidth = 0.9; ctx.beginPath(); ctx.arc(px + ex * 0.8, hy + 3.8, 2.6, 0.1 * Math.PI, 0.9 * Math.PI); ctx.stroke(); }
      break;
    }
    case 'angel': {
      const bobH = Math.sin(t / 420) * 1.2;
      ctx.strokeStyle = '#facc15'; ctx.lineWidth = 2.2; ctx.beginPath(); ctx.ellipse(px, hy - 13 + bobH, 6.6, 2.2, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = 'rgba(254,240,138,0.5)'; ctx.lineWidth = 4; ctx.beginPath(); ctx.ellipse(px, hy - 13 + bobH, 6.6, 2.2, 0, 0, Math.PI * 2); ctx.stroke();
      break;
    }
    case 'pumpkin': {
      const g = ctx.createRadialGradient(px - 3, hy - 4, 1, px, hy, 13); g.addColorStop(0, '#fb923c'); g.addColorStop(1, '#c2410c');
      ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(px, hy, 12.6, 11, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(124,45,18,0.55)'; ctx.lineWidth = 1; for (const k of [-8, -4, 0, 4, 8]) { ctx.beginPath(); ctx.moveTo(px + k * 0.6, hy - 10.4); ctx.quadraticCurveTo(px + k * 1.5, hy, px + k * 0.6, hy + 10.4); ctx.stroke(); }
      ctx.fillStyle = '#166534'; ctx.fillRect(px - 1.4, hy - 14, 2.8, 4.6); ctx.beginPath(); ctx.ellipse(px + 4, hy - 10.4, 3.6, 1.6, 0.5, 0, Math.PI * 2); ctx.fill();
      if (!back) {
        const f = 0.8 + Math.sin(t / 130) * 0.15;
        ctx.fillStyle = `rgba(254,240,138,${f})`;
        for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(px + s * 4.8, hy - 4); ctx.lineTo(px + s * 7.4, hy + 1); ctx.lineTo(px + s * 2.2, hy + 1); ctx.closePath(); ctx.fill(); }
        ctx.beginPath(); ctx.moveTo(px - 6.4, hy + 3.6); ctx.lineTo(px - 4, hy + 6); ctx.lineTo(px - 2, hy + 4); ctx.lineTo(px, hy + 6.4); ctx.lineTo(px + 2, hy + 4); ctx.lineTo(px + 4, hy + 6); ctx.lineTo(px + 6.4, hy + 3.6); ctx.lineTo(px + 4.4, hy + 8.2); ctx.lineTo(px - 4.4, hy + 8.2); ctx.closePath(); ctx.fill();
      }
      break;
    }
    case 'banana': {
      ctx.fillStyle = '#92400e'; ctx.fillRect(px - 1.6, hy - 14, 3.2, 5); ctx.fillStyle = '#facc15';
      for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(px + s * 2, hy - 9.6); ctx.quadraticCurveTo(px + s * 14, hy - 8, px + s * 12, hy + 6); ctx.quadraticCurveTo(px + s * 9.4, hy - 2, px + s * 4, hy - 7); ctx.closePath(); ctx.fill(); }
      ctx.strokeStyle = '#ca8a04'; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(px - 11, py - 8 + bob); ctx.quadraticCurveTo(px - 13, py + 2 + bob, px - 8, py + 8 + bob); ctx.stroke();
      break;
    }
    case 'duck': {
      if (!back) { ctx.fillStyle = '#fb923c'; ctx.beginPath(); ctx.ellipse(px + ex, hy + 4.4, side ? 4.4 : 5.2, 2.4, 0, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#ea580c'; ctx.fillRect(px + ex - 4, hy + 4.2, 8, 0.7); }
      for (let k = 0; k < 3; k++) oval(ctx, px - 2 + k * 2, hy - 10.6 - (k === 1 ? 1.6 : 0), 1.2, 2.4, '#fde047', (k - 1) * 0.3);
      break;
    }
    case 'cyborg': {
      ctx.fillStyle = '#94a3b8'; ctx.beginPath(); ctx.arc(px, hy, 8.8, -Math.PI / 2, Math.PI / 2); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#475569'; ctx.lineWidth = 0.9; ctx.beginPath(); ctx.moveTo(px, hy - 8.6); ctx.lineTo(px, hy + 8.6); ctx.stroke(); ctx.beginPath(); ctx.moveTo(px + 1, hy + 5); ctx.lineTo(px + 7, hy + 5); ctx.stroke();
      if (!back) { const e = eyes[eyes.length - 1]; disc(ctx, e, eyeY, 2.8, '#0f172a'); disc(ctx, e, eyeY, 1.6, '#ef4444'); disc(ctx, e - 0.5, eyeY - 0.6, 0.5, '#fecaca'); }
      box(ctx, px + 4.8, py - 9 + bob, 7.4, 13, 2.4, '#94a3b8'); ctx.strokeStyle = '#475569'; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(px + 4.8, py - 4 + bob); ctx.lineTo(px + 12.2, py - 4 + bob); ctx.stroke(); disc(ctx, px + 8.5, py - 6.4 + bob, 0.9, '#22d3ee');
      break;
    }
    case 'vampire': {
      if (!back) { for (const e of eyes) disc(ctx, e, eyeY + 0.2, 0.9, '#dc2626'); ctx.fillStyle = '#f8fafc'; for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(px + ex + s * 1.8 - 0.8, hy + 5.6); ctx.lineTo(px + ex + s * 1.8 + 0.8, hy + 5.6); ctx.lineTo(px + ex + s * 1.8, hy + 8); ctx.closePath(); ctx.fill(); } disc(ctx, px + ex + 1.8, hy + 9.2, 0.7, '#dc2626'); }
      break;
    }
    case 'mummy': {
      ctx.save(); ctx.beginPath(); ctx.arc(px, hy, 8.9, 0, Math.PI * 2); ctx.clip();
      ctx.strokeStyle = '#cdbd92'; ctx.lineWidth = 2.6;
      for (const [y0, y1] of [[-8, -6], [-5.4, -3.6], [-2.8, -1.6]] as const) { ctx.beginPath(); ctx.moveTo(px - 10, hy + y0); ctx.lineTo(px + 10, hy + y1); ctx.stroke(); }
      if (!back) for (const [y0, y1] of [[4.2, 3], [6.4, 5.4], [8.4, 7.8]] as const) { ctx.beginPath(); ctx.moveTo(px - 10, hy + y0); ctx.lineTo(px + 10, hy + y1); ctx.stroke(); }
      else { ctx.beginPath(); ctx.moveTo(px - 10, hy + 1); ctx.lineTo(px + 10, hy + 3); ctx.stroke(); }
      ctx.strokeStyle = 'rgba(92,72,36,0.45)'; ctx.lineWidth = 0.6; for (const [y0, y1] of [[-8, -6], [-5.4, -3.6]] as const) { ctx.beginPath(); ctx.moveTo(px - 10, hy + y0 + 1.2); ctx.lineTo(px + 10, hy + y1 + 1.2); ctx.stroke(); }
      ctx.restore();
      ctx.save(); ctx.beginPath(); ctx.roundRect(px - 9, py - 11 + bob, 18, 15, 6); ctx.clip(); ctx.strokeStyle = '#cdbd92'; ctx.lineWidth = 2.6; for (let k = 0; k < 4; k++) { ctx.beginPath(); ctx.moveTo(px - 10, py - 9 + k * 4 + bob); ctx.lineTo(px + 10, py - 6 + k * 4 + bob); ctx.stroke(); } ctx.restore();
      break;
    }
    case 'dinosaur': {
      if (!back) { oval(ctx, px + ex, hy + 4.8, 4.8, 3.2, '#a3e635'); disc(ctx, px + ex - 1.2, hy + 3.6, 0.5, '#365314'); disc(ctx, px + ex + 1.2, hy + 3.6, 0.5, '#365314'); ctx.fillStyle = '#f8fafc'; for (let k = 0; k < 3; k++) ctx.fillRect(px + ex - 2.4 + k * 2.4, hy + 6.2, 0.9, 1.4); }
      oval(ctx, px, py - 3 + bob, 5.6, 6.4, '#bef264');
      break;
    }
    case 'penguin': {
      if (!back) { oval(ctx, px, py - 4 + bob, 6.8, 8.4, '#f8fafc'); for (const e of eyes) oval(ctx, e, eyeY, 3.2, 3.4, '#f8fafc'); for (const e of eyes) { disc(ctx, e + fx * 0.5, eyeY + 0.2, 1.3, '#0f172a'); } ctx.fillStyle = '#fb923c'; ctx.beginPath(); ctx.moveTo(px + ex - 3, hy + 3.4); ctx.lineTo(px + ex + 3, hy + 3.4); ctx.lineTo(px + ex, hy + 7); ctx.closePath(); ctx.fill(); }
      break;
    }
    case 'bunny': {
      for (const sd of [-1, 1]) { oval(ctx, px + sd * 4.2, hy - 13, 2.7, 7.6, '#f8fafc', sd * 0.14); oval(ctx, px + sd * 4.2, hy - 12.6, 1.3, 5.2, '#fbcfe8', sd * 0.14); }
      if (!back) { disc(ctx, px + ex, hy + 3.4, 1.2, '#f472b6'); ctx.fillStyle = '#ffffff'; ctx.fillRect(px + ex - 1.5, hy + 5.2, 1.4, 2.4); ctx.fillRect(px + ex + 0.1, hy + 5.2, 1.4, 2.4); ctx.strokeStyle = 'rgba(100,116,139,0.6)'; ctx.lineWidth = 0.5; ctx.strokeRect(px + ex - 1.5, hy + 5.2, 1.4, 2.4); ctx.strokeRect(px + ex + 0.1, hy + 5.2, 1.4, 2.4); }
      break;
    }
    case 'fox': {
      for (const sd of [-1, 1]) { ctx.fillStyle = '#ea580c'; ctx.beginPath(); ctx.moveTo(px + sd * 9, hy - 3); ctx.lineTo(px + sd * 8, hy - 14); ctx.lineTo(px + sd * 2.6, hy - 8); ctx.closePath(); ctx.fill(); ctx.fillStyle = '#111827'; ctx.beginPath(); ctx.moveTo(px + sd * 8.1, hy - 10.4); ctx.lineTo(px + sd * 8, hy - 14); ctx.lineTo(px + sd * 5.6, hy - 11.4); ctx.closePath(); ctx.fill(); }
      if (!back) { oval(ctx, px + ex, hy + 4.8, 4.6, 3, '#fff7ed'); disc(ctx, px + ex, hy + 3.2, 1.3, '#111827'); for (const sd of [-1, 1]) { ctx.fillStyle = '#fff7ed'; ctx.beginPath(); ctx.moveTo(px + sd * 9, hy + 1); ctx.lineTo(px + sd * 5.4, hy + 3); ctx.lineTo(px + sd * 7.6, hy + 6.4); ctx.closePath(); ctx.fill(); } }
      break;
    }
    case 'unicorn': {
      const rb = ['#ef4444', '#f59e0b', '#facc15', '#22c55e', '#38bdf8', '#a855f7'];
      for (const sd of [-1, 1]) { ctx.fillStyle = '#fdf2f8'; ctx.beginPath(); ctx.moveTo(px + sd * 8.6, hy - 4); ctx.lineTo(px + sd * 8, hy - 11); ctx.lineTo(px + sd * 3.6, hy - 7); ctx.closePath(); ctx.fill(); }
      if (back) { rb.forEach((c, k) => { ctx.fillStyle = c; ctx.fillRect(px - 5 + k * 1.7, hy - 8, 1.7, 15); }); }
      else { rb.forEach((c, k) => { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(px - 5.4 + k * 2.1, hy - 6, 2.2, Math.PI, Math.PI * 2); ctx.fill(); }); disc(ctx, px + ex, hy + 4.4, 1.6, '#f9a8d4'); }
      ctx.fillStyle = '#fde68a'; ctx.beginPath(); ctx.moveTo(px - 2.4, hy - 9); ctx.lineTo(px + 2.4, hy - 9); ctx.lineTo(px, hy - 20); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#f59e0b'; ctx.lineWidth = 0.8; for (let k = 0; k < 3; k++) { ctx.beginPath(); ctx.moveTo(px - 2 + k * 0.5, hy - 11 - k * 2.9); ctx.lineTo(px + 2 - k * 0.5, hy - 12.4 - k * 2.9); ctx.stroke(); }
      break;
    }
    case 'bee': {
      ctx.strokeStyle = '#111827'; ctx.lineWidth = 1.1; for (const sd of [-1, 1]) { ctx.beginPath(); ctx.moveTo(px + sd * 3, hy - 8); ctx.quadraticCurveTo(px + sd * 5, hy - 14, px + sd * 8 + Math.sin(t / 220) * 0.8, hy - 15); ctx.stroke(); disc(ctx, px + sd * 8 + Math.sin(t / 220) * 0.8, hy - 15, 1.8, '#111827'); }
      ctx.save(); ctx.beginPath(); ctx.roundRect(px - 9, py - 11 + bob, 18, 15, 6); ctx.clip(); ctx.fillStyle = 'rgba(17,24,39,0.9)'; for (let k = 0; k < 3; k++) ctx.fillRect(px - 10, py - 8 + bob + k * 4.6, 20, 2.2); ctx.restore();
      if (!back) { ctx.strokeStyle = '#111827'; ctx.lineWidth = 0.9; ctx.beginPath(); ctx.arc(px + ex, hy + 4.6, 2.2, 0.2, Math.PI - 0.2); ctx.stroke(); }
      break;
    }
    case 'frog': {
      for (const s of [-1, 1]) { disc(ctx, px + s * 4.6, hy - 8.4, 4.2, '#4ade80'); if (!back) { disc(ctx, px + s * 4.6, hy - 8.4, 2.8, '#f8fafc'); disc(ctx, px + s * 4.6 + fx * 0.6, hy - 8.2, 1.4, '#0f172a'); } }
      if (!back) { ctx.strokeStyle = '#15803d'; ctx.lineWidth = 1.1; ctx.beginPath(); ctx.moveTo(px - 6 + ex, hy + 4.4); ctx.quadraticCurveTo(px + ex, hy + 8, px + 6 + ex, hy + 4.4); ctx.stroke(); disc(ctx, px - 6, hy + 4.6, 1.2, 'rgba(244,114,182,0.5)'); disc(ctx, px + 6, hy + 4.6, 1.2, 'rgba(244,114,182,0.5)'); }
      break;
    }
    default: break;
  }
  void shade;
}
