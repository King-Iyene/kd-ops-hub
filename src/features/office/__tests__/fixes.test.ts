import { describe, expect, it } from 'vitest';
import { PLAYER_RADIUS, WALK_SPEED, advance } from '../world/world';
import { initPet, lineClear, stepPet } from '../world/pets';
import { DOG_BREEDS, CAT_BREEDS, petSeed, dogBreed, catBreed } from '../world/render';
import { buildHQ } from '../world/templates';
import { PONG, SPEEDS, footAi, newFoot, newPong, speedMult, stepFoot, stepPong } from '../miniGames';

const grid = (w: number, h: number) => Array.from({ length: h }, () => Array<boolean>(w).fill(false));

describe('walking past corners', () => {
  it('eases round the corner of a block instead of stopping dead against it', () => {
    const solid = grid(14, 10);
    solid[5][6] = true; // one block of furniture at tile (6, 5)
    // walking right along the row, but a little too far up so the body clips the block's corner
    let p = { x: 3.5, y: 5.5 - PLAYER_RADIUS - 0.22 };
    for (let i = 0; i < 140; i++) p = advance(solid, p.x, p.y, WALK_SPEED, 0, 1 / 60);
    expect(p.x).toBeGreaterThan(8);
  });
  it('still stops at a flat wall', () => {
    const solid = grid(14, 10);
    for (let y = 0; y < 10; y++) solid[y][8] = true;
    let p = { x: 3.5, y: 5.5 };
    for (let i = 0; i < 200; i++) p = advance(solid, p.x, p.y, WALK_SPEED, 0, 1 / 60);
    expect(p.x).toBeLessThan(8);
  });
});

describe('pets and walls', () => {
  it('knows when a wall is in the way', () => {
    const solid = grid(20, 10);
    for (let y = 0; y < 8; y++) solid[y][10] = true;
    expect(lineClear(solid, 5.5, 4.5, 15.5, 4.5)).toBe(false);
    expect(lineClear(solid, 5.5, 4.5, 8.5, 4.5)).toBe(true);
    expect(lineClear(solid, 5.5, 8.5, 15.5, 8.5)).toBe(true);
  });
  it('a pet called to the other side of a wall goes round it, not along it', () => {
    const solid = grid(24, 12);
    for (let y = 0; y < 10; y++) solid[y][11] = true; // a wall with a gap at the bottom
    const pet = initPet('p', 'dog', 6, 3);
    pet.mode = 'follow';
    const me = { x: 16.5, y: 3.5, dir: 0 as const };
    let t = 0;
    for (let i = 0; i < 1500; i++) { t += 16; stepPet(pet, 0.016, t, me, solid, () => 0.5); }
    expect(Math.hypot(pet.x - me.x, pet.y - me.y)).toBeLessThan(3.5);
  });
});

describe('pet breeds', () => {
  it('neighbouring pets get different breeds, so the office has a mix', () => {
    const dogs = new Set<string>();
    const cats = new Set<string>();
    for (let n = 200; n < 216; n++) { dogs.add(dogBreed(undefined, petSeed('t' + n, 0)).name); cats.add(catBreed(undefined, petSeed('t' + n, 0)).name); }
    expect(dogs.size).toBeGreaterThanOrEqual(6);
    expect(cats.size).toBeGreaterThanOrEqual(6);
  });
  it('the dogs and cats in the headquarters are not all the same breed', () => {
    const hq = buildHQ();
    const dogs = new Set(hq.items.filter((i) => i.t === 'dog').map((i) => dogBreed(undefined, petSeed(i.id, 0)).name));
    const cats = new Set(hq.items.filter((i) => i.t === 'cat').map((i) => catBreed(undefined, petSeed(i.id, 0)).name));
    expect(dogs.size).toBeGreaterThanOrEqual(3);
    expect(cats.size).toBeGreaterThanOrEqual(3);
    expect(DOG_BREEDS.length).toBeGreaterThanOrEqual(8);
    expect(CAT_BREEDS.length).toBeGreaterThanOrEqual(8);
  });
});

describe('game speed', () => {
  it('has four speeds from slow to insane, each faster than the last', () => {
    expect(SPEEDS.map((s) => s.id)).toEqual(['slow', 'normal', 'fast', 'insane']);
    for (let i = 1; i < SPEEDS.length; i++) expect(SPEEDS[i].mult).toBeGreaterThan(SPEEDS[i - 1].mult);
    expect(speedMult('nonsense')).toBe(1);
  });
  it('table tennis serves faster at a higher speed', () => {
    const run = (m: number) => { const s = newPong(m); for (let i = 0; i < 80; i++) stepPong(s, 0.016, () => 0.5); return Math.hypot(s.vx, s.vy); };
    expect(run(2)).toBeGreaterThan(run(1) * 1.8);
    expect(run(0.7)).toBeLessThan(run(1));
  });
  it('a long rally never goes past the top speed for that setting', () => {
    const s = newPong(1.45);
    s.wait = 0; s.bx = 300; s.by = 240; s.vx = -300; s.vy = 0;
    for (let i = 0; i < 3000; i++) { s.p1 = s.by; s.p2 = s.by; stepPong(s, 0.008, () => 0.5); if (s.winner) break; }
    expect(Math.hypot(s.vx, s.vy)).toBeLessThanOrEqual(PONG.maxSpeed * 1.45 + 1);
  });
  it('table football plays at every speed without the ball leaving the table', () => {
    for (const sp of SPEEDS) {
      const s = newFoot(sp.mult);
      for (let i = 0; i < 1500; i++) { footAi(s, 1, 0.016); footAi(s, 2, 0.016); stepFoot(s, 0.016, () => 0.5); if (s.winner) break; expect(Number.isFinite(s.bx) && Number.isFinite(s.by)).toBe(true); expect(s.bx).toBeGreaterThan(-30); expect(s.bx).toBeLessThan(s.w + 30); }
    }
  });
});
