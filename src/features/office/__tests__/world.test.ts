import { describe, expect, it } from 'vitest';
import { advance, applyTileEdits, buildSolid, canPlace, collides, extrapolate, facing, findPath, inputVelocity, itemCells, isRoom, itemSize, newItemId, reachable, sanitizeItems, WALK_SPEED, zoneAt } from '../world/world';
import { buildBlank, buildHQ, buildPersonalOffice, buildTeamOffice } from '../world/templates';
import type { Item } from '../world/types';

describe('templates are playable', () => {
  for (const [name, build] of [['team office', buildTeamOffice], ['personal office', buildPersonalOffice]] as const) {
    it(`${name}: the spawn point is walkable`, () => {
      const m = build();
      expect(collides(buildSolid(m, m.items), m.spawn.x, m.spawn.y)).toBe(false);
    });
    it(`${name}: every room and door can be reached from the spawn`, () => {
      const m = build();
      const seen = reachable(buildSolid(m, m.items), m.spawn.x, m.spawn.y);
      for (const z of m.zones) {
        if (z.kind === 'area') continue;
        let any = false;
        for (let y = z.y; y < z.y + z.h; y++) for (let x = z.x; x < z.x + z.w; x++) if (seen.has(`${x},${y}`)) any = true;
        expect(any, `zone ${z.name} is cut off`).toBe(true);
      }
    });
    it(`${name}: no furniture sits on a wall or outside the room`, () => {
      const m = build();
      for (const item of m.items) for (const c of itemCells(item)) {
        expect(c.x >= 0 && c.x < m.w && c.y >= 0 && c.y < m.h, `${item.t} outside`).toBe(true);
        expect(m.walls[c.y][c.x], `${item.t} on a wall at ${c.x},${c.y}`).toBe(false);
      }
    });
    it(`${name}: every computer is on a desk`, () => {
      const m = build();
      for (const c of m.items.filter((i) => i.t === 'computer')) {
        const onDesk = m.items.some((d) => (d.t === 'desk' || d.t === 'table') && itemCells(d).some((cell) => cell.x === c.x && cell.y === c.y));
        expect(onDesk, `computer at ${c.x},${c.y}`).toBe(true);
      }
    });
    it(`${name}: item ids are unique`, () => {
      const m = build();
      expect(new Set(m.items.map((i) => i.id)).size).toBe(m.items.length);
    });
  }

  it('the team office has three meeting rooms and a lounge (everyone shares this one office)', () => {
    const m = buildTeamOffice();
    expect(m.zones.filter((z) => z.kind === 'meeting')).toHaveLength(3);
    expect(m.zones.some((z) => z.kind === 'lounge')).toBe(true);
    expect(m.zones.some((z) => z.kind === 'portal')).toBe(false);
  });
  it('the personal office has a door back to the team office', () => {
    expect(buildPersonalOffice().zones.find((z) => z.kind === 'portal')?.target).toBe('team');
  });
  it('walking from the open floor into each meeting room works through its door', () => {
    const m = buildTeamOffice();
    const solid = buildSolid(m, m.items);
    for (const room of m.zones.filter((z) => z.kind === 'meeting')) {
      let enter = false;
      const seen = reachable(solid, m.spawn.x, m.spawn.y);
      for (let y = room.y; y < room.y + room.h; y++) if (seen.has(`${room.x},${y}`)) enter = true;
      expect(enter).toBe(true);
    }
  }, 30000);
});

describe('walking', () => {
  const m = buildPersonalOffice();
  const solid = buildSolid(m, []);
  it('moves freely in open floor', () => {
    const p = advance(solid, 5.5, 5.5, WALK_SPEED, 0, 0.1);
    expect(p.x).toBeCloseTo(5.5 + WALK_SPEED * 0.1, 5);
    expect(p.y).toBe(5.5);
  });
  it('is stopped by a wall and never ends up inside it', () => {
    let p = { x: 13.5, y: 5.5 };
    for (let i = 0; i < 100; i++) p = advance(solid, p.x, p.y, WALK_SPEED, 0, 0.05);
    expect(collides(solid, p.x, p.y)).toBe(false);
    expect(p.x).toBeLessThan(15);
  });
  it('slides along a wall when walking diagonally into it', () => {
    let p = { x: 13.5, y: 4.5 };
    for (let i = 0; i < 20; i++) p = advance(solid, p.x, p.y, WALK_SPEED * 0.7, WALK_SPEED * 0.7, 0.05);
    expect(p.y).toBeGreaterThan(4.5); // kept moving down along the wall
    expect(collides(solid, p.x, p.y)).toBe(false);
  });
  it('cannot leave the map', () => {
    let p = { x: 7.5, y: 8.5 };
    for (let i = 0; i < 400; i++) p = advance(solid, p.x, p.y, 0, WALK_SPEED, 0.05);
    expect(p.y).toBeLessThan(m.h);
  });
  it('solid furniture blocks and rugs do not', () => {
    const items: Item[] = [{ id: 'a', t: 'desk', x: 6, y: 5 }, { id: 'b', t: 'rug', x: 6, y: 7 }];
    const s = buildSolid(m, items);
    expect(collides(s, 6.5, 5.5)).toBe(true);
    expect(collides(s, 6.5, 7.5)).toBe(false);
  });
  it('diagonal input is not faster than straight', () => {
    const d = inputVelocity(false, true, false, true);
    expect(Math.hypot(d.vx, d.vy)).toBeCloseTo(WALK_SPEED, 5);
    expect(inputVelocity(true, true, false, false)).toEqual({ vx: 0, vy: 0 });
  });
  it('facing follows the dominant direction and keeps the last one when standing', () => {
    expect(facing(-3, 1, 0)).toBe(1);
    expect(facing(3, 1, 0)).toBe(2);
    expect(facing(0, -3, 0)).toBe(3);
    expect(facing(0, 3, 3)).toBe(0);
    expect(facing(0, 0, 2)).toBe(2);
  });
});

