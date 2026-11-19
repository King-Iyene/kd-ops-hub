import { describe, expect, it } from 'vitest';
import { cleanDomain, parseSiteVerdicts } from '../../../../supabase/functions/_shared/agent-sites-core';

describe('cleanDomain', () => {
  it('keeps only the host', () => {
    expect(cleanDomain('https://www.Example.com/a/b?c=1#d')).toBe('example.com');
    expect(cleanDomain('  Sub.Example.co.uk:8443/x ')).toBe('sub.example.co.uk');
  });
  it.each(['', 'not a domain', 'localhost', 'a..b', '-bad.com', 42, null, undefined])('refuses %s', (v) => {
    expect(cleanDomain(v)).toBeNull();
  });
});

describe('parseSiteVerdicts', () => {
  const domains = ['github.com', 'youtube.com', 'mystery.xyz'];
  it('reads a clean answer in the order asked', () => {
    const out = parseSiteVerdicts('[{"domain":"youtube.com","verdict":"personal","reason":"Video"},{"domain":"github.com","verdict":"work","reason":"Code hosting"}]', domains);
    expect(out.map((r) => [r.domain, r.verdict])).toEqual([['github.com', 'work'], ['youtube.com', 'personal'], ['mystery.xyz', 'unknown']]);
  });
  it('finds the JSON inside extra text', () => {
    const out = parseSiteVerdicts('Sure!\n```json\n[{"domain":"github.com","verdict":"work","reason":"x"}]\n```', ['github.com']);
    expect(out[0].verdict).toBe('work');
  });
  it('never throws and defaults to unknown', () => {
    for (const bad of ['', 'nonsense', '[', '{"a":1}', '[1,null,"x"]', '[{"domain":"other.com","verdict":"work"}]']) {
      const out = parseSiteVerdicts(bad, ['github.com']);
      expect(out).toHaveLength(1);
      expect(out[0].verdict).toBe('unknown');
    }
  });
  it('turns an invalid verdict into unknown and trims the reason', () => {
    const out = parseSiteVerdicts('[{"domain":"github.com","verdict":"definitely","reason":"  a   long\\n reason "}]', ['github.com']);
    expect(out[0]).toEqual({ domain: 'github.com', verdict: 'unknown', reason: 'a long reason' });
  });
});
