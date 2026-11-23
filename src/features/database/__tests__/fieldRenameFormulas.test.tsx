import { renderHook, act, waitFor, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.setConfig({ testTimeout: 30000 });

// A stand-in database: records which rows were updated and with what.
const updates: Array<{ id: string; payload: Record<string, any> }> = [];
let failFormulaUpdates = false;

function chain(): any {
  let payload: Record<string, any> = {};
  let id = '';
  const c: any = new Proxy(function () {}, {
    get(_t, prop) {
      if (prop === 'then') {
        return (resolve: (v: unknown) => unknown) => {
          const isFormulaWrite = 'options' in payload && id !== 'renamed-field';
          if (id) updates.push({ id, payload });
          if (failFormulaUpdates && isFormulaWrite) return resolve({ data: null, error: { message: 'write refused' } });
          return resolve({ data: { id: id || 'x', name: payload.name ?? 'x' }, error: null });
        };
      }
      if (prop === 'update') return (p: Record<string, any>) => { payload = p; return c; };
      if (prop === 'eq') return (_col: string, value: string) => { id = value; return c; };
      return () => c;
    },
    apply() { return c; },
  });
  return c;
}

vi.mock('@/lib/supabase', () => ({
  supabase: {
    schema: () => ({ from: () => chain() }),
    functions: { invoke: async () => ({ data: { success: true }, error: null }) },
  },
}));
vi.mock('@/hooks/use-toast', () => ({ toast: vi.fn() }));

import { useUpdateField } from '../hooks/useFields';
import { formulaRenameChanges } from '../lib/formulaEditorSupport';

const field = (id: string, name: string, ui_type: string, options: Record<string, any> | null = null) => ({
  id, name, ui_type, options, table_id: 't1', pg_column_name: name.toLowerCase(),
});

describe('formulaRenameChanges', () => {
  const fields = [
    field('f1', 'Price', 'Currency'),
    field('f2', 'Total', 'Formula', { expression: '{Price} * {Qty}' }),
    field('f3', 'Label', 'Formula', { formula: 'CONCATENATE("Price: ", {Price})' }),
    field('f4', 'Other', 'Formula', { expression: '{Qty} + 1' }),
    field('f5', 'Note', 'SingleLineText', { expression: '{Price}' }),
    field('f6', 'Empty', 'Formula', null),
  ];

  it('rewrites only the formulas that mention the old name, under whichever key holds the text', () => {
    const changes = formulaRenameChanges(fields, 'Price', 'Unit Price');
    expect(changes.map((c) => c.id)).toEqual(['f2', 'f3']);
    expect(changes[0].options.expression).toBe('{Unit Price} * {Qty}');
    expect(changes[1].options.formula).toBe('CONCATENATE("Price: ", {Unit Price})');
  });

  it('keeps the other options of the field', () => {
    const [change] = formulaRenameChanges([field('f', 'T', 'Formula', { expression: '{A}', result: { type: 'number' } })], 'A', 'B');
    expect(change.options).toEqual({ expression: '{B}', result: { type: 'number' } });
  });

  it('changes nothing when no formula uses the name', () => {
    expect(formulaRenameChanges(fields, 'Missing', 'Whatever')).toEqual([]);
  });
});

describe('renaming a field updates the formulas that use it', () => {
  beforeEach(() => {
    updates.length = 0;
    failFormulaUpdates = false;
  });
  afterEach(cleanup);

  function setup() {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    qc.setQueryData(['nc', 'fields', 't1'], [
      field('renamed-field', 'Price', 'Currency'),
      field('formula-1', 'Total', 'Formula', { expression: '{Price} * 2' }),
      field('formula-2', 'Unrelated', 'Formula', { expression: '1 + 1' }),
    ]);
    const wrapper = ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
    return renderHook(() => useUpdateField(), { wrapper });
  }

  it('rewrites the dependent formula after saving the new name', async () => {
    const { result } = setup();
    act(() => {
      result.current.mutate({ id: 'renamed-field', table_id: 't1', updates: { name: 'Unit Price' } });
    });
    await waitFor(() => expect(result.current.isSuccess || result.current.isError).toBe(true));
    expect(result.current.error).toBeNull();
    // First the rename, then the one formula that mentioned it. The unrelated formula is not touched.
    expect(updates.map((u) => u.id)).toEqual(['renamed-field', 'formula-1']);
    expect(updates[1].payload.options.expression).toBe('{Unit Price} * 2');
  });

  it('does nothing extra for a change that is not a rename', async () => {
    const { result } = setup();
    act(() => {
      result.current.mutate({ id: 'renamed-field', table_id: 't1', updates: { width: 200 } });
    });
    await waitFor(() => expect(result.current.isSuccess || result.current.isError).toBe(true));
    expect(updates.map((u) => u.id)).toEqual(['renamed-field']);
  });

  it('a formula that cannot be rewritten does not undo the rename', async () => {
    failFormulaUpdates = true;
    const { result } = setup();
    act(() => {
      result.current.mutate({ id: 'renamed-field', table_id: 't1', updates: { name: 'Unit Price' } });
    });
    await waitFor(() => expect(result.current.isSuccess || result.current.isError).toBe(true));
    expect(result.current.error).toBeNull();
    expect(result.current.isSuccess).toBe(true);
  });
});
