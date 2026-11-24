import { describe, expect, it } from 'vitest';
import {
  activeArgument,
  canReferenceField,
  completionAt,
  diagnoseFormula,
  fieldsReferenced,
  hasBlockingError,
  highlightedArgument,
  renameFieldInFormula,
  scanFormula,
  signatureParts,
} from '../lib/formulaEditorSupport';
import { FORMULA_FUNCTIONS } from '../lib/formula';
import { FUNCTION_DOCS, functionDoc, searchFunctionDocs } from '../lib/formulaDocs';

const kinds = (text: string) => scanFormula(text).filter((t) => t.kind !== 'space').map((t) => `${t.kind}:${t.text}`);

describe('function documentation', () => {
  it('describes every function the engine has, and nothing it does not', () => {
    const documented = new Set(FUNCTION_DOCS.map((d) => d.name));
    const missing = FORMULA_FUNCTIONS.filter((f) => !documented.has(f));
    const extra = [...documented].filter((f) => !FORMULA_FUNCTIONS.includes(f));
    expect(missing).toEqual([]);
    expect(extra).toEqual([]);
  });

  it('each entry is complete and its signature starts with its own name', () => {
    for (const d of FUNCTION_DOCS) {
      expect(d.description.length, d.name).toBeGreaterThan(5);
      expect(d.example.length, d.name).toBeGreaterThan(0);
      expect(d.signature.startsWith(`${d.name}(`), d.name).toBe(true);
    }
  });

  it('has no repeated names', () => {
    expect(new Set(FUNCTION_DOCS.map((d) => d.name)).size).toBe(FUNCTION_DOCS.length);
  });

  it('looks a function up in any letter case', () => {
    expect(functionDoc('round')?.name).toBe('ROUND');
    expect(functionDoc('nope')).toBeUndefined();
  });

  it('searches by name, description and signature, grouped by category', () => {
    const groups = searchFunctionDocs('round');
    expect(groups.map((g) => g.category)).toEqual(['Number']);
    expect(groups[0].items.map((d) => d.name)).toContain('ROUNDUP');
    expect(searchFunctionDocs('').length).toBeGreaterThanOrEqual(5);
    expect(searchFunctionDocs('zzzzqq')).toEqual([]);
  });
});

describe('scanFormula', () => {
  it('splits a formula into pieces with exact positions', () => {
    const text = 'IF({Paid}, "yes", 2.5)';
    const tokens = scanFormula(text);
    const field = tokens.find((t) => t.kind === 'field')!;
    expect(text.slice(field.from, field.to)).toBe('{Paid}');
    expect(tokens.map((t) => t.text).join('')).toBe(text); // nothing lost, nothing added
  });

  it('knows functions from bare words', () => {
    expect(kinds('IF(TRUE, 1)')).toEqual(['function:IF', 'paren:(', 'name:TRUE', 'comma:,', 'number:1', 'paren:)']);
  });

  it('a field name may have spaces and symbols; a quote or brace inside a string is just text', () => {
    expect(kinds('{Total Cost (NGN)}')).toEqual(['field:{Total Cost (NGN)}']);
    expect(kinds('"a {b} c"')).toEqual(['string:"a {b} c"']);
    expect(kinds("'it\\'s'")).toEqual(["string:'it\\'s'"]);
  });

  it('marks an unfinished field or string instead of failing', () => {
    const [field] = scanFormula('{Amo');
    expect(field).toMatchObject({ kind: 'field', closed: false });
    const [str] = scanFormula('"abc');
    expect(str).toMatchObject({ kind: 'string', closed: false });
  });

  it('reads two-character operators as one', () => {
    expect(kinds('a && b || !c != d <= e')).toEqual([
      'name:a', 'operator:&&', 'name:b', 'operator:||', 'operator:!', 'name:c', 'operator:!=', 'name:d', 'operator:<=', 'name:e',
    ]);
  });

  it('never throws, and always covers the whole text', () => {
    for (const text of ['', '   ', '@#$', '{{', '"', '((((', '1..2', 'é{ü}']) {
      const tokens = scanFormula(text);
      expect(tokens.map((t) => t.text).join('')).toBe(text);
    }
  });
});

