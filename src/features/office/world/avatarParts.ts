import type { AvatarStyle } from './types';

type Ctx = CanvasRenderingContext2D;

/** Where the body is this frame, and which way it faces. */
export interface Pose { px: number; py: number; hy: number; bob: number; back: boolean; side: boolean; fx: number; t: number; moving: boolean; step: number; ex: number }

// small drawing helpers (kept here so this file stands on its own)
function rr(ctx: Ctx, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
function disc(ctx: Ctx, x: number, y: number, r: number, fill: string) { ctx.fillStyle = fill; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); }
function oval(ctx: Ctx, x: number, y: number, rx: number, ry: number, fill: string, rot = 0) { ctx.fillStyle = fill; ctx.beginPath(); ctx.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2); ctx.fill(); }
export function shade(hex: string, amount: number): string {
  if (typeof hex !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(hex)) return '#808080';
  const n = parseInt(hex.slice(1), 16);
  const t = amount < 0 ? 0 : 255;
  const p = Math.abs(amount);
  const c = (v: number) => Math.round((t - v) * p + v);
  return `rgb(${c((n >> 16) & 255)},${c((n >> 8) & 255)},${c(n & 255)})`;
}

// ---------- the lists the editor shows (the position in each list is the number saved on the avatar) ----------
export const HAIR_STYLES = ['Short', 'Long', 'Bun', 'None', 'Curly', 'Quiff', 'Braids', 'Afro', 'Bob', 'Mohawk', 'Locs', 'Pigtails', 'Ponytail', 'Cornrows', 'Locs bun', 'Space buns', 'Side part', 'Fade'];
export const OUTFITS = ['T-shirt', 'Hoodie', 'Blazer', 'Dress', 'Skirt', 'Kaftan', 'Ankara top', 'Agbada', 'Buba and sokoto', 'Iro and buba', 'Ball gown', 'Wedding dress', 'Graduation gown', 'Abaya', 'Dashiki', 'Kente wrap', 'Overalls', 'Lab coat', 'Tank top'];
export const BEARDS = ['None', 'Stubble', 'Moustache', 'Beard', 'Goatee', 'Handlebar', 'Long beard'];
export const SHOES = ['Sneakers', 'Formal', 'Boots', 'Sandals', 'Heels', 'Slippers', 'Barefoot'];
export const BOTTOMS = ['Trousers', 'Shorts', 'Capri', 'Leggings', 'Joggers', 'Bermuda', 'Bare legs'];
export const HATS = ['None', 'Cap', 'Beanie', 'Head wrap', 'Beret', 'Cowboy hat', 'Fila cap', 'Gele', 'Hijab', 'Turban', 'Top hat', 'Chef hat', 'Crown', 'Hard hat', 'Graduation cap', 'Igbo red cap', 'Kufi', 'Bucket hat', 'Fedora', 'Flat cap', 'Backwards cap', 'Trucker cap', 'Visor', 'Bandana', 'Sun hat', 'Sombrero', 'Pom beanie', 'Newsboy', 'Bowler', 'Santa hat'];
export const GLASSES = ['None', 'Glasses', 'Sunglasses', 'Round glasses', 'Monocle', '3D glasses', 'Star glasses'];
export const EXTRAS = ['None', 'Headset', 'Earrings', 'Face mask', 'Flower', 'Face paint', 'Big hoops', 'Eye patch'];
export const COSTUMES = ['None', 'Robot', 'Zombie', 'Ghost', 'Pirate', 'Rat', 'Alien', 'Clown', 'Skeleton', 'Cat', 'Dog', 'Bear', 'Astronaut', 'Ninja', 'Wizard', 'Knight', 'Superhero', 'Devil', 'Angel', 'Pumpkin', 'Banana', 'Duck'];
export const JACKETS = ['None', 'Blazer', 'Denim', 'Bomber', 'Waistcoat'];
export const TIES = ['None', 'Tie', 'Bow tie', 'Scarf'];

/** Outfits whose sleeves reach the wrist or beyond. */
export const LONG_SLEEVE_OUTFITS = [1, 2, 7, 12, 13, 17];
/** Outfits that hide the legs (a gown or robe to the floor). */
export const FLOOR_OUTFITS = [7, 10, 11, 12, 13];
/** Hats that cover all the hair. */
export const HAIR_HIDING_HATS = [7, 8, 9, 14, 15, 16, 23];

