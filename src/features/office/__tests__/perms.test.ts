import { describe, expect, it } from 'vitest';
import { canDo, permMode } from '../OfficeSettingsDialog';

describe('office permissions an admin can hand out', () => {
  it('keeps the old defaults when nothing has been chosen', () => {
    expect(permMode({}, 'events')).toBe('all');
    expect(permMode({}, 'customise')).toBe('all');
    expect(permMode({}, 'invite')).toBe('admins');
    expect(permMode({}, 'speak')).toBe('admins');
    expect(permMode({ townHallAll: true }, 'speak')).toBe('all'); // the old switch still counts
  });
  it('admins can always, others follow the mode', () => {
    expect(canDo({ perms: { polls: { mode: 'admins' } } }, 'polls', 'u1', true)).toBe(true);
    expect(canDo({ perms: { polls: { mode: 'admins' } } }, 'polls', 'u1', false)).toBe(false);
    expect(canDo({ perms: { polls: { mode: 'all' } } }, 'polls', 'u1', false)).toBe(true);
  });
  it('selected people only', () => {
    const s = { perms: { events: { mode: 'selected' as const, people: ['u2'] } } };
    expect(canDo(s, 'events', 'u2', false)).toBe(true);
    expect(canDo(s, 'events', 'u1', false)).toBe(false);
    expect(canDo(s, 'events', undefined, false)).toBe(false);
  });
});