describe('fieldsReferenced', () => {
  it('lists each field once in order, ignoring text inside quotes and unfinished references', () => {
    expect(fieldsReferenced('{B} + {A} + {B} & "{C}" & {D')).toEqual(['B', 'A']);
  });
});

describe('activeArgument', () => {
  it('finds the call and the argument', () => {
    const text = 'ROUND({Price}, 2)';
    expect(activeArgument(text, text.indexOf('{Price}') + 3)).toEqual({ name: 'ROUND', argIndex: 0 });
    expect(activeArgument(text, text.indexOf('2'))).toEqual({ name: 'ROUND', argIndex: 1 });
  });

  it('counts only commas at the right depth', () => {
    const text = 'IF(AND(a, b), "x, y", {A, B}, |)'.replace('|', '');
    // inside AND, second argument
    expect(activeArgument(text, text.indexOf('b'))).toEqual({ name: 'AND', argIndex: 1 });
    // after the commas inside a string and a field name, the IF is on its third argument (index 3 after "{A, B},")
    expect(activeArgument(text, text.length - 1)).toEqual({ name: 'IF', argIndex: 3 });
  });

  it('uses the nearest function when inside plain parentheses', () => {
    const text = 'ROUND((1 + ';
    expect(activeArgument(text, text.length)).toEqual({ name: 'ROUND', argIndex: 0 });
  });

  it('is null outside any call, and after the call is closed', () => {
    expect(activeArgument('1 + 2', 3)).toBeNull();
    const text = 'ABS(-1) + ';
    expect(activeArgument(text, text.length)).toBeNull();
  });

  it('works while the formula is unfinished', () => {
    expect(activeArgument('IF({A} > 1, ', 12)).toEqual({ name: 'IF', argIndex: 1 });
  });
});

describe('signatureParts and highlightedArgument', () => {
  it('splits a signature into its argument labels, keeping optional repeats together', () => {
    expect(signatureParts('ROUND(number, [places])')).toEqual({ name: 'ROUND', args: ['number', '[places]'] });
    expect(signatureParts('CONCATENATE(text1, [text2, ...])').args).toEqual(['text1', '[text2, ...]']);
    expect(signatureParts('NOW()').args).toEqual([]);
  });

  it('highlights the argument being typed, and keeps a repeating one highlighted', () => {
    const args = signatureParts('CONCATENATE(text1, [text2, ...])').args;
    expect(highlightedArgument(args, 0)).toBe(0);
    expect(highlightedArgument(args, 1)).toBe(1);
    expect(highlightedArgument(args, 5)).toBe(1);
    expect(highlightedArgument(signatureParts('ROUND(number, [places])').args, 5)).toBe(-1);
    expect(highlightedArgument([], 0)).toBe(-1);
  });
});

