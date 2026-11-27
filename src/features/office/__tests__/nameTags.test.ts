import { describe, expect, it } from 'vitest';
import { stackTags, tagWidth } from '../world/nameTags';

const T = 32;
describe('name tags of people standing close together', () => {
  it('leaves tags alone when people are apart', () => {
    expect(stackTags([{ x: 5, y: 5, name: 'Nina Okari' }, { x: 12, y: 5, name: 'Denzel Iyene' }], T)).toEqual([0, 0]);
  });
  it('steps the tag of the person behind up so both can be read; the one in front stays', () => {
    const l = stackTags([{ x: 5, y: 5, name: 'Nina Okari' }, { x: 5.2, y: 5.3, name: 'Denzel Iyene' }], T);
    expect(l[1]).toBe(0); // lower on the screen = in front
    expect(l[0]).toBeGreaterThan(0);
  });
  it('my own tag never moves', () => {
    const l = stackTags([{ x: 5, y: 5.3, name: 'Somebody Else' }, { x: 5.1, y: 5, name: 'King Iyene', isMe: true }], T);
    expect(l[1]).toBe(0);
    expect(l[0]).toBeGreaterThan(0);
  });
  it('three on top of each other end up on three different levels', () => {
    const l = stackTags([{ x: 5, y: 5, name: 'Aaaa Bbbb' }, { x: 5, y: 5.1, name: 'Cccc Dddd' }, { x: 5, y: 5.2, name: 'Eeee Ffff' }], T);
    expect(new Set(l).size).toBe(3);
  });
  it('people without a name (the avatar preview) are skipped, and tag width grows with the name', () => {
    expect(stackTags([{ x: 1, y: 1, name: '' }], T)).toEqual([0]);
    expect(tagWidth('Chrisogonus Ifeanyichukwu')).toBeGreaterThan(tagWidth('Ada'));
  });
});
