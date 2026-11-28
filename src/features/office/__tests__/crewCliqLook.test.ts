import { describe, expect, it } from 'vitest';
import { FOOTER, KIND_LOOK, clean, firstName, headline, shortLines, withFooter } from '../../../../supabase/functions/_shared/crew-cliq-look';
import { formatDecision, formatError, formatHelp, formatProposal, formatSaid, formatStatus, formatWelcome, formatChannelNotice, type ProposalLine } from '../../../../supabase/functions/_shared/crew-cliq-core';
import { OWN_MARK } from '../../../../supabase/functions/_shared/agent-cliq-monitor-core';

const P: ProposalLine = { code: 'a1b2c3', agent_name: 'Hale King', agent_title: 'Chief Financial Officer', action: 'record.update', summary: 'Correct the March rent amount', risk: 'medium' };

describe('crew cliq look: one design for every message', () => {
  it('has an emoji and a plain-English label for every kind', () => {
    for (const k of ['approval', 'question', 'alert', 'challenge', 'reminder', 'brief', 'report', 'message', 'reply']) {
      expect(KIND_LOOK[k].emoji).toBeTruthy();
      expect(KIND_LOOK[k].label).toMatch(/^[A-Z][a-z]/);
    }
    const emojis = ['approval', 'question', 'alert', 'brief', 'report'].map((k) => KIND_LOOK[k].emoji);
    expect(new Set(emojis).size).toBe(5);   // the five the owner asked for each look different
  });

  it('builds a one-line headline: emoji, kind, first name and role', () => {
    expect(headline('approval', 'Hale King', 'Chief Financial Officer')).toBe('✋ Approval needed: Hale, Chief Financial Officer');
    expect(headline('question', 'Henry Ashford', 'Head of Operations')).toBe('❓ Question: Henry, Head of Operations');
    expect(headline('nonsense', 'A B', '')).toBe('💬 Message: A');
    expect(headline('alert', '', '')).toBe('🚨 Alert');
    expect(headline('alert', 'x'.repeat(500), '').length).toBeLessThanOrEqual(200);
    expect(headline('report', 'Hale\nKing', 'CFO')).not.toContain('\n');
    expect(firstName('  Hale   King ')).toBe('Hale');
  });

  it('uses only bold (added around the title by the sender) and italics (the footer): nothing else Cliq might not render from the API', () => {
    const m = formatProposal(P);
    expect(m.title).not.toMatch(/[*_~`#>]/);
    const lines = m.text.split('\n');
    expect(lines[lines.length - 1]).toBe(FOOTER);
    expect(FOOTER).toMatch(/^_[^_*]+_$/);
    const body = lines.slice(0, -1).join('\n');
    expect(body).not.toMatch(/[*~`#]|^>|\{@/m);
  });

  it('shows an approval as: headline, 2-4 lines of substance, the exact reply lines each on their own line, then the footer', () => {
    const m = formatProposal(P);
    const lines = m.text.split('\n');
    expect(lines.slice(0, 3)).toEqual(['Wants to: change a record', 'Correct the March rent amount', 'Risk: 🟡 medium']);
    expect(lines[3]).toBe('');
    expect(lines.slice(4, 7)).toEqual(['Reply with:', 'approve a1b2c3', 'reject a1b2c3 your reason']);
    expect(lines.slice(-2)).toEqual(['', FOOTER]);
    const high = formatProposal({ ...P, risk: 'high' }).text.split('\n');
    expect(high).toContain('approve a1b2c3 confirm');
    expect(high).toContain('reject a1b2c3 your reason');
    expect(high.filter((l) => l.startsWith('approve'))).toEqual(['approve a1b2c3 confirm']);
  });

  it('never offers an approve line for a payment or a payroll run', () => {
    for (const action of ['draft.batch_payment', 'draft.payroll_run']) {
      const lines = formatProposal({ ...P, action, risk: 'high' }).text.split('\n');
      expect(lines.some((l) => l.startsWith('approve'))).toBe(false);
      expect(lines).toContain('reject a1b2c3 your reason');
      expect(lines).toContain('Payments are approved in the app, never from Cliq.');
    }
  });

  it('turns an agent-written text into plain lines that cannot tag anybody or break the formatting', () => {
    expect(clean('## Title {@123} **bold** *x* ~y~ `z` _w_ snake_case')).toBe('Title bold ∗x∗ ∼y∼ \'z\' w snake_case');
    expect(clean(`a${OWN_MARK}b${String.fromCharCode(0x200b)}c`)).toBe('abc');
    expect(clean(undefined)).toBe('');
    expect(clean('a\n\n\n\nb')).toBe('a\n\nb');
    expect(clean('x'.repeat(50), 10)).toHaveLength(10);
  });

  it('cuts a long text to a few short lines and says so', () => {
    const r = shortLines('one\ntwo\n\nthree\nfour\nfive', { lines: 4 });
    expect(r.lines).toEqual(['one', 'two', 'three', 'four']);
    expect(r.more).toBe(true);
    const longLine = shortLines('y'.repeat(300), { lineMax: 50 });
    expect(longLine.lines[0]).toHaveLength(50);
    expect(longLine.lines[0].endsWith('…')).toBe(true);
    expect(longLine.more).toBe(true);
    expect(shortLines('short').more).toBe(false);
    expect(withFooter(['a', 'b'])).toBe(`a\nb\n\n${FOOTER}`);
  });

  it('gives every reply the same look: an emoji headline, plain lines, the footer', () => {
    const all = [
      formatDecision('approve', { status: 'executed', summary: 'Fix rent' }), formatDecision('approve', { status: 'approved' }), formatDecision('reject', { status: 'rejected', agent: 'Hale King' }),
      formatDecision('approve', { status: 'failed', error: 'x' }), formatSaid('Hale King'), formatError('bad'), formatHelp(), formatStatus([P]), formatStatus([]), formatWelcome(2), formatChannelNotice(),
    ];
    for (const m of all) {
      expect(m.title).toMatch(/^\p{Extended_Pictographic}/u);
      expect(m.text.split('\n').pop()).toBe(FOOTER);
      expect(m.title).not.toMatch(/[*_~`]/);
      expect(m.text.split('\n').filter((l) => l !== '').length).toBeLessThanOrEqual(9);
    }
  });
});