describe('completionAt', () => {
  const fields = [
    { name: 'Amount', type: 'Currency' },
    { name: 'Amount Paid', type: 'Currency' },
    { name: 'Client', type: 'Text' },
    { name: 'Total Amount', type: 'Currency' },
  ];

  it('after { it lists the fields, best matches first, and fills in the closing brace', () => {
    const text = '{Am';
    const res = completionAt(text, text.length, fields)!;
    expect(res.options.map((o) => o.label)).toEqual(['Amount', 'Amount Paid', 'Total Amount']);
    expect(res.options[0].insert).toBe('Amount}');
    expect(res.options[0].detail).toBe('Currency');
    expect(text.slice(res.from, res.to)).toBe('Am');
  });

  it('a bare { lists every field', () => {
    expect(completionAt('{', 1, fields)!.options).toHaveLength(4);
  });

  it('does not double the closing brace when one is already there', () => {
    const text = '{Am}';
    const res = completionAt(text, 3, fields)!;
    expect(text.slice(res.from, res.to)).toBe('Am}');
    expect(res.options[0].insert).toBe('Amount}');
  });

  it('while typing a word it offers functions, starting with the typed letters', () => {
    const res = completionAt('RO', 2, fields)!;
    expect(res.options[0].label).toBe('ROUND');
    expect(res.options.map((o) => o.label)).toContain('ROUNDUP');
    expect(res.options[0].insert).toBe('ROUND(');
    expect(res.options[0].detail).toBe('ROUND(number, [places])');
    expect(res.options[0].info).toContain('Example');
  });

  it('matches functions in any letter case', () => {
    expect(completionAt('conc', 4, fields)!.options[0].label).toBe('CONCAT');
  });

  it('offers nothing inside quotes, after a finished word, or on empty text', () => {
    expect(completionAt('"RO', 3, fields)).toBeNull();
    expect(completionAt('ROUND ', 6, fields)).toBeNull();
    expect(completionAt('', 0, fields)).toBeNull();
    expect(completionAt('1 + ', 4, fields)).toBeNull();
  });

  it('offers nothing for a word that matches no function', () => {
    expect(completionAt('zzzq', 4, fields)).toBeNull();
  });

  it('when asked outright with nothing typed, offers fields and functions', () => {
    const res = completionAt('1 + ', 4, fields, true)!;
    expect(res.options.some((o) => o.kind === 'field')).toBe(true);
    expect(res.options.some((o) => o.kind === 'function')).toBe(true);
    expect(res.options.find((o) => o.kind === 'field')!.insert).toBe('{Amount}');
  });

  it('inside a field name that already has its closing brace, accepting replaces the whole name', () => {
    const text = '{Total Amount} + 1';
    const pos = text.indexOf('Total') + 2; // {To|tal Amount}
    const res = completionAt(text, pos, fields)!;
    const option = res.options.find((o) => o.label === 'Total Amount')!;
    const result = text.slice(0, res.from) + option.insert + text.slice(res.to);
    expect(result).toBe('{Total Amount} + 1');
  });

  it('does not swallow a later field when the first one is unfinished', () => {
    const text = '{Am + {Client}';
    const res = completionAt(text, 3, fields)!;
    expect(text.slice(res.from, res.to)).toBe('Am');
  });

  it('works in the middle of a formula', () => {
    const text = 'IF({Paid}, {Am, 0)';
    const res = completionAt(text, text.indexOf('{Am') + 3, fields)!;
    expect(res.options[0].label).toBe('Amount');
    expect(text.slice(res.from, res.to)).toBe('Am');
  });
});

