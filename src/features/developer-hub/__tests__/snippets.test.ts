import { describe, expect, it } from 'vitest';
import {
  BASE_ID_PLACEHOLDER,
  FALLBACK_SUPABASE_URL,
  KEY_PLACEHOLDER,
  TABLE_ID_PLACEHOLDER,
  buildTarget,
  curlCreateSnippet,
  curlListSnippet,
  fetchSnippet,
  looksLikeRealKey,
  makeSteps,
  n8nNodeJson,
  n8nSteps,
  resolveApiRoot,
  sampleCreateBody,
  shellSingleQuote,
  v1RecordsUrl,
} from '../lib/snippets';
import { pickSampleFieldName } from '../lib/sampleField';

const ROOT = 'https://abc.supabase.co/functions/v1/rest-api';
const target = buildTarget({ apiRoot: ROOT, baseId: 'BASE22', tableId: 'TABLE22', sampleFieldName: 'Title' });

describe('resolveApiRoot', () => {
  it('builds the function URL from the project URL and trims slashes', () => {
    expect(resolveApiRoot('https://abc.supabase.co/')).toBe(ROOT);
    expect(resolveApiRoot('  https://abc.supabase.co  ')).toBe(ROOT);
  });
  it('falls back when the URL is missing or not http(s)', () => {
    const fallback = `${FALLBACK_SUPABASE_URL}/functions/v1/rest-api`;
    expect(resolveApiRoot(undefined)).toBe(fallback);
    expect(resolveApiRoot('')).toBe(fallback);
    expect(resolveApiRoot('not a url')).toBe(fallback);
  });
});

describe('buildTarget', () => {
  it('uses placeholders when nothing is selected', () => {
    const t = buildTarget({ apiRoot: ROOT, baseId: null, tableId: undefined });
    expect(t.baseId).toBe(BASE_ID_PLACEHOLDER);
    expect(t.tableId).toBe(TABLE_ID_PLACEHOLDER);
    expect(t.sampleFieldName).toBeUndefined();
  });
});

describe('snippets', () => {
  it('put the real ids in the records URL', () => {
    expect(v1RecordsUrl(target)).toBe(`${ROOT}/v1/bases/BASE22/tables/TABLE22/records`);
    for (const s of [curlListSnippet(target), curlCreateSnippet(target), fetchSnippet(target), n8nNodeJson(target)]) {
      expect(s).toContain('/v1/bases/BASE22/tables/TABLE22/records');
    }
    expect(n8nSteps(target).join(' ')).toContain('BASE22');
    expect(makeSteps(target).join(' ')).toContain('TABLE22');
  });

  it('only ever show the placeholder key', () => {
    const all = [
      curlListSnippet(target),
      curlCreateSnippet(target),
      fetchSnippet(target),
      n8nNodeJson(target),
      ...n8nSteps(target),
      ...makeSteps(target),
    ].join('\n');
    expect(all).toContain(KEY_PLACEHOLDER);
    expect(looksLikeRealKey(all)).toBe(false);
  });

  it('use the sample column in the create body', () => {
    expect(curlCreateSnippet(target)).toContain('"Title"');
    expect(fetchSnippet(target)).toContain('"Title"');
    expect(sampleCreateBody().records[0].fields).toHaveProperty('Name');
  });

  it('produce valid JSON for the n8n node and the curl body', () => {
    const node = JSON.parse(n8nNodeJson(target));
    expect(node.nodes[0].type).toBe('n8n-nodes-base.httpRequest');
    const m = curlCreateSnippet(target).match(/-d '(.*)'$/s);
    expect(m).not.toBeNull();
    expect(JSON.parse(m![1]).records).toHaveLength(1);
  });
});

describe('looksLikeRealKey', () => {
  it('flags a 32-hex kdops key and ignores placeholders', () => {
    expect(looksLikeRealKey('Bearer kdops_0123456789abcdef0123456789abcdef')).toBe(true);
    expect(looksLikeRealKey('kdops_live_abc123...')).toBe(false);
    expect(looksLikeRealKey(KEY_PLACEHOLDER)).toBe(false);
  });
});

describe('shellSingleQuote', () => {
  it('escapes single quotes', () => {
    expect(shellSingleQuote("it's")).toBe(`'it'\\''s'`);
  });
});

describe('pickSampleFieldName', () => {
  it('prefers the primary text column', () => {
    expect(
      pickSampleFieldName([
        { name: 'Amount', ui_type: 'Number' },
        { name: 'Name', ui_type: 'SingleLineText', is_primary: true },
        { name: 'Notes', ui_type: 'LongText' },
      ]),
    ).toBe('Name');
  });
  it('skips computed, system and hidden columns', () => {
    expect(
      pickSampleFieldName([
        { name: 'Total', ui_type: 'Formula', is_primary: true },
        { name: 'Id', ui_type: 'SingleLineText', is_system: true },
        { name: 'Secret', ui_type: 'SingleLineText', is_hidden: true },
        { name: 'Title', ui_type: 'SingleLineText' },
      ]),
    ).toBe('Title');
  });
  it('returns undefined when no text column exists', () => {
    expect(pickSampleFieldName([{ name: 'Amount', ui_type: 'Number' }])).toBeUndefined();
    expect(pickSampleFieldName([])).toBeUndefined();
  });
});
