import { useEffect, useRef } from 'react';

/**
 * Particle burst — call burst({ x, y }) and watch a brief shower of TOD-glow
 * particles erupt from the click point. Uses Canvas for smooth performance,
 * tears down after a single frame loop. Skipped under prefers-reduced-motion.
 */
let canvas: HTMLCanvasElement | null = null;
let ctx: CanvasRenderingContext2D | null = null;
let particles: Particle[] = [];
let raf: number | null = null;
let resizeListenerAttached = false;

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  hue: number;
  size: number;
}

function ensureCanvas() {
  if (canvas && ctx) return;
  canvas = document.createElement('canvas');
  canvas.style.position = 'fixed';
  canvas.style.inset = '0';
  canvas.style.pointerEvents = 'none';
  canvas.style.zIndex = '9999';
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  ctx = canvas.getContext('2d');
  document.body.appendChild(canvas);

  // Registered once for the module's lifetime — canvas is torn down and
  // recreated between bursts (see loop()'s teardown branch), but the resize
  // handler doesn't need to be; re-registering a new closure on every burst
  // leaked one listener per burst cycle for the life of the page.
  if (!resizeListenerAttached) {
    resizeListenerAttached = true;
    window.addEventListener('resize', () => {
      if (!canvas) return;
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    });
  }
}

function loop() {
  if (!ctx || !canvas) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  particles = particles.filter((p) => p.life < p.maxLife);

  for (const p of particles) {
    p.life += 1;
    p.x += p.vx;
    p.y += p.vy;
    p.vy += 0.18; // gravity
    p.vx *= 0.99;
    const t = p.life / p.maxLife;
    const alpha = 1 - t;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size * (1 - t * 0.4), 0, Math.PI * 2);
    ctx.fillStyle = `hsla(${p.hue}, 100%, 60%, ${alpha})`;
    ctx.shadowBlur = 8;
    ctx.shadowColor = `hsla(${p.hue}, 100%, 60%, ${alpha * 0.8})`;
    ctx.fill();
  }
  ctx.shadowBlur = 0;

  if (particles.length > 0) {
    raf = requestAnimationFrame(loop);
  } else {
    raf = null;
    // Tear down canvas to free memory between bursts.
    canvas?.remove();
    canvas = null;
    ctx = null;
  }
}

/**
 * Trigger a celebration burst at a screen-space coordinate. Optional palette
 * controls the hue range — defaults to brand cyan / gold mix.
 */
export function burst(opts?: {
  x?: number;
  y?: number;
  count?: number;
  palette?: 'brand' | 'success' | 'gold' | 'rainbow';
}) {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduced) return;

  const x = opts?.x ?? window.innerWidth / 2;
  const y = opts?.y ?? window.innerHeight / 2;
  const count = opts?.count ?? 60;
  const palette = opts?.palette ?? 'brand';

  ensureCanvas();

  const hueFor = (i: number): number => {
    if (palette === 'success') return 140 + (i % 3) * 8;        // greens
    if (palette === 'gold')    return 38 + (i % 4) * 6;         // golds
    if (palette === 'rainbow') return (i * 360 / count) | 0;
    return [186, 200, 41][i % 3];                               // brand: cyan, primary, gold
  };

  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 4 + Math.random() * 7;
    particles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 2,
      life: 0,
      maxLife: 60 + Math.random() * 30,
      hue: hueFor(i),
      size: 2 + Math.random() * 2.5,
    });
  }

  if (!raf) raf = requestAnimationFrame(loop);
}

/**
 * Hook variant — returns a function you can call after a successful action.
 * Pass an Element to derive the burst origin from its bounding rect.
 */
export function useBurst() {
  const lastCallRef = useRef(0);
  return (target?: Element | { x: number; y: number } | null, palette?: 'brand' | 'success' | 'gold' | 'rainbow') => {
    // Throttle to 1 burst per 400ms per hook instance.
    const now = Date.now();
    if (now - lastCallRef.current < 400) return;
    lastCallRef.current = now;

    if (!target) return burst({ palette });
    if ('x' in target && 'y' in target) return burst({ x: target.x, y: target.y, palette });
    const r = (target as Element).getBoundingClientRect();
    burst({ x: r.left + r.width / 2, y: r.top + r.height / 2, palette });
  };
}