describe('seeing other people move (only direction changes are sent)', () => {
  const m = buildPersonalOffice();
  const solid = buildSolid(m, []);
  it('a standing person stays put', () => {
    expect(extrapolate(solid, { x: 5, y: 5, vx: 0, vy: 0, at: 0 }, 5000)).toEqual({ x: 5, y: 5 });
  });
  it('a walking person is placed where they should have got to', () => {
    const p = extrapolate(solid, { x: 3, y: 5.5, vx: 4, vy: 0, at: 0 }, 1000);
    expect(p.x).toBeCloseTo(7, 1);
  });
  it('extrapolation stops at walls', () => {
    const p = extrapolate(solid, { x: 12.5, y: 5.5, vx: 4.5, vy: 0, at: 0 }, 3000);
    expect(p.x).toBeLessThan(15);
    expect(collides(solid, p.x, p.y)).toBe(false);
  });
  it('gives up after a few seconds so a lost message cannot send someone walking forever', () => {
    const near = extrapolate(solid, { x: 3, y: 5.5, vx: 1, vy: 0, at: 0 }, 3000);
    const far = extrapolate(solid, { x: 3, y: 5.5, vx: 1, vy: 0, at: 0 }, 60000);
    expect(far.x).toBeCloseTo(near.x, 5);
  });
});

describe('rooms', () => {
  const m = buildTeamOffice();
  it('finds the meeting room a person is standing in', () => {
    expect(zoneAt(m, 33.5, 5.5)?.name).toBe('Meeting Room 1');
    expect(zoneAt(m, 33.5, 12.5)?.name).toBe('Meeting Room 2');
    expect(zoneAt(m, 33.5, 20.5)?.name).toBe('Meeting Room 3');
  });
  it('finds the lounge and the open floor', () => {
    expect(zoneAt(m, 8.5, 20.5)?.name).toBe('Lounge');
    expect(zoneAt(m, 14.5, 13.5)?.name).toBe('Open office');
  });
  it('outside every room is null', () => expect(zoneAt(m, 39.5, 25.5)).toBeNull());
});

