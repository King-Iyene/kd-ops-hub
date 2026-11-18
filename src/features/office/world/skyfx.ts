import type { Season, SkyState } from './sky';

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
    ctx.fillStyle = `rgba(222,196,150,${(0.13 + 0.03 * Math.sin(t / 3000)).toFixed(3)})`;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(240,222,186,0.32)';
    for (let i = 0; i < 70; i++) {
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
