import { describe, expect, it } from 'vitest';
import { PLAY_MS, initPet, playTick, stepPet, type PetState } from '../world/pets';

const open = Array.from({ length: 40 }, () => Array<boolean>(40).fill(false));
const away = { x: 35, y: 35 };

function pair() {
  const dog = initPet('dog1', 'dog', 10, 10);
  const cat = initPet('cat1', 'cat', 12, 10);
  for (const p of [dog, cat]) { p.wait = 3; p.moving = false; }
  return { dog, cat, all: new Map<string, PetState>([[dog.id, dog], [cat.id, cat]]) };
}

describe('a dog and a cat playing', () => {
  it('start a game when they are idle close to each other', () => {
    const { dog, cat } = pair();
    playTick([dog, cat], 0, 1, () => 0);
    expect(dog.mode).toBe('play');
    expect(cat.mode).toBe('play');
    expect(dog.partner).toBe('cat1');
    expect(cat.partner).toBe('dog1');
  });
  it('do not start when far apart or when one is busy following someone', () => {
    const a = pair();
    a.cat.x = 30; a.cat.y = 30;
    playTick([a.dog, a.cat], 0, 1, () => 0);
    expect(a.dog.mode).toBe('wander');
    const b = pair();
    b.dog.mode = 'follow';
    playTick([b.dog, b.cat], 0, 1, () => 0);
    expect(b.cat.mode).toBe('wander');
  });
  it('chase each other round and then settle down', () => {
    const { dog, cat, all } = pair();
    playTick([dog, cat], 0, 1, () => 0);
    const start = { dx: dog.x, cx: cat.x };
    let moved = false;
    for (let t = 0; t < PLAY_MS + 1500; t += 50) {
      stepPet(dog, 0.05, t, away, open, () => 0.5, all);
      stepPet(cat, 0.05, t, away, open, () => 0.5, all);
      if (Math.abs(dog.x - start.dx) > 1 || Math.abs(cat.x - start.cx) > 1) moved = true;
    }
    expect(moved).toBe(true);
    expect(dog.mode).toBe('wander');
    expect(cat.mode).toBe('wander');
    expect(dog.partner).toBeNull();
  });
  it('the game ends if one of them is called away', () => {
    const { dog, cat, all } = pair();
    playTick([dog, cat], 0, 1, () => 0);
    cat.mode = 'follow';
    stepPet(dog, 0.05, 100, away, open, () => 0.5, all);
    expect(['home', 'wander']).toContain(dog.mode); // it heads back to its own spot
  });
});
