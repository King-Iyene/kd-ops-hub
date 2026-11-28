import { describe, expect, it } from 'vitest';
import { buildHQ } from '../world/templates';
import { buildSolid, collides, reachable } from '../world/world';
import { BOARDROOM, DESK_SLOTS, WING, agentAvatar, deskStand, initAgentSim, meetingSpots, modeFor, sortAgents, statusDot, stepAgent, type AgentCtx, type AgentSim, type AgentStatus } from '../world/agents';

const map = buildHQ();
const solid = buildSolid(map, map.items);
const reach = reachable(solid, map.spawn.x, map.spawn.y);
const key = (p: { x: number; y: number }) => `${Math.floor(p.x)},${Math.floor(p.y)}`;
const seeded = (seed = 7) => () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };

describe('the Executive Wing on the map', () => {
  it('is Meeting Rooms 1 and 2 joined, next to the agents boardroom (Meeting Room 3), and the map did not change size', () => {
    expect(map.w).toBe(104);
    expect(map.h).toBe(66);
    expect(map.zones.some((z) => z.id === 'execwing' && z.kind === 'area')).toBe(true);
    expect(map.zones.some((z) => z.id === 'meeting-3' && z.kind === 'meeting')).toBe(true);
    expect(map.zones.some((z) => z.id === 'meeting-1' || z.id === 'meeting-2')).toBe(false);
    expect(map.walls[17].slice(47, 61).every((w) => w === false)).toBe(true); // the wall between the two rooms is gone
    expect(map.walls[17][46]).toBe(true); // the end pillars stay
  });

  it('can be walked into from the headquarters through the doors on the west wall', () => {
    expect(reach.has(key({ x: 47.5, y: 13.5 }))).toBe(true);
    expect(reach.has(key({ x: 47.5, y: 19.5 }))).toBe(true);
    expect(reach.has(key({ x: 47.5, y: 25.5 }))).toBe(true);
  });

  it('has 15 desks, an open standing place at each, all reachable and inside the wing', () => {
    expect(DESK_SLOTS).toHaveLength(15);
    DESK_SLOTS.forEach((_, i) => {
      const p = deskStand(i);
      expect(collides(solid, p.x, p.y)).toBe(false);
      expect(reach.has(key(p))).toBe(true);
      expect(p.x).toBeGreaterThanOrEqual(WING.x0);
      expect(p.x).toBeLessThanOrEqual(WING.x1 + 1);
      expect(p.y).toBeGreaterThanOrEqual(WING.y0);
      expect(p.y).toBeLessThanOrEqual(WING.y1 + 1);
    });
  });

  it('gives every desk its own chair, and leaves the aisles open', () => {
    for (const d of DESK_SLOTS) {
      expect(map.items.some((i) => i.t === 'desk' && i.x === d.x && i.y === d.y)).toBe(true);
      expect(map.items.some((i) => i.t === 'chair' && i.x === d.x + 1 && i.y === d.y + 1)).toBe(true);
    }
    for (const y of [15, 19]) for (let x = WING.x0; x <= WING.x1; x++) if (!(x === 60) && !(x === 47)) expect(solid[y][x]).toBe(false);
  });

  it('has a reachable place in the boardroom for every agent, nobody sharing one while there is room', () => {
    const spots = meetingSpots(solid, 14);
    expect(new Set(spots.map(key)).size).toBe(14);
    for (const p of spots) {
      expect(collides(solid, p.x, p.y)).toBe(false);
      expect(reach.has(key(p))).toBe(true);
      expect(p.x).toBeGreaterThanOrEqual(BOARDROOM.x0);
      expect(p.x).toBeLessThanOrEqual(BOARDROOM.x1 + 1);
    }
  });
});

