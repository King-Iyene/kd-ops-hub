import { advance, findPath } from './world';

/**
 * The office pets. Each dog or cat in the office is alive on your screen: it wanders about its spot, comes when you call,
 * follows you until you tell it to stay, and a dog will fetch a ball. (Pets are the same kind of thing for everyone, but what
 * each one is doing is on your screen only.) Pure logic, so it is unit tested.
 */
export type PetKind = 'dog' | 'cat';
export type PetMode = 'wander' | 'follow' | 'fetch' | 'return' | 'play' | 'home';

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
  /** the spot it was put in the office: it walks back there when nobody is looking after it */
  ox: number;
  oy: number;
  /** the connection (browser tab) of the person who called it, whose position it follows and returns the ball to */
  ctl: string | null;
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
  /** seconds the straight line to its goal has been blocked by a wall or furniture */
  blockedFor: number;
  /** a playful dash round its person (while following) */
  dashing: boolean;
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
  return { id, kind, x: x + 0.5, y: y + 0.5, hx: x + 0.5, hy: y + 0.5, ox: x + 0.5, oy: y + 0.5, ctl: null, face: 1, view: 'side', v: 0, moving: false, mode: 'wander', tx: x + 0.5, ty: y + 0.5, wait: 1 + (x % 3), ball: null, carrying: false, happyUntil: 0, stuck: 0, partner: null, playUntil: 0, fxAt: 0, route: [], routeGoal: null, blockedFor: 0, dashing: false };
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

/** Is the straight line between two points free of walls and furniture? */
export function lineClear(solid: boolean[][], x0: number, y0: number, x1: number, y1: number): boolean {
  const d = Math.hypot(x1 - x0, y1 - y0);
  const n = Math.max(1, Math.ceil(d / 0.3));
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    if (!free(solid, x0 + (x1 - x0) * t, y0 + (y1 - y0) * t)) return false;
  }
  return true;
}

/** Move a pet one step toward a point; returns true when it has got there. */
function walkTo(p: PetState, solid: boolean[][], tx: number, ty: number, speed: number, dt: number, stopAt: number): boolean {
  const goalX = tx, goalY = ty;
  const gd = Math.hypot(tx - p.x, ty - p.y);
  if (gd <= stopAt) { p.moving = false; p.v = 0; p.route = []; p.routeGoal = null; return true; }
  // blocked by a chair, a desk or a person-sized gap: find a way round, then follow it
  if (p.routeGoal && Math.hypot(p.routeGoal.x - goalX, p.routeGoal.y - goalY) > 2.2) { p.route = []; p.routeGoal = null; }
  // a wall or a piece of furniture between the pet and where it is going: work out the way round at once, do not push along it
  if (!p.route.length) p.blockedFor = lineClear(solid, p.x, p.y, goalX, goalY) ? 0 : p.blockedFor + dt;
  if (!p.route.length && (p.stuck > 0.3 || p.blockedFor > 0.2)) {
    const path = findPath(solid, p.x, p.y, goalX, goalY);
    p.stuck = 0;
    p.blockedFor = 0;
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
  // any two resting pets close together (a dog and a cat, two dogs or two cats) may start a game
  const list = [...pets].filter((p) => p.mode === 'wander' && !p.moving && p.wait > 0.4);
  for (let i = 0; i < list.length; i++) {
    const a = list[i];
    if (a.mode !== 'wander') continue;
    for (let j = i + 1; j < list.length; j++) {
      const b = list[j];
      if (b.mode !== 'wander') continue;
      if (Math.hypot(a.x - b.x, a.y - b.y) > 5) continue;
      if (rand() > 0.09 * dt) continue; // about one game in ten seconds when they are together
      a.mode = 'play'; b.mode = 'play';
      a.partner = b.id; b.partner = a.id;
      a.playUntil = b.playUntil = now + PLAY_MS;
      a.stuck = b.stuck = 0;
      break;
    }
  }
}

/** Head back to the spot it was put in (and potter about there). */
export function goHome(p: PetState): void {
  p.mode = 'home';
  p.ctl = null;
  p.partner = null;
  p.ball = null;
  p.carrying = false;
  p.dashing = false;
  p.route = [];
  p.routeGoal = null;
  p.stuck = 0;
  p.blockedFor = 0;
  p.wait = 0;
}

function endPlay(p: PetState, now: number): void {
  void now;
  goHome(p);
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
    // a playful dash round the person it is following, then back to heel
    if (p.dashing) {
      if (d > 6) p.dashing = false;
      else if (walkTo(p, solid, p.tx, p.ty, sp.run, dt, 0.4) || p.stuck > 0.8) { p.dashing = false; p.stuck = 0; p.wait = 1.2 + rand() * 2.6; }
      return;
    }
    // it sets off when you get more than about two tiles away and settles once it is beside you (no jitter in between)
    if (!p.moving && dh < 1.9) {
      p.v = 0;
      // settled beside you: every so often it races off round you and comes back (it keeps following until you press F again)
      if (p.wait > 0) { p.wait -= dt; return; }
      p.wait = 1.2 + rand() * 2.6;
      const an = rand() * Math.PI * 2;
      const rr2 = 2.2 + rand() * 1.6;
      const tx = me.x + Math.cos(an) * rr2;
      const ty = me.y + Math.sin(an) * rr2 * 0.8;
      if (free(solid, tx, ty)) { p.tx = tx; p.ty = ty; p.dashing = true; p.stuck = 0; }
      return;
    }
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
      goHome(p);
    }
    return;
  }
  if (p.mode === 'home') {
    if (walkTo(p, solid, p.ox, p.oy, sp.walk * 1.5, dt, 0.35) || p.stuck > 2.5) {
      p.mode = 'wander';
      p.hx = p.ox;
      p.hy = p.oy;
      p.tx = p.ox;
      p.ty = p.oy;
      p.wait = 1.5;
      p.stuck = 0;
      p.moving = false;
      p.v = 0;
    }
    return;
  }
  // wandering about home
  if (p.wait > 0) { p.wait -= dt; p.moving = false; return; }
  if (walkTo(p, solid, p.tx, p.ty, sp.walk, dt, 0.15) || p.stuck > 1.2) {
    p.stuck = 0;
    p.wait = p.kind === 'cat' ? 0.6 + rand() * 2.2 : 1.2 + rand() * 4.5; // cats pad about too, they do not nap all day
    for (let tries = 0; tries < 6; tries++) {
      const nx = p.hx + (rand() - 0.5) * 7;
      const ny = p.hy + (rand() - 0.5) * 5;
      if (free(solid, nx, ny)) { p.tx = nx; p.ty = ny; break; }
    }
  }
}

