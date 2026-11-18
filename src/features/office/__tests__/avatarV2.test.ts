import { describe, expect, it } from 'vitest';
import { cleanAvatar, defaultAvatar } from '../world/render';

describe('avatar options', () => {
  it('accepts the new hairstyles, outfits and accessories', () => {
    const base = defaultAvatar('someone');
    const a = cleanAvatar({ ...base, hairStyle: 10, outfit: 6, accessory: 8 }, 'someone');
    expect([a.hairStyle, a.outfit, a.accessory]).toEqual([10, 6, 8]);
  });
  it('still rejects numbers that are not an option', () => {
    const base = defaultAvatar('someone');
    const a = cleanAvatar({ ...base, hairStyle: 11, outfit: 7, accessory: 9 }, 'someone');
    expect(a.hairStyle).toBe(base.hairStyle);
    expect(a.outfit).toBe(base.outfit);
    expect(a.accessory).toBe(base.accessory);
  });
});