describe('how the agents look', () => {
  it('each agent has a stable, valid look in its own colour; heads wear a blazer', () => {
    const a = agentAvatar({ slug: 'cfo', color: '#0f766e' });
    expect(a).toEqual(agentAvatar({ slug: 'cfo', color: '#0f766e' }));
    expect(a.shirt).toBe('#0f766e');
    expect(a.jacket).toBe(1);
    expect(agentAvatar({ slug: 'controller', color: '#15803d' }).jacket).toBe(0);
    expect(agentAvatar({ slug: 'cfo', color: 'not-a-colour' }).shirt).toMatch(/^#[0-9a-fA-F]{6}$/);
    const looks = new Set(['cfo', 'treasury', 'payroll', 'fpa', 'ops_head', 'product_head', 'engineering_head'].map((s) => JSON.stringify(agentAvatar({ slug: s, color: '#123456' }))));
    expect(looks.size).toBeGreaterThan(4);
  });

  it('orders agents the same way for everyone, department first', () => {
    const list = sortAgents([{ name: 'Zed', department: 'Finance' }, { name: 'Amy', department: 'Product' }, { name: 'Bob', department: 'Finance' }]);
    expect(list.map((x) => x.name)).toEqual(['Bob', 'Zed', 'Amy']);
  });

  it('shows a different dot colour for each live status', () => {
    const statuses: AgentStatus[] = ['offline', 'idle', 'working', 'thinking', 'waiting_approval', 'walking', 'meeting'];
    expect(new Set(statuses.map(statusDot)).size).toBe(statuses.length);
  });
});

describe('how the agents move', () => {
  const ctx = (over: Partial<AgentCtx> = {}): AgentCtx => ({ solid, owner: null, meetingSpot: meetingSpots(solid, 1)[0], rand: seeded(), ...over });
  const run = (a: AgentSim, status: AgentStatus, seconds: number, c: AgentCtx, start = 0) => {
    let t = start;
    for (let i = 0; i < seconds * 30; i++) { t += 1 / 30; stepAgent(a, 1 / 30, t, status, c); }
    return t;
  };

  it('chooses what to do from the public status, the same for everybody', () => {
    expect(modeFor('meeting', false)).toBe('meeting');
    expect(modeFor('walking', true)).toBe('owner');
    expect(modeFor('waiting_approval', true)).toBe('owner');
    expect(modeFor('waiting_approval', false)).toBe('desk');
    expect(modeFor('idle', false)).toBe('wander');
    expect(modeFor('working', true)).toBe('desk');
    expect(modeFor('offline', true)).toBe('desk');
  });

  it('stays at its desk while working or offline', () => {
    const home = deskStand(0);
    const a = initAgentSim('a', home);
    run(a, 'working', 60, ctx());
    expect(Math.hypot(a.x - home.x, a.y - home.y)).toBeLessThan(0.3);
    run(a, 'offline', 30, ctx(), 60);
    expect(Math.hypot(a.x - home.x, a.y - home.y)).toBeLessThan(0.3);
  });

  it('wanders the wing when idle, never into a wall or furniture, never outside the wing', () => {
    const a = initAgentSim('a', deskStand(3));
    let t = 0;
    let moved = false;
    for (let i = 0; i < 30 * 240; i++) {
      t += 1 / 30;
      stepAgent(a, 1 / 30, t, 'idle', ctx());
      if (a.moving) moved = true;
      expect(collides(solid, a.x, a.y)).toBe(false);
      expect(a.x).toBeGreaterThan(WING.x0 - 1);
      expect(a.x).toBeLessThan(WING.x1 + 2);
      expect(a.y).toBeGreaterThan(WING.y0 - 1);
      expect(a.y).toBeLessThan(WING.y1 + 2);
    }
    expect(moved).toBe(true);
  });

  it('walks across the map to the owner when it has something for him, and stops beside him', () => {
    const owner = { x: 31, y: 47.6 }; // the front gate of the old map
    const a = initAgentSim('a', deskStand(0));
    run(a, 'waiting_approval', 90, ctx({ owner }));
    const d = Math.hypot(a.x - owner.x, a.y - owner.y);
    expect(d).toBeLessThan(2.2);
    expect(d).toBeGreaterThan(0.3);
    expect(collides(solid, a.x, a.y)).toBe(false);
  });

  it('goes to its boardroom seat for a meeting and back to its desk after', () => {
    const home = deskStand(5);
    const spot = meetingSpots(solid, 3)[2];
    const a = initAgentSim('a', home);
    const t = run(a, 'meeting', 60, ctx({ meetingSpot: spot }));
    expect(Math.hypot(a.x - spot.x, a.y - spot.y)).toBeLessThan(0.6);
    run(a, 'working', 60, ctx({ meetingSpot: spot }), t);
    expect(Math.hypot(a.x - home.x, a.y - home.y)).toBeLessThan(0.6);
  });

  it('never gets stuck forever behind an obstacle: a blocked route is dropped and tried again', () => {
    const a = initAgentSim('a', deskStand(0));
    a.route = [{ x: 0.5, y: 0.5 }];
    a.x = 30.5; a.y = 70.5;
    run(a, 'working', 8, ctx());
    expect(a.route.length === 0 || a.stuck < 1.3).toBe(true);
  });
});
