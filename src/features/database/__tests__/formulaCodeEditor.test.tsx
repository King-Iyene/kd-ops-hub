import { render, cleanup, waitFor, act, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createRef } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { EditorView } from '@codemirror/view';
import { deleteCharBackward } from '@codemirror/commands';

vi.setConfig({ testTimeout: 30000 });

// jsdom has no layout; CodeMirror asks for rectangles, so give it empty ones.
beforeAll(() => {
  const emptyRect = { x: 0, y: 0, width: 0, height: 0, top: 0, left: 0, right: 0, bottom: 0, toJSON() {} };
  Range.prototype.getClientRects = (() => ({ length: 0, item: () => null, [Symbol.iterator]: function* () {} })) as never;
  Range.prototype.getBoundingClientRect = (() => emptyRect) as never;
  Element.prototype.scrollIntoView = () => {};
});

import FormulaCodeEditor, { type FormulaCodeEditorHandle } from '../components/formula/FormulaCodeEditor';
import { FormulaEditor } from '../components/FormulaEditor';
import { FunctionReference } from '../components/formula/FunctionReference';

const FIELDS = [{ name: 'Amount', type: 'Currency' }, { name: 'Paid', type: 'Checkbox' }];

const viewOf = (container: HTMLElement) => EditorView.findFromDOM(container.querySelector('.cm-editor') as HTMLElement)!;

describe('FormulaCodeEditor', () => {
  afterEach(cleanup);

  it('shows the formula, with functions, numbers and text each marked', () => {
    const { container } = render(<FormulaCodeEditor value={'IF({Paid}, "yes", 2)'} onChange={() => {}} fields={FIELDS} pills={false} />);
    expect(container.querySelector('.cm-fx-function')?.textContent).toBe('IF');
    expect(container.querySelector('.cm-fx-string')?.textContent).toBe('"yes"');
    expect(container.querySelector('.cm-fx-number')?.textContent).toBe('2');
  });

  it('draws a known field as a chip, and a field that does not exist as a red chip', () => {
    const { container } = render(<FormulaCodeEditor value={'{Amount} + {Nope}'} onChange={() => {}} fields={FIELDS} pills />);
    const pills = [...container.querySelectorAll('.cm-fx-pill')];
    expect(pills.map((p) => p.textContent)).toEqual(['Amount', 'Nope']);
    expect(pills[0].classList.contains('cm-fx-pill-unknown')).toBe(false);
    expect(pills[1].classList.contains('cm-fx-pill-unknown')).toBe(true);
    expect(pills[0].getAttribute('aria-label')).toBe('field Amount');
    expect(pills[1].getAttribute('aria-label')).toContain('not found');
  });

  it('with chips off, fields are coloured text with the braces showing', () => {
    const { container } = render(<FormulaCodeEditor value={'{Amount}'} onChange={() => {}} fields={FIELDS} pills={false} />);
    expect(container.querySelector('.cm-fx-pill')).toBeNull();
    expect(container.querySelector('.cm-fx-field')?.textContent).toBe('{Amount}');
  });

  it('the text stays the same either way: a chip is only how it is drawn', () => {
    const { container, rerender } = render(<FormulaCodeEditor value={'{Amount} * 2'} onChange={() => {}} fields={FIELDS} pills />);
    expect(viewOf(container).state.doc.toString()).toBe('{Amount} * 2');
    rerender(<FormulaCodeEditor value={'{Amount} * 2'} onChange={() => {}} fields={FIELDS} pills={false} />);
    expect(viewOf(container).state.doc.toString()).toBe('{Amount} * 2');
  });

  it('Backspace right after a chip removes the whole chip, not one letter of it', () => {
    const { container } = render(<FormulaCodeEditor value={'{Amount}'} onChange={() => {}} fields={FIELDS} pills />);
    const view = viewOf(container);
    view.dispatch({ selection: { anchor: 8 } });
    deleteCharBackward(view);
    expect(view.state.doc.toString()).toBe('');
  });

  it('with chips off, Backspace removes one character as in any text', () => {
    const { container } = render(<FormulaCodeEditor value={'{Amount}'} onChange={() => {}} fields={FIELDS} pills={false} />);
    const view = viewOf(container);
    view.dispatch({ selection: { anchor: 8 } });
    deleteCharBackward(view);
    expect(view.state.doc.toString()).toBe('{Amount');
  });

  it('typing reports the new text', () => {
    const onChange = vi.fn();
    const { container } = render(<FormulaCodeEditor value="" onChange={onChange} fields={FIELDS} pills />);
    const view = viewOf(container);
    view.dispatch({ changes: { from: 0, insert: 'ABS(1)' } });
    expect(onChange).toHaveBeenLastCalledWith('ABS(1)');
  });

  it('a change from outside replaces the text without reporting it back', () => {
    const onChange = vi.fn();
    const { container, rerender } = render(<FormulaCodeEditor value="A" onChange={onChange} fields={FIELDS} pills />);
    rerender(<FormulaCodeEditor value="SUM(1, 2)" onChange={onChange} fields={FIELDS} pills />);
    expect(viewOf(container).state.doc.toString()).toBe('SUM(1, 2)');
    expect(onChange).toHaveBeenCalledTimes(1); // the replacement itself is reported once, never in a loop
  });

  it('insert() puts text at the cursor, replacing a selection', () => {
    const ref = createRef<FormulaCodeEditorHandle>();
    const onChange = vi.fn();
    const { container } = render(<FormulaCodeEditor ref={ref} value="1 + 2" onChange={onChange} fields={FIELDS} pills={false} />);
    const view = viewOf(container);
    view.dispatch({ selection: { anchor: 4, head: 5 } });
    act(() => ref.current!.insert('{Amount}'));
    expect(view.state.doc.toString()).toBe('1 + {Amount}');
    expect(onChange).toHaveBeenLastCalledWith('1 + {Amount}');
  });

  it('is labelled for screen readers', () => {
    const { container } = render(<FormulaCodeEditor value="" onChange={() => {}} fields={FIELDS} pills ariaLabel="Formula for Total" />);
    const content = container.querySelector('.cm-content')!;
    expect(content.getAttribute('aria-label')).toBe('Formula for Total');
    expect(content.getAttribute('aria-multiline')).toBe('true');
  });

  it('reports problems, with the place, after a short pause', async () => {
    const onDiagnostics = vi.fn();
    render(<FormulaCodeEditor value={'SUM({Amount}'} onChange={() => {}} fields={FIELDS} pills onDiagnostics={onDiagnostics} />);
    await waitFor(() => expect(onDiagnostics).toHaveBeenCalled(), { timeout: 3000 });
    const last = onDiagnostics.mock.calls[onDiagnostics.mock.calls.length - 1][0];
    expect(last[0]).toMatchObject({ blocking: true, message: 'A closing parenthesis ) is missing.' });
  });
});

