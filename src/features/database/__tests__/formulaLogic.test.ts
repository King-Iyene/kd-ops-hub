import { describe, expect, it } from 'vitest';
import { evaluateFormula, parseFormula, validateFormula, FORMULA_FUNCTIONS } from '../lib/formula';

const run = (expr: string, record: Record<string, any> = {}, fieldMap: Record<string, string> = {}) =>
  evaluateFormula(parseFormula(expr), record, fieldMap);

describe('logical operators && || !', () => {
  it('&& and || give true or false', () => {
    expect(run('TRUE && TRUE')).toBe(true);
    expect(run('TRUE && FALSE')).toBe(false);
    expect(run('FALSE || TRUE')).toBe(true);
    expect(run('FALSE || FALSE')).toBe(false);
  });

  it('a single & is still text joining, not "and"', () => {
    expect(run('"a" & "b"')).toBe('ab');
    expect(run('"a" && "b"')).toBe(true);
  });

  it('! means not, and does not get confused with !=', () => {
    expect(run('!TRUE')).toBe(false);
    expect(run('!(1 = 2)')).toBe(true);
    expect(run('1 != 2')).toBe(true);
    expect(run('!!TRUE')).toBe(true);
  });

  it('&& binds tighter than ||, and comparisons bind tighter than both', () => {
    expect(run('TRUE || FALSE && FALSE')).toBe(true);
    expect(run('(TRUE || FALSE) && FALSE')).toBe(false);
    expect(run('1 < 2 && 2 < 3')).toBe(true);
    expect(run('1 > 2 || 3 > 2')).toBe(true);
  });

  it('stops early: the right side is not evaluated when the answer is known', () => {
    expect(() => run('FALSE && NOSUCHFUNCTION()')).not.toThrow();
    expect(run('FALSE && NOSUCHFUNCTION()')).toBe(false);
    expect(run('TRUE || NOSUCHFUNCTION()')).toBe(true);
    expect(() => run('TRUE && NOSUCHFUNCTION()')).toThrow();
  });

  it('works on field values', () => {
    const fm = { Paid: 'paid', Amount: 'amount' };
    expect(run('{Paid} && {Amount} > 100', { paid: true, amount: 150 }, fm)).toBe(true);
    expect(run('{Paid} && {Amount} > 100', { paid: true, amount: 50 }, fm)).toBe(false);
    expect(run('!{Paid}', { paid: false }, fm)).toBe(true);
  });
});

describe('IF and SWITCH only run the branch they use', () => {
  it('IF skips the other branch', () => {
    expect(run('IF(TRUE, "ok", NOSUCHFUNCTION())')).toBe('ok');
    expect(run('IF(FALSE, NOSUCHFUNCTION(), "fine")')).toBe('fine');
    expect(run('IF(FALSE, "x")')).toBe('');
  });

  it('SWITCH skips cases after the match, and picks the default', () => {
    expect(run('SWITCH(1, 1, "one", 2, NOSUCHFUNCTION())')).toBe('one');
    expect(run('SWITCH("c", "a", 1, "b", 2, "other")')).toBe('other');
    expect(run('SWITCH("b", "a", 1, "b", 2, "other")')).toBe(2);
    expect(run('SWITCH("x", "a", 1)')).toBe('');
  });

  it('two different words do not match just because both are not numbers', () => {
    expect(run('SWITCH("abc", "xyz", "bad", "fine")')).toBe('fine');
    expect(run('SWITCH("2", 2, "two", "no")')).toBe('two');
  });
});

describe('SWITCH and blanks', () => {
  const fm = { Status: 'status', Qty: 'qty' };
  it('a blank matches a blank match value', () => {
    expect(run('SWITCH({Status}, "", "None", "Other")', { status: null }, fm)).toBe('None');
    expect(run('SWITCH({Status}, "", "None", "Other")', { status: '' }, fm)).toBe('None');
  });
  it('a blank still matches 0, as it always did, but not a word', () => {
    expect(run('SWITCH({Qty}, 0, "none", "some")', { qty: null }, fm)).toBe('none');
    expect(run('SWITCH({Status}, "abc", "word", "other")', { status: null }, fm)).toBe('other');
  });
  it('a value that is there does not match a blank', () => {
    expect(run('SWITCH({Status}, "", "None", "Other")', { status: 'Open' }, fm)).toBe('Other');
  });
});

