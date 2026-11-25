import { describe, expect, it } from 'vitest';
import { MAX_LINKS_PER_FIELD, classifyRef, normalizeLinkInput, planLinkChange } from '../../../supabase/functions/_shared/rest-links';

describe('what a record reference is', () => {
  it('tells the three kinds of id apart', () => {
    expect(classifyRef('3f2b8a52-7c1e-4d19-9a0b-5e6d7c8f9a10')).toBe('uuid');
    expect(classifyRef('recN6nUEz1qR9m5WJ')).toBe('airtable');
    expect(classifyRef('1sKqXGp4N7bV2cDeFhJm')).toBe('short');
  });

  it('refuses anything else', () => {
    expect(classifyRef('')).toBe('invalid');
    expect(classifyRef('drop table; --')).toBe('invalid');
    expect(classifyRef('a'.repeat(26))).toBe('invalid');
  });
});

describe('the value of a link field', () => {
  it('no value means no links', () => {
    expect(normalizeLinkInput(null)).toEqual({ refs: [] });
    expect(normalizeLinkInput(undefined)).toEqual({ refs: [] });
    expect(normalizeLinkInput([])).toEqual({ refs: [] });
    expect(normalizeLinkInput('')).toEqual({ refs: [] });
  });

  it('accepts a list, objects with an id, or a single id; repeats count once', () => {
    expect(normalizeLinkInput(['a', 'b', 'a']).refs).toEqual(['a', 'b']);
    expect(normalizeLinkInput([{ id: 'a' }, 'b']).refs).toEqual(['a', 'b']);
    expect(normalizeLinkInput('a').refs).toEqual(['a']);
    expect(normalizeLinkInput(['  a  ']).refs).toEqual(['a']);
  });

  it('does not guess at things that are not ids', () => {
    expect(normalizeLinkInput([1, 2]).error).toBeTruthy();
    expect(normalizeLinkInput([{ name: 'x' }]).error).toBeTruthy();
    expect(normalizeLinkInput(['a', '']).error).toBeTruthy();
    expect(normalizeLinkInput({ foo: 1 }).error).toBeTruthy();
  });

  it('caps how many records one field can link in a request', () => {
    const many = Array.from({ length: MAX_LINKS_PER_FIELD + 1 }, (_, i) => `id${i}`);
    expect(normalizeLinkInput(many).error).toBeTruthy();
    expect(normalizeLinkInput(many.slice(0, MAX_LINKS_PER_FIELD)).error).toBeUndefined();
  });
});

describe('changing a list of links', () => {
  it('adds what is new and removes what is no longer named', () => {
    expect(planLinkChange(['a', 'b'], ['b', 'c'])).toEqual({ toAdd: ['c'], toRemove: ['a'] });
  });

  it('does nothing when the list is the same', () => {
    expect(planLinkChange(['a', 'b'], ['b', 'a'])).toEqual({ toAdd: [], toRemove: [] });
  });

  it('an empty wanted list unlinks everything; an empty current list links everything', () => {
    expect(planLinkChange(['a', 'b'], [])).toEqual({ toAdd: [], toRemove: ['a', 'b'] });
    expect(planLinkChange([], ['a'])).toEqual({ toAdd: ['a'], toRemove: [] });
  });
});
