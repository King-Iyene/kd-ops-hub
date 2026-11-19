import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { GAMES, gamesOn } from '../games';

describe('office games', () => {
  it('are on unless an admin turned them off', () => {
    expect(gamesOn(undefined)).toBe(true);
    expect(gamesOn({})).toBe(true);
    expect(gamesOn({ games: true })).toBe(true);
    expect(gamesOn({ games: false })).toBe(false);
  });
  it('are all https and each one is allowed by the page security policy (so it can load inside the office)', () => {
    const csp = JSON.parse(readFileSync('vercel.json', 'utf8')) as { headers: { headers: { key: string; value: string }[] }[] };
    const policy = csp.headers.flatMap((h) => h.headers).find((h) => h.key === 'Content-Security-Policy')!.value;
    const frameSrc = /frame-src ([^;]*)/.exec(policy)![1].split(' ');
    for (const g of GAMES) {
      const u = new URL(g.url);
      expect(u.protocol, g.name).toBe('https:');
      const ok = frameSrc.includes(u.origin) || frameSrc.some((s) => s.startsWith('https://*.') && u.hostname.endsWith(s.slice('https://*'.length)));
      expect(ok, g.name + ' is missing from frame-src').toBe(true);
    }
  });
});
