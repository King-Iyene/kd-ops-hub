import type { MapDef } from './types';
import type { Season, SkyState } from './sky';

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
    ctx.fillStyle = `rgba(214,184,132,${(0.2 + 0.04 * Math.sin(t / 3000)).toFixed(3)})`;
    ctx.fillRect(0, 0, w, h);
    // slow banks of dusty fog drifting through (things stay visible)
    for (let i = 0; i < 4; i++) {
      const cx = (((i * 311 + t * (0.01 + i * 0.004)) % (w + 400)) + w + 400) % (w + 400) - 200;
      const cy = (i * 0.27 + 0.16) * h + Math.sin(t / 5000 + i) * 30;
      const r = 220 + i * 60;
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      g.addColorStop(0, 'rgba(236,214,172,0.20)');
      g.addColorStop(1, 'rgba(236,214,172,0)');
      ctx.fillStyle = g;
      ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    }
    ctx.fillStyle = 'rgba(244,226,190,0.5)';
    for (let i = 0; i < 130; i++) {
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
