import { render, cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.setConfig({ testTimeout: 30000 });
vi.mock('next-themes', () => ({ useTheme: () => ({ resolvedTheme: 'light', theme: 'light' }) }));

import { matchChoice, nextUnusedColor, normalizeSelectPaste, splitSelectTokens } from '../lib/selectOptions';
import { coerceValue } from '../lib/csv';
import { MultiSelectCellEditor, SelectCellEditor } from '../components/grid/cell-editors';

const choices = [
  { title: 'Design', color: 'blueLight2' },
  { title: 'Sales', color: 'greenLight2' },
  { title: 'Ops', color: 'redLight2' },
];

describe('splitting pasted words into options', () => {
  it('separates on commas, semicolons and new lines and drops blanks and repeats', () => {
    expect(splitSelectTokens('Design, Sales;Ops\nDesign,, ')).toEqual(['Design', 'Sales', 'Ops']);
  });

  it('repeats are found regardless of capital letters', () => {
    expect(splitSelectTokens('ops, OPS, Ops')).toEqual(['ops']);
  });
});

describe('matching a word to an option', () => {
  it('ignores capitals and stray spaces', () => {
    expect(matchChoice('  sales ', choices)?.title).toBe('Sales');
    expect(matchChoice('Marketing', choices)).toBeUndefined();
    expect(matchChoice('   ', choices)).toBeUndefined();
  });
});

describe('pasting into select cells', () => {
  it('a multi-select takes each word, using the option spelling when there is one', () => {
    expect(normalizeSelectPaste('design; sales, Legal', choices, true)).toEqual(['Design', 'Sales', 'Legal']);
  });

  it('never glues the words together', () => {
    expect(normalizeSelectPaste('Monday Tuesday', choices, true)).toEqual(['Monday Tuesday']);
    expect(normalizeSelectPaste('Design\nSales', choices, true)).toEqual(['Design', 'Sales']);
  });

  it('a single select keeps one value and matches it to an option', () => {
    expect(normalizeSelectPaste('sales', choices, false)).toBe('Sales');
    expect(normalizeSelectPaste('Something new', choices, false)).toBe('Something new');
    expect(normalizeSelectPaste('   ', choices, false)).toBeNull();
  });

  it('goes through the same rules when pasting into the grid', () => {
    const multi = { ui_type: 'MultiSelect', options: { choices } } as never;
    const single = { ui_type: 'SingleSelect', options: { choices } } as never;
    expect(coerceValue('design, ops', multi)).toEqual(['Design', 'Ops']);
    expect(coerceValue('OPS', single)).toBe('Ops');
    expect(coerceValue('', single)).toBeNull();
  });
});

describe('colour for a new option', () => {
  const palette = ['a', 'b', 'c'];
  it('takes the first colour nobody uses', () => {
    expect(nextUnusedColor([{ title: 'x', color: 'a' }], palette)).toBe('b');
    expect(nextUnusedColor([], palette)).toBe('a');
  });

  it('starts over when every colour is taken', () => {
    const all = palette.map((c, i) => ({ title: String(i), color: c }));
    expect(nextUnusedColor(all, palette)).toBe('a');
  });
});

describe('the multi-select editor', () => {
  afterEach(cleanup);

  function setup(selected: string[] = []) {
    const onCommit = vi.fn();
    const onFieldUpdate = vi.fn();
    render(
      <MultiSelectCellEditor
        value={selected}
        field={{ id: 'f', table_id: 't', ui_type: 'MultiSelect', options: { choices } } as never}
        onCommit={onCommit}
        onCancel={vi.fn()}
        onFieldUpdate={onFieldUpdate}
      />,
    );
    return { onCommit, onFieldUpdate, input: screen.getByRole('combobox') as HTMLInputElement };
  }

  it('announces itself as a combobox over a multi-select listbox', () => {
    const { input } = setup();
    expect(input.getAttribute('aria-controls')).toBe('multi-options-list');
    expect(document.querySelector('[role=listbox]')?.getAttribute('aria-multiselectable')).toBe('true');
    expect(document.querySelectorAll('[role=option]')).toHaveLength(3);
  });

  it('Backspace in the empty box takes off the last chip, not before', () => {
    const { input } = setup(['Design', 'Sales']);
    expect(document.body.textContent).toContain('Sales');
    fireEvent.keyDown(input, { key: 'Backspace' });
    const chips = [...document.querySelectorAll('[role=option][aria-selected=true]')].map((o) => o.textContent);
    expect(chips).toEqual(['✓Design']);
    // With something typed, Backspace edits the text and leaves the chips alone.
    fireEvent.change(input, { target: { value: 'x' } });
    fireEvent.keyDown(input, { key: 'Backspace' });
    fireEvent.change(input, { target: { value: '' } });
    expect([...document.querySelectorAll('[role=option][aria-selected=true]')]).toHaveLength(1);
  });

  it('Enter picks the option you typed, in any capitals', () => {
    const { input } = setup();
    fireEvent.change(input, { target: { value: 'ops' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect([...document.querySelectorAll('[role=option][aria-selected=true]')].map((o) => o.textContent)).toEqual(['✓Ops']);
  });

  it('pasting a list picks the known options and creates the new ones with new colours', () => {
    const { input, onFieldUpdate } = setup();
    fireEvent.paste(input, { clipboardData: { getData: () => 'design, Legal; sales' } });
    expect([...document.querySelectorAll('[role=option][aria-selected=true]')].map((o) => o.textContent?.replace('✓', ''))).toEqual(
      expect.arrayContaining(['Design', 'Sales', 'Legal']),
    );
    expect(onFieldUpdate).toHaveBeenCalledTimes(1);
    const created = (onFieldUpdate.mock.calls[0][2] as { choices: Array<{ title: string; color: string }> }).choices;
    const legal = created.find((c) => c.title === 'Legal')!;
    expect(created.filter((c) => c.color === legal.color)).toHaveLength(1);
  });
});

describe('the single-select editor', () => {
  afterEach(cleanup);

  it('Enter chooses the option that matches what was typed', () => {
    const onCommit = vi.fn();
    render(
      <SelectCellEditor
        value={null}
        field={{ id: 'f', table_id: 't', ui_type: 'SingleSelect', options: { choices } } as never}
        onCommit={onCommit}
        onCancel={vi.fn()}
      />,
    );
    const input = screen.getByRole('combobox');
    fireEvent.change(input, { target: { value: 'SALES' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onCommit).toHaveBeenCalledWith('Sales');
  });
});
