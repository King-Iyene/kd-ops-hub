import { describe, expect, it } from 'vitest';
import { buildSearchIndex, searchEntries, tokenize } from '../lib/searchIndex';
import { isSectionInArea } from '../lib/navigation';
import { highlightJson } from '../lib/highlightJson';
import { expiresAtFromOption } from '../lib/keyExpiry';

describe('search index', () => {
  const index = buildSearchIndex();

  it('has unique ids and a valid destination for every entry', () => {
    const ids = index.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const e of index) {
      expect(e.title.trim(), e.id).not.toBe('');
      expect(isSectionInArea(e.location.area, e.location.section), e.id).toBe(true);
    }
  });

  it('covers pages, endpoints, recipes, modules, status codes and events', () => {
    const kinds = new Set(index.map((e) => e.kind));
    for (const k of ['Page', 'Endpoint', 'Planned endpoint', 'Recipe', 'Module', 'Status code', 'Webhook events']) {
      expect(kinds.has(k as never), k).toBe(true);
    }
  });

  it('finds a status code and sends it to Troubleshooting', () => {
    const r = searchEntries(index, '429');
    expect(r.length).toBeGreaterThan(0);
    expect(r[0].entry.location.section).toBe('troubleshooting');
  });

  it('finds the records endpoints by path words', () => {
    const r = searchEntries(index, 'get records');
    expect(r.some((x) => x.entry.kind === 'Endpoint' && x.entry.title.includes('/records'))).toBe(true);
  });

  it('finds the planned /v0 endpoints and a webhook event', () => {
    expect(searchEntries(index, 'listRecords')[0].entry.location.section).toBe('v0');
    expect(searchEntries(index, 'payroll.run_completed')[0].entry.location.section).toBe('webhooks');
  });

  it('requires every word to match, ignores case and returns nothing for empty input', () => {
    expect(searchEntries(index, 'zzzz-no-such-thing')).toEqual([]);
    expect(searchEntries(index, '   ')).toEqual([]);
    expect(searchEntries(index, 'QUICK START').length).toBeGreaterThan(0);
    expect(searchEntries(index, 'quick zzzznomatch')).toEqual([]);
  });

  it('respects the limit and ranks title matches first', () => {
    expect(searchEntries(index, 'a', 3).length).toBeLessThanOrEqual(3);
    const r = searchEntries(index, 'keys');
    expect(r[0].entry.title.toLowerCase()).toContain('keys');
  });

  it('tokenizes on whitespace', () => {
    expect(tokenize('  Foo   bar ')).toEqual(['foo', 'bar']);
    expect(tokenize('')).toEqual([]);
  });
});

describe('highlightJson', () => {
  it('escapes markup before adding spans', () => {
    const out = highlightJson('{"a": "<img src=x onerror=alert(1)>"}');
    expect(out).not.toContain('<img');
    expect(out).toContain('&lt;img');
  });
  it('colours keys, strings, numbers, booleans and null', () => {
    const out = highlightJson('{"name": "x", "n": 5, "ok": true, "none": null}');
    expect(out).toContain('text-slate-200');
    expect(out).toContain('text-emerald-400');
    expect(out).toContain('text-blue-400');
    expect(out).toContain('text-orange-400');
    expect(out).toContain('text-slate-500');
  });
});

describe('expiresAtFromOption', () => {
  const now = Date.UTC(2026, 0, 1);
  it('returns null for never, empty and unknown choices', () => {
    expect(expiresAtFromOption('never', now)).toBeNull();
    expect(expiresAtFromOption(null, now)).toBeNull();
    expect(expiresAtFromOption('', now)).toBeNull();
    expect(expiresAtFromOption('2d', now)).toBeNull();
    expect(expiresAtFromOption('toString', now)).toBeNull();
  });
  it('adds the right number of days', () => {
    expect(expiresAtFromOption('30d', now)).toBe('2026-01-31T00:00:00.000Z');
    expect(expiresAtFromOption('90d', now)).toBe('2026-04-01T00:00:00.000Z');
    expect(expiresAtFromOption('1y', now)).toBe('2027-01-01T00:00:00.000Z');
  });
});
