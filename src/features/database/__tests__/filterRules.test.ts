import { describe, expect, it } from 'vitest';
import { applyFilter, buildOrClauseFromFilters } from '../hooks/useRecords';
import { completeFilters, describeNarrowing, isIncompleteFilter, isTextColumn, pgQuote } from '../lib/filterRules';

/** A query that records the calls made on it, so a test can see exactly what would be sent. */
function recorder() {
  const calls: Array<[string, ...unknown[]]> = [];
  const q: any = new Proxy({}, {
    get(_t, method: string) {
      return (...args: unknown[]) => {
        calls.push([method, ...args]);
        return q;
      };
    },
  });
  return { q, calls };
}

const filter = (operator: string, value: unknown, field_id = 'f1') => ({ id: 'x', field_id, operator, value, conjunction: 'and' }) as never;

describe('unfinished filters', () => {
  it('a filter with no value is unfinished; one that needs none is not', () => {
    expect(isIncompleteFilter('is', '')).toBe(true);
    expect(isIncompleteFilter('is', '   ')).toBe(true);
    expect(isIncompleteFilter('contains', undefined)).toBe(true);
    expect(isIncompleteFilter('gt', null)).toBe(true);
    expect(isIncompleteFilter('isAnyOf', [])).toBe(true);
    expect(isIncompleteFilter('isAnyOf', [''])).toBe(true);
    expect(isIncompleteFilter('isEmpty', '')).toBe(false);
    expect(isIncompleteFilter('isNotEmpty', undefined)).toBe(false);
    expect(isIncompleteFilter('isChecked', '')).toBe(false);
    expect(isIncompleteFilter('isWithinPastWeek', '')).toBe(false);
  });

  it('zero and false are real values, not blanks', () => {
    expect(isIncompleteFilter('is', 0)).toBe(false);
    expect(isIncompleteFilter('is', false)).toBe(false);
    expect(isIncompleteFilter('gt', '0')).toBe(false);
  });

  it('"between" needs both ends', () => {
    expect(isIncompleteFilter('isBetween', ['1', '5'])).toBe(false);
    expect(isIncompleteFilter('isBetween', '1,5')).toBe(false);
    expect(isIncompleteFilter('isBetween', ['1', ''])).toBe(true);
    expect(isIncompleteFilter('isBetween', '1')).toBe(true);
    expect(isIncompleteFilter('isBetween', undefined)).toBe(true);
  });

  it('keeps only the finished filters', () => {
    const list = [filter('is', 'x'), filter('is', ''), filter('isEmpty', '')];
    expect(completeFilters(list)).toHaveLength(2);
    expect(completeFilters(undefined)).toEqual([]);
  });
});

describe('describeNarrowing (why nothing shows)', () => {
  it('nothing narrows the rows when there are no finished filters and no search', () => {
    expect(describeNarrowing({ filters: [filter('is', '')], search: '  ' }).active).toBe(false);
    expect(describeNarrowing({}).text).toBe('');
  });

  it('says what is hiding the rows', () => {
    expect(describeNarrowing({ filters: [filter('is', 'x')] })).toMatchObject({ active: true, conditions: 1, text: '1 filter is hiding every row.' });
    expect(describeNarrowing({ filters: [filter('is', 'x'), filter('gt', '3')] }).text).toBe('2 filters are hiding every row.');
    expect(describeNarrowing({ search: 'zzz' }).text).toBe('the search "zzz" is hiding every row.');
    expect(describeNarrowing({ filters: [filter('is', 'x')], search: 'zzz' }).text).toBe('1 filter and the search "zzz" are hiding every row.');
  });

  it('counts filters inside groups', () => {
    const group = { id: 'g', conjunction: 'or', filters: [filter('is', 'a'), filter('is', '')], groups: [] } as never;
    expect(describeNarrowing({ groups: [group] }).conditions).toBe(1);
  });
});

