import { describe, expect, it } from 'vitest';
import { applyPetCmd, applyPetSnap, initPet, petSnap, stepPet } from '../world/pets';

const open = Array.from({ length: 140 }, () => Array<boolean>(140).fill(false));

function chase(kind: 'dog' | 'cat', speed: number, seconds: number) {
  const pet = initPet('p1', kind, 5, 5);
  applyPetCmd(pet, { kind: 'call', id: 'p1' }, 0, { x: 5, y: 5, dir: 2 }, open, 'me');
  const me = { x: 8, y: 5, dir: 2 as const, speed };
  const dt = 1 / 60;
  let worst = 0;
  for (let i = 0; i < seconds * 60; i++) {
    me.x += speed * dt;
    stepPet(pet, dt, i * 16, me, open, () => 0.5);
    worst = Math.max(worst, Math.hypot(pet.x - me.x, pet.y - me.y));
  }
  return { pet, me, worst, end: Math.hypot(pet.x - me.x, pet.y - me.y) };
}

describe('pets are faster than the people they follow', () => {
  it('a dog keeps up with a person running (6.4 tiles a second)', () => {
    const r = chase('dog', 6.4, 8);
    expect(r.end).toBeLessThan(3);
    expect(r.worst).toBeLessThan(5);
  });
  it('a dog and a cat both keep up with a person on a bike (about 12.5 tiles a second)', () => {
    for (const k of ['dog', 'cat'] as const) {
      const r = chase(k, 12.5, 7);
      expect(r.end, k).toBeLessThan(4);
    }
  });
  it('a pet far behind is never left behind: it runs faster than its person', () => {
    const pet = initPet('p2', 'dog', 5, 5);
    applyPetCmd(pet, { kind: 'call', id: 'p2' }, 0, { x: 5, y: 5, dir: 2 }, open, 'me');
    const me = { x: 25, y: 5, dir: 2 as const, speed: 6.4 };
    const start = Math.hypot(pet.x - me.x, pet.y - me.y);
    for (let i = 0; i < 120; i++) { me.x += 6.4 / 60; stepPet(pet, 1 / 60, i * 16, me, open, () => 0.5); }
    expect(Math.hypot(pet.x - me.x, pet.y - me.y)).toBeLessThan(start - 2.5);
  });
});

describe('a pet on another screen keeps moving between updates', () => {
  it('is carried along the way it was going instead of waiting, and is not snapped for a normal lag', () => {
    const runner = initPet('p3', 'dog', 5, 5);
    runner.mode = 'follow'; runner.moving = true; runner.x = 30; runner.y = 5; runner.vx = 12; runner.vy = 0; runner.v = 12;
    const snap = { ...petSnap(runner, 0), at: 0 };
    expect(snap.vx).toBe(12);
    const viewer = initPet('p3', 'dog', 5, 5);
    viewer.x = 27.5; viewer.y = 5;
    // 200 ms after the snapshot arrived the dog should be about 2.4 tiles on from where it was sent
    for (let i = 0; i < 12; i++) applyPetSnap(viewer, snap, 17 * (i + 1), 1 / 60);
    expect(viewer.x).toBeGreaterThan(29.5);
    expect(viewer.x).toBeLessThan(33.5);
  });
  it('a pet that was sent far away is put there at once', () => {
    const viewer = initPet('p4', 'dog', 5, 5);
    const snap = { ...petSnap(initPet('p4', 'dog', 60, 60), 0), at: 0 };
    applyPetSnap(viewer, snap, 10, 1 / 60);
    expect(viewer.x).toBeCloseTo(60.5, 0);
  });
});
