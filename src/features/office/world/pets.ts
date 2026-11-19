import { advance, findPath } from './world';

/**
 * The office pets. Each dog or cat in the office is alive on your screen: it wanders about its spot, comes when you call,
 * follows you until you tell it to stay, and a dog will fetch a ball. (Pets are the same kind of thing for everyone, but what
 * each one is doing is on your screen only.) Pure logic, so it is unit tested.
 */
export type PetKind = 'dog' | 'cat';
export type PetMode = 'wander' | 'follow' | 'fetch' | 'return' | 'play';

const DOG_NAMES = ['Suya', 'Biscuit', 'Ranger', 'Jollof'];
const CAT_NAMES = ['Zobo', 'Mimi', 'Shadow', 'Pepper'];
/** Each pet has a name, fixed by which pet it is. */
export function petName(id: string, kind: PetKind): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  const list = kind === 'dog' ? DOG_NAMES : CAT_NAMES;
  return list[h % list.length];
}

/** The pets that are alive on this screen (the canvas keeps these up to date; the menu reads them). */
export const petRegistry = new Map<string, PetState>();

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
  /** which way it is looking: sideways, towards you (down the screen) or away (up it) */
  view: 'side' | 'front' | 'back';
  /** how fast it is going right now (tiles per second), so it speeds up and slows down smoothly */
  v: number;
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
  /** the pet it is playing with, and when the game ends (ms) */
  partner: string | null;
  playUntil: number;
  /** when it last made a little puff or sound while playing (ms) */
  fxAt: number;
  /** a way round furniture when walking straight at its goal gets it stuck */
  route: { x: number; y: number }[];
  routeGoal: { x: number; y: number } | null;
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
  return { id, kind, x: x + 0.5, y: y + 0.5, hx: x + 0.5, hy: y + 0.5, face: 1, view: 'side', v: 0, moving: false, mode: 'wander', tx: x + 0.5, ty: y + 0.5, wait: 1 + (x % 3), ball: null, carrying: false, happyUntil: 0, stuck: 0, partner: null, playUntil: 0, fxAt: 0, route: [], routeGoal: null };
}

// a pet can outrun its owner (4.5 tiles a second) so it never lags behind
const SPEED: Record<PetKind, { walk: number; run: number }> = { dog: { walk: 2.3, run: 5.6 }, cat: { walk: 1.7, run: 4.8 } };
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
  const goalX = tx, goalY = ty;
  const gd = Math.hypot(tx - p.x, ty - p.y);
  if (gd <= stopAt) { p.moving = false; p.v = 0; p.route = []; p.routeGoal = null; return true; }
  // blocked by a chair, a desk or a person-sized gap: find a way round, then follow it
  if (p.routeGoal && Math.hypot(p.routeGoal.x - goalX, p.routeGoal.y - goalY) > 2.2) { p.route = []; p.routeGoal = null; }
  if (!p.route.length && p.stuck > 0.3) {
    const path = findPath(solid, p.x, p.y, goalX, goalY);
    p.stuck = 0;
    if (path && path.length) { p.route = path.slice(0, 40); p.routeGoal = { x: goalX, y: goalY }; }
  }
  if (p.route.length) {
    if (Math.hypot(p.route[0].x - p.x, p.route[0].y - p.y) < 0.4) p.route.shift();
    if (p.route.length) { tx = p.route[0].x; ty = p.route[0].y; stopAt = 0.1; } else p.routeGoal = null;
  }
  const dx = tx - p.x;
  const dy = ty - p.y;
  const d = Math.hypot(dx, dy);
  if (d <= stopAt) { p.moving = false; p.v = 0; return !p.route.length; }
  // ease towards the wanted speed instead of jumping to it, and slow down as it arrives
  const want = Math.min(speed, Math.max(speed * 0.35, d * 2.6));
  p.v += (want - p.v) * Math.min(1, dt * 9);
  const vx = (dx / d) * p.v;
  const vy = (dy / d) * p.v;
  const next = advance(solid, p.x, p.y, vx, vy, dt);
  const gained = Math.hypot(next.x - p.x, next.y - p.y);
  p.stuck = gained < p.v * dt * 0.25 ? p.stuck + dt : 0;
  p.x = next.x;
  p.y = next.y;
  p.moving = gained > 0.0005;
  // it looks the way it is going: mostly up or down the screen shows its front or back, otherwise its side
  if (Math.abs(vy) > Math.abs(vx) * 1.25 && Math.abs(vy) > 0.3) p.view = vy > 0 ? 'front' : 'back';
  else if (Math.abs(vx) > 0.15) { p.view = 'side'; p.face = vx > 0 ? 1 : -1; }
  return false;
}

