// The AI executives as characters in the office: where they sit, how they walk about, how they look.
//
// Pure code (no canvas, no network) so it can be tested. Each person's browser runs the same small simulation from the agents' public presence
// (crew_agents: name, title, status, colour), so everybody sees them, and nothing about it costs a token. Walking is only animation: the
// agents' real work happens in their sessions. Only the owner can open one to talk (the page decides that; the database enforces it).
//
// What they do: they sit at their desk facing the screen and type. Every so often one stands up, walks round the wing or goes to the lounge
// for a coffee, then comes back and sits down again. An agent that is working or thinking stays in its chair.

import type { AvatarStyle } from './types';
import { advance, facing, findPath, nearestOpenTile, reachable } from './world';
import { defaultAvatar } from './render';
import { BOARDROOM, BREAK_SPOTS, CFO_POST, DESK_SLOTS, WING } from './wing';

export { BOARDROOM, BREAK_SPOTS, CFO_POST, DESK_SLOTS, WING } from './wing';

/** The CFO stands at his post in the boardroom instead of sitting at a desk. */
export const standsAtPost = (slug: string): boolean => slug === 'cfo';

export type AgentStatus = 'offline' | 'idle' | 'working' | 'thinking' | 'waiting_approval' | 'walking' | 'meeting';
export interface AgentInfo { id: string; slug: string; name: string; title: string; color: string; status: AgentStatus; department?: string }

/** The slot of an agent is its place in the list sorted by department then name (stable for everyone). */
export function sortAgents<T extends { department?: string; name: string }>(list: T[]): T[] {
  return [...list].sort((a, b) => (a.department ?? '').localeCompare(b.department ?? '') || a.name.localeCompare(b.name));
}

/** Where an agent sits: the middle of its chair, which is just below the desk. */
export function deskStand(slot: number): { x: number; y: number } {
  const d = DESK_SLOTS[slot % DESK_SLOTS.length];
  return { x: d.x + 1.5, y: d.y + 1.5 };
}

const walkable = new WeakMap<boolean[][], boolean[][]>();
/**
 * The floor plan as the executives walk it: the same, except that their own chairs are open (a chair blocks everyone else, but its owner
 * can get up from it and sit down in it). Worked out once per floor plan.
 */
export function deskWalkable(solid: boolean[][]): boolean[][] {
  let w = walkable.get(solid);
  if (!w) {
    w = solid.map((row) => row.slice());
    for (const d of DESK_SLOTS) if (w[d.y + 1]) w[d.y + 1][d.x + 1] = false;
    walkable.set(solid, w);
  }
  return w;
}

const placeCache = new WeakMap<boolean[][], { x: number; y: number }[]>();
/**
 * Places an executive can walk out to, so the wing does not look crowded: every third open tile of the building and the gardens it can
 * reach from its chair (not too far), spread out. Worked out once per floor plan.
 */
export function placesToVisit(solid: boolean[][], from: { x: number; y: number }): { x: number; y: number }[] {
  let out = placeCache.get(solid);
  if (!out) {
    out = [];
    const reach = reachable(solid, from.x, from.y);
    for (let y = 2; y < solid.length - 1; y += 3) {
      for (let x = 2; x < (solid[0]?.length ?? 0) - 1; x += 3) {
        if (solid[y][x] === false && reach.has(x + ',' + y) && Math.hypot(x - from.x, y - from.y) < 48) out.push({ x: x + 0.5, y: y + 0.5 });
      }
    }
    placeCache.set(solid, out);
  }
  return out;
}

/** Only the first name goes on the tag. */
export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name;
}

/**
 * Standing places round the boardroom table, nearest the table first: open tiles of the boardroom, taken one at a time so that two people
 * never share one. Works from the real floor plan, so whatever furniture is in the room is respected. Fewer open tiles than people: the
 * extra people share the last places.
 */