describe('ARRAYJOIN on text that holds a list', () => {
  it('splits a comma-separated text value, as it always did', () => {
    expect(run('ARRAYJOIN({Tags}, ";")', { tags: 'a, b' }, { Tags: 'tags' })).toBe('a;b');
    expect(run('ARRAYUNIQUE({Tags})', { tags: 'a, a, b' }, { Tags: 'tags' })).toBe('a, b');
  });
});

describe('comparing text', () => {
  it('orders words and dates, not just numbers', () => {
    expect(run('"apple" < "banana"')).toBe(true);
    expect(run('"b" > "a"')).toBe(true);
    expect(run('"2026-01-02" > "2026-01-01"')).toBe(true);
    expect(run('"a" >= "a"')).toBe(true);
    expect(run('"b" <= "a"')).toBe(false);
  });

  it('number-like text is compared as numbers', () => {
    expect(run('"10" < "9"')).toBe(false);
    expect(run('"10" > 9')).toBe(true);
    expect(run('2 < 10')).toBe(true);
  });

  it('a blank counts as zero against a number, as before', () => {
    expect(run('{x} < 5', { x: null }, { x: 'x' })).toBe(true);
    expect(run('{x} > -1', { x: null }, { x: 'x' })).toBe(true);
    expect(run('{x} < {y}', { x: null, y: null }, { x: 'x', y: 'y' })).toBe(false);
  });
});

describe('errors', () => {
  it('ISERROR sees a thrown error, a bad number and ERROR()', () => {
    expect(run('ISERROR(NOSUCHFUNCTION())')).toBe(true);
    expect(run('ISERROR(ERROR("bad"))')).toBe(true);
    expect(run('ISERROR(SQRT(-1))')).toBe(true);
    expect(run('ISERROR(1)')).toBe(false);
    expect(run('ISERROR("fine")')).toBe(false);
  });

  it('ERROR gives the error text, with a message if there is one', () => {
    expect(run('ERROR()')).toBe('#ERROR!');
    expect(run('ERROR("no price")')).toBe('#ERROR! no price');
  });

  it('IF(ISERROR(...)) can recover', () => {
    expect(run('IF(ISERROR(NOSUCHFUNCTION()), "fallback", "ok")')).toBe('fallback');
  });
});

