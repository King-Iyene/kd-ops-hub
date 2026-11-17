import { describe, expect, it } from 'vitest';
import { addTaskToday, formatIdle, taskDisplayName, idleDecision, mergeTaskToday, taskTodayMs, withinTrackingHours, type TaskToday } from '../src/logic';
import { matchProductivityRule } from '../src/productivityRules';

describe('idleDecision', () => {
  it("'pause' mode: nothing happens before the limit", () => {
    const d = idleDecision('pause', 4 * 60, 5, 5);
    expect(d).toMatchObject({ pauseTimer: false, skipCapture: false, markIdle: false, showIdleOnWidget: false });
  });
  it("'pause' mode: at the limit the timer pauses and capture stops", () => {
    const d = idleDecision('pause', 5 * 60, 5, 5);
    expect(d).toMatchObject({ pauseTimer: true, skipCapture: true, markIdle: true });
  });
  it("'pause' mode: with away time shorter than the limit, captures are marked idle first, no pause yet", () => {
    const d = idleDecision('pause', 4 * 60, 10, 3);
    expect(d).toMatchObject({ pauseTimer: false, skipCapture: false, markIdle: true });
  });
  it("'track' mode never pauses and never skips capture, however long the idle", () => {
    const d = idleDecision('track', 3 * 3600, 20, 5);
    expect(d).toMatchObject({ pauseTimer: false, skipCapture: false, markIdle: true, showIdleOnWidget: true });
  });
  it("'track' mode shows nothing while the person is active or only briefly idle", () => {
    expect(idleDecision('track', 30, 20, 5)).toMatchObject({ markIdle: false, showIdleOnWidget: false });
    expect(idleDecision('track', 4 * 60, 20, 5)).toMatchObject({ markIdle: false, showIdleOnWidget: false });
  });
  it('a 20 minute limit pauses at exactly 20 minutes, not 19', () => {
    expect(idleDecision('pause', 19 * 60 + 59, 20, 5).pauseTimer).toBe(false);
    expect(idleDecision('pause', 20 * 60, 20, 5).pauseTimer).toBe(true);
  });
});

describe('formatIdle', () => {
  it.each([
    [20, '1 minute'],
    [20 * 60, '20 minutes'],
    [60 * 60, '1 hour'],
    [65 * 60, '1 h 05 min'],
    [2 * 3600, '2 hours'],
    [90 * 60, '1 h 30 min'],
  ])('%i seconds reads %s', (sec, text) => expect(formatIdle(sec)).toBe(text));
});

describe('per-task time today (the clock continues instead of restarting)', () => {
  const day = 'Tue Nov 17 2026';
  const MIN = 60_000;

  it('pause then resume: the display carries on from where it stopped', () => {
    let state: TaskToday | undefined;
    state = addTaskToday(state, day, 'task-a', 10 * MIN); // ran 10 minutes, then paused
    // resumed: the widget shows base + the new run's elapsed
    const shownAfter5 = taskTodayMs(state, day, 'task-a') + 5 * MIN;
    expect(shownAfter5).toBe(15 * MIN);
  });
  it('stop, work on another task, come back: each task keeps its own total', () => {
    let state: TaskToday | undefined;
    state = addTaskToday(state, day, 'a', 20 * MIN);
    state = addTaskToday(state, day, 'b', 7 * MIN);
    state = addTaskToday(state, day, 'a', 5 * MIN);
    expect(taskTodayMs(state, day, 'a')).toBe(25 * MIN);
    expect(taskTodayMs(state, day, 'b')).toBe(7 * MIN);
    expect(taskTodayMs(state, day, 'never-worked')).toBe(0);
  });
  it('a new day starts from zero', () => {
    const state = addTaskToday(undefined, day, 'a', 30 * MIN);
    expect(taskTodayMs(state, 'Wed Nov 18 2026', 'a')).toBe(0);
    const next = addTaskToday(state, 'Wed Nov 18 2026', 'a', 2 * MIN);
    expect(taskTodayMs(next, 'Wed Nov 18 2026', 'a')).toBe(2 * MIN);
  });
  it('zero, negative and NaN segments are ignored', () => {
    let state = addTaskToday(undefined, day, 'a', 5 * MIN);
    state = addTaskToday(state, day, 'a', 0);
    state = addTaskToday(state, day, 'a', -3 * MIN);
    state = addTaskToday(state, day, 'a', NaN);
    expect(taskTodayMs(state, day, 'a')).toBe(5 * MIN);
  });
  it('syncing with the server keeps an offline segment the server has not received yet', () => {
    const local = addTaskToday(undefined, day, 'a', 30 * MIN); // 30 min worked offline
    const merged = mergeTaskToday(local, day, { a: 20 * MIN, b: 4 * MIN }); // server only knows 20
    expect(taskTodayMs(merged, day, 'a')).toBe(30 * MIN);
    expect(taskTodayMs(merged, day, 'b')).toBe(4 * MIN);
  });
  it('syncing with the server picks up time tracked elsewhere (for example the website)', () => {
    const local = addTaskToday(undefined, day, 'a', 10 * MIN);
    const merged = mergeTaskToday(local, day, { a: 45 * MIN });
    expect(taskTodayMs(merged, day, 'a')).toBe(45 * MIN);
  });
  it('merging into state from yesterday ignores yesterday', () => {
    const old = addTaskToday(undefined, 'Mon Nov 16 2026', 'a', 99 * MIN);
    const merged = mergeTaskToday(old, day, { a: 3 * MIN });
    expect(taskTodayMs(merged, day, 'a')).toBe(3 * MIN);
  });
});

