import { describe, expect, it } from 'vitest';
import { autoDnd, miniPayload } from '../useDesktopMini';
import type { AvatarStyle } from '../world/types';

const av = { skin: '#e0b48a', hair: '#2b1b10', shirt: '#3b82f6' } as AvatarStyle;
const who = (uid: string, name: string, status = '') => ({ uid, name, status, avatar: av });

describe('what the small window shows', () => {
  it('lists the other people once each, never me, with their status and colours', () => {
    const p = miniPayload({ name: 'King', avatar: av }, 'busy', [who('me', 'King'), who('a', 'Ada', 'dnd'), who('a', 'Ada', 'dnd'), who('b', 'Bola')], 'me');
    expect(p.me).toEqual({ name: 'King', status: 'busy', a: { skin: '#e0b48a', hair: '#2b1b10', shirt: '#3b82f6' } });
    expect(p.people.map((x) => x.name)).toEqual(['Ada', 'Bola']);
    expect(p.people[0].status).toBe('dnd');
  });
  it('shows at most 14 people', () => {
    const many = Array.from({ length: 30 }, (_, i) => who('u' + i, 'P' + i));
    expect(miniPayload({ name: 'King' }, '', many, 'me').people).toHaveLength(14);
  });
});

describe('do not disturb while the computer is locked or asleep', () => {
  it('goes to do not disturb, and back to what it was when the computer wakes', () => {
    const away = autoDnd(null, 'focus', 'away');
    expect(away).toEqual({ before: 'focus', set: 'dnd' });
    expect(autoDnd(away.before, 'dnd', 'back')).toEqual({ before: null, set: 'focus' });
  });
  it('returns to no status when there was none', () => {
    const away = autoDnd(null, '', 'away');
    expect(away).toEqual({ before: '', set: 'dnd' });
    expect(autoDnd(away.before, 'dnd', 'back')).toEqual({ before: null, set: '' });
  });
  it('leaves someone who is already on do not disturb alone, and does not touch a status it did not change', () => {
    expect(autoDnd(null, 'dnd', 'away')).toEqual({ before: null, set: null });
    expect(autoDnd(null, 'busy', 'back')).toEqual({ before: null, set: null });
  });
  it('a second lock event does not overwrite what to go back to', () => {
    const first = autoDnd(null, 'busy', 'away');
    expect(autoDnd(first.before, 'dnd', 'away')).toEqual({ before: 'busy', set: null });
  });
});
