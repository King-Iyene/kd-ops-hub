import { render, fireEvent, cleanup, screen, renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.setConfig({ testTimeout: 30000 });

// A stand-in database for the link creator: every query gives back a table/base row, and inserts are recorded.
const inserted: Array<{ table: string; payload: Record<string, any> }> = [];

function chain(table = ''): any {
  const c: any = new Proxy(function () {}, {
    get(_t, prop) {
      if (prop === 'then') {
        return (resolve: (v: unknown) => unknown) =>
          resolve({ data: { id: `${table}-id`, schema_name: 'nc_test', pg_table_name: 'projects', name: 'Projects' }, error: null });
      }
      if (prop === 'insert') {
        return (payload: Record<string, any>) => {
          inserted.push({ table, payload });
          return c;
        };
      }
      return () => c;
    },
    apply() {
      return c;
    },
  });
  return c;
}

vi.mock('@/lib/supabase', () => ({
  supabase: {
    schema: () => ({ from: (table: string) => chain(table) }),
    functions: { invoke: async () => ({ data: { success: true }, error: null }) },
  },
}));

import { LinkSetup } from '../components/LinkSetup';
import { useCreateLink } from '../hooks/useLinks';
import {
  defaultReciprocalName,
  deriveRelation,
  describeRelation,
  reciprocalNameOrDefault,
  relationLabel,
  singular,
} from '../lib/linkSetup';

describe('deriveRelation', () => {
  it('many / many is the usual many-to-many', () => {
    expect(deriveRelation(true, true)).toEqual({ relationType: 'many_to_many', allowMultiple: true });
  });
  it('many / one is one-to-many', () => {
    expect(deriveRelation(true, false)).toEqual({ relationType: 'one_to_many', allowMultiple: true });
  });
  it('one / one is one-to-one with a single record per cell', () => {
    expect(deriveRelation(false, false)).toEqual({ relationType: 'one_to_one', allowMultiple: false });
  });
  it('one / many keeps a single record per cell but lets many point at the same one', () => {
    expect(deriveRelation(false, true)).toEqual({ relationType: 'many_to_many', allowMultiple: false });
  });
  it('the cell only holds several records when the first answer is "many"', () => {
    for (const a of [true, false]) for (const b of [true, false]) expect(deriveRelation(a, b).allowMultiple).toBe(a);
  });
});

describe('wording', () => {
  it('names the combination', () => {
    expect(relationLabel(true, true)).toBe('Many to many');
    expect(relationLabel(true, false)).toBe('One to many');
    expect(relationLabel(false, true)).toBe('Many to one');
    expect(relationLabel(false, false)).toBe('One to one');
  });

  it('makes a table name singular for sentences', () => {
    expect(singular('Projects')).toBe('Project');
    expect(singular('Companies')).toBe('Company');
    expect(singular('Boxes')).toBe('Box');
    expect(singular('Status')).toBe('Status');
    expect(singular('Clients')).toBe('Client');
    expect(singular('Staff')).toBe('Staff');
  });

  it('describes each combination as a sentence', () => {
    expect(describeRelation('Projects', 'Tasks', true, true)).toBe('Each Project can link to many Tasks, and each Task can be linked from many Projects.');
    expect(describeRelation('Projects', 'Tasks', true, false)).toBe('Each Project can link to many Tasks, and each Task can be linked from only one Project.');
    expect(describeRelation('Tasks', 'Projects', false, true)).toBe('Each Task links to one Project, and each Project can be linked from many Tasks.');
    expect(describeRelation('Clients', 'Contracts', false, false)).toBe('Each Client links to one Contract, and each Contract can be linked from only one Client.');
  });

  it('says nothing until both tables are known', () => {
    expect(describeRelation('', 'Tasks', true, true)).toBe('');
    expect(describeRelation('Projects', '', true, true)).toBe('');
  });

  it('the matching field is named after this table unless a name is typed', () => {
    expect(defaultReciprocalName('  Projects ')).toBe('Projects');
    expect(reciprocalNameOrDefault('', 'Projects')).toBe('Projects');
    expect(reciprocalNameOrDefault('   ', 'Projects')).toBe('Projects');
    expect(reciprocalNameOrDefault(' Work ', 'Projects')).toBe('Work');
  });
});

describe('LinkSetup', () => {
  afterEach(cleanup);
  const tables = [{ id: 'T2', name: 'Tasks' }, { id: 'T3', name: 'Clients' }];

  function setup(over: Partial<React.ComponentProps<typeof LinkSetup>> = {}) {
    const props = {
      thisTableName: 'Projects',
      tables,
      targetTableId: '',
      onTarget: vi.fn(),
      linksToMany: true,
      onLinksToMany: vi.fn(),
      linkedFromMany: true,
      onLinkedFromMany: vi.fn(),
      reciprocalName: '',
      onReciprocalName: vi.fn(),
      ...over,
    };
    render(<LinkSetup {...props} />);
    return props;
  }

  it('first asks only which table to link to', () => {
    setup();
    expect(screen.getByLabelText('Which table do you want to link to?')).toBeTruthy();
    expect(screen.queryByRole('radiogroup')).toBeNull();
  });

  it('reports the table chosen', () => {
    const p = setup();
    fireEvent.change(screen.getByLabelText('Which table do you want to link to?'), { target: { value: 'T2' } });
    expect(p.onTarget).toHaveBeenCalledWith('T2');
  });

  it('once a table is chosen it asks the two questions in plain words', () => {
    setup({ targetTableId: 'T2' });
    const groups = screen.getAllByRole('radiogroup');
    expect(groups).toHaveLength(2);
    expect(screen.getByText('Only one Task')).toBeTruthy();
    expect(screen.getByText('Many Tasks')).toBeTruthy();
    expect(screen.getByText('Only one Project')).toBeTruthy();
    expect(screen.getByText('Many Projects')).toBeTruthy();
  });

  it('shows which answers are chosen and reports a change', () => {
    const p = setup({ targetTableId: 'T2', linksToMany: false, linkedFromMany: true });
    expect(screen.getByText('Only one Task').getAttribute('aria-checked')).toBe('true');
    expect(screen.getByText('Many Tasks').getAttribute('aria-checked')).toBe('false');
    fireEvent.click(screen.getByText('Many Tasks'));
    expect(p.onLinksToMany).toHaveBeenCalledWith(true);
    fireEvent.click(screen.getByText('Only one Project'));
    expect(p.onLinkedFromMany).toHaveBeenCalledWith(false);
  });

  it('says what the answers mean, and names the combination', () => {
    setup({ targetTableId: 'T2', linksToMany: true, linkedFromMany: false });
    const summary = document.querySelector('[data-link-summary]')!;
    expect(summary.textContent).toContain('One to many');
    expect(summary.textContent).toContain('Each Project can link to many Tasks, and each Task can be linked from only one Project.');
  });

  it('lets the matching field be named, with this table as the suggestion', () => {
    const p = setup({ targetTableId: 'T2' });
    const input = screen.getByLabelText('Name of the matching field in Tasks') as HTMLInputElement;
    expect(input.placeholder).toBe('Projects');
    fireEvent.change(input, { target: { value: 'Work' } });
    expect(p.onReciprocalName).toHaveBeenCalledWith('Work');
    expect(screen.getByText(/A matching field is added to Tasks/)).toBeTruthy();
  });
});

describe('useCreateLink names the matching field', () => {
  beforeEach(() => {
    inserted.length = 0;
  });
  afterEach(cleanup);

  function run() {
    const qc = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    const wrapper = ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
    return renderHook(() => useCreateLink(), { wrapper }).result;
  }

  const base = { base_id: 'b', table_id: 't1', field_name: 'Tasks', target_table_id: 't2', relation_type: 'many_to_many' as const };

  it('uses the name given', async () => {
    const result = run();
    act(() => result.current.mutate({ ...base, reciprocal_name: ' Work ' }));
    await waitFor(() => expect(result.current.isSuccess || result.current.isError).toBe(true));
    expect(result.current.error).toBeNull();
    const fieldInserts = inserted.filter((i) => i.table === 'fields').map((i) => i.payload);
    expect(fieldInserts).toHaveLength(2);
    expect(fieldInserts[0].name).toBe('Tasks'); // the field you asked for, on this table
    expect(fieldInserts[1].name).toBe('Work'); // the matching field, on the other table
  });

  it('falls back to this table\'s name when none is given, as before', async () => {
    const result = run();
    act(() => result.current.mutate(base));
    await waitFor(() => expect(result.current.isSuccess || result.current.isError).toBe(true));
    const fieldInserts = inserted.filter((i) => i.table === 'fields').map((i) => i.payload);
    expect(fieldInserts[1].name).toBe('Projects');
  });

  it('a blank name also falls back', async () => {
    const result = run();
    act(() => result.current.mutate({ ...base, reciprocal_name: '   ' }));
    await waitFor(() => expect(result.current.isSuccess || result.current.isError).toBe(true));
    const fieldInserts = inserted.filter((i) => i.table === 'fields').map((i) => i.payload);
    expect(fieldInserts[1].name).toBe('Projects');
  });
});