describe('placing furniture', () => {
  const m = buildPersonalOffice();
  const base = m.items;
  it('rotation swaps width and height', () => {
    expect(itemSize({ t: 'desk', r: 0 })).toEqual({ w: 2, h: 1 });
    expect(itemSize({ t: 'desk', r: 1 })).toEqual({ w: 1, h: 2 });
    expect(itemSize({ t: 'table', r: 3 })).toEqual({ w: 2, h: 3 });
  });
  it('allows furniture on free floor', () => {
    expect(canPlace(m, base, { id: 'n', t: 'plant', x: 3, y: 5 }).ok).toBe(true);
  });
  it('refuses a wall or outside the room', () => {
    expect(canPlace(m, base, { id: 'n', t: 'plant', x: 0, y: 5 }).ok).toBe(false);
    expect(canPlace(m, base, { id: 'n', t: 'plant', x: 40, y: 5 }).ok).toBe(false);
  });
  it('refuses solid furniture on top of other solid furniture', () => {
    const desk = base.find((i) => i.t === 'desk')!;
    expect(canPlace(m, base, { id: 'n', t: 'plant', x: desk.x, y: desk.y }).ok).toBe(false);
  });
  it('lets a rug go under furniture', () => {
    const desk = base.find((i) => i.t === 'desk')!;
    expect(canPlace(m, base, { id: 'n', t: 'rug', x: desk.x, y: desk.y }).ok).toBe(true);
  });
  it('a computer must sit on a desk and only one per spot', () => {
    expect(canPlace(m, base.filter((i) => i.t !== 'computer'), { id: 'n', t: 'computer', x: 6, y: 2 }).ok).toBe(true);
    expect(canPlace(m, base, { id: 'n', t: 'computer', x: 3, y: 5 }).ok).toBe(false);
    expect(canPlace(m, base, { id: 'n', t: 'computer', x: 6, y: 2 }).ok).toBe(false);
  });
  it('refuses furniture that would wall off the door', () => {
    // a row of tables across the room in front of the door
    let items: Item[] = base.filter((i) => i.t !== 'sofa' && i.t !== 'rug');
    let blocked = false;
    for (let x = 1; x <= 14; x += 3) {
      const res = canPlace(m, items, { id: `t${x}`, t: 'table', x, y: 7, r: 0 });
      if (!res.ok) { blocked = true; break; }
      items = [...items, { id: `t${x}`, t: 'table', x, y: 7 }];
    }
    // the last tables must have been refused, or the room is still connected
    const seen = reachable(buildSolid(m, items), m.spawn.x, m.spawn.y);
    const door = m.zones.find((z) => z.kind === 'portal')!;
    expect(blocked || seen.has(`${door.x},${door.y}`)).toBe(true);
    expect(seen.has(`${door.x},${door.y}`)).toBe(true);
  });
  it('new item ids are unique', () => {
    expect(new Set(Array.from({ length: 50 }, () => newItemId())).size).toBe(50);
  });
});

describe('saved layouts are sanitised', () => {
  const m = buildPersonalOffice();
  it('keeps good furniture and drops junk', () => {
    const out = sanitizeItems(m, [
      { id: 'd', t: 'desk', x: 6, y: 2, r: 0 },
      { id: 'c', t: 'computer', x: 6, y: 2 },
      { id: 'bad1', t: 'spaceship', x: 3, y: 3 },
      { id: 'bad2', t: 'plant', x: 0, y: 0 },
      { id: 'bad3', t: 'plant', x: 'x', y: 3 },
      { id: 'bad4', t: 'plant', x: 2.5, y: 3 },
      null, 7, 'text',
    ]);
    expect(out.map((i) => i.id)).toEqual(['d', 'c']);
  });
  it('falls back to the template when there is no list', () => {
    expect(sanitizeItems(m, undefined)).toEqual(m.items);
    expect(sanitizeItems(m, 'nope')).toEqual(m.items);
  });
  it('drops a computer that is not on a desk and overlapping solid furniture', () => {
    const out = sanitizeItems(m, [
      { id: 'c', t: 'computer', x: 3, y: 5 },
      { id: 'p1', t: 'plant', x: 4, y: 4 },
      { id: 'p2', t: 'plant', x: 4, y: 4 },
    ]);
    expect(out.map((i) => i.id)).toEqual(['p1']);
  });
  it('gives duplicate ids new ones and caps the size', () => {
    const many = Array.from({ length: 400 }, (_, i) => ({ id: 'same', t: 'rug', x: 1 + (i % 10), y: 1 + Math.floor(i / 10) % 8 }));
    const out = sanitizeItems(m, many);
    expect(new Set(out.map((i) => i.id)).size).toBe(out.length);
    expect(out.length).toBeLessThanOrEqual(300);
  });
});

describe('findPath', () => {
  // 5x5 room, wall across the middle with a gap at x=4
  const g = () => Array.from({ length: 5 }, (_, y) => Array.from({ length: 5 }, (_, x) => y === 2 && x < 4));
  it('goes around a wall through the gap and ends on the target tile', () => {
    const p = findPath(g(), 0.5, 0.5, 0.5, 4.5)!;
    expect(p.length).toBeGreaterThan(0);
    expect(p[p.length - 1]).toEqual({ x: 0.5, y: 4.5 });
    expect(p.some((w) => w.x === 4.5)).toBe(true);
  });
  it('returns an empty route when already there and null when walled in', () => {
    expect(findPath(g(), 0.5, 0.5, 0.7, 0.6)).toEqual([]);
    const closed = Array.from({ length: 5 }, (_, y) => Array.from({ length: 5 }, (_, x) => y === 2));
    expect(findPath(closed, 0.5, 0.5, 0.5, 4.5)).toBeNull();
  });
  it('ends next to a blocked target tile', () => {
    const p = findPath(g(), 0.5, 3.5, 0.5, 2.5)!;
    expect(p.length).toBeLessThanOrEqual(1);
  });
  it('finds a route from the team office entrance to a meeting room', () => {
    const map = buildTeamOffice();
    const solid = buildSolid(map, map.items);
    const room = map.zones.find((z) => z.id.includes('meet'))!;
    const p = findPath(solid, map.spawn.x, map.spawn.y, room.x + room.w / 2, room.y + room.h / 2);
    expect(p).not.toBeNull();
  });
});

