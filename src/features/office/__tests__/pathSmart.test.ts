import { describe, expect, it } from 'vitest';
import { collides, findPath, smoothRoute, tilesOfPeople } from '../world/world';

/** '#' wall, '.' floor */
const grid = (rows: string[]) => rows.map((r) => [...r].map((c) => c === '#'));

describe('walking routes', () => {
  it('cut the corners off: an open room is crossed in one straight line, not along the walls', () => {
    const solid = grid(['##########', '#........#', '#........#', '#........#', '#........#', '#........#', '##########']);
    const raw = findPath(solid, 1.5, 1.5, 8.5, 5.5)!;
    expect(raw.length).toBeGreaterThan(1);
    const smooth = smoothRoute(solid, { x: 1.5, y: 1.5 }, raw);
    expect(smooth).toEqual([{ x: 8.5, y: 5.5 }]);
  });

  it('never cut through a wall: the route still goes through the door', () => {
    const solid = grid([
      '############',
      '#....#.....#',
      '#....#.....#',
      '#..........#',   // the door is the gap in the wall at the bottom row of the divider
      '#....#.....#',
      '#....#.....#',
      '############',
    ]);
    const from = { x: 1.5, y: 1.5 };
    const raw = findPath(solid, from.x, from.y, 10.5, 1.5)!;
    const smooth = smoothRoute(solid, from, raw);
    expect(smooth.length).toBeLessThanOrEqual(raw.length);
    // every leg of the smoothed route is walkable for a body (no corner clipped)
    let a = from;
    for (const b of smooth) {
      for (let i = 0; i <= 40; i++) expect(collides(solid, a.x + ((b.x - a.x) * i) / 40, a.y + ((b.y - a.y) * i) / 40)).toBe(false);
      a = b;
    }
    expect(smooth[smooth.length - 1]).toEqual({ x: 10.5, y: 1.5 });
    expect(smooth.some((p) => p.y > 2.5 && p.y < 3.6)).toBe(true); // it passes through the doorway row
  });

  it('go round somebody standing in the way when there is another way', () => {
    const solid = grid(['#########', '#.......#', '#.......#', '#.......#', '#########']);
    const people = tilesOfPeople([{ x: 4.5, y: 2.5 }], 9);
    const around = findPath(solid, 1.5, 2.5, 7.5, 2.5, people)!;
    expect(around.some((p) => Math.hypot(p.x - 4.5, p.y - 2.5) < 0.9)).toBe(false);
  });

  it('a person in a one-tile doorway cannot be passed: no way round, so the plan without them is used', () => {
    const solid = grid(['#####', '#.#.#', '#...#', '#.#.#', '#####']);
    // the doorway is the middle column of row 2; somebody stands in it
    const people = tilesOfPeople([{ x: 2.5, y: 2.5 }], 5);
    expect(findPath(solid, 1.5, 1.5, 3.5, 1.5, people)).toBeNull();
    expect(findPath(solid, 1.5, 1.5, 3.5, 1.5)).not.toBeNull();
  });

  it('can always start and finish on a tile a person is on (a person at the desk you walk to)', () => {
    const solid = grid(['#####', '#...#', '#####']);
    const people = tilesOfPeople([{ x: 3.5, y: 1.5 }], 5);
    expect(findPath(solid, 1.5, 1.5, 3.5, 1.5, people)).not.toBeNull();
  });
});
