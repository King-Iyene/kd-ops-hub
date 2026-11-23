import { describe, expect, it } from 'vitest';
import {
  AREAS,
  DEFAULT_LOCATION,
  LEGACY_TAB_MAP,
  areaForSection,
  isSectionInArea,
  locationToParams,
  resolveLocation,
  resolveTarget,
} from '../lib/navigation';
import { assignHeadingIds, slugify } from '../lib/toc';

const OLD_TABS = [
  'overview',
  'explorer',
  'reference',
  'keys',
  'webhooks',
  'guides',
  'recipes',
  'modules',
  'troubleshooting',
];

describe('hub navigation', () => {
  it('has four areas and every section belongs to exactly one', () => {
    expect(AREAS.map((a) => a.id)).toEqual(['start', 'keys', 'reference', 'webhooks']);
    const seen = new Map<string, string>();
    for (const a of AREAS) {
      expect(a.sections.length).toBeGreaterThan(0);
      for (const s of a.sections) {
        expect(seen.has(s.id), `${s.id} listed twice`).toBe(false);
        seen.set(s.id, a.id);
      }
    }
  });

  it('keeps every one of the nine original tabs reachable', () => {
    for (const tab of OLD_TABS) {
      const loc = resolveLocation({ tab });
      expect(isSectionInArea(loc.area, loc.section), tab).toBe(true);
      expect(loc.section).toBe(tab);
    }
  });

  it('maps legacy tab ids only to sections that exist', () => {
    for (const [tab, loc] of Object.entries(LEGACY_TAB_MAP)) {
      expect(isSectionInArea(loc.area, loc.section), tab).toBe(true);
    }
  });

  it('prefers area/section over tab and repairs mismatches', () => {
    expect(resolveLocation({ area: 'reference', section: 'explorer', tab: 'keys' })).toEqual({
      area: 'reference',
      section: 'explorer',
    });
    expect(resolveLocation({ area: 'webhooks', section: 'explorer' })).toEqual({ area: 'webhooks', section: 'webhooks' });
    expect(resolveLocation({ section: 'v0' })).toEqual({ area: 'reference', section: 'v0' });
  });

  it('falls back to the default for unknown input without throwing', () => {
    expect(resolveLocation({})).toEqual(DEFAULT_LOCATION);
    expect(resolveLocation({ tab: 'nope' })).toEqual(DEFAULT_LOCATION);
    expect(resolveLocation({ tab: 'constructor' })).toEqual(DEFAULT_LOCATION);
    expect(resolveLocation({ area: '__proto__' })).toEqual(DEFAULT_LOCATION);
  });

  it('resolves navigation targets from legacy ids, sections and areas', () => {
    expect(resolveTarget('explorer')).toEqual({ area: 'reference', section: 'explorer' });
    expect(resolveTarget('quickstart')).toEqual({ area: 'start', section: 'quickstart' });
    expect(resolveTarget('webhooks')).toEqual({ area: 'webhooks', section: 'webhooks' });
    expect(resolveTarget('reference')).toEqual({ area: 'reference', section: 'reference' });
    expect(resolveTarget('toString')).toBeNull();
    expect(resolveTarget('unknown')).toBeNull();
  });

  it('finds the area for a section and builds URL params', () => {
    expect(areaForSection('modules')?.id).toBe('webhooks');
    expect(areaForSection('zzz')).toBeUndefined();
    expect(locationToParams({ area: 'keys', section: 'keys' })).toEqual({ area: 'keys', section: 'keys' });
  });
});

describe('table of contents helpers', () => {
  it('slugifies text', () => {
    expect(slugify('Quick start')).toBe('quick-start');
    expect(slugify('  API: /v1 & Webhooks! ')).toBe('api-v1-webhooks');
    expect(slugify('Café résumé')).toBe('cafe-resume');
    expect(slugify('***')).toBe('section');
    expect(slugify('x'.repeat(200)).length).toBeLessThanOrEqual(60);
  });

  it('assigns unique ids, keeping existing ones', () => {
    const out = assignHeadingIds([
      { text: 'Errors' },
      { text: 'Errors' },
      { text: 'Keep me', id: 'my-id' },
      { text: 'Errors', id: null },
    ]);
    expect(out.map((o) => o.id)).toEqual(['toc-errors', 'toc-errors-2', 'my-id', 'toc-errors-3']);
    expect(out.map((o) => o.isNew)).toEqual([true, true, false, true]);
  });

  it('does not reuse an id already taken by an existing heading', () => {
    const out = assignHeadingIds([{ text: 'A', id: 'toc-b' }, { text: 'B' }]);
    expect(out[1].id).toBe('toc-b-2');
  });
});
