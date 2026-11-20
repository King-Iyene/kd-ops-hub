import { describe, expect, it } from 'vitest';
import { ALL_NAV } from '../navConfig';

describe('Agent in the side panel', () => {
  const agent = ALL_NAV.find((n) => n.title === 'Agent');
  it('is there for a Super Admin and an Admin, and nobody else', () => {
    expect(agent?.url).toBe('/agent');
    expect([...(agent?.roles ?? [])].sort()).toEqual(['admin', 'super_admin']);
  });
});
