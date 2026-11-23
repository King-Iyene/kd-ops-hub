import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GridCell } from '../components/grid/GridCell';
import { useGridColors } from '../hooks/useGridColors';
import { useDatabaseUI } from '../lib/store';

// The first render of the grid code is slow on a busy machine.
vi.setConfig({ testTimeout: 30000 });

const baseField = (ui_type: string, options: Record<string, unknown> = {}) =>
  ({
    id: 'f1',
    table_id: 't1',
    name: 'Amount',
    pg_column_name: 'amount',
    ui_type,
    pg_type: 'NUMERIC',
    options,
    position: 1,
    width: 180,
    is_primary: false,
    is_required: false,
    is_unique: false,
    is_system: false,
    is_hidden: false,
    description: null,
    default_value: null,
    created_at: '',
    updated_at: '',
  }) as any;

function Harness({ field, value, onCellUpdate }: { field: any; value: unknown; onCellUpdate: (...a: any[]) => void }) {
  const colors = useGridColors();
  return (
    <GridCell
      field={field}
      record={{ id: 'r1', amount: value } as any}
      onCellUpdate={onCellUpdate}
      onFieldUpdate={vi.fn()}
      colors={colors}
    />
  );
}

const startEditing = () => act(() => { useDatabaseUI.getState().setEditingCell('r1:f1'); });

describe('grid cell saving', () => {
  beforeEach(() => {
    act(() => { useDatabaseUI.getState().setEditingCell(null); useDatabaseUI.getState().setSelectedCell(null); });
  });
  afterEach(cleanup);

  it('writes nothing when the value did not change', () => {
    const onCellUpdate = vi.fn();
    render(<Harness field={baseField('Number')} value={5} onCellUpdate={onCellUpdate} />);
    startEditing();
    const input = screen.getByRole('textbox');
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onCellUpdate).not.toHaveBeenCalled();
    expect(useDatabaseUI.getState().editingCellId).toBeNull();
  });

  it('writes the new value once', () => {
    const onCellUpdate = vi.fn();
    render(<Harness field={baseField('Number')} value={5} onCellUpdate={onCellUpdate} />);
    startEditing();
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: '8' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    fireEvent.blur(input);
    expect(onCellUpdate).toHaveBeenCalledTimes(1);
    expect(onCellUpdate).toHaveBeenCalledWith('r1', 'f1', 8);
  });

  it('a required field cannot be emptied and says why', () => {
    const onCellUpdate = vi.fn();
    const field = baseField('Number', { validations: [{ type: 'required' }] });
    render(<Harness field={field} value={5} onCellUpdate={onCellUpdate} />);
    startEditing();
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: '' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onCellUpdate).not.toHaveBeenCalled();
    expect(screen.getByText('Amount is required')).toBeInTheDocument();
  });

  it('a value outside the allowed range is refused', () => {
    const onCellUpdate = vi.fn();
    const field = baseField('Number', { validations: [{ type: 'max', value: 100 }] });
    render(<Harness field={field} value={5} onCellUpdate={onCellUpdate} />);
    startEditing();
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: '500' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onCellUpdate).not.toHaveBeenCalled();
    expect(screen.getByText('Amount must be at most 100')).toBeInTheDocument();
  });

  it('a value inside the range is saved', () => {
    const onCellUpdate = vi.fn();
    const field = baseField('Number', { validations: [{ type: 'max', value: 100 }] });
    render(<Harness field={field} value={5} onCellUpdate={onCellUpdate} />);
    startEditing();
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: '50' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onCellUpdate).toHaveBeenCalledWith('r1', 'f1', 50);
  });

  it('calculated cells are marked as not editable', () => {
    const onCellUpdate = vi.fn();
    const field = baseField('Formula');
    render(<Harness field={field} value="x" onCellUpdate={onCellUpdate} />);
    expect(screen.getByTitle(/calculated automatically/i)).toBeInTheDocument();
  });
});