export function meetingSpots(solid: boolean[][], n: number): { x: number; y: number }[] {
  const cx = (BOARDROOM.x0 + BOARDROOM.x1) / 2 + 0.5, cy = (BOARDROOM.y0 + BOARDROOM.y1) / 2 + 0.5;
  const open: { x: number; y: number }[] = [];
  for (let y = BOARDROOM.y0; y <= BOARDROOM.y1; y++) for (let x = BOARDROOM.x0; x <= BOARDROOM.x1; x++) if (solid[y]?.[x] === false) open.push({ x: x + 0.5, y: y + 0.5 });
  open.sort((a, b) => Math.hypot(a.x - cx, a.y - cy) - Math.hypot(b.x - cx, b.y - cy) || a.x - b.x || a.y - b.y);
  const out: { x: number; y: number }[] = [];
  for (let i = 0; i < Math.max(n, 1); i++) out.push(open[Math.min(i, open.length - 1)] ?? { x: cx, y: cy });
  return out;
}

const GENDER: Record<string, 'female' | 'male'> = {
  cfo: 'male', finance_head: 'male', controller: 'male', treasury: 'female', payroll: 'female', revenue: 'male', fpa: 'female',
  ops_head: 'male', tasks_head: 'male', people_head: 'female', compliance_head: 'female', product_head: 'female', marketing_head: 'female', engineering_head: 'male', ndi_head: 'female',
};

type Look = Partial<AvatarStyle>;
const SUIT_SHOES = { shoes: 1, shoeColor: '#111827' };
/**
 * Everyone has their own look: a different face, hair, build of outfit and colours, dressed for work. A fixed table, so everybody sees
 * the same person at the same desk. (An agent that is not in the table gets a look made from its name.)
 */
const LOOKS: Record<string, Look> = {
  cfo: { skin: '#5b3a29', hair: '#0b0b0b', hairStyle: 0, beard: 1, outfit: 2, jacket: 1, jacketColor: '#0a0a10', inner: '#ffffff', tie: 1, tieColor: '#d4af37', glasses: 1, pants: '#0a0a10', shoes: 1, shoeColor: '#000000' },
  finance_head: { skin: '#e0ac69', hair: '#6b4423', hairStyle: 0, beard: 0, outfit: 2, jacket: 1, jacketColor: '#374151', inner: '#e0f2fe', tie: 1, tieColor: '#0e7490', glasses: 0, pants: '#1f2937', ...SUIT_SHOES },
  controller: { skin: '#c68642', hair: '#6b7280', hairStyle: 3, beard: 3, outfit: 2, jacket: 4, jacketColor: '#78350f', inner: '#f1f5f9', tie: 2, tieColor: '#7f1d1d', glasses: 1, pants: '#292524', ...SUIT_SHOES },
  treasury: { skin: '#8d5524', hair: '#111827', hairStyle: 8, beard: 0, outfit: 2, jacket: 1, jacketColor: '#7f1d1d', inner: '#fafaf9', tie: 0, glasses: 0, extra: 2, pants: '#1c1917', ...SUIT_SHOES },
  payroll: { skin: '#f1c27d', hair: '#92400e', hairStyle: 2, beard: 0, outfit: 4, shirt: '#be185d', jacket: 0, glasses: 1, pants: '#1f2937', ...SUIT_SHOES },
  revenue: { skin: '#7a4a2f', hair: '#111827', hairStyle: 5, beard: 1, outfit: 2, jacket: 1, jacketColor: '#1e3a8a', inner: '#f8fafc', tie: 1, tieColor: '#ca8a04', glasses: 0, pants: '#0f172a', ...SUIT_SHOES },
  fpa: { skin: '#ffdbac', hair: '#d6b370', hairStyle: 1, beard: 0, outfit: 4, shirt: '#e2e8f0', jacket: 1, jacketColor: '#0f766e', inner: '#f8fafc', tie: 0, glasses: 1, pants: '#134e4a', ...SUIT_SHOES },
  ops_head: { skin: '#a0693f', hair: '#1f2937', hairStyle: 0, beard: 2, outfit: 2, jacket: 1, jacketColor: '#334155', inner: '#f1f5f9', tie: 1, tieColor: '#15803d', glasses: 0, pants: '#1e293b', shoes: 2, shoeColor: '#44403c' },
  tasks_head: { skin: '#e0ac69', hair: '#7c2d12', hairStyle: 4, beard: 0, outfit: 0, shirt: '#1d4ed8', jacket: 3, jacketColor: '#111827', tie: 0, glasses: 1, extra: 1, pants: '#334155', shoes: 0, shoeColor: '#f8fafc' },
  people_head: { skin: '#8d5524', hair: '#0b0b0b', hairStyle: 7, beard: 0, outfit: 3, shirt: '#7c3aed', jacket: 0, tie: 0, glasses: 0, extra: 2, pants: '#1f2937', ...SUIT_SHOES },
  compliance_head: { skin: '#e0ac69', hair: '#9ca3af', hairStyle: 8, beard: 0, outfit: 2, jacket: 1, jacketColor: '#111827', inner: '#e5e7eb', tie: 3, tieColor: '#b91c1c', glasses: 1, pants: '#111827', ...SUIT_SHOES },
  product_head: { skin: '#c68642', hair: '#0b0b0b', hairStyle: 6, beard: 0, outfit: 6, shirt: '#ea580c', jacket: 0, tie: 0, glasses: 0, extra: 2, pants: '#1c1917', ...SUIT_SHOES },
  marketing_head: { skin: '#f1c27d', hair: '#9a3412', hairStyle: 1, beard: 0, outfit: 3, shirt: '#db2777', jacket: 1, jacketColor: '#f8fafc', inner: '#fdf2f8', tie: 0, glasses: 0, pants: '#9d174d', ...SUIT_SHOES },
  engineering_head: { skin: '#ffdbac', hair: '#92400e', hairStyle: 4, beard: 3, outfit: 1, shirt: '#0891b2', jacket: 3, jacketColor: '#0b132b', tie: 0, glasses: 1, extra: 1, pants: '#1e293b', shoes: 0, shoeColor: '#e2e8f0' },
  ndi_head: { skin: '#7a4a2f', hair: '#1c1917', hairStyle: 10, beard: 0, outfit: 5, shirt: '#047857', jacket: 0, tie: 0, glasses: 0, extra: 2, pants: '#064e3b', ...SUIT_SHOES },
};

