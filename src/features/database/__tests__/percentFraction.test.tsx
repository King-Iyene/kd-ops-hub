import { render, cleanup, fireEvent } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.setConfig({ testTimeout: 30000 });
vi.mock('next-themes', () => ({ useTheme: () => ({ resolvedTheme: 'light', theme: 'light' }) }));

import { fromShownPercent, storedAsFraction, toShownPercent } from '../lib/percent';
import { coerceValue } from '../lib/csv';
import { PercentCellRenderer } from '../components/grid/cell-renderers';
import { PercentCellEditor } from '../components/grid/cell-editors';

const fractionField = { id: 'f', ui_type: 'Percent', options: { storedAsFraction: true, percentDisplay: 'text' } } as never;
const plainField = { id: 'f', ui_type: 'Percent', options: { percentDisplay: 'text' } } as never;

describe('percent fields that keep a fraction', () => {
  it('reads the flag from the field', () => {
    expect(storedAsFraction({ options: { storedAsFraction: true } })).toBe(true);
    expect(storedAsFraction({ options: {} })).toBe(false);
    expect(storedAsFraction(undefined)).toBe(false);
  });

  it('converts without float noise, both ways', () => {
    expect(toShownPercent(0.144, true)).toBe(14.4);
    expect(toShownPercent(0.1, true)).toBe(10);
    expect(fromShownPercent(14.4, true)).toBe(0.144);
    expect(fromShownPercent(25, true)).toBe(0.25);
    expect(toShownPercent(14.4, false)).toBe(14.4);
    expect(fromShownPercent(14.4, false)).toBe(14.4);
  });

  it('every value survives a round trip', () => {
    for (const stored of [0, 0.01, 0.07, 0.144, 0.25, 1]) {
      expect(fromShownPercent(toShownPercent(stored, true), true)).toBe(stored);
    }
  });

  it('shows 0.144 as 14.4% and leaves ordinary percent fields alone', () => {
    const a = render(<PercentCellRenderer value={0.144} field={fractionField} record={{ id: 'r' } as never} rowHeight="short" />);
    expect(a.container.textContent).toBe('14.4%');
    cleanup();
    const b = render(<PercentCellRenderer value={14.4} field={plainField} record={{ id: 'r' } as never} rowHeight="short" />);
    expect(b.container.textContent).toBe('14.4%');
  });

  it('the editor shows the percentage and stores the fraction', () => {
    const onCommit = vi.fn();
    const { container } = render(<PercentCellEditor value={0.144} field={fractionField} onCommit={onCommit} onCancel={vi.fn()} record={{ id: 'r' } as never} />);
    const input = container.querySelector('input') as HTMLInputElement;
    expect(input.value).toBe('14.4');
    fireEvent.change(input, { target: { value: '20' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onCommit).toHaveBeenCalledWith(0.2);
  });

  it('pasting 14.4% or 14.4 stores the right value', () => {
    expect(coerceValue('14.4%', fractionField)).toBe(0.144);
    expect(coerceValue('14.4', fractionField)).toBe(0.144);
    expect(coerceValue('14.4%', plainField)).toBe(14.4);
    expect(coerceValue('abc', fractionField)).toBeNull();
  });
});
