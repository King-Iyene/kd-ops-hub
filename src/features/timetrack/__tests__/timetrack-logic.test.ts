import { describe, expect, it } from 'vitest';
import { captureDomain, normaliseEntry, parseEntryList, siteOrAppKey } from '../lib/siteNames';
import { durationAxis, fmtDuration } from '../ui/charts';
import { datePresets } from '@/components/ui-kit/DateRangeSelect';

describe('captureDomain', () => {
  it('drops www and the path', () => expect(captureDomain({ url: 'https://www.github.com/King/x?y=1' })).toBe('github.com'));
  it('keeps subdomains', () => expect(captureDomain({ url: 'https://eu2.make.com/' })).toBe('eu2.make.com'));
  it('null for no or bad url', () => {
    expect(captureDomain({ url: null })).toBeNull();
    expect(captureDomain({ url: 'not a url' })).toBeNull();
  });
});

describe('siteOrAppKey', () => {
  it('uses the site when the address was read', () => {
    expect(siteOrAppKey({ url: 'https://claude.ai/', app_name: 'Google Chrome', window_title: 'x' })).toEqual({ key: 'claude.ai', isSite: true });
  });
  it('a web-app window with no address bar is named by its title (Brave PWA)', () => {
    expect(siteOrAppKey({ url: null, app_name: 'Brave Browser', window_title: 'WhatsApp Web' })).toEqual({ key: 'WhatsApp Web', isSite: true });
  });
  it("strips the browser's name from the title", () => {
    expect(siteOrAppKey({ url: null, app_name: 'Google Chrome', window_title: 'Inbox (3) - Gmail - Google Chrome' }).key).toBe('Inbox (3) - Gmail');
    expect(siteOrAppKey({ url: null, app_name: 'Brave Browser', window_title: 'KDOps - Brave' }).key).toBe('KDOps');
    expect(siteOrAppKey({ url: null, app_name: 'Microsoft Edge', window_title: 'Docs - Microsoft Edge' }).key).toBe('Docs');
  });
  it('a normal app keeps its application name', () => {
    expect(siteOrAppKey({ url: null, app_name: 'Slack', window_title: 'general | KD' })).toEqual({ key: 'Slack', isSite: false });
  });
  it('a browser with no title falls back to the app name', () => {
    expect(siteOrAppKey({ url: null, app_name: 'Brave Browser', window_title: '' })).toEqual({ key: 'Brave Browser', isSite: false });
  });
  it('a very long page title is not used as a name', () => {
    expect(siteOrAppKey({ url: null, app_name: 'Google Chrome', window_title: 'x'.repeat(90) }).isSite).toBe(false);
  });
  it('no app name at all is Unknown', () => expect(siteOrAppKey({ url: null }).key).toBe('Unknown'));
});

describe('adding apps and websites by hand', () => {
  it('tidies links to the site name', () => {
    expect(normaliseEntry('https://www.Facebook.com/groups/1?x=2', 'site')).toBe('facebook.com');
    expect(normaliseEntry('netflix.com', 'site')).toBe('netflix.com');
    expect(normaliseEntry('http://sub.example.co.uk:8080/path', 'site')).toBe('sub.example.co.uk');
  });
  it('rejects things that are not websites', () => {
    expect(normaliseEntry('not a site', 'site')).toBeNull();
    expect(normaliseEntry('localhost', 'site')).toBeNull();
    expect(normaliseEntry('', 'site')).toBeNull();
  });
  it('keeps app names as typed', () => expect(normaliseEntry('  Google Chrome ', 'app')).toBe('Google Chrome'));
  it('a pasted list: splits on lines, commas and semicolons, removes duplicates, reports the bad ones', () => {
    const r = parseEntryList('facebook.com\nhttps://www.tiktok.com/@x, netflix.com;Facebook.com\nnot a site\n\n', 'site');
    expect(r.ok).toEqual(['facebook.com', 'tiktok.com', 'netflix.com']);
    expect(r.bad).toEqual(['not a site']);
  });
});

describe('durations', () => {
  it.each([
    [0, '0m'], [0.004, '<1m'], [0.58, '35m'], [1, '1h'], [1.75, '1h 45m'], [2, '2h'], [25.5, '25h 30m'], [8.0833, '8h 05m'],
  ])('%s hours reads %s', (h, text) => expect(fmtDuration(h)).toBe(text));

  it('the chart axis always reaches the biggest value and uses round steps', () => {
    for (const max of [0.2, 0.9, 1.7, 3.2, 7.5, 12, 40]) {
      const a = durationAxis(max);
      expect(a.domain[1]).toBeGreaterThanOrEqual(max);
      expect(a.ticks.length).toBeLessThanOrEqual(6);
      expect(a.ticks[0]).toBe(0);
    }
  });
});

describe('date range presets (weeks start on Monday)', () => {
  const p = Object.fromEntries(datePresets(new Date('2026-11-17T12:00:00')).map((x) => [x.key, [x.start, x.end]]));
  it('today / yesterday', () => {
    expect(p.today).toEqual(['2026-11-17', '2026-11-17']);
    expect(p.yesterday).toEqual(['2026-11-16', '2026-11-16']);
  });
  it('this week and last week', () => {
    expect(p.week).toEqual(['2026-11-16', '2026-11-17']);
    expect(p.lastweek).toEqual(['2026-11-09', '2026-11-15']);
  });
  it('this month and last month', () => {
    expect(p.month).toEqual(['2026-11-01', '2026-11-17']);
    expect(p.lastmonth).toEqual(['2026-10-01', '2026-10-31']);
  });
  it('this year and last year', () => {
    expect(p.year).toEqual(['2026-01-01', '2026-11-17']);
    expect(p.lastyear).toEqual(['2025-01-01', '2025-12-31']);
  });
  it('all time ends today', () => expect(p.all[1]).toBe('2026-11-17'));
});
