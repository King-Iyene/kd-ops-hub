import { describe, expect, it } from 'vitest';
import {
  accruedAnnualDays, addDays, annualPosition, cleanDbMessage, countWorkingDays, daysLabel, eventSentence, groupAway,
  isOverBalanceError, leaveToCsv, nextWorkday, rangeLabel, relativeStart, requestedDays, skippedDays, timingOf,
} from './leaveMath';
import type { AwayRow, LeaveEvent, LeaveRow } from './types';

const none = new Set<string>();

describe('working days', () => {
  it('counts Monday to Friday only', () => {
    expect(countWorkingDays('2026-12-07', '2026-12-11', none)).toBe(5);
    expect(countWorkingDays('2026-12-07', '2026-12-13', none)).toBe(5);
    expect(countWorkingDays('2026-12-12', '2026-12-13', none)).toBe(0);
  });
  it('skips public holidays', () => {
    expect(countWorkingDays('2026-12-21', '2026-12-25', new Set(['2026-12-25']))).toBe(4);
  });
  it('is zero when the end is before the start or blank', () => {
    expect(countWorkingDays('2026-12-11', '2026-12-07', none)).toBe(0);
    expect(countWorkingDays('', '', none)).toBe(0);
  });
  it('half day only counts for one day', () => {
    expect(requestedDays('2026-12-07', '2026-12-07', true, none)).toBe(0.5);
    expect(requestedDays('2026-12-07', '2026-12-08', true, none)).toBe(2);
    expect(requestedDays('2026-12-12', '2026-12-12', true, none)).toBe(0);
  });
  it('explains what was skipped', () => {
    expect(skippedDays('2026-12-04', '2026-12-08', new Set(['2026-12-07']))).toEqual({ weekends: 2, holidays: 1 });
  });
});

describe('earned annual leave', () => {
  const now = new Date('2026-06-15T10:00:00Z');
  it('earns a twelfth per month in the current year', () => {
    expect(accruedAnnualDays(24, 2026, '2020-01-01', now)).toBe(12); // 6 months
  });
  it('earlier years are fully earned, later years nothing', () => {
    expect(accruedAnnualDays(20, 2025, null, now)).toBe(20);
    expect(accruedAnnualDays(20, 2027, null, now)).toBe(0);
  });
  it('starts counting from the start month and handles people who have not started', () => {
    expect(accruedAnnualDays(24, 2026, '2026-05-10', now)).toBe(4);
    expect(accruedAnnualDays(24, 2026, '2026-09-01', now)).toBe(0);
    expect(accruedAnnualDays(24, 2026, '2027-01-01', now)).toBe(0);
  });
  it('builds a position with earned, used and left', () => {
    const p = annualPosition({ employee_id: 'x', year: 2026, annual_quota: 24, annual_used: 5 } as never, 20, 2026, '2020-01-01', now);
    expect(p).toEqual({ quota: 24, earned: 12, used: 5, left: 7, yearLeft: 19 });
    expect(annualPosition(null, 20, 2026, '2020-01-01', now).quota).toBe(20);
  });
});

describe('labels', () => {
  it('pluralises days', () => {
    expect(daysLabel(1)).toBe('1 day');
    expect(daysLabel(0.5)).toBe('0.5 days');
    expect(daysLabel(5)).toBe('5 days');
  });
  it('writes ranges plainly', () => {
    expect(rangeLabel('2026-12-07', '2026-12-07')).toBe('Mon 7 Dec 2026');
    expect(rangeLabel('2026-12-07', '2026-12-11')).toBe('Mon 7 Dec to Fri 11 Dec 2026');
    expect(rangeLabel('2026-12-28', '2027-01-04')).toBe('Mon 28 Dec 2026 to Mon 4 Jan 2027');
  });
  it('finds the next working day', () => {
    expect(nextWorkday('2026-12-11')).toBe('2026-12-14');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
  });
  it('says where leave sits in time', () => {
    expect(timingOf('2026-12-01', '2026-12-03', '2026-12-10')).toBe('past');
    expect(timingOf('2026-12-08', '2026-12-12', '2026-12-10')).toBe('now');
    expect(timingOf('2026-12-15', '2026-12-16', '2026-12-10')).toBe('soon');
    expect(timingOf('2027-02-01', '2027-02-02', '2026-12-10')).toBe('later');
    expect(relativeStart('2026-12-11', '2026-12-12', '2026-12-10')).toBe('Starts tomorrow');
    expect(relativeStart('2026-12-14', '2026-12-18', '2026-12-10')).toBe('Starts in 4 days');
    expect(relativeStart('2026-12-08', '2026-12-11', '2026-12-10')).toBe('Back Mon 14 Dec');
  });
});

describe('who is away', () => {
  const mk = (id: string, s: string, e: string, status: AwayRow['status'] = 'approved'): AwayRow => ({
    leave_id: id, employee_id: id, employee_name: id, department_name: null, start_date: s, end_date: e, days: 1, leave_type: null, status,
  });
  it('groups today, this week and the next 30 days, ignoring pending', () => {
    const rows = [mk('now', '2026-12-09', '2026-12-11'), mk('week', '2026-12-11', '2026-12-11'), mk('soon', '2026-12-28', '2026-12-30'), mk('far', '2027-03-01', '2027-03-02'), mk('p', '2026-12-10', '2026-12-10', 'pending')];
    const g = groupAway(rows, '2026-12-10');
    expect(g.awayNow.map((r) => r.employee_id)).toEqual(['now']);
    expect(g.thisWeek.map((r) => r.employee_id)).toEqual(['week']);
    expect(g.soon.map((r) => r.employee_id)).toEqual(['soon']);
  });
});

describe('timeline and export', () => {
  const ev = (kind: string, extra: Partial<LeaveEvent> = {}): LeaveEvent => ({ id: '1', leave_id: 'l', actor_id: null, kind, from_status: null, to_status: null, note: null, details: null, created_at: '2026-12-01T00:00:00Z', ...extra });
  it('describes events in plain words', () => {
    expect(eventSentence(ev('approved'), 'Siye')).toBe('Siye approved it');
    expect(eventSentence(ev('reverted'), 'Siye')).toBe('Siye moved it back to pending');
    expect(eventSentence(ev('edited', { details: { before: { type: 'annual', start: '2026-12-07', end: '2026-12-11', days: 5 }, after: { type: 'annual', start: '2026-12-07', end: '2026-12-18', days: 10 } } }), 'Siye'))
      .toBe('Siye changed dates Mon 7 Dec to Fri 11 Dec 2026 to Mon 7 Dec to Fri 18 Dec 2026, 5 days to 10 days');
  });
  it('exports csv with quoting', () => {
    const row = { id: '1', employee_id: 'e', leave_type: 'annual', status: 'approved', start_date: '2026-12-07', end_date: '2026-12-11', days_requested: 5, is_half_day: false, reason: 'Trip, "family"', created_at: '2026-12-01T00:00:00Z', review_note: null, rejection_reason: null, cancel_reason: null } as LeaveRow;
    expect(leaveToCsv([row], () => 'Ada').split('\n')[1]).toBe('Ada,Annual,approved,2026-12-07,2026-12-11,5,no,"Trip, ""family""",,2026-12-01');
  });
  it('recognises the over-balance message', () => {
    expect(isOverBalanceError('OVER_BALANCE: too much')).toBe(true);
    expect(cleanDbMessage('OVER_BALANCE: too much')).toBe('too much');
  });
});
