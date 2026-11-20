import { describe, expect, it } from 'vitest';
import { CATEGORIES } from '../catalog';
import { ITEM_DEFS, SEAT_TYPES, SURFACE_ITEMS, canPlace, itemCells, seatAt } from '../world/world';
import { buildBlank } from '../world/templates';
import type { Item, ItemType } from '../world/types';

const NEW_FURNITURE: ItemType[] = ['longtable', 'worktable', 'sidetable', 'conference', 'bed', 'singlebed', 'nightstand', 'wardrobe', 'dresser', 'mirror', 'clothesrack', 'mannequin', 'shoerack', 'armchair', 'loveseat', 'ottoman'];
const FLAT_TABLES: ItemType[] = ['longtable', 'worktable', 'sidetable', 'conference', 'nightstand', 'dresser', 'table', 'coffeetable', 'roundtable'];

const CHAIRS: ItemType[] = ['executivechair', 'gamingchair', 'diningchair', 'barstool', 'rockingchair', 'armchair', 'loveseat', 'ottoman'];

describe('different kinds of chair', () => {
  it('every kind of chair is in the catalogue and can be sat on', () => {
    const seating = CATEGORIES.find((cat) => cat.id === 'seating');
    for (const t of CHAIRS) {
      expect(seating?.types, t + ' is not in Seating').toContain(t);
      expect(SEAT_TYPES, t + ' cannot be sat on').toContain(t);
      const chair: Item = { id: 'c-' + t, t, x: 5, y: 5 };
      expect(seatAt([chair], 5.5, 5.5)?.item.t, t).toBe(t);
    }
  });
});

describe('more furniture', () => {
  it('every new piece has a size and a name, and can be picked from the catalogue', () => {
    const inCatalogue = new Set(CATEGORIES.flatMap((c) => c.types));
    for (const t of NEW_FURNITURE) {
      expect(ITEM_DEFS[t], `${t} has no definition`).toBeTruthy();
      expect(ITEM_DEFS[t].label.length, `${t} has no label`).toBeGreaterThan(2);
      expect(inCatalogue.has(t), `${t} is not in the catalogue`).toBe(true);
    }
  });

  it('there is a bedroom and clothes section', () => {
    const bedroom = CATEGORIES.find((c) => c.id === 'bedroom');
    expect(bedroom).toBeTruthy();
    for (const t of ['bed', 'wardrobe', 'dresser', 'mirror', 'clothesrack', 'mannequin'] as ItemType[]) expect(bedroom?.types).toContain(t);
  });

  it('a computer, papers and a mug can go on every flat table, on any tile of it', () => {
    const map = buildBlank();
    const a = map.buildArea;
    for (const t of FLAT_TABLES) {
      expect(SURFACE_ITEMS, `${t} is not a surface`).toContain(t);
      const table: Item = { id: 'tbl', t, x: a.x + 2, y: a.y + 2 };
      expect(canPlace(map, [], table).ok, `${t} cannot be placed`).toBe(true);
      for (const cell of itemCells(table)) {
        for (const small of ['computer', 'papers', 'mug'] as ItemType[]) {
          const on: Item = { id: 'on-' + small, t: small, x: cell.x, y: cell.y };
          expect(canPlace(map, [table], on).ok, `${small} on ${t} at ${cell.x},${cell.y}`).toBe(true);
        }
      }
    }
  });

  it('a computer does not go on a bed or a wardrobe, only on something flat', () => {
    const map = buildBlank();
    const a = map.buildArea;
    for (const t of ['bed', 'wardrobe', 'armchair', 'mirror'] as ItemType[]) {
      const piece: Item = { id: 'p', t, x: a.x + 2, y: a.y + 2 };
      const on: Item = { id: 'c', t: 'computer', x: piece.x, y: piece.y };
      expect(canPlace(map, [piece], on).ok, `computer should not sit on a ${t}`).toBe(false);
    }
  });

  it('two big pieces cannot share a tile', () => {
    const map = buildBlank();
    const a = map.buildArea;
    const bed: Item = { id: 'b1', t: 'bed', x: a.x + 2, y: a.y + 2 };
    const wardrobe: Item = { id: 'w1', t: 'wardrobe', x: a.x + 3, y: a.y + 3 };
    expect(canPlace(map, [bed], wardrobe).ok).toBe(false);
  });
});
