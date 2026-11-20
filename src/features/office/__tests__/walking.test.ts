import { describe, expect, it } from 'vitest';
import { findPath, lineClear, nearestOpenTile, reachable } from '../world/world';

// a small room, a wall with a one-tile door, and a sealed pocket on the far side
//   0 1 2 3 4 5 6
// 0 . . . # . . .
// 1 . . . . . . .   (the door is at x=3, y=1)
// 2 . . . # . . .
// 3 # # # # # # #
// 4 . . . . . . .   (a shut-off strip below the wall)
const solid = (rows: string[]) => rows.map((r) => [...r].map((c) => c === '#'));
const grid = solid([
  '...#...',
  '.......',
  '...#...',
  '#######',
  '.......',
]);

describe('walking helpers', () => {
  it('sees a wall in the way of a straight line, and open floor', () => {
    expect(lineClear(grid, 0.5, 0.5, 2.5, 0.5)).toBe(true);
    expect(lineClear(grid, 0.5, 0.5, 5.5, 0.5)).toBe(false); // through the wall at x=3
    expect(lineClear(grid, 0.5, 1.5, 5.5, 1.5)).toBe(true); // through the doorway
    expect(lineClear(grid, 0.5, 2.5, 0.5, 4.5)).toBe(false); // through the wall below
  });

  it('finds the nearest open tile, and none when everything near is shut', () => {
    const t = nearestOpenTile(grid, 3.5, 0.5, [], 3);
    expect(t).not.toBeNull();
    expect(grid[Math.floor(t!.y)][Math.floor(t!.x)]).toBe(false);
    const taken = [{ x: 2.5, y: 1.5 }];
    const other = nearestOpenTile(grid, 3.5, 0.5, taken, 3);
    expect(other).not.toBeNull();
    expect(Math.hypot(other!.x - 2.5, other!.y - 1.5)).toBeGreaterThanOrEqual(0.8); // never a tile someone is standing on
    expect(nearestOpenTile(grid, 3.5, 3.5, [], 0)).toBeNull(); // inside the wall with no looking around: nothing
  });

  it('routes through the door, and has no route to a shut-off place', () => {
    const route = findPath(grid, 0.5, 0.5, 5.5, 0.5);
    expect(route).not.toBeNull();
    expect(route!.some((p) => Math.floor(p.y) === 1)).toBe(true); // it drops to the row with the door
    expect(findPath(grid, 0.5, 0.5, 4.5, 4.5)).toBeNull();
    // what can be reached never includes the shut-off strip, so a walk there stops at the nearest reachable tile instead of pushing into the wall
    const reach = reachable(grid, 0.5, 0.5);
    expect(reach.has('4,4')).toBe(false);
    expect(reach.has('5,0')).toBe(true);
  });
});
