import { describe, expect, it } from 'vitest';
import { formatCrewMessage } from '../../../../supabase/functions/_shared/agent-dispatch-core';

describe('crew message in Cliq', () => {
  it('has a headline with an emoji for the kind, the first name and the role, then the words as they are, then a quiet footer', () => {
    const m = formatCrewMessage({ kind: 'challenge', body: 'I advise **against** paying all salaries on the 28th: cash is short by N1,200,000.' }, 'Hale King', 'Chief Financial Officer');
    expect(m.title).toBe('⚠️ Challenge to your order: Hale, Chief Financial Officer');
    expect(m.text).toBe('I advise against paying all salaries on the 28th: cash is short by N1,200,000.\n\n_Crew · KD Ops_');
    expect(m.meta?.severity).toBe('high');
    expect(m.event).toBe('crew');
  });

  it('uses a different emoji for each kind and leaves the title out when the agent has none', () => {
    const t = (kind: string) => formatCrewMessage({ kind, body: 'x' }, 'Edmund Whitcombe', '').title;
    expect(t('report')).toBe('📊 Report: Edmund');
    expect(t('alert')).toBe('🚨 Alert: Edmund');
    expect(t('question')).toBe('❓ Question: Edmund');
    expect(t('brief')).toBe('📰 Briefing: Edmund');
    expect(t('reminder')).toBe('⏰ Reminder: Edmund');
    expect(formatCrewMessage({ kind: 'report', body: 'x' }, 'Edmund Whitcombe', '').meta?.severity).toBe('info');
  });

  it('keeps it to four short lines and says where the rest is, never a wall of text, never an unknown label', () => {
    const long = formatCrewMessage({ kind: 'something_new', body: 'x'.repeat(5000) }, 'A', 'B');
    expect(long.title).toBe('💬 Message: A, B');
    expect(long.text.length).toBeLessThan(400);
    expect(long.text).toContain('…the rest is in KD Ops > Crew.');
    const many = formatCrewMessage({ kind: 'report', body: ['one', 'two', 'three', 'four', 'five', 'six'].join('\n') }, 'A', 'B');
    expect(many.text.split('\n').filter((l) => ['one', 'two', 'three', 'four'].includes(l))).toHaveLength(4);
    expect(many.text).not.toContain('five');
    expect(many.text).toContain('…the rest is in KD Ops > Crew.');
    const short = formatCrewMessage({ kind: 'report', body: 'Just this.' }, 'A', 'B');
    expect(short.text).not.toContain('the rest is in');
  });

  it('shows agent-written text as plain words: no tags that could notify anyone, no stray formatting marks', () => {
    const m = formatCrewMessage({ kind: 'alert', body: '## Heads up {@123456} and *everyone* ~gone~ `x` _soon_ crew_settings' }, 'Hale King', 'CFO');
    expect(m.text).not.toContain('{@');
    expect(m.text).not.toMatch(/^#/);
    const body = m.text.split('\n')[0];
    expect(body).toBe('Heads up and ∗everyone∗ ∼gone∼ \'x\' soon crew_settings');
  });
});
