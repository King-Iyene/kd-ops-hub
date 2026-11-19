import type { MapDef } from './types';
import { dayLook, type Season, type SkyState } from './sky';

const TILE = 36;
const hash = (a: number, b: number) => { const v = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return v - Math.floor(v); };

const floorGrids = new WeakMap<MapDef, string[][]>();
function floors(map: MapDef): string[][] {
  let g = floorGrids.get(map);
  if (g) return g;
  g = Array.from({ length: map.h }, () => Array<string>(map.w).fill(''));
  for (const z of map.zones) {
    if (!z.floor) continue;
    for (let y = z.y; y < z.y + z.h && y < map.h; y++) for (let x = z.x; x < z.x + z.w && x < map.w; x++) g[y][x] = z.floor;
  }
  for (const [k, v] of Object.entries(map.floorOverrides ?? {})) {
    const [x, y] = k.split(',').map(Number);
    if (y >= 0 && y < map.h && x >= 0 && x < map.w) g[y][x] = v;
  }
  floorGrids.set(map, g);
  return g;
}

/**
 * The weather on the ground itself (drawn in the map, under the furniture): in the Harmattan the grass dries to dusty brown
 * ground full of cracks and a film of dust settles indoors; in the rains the ground goes dark and wet with puddles that ripple.
 */