describe('quoting', () => {
  it('puts a value in quotes and escapes quotes and backslashes', () => {
    expect(pgQuote('plain')).toBe('"plain"');
    expect(pgQuote('a,b')).toBe('"a,b"');
    expect(pgQuote('say "hi"')).toBe('"say \\"hi\\""');
    expect(pgQuote('back\\slash')).toBe('"back\\\\slash"');
    expect(pgQuote(5)).toBe('"5"');
  });

  it('knows text columns from the rest', () => {
    expect(isTextColumn('TEXT')).toBe(true);
    expect(isTextColumn('VARCHAR(255)')).toBe(true);
    expect(isTextColumn('NUMERIC')).toBe(false);
    expect(isTextColumn('DATE')).toBe(false);
    expect(isTextColumn('TEXT[]')).toBe(false);
    expect(isTextColumn(undefined)).toBe(false);
  });
});

describe('what each operator sends', () => {
  it('"is not" also keeps rows where the cell is empty', () => {
    const { q, calls } = recorder();
    applyFilter(q, 'status', 'isNot', 'Done', 'TEXT');
    expect(calls).toEqual([['or', 'status.is.null,status.neq."Done"']]);
  });

  it('"does not contain" also keeps empty rows', () => {
    const { q, calls } = recorder();
    applyFilter(q, 'name', 'doesNotContain', 'ab', 'TEXT');
    expect(calls).toEqual([['or', 'name.is.null,name.not.ilike."%ab%"']]);
  });

  it('"is none of" also keeps empty rows, and quotes each value', () => {
    const { q, calls } = recorder();
    applyFilter(q, 'tag', 'isNoneOf', ['a,b', 'c'], 'TEXT');
    expect(calls).toEqual([['or', 'tag.is.null,tag.not.in.("a,b","c")']]);
  });

  it('"is empty" on a number or date column asks only for null (an empty string is an error there)', () => {
    for (const type of ['NUMERIC', 'DATE', 'TIMESTAMPTZ', 'BOOLEAN']) {
      const { q, calls } = recorder();
      applyFilter(q, 'age', 'isEmpty', '', type);
      expect(calls).toEqual([['is', 'age', null]]);
    }
  });

  it('"is empty" on text asks for null or an empty string', () => {
    const { q, calls } = recorder();
    applyFilter(q, 'name', 'isEmpty', '', 'TEXT');
    expect(calls).toEqual([['or', 'name.is.null,name.eq.']]);
  });

  it('"is not empty" on a number column does not compare it with an empty string', () => {
    const { q, calls } = recorder();
    applyFilter(q, 'age', 'isNotEmpty', '', 'NUMERIC');
    expect(calls).toEqual([['not', 'age', 'is', null]]);
    const t = recorder();
    applyFilter(t.q, 'name', 'isNotEmpty', '', 'TEXT');
    expect(t.calls).toEqual([['not', 'name', 'is', null], ['neq', 'name', '']]);
  });

  it('plain operators are unchanged', () => {
    const { q, calls } = recorder();
    applyFilter(q, 'age', 'gt', 30, 'NUMERIC');
    applyFilter(q, 'name', 'contains', 'li', 'TEXT');
    expect(calls).toEqual([['gt', 'age', 30], ['ilike', 'name', '%li%']]);
  });
});

describe('OR groups', () => {
  const fieldMap = new Map<string, any>([
    ['f1', { pg_column_name: 'name', pg_type: 'TEXT' }],
    ['f2', { pg_column_name: 'age', pg_type: 'NUMERIC' }],
  ]);

  it('quotes values, so a comma or bracket cannot split the clause', () => {
    const clause = buildOrClauseFromFilters([filter('is', 'a,b'), filter('contains', '(x)', 'f1')], fieldMap)!;
    expect(clause).toBe('name.eq."a,b",name.ilike."%(x)%"');
  });

  it('leaves out unfinished filters', () => {
    expect(buildOrClauseFromFilters([filter('is', ''), filter('contains', 'x')], fieldMap)).toBe('name.ilike."%x%"');
    expect(buildOrClauseFromFilters([filter('is', '')], fieldMap)).toBeNull();
  });

  it('"is empty" asks for an empty string only on text columns', () => {
    expect(buildOrClauseFromFilters([filter('isEmpty', '', 'f1')], fieldMap)).toBe('name.is.null,name.eq.""');
    expect(buildOrClauseFromFilters([filter('isEmpty', '', 'f2')], fieldMap)).toBe('age.is.null');
  });

  it('"is not" keeps empty rows here too', () => {
    expect(buildOrClauseFromFilters([filter('isNot', 'x')], fieldMap)).toBe('name.is.null,name.neq."x"');
  });
});
