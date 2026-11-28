import { describe, expect, it } from 'vitest';
import { buildHQ } from '../world/templates';
import { buildSolid, collides, reachable } from '../world/world';
import { BOARDROOM, BREAK_SPOTS, CFO_POST, DESK_SLOTS, WING, agentAvatar, deskStand, firstName, initAgentSim, meetingSpots, modeFor, deskWalkable, placesToVisit, sortAgents, statusDot, stepAgent, type AgentCtx, type AgentSim, type AgentStatus } from '../world/agents';

const map = buildHQ();
const solid = buildSolid(map, map.items);
const asolid = deskWalkable(solid); // how the executives walk it: their own chairs are open
const reach = reachable(asolid, map.spawn.x, map.spawn.y);
const key = (p: { x: number; y: number }) => `${Math.floor(p.x)},${Math.floor(p.y)}`;
const seeded = (seed = 7) => () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };

describe('the Executive Wing on the map', () => {
  it('is Meeting Rooms 1 and 2 joined and grown over the old courtyard, next to the agents boardroom, and the map did not change size', () => {
    expect(map.w).toBe(104);
    expect(map.h).toBe(66);
    expect(map.zones.some((z) => z.id === 'execwing' && z.kind === 'area' && z.floor === 'scifi')).toBe(true);
    expect(map.zones.some((z) => z.id === 'meeting-3' && z.kind === 'meeting')).toBe(true);
    expect(map.zones.some((z) => z.id === 'meeting-1' || z.id === 'meeting-2')).toBe(false);
    expect(map.zones.some((z) => z.id === 'courtyard')).toBe(false);
    expect(map.walls[17].slice(WING.x0, 61).every((w) => w === false)).toBe(true); // no wall inside the wing any more
    expect(map.walls[11].slice(WING.x0, 62).every((w) => w === true)).toBe(true); // a wall closes the top
  });

  it('can be walked into from the headquarters, and the lounge for a coffee is reachable too', () => {
    for (const p of [{ x: 35.5, y: 13.5 }, { x: 47.5, y: 19.5 }, { x: 58.5, y: 14.5 }, { x: 47.5, y: 25.5 }]) expect(reach.has(key(p)), key(p)).toBe(true);
    for (const b of BREAK_SPOTS) expect(reach.has(key(b)), key(b)).toBe(true);
  });

  it('has 21 desks, a chair at each, all reachable and inside the wing', () => {
    expect(DESK_SLOTS).toHaveLength(21);
    DESK_SLOTS.forEach((_, i) => {
      const p = deskStand(i);
      expect(reach.has(key(p))).toBe(true);
      expect(p.x).toBeGreaterThanOrEqual(WING.x0);
      expect(p.x).toBeLessThanOrEqual(WING.x1 + 1);
      expect(p.y).toBeGreaterThanOrEqual(WING.y0);
      expect(p.y).toBeLessThanOrEqual(WING.y1 + 1);
    });
  });

  it('has an open, reachable standing post for the CFO in the boardroom, who stands there and never sits', () => {
    expect(reach.has(key(CFO_POST))).toBe(true);
    expect(collides(asolid, CFO_POST.x, CFO_POST.y)).toBe(false);
    const a = initAgentSim('cfo', CFO_POST);
    a.stands = true; a.seated = false;
    let t = 0;
    for (let i = 0; i < 30 * 120; i++) { t += 1 / 30; stepAgent(a, 1 / 30, t, 'working', { solid: asolid, owner: null, meetingSpot: CFO_POST, rand: () => 0.5 }); }
    expect(a.seated).toBe(false);
    expect(Math.hypot(a.x - CFO_POST.x, a.y - CFO_POST.y)).toBeLessThan(0.1);
  });

  it('gives every desk its own chair, and leaves the aisles open', () => {
    for (const d of DESK_SLOTS) {
      expect(map.items.some((i) => i.t === 'desk' && i.x === d.x && i.y === d.y)).toBe(true);
      expect(map.items.some((i) => i.t === 'chair' && i.x === d.x + 1 && i.y === d.y + 1)).toBe(true);
    }
    for (const y of [14, 18]) for (let x = WING.x0 + 1; x < WING.x1; x++) expect(solid[y][x], `${x},${y}`).toBe(false);
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
  const slugs = ['cfo', 'finance_head', 'controller', 'treasury', 'payroll', 'revenue', 'fpa', 'ops_head', 'tasks_head', 'people_head', 'compliance_head', 'product_head', 'marketing_head', 'engineering_head', 'ndi_head'];

  it('each agent has a stable, valid look of its own, and no two look alike', () => {
    const a = agentAvatar({ slug: 'cfo', color: '#0f766e' });
    expect(a).toEqual(agentAvatar({ slug: 'cfo', color: '#0f766e' }));
    expect(a.jacket).toBe(1);
    const looks = slugs.map((s) => agentAvatar({ slug: s, color: '#123456' }));
    expect(new Set(looks.map((l) => JSON.stringify(l))).size).toBe(slugs.length);
    for (const l of looks) {
      expect(l.skin).toMatch(/^#[0-9a-fA-F]{6}$/);
      expect(l.hair).toMatch(/^#[0-9a-fA-F]{6}$/);
      expect(l.costume).toBe(0);
      expect(l.hat).toBe(0);
    }
    // a better-dressed team: formal shoes on most, a tie, waistcoat or blazer on the finance side
    expect(looks.filter((l) => l.shoes === 1).length).toBeGreaterThan(8);
    expect(agentAvatar({ slug: 'controller', color: '#15803d' }).jacket).toBe(4);
  });

  it('an agent that is not in the table (a new hire) gets a look from its colour and name', () => {
    expect(agentAvatar({ slug: 'new_head', color: '#0f766e' }).shirt).toBe('#0f766e');
    expect(agentAvatar({ slug: 'new_head', color: 'not-a-colour' }).shirt).toMatch(/^#[0-9a-fA-F]{6}$/);
  });

  it('shows only the first name', () => {
    expect(firstName('Hale King')).toBe('Hale');
    expect(firstName('  Isabel   Carter ')).toBe('Isabel');
    expect(firstName('Solo')).toBe('Solo');
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
  const ctx = (over: Partial<AgentCtx> = {}): AgentCtx => ({ solid: asolid, owner: null, meetingSpot: meetingSpots(solid, 1)[0], rand: seeded(), ...over });
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
    expect(modeFor('offline', true)).toBe('wander');
    expect(modeFor('working', true)).toBe('desk');
    expect(modeFor('thinking', false)).toBe('desk');
  });

  it('sits in its chair facing the desk and types while working, and never gets up', () => {
    const home = deskStand(0);
    const a = initAgentSim('a', home);
    expect(a.seated).toBe(true);
    run(a, 'working', 120, ctx());
    expect(Math.hypot(a.x - home.x, a.y - home.y)).toBeLessThan(0.05);
    expect(a.seated).toBe(true);
    expect(a.dir).toBe(3);
    expect(a.moving).toBe(false);
  });

  it('when idle or offline it sits most of the time, gets up now and then, and sits down again', () => {
    for (const status of ['idle', 'offline'] as AgentStatus[]) {
      const home = deskStand(3);
      const a = initAgentSim('a', home);
      let t = 0, up = 0, sat = 0, away = false;
      for (let i = 0; i < 30 * 1800; i++) {
        t += 1 / 30;
        stepAgent(a, 1 / 30, t, status, ctx());
        if (a.moving) up++;
        if (a.seated) { sat++; expect(a.dir).toBe(3); }
        if (Math.hypot(a.x - home.x, a.y - home.y) > 3) away = true;
      }
      expect(up, status).toBeGreaterThan(0);
      expect(sat, status).toBeGreaterThan(up);
      expect(away, status).toBe(true);
    }
  }, 60_000);

  it('walks only on open floor, never through a wall or furniture, and now and then walks right out of the wing', () => {
    const places = placesToVisit(asolid, deskStand(0));
    expect(places.length).toBeGreaterThan(50);
    for (const p of places) expect(collides(asolid, p.x, p.y)).toBe(false);
    let farthest = 0;
    for (let seed = 1; seed <= 4; seed++) {
      const home = deskStand(3);
      const a = initAgentSim('c' + seed, home);
      const c = ctx({ rand: seeded(seed * 13), places });
      let t = 0;
      for (let i = 0; i < 30 * 1500; i++) {
        t += 1 / 30;
        stepAgent(a, 1 / 30, t, 'idle', c);
        expect(collides(asolid, a.x, a.y)).toBe(false);
        farthest = Math.max(farthest, Math.hypot(a.x - home.x, a.y - home.y));
      }
    }
    expect(farthest).toBeGreaterThan(15);
  }, 60_000);

  it('goes to the lounge for a coffee now and then', () => {
    let visited = false;
    for (let seed = 1; seed <= 6 && !visited; seed++) {
      const a = initAgentSim('b' + seed, deskStand(seed));
      let t = 0;
      const c = ctx({ rand: seeded(seed * 11) });
      for (let i = 0; i < 30 * 2400; i++) {
        t += 1 / 30;
        stepAgent(a, 1 / 30, t, 'idle', c);
        if (BREAK_SPOTS.some((b) => Math.hypot(a.x - b.x, a.y - b.y) < 1.2)) { visited = true; break; }
      }
    }
    expect(visited).toBe(true);
  }, 60_000);

  it('walks across the map to the owner when it has something for him, and stops beside him', () => {
    const owner = { x: 31, y: 47.6 }; // the front gate of the old map
    const a = initAgentSim('a', deskStand(0));
    run(a, 'waiting_approval', 90, ctx({ owner }));
    const d = Math.hypot(a.x - owner.x, a.y - owner.y);
    expect(d).toBeLessThan(2.2);
    expect(d).toBeGreaterThan(0.3);
    expect(collides(asolid, a.x, a.y)).toBe(false);
  });

  it('goes to its boardroom seat for a meeting and back to its chair after', () => {
    const home = deskStand(5);
    const spot = meetingSpots(solid, 3)[2];
    const a = initAgentSim('a', home);
    const t = run(a, 'meeting', 60, ctx({ meetingSpot: spot }));
    expect(Math.hypot(a.x - spot.x, a.y - spot.y)).toBeLessThan(0.6);
    expect(a.seated).toBe(false);
    run(a, 'working', 60, ctx({ meetingSpot: spot }), t);
    expect(Math.hypot(a.x - home.x, a.y - home.y)).toBeLessThan(0.6);
    expect(a.seated).toBe(true);
  });

  it('never gets stuck forever behind an obstacle: a blocked route is dropped and tried again', () => {
    const a = initAgentSim('a', deskStand(0));
    a.route = [{ x: 0.5, y: 0.5 }];
    a.x = 30.5; a.y = 70.5;
    run(a, 'working', 8, ctx());
    expect(a.route.length === 0 || a.stuck < 1.3).toBe(true);
  });
});
