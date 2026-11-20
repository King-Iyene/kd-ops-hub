import { describe, expect, it } from 'vitest';
import { FLOOR_KINDS } from '../EditorPanel';

describe('floor materials', () => {
  it('offers the original floors and the new ones, each once', () => {
    const ids = FLOOR_KINDS.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ['wood', 'grass', 'stone', 'gray', 'carpet', 'tile', 'darkwood', 'marble', 'checker', 'navy', 'sage', 'sand', 'brick', 'bluetile']) expect(ids, id).toContain(id);
  });
  it('every floor has a name and a colour swatch', () => {
    for (const f of FLOOR_KINDS) {
      expect(f.label.length).toBeGreaterThan(2);
      expect(f.swatch).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });
});