describe('diagnoseFormula', () => {
  const fields = [{ name: 'Amount' }, { name: 'Paid' }];
  const messages = (text: string) => diagnoseFormula(text, fields).map((d) => d.message);

  it('a good formula has no problems', () => {
    expect(diagnoseFormula('IF({Paid}, {Amount} * 2, 0)', fields)).toEqual([]);
    expect(diagnoseFormula('=SUM({Amount}, 1)', fields)).toEqual([]);
  });

  it('an empty formula is not an error here', () => {
    expect(diagnoseFormula('  ', fields)).toEqual([]);
  });

  it('a missing closing parenthesis points at the end', () => {
    const text = 'IF({Paid}, 1, 2';
    const [d] = diagnoseFormula(text, fields);
    expect(d.message).toBe('A closing parenthesis ) is missing.');
    expect(d.severity).toBe('error');
    expect(d.blocking).toBe(true);
    expect(d.to).toBeLessThanOrEqual(text.length);
    expect(d.from).toBeGreaterThanOrEqual(0);
  });

  it('an unclosed field or quote says so, over the whole unfinished piece', () => {
    const t1 = '{Amount + 1';
    const [d1] = diagnoseFormula(t1, fields);
    expect(d1.message).toBe('This { has no closing }.');
    expect(d1.from).toBe(0);
    expect(d1.to).toBe(t1.length);
    const [d2] = diagnoseFormula('"abc', fields);
    expect(d2.message).toBe('This quote is never closed.');
  });

  it('a bare word where a field was meant says how to fix it, on the word', () => {
    const text = 'Amount + 1';
    const [d] = diagnoseFormula(text, fields);
    expect(d.message).toBe('"Amount" is not a function. To use a field, write it in braces: {Amount}.');
    expect(text.slice(d.from, d.to)).toBe('Amount');
  });

  it('an unknown function is an error on its name', () => {
    const text = 'FROBNICATE({Amount})';
    const d = diagnoseFormula(text, fields).find((x) => x.message.includes('FROBNICATE'))!;
    expect(d.blocking).toBe(true);
    expect(text.slice(d.from, d.to)).toBe('FROBNICATE');
  });

  it('an unknown field is only advice, and can be skipped by not passing the fields', () => {
    const text = '{Amout} + 1';
    const [d] = diagnoseFormula(text, fields);
    expect(d.severity).toBe('warning');
    expect(d.blocking).toBe(false);
    expect(d.message).toBe('There is no field called "Amout".');
    expect(text.slice(d.from, d.to)).toBe('{Amout}');
    expect(diagnoseFormula(text)).toEqual([]);
  });

  it('positions are right when the formula starts with spaces and an equals sign', () => {
    const text = '  = FROBNICATE(1)';
    const d = diagnoseFormula(text, fields).find((x) => x.message.includes('FROBNICATE'))!;
    expect(text.slice(d.from, d.to)).toBe('FROBNICATE');
  });

  it('a character that cannot be used is named', () => {
    expect(messages('1 # 2')).toContain('"#" cannot be used in a formula.');
  });

  it('never reports the same place twice', () => {
    const list = diagnoseFormula('FROBNICATE(', fields);
    const places = list.map((d) => `${d.from}:${d.to}`);
    expect(new Set(places).size).toBe(places.length);
  });

  it('hasBlockingError separates errors from advice', () => {
    expect(hasBlockingError(diagnoseFormula('{Amout} + 1', fields))).toBe(false);
    expect(hasBlockingError(diagnoseFormula('SUM(', fields))).toBe(true);
    expect(hasBlockingError([])).toBe(false);
  });
});

describe('renameFieldInFormula', () => {
  it('renames every reference', () => {
    expect(renameFieldInFormula('{Price} * {Qty} + {Price}', 'Price', 'Unit Price')).toBe('{Unit Price} * {Qty} + {Unit Price}');
  });

  it('leaves a field whose name only contains the old one', () => {
    expect(renameFieldInFormula('{Price} + {Price Total} + {Old Price}', 'Price', 'Cost')).toBe('{Cost} + {Price Total} + {Old Price}');
  });

  it('leaves the same words inside quotes alone', () => {
    expect(renameFieldInFormula('"{Price}" & {Price} & \'{Price}\'', 'Price', 'Cost')).toBe('"{Price}" & {Cost} & \'{Price}\'');
  });

  it('names match exactly, as they do when the formula is worked out', () => {
    expect(renameFieldInFormula('{price} + {Price}', 'Price', 'Cost')).toBe('{price} + {Cost}');
  });

  it('keeps everything else about the text, including an unfinished reference', () => {
    expect(renameFieldInFormula('  IF( {A},\n  {B} , 0 ) & {A', 'A', 'Z')).toBe('  IF( {Z},\n  {B} , 0 ) & {A');
  });

  it('does nothing when the name is unchanged or cannot be written in a formula', () => {
    expect(renameFieldInFormula('{A}', 'A', 'A')).toBe('{A}');
    expect(renameFieldInFormula('{A}', 'A', 'B}C')).toBe('{A}');
    expect(canReferenceField('Total (NGN)')).toBe(true);
    expect(canReferenceField('a}b')).toBe(false);
    expect(canReferenceField('')).toBe(false);
  });

  it('a renamed formula still parses and gives the same result', () => {
    const before = 'IF({Paid}, {Amount}, 0)';
    const after = renameFieldInFormula(before, 'Amount', 'Total Amount');
    expect(after).toBe('IF({Paid}, {Total Amount}, 0)');
    expect(diagnoseFormula(after)).toEqual([]);
  });
});