/** A professional look, the same for everyone who sees it: a hand-made look for each executive, or one made from the name for a new hire. */
export function agentAvatar(a: Pick<AgentInfo, 'slug' | 'color'>): AvatarStyle {
  const base = defaultAvatar('agent:' + a.slug, GENDER[a.slug]);
  const look = LOOKS[a.slug];
  if (look) return { ...base, accessory: 0, hat: 0, costume: 0, aid: 0, bottom: 0, ...look };
  const head = a.slug === 'cfo' || a.slug.endsWith('_head');
  return { ...base, shirt: /^#[0-9a-fA-F]{6}$/.test(a.color) ? a.color : base.shirt, outfit: head ? 2 : base.outfit, jacket: head ? 1 : 0, accessory: 0, hat: 0, costume: 0, aid: 0, beard: GENDER[a.slug] === 'male' ? base.beard : 0 };
}

/** The colour of the status dot beside the name. */
export function statusDot(status: AgentStatus): string {
  switch (status) {
    case 'working': return '#3b82f6';
    case 'thinking': return '#8b5cf6';
    case 'waiting_approval': return '#f59e0b';
    case 'walking': return '#0ea5e9';
    case 'meeting': return '#d946ef';
    case 'idle': return '#22c55e';
    default: return '#9ca3af';
  }
}

export type AgentMode = 'desk' | 'wander' | 'owner' | 'meeting';
export interface AgentSim {
  id: string;
  x: number; y: number; vx: number; vy: number;
  dir: 0 | 1 | 2 | 3;
  moving: boolean;
  /** sitting in its chair, facing the desk, typing */
  seated: boolean;
  mode: AgentMode;
  home: { x: number; y: number };
  route: { x: number; y: number }[];
  thinkAt: number;
  stuck: number;
  /** has no desk: stands at its post (the CFO) */
  stands?: boolean;
}

const SPEED = 2.2; // tiles per second: unhurried

export function initAgentSim(id: string, home: { x: number; y: number }, now = 0): AgentSim {
  // they start in their chairs; the first one gets up after a while, the others at different times
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return { id, x: home.x, y: home.y, vx: 0, vy: 0, dir: 3, moving: false, seated: true, mode: 'desk', home, route: [], thinkAt: now + 150 + (h % 500), stuck: 0 };
}

export interface AgentCtx {
  solid: boolean[][];
  /** where the owner's character is, when the viewer is the owner (so agents who want him walk up to him) */
  owner: { x: number; y: number } | null;
  meetingSpot: { x: number; y: number };
  rand: () => number;
  /** where an executive may walk out to now and then (see placesToVisit); none: it stays in the wing and the lounge */
  places?: { x: number; y: number }[];
  /** the other executives and where they are now (so one can walk over to a colleague for a chat) */
  others?: { id: string; x: number; y: number }[];
  /** how many executives are away from their desks right now (so that never more than two are up at once) */
  away?: number;
}

/** What an agent is doing, from its public status: the same rule for everybody. Working or thinking means staying in the chair. */
export function modeFor(status: AgentStatus, ownerHere: boolean): AgentMode {
  if (status === 'meeting') return 'meeting';
  if ((status === 'walking' || status === 'waiting_approval') && ownerHere) return 'owner';
  if (status === 'working' || status === 'thinking' || status === 'waiting_approval') return 'desk';
  return 'wander'; // idle, walking, or not in a session right now: sits, and now and then gets up
}

function setRoute(a: AgentSim, ctx: AgentCtx, tx: number, ty: number): void {
  a.route = findPath(ctx.solid, a.x, a.y, tx, ty) ?? [];
  a.stuck = 0;
}

/** How many seconds the current route takes to walk. */
function routeSeconds(a: AgentSim): number {
  let d = 0, px = a.x, py = a.y;
  for (const w of a.route) { d += Math.hypot(w.x - px, w.y - py); px = w.x; py = w.y; }
  return d / SPEED;
}

function onWingFloor(x: number, y: number): boolean {
  return x >= WING.x0 && x <= WING.x1 + 1 && y >= WING.y0 && y <= WING.y1 + 1;
}

/** Advance one agent by dt seconds. `now` is seconds; `status` is its public status. */
export function stepAgent(a: AgentSim, dt: number, now: number, status: AgentStatus, ctx: AgentCtx): void {
  const mode = modeFor(status, ctx.owner !== null);
  if (mode !== a.mode) {
    a.mode = mode;
    a.route = [];
    a.thinkAt = now;
  }

  // follow the route
  if (a.route.length > 0) {
    const wp = a.route[0];
    const dx = wp.x - a.x, dy = wp.y - a.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 0.18) {
      a.route.shift();
    } else {
      const vx = (dx / dist) * SPEED, vy = (dy / dist) * SPEED;
      const next = advance(ctx.solid, a.x, a.y, vx, vy, dt);
      const moved = Math.hypot(next.x - a.x, next.y - a.y);
      a.stuck = moved < SPEED * dt * 0.2 ? a.stuck + dt : 0;
      a.x = next.x; a.y = next.y;
      a.vx = vx; a.vy = vy;
      a.dir = facing(vx, vy, a.dir);
      a.moving = true;
      a.seated = false;
      if (a.stuck > 1.2) { a.route = []; a.stuck = 0; a.thinkAt = now + 0.5; }
      return;
    }
  }
  a.moving = false;
  a.vx = 0; a.vy = 0;

  // at its chair (and not off to a meeting or to the owner): sit down square on the chair, facing the desk
  const dHome = Math.hypot(a.home.x - a.x, a.home.y - a.y);
  if ((a.mode === 'desk' || a.mode === 'wander') && a.route.length === 0 && dHome < 0.35) {
    a.x = a.home.x; a.y = a.home.y;
    a.dir = a.stands ? 0 : 3;
    a.seated = !a.stands;
  } else {
    a.seated = false;
  }
  if (now < a.thinkAt) return;

  // decide where to go next
  if (a.mode === 'meeting') {
    if (Math.hypot(ctx.meetingSpot.x - a.x, ctx.meetingSpot.y - a.y) > 0.5) setRoute(a, ctx, ctx.meetingSpot.x, ctx.meetingSpot.y);
    a.dir = 0;
    a.thinkAt = now + 1.5;
  } else if (a.mode === 'owner' && ctx.owner) {
    const d = Math.hypot(ctx.owner.x - a.x, ctx.owner.y - a.y);
    if (d > 1.6) {
      const t = nearestOpenTile(ctx.solid, ctx.owner.x, ctx.owner.y, [{ x: ctx.owner.x, y: ctx.owner.y }], 3) ?? ctx.owner;
      setRoute(a, ctx, t.x, t.y);
    } else {
      a.dir = facing(ctx.owner.x - a.x, ctx.owner.y - a.y, a.dir);
    }
    a.thinkAt = now + 2;
  } else if (a.mode === 'wander') {
    if (dHome >= 0.35) {
      // been away long enough: back to the chair for a good sit
      setRoute(a, ctx, a.home.x, a.home.y);
      a.thinkAt = now + routeSeconds(a) + 360 + ctx.rand() * 420;
    } else if (!isRestless(a.id) || (ctx.away ?? 0) >= 2) {
      // most of the team stays in the chair; and never more than two are away from their desks at once
      a.thinkAt = now + 240 + ctx.rand() * 360;
    } else if (ctx.rand() < 0.3) {
      // a coffee, some water or a snack in the lounge
      const spot = BREAK_SPOTS[Math.floor(ctx.rand() * BREAK_SPOTS.length) % BREAK_SPOTS.length];
      const t = nearestOpenTile(ctx.solid, spot.x, spot.y, [], 3);
      if (t) { setRoute(a, ctx, t.x, t.y); a.thinkAt = now + routeSeconds(a) + 7 + ctx.rand() * 8; } else a.thinkAt = now + 20;
    } else if (ctx.places && ctx.places.length > 0 && ctx.rand() < 0.4) {
      // out of the wing: a walk to somewhere else in the building or the gardens, a pause there, then back to the chair
      const spot = ctx.places[Math.floor(ctx.rand() * ctx.places.length) % ctx.places.length];
      setRoute(a, ctx, spot.x, spot.y);
      a.thinkAt = now + routeSeconds(a) + 10 + ctx.rand() * 25;
    } else if (ctx.rand() < 0.5 && (ctx.others ?? []).some((o) => o.id !== a.id)) {
      // a chat: over to a colleague, wherever they are, and a few minutes of talking
      const pals = (ctx.others ?? []).filter((o) => o.id !== a.id);
      const pal = pals[Math.floor(ctx.rand() * pals.length) % pals.length];
      const t = nearestOpenTile(ctx.solid, pal.x + 0.9, pal.y + 0.9, [{ x: pal.x, y: pal.y }], 3);
      if (t) { setRoute(a, ctx, t.x, t.y); a.thinkAt = now + routeSeconds(a) + 8 + ctx.rand() * 14; } else a.thinkAt = now + 10;
    } else {
      // stretch the legs: a walk to somewhere on the wing floor
      const t = nearestOpenTile(ctx.solid, WING.x0 + ctx.rand() * (WING.x1 - WING.x0), WING.y0 + ctx.rand() * (WING.y1 - WING.y0), [], 3);
      if (t && onWingFloor(t.x, t.y)) { setRoute(a, ctx, t.x, t.y); a.thinkAt = now + routeSeconds(a) + 3 + ctx.rand() * 6; } else a.thinkAt = now + 10;
    }
  } else {
    // desk: be in the chair
    if (dHome >= 0.35) setRoute(a, ctx, a.home.x, a.home.y);
    a.thinkAt = now + 3;
  }
}

/** Only about a third of the team ever gets up to walk about; the rest stay at their desks all day (a fixed trait of each person). */
export function isRestless(id: string): boolean {
  let h = 7;
  for (let i = 0; i < id.length; i++) h = (h * 33 + id.charCodeAt(i)) >>> 0;
  return h % 100 < 35;
}