describe('about the record', () => {
  const rec = { id: 'r-1', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-02-02T00:00:00Z' };
  it('RECORD_ID, CREATED_TIME and LAST_MODIFIED_TIME read the row', () => {
    expect(run('RECORD_ID()', rec)).toBe('r-1');
    expect(run('CREATED_TIME()', rec)).toBe('2026-01-01T00:00:00Z');
    expect(run('LAST_MODIFIED_TIME()', rec)).toBe('2026-02-02T00:00:00Z');
  });
  it('are empty when the row has none', () => {
    expect(run('RECORD_ID()', {})).toBe('');
    expect(run('CREATED_TIME()', {})).toBeNull();
  });
});

describe('more numbers and text', () => {
  it('CEILING rounds up, to a multiple if asked', () => {
    expect(run('CEILING(2.1)')).toBe(3);
    expect(run('CEILING(7, 5)')).toBe(10);
    expect(run('CEILING(-2.1)')).toBe(-2);
    expect(run('CEILING(5, 5)')).toBe(5);
  });

  it('EVEN and ODD give the next whole number of that kind', () => {
    expect(run('EVEN(1.5)')).toBe(2);
    expect(run('EVEN(2)')).toBe(2);
    expect(run('EVEN(3)')).toBe(4);
    expect(run('EVEN(-1.5)')).toBe(0);
    expect(run('ODD(1.5)')).toBe(3);
    expect(run('ODD(3)')).toBe(3);
    expect(run('ODD(2)')).toBe(3);
    expect(run('ODD(0)')).toBe(1);
  });

  it('REPT repeats text', () => {
    expect(run('REPT("ab", 3)')).toBe('ababab');
    expect(run('REPT("ab", 0)')).toBe('');
  });

  it('COUNT counts numbers, COUNTA counts anything filled, COUNTALL counts every value', () => {
    expect(run('COUNT("a", 1, "", 2, "3")')).toBe(3);
    expect(run('COUNTA("a", 1, "", 2)')).toBe(3);
    expect(run('COUNTALL("a", 1, "", 2)')).toBe(4);
  });
});

describe('list functions', () => {
  const fm = { Tags: 'tags' };
  const rec = { tags: ['b', 'a', 'b', ''] };

  it('ARRAYJOIN joins a list with the separator, or ", "', () => {
    expect(run('ARRAYJOIN({Tags}, " | ")', rec, fm)).toBe('b | a | b | ');
    expect(run('ARRAYJOIN({Tags})', { tags: ['x', 'y'] }, fm)).toBe('x, y');
    expect(run('ARRAYJOIN("a, b", "-")')).toBe('a-b');
  });

  it('ARRAYUNIQUE and ARRAYCOMPACT', () => {
    expect(run('ARRAYUNIQUE({Tags})', rec, fm)).toBe('b, a, ');
    expect(run('ARRAYCOMPACT({Tags})', rec, fm)).toBe('b, a, b');
  });

  it('list functions can be nested', () => {
    expect(run('ARRAYJOIN(ARRAYUNIQUE(ARRAYCOMPACT({Tags})), "-")', rec, fm)).toBe('b-a');
  });

  it('ARRAYSLICE takes a part, zero-based with the end left out', () => {
    expect(run('ARRAYSLICE({Tags}, 1, 3)', rec, fm)).toBe('a, b');
    expect(run('ARRAYSLICE({Tags}, 2)', rec, fm)).toBe('b, ');
    expect(run('ARRAYSLICE({Tags}, -2)', rec, fm)).toBe('b, ');
  });

  it('ARRAYFLATTEN keeps the items', () => {
    expect(run('ARRAYFLATTEN({Tags})', { tags: ['x', 'y'] }, fm)).toBe('x, y');
  });

  it('link ids are shown as the names they stand for', () => {
    const linked = { tags: ['id1', 'id2', 'id1'], __linkLookup: { id1: 'Alpha', id2: 'Beta' } };
    expect(run('ARRAYUNIQUE({Tags})', linked, fm)).toBe('Alpha, Beta');
  });

  it('a field that is not a list still works as a list of one', () => {
    expect(run('ARRAYJOIN({Tags}, "-")', { tags: 'solo' }, fm)).toBe('solo');
    expect(run('ARRAYUNIQUE({Tags})', { tags: null }, fm)).toBe('');
  });
});

describe('validateFormula', () => {
  it('a function the engine does not have is invalid, wherever it is in the formula', () => {
    expect(validateFormula('NOSUCHFUNCTION(1)')).toEqual({ valid: false, error: 'Unknown function: NOSUCHFUNCTION' });
    expect(validateFormula('IF(TRUE, 1, NOSUCHFUNCTION())').valid).toBe(false);
    expect(validateFormula('1 + NOSUCHFUNCTION()').valid).toBe(false);
    expect(validateFormula('-NOSUCHFUNCTION()').valid).toBe(false);
  });

  it('known functions in any letter case stay valid, and so does a plain formula', () => {
    expect(validateFormula('round({A}, 2)').valid).toBe(true);
    expect(validateFormula('IF({A} > 1 && !{B}, "x", "y")').valid).toBe(true);
    expect(validateFormula('').valid).toBe(false);
  });
});

describe('the function list', () => {
  it('includes the new functions, so the editor suggests them', () => {
    for (const name of [
      'CEILING', 'EVEN', 'ODD', 'REPT', 'COUNT', 'COUNTALL', 'ERROR', 'RECORD_ID', 'CREATED_TIME',
      'LAST_MODIFIED_TIME', 'ARRAYUNIQUE', 'ARRAYCOMPACT', 'ARRAYFLATTEN', 'ARRAYSLICE',
    ]) {
      expect(FORMULA_FUNCTIONS).toContain(name);
    }
  });
});
