import { describe, expect, it } from 'vitest';
import { cleanAvatar, defaultAvatar } from '../world/render';
import { BEARDS, BOTTOMS, COSTUMES, EXTRAS, GLASSES, HAIR_CHOICES, HAIR_STYLES, HATS, OUTFITS, SHOES, SKIN_CHOICES } from '../world/avatarParts';
import { COSTUME_KINDS } from '../world/avatarCostumes';

describe('avatar options', () => {
  it('accepts the hairstyles, outfits and clothing layers', () => {
    const base = defaultAvatar('someone');
    const a = cleanAvatar({ ...base, hairStyle: 10, outfit: 6, jacket: 3, jacketColor: '#16a34a', tie: 3, shoes: 2, hat: 4, glasses: 2, extra: 2 }, 'someone');
    expect([a.hairStyle, a.outfit, a.jacket, a.tie, a.shoes, a.hat, a.glasses, a.extra]).toEqual([10, 6, 3, 3, 2, 4, 2, 2]);
    expect(a.jacketColor).toBe('#16a34a');
  });
  it('accepts every option the editor offers, at the very end of each list', () => {
    const base = defaultAvatar('someone');
    const a = cleanAvatar({
      ...base, hairStyle: HAIR_STYLES.length - 1, outfit: OUTFITS.length - 1, beard: BEARDS.length - 1, shoes: SHOES.length - 1, hat: HATS.length - 1,
      glasses: GLASSES.length - 1, extra: EXTRAS.length - 1, bottom: BOTTOMS.length - 1, costume: COSTUMES.length - 1,
    }, 'someone');
    expect([a.hairStyle, a.outfit, a.beard, a.shoes, a.hat, a.glasses, a.extra, a.bottom, a.costume]).toEqual([HAIR_STYLES.length - 1, OUTFITS.length - 1, BEARDS.length - 1, SHOES.length - 1, HATS.length - 1, GLASSES.length - 1, EXTRAS.length - 1, BOTTOMS.length - 1, COSTUMES.length - 1]);
  });
  it('still rejects numbers and colours that are not an option', () => {
    const base = defaultAvatar('someone');
    const a = cleanAvatar({ ...base, hairStyle: 99, outfit: 99, jacket: 9, tie: 9, shoes: 99, hat: 99, glasses: 99, extra: 99, bottom: 99, costume: 99, beard: 99, jacketColor: 'red; drop table' }, 'someone');
    expect(a.hairStyle).toBe(base.hairStyle);
    expect(a.outfit).toBe(base.outfit);
    expect([a.jacket, a.tie, a.shoes, a.hat, a.glasses, a.extra, a.bottom, a.costume, a.beard]).toEqual([base.jacket, base.tie, base.shoes, base.hat, base.glasses, base.extra, 0, 0, base.beard]);
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
    // and it gets no costume and ordinary trousers
    expect([cap.costume, cap.bottom]).toEqual([0, 0]);
  });
  it('every default avatar has all the layers filled in', () => {
    for (const id of ['a', 'bb', 'ccc', 'dddd']) for (const g of ['male', 'female', null]) {
      const a = defaultAvatar(id, g);
      expect(typeof a.jacketColor).toBe('string');
      expect([0, 1, 2, 3]).toContain(a.shoes);
      expect([0, 1, 2, 3, 4]).toContain(a.hat);
      expect(a.costume).toBe(0);
      expect(a.bottom).toBe(0);
    }
  });
  it('has a costume name and a drawing for every costume in the list', () => {
    expect(COSTUME_KINDS).toHaveLength(COSTUMES.length);
    expect(COSTUMES[0]).toBe('None');
  });
});

describe('the editor: surprise me and the ready-made looks', () => {
  it('only ever picks things you can also pick by hand', async () => {
    const { surprise, COLORS } = await import('../AvatarDialog');
    const { PANTS_COLORS, SHIRT_COLORS } = await import('../world/render');
    const base = defaultAvatar('someone');
    for (let i = 0; i < 400; i++) {
      const a = surprise(base, i % 2 === 0);
      expect(a.hairStyle).toBeLessThan(HAIR_STYLES.length);
      expect(a.outfit).toBeLessThan(OUTFITS.length);
      expect(a.beard).toBeLessThan(BEARDS.length);
      expect(a.shoes).toBeLessThan(SHOES.length);
      expect(a.hat).toBeLessThan(HATS.length);
      expect(a.glasses).toBeLessThan(GLASSES.length);
      expect(a.extra).toBeLessThan(EXTRAS.length);
      expect(a.bottom).toBeLessThan(BOTTOMS.length);
      expect(a.costume).toBeLessThan(COSTUMES.length);
      expect(SKIN_CHOICES).toContain(a.skin);
      expect(HAIR_CHOICES).toContain(a.hair);
      expect([...SHIRT_COLORS, ...COLORS]).toContain(a.shirt);
      expect([...PANTS_COLORS, ...COLORS]).toContain(a.pants);
      for (const c of [a.jacketColor, a.inner, a.tieColor, a.shoeColor, a.hatColor]) expect(COLORS).toContain(c);
      // it survives being saved and loaded
      expect(cleanAvatar(a, 'someone')).toEqual(a);
    }
  });
  it('every ready-made look is a valid avatar', async () => {
    const { LOOKS } = await import('../AvatarDialog');
    const base = defaultAvatar('someone');
    expect(LOOKS.length).toBeGreaterThan(25);
    for (const l of LOOKS) { const a = { ...base, ...l.apply(base) }; expect(cleanAvatar(a, 'someone'), l.label).toEqual(a); }
  });
});
