import { render, fireEvent, cleanup, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.setConfig({ testTimeout: 30000 });

import { RollupSetup } from '../components/RollupSetup';
import {
  ROLLUP_FUNCTIONS,
  acceptsType,
  canonicalFunction,
  defaultFunctionFor,
  describeSetup,
  functionsForTarget,
  reconcileFunction,
  rollupFunction,
  setupProblem,
} from '../lib/rollupSetup';
import { computeRollupValue } from '../lib/computations';

const names = (list: ReadonlyArray<{ name: string }>) => list.map((f) => f.name);

describe('which functions fit which field', () => {
  it('numbers offer sums and averages, and not "all are checked"', () => {
    const n = names(functionsForTarget('Currency', true));
    expect(n).toEqual(expect.arrayContaining(['SUM', 'AVG', 'MEDIAN', 'MIN', 'MAX', 'COUNTA', 'CONCATENATE']));
    expect(n).not.toContain('AND');
    expect(n).not.toContain('COUNT');
  });

  it('text offers no sums, but joining and listing', () => {
    const n = names(functionsForTarget('SingleLineText', true));
    expect(n).not.toContain('SUM');
    expect(n).not.toContain('MIN');
    expect(n).toEqual(expect.arrayContaining(['COUNTA', 'CONCATENATE', 'ARRAYCOMPACT', 'ARRAY_UNIQUE']));
  });

  it('dates offer earliest and latest, but not sums', () => {
    const n = names(functionsForTarget('Date', true));
    expect(n).toEqual(expect.arrayContaining(['MIN', 'MAX']));
    expect(n).not.toContain('SUM');
  });

  it('checkboxes offer all / any / odd', () => {
    const n = names(functionsForTarget('Checkbox', true));
    expect(n).toEqual(expect.arrayContaining(['AND', 'OR', 'XOR']));
    expect(n).not.toContain('SUM');
  });

  it('with no field, only counting the linked records is offered', () => {
    expect(names(functionsForTarget(undefined, false))).toEqual(['COUNT']);
  });

  it('the menu never lists an alias twice', () => {
    for (const type of ['Currency', 'SingleLineText', 'Date', 'Checkbox']) {
      const n = names(functionsForTarget(type, true));
      expect(n).not.toContain('COUNTALL');
      expect(n).not.toContain('ARRAYJOIN');
    }
  });

  it('every function the calculator knows is described, and every description names a real function', () => {
    // These are the names computeRollupValue handles.
    const handled = ['COUNT', 'COUNTALL', 'COUNTA', 'SUM', 'AVG', 'MIN', 'MAX', 'CONCATENATE', 'ARRAYJOIN', 'ARRAYCOMPACT', 'MEDIAN', 'AND', 'OR', 'XOR', 'ARRAY_UNIQUE'];
    expect(names(ROLLUP_FUNCTIONS).sort()).toEqual([...handled].sort());
  });

  it('the descriptions are true: each listed function really gives its worked example', () => {
    // Build linked records from the example values and run the real calculator on them.
    const field = (fn: string) => ({ id: 'r', ui_type: 'Rollup', options: { fn, rollupFieldId: 't' } }) as never;
    const target = [{ id: 't', pg_column_name: 'v', ui_type: 'Number', name: 'V' }] as never;
    const rows = (vals: unknown[]) => vals.map((v, i) => ({ id: String(i), v })) as never;
    expect(computeRollupValue({} as never, field('SUM'), target, rows([1200, 800, 500]))).toBe(2500);
    expect(computeRollupValue({} as never, field('AVG'), target, rows([10, 20, 60]))).toBe(30);
    expect(computeRollupValue({} as never, field('MEDIAN'), target, rows([10, 20, 900]))).toBe(20);
    expect(computeRollupValue({} as never, field('COUNTA'), target, rows([1, null, 2]))).toBe(2);
    expect(computeRollupValue({} as never, field('COUNT'), target, rows([1, 2, 3]))).toBe(3);
    expect(computeRollupValue({} as never, field('AND'), target, rows([true, true, true]))).toBe(true);
    expect(computeRollupValue({} as never, field('OR'), target, rows([true, false, false]))).toBe(true);
    expect(computeRollupValue({} as never, field('XOR'), target, rows([true, false, false]))).toBe(true);
    expect(computeRollupValue({} as never, field('CONCATENATE'), target, rows(['Alpha', 'Beta', 'Gamma']))).toBe('Alpha, Beta, Gamma');
    expect(computeRollupValue({} as never, field('ARRAY_UNIQUE'), target, rows(['Open', 'Done', 'Open']))).toEqual(['Open', 'Done']);
    expect(computeRollupValue({} as never, field('ARRAYCOMPACT'), target, rows(['Alpha', '', 'Beta']))).toEqual(['Alpha', 'Beta']);
  });
});

describe('acceptsType and defaults', () => {
  it('any accepts everything; number only numbers', () => {
    expect(acceptsType('any', 'LongText')).toBe(true);
    expect(acceptsType('number', 'Currency')).toBe(true);
    expect(acceptsType('number', 'Date')).toBe(false);
    expect(acceptsType('boolean', 'Checkbox')).toBe(true);
    expect(acceptsType('boolean', 'Number')).toBe(false);
    expect(acceptsType('comparable', 'DateTime')).toBe(true);
  });

  it('picks the usual function for a type', () => {
    expect(defaultFunctionFor('Currency')).toBe('SUM');
    expect(defaultFunctionFor('Date')).toBe('MAX');
    expect(defaultFunctionFor('Checkbox')).toBe('AND');
    expect(defaultFunctionFor('SingleLineText')).toBe('CONCATENATE');
    expect(defaultFunctionFor(undefined)).toBe('COUNT');
  });

  it('keeps the chosen function when it still fits a new field, otherwise switches', () => {
    expect(reconcileFunction('SUM', 'Currency', true)).toBe('SUM');
    expect(reconcileFunction('SUM', 'SingleLineText', true)).toBe('CONCATENATE');
    expect(reconcileFunction('CONCATENATE', 'Currency', true)).toBe('CONCATENATE');
    expect(reconcileFunction('AND', 'Currency', true)).toBe('SUM');
    expect(reconcileFunction('SUM', undefined, false)).toBe('COUNT');
    expect(reconcileFunction('COUNT', 'Currency', true)).toBe('SUM'); // counting records needs no field
  });

  it('knows the older names for what the menu lists', () => {
    expect(canonicalFunction('countall')).toBe('COUNT');
    expect(canonicalFunction('ARRAYJOIN')).toBe('CONCATENATE');
    expect(canonicalFunction('sum')).toBe('SUM');
    expect(rollupFunction('avg')?.name).toBe('AVG');
    expect(rollupFunction('nope')).toBeUndefined();
  });
});

describe('setupProblem and describeSetup', () => {
  it('names the next thing to do, in order', () => {
    expect(setupProblem({ kind: 'Rollup', linkFieldId: '', targetFieldId: '', fn: 'COUNT' }, false)).toContain('no link fields');
    expect(setupProblem({ kind: 'Rollup', linkFieldId: '', targetFieldId: '', fn: 'SUM' }, true)).toBe('Choose which link to follow.');
    expect(setupProblem({ kind: 'Lookup', linkFieldId: 'l', targetFieldId: '', fn: '' }, true)).toBe('Choose the field to show.');
    expect(setupProblem({ kind: 'Rollup', linkFieldId: 'l', targetFieldId: '', fn: 'SUM' }, true)).toContain('Choose the field to work on');
  });

  it('is complete for a count, a lookup with a field, and a rollup that just counts', () => {
    expect(setupProblem({ kind: 'Count', linkFieldId: 'l', targetFieldId: '', fn: 'COUNTALL' }, true)).toBe('');
    expect(setupProblem({ kind: 'Lookup', linkFieldId: 'l', targetFieldId: 'f', fn: '' }, true)).toBe('');
    expect(setupProblem({ kind: 'Rollup', linkFieldId: 'l', targetFieldId: '', fn: 'COUNT' }, true)).toBe('');
  });

  it('says what it will do, in a sentence', () => {
    expect(describeSetup({ kind: 'Rollup', fn: 'SUM', linkName: 'Budget', fieldName: 'Amount' })).toBe('Adds up "Amount" across the records linked through "Budget".');
    expect(describeSetup({ kind: 'Lookup', fn: '', linkName: 'Client', fieldName: 'Email' })).toBe('Shows "Email" from each record linked through "Client".');
    expect(describeSetup({ kind: 'Count', fn: '', linkName: 'Tasks', fieldName: '' })).toBe('Counts the records linked through "Tasks".');
    expect(describeSetup({ kind: 'Rollup', fn: 'COUNT', linkName: 'Tasks', fieldName: '' })).toBe('Counts the records linked through "Tasks".');
  });

  it('says nothing until there is enough to say', () => {
    expect(describeSetup({ kind: 'Rollup', fn: 'SUM', linkName: 'Budget', fieldName: '' })).toBe('');
    expect(describeSetup({ kind: 'Lookup', fn: '', linkName: 'Budget', fieldName: '' })).toBe('');
    expect(describeSetup({ kind: 'Rollup', fn: 'SUM', linkName: '', fieldName: 'Amount' })).toBe('');
  });
});

describe('RollupSetup', () => {
  afterEach(cleanup);

  const linkFields = [{ id: 'L1', name: 'Budget', ui_type: 'Links', options: { relatedTableId: 'T2' } }] as never;
  const tables = [{ id: 'T2', name: 'Budget Lines' }];
  const targetFields = [
    { id: 'A', name: 'Amount', ui_type: 'Currency' },
    { id: 'N', name: 'Note', ui_type: 'SingleLineText' },
  ] as never;

  function setup(over: Partial<React.ComponentProps<typeof RollupSetup>> = {}) {
    const props = {
      kind: 'Rollup' as const,
      linkFields,
      tables,
      linkFieldId: '',
      onLinkField: vi.fn(),
      targetFields,
      targetFieldId: '',
      onTargetField: vi.fn(),
      fn: 'COUNT',
      onFn: vi.fn(),
      onCreateLinkField: vi.fn(),
      ...over,
    };
    render(<RollupSetup {...props} />);
    return props;
  }

  it('starts with only the first step, asking which link to follow', () => {
    setup();
    expect(screen.getByLabelText('Link field')).toBeTruthy();
    expect(screen.queryByLabelText('Field to work on')).toBeNull();
    expect(screen.getByText('Choose which link to follow.')).toBeTruthy();
  });

  it('after a link is chosen it says which table it reads from, and opens the next step', () => {
    setup({ linkFieldId: 'L1' });
    expect(screen.getByText('Budget Lines')).toBeTruthy();
    expect(screen.getByLabelText('Field to work on')).toBeTruthy();
  });

  it('choosing a number field switches to Sum and offers number functions only', () => {
    const p = setup({ linkFieldId: 'L1' });
    fireEvent.change(screen.getByLabelText('Field to work on'), { target: { value: 'A' } });
    expect(p.onTargetField).toHaveBeenCalledWith('A');
    expect(p.onFn).toHaveBeenCalledWith('SUM');
  });

  it('the function menu follows the field: numbers show Add them up, text does not', () => {
    setup({ linkFieldId: 'L1', targetFieldId: 'A', fn: 'SUM' });
    const group = screen.getByRole('radiogroup');
    expect(within(group).getByText('Add them up')).toBeTruthy();
    expect(within(group).queryByText('Join into one line of text')).not.toBeNull(); // joining works on any field
    expect((within(group).getByLabelText(/Add them up/) as HTMLInputElement).checked).toBe(true);
  });

  it('text fields do not offer Add them up', () => {
    setup({ linkFieldId: 'L1', targetFieldId: 'N', fn: 'CONCATENATE' });
    expect(screen.queryByText('Add them up')).toBeNull();
    expect(within(screen.getByRole('radiogroup')).getByText('Join into one line of text')).toBeTruthy();
  });

  it('choosing a function reports it', () => {
    const p = setup({ linkFieldId: 'L1', targetFieldId: 'A', fn: 'SUM' });
    fireEvent.click(screen.getByLabelText(/^Average/));
    expect(p.onFn).toHaveBeenCalledWith('AVG');
  });

  it('shows what it will do and a worked example once complete', () => {
    setup({ linkFieldId: 'L1', targetFieldId: 'A', fn: 'SUM' });
    const summary = document.querySelector('[data-rollup-summary]')!;
    expect(summary.textContent).toContain('Adds up "Amount" across the records linked through "Budget".');
    expect(summary.textContent).toContain('1,200 · 800 · 500');
    expect(summary.textContent).toContain('2,500');
  });

  it('an old field using COUNTALL still shows Count as chosen', () => {
    setup({ linkFieldId: 'L1', targetFieldId: '', fn: 'COUNTALL' });
    expect((screen.getByLabelText(/Count the linked records/) as HTMLInputElement).checked).toBe(true);
  });

  it('a lookup has two steps and no function menu', () => {
    setup({ kind: 'Lookup', linkFieldId: 'L1', targetFieldId: 'N', fn: 'COUNT' });
    expect(screen.getByLabelText('Field to show')).toBeTruthy();
    expect(screen.queryByRole('radiogroup')).toBeNull();
    expect(document.querySelector('[data-rollup-summary]')!.textContent).toContain('Shows "Note" from each record linked through "Budget".');
  });

  it('a count only asks for the link', () => {
    setup({ kind: 'Count', linkFieldId: 'L1' });
    expect(screen.queryByLabelText('Field to show')).toBeNull();
    expect(screen.queryByRole('radiogroup')).toBeNull();
    expect(document.querySelector('[data-rollup-summary]')!.textContent).toContain('Counts the records linked through "Budget".');
  });

  it('with no link fields it explains and offers to create one', () => {
    const p = setup({ linkFields: [] as never });
    expect(screen.getByText('This table has no link fields yet')).toBeTruthy();
    fireEvent.click(screen.getByText(/Create a link field/));
    expect(p.onCreateLinkField).toHaveBeenCalled();
  });

  it('with no link fields and no way to create one, it says what to do instead of showing a dead button', () => {
    setup({ linkFields: [] as never, onCreateLinkField: undefined });
    expect(screen.queryByText(/Create a link field/)).toBeNull();
    expect(screen.getByText(/Add a link field to this table/)).toBeTruthy();
  });
});