/** Apply a command from the menu. Returns what to show and say (hearts, sounds). */
export function applyPetCmd(p: PetState, cmd: PetCmd, now: number, me: { x: number; y: number; dir: 0 | 1 | 2 | 3 }, solid: boolean[][], who: string): { hearts: boolean; sound: 'bark' | 'meow' | 'happy' | null } {
  const sound = p.kind === 'dog' ? 'bark' : 'meow';
  switch (cmd.kind) {
    case 'pet':
      p.happyUntil = now + 2600;
      return { hearts: true, sound };
    case 'treat':
      p.happyUntil = now + 3200;
      return { hearts: true, sound: 'happy' };
    case 'call':
      // anybody can call it, and call it away from someone else; calling it again while it is yours sends it home
      if (p.mode === 'follow' && p.ctl === who) goHome(p);
      else { p.mode = 'follow'; p.ctl = who; p.partner = null; p.ball = null; p.carrying = false; p.route = []; p.routeGoal = null; p.stuck = 0; }
      return { hearts: false, sound };
    case 'stay':
      goHome(p);
      return { hearts: false, sound: null };
    case 'ball': {
      const land = ballLanding(solid, me.x, me.y, me.dir);
      p.ball = { x: land.x, y: land.y, fromX: me.x, fromY: me.y - 0.6, thrownAt: now };
      p.mode = 'fetch';
      p.ctl = who;
      p.partner = null;
      p.carrying = false;
      p.stuck = 0;
      return { hearts: false, sound };
    }
  }
}

/** The command a click or key on this pet should send: "stay" when it is already following me, otherwise "come" (also taking it from someone else). */
export function petCmdFor(p: { mode: PetMode; ctl: string | null }, who: string): 'call' | 'stay' {
  return p.mode === 'follow' && p.ctl === who ? 'stay' : 'call';
}

// ---- one live animal for everybody: one browser runs the pets and tells the others where they are ----

/** Who runs the pets: the person with the lowest connection id among those in the office (so everyone agrees without asking). */
export function petAuthority(present: string[], me: string): string {
  let best = me;
  for (const id of present) if (id < best) best = id;
  return best;
}

export interface PetSnap {
  id: string; x: number; y: number; face: 1 | -1; view: 'side' | 'front' | 'back'; moving: boolean; mode: PetMode; v: number;
  ox: number; oy: number; ctl: string | null; carrying: boolean; ball: Ball | null; happy: number; dash: boolean; partner: string | null; play: number; wait: number;
  /** when this computer received it (the "ms from now" times count from then); not sent */
  at?: number;
}

/** What the others need to draw this pet (times are sent as "ms from now", because the computers' clocks differ). */
export function petSnap(p: PetState, now: number): PetSnap {
  const r = (n: number) => Math.round(n * 100) / 100;
  return {
    id: p.id, x: r(p.x), y: r(p.y), face: p.face, view: p.view, moving: p.moving, mode: p.mode, v: r(p.v), ox: p.ox, oy: p.oy, ctl: p.ctl,
    carrying: p.carrying, ball: p.ball ? { ...p.ball, thrownAt: Math.round(p.ball.thrownAt - now) } : null,
    happy: Math.max(0, Math.round(p.happyUntil - now)), dash: p.dashing, partner: p.partner, play: Math.max(0, Math.round(p.playUntil - now)), wait: r(p.wait),
  };
}

/** Take a pet's state from the one that runs it. The position glides toward the sent one (snapping when far off). */
export function applyPetSnap(p: PetState, s: PetSnap, now: number, dt: number): void {
  const gap = Math.hypot(s.x - p.x, s.y - p.y);
  if (gap > 4) { p.x = s.x; p.y = s.y; } else { const k = Math.min(1, dt * 12); p.x += (s.x - p.x) * k; p.y += (s.y - p.y) * k; }
  p.face = s.face; p.view = s.view; p.moving = s.moving; p.mode = s.mode; p.v = s.v; p.ox = s.ox; p.oy = s.oy; p.ctl = s.ctl;
  p.carrying = s.carrying; p.dashing = s.dash; p.partner = s.partner; p.wait = s.wait;
  const base = s.at ?? now;
  p.ball = s.ball ? { ...s.ball, thrownAt: base + s.ball.thrownAt } : null;
  // only change these when they really changed, so a snapshot's rounding does not look like a new treat every time
  const happy = s.happy > 0 ? base + s.happy : 0;
  if (happy === 0 ? p.happyUntil !== 0 && p.happyUntil < now : Math.abs(happy - p.happyUntil) > 200) p.happyUntil = happy;
  p.playUntil = s.play > 0 ? base + s.play : 0;
  p.hx = s.ox; p.hy = s.oy;
}
