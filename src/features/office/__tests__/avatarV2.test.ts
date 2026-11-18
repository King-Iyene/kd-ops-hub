import { describe, expect, it } from 'vitest';
import { cleanAvatar, defaultAvatar } from '../world/render';

describe('avatar options', () => {
  it('accepts the new hairstyles, outfits and clothing layers', () => {
    const base = defaultAvatar('someone');
    const a = cleanAvatar({ ...base, hairStyle: 10, outfit: 6, jacket: 3, jacketColor: '#16a34a', tie: 3, shoes: 2, hat: 4, glasses: 2, extra: 2 }, 'someone');
    expect([a.hairStyle, a.outfit, a.jacket, a.tie, a.shoes, a.hat, a.glasses, a.extra]).toEqual([10, 6, 3, 3, 2, 4, 2, 2]);
    expect(a.jacketColor).toBe('#16a34a');
  });
  it('still rejects numbers and colours that are not an option', () => {
    const base = defaultAvatar('someone');
    const a = cleanAvatar({ ...base, hairStyle: 11, outfit: 7, jacket: 9, tie: 9, shoes: 9, hat: 9, glasses: 9, extra: 9, jacketColor: 'red; drop table' }, 'someone');
    expect(a.hairStyle).toBe(base.hairStyle);
    expect(a.outfit).toBe(base.outfit);
    expect([a.jacket, a.tie, a.shoes, a.hat, a.glasses, a.extra]).toEqual([base.jacket, base.tie, base.shoes, base.hat, base.glasses, base.extra]);
    expect(a.jacketColor).toBe(base.jacketColor);
  });
  it('turns an avatar saved with the old single accessory into the new slots, looking the same', () => {
    const old = { skin: '#c68642', hair: '#1c1917', shirt: '#2563eb', hairStyle: 0, outfit: 0, accessory: 3, pants: '#111827', beard: 0 };
    const cap = cleanAvatar(old, 'x');
    expect(cap.hat).toBe(1);
    expect(cap.hatColor).toBe('#2563eb'); // the cap keeps the colour it used to have
    expect(cleanAvatar({ ...old, accessory: 4 }, 'x').glasses).toBe(2);
    expect(cleanAvatar({ ...old, accessory: 2 }, 'x').extra).toBe(1);
    expect(cleanAvatar({ ...old, accessory: 7 }, 'x').extra).toBe(2);
    expect(cleanAvatar({ ...old, accessory: 8 }, 'x').tie).toBe(2);
    expect(cleanAvatar({ ...old, accessory: 0 }, 'x').hat).toBe(0);
  });
  it('every default avatar has all the layers filled in', () => {
    for (const id of ['a', 'bb', 'ccc', 'dddd']) for (const g of ['male', 'female', null]) {
      const a = defaultAvatar(id, g);
      expect(typeof a.jacketColor).toBe('string');
      expect([0, 1, 2, 3]).toContain(a.shoes);
      expect([0, 1, 2, 3, 4]).toContain(a.hat);
    }
  });
});
