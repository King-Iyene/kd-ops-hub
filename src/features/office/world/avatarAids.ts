import type { Pose } from './avatarParts';

type Ctx = CanvasRenderingContext2D;

/** What each mobility aid does to walking: how fast the person can go. */
export const AID_SPEED = [1, 0.9, 0.7, 0.85];

function rrect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** A plaster cast on a lower leg: white, a band at the top, a few scribbles from friends. */
export function castOnLeg(ctx: Ctx, x: number, y: number, w: number, h: number) {
  ctx.fillStyle = '#f8fafc';
  rrect(ctx, x, y, w, h, Math.min(2.2, w / 2));
  ctx.fill();
  ctx.strokeStyle = '#cbd5e1';
  ctx.lineWidth = 0.7;
  ctx.stroke();
  // the rolled edge at the top
  ctx.fillStyle = '#e2e8f0';
  ctx.fillRect(x + 0.4, y + 0.4, w - 0.8, 1.3);
  // scribbles
  ctx.strokeStyle = '#60a5fa';
  ctx.lineWidth = 0.7;
  ctx.beginPath();
  ctx.moveTo(x + 1.2, y + h * 0.45);
  ctx.lineTo(x + w * 0.6, y + h * 0.38);
  ctx.lineTo(x + w - 1.2, y + h * 0.5);
  ctx.stroke();
  ctx.fillStyle = '#ef4444';
  ctx.beginPath();
  ctx.arc(x + w * 0.35, y + h * 0.72, 0.9, 0, Math.PI * 2);
  ctx.arc(x + w * 0.62, y + h * 0.72, 0.9, 0, Math.PI * 2);
  ctx.fill();
}

