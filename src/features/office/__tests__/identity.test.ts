import { describe, expect, it } from 'vitest';
import { cleanIdent, completeRoster, unknownToAsk, type Ident } from '../world/identity';
import type { Who } from '../useOffice';

const av = {} as never;
const clean = () => av;
const who = (id: string, uid: string, name = id): Who => ({ id, uid, since: 1, name, avatar: av, spaceId: 's', zone: null, rec: false, locked: false, status: '', riding: false, live: false, townMuted: false });
const ident = (uid: string, name: string, since = 1): Ident => ({ uid, name, avatar: av, since, at: 0 });
const NOW = 100_000;
const o = { now: NOW, selfUid: 'me', multi: false, spaceId: 's', freshMs: 20_000 };

describe('reading an answer from the network', () => {
  it('accepts a well-formed one and trims it', () => {
    const r = cleanIdent({ i: 'tab1', u: 'user1', n: '  Nina Okari ', a: {}, c: 5 }, clean, 9);
    expect(r?.id).toBe('tab1');
    expect(r?.ident.name).toBe('Nina Okari');
    expect(r?.ident.since).toBe(5);
  });
  it('rejects junk', () => {
    expect(cleanIdent(null, clean, 0)).toBeNull();
    expect(cleanIdent({ i: 'a', u: 'b', n: '   ' }, clean, 0)).toBeNull();
    expect(cleanIdent({ i: 'x'.repeat(100), u: 'b', n: 'N' }, clean, 0)).toBeNull();
    expect(cleanIdent({ i: 'a', u: 5, n: 'N' }, clean, 0)).toBeNull();
  });
});

describe('who to ask', () => {
  it('waits a moment, asks once, then again later, and forgets people who went quiet', () => {
    const first = new Map<string, number>();
    const asked = new Map<string, number>();
    const known = (id: string) => id === 'k';
    expect(unknownToAsk(['u', 'k'], known, first, asked, 0)).toEqual([]); // just heard
    expect(unknownToAsk(['u', 'k'], known, first, asked, 1500)).toEqual(['u']); // still unknown after the grace
    expect(unknownToAsk(['u'], known, first, asked, 3000)).toEqual([]); // asked a moment ago
    expect(unknownToAsk(['u'], known, first, asked, 8000)).toEqual(['u']); // no answer: ask again
    expect(unknownToAsk([], known, first, asked, 9000)).toEqual([]);
    expect(first.size).toBe(0);
  });
  it('never asks more than the limit at once', () => {
    const ids = Array.from({ length: 40 }, (_, i) => `u${i}`);
    const first = new Map<string, number>(ids.map((i) => [i, 0]));
    expect(unknownToAsk(ids, () => false, first, new Map(), 5000, { max: 16 })).toHaveLength(16);
  });
});

describe('the people list with everybody in it', () => {
  it('adds somebody we hear and who has said who they are, with their own name', () => {
    const r = completeRoster([who('a', 'ua')], new Map([['t', ident('ub', 'Nina Okari')]]), new Map([['t', { at: NOW - 1000 }]]), o);
    expect(r.map((w) => w.name)).toEqual(['a', 'Nina Okari']);
    expect(r[1].spaceId).toBe('s');
  });
  it('leaves the online list alone when it already shows that person (by tab or by account)', () => {
    const listed = [who('t', 'ub', 'Nina from the list')];
    expect(completeRoster(listed, new Map([['t', ident('ub', 'Nina')]]), new Map([['t', { at: NOW }]]), o)).toBe(listed);
    expect(completeRoster(listed, new Map([['t2', ident('ub', 'Nina')]]), new Map([['t2', { at: NOW }]]), o)).toBe(listed);
  });
  it('never adds another window of me, or somebody not heard lately, or somebody who has not said who they are', () => {
    const p = [who('a', 'ua')];
    expect(completeRoster(p, new Map([['t', ident('me', 'Me')]]), new Map([['t', { at: NOW }]]), o)).toBe(p);
    expect(completeRoster(p, new Map([['t', ident('ub', 'Nina')]]), new Map([['t', { at: NOW - 60_000 }]]), o)).toBe(p);
    expect(completeRoster(p, new Map(), new Map([['t', { at: NOW }]]), o)).toBe(p);
  });
  it('shows only the newest window of one account', () => {
    const r = completeRoster([], new Map([['old', ident('ub', 'Nina', 1)], ['new', ident('ub', 'Nina', 9)]]), new Map([['old', { at: NOW }], ['new', { at: NOW }]]), o);
    expect(r.map((w) => w.id)).toEqual(['new']);
  });
  it('gives the same entry back for the same person, so the screen is not redrawn for nothing', () => {
    const cache = new Map<string, Who>();
    const args = [[who('a', 'ua')], new Map([['t', ident('ub', 'Nina')]]), new Map([['t', { at: NOW }]]), o, cache] as const;
    const a = completeRoster(...args);
    const b = completeRoster(...args);
    expect(a[1]).toBe(b[1]);
  });
});
