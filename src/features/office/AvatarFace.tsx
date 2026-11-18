import { useEffect, useRef } from 'react';
import type { AvatarStyle } from './world/types';
import { TILE, drawPerson } from './world/render';

/** A round picture of someone's avatar (head and shoulders), drawn with the same code as the office. */
export function AvatarFace({ avatar, size = 28, dim = false }: { avatar: AvatarStyle; size?: number; dim?: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    const ctx = c?.getContext('2d');
    if (!c || !ctx) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = size * dpr;
    c.height = size * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size, size);
    const k = size / 27;
    ctx.save();
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = 'rgba(148,163,184,0.28)';
    ctx.fillRect(0, 0, size, size);
    ctx.scale(k, k);
    try { drawPerson(ctx, { x: 13.5 / TILE, y: (14.5 + 17) / TILE, dir: 0, moving: false, name: '', avatar, isMe: false }, 0, { dark: false }); } catch { /* stays blank */ }
    ctx.restore();
  }, [avatar, size]);
  return <canvas ref={ref} style={{ width: size, height: size, opacity: dim ? 0.5 : 1, filter: dim ? 'grayscale(0.7)' : undefined }} className="shrink-0 rounded-full" />;
}
