import { describe, expect, it } from 'vitest';
import { parseDueFromName } from '../taskDates';

// Thursday 19 November 2026, mid-morning.
const REF = new Date(2026, 10, 19, 10, 0, 0);

describe('due date written into a task name', () => {
  it.each([
    ['Draft the weekly report tomorrow 3pm', 'Draft the weekly report', '2026-11-20'],
    ['Call Ade next Friday', 'Call Ade', '2026-11-27'],
    ['Pay vendors on 15 Dec', 'Pay vendors', '2026-12-15'],
    ['Review contract in 3 days', 'Review contract', '2026-11-22'],
    ['Submit report due friday', 'Submit report', '2026-11-20'],
  ])('%s', (name, title, due) => {
    expect(parseDueFromName(name, REF)).toEqual({ title, due });
  });

  it('leaves a name without a date alone', () => {
    expect(parseDueFromName('Plain task', REF)).toEqual({ title: 'Plain task', due: null });
  });

  it('keeps a name that is only a date as the title', () => {
    expect(parseDueFromName('Friday', REF)).toEqual({ title: 'Friday', due: null });
  });
});
