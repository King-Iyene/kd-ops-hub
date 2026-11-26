import { describe, expect, it } from 'vitest';
import { isolatedBase } from '../AvatarDialog';

describe('avatar pictures that show just the one feature', () => {
  const mine = { skin: '#6b4423', hair: '#7c3aed', hairStyle: 5 };
  it('wear nothing of mine except skin and hair colour', () => {
    const b = isolatedBase(mine, 'hatColor', '#ff0000', undefined, 'hat');
    expect(b.skin).toBe('#6b4423');
    expect(b.hair).toBe('#7c3aed');
    expect(b.hat).toBe(0);
    expect(b.glasses).toBe(0);
    expect(b.jacket).toBe(0);
    expect(b.costume).toBe(0);
    expect(b.hairStyle).toBe(3);
    expect(b.hatColor).toBe('#ff0000');
  });
  it('keep my hairstyle out of the way unless hair itself is what is being picked', () => {
    expect(isolatedBase(mine, undefined, undefined, undefined, 'hairStyle').hairStyle).toBe(5);
    expect(isolatedBase(mine, undefined, undefined, undefined, 'glasses').hairStyle).toBe(3);
  });
  it('shows the colour of a jacket and the shirt under it', () => {
    const b = isolatedBase(mine, 'jacketColor', '#1f2a44', '#ffffff', 'jacket');
    expect(b.jacketColor).toBe('#1f2a44');
    expect(b.inner).toBe('#ffffff');
  });
});
