import { describe, expect, it } from 'vitest';
import { MAX_ATTEMPTS, formatFlag, formatFollowup, formatSummary, isTeamRule, plainText } from '../../../../supabase/functions/_shared/agent-dispatch-core';

describe('formatFlag', () => {
  const f = { id: '1', rule_code: 'TR01', severity: 'high', title: 'Not tracking time', why: 'Their work day started at 9:00 AM ET and nothing has been tracked 30 minutes in.', suggested_action: 'Ask her to start a timer.', item_type: 'flag' };
  it('is written to the person: what was noticed and a question, with no suggestion and no link', () => {
    const m = formatFlag(f, 'Cara Obi');
    expect(m.title).toBe('[HIGH] Not tracking time');
    expect(m.text).toBe('Their work day started at 9:00 AM ET and nothing has been tracked 30 minutes in.\nCan you tell us what is going on with this?');
    expect(m.text).not.toContain('Suggested');
    expect(m.text).not.toContain('Ops Agent');
    expect(m.link).toBeUndefined();
    expect(m.ask).toEqual({ observation: f.why, question: 'Can you tell us what is going on with this?', followUp: 'please follow up with Cara and get clarity on what is happening.' });
    expect(m.event).toBe('flag');
    expect(m.meta).toEqual({ severity: 'high', rule: 'TR01', person: 'Cara Obi' });
  });
  it('has no question or follow up for a system item', () => {
    const m = formatFlag({ ...f, rule_code: 'LN01', suggested_action: null, why: '3 loan requests are waiting.' }, null);
    expect(m.text).toBe('3 loan requests are waiting.');
    expect(m.ask).toBeUndefined();
  });
  it('an item waiting for a manager is put to the manager, with no follow up line', () => {
    const m = formatFlag({ ...f, rule_code: 'TK08', why: 'A task is waiting for review.' }, 'Cara Obi', { toManager: true });
    expect(m.ask).toEqual({ observation: 'A task is waiting for review.', question: 'Could you take a look and let us know what is happening?', followUp: '' });
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

describe('no link into the Agent', () => {
  it('a summary carries no link, because the people who read the channel cannot open the Agent', () => {
    expect(formatSummary({ period_kind: 'day', period_start: 'a', period_end: 'a', narrative: 'x' }).link).toBeUndefined();
  });
});

describe('formatFollowup', () => {
  const f = { id: '1', rule_code: 'TK01', severity: 'medium', title: 'Overdue: Client proposal', why: 'Four days late.', suggested_action: null, item_type: 'flag' };
  it('stage 1 goes back to the person and still copies the manager', () => {
    const m = formatFollowup(f, 'Cara Obi', 1, 'Alice Eze');
    expect(m.title).toBe('[FOLLOW-UP] Overdue: Client proposal');
    expect(m.ask).toEqual({ observation: 'This is still open 24 hours after we first asked. Four days late.', question: 'Can you tell us where this stands and when it will be sorted?', followUp: 'please follow up with Cara and get clarity on what is happening.' });
    expect(m.text).toBe('This is still open 24 hours after we first asked. Four days late.\nCan you tell us where this stands and when it will be sorted?');
  });
  it('stage 2 asks the manager to step in, with no one else to follow up', () => {
    const m = formatFollowup(f, 'Cara Obi', 2, 'Alice Eze');
    expect(m.title).toBe('[ESCALATION] Overdue: Client proposal');
    expect(m.ask?.observation).toBe("Cara Obi's item has been open for 2 days with no change, even after we followed up. Four days late.");
    expect(m.ask?.question).toBe('Could you step in, find out what is happening and let us know when it will be sorted?');
    expect(m.ask?.followUp).toBe('');
  });
  it('stage 2 with no manager stays with the person and says a Super Admin must step in', () => {
    const m = formatFollowup(f, 'Cara Obi', 2, null);
    expect(m.ask?.observation).toContain('no manager is set for you, so a Super Admin needs to step in');
    expect(m.ask?.followUp).toBe('');
  });
});

describe('formatSummary: scorecard', () => {
  it('is named for what it is', () => {
    expect(formatSummary({ period_kind: 'scorecard', period_start: '2026-11-16', period_end: '2026-11-22', narrative: null }).title).toBe('Weekly scorecard, 2026-11-16 to 2026-11-22');
  });
});

describe('isTeamRule: only team items are sent on their own', () => {
  it('tasks, time tracking and daily reports are team items', () => {
    for (const c of ['TK01', 'TK13', 'TR01', 'TR10', 'RP01', 'RP03']) expect(isTeamRule(c)).toBe(true);
  });
  it('missing fuel and expense receipts are team items too, so the driver is asked and the manager tagged', () => {
    for (const c of ['FL01', 'EX01']) expect(isTeamRule(c)).toBe(true);
    for (const c of ['FX01', 'E01', 'EXX01', 'XFL01']) expect(isTeamRule(c)).toBe(false);
  });
  it('system, payment, HR and setup items stay in the Inbox', () => {
    for (const c of ['SY01', 'SY03', 'PY01', 'PY02', 'BK01', 'LN01', 'DC01', 'PF01', 'HL01', 'CT01', 'SU01', 'FT01', 'ES01', '']) expect(isTeamRule(c)).toBe(false);
    expect(isTeamRule(null)).toBe(false);
    expect(isTeamRule(undefined)).toBe(false);
  });
});