/** A walking stick or a pair of crutches, held while standing or walking. 1 is a stick, 2 is crutches. */
export function drawStandingAid(ctx: Ctx, aid: number, P: Pose, skin: string) {
  const { px, py, bob, fx, side, back, moving, step } = P;
  const ground = py + 11.6;
  if (aid === 1) {
    // a wooden stick with a curved handle, planted a little ahead on every other step
    const cs = side ? fx : 1;
    const hx = side ? px + fx * 8.5 + (moving ? step * fx * 3 : 0) : px + 11;
    const top = py - 0.5 + bob * 0.5;
    const lift = moving && step > 0.4 ? 1.6 : 0;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#8b5a2b';
    ctx.lineWidth = 1.9;
    ctx.beginPath();
    ctx.moveTo(hx, ground - lift);
    ctx.lineTo(hx, top);
    ctx.stroke();
    ctx.strokeStyle = '#6b4423';
    ctx.lineWidth = 2.1;
    ctx.beginPath();
    ctx.arc(hx - cs * 1.9, top, 1.9, cs > 0 ? Math.PI : 0, cs > 0 ? Math.PI * 2 : Math.PI, cs < 0);
    ctx.stroke();
    ctx.lineCap = 'butt';
    ctx.fillStyle = '#1f2937';
    ctx.fillRect(hx - 1.2, ground - lift - 1.1, 2.4, 1.3);
    // the hand holding it
    ctx.fillStyle = skin;
    ctx.beginPath();
    ctx.arc(hx - cs * 0.4, top + 1.2, 1.7, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  // crutches: a pad under each arm, a grip at the hip, a rubber foot on the ground
  const draw = (topX: number, footX: number, grip: number) => {
    const topY = py - 8 + bob;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#9ca3af';
    ctx.lineWidth = 1.7;
    ctx.beginPath();
    ctx.moveTo(topX, topY);
    ctx.lineTo(footX, ground);
    ctx.stroke();
    ctx.lineCap = 'butt';
    // arm pad
    ctx.fillStyle = '#374151';
    ctx.save();
    ctx.translate(topX, topY);
    ctx.rotate((footX - topX) * -0.04);
    ctx.fillRect(-2.4, -1.1, 4.8, 2.2);
    ctx.restore();
    // hand grip, at about hip height along the shaft
    const gx = topX + (footX - topX) * grip;
    const gy = topY + (ground - topY) * grip;
    ctx.strokeStyle = '#4b5563';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(gx - 1.6, gy);
    ctx.lineTo(gx + 1.6, gy);
    ctx.stroke();
    ctx.fillStyle = skin;
    ctx.beginPath();
    ctx.arc(gx, gy, 1.7, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#111827';
    ctx.fillRect(footX - 1.1, ground - 1, 2.2, 1.2);
  };
  if (side) {
    const swing = moving ? step * fx * 3.2 : 0;
    draw(px + fx * 2.5, px + fx * 8.5 + swing, 0.5);
  } else {
    const swing = moving && !back ? step * 2.2 : 0;
    draw(px - 6.6, px - 10.4 - swing * 0.3, 0.52);
    draw(px + 6.6, px + 10.4 + swing * 0.3, 0.52);
  }
}

type View = 'front' | 'side' | 'back';

function wheel(ctx: Ctx, cx: number, cy: number, r: number, roll: number, view: View) {
  if (view === 'side') {
    ctx.strokeStyle = '#111827';
    ctx.lineWidth = 1.7;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = '#9ca3af';
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    ctx.arc(cx, cy, r - 1.6, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 0.6;
    for (let k = 0; k < 6; k++) {
      const an = roll + (k * Math.PI) / 3;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(an) * (r - 1.6), cy + Math.sin(an) * (r - 1.6));
      ctx.stroke();
    }
    ctx.fillStyle = '#475569';
    ctx.beginPath();
    ctx.arc(cx, cy, 1.4, 0, Math.PI * 2);
    ctx.fill();
  } else {
    // seen from the front or back a big wheel is a thin upright ring; the spokes flicker as it turns
    ctx.fillStyle = '#111827';
    ctx.beginPath();
    ctx.ellipse(cx, cy, 1.9, r, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#9ca3af';
    ctx.beginPath();
    ctx.ellipse(cx, cy, 0.8, r - 1.4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#e5e7eb';
    ctx.fillRect(cx - 0.5, cy + Math.sin(roll) * (r - 2.4) - 0.5, 1, 1);
    ctx.fillRect(cx - 0.5, cy - Math.sin(roll) * (r - 2.4) - 0.5, 1, 1);
  }
}

/** The part of a wheelchair that is behind the person. */
export function drawWheelchairUnder(ctx: Ctx, px: number, py: number, view: View, face: number) {
  if (view === 'back') return;
  ctx.fillStyle = '#334155';
  if (view === 'side') {
    // the backrest and the push handle, on the side away from the way they face
    rrect(ctx, px - face * 8.6 - 1.2, py - 13, 2.4, 16, 1);
    ctx.fill();
    ctx.strokeStyle = '#1f2937';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(px - face * 8.6, py - 13);
    ctx.lineTo(px - face * 12.4, py - 13.6);
    ctx.stroke();
  } else {
    rrect(ctx, px - 8.6, py - 12, 17.2, 15, 2);
    ctx.fill();
  }
}

/** The part of a wheelchair in front of the person: seat, arms, wheels, footrests, and the feet and legs resting on them. */
export function drawWheelchairOver(
  ctx: Ctx, px: number, py: number, view: View, face: number, roll: number,
  look: { skin: string; pants: string; shoeColor: string }, cast: boolean,
) {
  const seat = '#1e293b';
  if (view === 'side') {
    // the lower leg, going forward and down to the footrest
    const x0 = px + face * 3;
    const y0 = py + 3;
    const x1 = px + face * 9.6;
    const y1 = py + 9.6;
    ctx.lineCap = 'round';
    ctx.strokeStyle = look.skin;
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();
    ctx.strokeStyle = look.pants;
    ctx.lineWidth = 5.2;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x0 + (x1 - x0) * 0.45, y0 + (y1 - y0) * 0.45);
    ctx.stroke();
    ctx.lineCap = 'butt';
    if (cast) {
      ctx.save();
      ctx.translate(x0 + (x1 - x0) * 0.4, y0 + (y1 - y0) * 0.4);
      ctx.rotate(Math.atan2(y1 - y0, x1 - x0) - Math.PI / 2);
      castOnLeg(ctx, -2.8, -1, 5.6, 8.6);
      ctx.restore();
    }
    ctx.fillStyle = look.shoeColor;
    rrect(ctx, Math.min(x1, x1 + face * 3.6) - (face > 0 ? 1.6 : 0), y1 + 0.4, 5.6, 2.6, 1.2);
    ctx.fill();
    // seat, leg rest and footplate
    ctx.fillStyle = seat;
    rrect(ctx, px - 8, py + 2.2, 15, 2.4, 1.2);
    ctx.fill();
    ctx.strokeStyle = '#475569';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(px + face * 5, py + 4);
    ctx.lineTo(px + face * 9.2, py + 11.4);
    ctx.stroke();
    ctx.fillStyle = '#334155';
    ctx.fillRect(Math.min(px + face * 8, px + face * 12.4), py + 11.4, 4.6, 1.2);
    // the armrest
    ctx.strokeStyle = '#111827';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(px - face * 5, py - 4);
    ctx.lineTo(px + face * 3, py - 4);
    ctx.stroke();
    // a small front caster and the big wheel
    wheel(ctx, px + face * 10.4, py + 9.6, 2.2, roll * 3, 'side');
    wheel(ctx, px - face * 1.4, py + 4.6, 7, roll, 'side');
    return;
  }
  // front and back: two feet on two footplates, the cast on the right one
  const fy = py + 6.4;
  if (view === 'front') {
    for (const [i, sx] of [-4.6, 4.6].entries()) {
      ctx.fillStyle = look.skin;
      ctx.fillRect(px + sx - 2.5, py + 2.6, 5, 6.4);
      ctx.fillStyle = look.pants;
      ctx.fillRect(px + sx - 2.6, py + 2.6, 5.2, 4);
      if (cast && i === 1) castOnLeg(ctx, px + sx - 3.1, py + 4.2, 6.2, 6.6);
      ctx.fillStyle = look.shoeColor;
      rrect(ctx, px + sx - 3.2, fy + 3.6, 6.4, 2.8, 1.2);
      ctx.fill();
      ctx.fillStyle = '#334155';
      ctx.fillRect(px + sx - 3.8, fy + 6.4, 7.6, 1.1);
    }
  }
  // the seat, the arms and the backrest (seen from behind it hides the person's back)
  ctx.fillStyle = seat;
  rrect(ctx, px - 8.8, py + 2.2, 17.6, 2.4, 1.2);
  ctx.fill();
  if (view === 'back') {
    ctx.fillStyle = '#334155';
    rrect(ctx, px - 8.8, py - 12, 17.6, 15, 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.fillRect(px - 7.4, py - 10.4, 3, 12);
    ctx.strokeStyle = '#111827';
    ctx.lineWidth = 1.7;
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(px + s * 8.2, py - 12);
      ctx.lineTo(px + s * 11, py - 14.6);
      ctx.stroke();
    }
  } else {
    ctx.strokeStyle = '#111827';
    ctx.lineWidth = 1.6;
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(px + s * 9.4, py - 4.4);
      ctx.lineTo(px + s * 9.4, py + 3);
      ctx.stroke();
    }
  }
  for (const s of [-1, 1]) wheel(ctx, px + s * 12.4, py + 4.4, 7.2, roll * (s < 0 ? 1 : -1), view);
}
