// The AI executives as characters in the office: where they sit, how they walk about, how they look.
//
// Pure code (no canvas, no network) so it can be tested. Each person's browser runs the same small simulation from the agents' public presence
// (crew_agents: name, title, status, colour), so everybody sees them, and nothing about it costs a token. Walking is only animation: the
// agents' real work happens in their sessions. Only the owner can open one to talk (the page decides that; the database enforces it).

import type { AvatarStyle } from './types';
import { advance, facing, findPath, nearestOpenTile } from './world';
import { defaultAvatar } from './render';
import { BOARDROOM, DESK_SLOTS, WING } from './wing';

export { BOARDROOM, DESK_SLOTS, WING } from './wing';

export type AgentStatus = 'offline' | 'idle' | 'working' | 'thinking' | 'waiting_approval' | 'walking' | 'meeting';
export interface AgentInfo { id: string; slug: string; name: string; title: string; color: string; status: AgentStatus; department?: string }

/** The slot of an agent is its place in the list sorted by department then name (stable for everyone). */
export function sortAgents<T extends { department?: string; name: string }>(list: T[]): T[] {
  return [...list].sort((a, b) => (a.department ?? '').localeCompare(b.department ?? '') || a.name.localeCompare(b.name));
}

/** Where an agent stands at its desk: one tile below its chair. */
export function deskStand(slot: number): { x: number; y: number } {
  const d = DESK_SLOTS[slot % DESK_SLOTS.length];
  return { x: d.x + 1.5, y: d.y + 2.5 };
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
  cfo: 'female', finance_head: 'male', controller: 'male', treasury: 'female', payroll: 'female', revenue: 'male', fpa: 'female',
  ops_head: 'male', tasks_head: 'male', compliance_head: 'female', product_head: 'female', marketing_head: 'female', engineering_head: 'male', ndi_head: 'female',
};

/** A professional look, the same for everyone who sees it: a person-like default for the name, in the agent's colour, a blazer for the heads. */
export function agentAvatar(a: Pick<AgentInfo, 'slug' | 'color'>): AvatarStyle {
  const base = defaultAvatar('agent:' + a.slug, GENDER[a.slug]);
  const head = a.slug === 'cfo' || a.slug.endsWith('_head');
  return { ...base, shirt: /^#[0-9a-fA-F]{6}$/.test(a.color) ? a.color : base.shirt, outfit: head ? 2 : base.outfit, jacket: head ? 1 : 0, accessory: 0, hat: 0, beard: GENDER[a.slug] === 'male' ? base.beard : 0 };
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
  mode: AgentMode;
  home: { x: number; y: number };
  route: { x: number; y: number }[];
  thinkAt: number;
  stuck: number;
}

const SPEED = 2.2; // tiles per second: unhurried

export function initAgentSim(id: string, home: { x: number; y: number }, now = 0): AgentSim {
  return { id, x: home.x, y: home.y, vx: 0, vy: 0, dir: 0, moving: false, mode: 'desk', home, route: [], thinkAt: now + 2, stuck: 0 };
}

export interface AgentCtx {
  solid: boolean[][];
  /** where the owner's character is, when the viewer is the owner (so agents who want him walk up to him) */
  owner: { x: number; y: number } | null;
  meetingSpot: { x: number; y: number };
  rand: () => number;
}

/** What an agent is doing, from its public status: the same rule for everybody. */
export function modeFor(status: AgentStatus, ownerHere: boolean): AgentMode {
  if (status === 'meeting') return 'meeting';
  if ((status === 'walking' || status === 'waiting_approval') && ownerHere) return 'owner';
  if (status === 'idle' || status === 'walking') return 'wander';
  return 'desk';
}

function setRoute(a: AgentSim, ctx: AgentCtx, tx: number, ty: number): void {
  a.route = findPath(ctx.solid, a.x, a.y, tx, ty) ?? [];
  a.stuck = 0;
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
      if (a.stuck > 1.2) { a.route = []; a.stuck = 0; a.thinkAt = now + 0.5; }
      return;
    }
  }
  a.moving = false;
  a.vx = 0; a.vy = 0;
  if (now < a.thinkAt) return;

  // decide where to go next
  const dHome = Math.hypot(a.home.x - a.x, a.home.y - a.y);
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
    // mostly stay at the desk; now and then walk to a spot on the wing floor and come back
    if (dHome > 0.6 && ctx.rand() < 0.6) setRoute(a, ctx, a.home.x, a.home.y);
    else {
      const t = nearestOpenTile(ctx.solid, WING.x0 + ctx.rand() * (WING.x1 - WING.x0), WING.y0 + ctx.rand() * (WING.y1 - WING.y0), [], 3);
      if (t && onWingFloor(t.x, t.y)) setRoute(a, ctx, t.x, t.y);
    }
    a.thinkAt = now + 6 + ctx.rand() * 14;
  } else {
    // desk: be there
    if (dHome > 0.5) setRoute(a, ctx, a.home.x, a.home.y);
    else a.dir = 0;
    a.thinkAt = now + 3;
  }
}