export function drawGroundWeather(ctx: CanvasRenderingContext2D, map: MapDef, season: Season, rain: number, t: number) {
  if (season === 'clear') return;
  const grid = floors(map);
  for (let y = 0; y < map.h; y++) {
    for (let x = 0; x < map.w; x++) {
      if (map.walls[y][x]) continue;
      const f = grid[y][x];
      if (!f) continue;
      const px = x * TILE;
      const py = y * TILE;
      if (season === 'harmattan') {
        if (f === 'grass') {
          // dry, bare earth with cracks
          ctx.fillStyle = 'rgba(168,128,72,0.62)';
          ctx.fillRect(px, py, TILE, TILE);
          ctx.strokeStyle = 'rgba(70,44,20,0.65)';
          ctx.lineWidth = 1.1;
          const n = 1 + Math.floor(hash(x, y) * 2.5);
          for (let i = 0; i < n; i++) {
            let cx = px + hash(x + i, y * 3) * TILE;
            let cy = py + hash(x * 3, y + i) * TILE;
            ctx.beginPath();
            ctx.moveTo(cx, cy);
            for (let k = 0; k < 4; k++) {
              cx += (hash(x + k, y + i * 7) - 0.5) * 14;
              cy += (hash(x + i * 5, y + k) - 0.2) * 10;
              ctx.lineTo(cx, cy);
              if (k === 1) { ctx.moveTo(cx, cy); ctx.lineTo(cx + (hash(i, k + x) - 0.5) * 12, cy + 7); ctx.moveTo(cx, cy); }
            }
            ctx.stroke();
          }
        } else {
          ctx.fillStyle = 'rgba(222,196,150,0.14)';
          ctx.fillRect(px, py, TILE, TILE);
          if (hash(x * 2, y * 5) > 0.82) {
            ctx.strokeStyle = 'rgba(120,92,56,0.28)';
            ctx.lineWidth = 0.8;
            ctx.beginPath();
            ctx.moveTo(px + hash(x, y) * TILE, py + 2);
            ctx.lineTo(px + hash(y, x) * TILE, py + TILE - 3);
            ctx.stroke();
          }
        }
      } else if (season === 'rainy') {
        ctx.fillStyle = f === 'grass' ? `rgba(20,70,45,${(0.18 + rain * 0.14).toFixed(3)})` : `rgba(40,66,100,${(0.1 + rain * 0.16).toFixed(3)})`;
        ctx.fillRect(px, py, TILE, TILE);
        if (rain > 0.12 && hash(x * 7, y * 3) > 0.78) {
          // a puddle with rings spreading across it
          const cx = px + 8 + hash(x, y * 2) * 20;
          const cy = py + 10 + hash(x * 2, y) * 18;
          ctx.fillStyle = `rgba(120,160,205,${(0.3 + rain * 0.3).toFixed(3)})`;
          ctx.beginPath();
          ctx.ellipse(cx, cy, 12, 6, 0, 0, Math.PI * 2);
          ctx.fill();
          const age = ((t / 900 + hash(x, y) * 4) % 1);
          ctx.strokeStyle = `rgba(235,245,255,${((1 - age) * 0.6 * rain).toFixed(3)})`;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.ellipse(cx, cy, 2 + age * 9, 1 + age * 4.5, 0, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
    }
  }
}

/**
 * What the weather and the hour do to the picture: a blue tint at night, an orange glow at sunrise and sunset,
 * dusty haze and drifting dust in the Harmattan, grey light and falling rain in the rainy season (with a flash of
 * lightning now and then). Drawn on top of the whole view.
 */
export function drawSky(ctx: CanvasRenderingContext2D, w: number, h: number, sky: SkyState, season: Season, rain: number, flash: number, t: number) {
  // the look of the day: cool fresh morning, bright neutral midday, warm golden afternoon, with the sun's glow moving across
  if (sky.light > 0.05) {
    const look = dayLook(sky.hour);
    if (look.cool > 0.01) {
      ctx.fillStyle = `rgba(150,200,255,${(0.11 * look.cool * sky.light).toFixed(3)})`;
      ctx.fillRect(0, 0, w, h);
    }
    if (look.gold > 0.01) {
      ctx.fillStyle = `rgba(255,185,90,${(0.16 * look.gold * sky.light).toFixed(3)})`;
      ctx.fillRect(0, 0, w, h);
    }
    if (look.elevation > 0.02) {
      const sx = w * (0.08 + 0.84 * look.sunSide);
      const r = Math.max(w, h) * 0.8;
      const g = ctx.createRadialGradient(sx, -h * 0.1, 0, sx, -h * 0.1, r);
      const warm = Math.max(look.gold, 1 - look.elevation);
      g.addColorStop(0, `rgba(${255},${Math.round(250 - 40 * warm)},${Math.round(225 - 90 * warm)},${(0.22 * look.elevation * sky.light).toFixed(3)})`);
      g.addColorStop(1, 'rgba(255,240,200,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    }
    if (look.bloom > 0.02) {
      ctx.fillStyle = `rgba(255,255,248,${(0.06 * look.bloom).toFixed(3)})`;
      ctx.fillRect(0, 0, w, h);
    }
  }

  // the hour
  const night = 1 - sky.light;
  if (night > 0.01) {
    ctx.fillStyle = `rgba(12,20,60,${(night * 0.3).toFixed(3)})`;
    ctx.fillRect(0, 0, w, h);
  }
  if (sky.warm > 0.02) {
    ctx.fillStyle = `rgba(255,150,60,${(sky.warm * 0.16).toFixed(3)})`;
    ctx.fillRect(0, 0, w, h);
  }

  if (season === 'harmattan') {
    // dry, dusty haze that dulls the colours, with dust drifting across
    ctx.fillStyle = `rgba(214,184,132,${(0.06 + 0.015 * Math.sin(t / 3000)).toFixed(3)})`;
    ctx.fillRect(0, 0, w, h);
    // slow banks of dusty fog drifting through (things stay visible)
    for (let i = 0; i < 3; i++) {
      const cx = (((i * 311 + t * (0.01 + i * 0.004)) % (w + 400)) + w + 400) % (w + 400) - 200;
      const cy = (i * 0.27 + 0.16) * h + Math.sin(t / 5000 + i) * 30;
      const r = 220 + i * 60;
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      g.addColorStop(0, 'rgba(236,214,172,0.06)');
      g.addColorStop(1, 'rgba(236,214,172,0)');
      ctx.fillStyle = g;
      ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    }
    ctx.fillStyle = 'rgba(244,226,190,0.32)';
    for (let i = 0; i < 60; i++) {
      const speed = 0.012 + (i % 5) * 0.006;
      const x = (((i * 97.3 + t * speed) % (w + 40)) + w + 40) % (w + 40) - 20;
      const y = ((i * 53.7) % h) + Math.sin(t / 1600 + i) * 7;
      const r = 0.8 + (i % 4) * 0.45;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  if (season === 'rainy' && rain > 0.02) {
    ctx.fillStyle = `rgba(66,88,122,${(0.06 + rain * 0.14).toFixed(3)})`;
    ctx.fillRect(0, 0, w, h);
    const n = Math.floor(40 + rain * 190);
    ctx.strokeStyle = `rgba(200,220,245,${(0.18 + rain * 0.25).toFixed(3)})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const fall = 0.55 + (i % 5) * 0.09;
      const y = (((i * 131.7 + t * fall) % (h + 40)) + h + 40) % (h + 40) - 20;
      const x = ((i * 89.3) % (w + 80)) - 40 + y * 0.12;
      ctx.moveTo(x, y);
      ctx.lineTo(x - 2.4, y + 12 + (i % 3) * 3);
    }
    ctx.stroke();
  }

  if (flash > 0.01) {
    ctx.fillStyle = `rgba(232,238,255,${(flash * 0.5).toFixed(3)})`;
    ctx.fillRect(0, 0, w, h);
  }
}

/**
 * Birds flying across the office now and then in daylight: a small V of birds that flaps its way from one side to the
 * other, with a second flock out of step with the first. They stay away when it rains or is dark.
 */
export function drawBirds(ctx: CanvasRenderingContext2D, w: number, h: number, light: number, rain: number, t: number) {
  if (light < 0.45 || rain > 0.3) return;
  const flocks = [{ period: 47000, off: 0, y: 0.2, n: 5, dir: 1 }, { period: 61000, off: 23000, y: 0.55, n: 4, dir: -1 }];
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const f of flocks) {
    const ph = ((t + f.off) % f.period) / f.period;
    // on screen for the first half of each cycle
    if (ph > 0.5) continue;
    const prog = ph / 0.5;
    const fade = Math.min(1, prog * 8, (1 - prog) * 8);
    const baseX = f.dir > 0 ? -60 + prog * (w + 120) : w + 60 - prog * (w + 120);
    const baseY = f.y * h + Math.sin(prog * 7) * 14;
    for (let i = 0; i < f.n; i++) {
      const row = Math.ceil(i / 2);
      const side = i % 2 ? 1 : -1;
      const bx = baseX - f.dir * row * 22;
      const by = baseY + side * row * 11 + (i === 0 ? 0 : 0);
      const flap = Math.sin(t / 130 + i * 0.9) * 5;
      ctx.strokeStyle = `rgba(30,41,59,${(0.55 * fade).toFixed(3)})`;
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.moveTo(bx - 8, by - flap * 0.3);
      ctx.quadraticCurveTo(bx - 3, by - 3 - flap, bx, by);
      ctx.quadraticCurveTo(bx + 3, by - 3 - flap, bx + 8, by - flap * 0.3);
      ctx.stroke();
      // a soft shadow on the ground far below
      ctx.fillStyle = `rgba(15,23,42,${(0.06 * fade).toFixed(3)})`;
      ctx.beginPath();
      ctx.ellipse(bx, by + 60, 7, 2.4, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}
