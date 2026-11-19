import { describe, expect, it } from 'vitest';
import { categoryOf, cleanDomain, isCalm, spent } from '../liveTypes';
import { settingsSectionFromSplat } from '../agentTabs';

describe('categoryOf', () => {
  it('maps rule codes to the Inbox filter categories', () => {
    expect(categoryOf('TR01')).toBe('not_tracking');
    expect(categoryOf('TR02')).toBe('not_tracking');
    expect(categoryOf('TR05')).toBe('sites');
    expect(categoryOf('RP01')).toBe('reports');
    expect(categoryOf('TK01')).toBe('tasks');
    expect(categoryOf('TK13')).toBe('tasks');
    expect(categoryOf('HUMAN_ACTION')).toBe('other');
    expect(categoryOf('INBOUND')).toBe('other');
    expect(categoryOf('SY03')).toBe('other');
    expect(categoryOf(null)).toBe('other');
  });
  it('treats only low or info Ready for review and Task completed as calm', () => {
    expect(isCalm({ rule_code: 'TK13', severity: 'low' })).toBe(true);
    expect(isCalm({ rule_code: 'TK14', severity: 'info' })).toBe(true);
    expect(isCalm({ rule_code: 'TK13', severity: 'high' })).toBe(false);
    expect(isCalm({ rule_code: 'TK01', severity: 'low' })).toBe(false);
  });
});

describe('site names', () => {
  it('cuts anything that looks like an address down to the domain', () => {
    expect(cleanDomain('https://www.Facebook.com/some/page?id=1')).toBe('facebook.com');
    expect(cleanDomain('youtube.com')).toBe('youtube.com');
    expect(cleanDomain('mail.google.com:443/inbox')).toBe('mail.google.com');
  });
  it('writes time spent compactly', () => {
    expect(spent(40)).toBe('40s');
    expect(spent(740)).toBe('12m');
    expect(spent(3900)).toBe('1h 5m');
    expect(spent(7200)).toBe('2h');
  });
});

describe('Settings section from the address', () => {
  it('reads settings/<section>, and falls back to the first section', () => {
    expect(settingsSectionFromSplat('settings/team')).toBe('team');
    expect(settingsSectionFromSplat('settings/sites/extra')).toBe('sites');
    expect(settingsSectionFromSplat('settings')).toBe('claude');
    expect(settingsSectionFromSplat('settings/nope')).toBe('claude');
    expect(settingsSectionFromSplat('chat/team')).toBe('claude');
    expect(settingsSectionFromSplat(undefined)).toBe('claude');
  });
});
