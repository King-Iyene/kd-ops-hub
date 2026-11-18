import { describe, expect, it } from 'vitest';
import { MAX_MESSAGE, canSendTo, cleanText, matches, parsePing, splitLinks } from '../social';

describe('parsePing', () => {
  const dm = { k: 'dm', f: 'a', n: 'Ann', t: 'me', s: 's1', text: 'hello' };
  it('accepts a message and a ring addressed to me', () => {
    expect(parsePing(dm, 'me')?.text).toBe('hello');
    expect(parsePing({ ...dm, k: 'ring', text: undefined }, 'me')?.k).toBe('ring');
  });
  it('rejects pings for someone else, from myself, empty texts or junk', () => {
    expect(parsePing({ ...dm, t: 'other' }, 'me')).toBeNull();
    expect(parsePing({ ...dm, f: 'me' }, 'me')).toBeNull();
    expect(parsePing({ ...dm, text: '   ' }, 'me')).toBeNull();
    expect(parsePing({ ...dm, k: 'x' }, 'me')).toBeNull();
    expect(parsePing(null, 'me')).toBeNull();
  });
  it('limits message length and strips control characters', () => {
    expect(cleanText('a'.repeat(500)).length).toBe(MAX_MESSAGE);
    expect(cleanText('hi\u0000\nthere')).toBe('hi there');
  });
});

describe('canSendTo', () => {
  it('rate-limits rings far more than messages', () => {
    const m = new Map<string, number>([['ring:a', 1000], ['dm:a', 1000]]);
    expect(canSendTo(m, 'a', 3000, 'ring')).toBe(false);
    expect(canSendTo(m, 'a', 3000, 'dm')).toBe(true);
    expect(canSendTo(m, 'a', 10000, 'ring')).toBe(true);
    expect(canSendTo(m, 'b', 1_700_000_000_000, 'ring')).toBe(true);
  });
});

describe('images and links', () => {
  const id = '11111111-2222-3333-4444-555555555555';
  it('accepts only pictures in the sender own folder', () => {
    expect(parsePing({ k: 'dm', f: id, n: 'A', t: 'me', s: null, img: `${id}/abcdef123456.png` }, 'me')?.img).toBe(`${id}/abcdef123456.png`);
    expect(parsePing({ k: 'dm', f: id, n: 'A', t: 'me', s: null, img: `other/abcdef123456.png` }, 'me')).toBeNull();
    expect(parsePing({ k: 'dm', f: id, n: 'A', t: 'me', s: null, img: `${id}/../x.png`, text: 'hi' }, 'me')?.img).toBeUndefined();
  });
  it('turns web links into clickable pieces and ignores other schemes', () => {
    const p = splitLinks('see https://kdsquares.com/a, and javascript:alert(1)');
    expect(p.find((x) => x.href)?.href).toBe('https://kdsquares.com/a');
    expect(p.filter((x) => x.href).length).toBe(1);
    expect(splitLinks('no links').length).toBe(1);
  });
});

describe('matches', () => {
  it('finds names by any words in any order, ignoring case', () => {
    expect(matches('David Henry David', 'henry da')).toBe(true);
    expect(matches('Meeting Room 2', 'room 2')).toBe(true);
    expect(matches('Lounge', 'meet')).toBe(false);
    expect(matches('Lounge', '  ')).toBe(true);
  });
});
