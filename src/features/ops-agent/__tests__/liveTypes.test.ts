import { describe, expect, it } from 'vitest';
import { categoryOf, cleanDomain, isCalm, isEscalationRule, isSensitiveRule, isSystemLevel, spent } from '../liveTypes';
import { settingsSectionFromSplat } from '../agentTabs';

describe('categoryOf', () => {
  it('maps rule codes to the Inbox filter categories', () => {
    expect(categoryOf('TR01')).toBe('not_tracking');
    expect(categoryOf('TR02')).toBe('not_tracking');
    expect(categoryOf('TR03')).toBe('not_tracking');
    expect(categoryOf('TR05')).toBe('sites');
    expect(categoryOf('RP01')).toBe('reports');
    expect(categoryOf('TK01')).toBe('tasks');
    expect(categoryOf('TK13')).toBe('tasks');
    expect(categoryOf('TK04')).toBe('tasks');
    expect(categoryOf('RP03')).toBe('reports');
    for (const c of ['PY01', 'BK02', 'LN01']) expect(categoryOf(c)).toBe('money');
    for (const c of ['DC01', 'PF01', 'HL01', 'CT01']) expect(categoryOf(c)).toBe('people_hr');
    expect(categoryOf('ES01')).toBe('escalations');
    expect(categoryOf('ES02')).toBe('escalations');
    for (const c of ['SY01', 'SY02', 'SY04']) expect(categoryOf(c)).toBe('system');
    expect(categoryOf('SY03')).toBe('other');
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

describe('sensitive rules', () => {
  it('knows which rule codes are count-only items about a sensitive module', () => {
    for (const c of ['PY01', 'BK01', 'LN02', 'DC01', 'PF03', 'HL01', 'CT01']) expect(isSensitiveRule(c)).toBe(true);
    for (const c of ['TR01', 'TK04', 'RP01', 'SY03', 'HUMAN_ACTION', 'PYX', '', null]) expect(isSensitiveRule(c)).toBe(false);
  });
});

describe('system-level items', () => {
  it('have no person: sensitive counts, escalations and the agent\'s own checks', () => {
    for (const c of ['LN01', 'PY01', 'ES01', 'ES02', 'SY01', 'SY02', 'SY03', 'SY04']) expect(isSystemLevel(c)).toBe(true);
    for (const c of ['TR01', 'TK01', 'RP01', 'HUMAN_ACTION', null]) expect(isSystemLevel(c)).toBe(false);
    expect(isEscalationRule('ES01')).toBe(true);
    expect(isEscalationRule('SY01')).toBe(false);
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
    expect(settingsSectionFromSplat('settings/rules')).toBe('rules');
    expect(settingsSectionFromSplat('settings/brief')).toBe('brief');
    expect(settingsSectionFromSplat('settings')).toBe('claude');
    expect(settingsSectionFromSplat('settings/nope')).toBe('claude');
    expect(settingsSectionFromSplat('chat/team')).toBe('claude');
    expect(settingsSectionFromSplat(undefined)).toBe('claude');
  });
});
