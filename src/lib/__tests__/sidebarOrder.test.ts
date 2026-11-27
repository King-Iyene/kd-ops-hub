import { describe, expect, it } from 'vitest';
import { SIDEBAR_HUBS } from '../navConfig';

describe('side panel order', () => {
  const keys = SIDEBAR_HUBS.map((h) => h.key);
  it('Admin is always last', () => {
    expect(keys[keys.length - 1]).toBe('admin');
    expect(keys.filter((k) => k === 'admin')).toHaveLength(1);
  });
  it('the Agent sits high, right after Task, and above Virtual Office and Admin', () => {
    expect(keys.indexOf('opsAgent')).toBe(keys.indexOf('task') + 1);
    expect(keys.indexOf('opsAgent')).toBeLessThan(keys.indexOf('office'));
    expect(keys.indexOf('opsAgent')).toBeLessThan(keys.indexOf('admin'));
  });
  it('nothing was lost or doubled', () => {
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).toEqual(expect.arrayContaining(['finance', 'timeTracking', 'task', 'opsAgent', 'people', 'operations', 'workspace', 'crm', 'ndi', 'office', 'admin']));
  });
});
