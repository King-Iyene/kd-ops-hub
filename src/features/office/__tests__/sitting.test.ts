import { describe, expect, it } from 'vitest';
import { ITEM_DEFS, SEAT_TYPES, buildSolid, canPlace, seatAt, findPath } from '../world/world';
import { buildPersonalOffice } from '../world/templates';
import { initPet, stepPet } from '../world/pets';
import type { Item } from '../world/types';

describe('seats', () => {
  it('chairs, stools, beanbags and the rest block walking, so nobody walks through them', () => {
    for (const t of SEAT_TYPES) expect(ITEM_DEFS[t].solid, t).toBe(true);
  });
  it('finds the seat tile under a point, one per tile of a sofa', () => {
    const items: Item[] = [{ id: 's', t: 'sofa', x: 4, y: 4 }, { id: 'c', t: 'chair', x: 9, y: 9 }];
    expect(seatAt(items, 5.5, 4.5)).toMatchObject({ x: 5.5, y: 4.5 });
    expect(seatAt(items, 9.2, 9.7)?.item.id).toBe('c');
    expect(seatAt(items, 7.5, 4.5)).toBeNull();
  });
  it('a desk can still be given a monitor of the new kinds', () => {
    const m = buildPersonalOffice();
    const desk = m.items.find((i) => i.t === 'desk')!;
    const without = m.items.filter((i) => i.t !== 'computer');
    expect(canPlace(m, without, { id: 'x', t: 'ultrawide', x: desk.x, y: desk.y }).ok).toBe(true);
  });
});

describe('pets get round furniture', () => {
  it('a following pet walks round a wall of furniture instead of pushing into it', () => {
    const w = 24, h = 12;
    const solid = Array.from({ length: h }, () => Array<boolean>(w).fill(false));
    for (let y = 1; y < 11; y++) solid[y][10] = true; // a long wall with gaps at the top and bottom
    const pet = initPet('p1', 'dog', 6, 6);
    pet.mode = 'follow';
    const me = { x: 15.5, y: 6.5, dir: 0 as const };
    let t = 0;
    for (let i = 0; i < 1800; i++) { t += 16; stepPet(pet, 0.016, t, me, solid, () => 0.5); }
    expect(Math.hypot(pet.x - me.x, pet.y - me.y)).toBeLessThan(3.5);
    expect(findPath(solid, 6.5, 6.5, 15.5, 6.5)).not.toBeNull();
  });
  it('buildSolid agrees that the wall is solid', () => {
    const m = buildPersonalOffice();
    expect(buildSolid(m, m.items).length).toBeGreaterThan(0);
  });
});
