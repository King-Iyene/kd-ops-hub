// The moving light of the sci-fi rooms (the Executive Wing, the lounge and the agents' boardroom): a slow glow, neon strips along the walls,
// a band of light that sweeps across the floor, and a ring of light under every executive's chair. It is drawn over the floor and under the
// furniture and people. Cheap on purpose: a few gradients, no shadow blur.

import { TILE } from './render';
import { DESK_SLOTS } from './wing';
import type { MapDef } from './types';

type Ctx = CanvasRenderingContext2D;
interface View { x0: number; y0: number; x1: number; y1: number }

export function drawSciFiGlow(ctx: Ctx, map: MapDef, nowMs: number, view?: View): void {
  const zones = map.zones.filter((z) => z.floor === 'scifi');
  if (zones.length === 0) return;
  const pulse = 0.5 + 0.5 * Math.sin(nowMs / 1400);
  for (const z of zones) {
    if (view && (z.x + z.w < view.x0 || z.x > view.x1 || z.y + z.h < view.y0 || z.y > view.y1)) continue;
    const px = z.x * TILE, py = z.y * TILE, pw = z.w * TILE, ph = z.h * TILE;
    ctx.save();
    ctx.beginPath();
    ctx.rect(px, py, pw, ph);
    ctx.clip();

    // the room breathes: a faint cyan wash
    ctx.fillStyle = `rgba(34,211,238,${0.045 + 0.03 * pulse})`;
    ctx.fillRect(px, py, pw, ph);

    // neon strips along the top and bottom edges (where the walls are)
    for (const top of [true, false]) {
      const y0 = top ? py : py + ph - 10;
      const g = ctx.createLinearGradient(0, top ? y0 : y0 + 10, 0, top ? y0 + 10 : y0);
      g.addColorStop(0, `rgba(56,189,248,${0.34 + 0.16 * pulse})`);
      g.addColorStop(1, 'rgba(56,189,248,0)');
      ctx.fillStyle = g;
      ctx.fillRect(px, y0, pw, 10);
      ctx.fillStyle = `rgba(165,243,252,${0.55 + 0.3 * pulse})`;
      ctx.fillRect(px, top ? py : py + ph - 2, pw, 2);
    }

    // a band of light that sweeps across the floor
    const span = pw + 360;
    const bx = px - 180 + ((nowMs / 36) % span);
    const band = ctx.createLinearGradient(bx - 90, 0, bx + 90, 0);
    band.addColorStop(0, 'rgba(125,211,252,0)');
    band.addColorStop(0.5, 'rgba(125,211,252,0.10)');
    band.addColorStop(1, 'rgba(125,211,252,0)');
    ctx.fillStyle = band;
    ctx.fillRect(bx - 90, py, 180, ph);

    // under every chair of the wing: a slowly turning ring of light, like a small projector
    if (z.id === 'execwing') {
      for (const d of DESK_SLOTS) {
        const cx = (d.x + 1.5) * TILE, cy = (d.y + 1.5) * TILE + 8;
        const rx = TILE * 0.78, ry = TILE * 0.42;
        ctx.fillStyle = 'rgba(34,211,238,0.12)';
        ctx.beginPath();
        ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = `rgba(103,232,249,${0.4 + 0.25 * pulse})`;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.ellipse(cx, cy, rx * 0.86, ry * 0.86, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    ctx.restore();
  }
}
