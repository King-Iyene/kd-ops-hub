import { describe, expect, it } from 'vitest';
import { KEY_GUIDE } from '../ProfileMenu';

describe('keyboard guide in the profile menu', () => {
  const all = KEY_GUIDE.flatMap((g) => g.rows);
  it('lists the keys people ask about', () => {
    for (const k of ['F', 'G', 'X', 'E', 'H', 'M']) expect(all.some(([keys]) => keys.length === 1 && keys[0] === k)).toBe(true);
  });
  it('says G is held, not pressed', () => {
    expect(all.find(([keys]) => keys[0] === 'G')?.[1]).toMatch(/hold/i);
  });
  it('has no row without a key or a description', () => {
    for (const [keys, what] of all) { expect(keys.length).toBeGreaterThan(0); expect(what.length).toBeGreaterThan(3); }
  });
});
