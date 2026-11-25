import { describe, expect, it } from 'vitest';
import { CATEGORIES } from '../catalog';
import { INTERACTIVE, ITEM_DEFS, itemSize, sanitizeItems } from '../world/world';
import { buildBlank } from '../world/templates';

describe('the mission and vision wall', () => {
  it('is a 4 by 1 wall board you can press F on, listed with the other info boards', () => {
    expect(ITEM_DEFS.missionwall).toMatchObject({ w: 4, h: 1, solid: true });
    expect(itemSize({ t: 'missionwall', r: 0 })).toEqual({ w: 4, h: 1 });
    expect(INTERACTIVE.missionwall).toBe('Mission & vision');
    expect(CATEGORIES.find((c) => c.id === 'info')?.types).toContain('missionwall');
  });
  it('survives a save and load of the layout', () => {
    const map = buildBlank();
    const kept = sanitizeItems(map, [{ id: 'm1', t: 'missionwall', x: 10, y: 6 }]);
    expect(kept.some((i) => i.t === 'missionwall')).toBe(true);
  });
});
