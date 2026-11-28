import { describe, expect, it } from 'vitest';
import { formatCrewMessage } from '../../../../supabase/functions/_shared/agent-dispatch-core';

describe('crew message in Cliq', () => {
  it('says who wrote it and what kind it is, then the words as they are', () => {
    const m = formatCrewMessage({ kind: 'challenge', body: 'I advise **against** paying all salaries on the 28th: cash is short by N1,200,000.' }, 'Hale King', 'Chief Financial Officer');
    expect(m.title).toBe('[CHALLENGE] Hale King, Chief Financial Officer');
    expect(m.text).toBe('I advise against paying all salaries on the 28th: cash is short by N1,200,000.');
    expect(m.meta?.severity).toBe('high');
    expect(m.event).toBe('crew');
  });

  it('is calm for a report and uses the plain name when the agent has no title', () => {
    const m = formatCrewMessage({ kind: 'report', body: 'Weekly numbers are in.' }, 'Edmund Whitcombe', '');
    expect(m.title).toBe('[REPORT] Edmund Whitcombe');
    expect(m.meta?.severity).toBe('info');
  });

  it('never posts a wall of text and never an unknown label', () => {
    const m = formatCrewMessage({ kind: 'something_new', body: 'x'.repeat(5000) }, 'A', 'B');
    expect(m.text.length).toBe(1500);
    expect(m.title).toBe('[MESSAGE] A, B');
  });
});
