import { describe, expect, it } from 'vitest';
import { isFieldTeam } from '../fieldTeam';

describe('isFieldTeam', () => {
  it('counts the field_staff role', () => expect(isFieldTeam({ role: 'field_staff' })).toBe(true));
  it('counts a Field Agent job title in any case or spacing', () => {
    expect(isFieldTeam({ role: 'employee', job_title: 'Field Agent' })).toBe(true);
    expect(isFieldTeam({ role: 'employee', job_title: 'senior field agents' })).toBe(true);
    expect(isFieldTeam({ job_title: 'FIELDAGENT' })).toBe(true);
  });
  it('leaves everyone else in', () => {
    expect(isFieldTeam({ role: 'admin', job_title: 'Operations Manager' })).toBe(false);
    expect(isFieldTeam({ role: 'employee', job_title: null })).toBe(false);
    expect(isFieldTeam({})).toBe(false);
    expect(isFieldTeam(null)).toBe(false);
    expect(isFieldTeam(undefined)).toBe(false);
  });
});
