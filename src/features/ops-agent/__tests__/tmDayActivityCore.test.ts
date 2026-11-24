import { describe, expect, it } from 'vitest';
import { activityLine, dayActivity, dayInZone, hoursText, matchRule, zonedDayEnd, zonedDayStart, captureMinutes } from '../../../../supabase/functions/_shared/tm-day-activity-core';

const log = (min: number, app: string, cat: string | null = null, extra: Record<string, string | null> = {}) => ({
  captured_at: new Date(Date.UTC(2026, 2, 4, 14, min)).toISOString(), app_name: app, window_title: null, url: null, productivity_category: cat, ...extra,
});

describe('rules', () => {
  const rules = [
    { app_name_contains: 'chrome', title_contains: null, category: 'productive', priority: 1 },
    { app_name_contains: 'instagram.com', title_contains: null, category: 'unproductive', priority: 2 },
  ];
  it('a site rule beats the browser app rule', () => {
    expect(matchRule(rules, { app_name: 'Google Chrome', window_title: 'x', url: 'https://www.instagram.com/p/1' })).toBe('unproductive');
    expect(matchRule(rules, { app_name: 'Google Chrome', window_title: 'x', url: 'https://docs.google.com/' })).toBe('productive');
    expect(matchRule(rules, { app_name: 'Notepad', window_title: 'x', url: null })).toBeNull();
  });
});

describe('dayActivity', () => {
  const rules = [{ app_name_contains: 'chrome', title_contains: null, category: 'productive', priority: 1 }];
  it('adds timer hours and computer time outside any timer, and splits by category', () => {
    // timer 14:00-15:00 (1 h); captures every 10 minutes from 14:00 to 15:50, the last five are outside the timer
    const logs = Array.from({ length: 12 }, (_, i) => log(i * 10, i < 6 ? 'Google Chrome' : i < 8 ? 'Steam' : 'Notepad', i >= 6 && i < 8 ? 'unproductive' : null));
    const a = dayActivity({ entries: [{ start_time: '2026-03-04T14:00:00Z', end_time: '2026-03-04T15:00:00Z' }], logs, rules, configuredMinutes: 10 });
    // 7 captures at 14:00..15:00 are inside the timer (inclusive), 5 outside: 1 h + 5 x 10 min
    expect(a.hoursWorked).toBeCloseTo(1 + 50 / 60, 1);
    expect(a.productivePct).toBe(50); // 6 of 12
    expect(a.unproductivePct).toBe(17); // 2 of 12
  });
  it('idle captures are not work and not counted', () => {
    const a = dayActivity({ entries: [], logs: [log(0, 'Chrome', 'idle'), log(10, 'Google Chrome'), log(20, 'Google Chrome')], rules, configuredMinutes: 10 });
    expect(a.hoursWorked).toBeCloseTo(20 / 60, 2);
    expect(a.productivePct).toBe(100);
  });
  it('timer only: hours are known and the percentages are not', () => {
    const a = dayActivity({ entries: [{ start_time: '2026-03-04T14:00:00Z', end_time: '2026-03-04T16:30:00Z' }], logs: [], rules: [], configuredMinutes: 10 });
    expect(a).toEqual({ hoursWorked: 2.5, productivePct: null, unproductivePct: null });
    expect(activityLine(a)).toBe('Hours Worked: 2.5 Hours; Productive: n/a; Unproductive: n/a');
  });
  it('captures that come closer than the configured interval count for the real gap', () => {
    const t = Array.from({ length: 10 }, (_, i) => Date.UTC(2026, 2, 4, 14, i));
    expect(captureMinutes(t, 10)).toBe(1);
  });
});

describe('wording and days', () => {
  it('writes the line the way the report needs it', () => {
    expect(activityLine({ hoursWorked: 6.5, productivePct: 72, unproductivePct: 8 })).toBe('Hours Worked: 6.5 Hours; Productive: 72%; Unproductive: 8%');
    expect(hoursText(1)).toBe('1 Hour');
    expect(hoursText(8)).toBe('8 Hours');
    expect(hoursText(0)).toBe('0 Hours');
  });
  it('a day in Eastern time starts at the right instant, also across daylight saving', () => {
    expect(new Date(zonedDayStart('2026-03-04', 'America/New_York')).toISOString()).toBe('2026-03-04T05:00:00.000Z');
    expect(new Date(zonedDayStart('2026-03-09', 'America/New_York')).toISOString()).toBe('2026-03-09T04:00:00.000Z'); // after the change on the 8th
    expect(new Date(zonedDayEnd('2026-03-07', 'America/New_York')).toISOString()).toBe('2026-03-08T05:00:00.000Z');
    expect(dayInZone('2026-03-05T03:30:00Z', 'America/New_York')).toBe('2026-03-04');
  });
});

import { reportActivityLine, reportDay } from '../../../../supabase/functions/_shared/tm-day-activity';

/** A stand-in for the database client: every query chain ends with the rows of its table. */
function fakeDb(tables: Record<string, unknown>, fail = false) {
  const q = (table: string) => {
    const chain: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'gte', 'lt', 'order', 'limit']) chain[m] = () => chain;
    chain.maybeSingle = () => Promise.resolve({ data: Array.isArray(tables[table]) ? (tables[table] as unknown[])[0] ?? null : tables[table] ?? null, error: null });
    chain.then = (res: (v: unknown) => unknown) => res({ data: tables[table] ?? [], error: fail && table === 'time_entries' ? { message: 'boom' } : null });
    return chain;
  };
  return { from: q } as never;
}

describe('the line added to the daily report', () => {
  it('uses the report-date field when the entry has one, else the day it was sent', () => {
    expect(reportDay('2026-03-03T00:00:00Z', '2026-03-05T03:00:00Z', 'America/New_York')).toBe('2026-03-03');
    expect(reportDay(null, '2026-03-05T03:00:00Z', 'America/New_York')).toBe('2026-03-04');
    expect(reportDay('not a date', '2026-03-05T15:00:00Z', 'America/New_York')).toBe('2026-03-05');
  });
  it('builds the line from the person\'s entries and captures', async () => {
    const db = fakeDb({
      time_entries: [{ start_time: '2026-03-04T14:00:00Z', end_time: '2026-03-04T20:30:00Z' }],
      time_activity_logs: [log(0, 'Google Chrome'), log(10, 'Google Chrome'), log(20, 'Steam', 'unproductive'), log(30, 'Google Chrome')],
      time_productivity_rules: [{ app_name_contains: 'chrome', title_contains: null, category: 'productive', priority: 1 }],
      time_agent_settings: { capture_interval_minutes: 10 },
    });
    expect(await reportActivityLine(db, 'p1', '2026-03-04', 'America/New_York')).toBe('Hours Worked: 6.5 Hours; Productive: 75%; Unproductive: 25%');
  });
  it('a failed lookup gives nothing, so the report still goes out', async () => {
    expect(await reportActivityLine(fakeDb({}, true), 'p1', '2026-03-04', 'America/New_York')).toBeNull();
  });
});
