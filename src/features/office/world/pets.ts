import { advance } from './world';

/**
 * The office pets. Each dog or cat in the office is alive on your screen: it wanders about its spot, comes when you call,
 * follows you until you tell it to stay, and a dog will fetch a ball. (Pets are the same kind of thing for everyone, but what
 * each one is doing is on your screen only.) Pure logic, so it is unit tested.
 */
export type PetKind = 'dog' | 'cat';
export type PetMode = 'wander' | 'follow' | 'fetch' | 'return';

export const PET_NAMES: Record<PetKind, string> = { dog: 'Suya', cat: 'Zobo' };

export interface Ball { x: number; y: number; fromX: number; fromY: number; thrownAt: number }

export interface PetState {
  id: string;
  kind: PetKind;
  x: number;
  y: number;
  /** where it likes to hang about */
  hx: number;
  hy: number;
  face: 1 | -1;
  moving: boolean;
  mode: PetMode;
  tx: number;
  ty: number;
  /** seconds to rest before wandering again */
  wait: number;
  ball: Ball | null;
  carrying: boolean;
  /** shows hearts until this time (ms) */
  happyUntil: number;
  stuck: number;
}

export type PetCmd =
  | { kind: 'pet'; id: string }
  | { kind: 'call'; id: string }
  | { kind: 'stay'; id: string }
  | { kind: 'ball'; id: string }
  | { kind: 'treat'; id: string };

/** The page drops commands here; the canvas picks them up on the next frame. */
export const petBus: { queue: PetCmd[] } = { queue: [] };

export function initPet(id: string, kind: PetKind, x: number, y: number): PetState {
  return { id, kind, x: x + 0.5, y: y + 0.5, hx: x + 0.5, hy: y + 0.5, face: 1, moving: false, mode: 'wander', tx: x + 0.5, ty: y + 0.5, wait: 1 + (x % 3), ball: null, carrying: false, happyUntil: 0, stuck: 0 };
}

const SPEED: Record<PetKind, { walk: number; run: number }> = { dog: { walk: 1.9, run: 4.2 }, cat: { walk: 1.4, run: 3 } };
const BALL_FLIGHT = 700;

function free(solid: boolean[][], x: number, y: number): boolean {
  const cy = Math.floor(y);
  const cx = Math.floor(x);
  return cy >= 0 && cy < solid.length && cx >= 0 && cx < (solid[0]?.length ?? 0) && !solid[cy][cx];
}

/** Where a thrown ball lands: a few tiles ahead of you, on the nearest open floor. */
export function ballLanding(solid: boolean[][], x: number, y: number, dir: 0 | 1 | 2 | 3): { x: number; y: number } {
  const dx = dir === 1 ? -1 : dir === 2 ? 1 : 0;
  const dy = dir === 3 ? -1 : dir === 0 ? 1 : 0;
  for (let d = 5; d >= 1; d--) {
    const bx = x + dx * d;
    const by = y + dy * d;
    if (free(solid, bx, by)) return { x: bx, y: by };
  }
  return { x, y };
}

/** Move a pet one step toward a point; returns true when it has got there. */
function walkTo(p: PetState, solid: boolean[][], tx: number, ty: number, speed: number, dt: number, stopAt: number): boolean {
  const dx = tx - p.x;
  const dy = ty - p.y;
  const d = Math.hypot(dx, dy);
  if (d <= stopAt) { p.moving = false; return true; }
  const vx = (dx / d) * speed;
  const vy = (dy / d) * speed;
  const next = advance(solid, p.x, p.y, vx, vy, dt);
  const gained = Math.hypot(next.x - p.x, next.y - p.y);
  p.stuck = gained < speed * dt * 0.25 ? p.stuck + dt : 0;
  p.x = next.x;
  p.y = next.y;
  p.moving = gained > 0.0005;
  if (Math.abs(vx) > 0.15) p.face = vx > 0 ? 1 : -1;
  return false;
}

export function stepPet(p: PetState, dt: number, now: number, me: { x: number; y: number }, solid: boolean[][], rand: () => number): void {
  const sp = SPEED[p.kind];
  if (p.mode === 'follow') {
    const d = Math.hypot(me.x - p.x, me.y - p.y);
    if (d > 30) { p.x = me.x; p.y = me.y + 1; return; }
    walkTo(p, solid, me.x, me.y, d > 5 ? sp.run : sp.walk * 1.5, dt, 1.5);
    return;
  }
  if (p.mode === 'fetch' && p.ball) {
    if (now - p.ball.thrownAt < BALL_FLIGHT) { p.moving = false; return; }
    if (walkTo(p, solid, p.ball.x, p.ball.y, sp.run, dt, 0.5) || p.stuck > 1.5) {
      p.carrying = p.stuck <= 1.5;
      p.ball = null;
      p.mode = 'return';
      p.stuck = 0;
    }
    return;
  }
  if (p.mode === 'return') {
    if (walkTo(p, solid, me.x, me.y, sp.run, dt, 1.4) || p.stuck > 2) {
      p.carrying = false;
      p.happyUntil = now + 2600;
      p.mode = 'wander';
      p.hx = p.x;
      p.hy = p.y;
      p.wait = 2;
      p.stuck = 0;
    }
    return;
  }
  // wandering about home
  if (p.wait > 0) { p.wait -= dt; p.moving = false; return; }
  if (walkTo(p, solid, p.tx, p.ty, sp.walk, dt, 0.15) || p.stuck > 1.2) {
    p.stuck = 0;
    p.wait = 1.2 + rand() * 4.5;
    for (let tries = 0; tries < 6; tries++) {
      const nx = p.hx + (rand() - 0.5) * 7;
      const ny = p.hy + (rand() - 0.5) * 5;
      if (free(solid, nx, ny)) { p.tx = nx; p.ty = ny; break; }
    }
  }
}

/** Apply a command from the menu. Returns what to show and say (hearts, sounds). */
export function applyPetCmd(p: PetState, cmd: PetCmd, now: number, me: { x: number; y: number; dir: 0 | 1 | 2 | 3 }, solid: boolean[][]): { hearts: boolean; sound: 'bark' | 'meow' | 'happy' | null } {
  const sound = p.kind === 'dog' ? 'bark' : 'meow';
  switch (cmd.kind) {
    case 'pet':
      p.happyUntil = now + 2600;
      return { hearts: true, sound };
    case 'treat':
      p.happyUntil = now + 3200;
      return { hearts: true, sound: 'happy' };
    case 'call':
      p.mode = p.mode === 'follow' ? 'wander' : 'follow';
      if (p.mode === 'wander') { p.hx = p.x; p.hy = p.y; p.wait = 1; }
      return { hearts: false, sound };
    case 'stay':
      p.mode = 'wander';
      p.hx = p.x;
      p.hy = p.y;
      p.tx = p.x;
      p.ty = p.y;
      p.wait = 4;
      return { hearts: false, sound: null };
    case 'ball': {
      const land = ballLanding(solid, me.x, me.y, me.dir);
      p.ball = { x: land.x, y: land.y, fromX: me.x, fromY: me.y - 0.6, thrownAt: now };
      p.mode = 'fetch';
      p.carrying = false;
      p.stuck = 0;
      return { hearts: false, sound };
    }
  }
}
