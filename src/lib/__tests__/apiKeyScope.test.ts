import { describe, it, expect } from 'vitest';
import { keyMayUseBase } from '../../../supabase/functions/_shared/api-key-scope';
import { toApiScopes } from '../../features/database/hooks/useApiKeys';

describe('keyMayUseBase', () => {
  const finances = '5d3c9e3e-1c6f-4f5e-9a1b-111111111111';
  const other = '6a1c9e3e-1c6f-4f5e-9a1b-222222222222';

  it('lets a key with no base limit use any base', () => {
    expect(keyMayUseBase(null, finances)).toBe(true);
    expect(keyMayUseBase(undefined, other)).toBe(true);
    expect(keyMayUseBase('', other)).toBe(true);
  });

  it('lets a limited key use only its own base', () => {
    expect(keyMayUseBase(finances, finances)).toBe(true);
    expect(keyMayUseBase(finances, other)).toBe(false);
  });

  it('ignores letter case in ids', () => {
    expect(keyMayUseBase(finances.toUpperCase(), finances)).toBe(true);
  });
});

describe('toApiScopes', () => {
  it('turns the box labels into scopes the data API enforces', () => {
    expect(toApiScopes(['read', 'write'])).toEqual(['records:read', 'records:write']);
    expect(toApiScopes(['delete'])).toEqual(['data:delete']);
  });
  it('leaves unknown scopes alone', () => {
    expect(toApiScopes(['schema:read'])).toEqual(['schema:read']);
  });
});