describe('withinTrackingHours', () => {
  const rows = [
    { weekday: 0, from_time: '09:00:00', to_time: '17:00:00' }, // Monday
    { weekday: 6, from_time: '00:00:00', to_time: '23:59:59' }, // Sunday
  ];
  // 2026-11-16 is a Monday, 2026-11-15 a Sunday, 2026-11-17 a Tuesday
  it('no rows means no restriction', () => expect(withinTrackingHours([], new Date('2026-11-16T03:00:00'))).toBe(true));
  it('inside the window on a Monday', () => expect(withinTrackingHours(rows, new Date('2026-11-16T12:00:00'))).toBe(true));
  it('outside the window on a Monday', () => {
    expect(withinTrackingHours(rows, new Date('2026-11-16T08:59:59'))).toBe(false);
    expect(withinTrackingHours(rows, new Date('2026-11-16T17:00:01'))).toBe(false);
  });
  it('the window edges count as inside', () => {
    expect(withinTrackingHours(rows, new Date('2026-11-16T09:00:00'))).toBe(true);
    expect(withinTrackingHours(rows, new Date('2026-11-16T17:00:00'))).toBe(true);
  });
  it('Sunday maps to weekday 6', () => expect(withinTrackingHours(rows, new Date('2026-11-15T03:00:00'))).toBe(true));
  it('a weekday with no row is unrestricted', () => expect(withinTrackingHours(rows, new Date('2026-11-17T03:00:00'))).toBe(true));
});

describe('productivity rules: site beats title beats app', () => {
  const rules = [
    { app_name_contains: 'Google Chrome', title_contains: null, category: 'productive', priority: 60 },
    { app_name_contains: 'facebook.com', title_contains: null, category: 'unproductive', priority: 60 },
    { app_name_contains: null, title_contains: 'Figma', category: 'productive', priority: 60 },
    { app_name_contains: 'github.com', title_contains: null, category: 'productive', priority: 60 },
    { app_name_contains: 'github.com', title_contains: null, category: 'blocked', priority: 40 },
  ];
  it('a red site inside a work browser is red', () => {
    expect(matchProductivityRule(rules, 'Google Chrome', 'Home', 'https://facebook.com/')).toBe('unproductive');
  });
  it('the browser rule applies when the site has no rule', () => {
    expect(matchProductivityRule(rules, 'Google Chrome', 'Docs', 'https://example.org/')).toBe('productive');
  });
  it('a title rule works with no site', () => {
    expect(matchProductivityRule(rules, 'SomeApp', 'Design in Figma', null)).toBe('productive');
  });
  it('lower priority number wins at the same level (hand-added entries beat starter rules)', () => {
    expect(matchProductivityRule(rules, 'Google Chrome', 'x', 'https://github.com/')).toBe('blocked');
  });
  it('nothing matches: no category', () => {
    expect(matchProductivityRule(rules, 'Unknown', 'x', null)).toBeNull();
  });
});

describe('taskDisplayName (tracking a project itself)', () => {
  it('the project General task shows the project name', () => {
    expect(taskDisplayName({ taskName: 'General', projectName: 'KD Squares - Marketing and Promotions' })).toBe('KD Squares - Marketing and Promotions');
    expect(taskDisplayName({ taskName: ' general ', projectName: 'Otherside' })).toBe('Otherside');
  });
  it('a normal task keeps its own name', () => {
    expect(taskDisplayName({ taskName: 'Design review', projectName: 'Otherside' })).toBe('Design review');
  });
  it('with no project name it falls back to the task name', () => {
    expect(taskDisplayName({ taskName: 'General', projectName: '' })).toBe('General');
  });
});