/** The spot beside and a little behind its owner where a following pet likes to be (a different side for each pet). */
export function heelPoint(p: PetState, me: { x: number; y: number; dir?: 0 | 1 | 2 | 3 }): { x: number; y: number } {
  const dir = me.dir ?? 0;
  const fx = dir === 1 ? -1 : dir === 2 ? 1 : 0;
  const fy = dir === 3 ? -1 : dir === 0 ? 1 : 0;
  let h = 0;
  for (let i = 0; i < p.id.length; i++) h = (h * 31 + p.id.charCodeAt(i)) >>> 0;
  const side = h % 2 ? 1 : -1;
  // a little behind, and off to one side
  return { x: me.x - fx * 1.1 + -fy * side * 0.8, y: me.y - fy * 1.1 + fx * side * 0.8 };
}

/** How long a game of chase lasts. */
export const PLAY_MS = 7000;

/**
 * A dog and a cat that are idle close to each other now and then start a game of chase: the dog chases the cat, then
 * they swap and the cat chases the dog, then they settle down again. (dt is the seconds since the last call.)
 */
export function playTick(pets: Iterable<PetState>, now: number, dt: number, rand: () => number): void {
  const list = [...pets].filter((p) => p.mode === 'wander' && !p.moving && p.wait > 0.4);
  const dogs = list.filter((p) => p.kind === 'dog');
  const cats = list.filter((p) => p.kind === 'cat');
  for (const d of dogs) {
    if (d.mode !== 'wander') continue;
    for (const c of cats) {
      if (c.mode !== 'wander') continue;
      if (Math.hypot(d.x - c.x, d.y - c.y) > 3.4) continue;
      if (rand() > 0.05 * dt) continue; // about one game in twenty seconds when they are together
      d.mode = 'play'; c.mode = 'play';
      d.partner = c.id; c.partner = d.id;
      d.playUntil = c.playUntil = now + PLAY_MS;
      d.stuck = c.stuck = 0;
      break;
    }
  }
}

function endPlay(p: PetState, now: number): void {
  p.mode = 'wander';
  p.partner = null;
  p.hx = p.x;
  p.hy = p.y;
  p.tx = p.x;
  p.ty = p.y;
  p.wait = 2 + (now % 3);
  p.moving = false;
  p.v = 0;
  p.stuck = 0;
}

export function stepPet(p: PetState, dt: number, now: number, me: { x: number; y: number; dir?: 0 | 1 | 2 | 3 }, solid: boolean[][], rand: () => number, others?: Map<string, PetState>): void {
  const sp = SPEED[p.kind];
  if (p.mode === 'play') {
    const q = p.partner ? others?.get(p.partner) : undefined;
    // the game ends on time, or if the other one has gone off to do something else (or been called away)
    if (!q || q.mode !== 'play' || q.partner !== p.id || now >= p.playUntil) { endPlay(p, now); return; }
    const left = p.playUntil - now;
    // the dog chases first, then they swap
    const chasing = p.kind === 'dog' ? left > PLAY_MS / 2 : left <= PLAY_MS / 2;
    if (chasing) {
      walkTo(p, solid, q.x, q.y, sp.run * 0.88, dt, 0.7);
    } else {
      const dx = p.x - q.x, dy = p.y - q.y;
      const d = Math.max(0.01, Math.hypot(dx, dy));
      let tx = p.x + (dx / d) * 3, ty = p.y + (dy / d) * 3;
      // cornered: dodge sideways instead
      if (!free(solid, tx, ty) || p.stuck > 0.25) { tx = p.x - (dy / d) * 3; ty = p.y + (dx / d) * 3; p.stuck = 0; }
      if (!free(solid, tx, ty)) { tx = p.hx; ty = p.hy; }
      walkTo(p, solid, tx, ty, sp.run * 0.92, dt, 0.2);
    }
    return;
  }
  if (p.mode === 'follow') {
    const d = Math.hypot(me.x - p.x, me.y - p.y);
    if (d > 30) { p.x = me.x; p.y = me.y + 1; p.v = 0; return; }
    const heel = heelPoint(p, me);
    const dh = Math.hypot(heel.x - p.x, heel.y - p.y);
    // it sets off when you get more than about two tiles away and settles once it is beside you (no jitter in between)
    if (!p.moving && dh < 1.9) { p.v = 0; return; }
    // far away it runs flat out; near you it trots
    walkTo(p, solid, heel.x, heel.y, dh > 5 ? sp.run : Math.max(sp.walk * 1.7, Math.min(sp.run, dh * 2.4)), dt, 0.45);
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
