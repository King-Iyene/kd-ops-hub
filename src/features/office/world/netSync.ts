// The traffic budget. Supabase counts every live message, so the office must stay quiet:
//  - nothing is sent while a person stands still (no heartbeats; the presence feature does its own liveness);
//  - a message goes out only when they start, change direction or stop (others animate the walk themselves);
//  - one gentle correction every few seconds during a long uninterrupted walk;
//  - nothing at all while the tab is hidden.
// Kept pure so the numbers can be tested.

export interface Motion { x: number; y: number; vx: number; vy: number }
export interface SentMotion extends Motion { at: number }

export const CORRECTION_MS = 4000;

export type SendReason = 'first' | 'change' | 'stop' | 'correct';

export function sameDirection(a: Motion, b: Motion): boolean {
  return Math.sign(a.vx) === Math.sign(b.vx) && Math.sign(a.vy) === Math.sign(b.vy);
}

/** Should this moment produce a message, and why? null means stay quiet. */
export function shouldSend(prev: SentMotion | null, cur: Motion, now: number): SendReason | null {
  if (!prev) return 'first';
  const prevMoving = prev.vx !== 0 || prev.vy !== 0;
  const curMoving = cur.vx !== 0 || cur.vy !== 0;
  if (!curMoving) return prevMoving ? 'stop' : null;
  if (!prevMoving || !sameDirection(prev, cur)) return 'change';
  return now - prev.at >= CORRECTION_MS ? 'correct' : null;
}

/** Compact wire format: short keys, two decimals. */
export function pack(id: string, m: Motion, dir: number) {
  const r = (n: number) => Math.round(n * 100) / 100;
  return { i: id, x: r(m.x), y: r(m.y), vx: r(m.vx), vy: r(m.vy), d: dir };
}

export type Packed = ReturnType<typeof pack>;

/** Defensive read of a message from the network (another client could send anything). */
export function unpack(p: unknown): { id: string; x: number; y: number; vx: number; vy: number; dir: 0 | 1 | 2 | 3 } | null {
  if (!p || typeof p !== 'object') return null;
  const o = p as Record<string, unknown>;
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  const x = num(o.x);
  const y = num(o.y);
  const vx = num(o.vx);
  const vy = num(o.vy);
  const d = num(o.d);
  if (typeof o.i !== 'string' || o.i.length > 64 || x === null || y === null || vx === null || vy === null) return null;
  if (Math.abs(vx) > 10 || Math.abs(vy) > 10 || x < -2 || y < -2 || x > 500 || y > 500) return null;
  const dir = (d !== null && d >= 0 && d <= 3 ? Math.round(d) : 0) as 0 | 1 | 2 | 3;
  return { id: o.i, x, y, vx, vy, dir };
}
