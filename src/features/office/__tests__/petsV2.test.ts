import { describe, expect, it } from 'vitest';
import { applyPetCmd, heelPoint, initPet, stepPet } from '../world/pets';

const open = Array.from({ length: 60 }, () => Array<boolean>(60).fill(false));

describe('pets keep up and look the right way', () => {
  it('a following dog keeps up with an owner walking at full speed', () => {
    const pet = initPet('d1', 'dog', 5, 5);
    applyPetCmd(pet, { kind: 'call', id: 'd1' }, 0, { x: 5, y: 5, dir: 2 }, open);
    const me = { x: 8, y: 5, dir: 2 as const };
    for (let i = 0; i < 180; i++) {
      me.x += 4.5 * 0.05; // the owner walks right at 4.5 tiles a second
      stepPet(pet, 0.05, i * 50, me, open, () => 0.5);
    }
    expect(Math.hypot(pet.x - me.x, pet.y - me.y)).toBeLessThan(3);
  });
  it('it stands beside its owner, not on top of them', () => {
    const pet = initPet('d2', 'dog', 5, 5);
    const heel = heelPoint(pet, { x: 20, y: 20, dir: 0 });
    const d = Math.hypot(heel.x - 20, heel.y - 20);
    expect(d).toBeGreaterThan(0.8);
    expect(d).toBeLessThan(2);
  });
  it('walking down the screen shows its front, up shows its back, sideways its side', () => {
    const pet = initPet('d3', 'dog', 10, 10);
    pet.mode = 'follow';
    for (let i = 0; i < 40; i++) stepPet(pet, 0.05, i * 50, { x: 10.5, y: 30, dir: 0 }, open, () => 0.5);
    expect(pet.view).toBe('front');
    for (let i = 0; i < 80; i++) stepPet(pet, 0.05, i * 50, { x: 10.5, y: 2, dir: 3 }, open, () => 0.5);
    expect(pet.view).toBe('back');
    for (let i = 0; i < 60; i++) stepPet(pet, 0.05, i * 50, { x: 40, y: pet.y, dir: 2 }, open, () => 0.5);
    expect(pet.view).toBe('side');
    expect(pet.face).toBe(1);
  });
});
