import { describe, expect, it } from 'vitest';
import { CATEGORIES } from '../catalog';
import { ITEM_DEFS } from '../world/world';

describe('water and nature items', () => {
  const types = ['pond', 'waterfall', 'sea', 'sand', 'flowerbed', 'rocks', 'birdbath', 'beachchair', 'umbrella', 'towel', 'sandcastle', 'dock', 'boat'] as const;
  it('each has a size and a name and can be picked in the editor', () => {
    const listed = CATEGORIES.flatMap((c) => c.types);
    for (const t of types) {
      expect(ITEM_DEFS[t].w).toBeGreaterThan(0);
      expect(ITEM_DEFS[t].label.length).toBeGreaterThan(2);
      expect(listed).toContain(t);
    }
  });
  it('you can walk on sand but not through water or rocks', () => {
    expect(ITEM_DEFS.sand.solid).toBe(false);
    expect(ITEM_DEFS.dock.solid).toBe(false);
    expect(ITEM_DEFS.towel.solid).toBe(false);
    for (const t of ['pond', 'waterfall', 'sea', 'rocks', 'umbrella'] as const) expect(ITEM_DEFS[t].solid).toBe(true);
  });
});
