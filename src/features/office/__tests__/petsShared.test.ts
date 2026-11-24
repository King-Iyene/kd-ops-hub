import { describe, expect, it } from 'vitest';
import { applyPetCmd, applyPetSnap, initPet, petAuthority, petCmdFor, petSnap, stepPet } from '../world/pets';

const open = Array.from({ length: 30 }, () => Array<boolean>(30).fill(false));
const at = { x: 15, y: 15, dir: 0 as const };

describe('one live animal for everybody', () => {
  it('whoever calls it gets it, and calling it from someone else takes it', () => {
    const pet = initPet('d1', 'dog', 3, 3);
    applyPetCmd(pet, { kind: 'call', id: 'd1' }, 0, at, open, 'ann');
    expect(pet.mode).toBe('follow');
    expect(pet.ctl).toBe('ann');
    expect(petCmdFor(pet, 'ann')).toBe('stay');
    expect(petCmdFor(pet, 'bob')).toBe('call');
    applyPetCmd(pet, { kind: 'call', id: 'd1' }, 10, { x: 20, y: 20, dir: 0 }, open, 'bob');
    expect(pet.mode).toBe('follow');
    expect(pet.ctl).toBe('bob');
  });
  it('it follows the person who called it, not whoever runs the pets', () => {
    const pet = initPet('d2', 'dog', 3, 3);
    applyPetCmd(pet, { kind: 'call', id: 'd2' }, 0, at, open, 'ann');
    for (let i = 0; i < 400; i++) stepPet(pet, 0.05, i * 50, { x: 22, y: 22 }, open, () => 0.5);
    expect(Math.hypot(pet.x - 22, pet.y - 22)).toBeLessThan(2.5);
  });
  it('goes back to its own place when sent away, and pottering starts there', () => {
    const pet = initPet('c1', 'cat', 5, 5);
    applyPetCmd(pet, { kind: 'call', id: 'c1' }, 0, at, open, 'ann');
    for (let i = 0; i < 300; i++) stepPet(pet, 0.05, i * 50, { x: 25, y: 25 }, open, () => 0.5);
    applyPetCmd(pet, { kind: 'stay', id: 'c1' }, 0, at, open, 'bob'); // anybody can send it home
    expect(pet.mode).toBe('home');
    for (let i = 0; i < 800; i++) stepPet(pet, 0.05, i * 50, { x: 25, y: 25 }, open, () => 0.5);
    expect(Math.hypot(pet.x - 5.5, pet.y - 5.5)).toBeLessThan(1.5);
    expect(pet.mode).toBe('wander');
  });
  it('the others see the same pet from a snapshot, even with different clocks', () => {
    const a = initPet('d3', 'dog', 8, 8);
    applyPetCmd(a, { kind: 'ball', id: 'd3' }, 1000, at, open, 'ann');
    a.x = 12; a.y = 13; a.happyUntil = 5000;
    const snap = JSON.parse(JSON.stringify(petSnap(a, 1000)));
    const b = initPet('d3', 'dog', 8, 8);
    applyPetSnap(b, snap, 90_000, 1); // a far-off clock
    expect(b.mode).toBe('fetch');
    expect(b.ctl).toBe('ann');
    expect(Math.hypot(b.x - 12, b.y - 13)).toBeLessThan(0.01);
    expect(b.happyUntil - 90_000).toBe(4000);
    expect(b.ball?.thrownAt).toBe(90_000);
  });
  it('everybody agrees who runs the pets, and the next person takes over when they leave', () => {
    expect(petAuthority(['c', 'a', 'b'], 'b')).toBe('a');
    expect(petAuthority(['c', 'b'], 'b')).toBe('b');
    expect(petAuthority([], 'z')).toBe('z');
  });
});
