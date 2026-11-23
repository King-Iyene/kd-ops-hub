import { describe, expect, it } from 'vitest';
import { fuzzyFilter, fuzzyMatch, highlightRuns } from '../lib/fuzzy';

describe('fuzzyMatch', () => {
  it('matches everything for an empty query', () => {
    expect(fuzzyMatch('', 'Invoices')).toEqual({ score: 0, indices: [] });
    expect(fuzzyMatch('   ', 'Invoices')).toEqual({ score: 0, indices: [] });
  });

  it('ranks exact, prefix, word start, substring and subsequence in that order', () => {
    const exact = fuzzyMatch('payroll', 'Payroll')!;
    const prefix = fuzzyMatch('pay', 'Payroll')!;
    const wordStart = fuzzyMatch('roll', 'Staff Payroll roll')!; // word start of the last word
    const substring = fuzzyMatch('roll', 'Payroll')!;
    const subsequence = fuzzyMatch('pyl', 'Payroll')!;
    expect(exact.score).toBeGreaterThan(prefix.score);
    expect(prefix.score).toBeGreaterThan(wordStart.score);
    expect(wordStart.score).toBeGreaterThan(substring.score);
    expect(substring.score).toBeGreaterThan(subsequence.score);
  });

  it('is case insensitive', () => {
    expect(fuzzyMatch('KDS', 'kds finances')).not.toBeNull();
    expect(fuzzyMatch('fin', 'KDS FINANCES')).not.toBeNull();
  });

  it('finds the start of a later word', () => {
    const m = fuzzyMatch('fin', 'KDS Finances')!;
    expect(m.indices).toEqual([4, 5, 6]);
  });

  it('matches a subsequence', () => {
    const m = fuzzyMatch('kdsf', 'KDS Finances')!;
    expect(m).not.toBeNull();
    expect(m.indices).toEqual([0, 1, 2, 4]);
  });

  it('returns null when the characters are not all there in order', () => {
    expect(fuzzyMatch('xyz', 'Invoices')).toBeNull();
    expect(fuzzyMatch('sinv', 'Invoices')).toBeNull();
  });

  it('needs every word of a multi word query to match', () => {
    expect(fuzzyMatch('kds fin', 'KDS Finances')).not.toBeNull();
    expect(fuzzyMatch('fin kds', 'KDS Finances')).not.toBeNull();
    expect(fuzzyMatch('kds zzz', 'KDS Finances')).toBeNull();
  });

  it('prefers a shorter name for the same prefix', () => {
    const short = fuzzyMatch('inv', 'Invoices')!;
    const long = fuzzyMatch('inv', 'Invoices archive 2023')!;
    expect(short.score).toBeGreaterThan(long.score);
  });
});

describe('fuzzyFilter', () => {
  const names = ['Expenses', 'Income', 'Expense categories', 'Budget'];

  it('keeps the original order for an empty query', () => {
    expect(fuzzyFilter(names, '', (n) => n).map((r) => r.item)).toEqual(names);
  });

  it('drops non matches and sorts best first', () => {
    const out = fuzzyFilter(names, 'exp', (n) => n).map((r) => r.item);
    expect(out).toEqual(['Expenses', 'Expense categories']);
  });

  it('keeps the original order between equal scores', () => {
    const items = ['Alpha one', 'Alpha two', 'Alpha six'];
    // all three are word-start matches of "alpha" with the same score
    const out = fuzzyFilter(items, 'alpha', (n) => n).map((r) => r.item);
    expect(out.length).toBe(3);
    expect(out.slice().sort()).toEqual(items.slice().sort());
    const exactTie = fuzzyFilter(['b-x', 'a-x'], 'x', (n) => n).map((r) => r.item);
    expect(exactTie).toEqual(['b-x', 'a-x']);
  });

  it('works with objects through the text getter', () => {
    const tables = [{ id: '1', name: 'Clients' }, { id: '2', name: 'Contracts' }];
    expect(fuzzyFilter(tables, 'con', (t) => t.name).map((r) => r.item.id)).toEqual(['2']);
  });
});

describe('highlightRuns', () => {
  it('returns the whole text when nothing matched', () => {
    expect(highlightRuns('Invoices', [])).toEqual([{ text: 'Invoices', match: false }]);
  });

  it('merges neighbouring matched characters into runs', () => {
    expect(highlightRuns('KDS Finances', [0, 1, 2, 4])).toEqual([
      { text: 'KDS', match: true },
      { text: ' ', match: false },
      { text: 'F', match: true },
      { text: 'inances', match: false },
    ]);
  });
});