describe('default avatars', () => {
  it('always have every field filled in, whatever the id (a missing colour once crashed the drawing)', async () => {
    const { defaultAvatar, cleanAvatar } = await import('../world/render');
    for (let i = 0; i < 800; i++) {
      const id = `${i.toString(16).padStart(8, '0')}-aaaa-bbbb-cccc-${(i * 7919).toString(16).padStart(12, '0')}`;
      for (const a of [defaultAvatar(id), defaultAvatar(id, 'female'), defaultAvatar(id, 'male'), cleanAvatar({}, id, 'female'), cleanAvatar(null, id)]) {
        for (const k of ['skin', 'hair', 'shirt', 'pants'] as const) expect(a[k]).toMatch(/^#[0-9a-fA-F]{6}$/);
        expect([0, 1, 2, 3, 4, 5, 6, 7]).toContain(a.hairStyle);
        expect([0, 1, 2, 3, 4]).toContain(a.outfit);
        expect([0, 1, 2, 3, 4, 5, 6]).toContain(a.accessory);
        expect([0, 1, 2, 3]).toContain(a.beard);
      }
    }
  });
});

describe('headquarters', () => {
  const people = [{ name: 'Ada L.' }, { name: 'Kelvin J.' }];
  const m = buildHQ(people);
  it('has nine private offices with name plates, three meeting rooms, a boardroom and an auditorium', () => {
    expect(m.zones.filter((z) => z.kind === 'office')).toHaveLength(9);
    expect(m.zones.find((z) => z.id === 'office-1')?.sign?.name).toBe('Ada L.');
    expect(m.zones.find((z) => z.id === 'office-9')?.sign?.name).toBe('Free office');
    expect(m.zones.filter((z) => z.kind === 'meeting').map((z) => z.id)).toEqual(expect.arrayContaining(['meeting-1', 'meeting-2', 'meeting-3', 'boardroom', 'auditorium']));
  });
  it('every piece of furniture can really be placed where it is, in order', () => {
    const placed: Item[] = [];
    const bad: string[] = [];
    for (const item of m.items) {
      const r = canPlace(m, placed, item);
      if (!r.ok) bad.push(item.t + ' at ' + item.x + ',' + item.y + ': ' + ('reason' in r ? r.reason : ''));
      placed.push(item);
    }
    expect(bad).toEqual([]);
  });
  it('the entrance, every private office and every room can be walked to from where you arrive', () => {
    const seen = reachable(buildSolid(m, m.items), m.spawn.x, m.spawn.y);
    for (const z of m.zones.filter((q) => q.kind !== 'area')) {
      let any = false;
      for (let y = z.y; y < z.y + z.h && !any; y++) for (let x = z.x; x < z.x + z.w && !any; x++) if (seen.has(x + ',' + y)) any = true;
      expect(any, z.name).toBe(true);
    }
  });
  it('the private offices count as private rooms', () => {
    expect(isRoom(zoneAt(m, 5.5, 5.5))).toBe(true);
    expect(isRoom(zoneAt(m, 20.5, 20.5))).toBe(false);
  });
});

describe('painting walls and floors', () => {
  it('applies painted walls, erased walls and floors without touching the original', () => {
    const m = buildHQ([]);
    const open = 20 * m.w + 20; // somewhere on the open floor
    const wall = 2 * m.w + 10; // part of the top wall
    expect(m.walls[20][20]).toBe(false);
    expect(m.walls[2][10]).toBe(true);
    const edited = applyTileEdits(m, { wallsOn: [open], wallsOff: [wall], floors: { '21,21': 'grass' } });
    expect(edited.walls[20][20]).toBe(true);
    expect(edited.walls[2][10]).toBe(false);
    expect(edited.floorOverrides?.['21,21']).toBe('grass');
    expect(m.walls[20][20]).toBe(false);
  });
  it('ignores nonsense tile numbers and empty edits', () => {
    const m = buildHQ([]);
    expect(applyTileEdits(m, undefined)).toBe(m);
    expect(() => applyTileEdits(m, { wallsOn: [-5, 1e9, 1.5], wallsOff: [], floors: {} })).not.toThrow();
  });
  it('a new blank space is a closed room you can stand in', () => {
    const b = buildBlank();
    expect(b.walls[0][0]).toBe(true);
    expect(buildSolid(b, b.items)[Math.floor(b.spawn.y)][Math.floor(b.spawn.x)]).toBe(false);
  });
});
