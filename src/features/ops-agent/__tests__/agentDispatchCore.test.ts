import { describe, expect, it } from 'vitest';
import { MAX_ATTEMPTS, formatFlag, formatSummary, plainText } from '../../../../supabase/functions/_shared/agent-dispatch-core';

describe('formatFlag', () => {
  const f = { id: '1', rule_code: 'TR01', severity: 'high', title: 'Not tracking time', why: 'Cara has not tracked since 9:20 AM EST.', suggested_action: 'Ask her to start a timer.', item_type: 'flag' };
  it('reads well in any tool', () => {
    const m = formatFlag(f, 'Cara');
    expect(m.title).toBe('[HIGH] Not tracking time');
    expect(m.text).toContain('Cara has not tracked since 9:20 AM EST.');
    expect(m.text).toContain('Person: Cara');
    expect(m.text).toContain('Suggested: Ask her to start a timer.');
    expect(m.event).toBe('flag');
    expect(m.meta).toEqual({ severity: 'high', rule: 'TR01', person: 'Cara' });
  });
  it('has no person line for a system item', () => {
    const m = formatFlag({ ...f, rule_code: 'LN01', suggested_action: null }, null);
    expect(m.text).not.toContain('Person:');
    expect(m.text).not.toContain('Suggested:');
  });
});

describe('formatSummary', () => {
  it('turns markdown into plain text and names the period', () => {
    const m = formatSummary({ period_kind: 'day', period_start: '2026-11-18', period_end: '2026-11-18', narrative: '## Wednesday, Nov 18\n\n**Tracking.** 4 of 5.\n\n\n\n**Tasks.** 3 done.' });
    expect(m.title).toBe('Daily summary, 2026-11-18');
    expect(m.text).toBe('Wednesday, Nov 18\n\nTracking. 4 of 5.\n\nTasks. 3 done.');
    expect(formatSummary({ period_kind: 'week', period_start: '2026-11-16', period_end: '2026-11-20', narrative: null }).title).toBe('Weekly summary, 2026-11-16 to 2026-11-20');
  });
  it('plainText leaves ordinary text alone', () => { expect(plainText('a * b ** c')).toBe('a * b ** c'); });
});

describe('retries', () => { it('stops after a few tries', () => { expect(MAX_ATTEMPTS).toBe(4); }); });

describe('links', () => {
  it('a flag and a summary carry a link back to the agent', () => {
    const f = { id: 'abc', rule_code: 'TR01', severity: 'high', title: 'T', why: 'w', suggested_action: null, item_type: 'flag' };
    expect(formatFlag(f, null, 'https://ops.kdsquares.com').link).toEqual({ url: 'https://ops.kdsquares.com/agent/inbox?flag=abc', label: 'Open this item' });
    expect(formatFlag(f, null).link).toBeUndefined();
    expect(formatSummary({ period_kind: 'day', period_start: 'a', period_end: 'a', narrative: 'x' }, 'https://ops.kdsquares.com').link?.url).toBe('https://ops.kdsquares.com/agent/summaries');
  });
});