describe('FunctionReference', () => {
  afterEach(cleanup);

  it('lists functions by category with what they do', () => {
    render(<FunctionReference onPick={() => {}} />);
    expect(screen.getByText('ROUND(number, [places])')).toBeTruthy();
    expect(screen.getByText('Rounds to the nearest value, with that many decimal places.')).toBeTruthy();
    expect(document.querySelector('[aria-label="Text"]')).not.toBeNull();
  });

  it('narrows as you type, and says so when nothing matches', () => {
    render(<FunctionReference onPick={() => {}} />);
    const search = screen.getByLabelText('Search functions');
    fireEvent.change(search, { target: { value: 'regex' } });
    expect(screen.getByText('REGEX_MATCH(text, pattern)')).toBeTruthy();
    expect(screen.queryByText('ROUND(number, [places])')).toBeNull();
    fireEvent.change(search, { target: { value: 'zzzzqq' } });
    expect(screen.getByText(/No function matches/)).toBeTruthy();
  });

  it('picking a function reports its name', () => {
    const onPick = vi.fn();
    render(<FunctionReference onPick={onPick} />);
    fireEvent.click(screen.getByText('ABS(number)'));
    expect(onPick).toHaveBeenCalledWith('ABS');
  });
});

describe('FormulaEditor (the dialog part)', () => {
  afterEach(cleanup);

  const fields = [
    { id: 'f1', name: 'Amount', ui_type: 'Currency', pg_column_name: 'amount' },
    { id: 'f2', name: 'Total', ui_type: 'Formula', pg_column_name: 'total' },
  ] as never;

  function mount(value: string, onChange = vi.fn(), error?: string) {
    const qc = new QueryClient();
    return render(
      <QueryClientProvider client={qc}>
        <FormulaEditor value={value} onChange={onChange} fields={fields} error={error} sampleRecords={[{ amount: 10 }]} />
      </QueryClientProvider>,
    );
  }

  it('loads the editor and shows the formula in it', async () => {
    const { container } = mount('{Amount} * 2');
    await waitFor(() => expect(container.querySelector('.cm-editor')).not.toBeNull(), { timeout: 5000 });
    expect(viewOf(container).state.doc.toString()).toBe('{Amount} * 2');
  });

  it('has a Chips switch and a Functions button, both usable by keyboard', async () => {
    const { container } = mount('{Amount}');
    await waitFor(() => expect(container.querySelector('.cm-editor')).not.toBeNull(), { timeout: 5000 });
    const chips = screen.getByRole('button', { name: /chips/i });
    expect(chips.getAttribute('aria-pressed')).toBeDefined();
    const before = chips.getAttribute('aria-pressed');
    fireEvent.click(chips);
    expect(chips.getAttribute('aria-pressed')).not.toBe(before);
    const functions = screen.getByRole('button', { name: /functions/i });
    expect(functions.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(functions);
    expect(functions.getAttribute('aria-expanded')).toBe('true');
    expect(document.querySelector('[data-function-reference]')).not.toBeNull();
  });

  it('picking a function in the reference puts it in the formula', async () => {
    const onChange = vi.fn();
    const { container } = mount('', onChange);
    await waitFor(() => expect(container.querySelector('.cm-editor')).not.toBeNull(), { timeout: 5000 });
    fireEvent.click(screen.getByRole('button', { name: /functions/i }));
    fireEvent.click(screen.getByText('ABS(number)'));
    await waitFor(() => expect(onChange).toHaveBeenCalledWith('ABS('));
  });

  it('shows a problem as a sentence once the editor has checked it', async () => {
    mount('Amount + 1');
    await waitFor(() => expect(screen.getByText(/is not a function/)).toBeTruthy(), { timeout: 5000 });
    expect(screen.getByText(/write it in braces: \{Amount\}/)).toBeTruthy();
    expect(screen.queryByText('Formula is valid')).toBeNull();
  });

  it('says the formula is valid when it is', async () => {
    mount('{Amount} * 2');
    await waitFor(() => expect(screen.getByText('Formula is valid')).toBeTruthy(), { timeout: 5000 });
  });

  it('a reference to a computed field is allowed (no false "no such field" warning)', async () => {
    mount('{Total} + 1');
    await waitFor(() => expect(screen.getByText('Formula is valid')).toBeTruthy(), { timeout: 5000 });
  });

  it('shows the preview for the sample row', async () => {
    mount('{Amount} * 2');
    await waitFor(() => expect(screen.getByText('20')).toBeTruthy(), { timeout: 5000 });
  });
});