// ---------- hair ----------
/** The newer hair styles, drawn on top of the plain scalp. */
export function drawHairX(ctx: Ctx, a: AvatarStyle, P: Pose) {
  const { px, hy, back, side, fx } = P;
  const h = a.hair;
  switch (a.hairStyle) {
    case 11: // pigtails
      for (const s of [-1, 1]) {
        rr(ctx, px + s * 9.4 - 1.6, hy - 4, 3.2, 3, 1.4); ctx.fillStyle = '#ef4444'; ctx.fill();
        oval(ctx, px + s * 10.6, hy + 2, 3.6, 7.2, h, s * 0.18);
        oval(ctx, px + s * 10.9, hy + 7.5, 2.6, 2.6, shade(h, -0.2));
      }
      break;
    case 12: // ponytail
      if (back || side) { oval(ctx, px - fx * 9.5, hy + 3, 3.6, 8, h, -fx * 0.3); rr(ctx, px - fx * 9.6 - 1.8, hy - 4, 3.6, 3, 1.4); ctx.fillStyle = '#ec4899'; ctx.fill(); }
      else { oval(ctx, px + 9.8, hy - 1, 2.8, 6, h, 0.35); }
      break;
    case 13: // cornrows: neat lines over the scalp, braids at the back
      ctx.strokeStyle = shade(h, 0.35); ctx.lineWidth = 0.8;
      for (let k = -3; k <= 3; k++) { ctx.beginPath(); ctx.moveTo(px + k * 2.3, hy - 9.3 + Math.abs(k) * 0.5); ctx.quadraticCurveTo(px + k * 2.9, hy - 4, px + k * 3.1, hy - 1.2); ctx.stroke(); }
      if (back) for (let k = -3; k <= 3; k++) { rr(ctx, px + k * 2.6 - 0.9, hy - 1, 1.8, 9 + (k % 2), 0.8); ctx.fillStyle = h; ctx.fill(); }
      break;
    case 14: // locs in a bun
      disc(ctx, px, hy - 12, 5.4, h);
      ctx.strokeStyle = shade(h, 0.3); ctx.lineWidth = 0.9;
      for (let k = 0; k < 4; k++) { ctx.beginPath(); ctx.arc(px, hy - 12, 1.5 + k * 1.1, k, k + 2.6); ctx.stroke(); }
      for (const s of [-1, 1]) { rr(ctx, px + s * 8.2 - 1.4, hy - 2, 2.8, 9, 1.4); ctx.fillStyle = h; ctx.fill(); }
      break;
    case 15: // space buns
      for (const s of [-1, 1]) { disc(ctx, px + s * 7, hy - 10, 3.8, h); disc(ctx, px + s * 7 - 0.8, hy - 11, 1.2, shade(h, 0.3)); }
      break;
    case 16: // a side part, swept and shiny
      ctx.fillStyle = h; ctx.beginPath(); ctx.ellipse(px - fx * 1 + 1, hy - 5.2, 8.4, 4.2, 0.2, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = shade(h, 0.45); ctx.lineWidth = 0.9; ctx.beginPath(); ctx.moveTo(px - 3, hy - 9.2); ctx.quadraticCurveTo(px - 4, hy - 6.5, px - 5, hy - 3.6); ctx.stroke();
      break;
    case 17: // a fade: short on top, skin showing at the sides
      ctx.fillStyle = h; ctx.beginPath(); ctx.ellipse(px, hy - 6.4, 7.2, 3.2, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = `rgba(0,0,0,0.12)`; ctx.fillRect(px - 8.8, hy - 5, 2.4, 4); ctx.fillRect(px + 6.4, hy - 5, 2.4, 4);
      break;
  }
}

// ---------- beards ----------
export function drawBeardX(ctx: Ctx, a: AvatarStyle, P: Pose) {
  const { px, hy, side, ex } = P;
  const h = a.hair;
  if (a.beard === 4) { // goatee
    oval(ctx, px + ex * 0.8, hy + 7, side ? 1.6 : 2.7, 2.5, h);
    oval(ctx, px + ex * 0.8, hy + 3.2, side ? 2 : 3.6, 0.9, h);
  } else if (a.beard === 5) { // handlebar moustache
    ctx.strokeStyle = h; ctx.lineWidth = 1.7; ctx.lineCap = 'round';
    for (const s of side ? [1] : [-1, 1]) { ctx.beginPath(); ctx.moveTo(px + ex * 0.8, hy + 3.2); ctx.quadraticCurveTo(px + ex * 0.8 + s * 4, hy + 4.4, px + ex * 0.8 + s * 5.4, hy + 1.6); ctx.stroke(); }
    ctx.lineCap = 'butt';
  } else if (a.beard === 6) { // long beard
    ctx.fillStyle = h; ctx.beginPath(); ctx.moveTo(px - 8.2, hy + 1); ctx.quadraticCurveTo(px - 9, hy + 13, px, hy + 18); ctx.quadraticCurveTo(px + 9, hy + 13, px + 8.2, hy + 1); ctx.closePath(); ctx.fill();
    disc(ctx, px + ex * 0.8, hy + 4.2, 3.3, a.skin);
    ctx.strokeStyle = shade(h, 0.3); ctx.lineWidth = 0.7;
    for (const k of [-3, 0, 3]) { ctx.beginPath(); ctx.moveTo(px + k, hy + 8); ctx.lineTo(px + k * 1.2, hy + 15); ctx.stroke(); }
  }
}

// ---------- glasses ----------
export function drawGlassesX(ctx: Ctx, a: AvatarStyle, eyes: number[], eyeY: number, side: boolean) {
  if (a.glasses === 3) { // big round gold frames
    ctx.strokeStyle = '#d6ac50'; ctx.lineWidth = 1.3;
    for (const e of eyes) { ctx.beginPath(); ctx.arc(e, eyeY, 4, 0, Math.PI * 2); ctx.stroke(); ctx.fillStyle = 'rgba(186,230,253,0.25)'; ctx.fill(); }
    if (!side) { ctx.beginPath(); ctx.moveTo(eyes[0] + 4, eyeY); ctx.lineTo(eyes[1] - 4, eyeY); ctx.stroke(); }
  } else if (a.glasses === 4) { // a monocle on a chain
    const e = eyes[eyes.length - 1];
    ctx.strokeStyle = '#d6ac50'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(e, eyeY, 3.8, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(e + 2.6, eyeY + 3.2); ctx.quadraticCurveTo(e + 6, eyeY + 9, e + 3, eyeY + 14); ctx.stroke();
  } else if (a.glasses === 5) { // 3D glasses
    ctx.fillStyle = '#ef4444'; if (eyes[0] !== undefined) { rr(ctx, eyes[0] - 3.4, eyeY - 2.6, 6.8, 5.2, 1.2); ctx.fill(); }
    ctx.fillStyle = '#38bdf8'; const e1 = eyes[1] ?? eyes[0]; rr(ctx, e1 - 3.4, eyeY - 2.6, 6.8, 5.2, 1.2); ctx.fill();
    ctx.strokeStyle = '#f8fafc'; ctx.lineWidth = 1; for (const e of eyes) { rr(ctx, e - 3.8, eyeY - 3, 7.6, 6, 1.4); ctx.stroke(); }
  } else if (a.glasses === 6) { // party star glasses
    ctx.fillStyle = '#facc15';
    for (const e of eyes) {
      ctx.beginPath();
      for (let k = 0; k < 10; k++) { const r = k % 2 ? 2.2 : 4.6; const an = -Math.PI / 2 + (k * Math.PI) / 5; ctx.lineTo(e + Math.cos(an) * r, eyeY + Math.sin(an) * r); }
      ctx.closePath(); ctx.fill();
    }
  }
}

// ---------- extras ----------
export function drawExtraX(ctx: Ctx, a: AvatarStyle, P: Pose) {
  const { px, hy, back, side, fx, ex } = P;
  if (a.extra === 3 && !back) { // a face mask with ear loops
    ctx.fillStyle = '#bae6fd'; rr(ctx, px - 6 + ex * 0.6, hy + 2.6, 12, 6.4, 2.4); ctx.fill();
    ctx.strokeStyle = '#7dd3fc'; ctx.lineWidth = 0.7; for (const k of [4, 5.8, 7.6]) { ctx.beginPath(); ctx.moveTo(px - 5 + ex * 0.6, hy + k); ctx.lineTo(px + 5 + ex * 0.6, hy + k); ctx.stroke(); }
    ctx.strokeStyle = '#e0f2fe'; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(px - 6, hy + 3.4); ctx.lineTo(px - 8.6, hy + 1.4); ctx.moveTo(px + 6, hy + 3.4); ctx.lineTo(px + 8.6, hy + 1.4); ctx.stroke();
  } else if (a.extra === 4) { // a flower behind the ear
    const fxp = px + (side ? -fx * 5.4 : 6.8), fy = hy - 3.4;
    for (let k = 0; k < 5; k++) { const an = (k / 5) * Math.PI * 2; disc(ctx, fxp + Math.cos(an) * 2.3, fy + Math.sin(an) * 2.3, 1.7, '#f472b6'); }
    disc(ctx, fxp, fy, 1.3, '#fde047');
  } else if (a.extra === 5 && !back) { // face paint stripes
    ctx.lineWidth = 1.1; ctx.lineCap = 'round';
    for (const s of side ? [fx] : [-1, 1]) for (let k = 0; k < 3; k++) { ctx.strokeStyle = k === 1 ? '#f8fafc' : '#ef4444'; ctx.beginPath(); ctx.moveTo(px + s * (4.4 + k * 0.6) + ex * 0.5, hy + 3 + k * 1.3); ctx.lineTo(px + s * (7.6 + k * 0.2) + ex * 0.5, hy + 2 + k * 1.4); ctx.stroke(); }
    ctx.lineCap = 'butt';
  } else if (a.extra === 6 && !back) { // big hoop earrings
    ctx.strokeStyle = '#d6ac50'; ctx.lineWidth = 1.3;
    for (const x of side ? [px - fx * 6.5] : [px - 8.8, px + 8.8]) { ctx.beginPath(); ctx.arc(x, hy + 7, 3.2, 0, Math.PI * 2); ctx.stroke(); }
  } else if (a.extra === 7 && !back) { // an eye patch
    const e = side ? px + ex + fx * 1.5 : px + 3.2 + ex;
    ctx.strokeStyle = '#111827'; ctx.lineWidth = 0.9; ctx.beginPath(); ctx.moveTo(px - 9, hy - 3.6); ctx.lineTo(e + 3.2, hy + 3); ctx.moveTo(px + 9, hy - 2.6); ctx.lineTo(e - 3, hy + 3.4); ctx.stroke();
    ctx.fillStyle = '#111827'; ctx.beginPath(); ctx.ellipse(e, hy + 1, 3.4, 3.3, 0.2, 0, Math.PI * 2); ctx.fill();
  }
}

// ---------- hats ----------
export function drawHatX(ctx: Ctx, a: AvatarStyle, P: Pose) {
  const { px, hy, back, side, fx, t } = P;
  const c = a.hatColor;
  switch (a.hat) {
    case 5: { // cowboy hat: a wide curled brim, a dented crown, a band and a buckle
      oval(ctx, px, hy - 3, 14.6, 4.4, shade(c, -0.15));
      oval(ctx, px - 12.2, hy - 4.4, 3.4, 2.4, c, -0.5); oval(ctx, px + 12.2, hy - 4.4, 3.4, 2.4, c, 0.5);
      ctx.fillStyle = c; ctx.beginPath(); ctx.moveTo(px - 7.4, hy - 3); ctx.quadraticCurveTo(px - 8, hy - 13.5, px - 3, hy - 12.6); ctx.quadraticCurveTo(px, hy - 8.8, px + 3, hy - 12.6); ctx.quadraticCurveTo(px + 8, hy - 13.5, px + 7.4, hy - 3); ctx.closePath(); ctx.fill();
      ctx.fillStyle = shade(c, -0.5); ctx.fillRect(px - 7.5, hy - 6.4, 15, 2.2);
      if (!back) { ctx.fillStyle = '#d6ac50'; ctx.fillRect(px - 1.6 + fx * 2, hy - 6.6, 3.2, 2.6); }
      break;
    }
    case 6: { // a Fila cap: a soft cap folded down on one side
      ctx.fillStyle = c; ctx.beginPath(); ctx.moveTo(px - 8.6, hy - 1.8); ctx.quadraticCurveTo(px - 9.4, hy - 12, px + 2, hy - 13.2); ctx.quadraticCurveTo(px + 11, hy - 12.8, px + 9, hy - 1.8); ctx.closePath(); ctx.fill();
      ctx.fillStyle = shade(c, -0.25); ctx.beginPath(); ctx.moveTo(px + 2, hy - 13.2); ctx.quadraticCurveTo(px + 13.4, hy - 11, px + 11.4, hy + 3); ctx.lineTo(px + 6.6, hy + 1); ctx.quadraticCurveTo(px + 8, hy - 7, px + 2, hy - 9.4); ctx.closePath(); ctx.fill();
      ctx.fillStyle = shade(c, 0.3); ctx.fillRect(px - 8.8, hy - 3.6, 17.6, 1.6);
      break;
    }
    case 7: { // a gele: a tall sculpted head tie
      const folds: [number, number, number, number, number][] = [[-7, -7, 7.4, 4.6, -0.6], [7.2, -8, 7.4, 4.8, 0.55], [0, -13, 8.4, 4.8, 0], [-3.6, -4, 9.4, 3.8, -0.2], [4.4, -4.4, 9, 3.6, 0.2]];
      folds.forEach(([dx, dy, rx, ry, r], i) => oval(ctx, px + dx, hy + dy, rx, ry, i % 2 ? shade(c, -0.14) : shade(c, 0.1), r));
      ctx.strokeStyle = shade(c, -0.35); ctx.lineWidth = 0.7;
      for (const [dx, dy] of [[-7, -7], [7, -8], [0, -13]] as const) { ctx.beginPath(); ctx.arc(px + dx, hy + dy, 4, 0.4, 2.6); ctx.stroke(); }
      oval(ctx, px, hy - 4.2, 10.4, 3, shade(c, -0.05));
      disc(ctx, px + 7, hy - 11, 1.3, '#fde68a');
      break;
    }
    case 8: { // a hijab: a soft scarf round the face and down over the shoulders (clipped so the face stays clear)
      ctx.save();
      ctx.beginPath(); ctx.rect(px - 24, hy - 24, 48, 52);
      if (!back) { ctx.moveTo(px + fx * 1.2 + (side ? 5.4 : 6.8), hy + 2.6); ctx.ellipse(px + fx * 1.2, hy + 2.6, side ? 5.4 : 6.8, 6.6, 0, 0, Math.PI * 2); }
      ctx.clip('evenodd');
      ctx.fillStyle = shade(c, -0.1);
      ctx.beginPath(); ctx.moveTo(px - 11, hy + 2); ctx.quadraticCurveTo(px - 13.4, hy + 14, px - 10, hy + 18); ctx.lineTo(px + 10, hy + 18); ctx.quadraticCurveTo(px + 13.4, hy + 14, px + 11, hy + 2); ctx.closePath(); ctx.fill();
      ctx.fillStyle = c; ctx.beginPath(); ctx.ellipse(px, hy - 0.4, 11.2, 11.6, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = shade(c, -0.3); ctx.lineWidth = 0.8;
      ctx.beginPath(); ctx.arc(px, hy - 0.4, 10.6, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.22)'; ctx.beginPath(); ctx.moveTo(px - 8, hy + 6); ctx.quadraticCurveTo(px - 10, hy + 12, px - 8, hy + 16); ctx.stroke();
      ctx.restore();
      break;
    }
    case 9: { // a turban: wound cloth with a jewel
      ctx.fillStyle = c; ctx.beginPath(); ctx.arc(px, hy - 2.4, 10.4, Math.PI, Math.PI * 2); ctx.fill(); oval(ctx, px, hy - 8.4, 8.6, 6.4, shade(c, 0.1));
      ctx.strokeStyle = shade(c, -0.32); ctx.lineWidth = 0.9;
      for (let k = 0; k < 4; k++) { ctx.beginPath(); ctx.moveTo(px - 10 + k * 0.6, hy - 2.6 - k * 2.2); ctx.quadraticCurveTo(px, hy - 6 - k * 2.2 + 3, px + 10 - k * 0.6, hy - 2.6 - k * 2.2); ctx.stroke(); }
      if (!back) { disc(ctx, px + fx * 2.4, hy - 6.4, 1.8, '#ef4444'); disc(ctx, px + fx * 2.4 - 0.5, hy - 6.9, 0.6, '#fecaca'); }
      break;
    }
    case 10: { // a top hat
      oval(ctx, px, hy - 3.2, 12, 3.2, '#111827');
      rr(ctx, px - 7, hy - 17, 14, 14, 1.6); ctx.fillStyle = '#1f2937'; ctx.fill();
      ctx.fillStyle = c; ctx.fillRect(px - 7, hy - 7, 14, 2.8);
      ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fillRect(px - 5, hy - 16, 1.8, 10);
      break;
    }
    case 11: { // a chef's hat
      disc(ctx, px - 5, hy - 12, 4.8, '#f8fafc'); disc(ctx, px + 5, hy - 12, 4.8, '#f8fafc'); disc(ctx, px, hy - 14.4, 5.4, '#ffffff');
      rr(ctx, px - 8, hy - 11, 16, 8, 2); ctx.fillStyle = '#f8fafc'; ctx.fill();
      ctx.fillStyle = 'rgba(15,23,42,0.1)'; for (const k of [-3, 0, 3]) ctx.fillRect(px + k, hy - 10, 0.8, 6);
      ctx.fillStyle = '#e2e8f0'; ctx.fillRect(px - 8, hy - 4.2, 16, 1.6);
      break;
    }
    case 12: { // a gold crown with jewels
      ctx.fillStyle = '#facc15'; ctx.beginPath(); ctx.moveTo(px - 8, hy - 3.6); ctx.lineTo(px - 8.6, hy - 12); ctx.lineTo(px - 4, hy - 8); ctx.lineTo(px, hy - 13.6); ctx.lineTo(px + 4, hy - 8); ctx.lineTo(px + 8.6, hy - 12); ctx.lineTo(px + 8, hy - 3.6); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#ca8a04'; ctx.fillRect(px - 8, hy - 5.2, 16, 1.8);
      disc(ctx, px, hy - 10.6, 1.2, '#ef4444'); disc(ctx, px - 5, hy - 7, 0.9, '#38bdf8'); disc(ctx, px + 5, hy - 7, 0.9, '#16a34a');
      break;
    }
    case 13: { // a hard hat
      ctx.fillStyle = c; ctx.beginPath(); ctx.arc(px, hy - 2.6, 9.6, Math.PI, Math.PI * 2); ctx.fill();
      rr(ctx, px - 10.6, hy - 4, 21.2, 2.6, 1.2); ctx.fill();
      ctx.fillStyle = shade(c, -0.2); ctx.fillRect(px - 1.6, hy - 12.4, 3.2, 8);
      ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillRect(px - 6.6, hy - 9, 2, 4);
      break;
    }
    case 14: { // a graduation cap with a tassel
      ctx.fillStyle = c; ctx.beginPath(); ctx.moveTo(px - 12, hy - 8); ctx.lineTo(px, hy - 12.6); ctx.lineTo(px + 12, hy - 8); ctx.lineTo(px, hy - 3.6); ctx.closePath(); ctx.fill();
      rr(ctx, px - 7, hy - 6.6, 14, 4.8, 1.6); ctx.fillStyle = shade(c, -0.25); ctx.fill();
      ctx.strokeStyle = '#facc15'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(px, hy - 8.2); ctx.lineTo(px + 10.4, hy - 7.2); ctx.lineTo(px + 10.4, hy - 1.4); ctx.stroke();
      disc(ctx, px + 10.4, hy - 0.6, 1.3, '#facc15');
      break;
    }
    case 15: { // an Igbo red cap with a feather
      ctx.fillStyle = '#dc2626'; ctx.beginPath(); ctx.moveTo(px - 8.8, hy - 1.6); ctx.quadraticCurveTo(px - 9.6, hy - 12.4, px, hy - 12.6); ctx.quadraticCurveTo(px + 9.6, hy - 12.4, px + 8.8, hy - 1.6); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#991b1b'; ctx.fillRect(px - 9, hy - 3.8, 18, 2.2);
      ctx.strokeStyle = '#fde68a'; ctx.lineWidth = 0.7; ctx.beginPath(); ctx.arc(px, hy - 3, 7, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke();
      ctx.fillStyle = '#f8fafc'; ctx.beginPath(); ctx.moveTo(px + 6, hy - 6); ctx.quadraticCurveTo(px + 12, hy - 15, px + 9, hy - 18); ctx.quadraticCurveTo(px + 7, hy - 12, px + 5, hy - 6); ctx.closePath(); ctx.fill();
      break;
    }
    case 16: { // a kufi: a short rounded cap with an embroidered band
      ctx.fillStyle = c; ctx.beginPath(); ctx.arc(px, hy - 2.2, 9.2, Math.PI * 1.02, Math.PI * 1.98); ctx.closePath(); ctx.fill();
      ctx.fillStyle = shade(c, 0.35); ctx.fillRect(px - 9, hy - 5, 18, 2.4);
      ctx.fillStyle = '#d6ac50'; for (let k = 0; k < 6; k++) { ctx.beginPath(); ctx.moveTo(px - 7.6 + k * 3, hy - 3.8); ctx.lineTo(px - 6.1 + k * 3, hy - 4.8); ctx.lineTo(px - 4.6 + k * 3, hy - 3.8); ctx.lineTo(px - 6.1 + k * 3, hy - 2.8); ctx.closePath(); ctx.fill(); }
      break;
    }
    case 17: { // a bucket hat: a soft crown and a brim that droops all round
      oval(ctx, px, hy - 2.6, 11.6, 3.4, shade(c, -0.12));
      ctx.fillStyle = c; ctx.beginPath(); ctx.moveTo(px - 8.2, hy - 3); ctx.quadraticCurveTo(px - 8.6, hy - 11.6, px, hy - 11.6); ctx.quadraticCurveTo(px + 8.6, hy - 11.6, px + 8.2, hy - 3); ctx.closePath(); ctx.fill();
      ctx.fillStyle = shade(c, 0.25); ctx.fillRect(px - 8.2, hy - 5.6, 16.4, 1.6);
      break;
    }
    case 18: { // a fedora: a pinched crown with a band and a tilted brim
      oval(ctx, px, hy - 3, 12.6, 3.4, shade(c, -0.1), -0.06);
      ctx.fillStyle = c; ctx.beginPath(); ctx.moveTo(px - 7.6, hy - 3); ctx.quadraticCurveTo(px - 8, hy - 12.4, px - 3.4, hy - 12); ctx.quadraticCurveTo(px, hy - 9.4, px + 3.4, hy - 12); ctx.quadraticCurveTo(px + 8, hy - 12.4, px + 7.6, hy - 3); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#111827'; ctx.fillRect(px - 7.8, hy - 6.2, 15.6, 2);
      break;
    }
    case 19: { // a flat cap: low, round and flat, with a short peak
      oval(ctx, px + 0.6, hy - 6.4, 9.8, 4.2, c, -0.08);
      ctx.fillStyle = shade(c, -0.2); ctx.beginPath(); ctx.ellipse(px, hy - 3, 9.2, 2.2, 0, 0, Math.PI); ctx.fill();
      if (!back) { ctx.fillStyle = shade(c, -0.3); ctx.beginPath(); ctx.ellipse(px + (side ? fx * 8 : 0), hy - 2.4, side ? 5 : 8, 2, 0, 0, Math.PI); ctx.fill(); }
      ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fillRect(px - 5, hy - 8.6, 6, 1.2);
      break;
    }
    case 20: { // a cap worn backwards: the peak is at the back
      ctx.fillStyle = c; ctx.beginPath(); ctx.arc(px, hy - 2, 9.4, Math.PI, Math.PI * 2); ctx.fill();
      if (back) { ctx.beginPath(); ctx.ellipse(px, hy - 0.4, 8.6, 2.6, 0, 0, Math.PI); ctx.fill(); }
      else { ctx.fillStyle = shade(c, -0.3); ctx.fillRect(px - 2.6, hy - 3.2, 5.2, 1.6); if (side) { ctx.fillStyle = c; ctx.beginPath(); ctx.ellipse(px - fx * 8, hy - 2, 6, 2.2, 0, 0, Math.PI * 2); ctx.fill(); } }
      disc(ctx, px, hy - 9, 1.2, 'rgba(255,255,255,0.7)');
      break;
    }
    case 21: { // a trucker cap: a bright front panel, a mesh back
      ctx.fillStyle = shade(c, -0.15); ctx.beginPath(); ctx.arc(px, hy - 2, 9.4, Math.PI, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#f8fafc'; ctx.beginPath(); ctx.arc(px, hy - 2, 9.4, Math.PI * 1.1, Math.PI * 1.9); ctx.lineTo(px, hy - 2); ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgba(15,23,42,0.35)'; for (let k = 0; k < 6; k++) disc(ctx, px - 7 + k * 2.8, hy - 5 - (k % 2), 0.55, ctx.fillStyle as string);
      if (!back) { ctx.fillStyle = c; ctx.beginPath(); if (side) ctx.ellipse(px + fx * 8, hy - 2, 6, 2.2, 0, 0, Math.PI * 2); else ctx.ellipse(px, hy - 0.5, 8.5, 2.6, 0, 0, Math.PI); ctx.fill(); }
      break;
    }
    case 22: { // a sun visor: a band and a peak, nothing on top
      ctx.strokeStyle = c; ctx.lineWidth = 2.4; ctx.beginPath(); ctx.arc(px, hy - 2, 9.2, Math.PI * 1.02, Math.PI * 1.98); ctx.stroke();
      if (!back) { ctx.fillStyle = c; ctx.beginPath(); if (side) ctx.ellipse(px + fx * 8, hy - 3.4, 6.4, 2, 0, 0, Math.PI * 2); else ctx.ellipse(px, hy - 3.6, 9, 2.6, 0, 0, Math.PI); ctx.fill(); }
      break;
    }
    case 23: { // a bandana tied at the back, with a pattern
      ctx.fillStyle = c; ctx.beginPath(); ctx.arc(px, hy - 1.2, 9.6, Math.PI, Math.PI * 2); ctx.lineTo(px + 9.6, hy - 1.2); ctx.quadraticCurveTo(px, hy + 1, px - 9.6, hy - 1.2); ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.7)'; for (let k = 0; k < 5; k++) disc(ctx, px - 6 + k * 3, hy - 4.6 - (k % 2) * 1.6, 0.8, ctx.fillStyle as string);
      ctx.fillStyle = c; ctx.beginPath(); ctx.moveTo(px - fx * 8.8, hy - 2); ctx.lineTo(px - fx * 15, hy + 1.4); ctx.lineTo(px - fx * 12, hy + 4); ctx.lineTo(px - fx * 8.8, hy); ctx.closePath(); ctx.fill();
      break;
    }
    case 24: { // a wide straw sun hat with a ribbon
      oval(ctx, px, hy - 3, 15.6, 4.8, shade(c, -0.08));
      ctx.fillStyle = c; ctx.beginPath(); ctx.moveTo(px - 8, hy - 3.4); ctx.quadraticCurveTo(px - 8.6, hy - 12, px, hy - 12); ctx.quadraticCurveTo(px + 8.6, hy - 12, px + 8, hy - 3.4); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#ef4444'; ctx.fillRect(px - 8, hy - 6.6, 16, 2);
      ctx.strokeStyle = 'rgba(120,53,15,0.35)'; ctx.lineWidth = 0.6; for (let k = -2; k <= 2; k++) { ctx.beginPath(); ctx.ellipse(px, hy - 3, 6 + k * 2.6 + 6, 1.6 + 1.2 * (k + 2) / 2, 0, 0, Math.PI); ctx.stroke(); }
      break;
    }
    case 25: { // a sombrero: a huge brim and a tall pointed crown with gold trim
      oval(ctx, px, hy - 2.6, 17.4, 5, shade(c, -0.1));
      ctx.fillStyle = c; ctx.beginPath(); ctx.moveTo(px - 7.6, hy - 3.4); ctx.quadraticCurveTo(px - 6, hy - 11, px, hy - 17); ctx.quadraticCurveTo(px + 6, hy - 11, px + 7.6, hy - 3.4); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#facc15'; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.ellipse(px, hy - 2.6, 16, 4.4, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = '#facc15'; ctx.fillRect(px - 7.4, hy - 6.8, 14.8, 1.8);
      break;
    }
    case 26: { // a beanie with a folded cuff and a big pom-pom
      ctx.fillStyle = c; ctx.beginPath(); ctx.arc(px, hy - 2.4, 9.6, Math.PI, Math.PI * 2); ctx.fill();
      ctx.fillStyle = shade(c, -0.22); rr(ctx, px - 9.8, hy - 4.8, 19.6, 4, 1.6); ctx.fill();
      ctx.strokeStyle = shade(c, 0.3); ctx.lineWidth = 0.9; for (let k = 0; k < 4; k++) { ctx.beginPath(); ctx.moveTo(px - 6 + k * 4, hy - 10.6 + Math.abs(k - 1.5)); ctx.lineTo(px - 6 + k * 4, hy - 5); ctx.stroke(); }
      disc(ctx, px, hy - 13.4, 3.6, '#f8fafc'); disc(ctx, px - 1, hy - 14.4, 1.2, '#e2e8f0');
      break;
    }
    case 27: { // a newsboy cap: a puffy, wide top with a short peak
      oval(ctx, px + 0.4, hy - 6.6, 10.8, 5, c, -0.06);
      ctx.strokeStyle = shade(c, -0.3); ctx.lineWidth = 0.7; ctx.beginPath(); ctx.moveTo(px - 8, hy - 6); ctx.lineTo(px + 8, hy - 8); ctx.moveTo(px, hy - 11); ctx.lineTo(px + 0.4, hy - 3.6); ctx.stroke();
      ctx.fillStyle = shade(c, -0.2); ctx.beginPath(); ctx.ellipse(px, hy - 3, 9.4, 2.2, 0, 0, Math.PI); ctx.fill();
      if (!back) { ctx.fillStyle = shade(c, -0.35); ctx.beginPath(); ctx.ellipse(px + (side ? fx * 8 : 0), hy - 2.2, side ? 5 : 7.6, 1.9, 0, 0, Math.PI); ctx.fill(); }
      disc(ctx, px + 0.4, hy - 11, 1, shade(c, -0.4));
      break;
    }
    case 28: { // a bowler hat: a hard round dome with a narrow brim and a band
      oval(ctx, px, hy - 3, 11, 2.8, '#111827');
      ctx.fillStyle = '#1f2937'; ctx.beginPath(); ctx.arc(px, hy - 3, 8, Math.PI, Math.PI * 2); ctx.fill();
      ctx.fillStyle = c; ctx.fillRect(px - 8, hy - 6.4, 16, 2);
      ctx.fillStyle = 'rgba(255,255,255,0.2)'; ctx.fillRect(px - 5, hy - 10, 2, 4);
      break;
    }
    case 29: { // a Santa hat: red, floppy, with a white trim and pom-pom
      ctx.fillStyle = '#dc2626'; ctx.beginPath(); ctx.moveTo(px - 9.4, hy - 2.4); ctx.quadraticCurveTo(px - 9, hy - 14, px + 2, hy - 15); ctx.quadraticCurveTo(px + 11, hy - 14, px + 13, hy - 6); ctx.lineTo(px + 11, hy - 4.6); ctx.quadraticCurveTo(px + 8, hy - 9, px + 9.4, hy - 2.4); ctx.closePath(); ctx.fill();
      rr(ctx, px - 10.4, hy - 4.6, 20.8, 4, 2); ctx.fillStyle = '#f8fafc'; ctx.fill();
      disc(ctx, px + 13, hy - 5, 3, '#f8fafc');
      break;
    }
  }
  void side; void t;
}

// ---------- shoes ----------
export function drawShoeX(ctx: Ctx, kind: number, sx: number, sy: number, sc: string, skin: string) {
  if (kind === 6) { // barefoot
    ctx.fillStyle = skin; rr(ctx, sx, sy + 9.4, 7, 2.8, 1.4); ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.12)'; for (let k = 0; k < 3; k++) ctx.fillRect(sx + 4 + k * 1, sy + 11, 0.5, 1);
    return;
  }
  if (kind === 4) { // heels: a pointed shoe on a thin heel
    ctx.fillStyle = sc; ctx.beginPath(); ctx.moveTo(sx - 0.4, sy + 9); ctx.lineTo(sx + 5.6, sy + 9.4); ctx.lineTo(sx + 7.6, sy + 11.8); ctx.lineTo(sx - 0.4, sy + 11.6); ctx.closePath(); ctx.fill();
    ctx.fillRect(sx - 0.4, sy + 11, 1.2, 2.4);
    ctx.fillStyle = 'rgba(255,255,255,0.4)'; ctx.fillRect(sx + 1.4, sy + 9.6, 3, 0.7);
  } else if (kind === 5) { // fluffy slippers
    ctx.fillStyle = sc; rr(ctx, sx - 0.8, sy + 8.6, 8.4, 3.8, 1.9); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.5)'; for (let k = 0; k < 4; k++) disc(ctx, sx + 0.6 + k * 2, sy + 9.4, 0.9, 'rgba(255,255,255,0.55)');
  }
}

// ---------- outfits ----------
const gold = '#d6ac50';
function pattern(ctx: Ctx, kind: 'dots' | 'diamonds' | 'stripes', x: number, y: number, w: number, h: number, c1: string, c2: string) {
  ctx.save(); rr(ctx, x, y, w, h, 3); ctx.clip();
  if (kind === 'dots') for (let r = 0; r < h / 3.4 + 1; r++) for (let c = 0; c < w / 3.4 + 1; c++) disc(ctx, x + c * 3.4 + (r % 2) * 1.7, y + r * 3.4, 0.9, (r + c) % 2 ? c1 : c2);
  else if (kind === 'diamonds') for (let r = 0; r < h / 3.6 + 1; r++) for (let c = 0; c < w / 4 + 1; c++) { const mx = x + c * 4 + (r % 2) * 2, my = y + r * 3.6; ctx.fillStyle = (r + c) % 2 ? c1 : c2; ctx.beginPath(); ctx.moveTo(mx, my - 1.4); ctx.lineTo(mx + 1.4, my); ctx.lineTo(mx, my + 1.4); ctx.lineTo(mx - 1.4, my); ctx.closePath(); ctx.fill(); }
  else for (let k = 0; k < w / 3; k++) { ctx.fillStyle = k % 3 === 0 ? c1 : k % 3 === 1 ? c2 : '#111827'; ctx.fillRect(x + k * 3, y, 3, h); }
  ctx.restore();
}

/** The traditional and formal outfits (number 7 and up), drawn over the plain body. */
export function drawOutfitX(ctx: Ctx, a: AvatarStyle, P: Pose) {
  const { px, py, bob, back, step, moving } = P;
  const o = a.outfit;
  const sway = moving ? step * 1.5 : 0;
  const top = py - 11 + bob;
  const col = a.shirt;
  const grad = (y0: number, y1: number, c: string) => { const g = ctx.createLinearGradient(0, y0, 0, y1); g.addColorStop(0, shade(c, 0.12)); g.addColorStop(1, shade(c, -0.2)); return g; };
  if (o === 7) { // agbada: a wide flowing robe over a plain tunic
    ctx.fillStyle = grad(top, py + 10 + bob, col);
    ctx.beginPath(); ctx.moveTo(px - 9.4, top); ctx.lineTo(px + 9.4, top); ctx.lineTo(px + 17 + sway, py + 9 + bob); ctx.quadraticCurveTo(px, py + 11.5 + bob, px - 17 + sway, py + 9 + bob); ctx.closePath(); ctx.fill();
    for (const s of [-1, 1]) { ctx.fillStyle = shade(col, -0.08); ctx.beginPath(); ctx.moveTo(px + s * 9, top + 1); ctx.lineTo(px + s * 21, py + 2 + bob); ctx.lineTo(px + s * 13, py + 5 + bob); ctx.lineTo(px + s * 8.5, py - 3 + bob); ctx.closePath(); ctx.fill(); disc(ctx, px + s * 17.6, py + 4.2 + bob, 2, a.skin); }
    if (!back) {
      ctx.fillStyle = a.inner; ctx.beginPath(); ctx.moveTo(px - 3.6, top); ctx.lineTo(px + 3.6, top); ctx.lineTo(px + 6, py + 9.4 + bob); ctx.lineTo(px - 6, py + 9.4 + bob); ctx.closePath(); ctx.fill();
      ctx.fillStyle = a.skin; ctx.beginPath(); ctx.arc(px, top, 2.6, 0, Math.PI); ctx.fill();
      ctx.strokeStyle = gold; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(px - 3.6, top); ctx.lineTo(px - 6, py + 9.4 + bob); ctx.moveTo(px + 3.6, top); ctx.lineTo(px + 6, py + 9.4 + bob); ctx.stroke();
      for (let k = 0; k < 3; k++) disc(ctx, px - 6.4 - k * 1.8, py - 3 + bob + k * 1.6, 0.8, gold);
    }
  } else if (o === 8) { // buba and sokoto: a tunic with a patterned trim and loose trousers
    for (const s of [-1, 1]) { rr(ctx, px + (s < 0 ? -9 : 1) + sway * s * 0.4, py + 1 + bob, 8, 10, 2); ctx.fillStyle = a.pants; ctx.fill(); }
    ctx.fillStyle = grad(top, py + 5 + bob, col);
    ctx.beginPath(); ctx.moveTo(px - 9, top); ctx.lineTo(px + 9, top); ctx.lineTo(px + 11.4, py + 5 + bob); ctx.lineTo(px - 11.4, py + 5 + bob); ctx.closePath(); ctx.fill();
    if (!back) { pattern(ctx, 'diamonds', px - 11, py + 2.4 + bob, 22, 2.6, gold, '#fff7e0'); ctx.strokeStyle = gold; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(px, top, 3.6, 0, Math.PI); ctx.stroke(); rr(ctx, px + 3.4, py - 6 + bob, 3.2, 3, 0.8); ctx.strokeStyle = shade(col, -0.3); ctx.lineWidth = 0.7; ctx.stroke(); }
  } else if (o === 9) { // iro and buba: a blouse with puffed sleeves over a tied wrapper
    ctx.fillStyle = a.pants; ctx.beginPath(); ctx.moveTo(px - 9, py - 3 + bob); ctx.lineTo(px + 9, py - 3 + bob); ctx.lineTo(px + 11.4 + sway, py + 9.4 + bob); ctx.lineTo(px - 11.4 + sway, py + 9.4 + bob); ctx.closePath(); ctx.fill();
    pattern(ctx, 'diamonds', px - 11, py - 3 + bob, 22, 13, gold, shade(a.pants, 0.4));
    ctx.fillStyle = '#d6ac50'; ctx.fillRect(px - 9, py - 3.6 + bob, 18, 1.6);
    if (!back) { ctx.fillStyle = a.pants; ctx.beginPath(); ctx.moveTo(px + 5, py - 2 + bob); ctx.quadraticCurveTo(px + 12, py - 4 + bob, px + 11, py + 4 + bob); ctx.lineTo(px + 7, py + 1 + bob); ctx.closePath(); ctx.fill(); }
    for (const s of [-1, 1]) disc(ctx, px + s * 10, top + 3, 3.6, col);
  } else if (o === 10 || o === 11) { // a ball gown or a wedding dress: fitted top and a huge skirt
    const c = o === 11 ? '#ffffff' : col;
    ctx.fillStyle = grad(py - 4 + bob, py + 11 + bob, c);
    ctx.beginPath(); ctx.moveTo(px - 7.6, py - 4 + bob); ctx.lineTo(px + 7.6, py - 4 + bob); ctx.lineTo(px + 18 + sway, py + 10 + bob);
    for (let k = 4; k >= 0; k--) ctx.quadraticCurveTo(px - 18 + 8 * k + sway + 4, py + 13.4 + bob, px - 18 + 8 * k + sway, py + 10 + bob);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = shade(c, 0.1); rr(ctx, px - 8.4, top, 16.8, 8, 4); ctx.fill();
    if (!back) { ctx.fillStyle = a.skin; ctx.beginPath(); ctx.arc(px, top + 0.6, 4.4, 0, Math.PI); ctx.fill(); }
    ctx.fillStyle = shade(c, -0.25); ctx.fillRect(px - 8, py - 4.6 + bob, 16, 2);
    ctx.fillStyle = 'rgba(255,255,255,0.7)'; for (let k = 0; k < 7; k++) disc(ctx, px - 11 + k * 3.7 + sway * 0.5, py + 1 + (k % 3) * 3 + bob, 0.7, ctx.fillStyle);
    if (o === 11 && !back) { for (let k = 0; k < 4; k++) disc(ctx, px + 4 + k * 1.6, py - 0.4 + bob + (k % 2), 1.3, ['#f9a8d4', '#fde047', '#f8fafc', '#a7f3d0'][k]); }
  } else if (o === 12) { // a graduation gown with a stole
    ctx.fillStyle = grad(top, py + 9 + bob, col);
    ctx.beginPath(); ctx.moveTo(px - 9.4, top); ctx.lineTo(px + 9.4, top); ctx.lineTo(px + 13 + sway, py + 9 + bob); ctx.lineTo(px - 13 + sway, py + 9 + bob); ctx.closePath(); ctx.fill();
    for (const s of [-1, 1]) { ctx.fillStyle = shade(col, -0.1); ctx.beginPath(); ctx.moveTo(px + s * 9, top + 1); ctx.lineTo(px + s * 17, py + 3 + bob); ctx.lineTo(px + s * 11, py + 5 + bob); ctx.lineTo(px + s * 8.5, py - 3 + bob); ctx.closePath(); ctx.fill(); disc(ctx, px + s * 14.4, py + 4 + bob, 2, a.skin); }
    if (!back) for (const s of [-1, 1]) { ctx.fillStyle = a.tieColor; ctx.beginPath(); ctx.moveTo(px + s * 1, top); ctx.lineTo(px + s * 4.8, top); ctx.lineTo(px + s * 5.6, py + 8 + bob); ctx.lineTo(px + s * 1.6, py + 8 + bob); ctx.closePath(); ctx.fill(); ctx.fillStyle = gold; ctx.fillRect(px + s * 3 - 1.2, py + 5 + bob, 2.4, 0.9); }
  } else if (o === 13) { // an abaya: a long, simple robe with long sleeves
    ctx.fillStyle = grad(top, py + 10 + bob, col);
    ctx.beginPath(); ctx.moveTo(px - 9.4, top); ctx.lineTo(px + 9.4, top); ctx.lineTo(px + 12.4 + sway, py + 10 + bob); ctx.lineTo(px - 12.4 + sway, py + 10 + bob); ctx.closePath(); ctx.fill();
    if (!back) { ctx.fillStyle = a.skin; ctx.beginPath(); ctx.arc(px, top, 3.2, 0, Math.PI); ctx.fill(); ctx.strokeStyle = gold; ctx.lineWidth = 0.9; ctx.beginPath(); ctx.moveTo(px, top + 3); ctx.lineTo(px, py + 9 + bob); ctx.stroke(); }
    ctx.fillStyle = shade(col, -0.2); ctx.fillRect(px - 8, py - 4 + bob, 16, 1.4);
  } else if (o === 14) { // a dashiki: a bright tunic with an embroidered V and bold bands
    for (const s of [-1, 1]) { rr(ctx, px + (s < 0 ? -7.4 : 1.4), py + 2 + bob, 6, 9, 2); ctx.fillStyle = a.pants; ctx.fill(); }
    ctx.fillStyle = grad(top, py + 4 + bob, col);
    rr(ctx, px - 10, top, 20, 16, 4); ctx.fill();
    pattern(ctx, 'stripes', px - 10, py + 1 + bob, 20, 3, '#facc15', '#ef4444');
    if (!back) { ctx.strokeStyle = '#facc15'; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(px - 5, top); ctx.lineTo(px, py - 4 + bob); ctx.lineTo(px + 5, top); ctx.stroke(); ctx.strokeStyle = '#ef4444'; ctx.lineWidth = 0.7; ctx.beginPath(); ctx.moveTo(px - 3.4, top); ctx.lineTo(px, py - 6 + bob); ctx.lineTo(px + 3.4, top); ctx.stroke(); ctx.fillStyle = a.skin; ctx.beginPath(); ctx.moveTo(px - 3, top); ctx.lineTo(px + 3, top); ctx.lineTo(px, py - 6 + bob); ctx.closePath(); ctx.fill(); }
  } else if (o === 15) { // a kente cloth wrapped over one shoulder and round the waist
    ctx.fillStyle = a.pants; ctx.beginPath(); ctx.moveTo(px - 9, py - 3 + bob); ctx.lineTo(px + 9, py - 3 + bob); ctx.lineTo(px + 11 + sway, py + 9 + bob); ctx.lineTo(px - 11 + sway, py + 9 + bob); ctx.closePath(); ctx.fill();
    pattern(ctx, 'stripes', px - 11, py - 3 + bob, 22, 13, '#facc15', '#16a34a');
    ctx.save(); ctx.beginPath(); ctx.moveTo(px - 9.6, top); ctx.lineTo(px - 4, top); ctx.lineTo(px + 10, py + 1 + bob); ctx.lineTo(px + 10, py - 4 + bob); ctx.closePath(); ctx.clip();
    for (let k = 0; k < 8; k++) { ctx.fillStyle = ['#facc15', '#dc2626', '#16a34a', '#111827'][k % 4]; ctx.fillRect(px - 11 + k * 3.2, top - 2, 3.2, 18); }
    ctx.restore();
  } else if (o === 16) { // overalls
    ctx.fillStyle = a.pants; rr(ctx, px - 6.4, py - 6 + bob, 12.8, 10, 2); ctx.fill();
    for (const s of [-1, 1]) { ctx.fillRect(px + s * 5 - 1, top, 2, 6); }
    if (!back) { disc(ctx, px - 5, py - 5 + bob, 0.9, gold); disc(ctx, px + 5, py - 5 + bob, 0.9, gold); rr(ctx, px - 2.6, py - 3.4 + bob, 5.2, 3.2, 0.8); ctx.strokeStyle = shade(a.pants, -0.3); ctx.lineWidth = 0.7; ctx.stroke(); }
    for (const s of [-1, 1]) { rr(ctx, px + (s < 0 ? -6.4 : 0.2), py + 2 + bob, 6.2, 9, 2); ctx.fillStyle = a.pants; ctx.fill(); }
  } else if (o === 17) { // a lab coat
    ctx.fillStyle = '#f8fafc'; ctx.beginPath(); ctx.moveTo(px - 9.6, top); ctx.lineTo(px + 9.6, top); ctx.lineTo(px + 11 + sway, py + 8 + bob); ctx.lineTo(px - 11 + sway, py + 8 + bob); ctx.closePath(); ctx.fill();
    if (!back) {
      ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(px - 3.6, top); ctx.lineTo(px + 3.6, top); ctx.lineTo(px + 1, py + 6 + bob); ctx.lineTo(px - 1, py + 6 + bob); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#cbd5e1'; ctx.lineWidth = 0.9; ctx.beginPath(); ctx.moveTo(px - 3.6, top); ctx.lineTo(px - 1, py + 6 + bob); ctx.moveTo(px + 3.6, top); ctx.lineTo(px + 1, py + 6 + bob); ctx.stroke();
      rr(ctx, px + 4.6, py - 5 + bob, 3.8, 3.6, 0.8); ctx.stroke(); ctx.fillStyle = '#2563eb'; ctx.fillRect(px + 5.4, py - 6 + bob, 0.8, 2); ctx.fillStyle = '#ef4444'; ctx.fillRect(px + 6.8, py - 6 + bob, 0.8, 2);
    }
    for (const s of [-1, 1]) { ctx.fillStyle = '#f1f5f9'; ctx.fillRect(px + s * 10.5 - 2.4, py - 9 + bob, 4.8, 9.5); }
  }
}
