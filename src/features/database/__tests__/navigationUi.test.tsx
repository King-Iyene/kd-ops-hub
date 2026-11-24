import { useState } from 'react';
import { cleanup, fireEvent, render, renderHook, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  state: { activeBaseId: 'b1', activeTableId: 't1', activeViewId: null as string | null, sidebarOpen: true, sidebarCollapsed: false, sidebarWidth: 260 } as Record<string, unknown>,
  navigateToTable: vi.fn(),
  navigateToBase: vi.fn(),
  navigateToView: vi.fn(),
  navigateTo: vi.fn(),
  toggleSidebar: vi.fn(),
}));

vi.mock('../lib/store', () => ({
  useDatabaseUI: (selector?: (s: Record<string, unknown>) => unknown) => {
    const s = { ...h.state, toggleSidebar: h.toggleSidebar, toggleSidebarCollapsed: vi.fn(), setSidebarWidth: vi.fn() };
    return selector ? selector(s) : s;
  },
}));
vi.mock('../hooks/useNavigate', () => ({
  toShort: (id: string) => id,
  useDatabaseNavigate: () => ({
    navigateToTable: h.navigateToTable,
    navigateToBase: h.navigateToBase,
    navigateToView: h.navigateToView,
    navigateTo: h.navigateTo,
  }),
}));

const bases = [
  { id: 'b1', name: 'KDS Finances', icon: null, color: '#2D7FF9', position: 0 },
  { id: 'b2', name: 'People', icon: null, color: '#0D9488', position: 1 },
];
const mkTable = (id: string, name: string, position: number) => ({ id, base_id: 'b1', name, icon: null, position });
const tables = [
  mkTable('t1', 'Expenses', 0),
  mkTable('t2', 'Income', 1),
  mkTable('t3', 'Expenses copy', 2),
  mkTable('t4', 'Planner WIP', 3),
  mkTable('t5', 'Budget', 4),
];
const views = [
  { id: 'v1', table_id: 't1', name: 'All expenses', type: 'grid', position: 0 },
  { id: 'v2', table_id: 't1', name: 'By month', type: 'kanban', position: 1 },
];

vi.mock('../hooks/useBases', () => ({ useBases: () => ({ data: bases }) }));
vi.mock('../hooks/useTables', () => ({ useTables: () => ({ data: tables }) }));
vi.mock('../hooks/useViews', () => ({ useViews: () => ({ data: views }) }));
// Hover prefetch needs a QueryClient; these tests are about the lists, not about prefetching.
vi.mock('../hooks/usePrefetchTable', () => ({
  usePrefetchTable: () => ({ handlersFor: () => ({}), schedule: () => {}, cancel: () => {} }),
}));
vi.mock('../hooks', () => ({
  useBases: () => ({ data: bases }),
  useDeleteBase: () => ({ mutate: vi.fn() }),
  useUpdateBase: () => ({ mutate: vi.fn() }),
  useDuplicateBase: () => ({ mutate: vi.fn() }),
}));
vi.mock('../components/CreateTableDialog', () => ({ CreateTableDialog: () => null }));
vi.mock('../components/CreateBaseDialog', () => ({ CreateBaseDialog: () => null }));
vi.mock('../components/EmojiPicker', () => ({ EmojiPicker: () => null }));
vi.mock('@/hooks/use-confirm', () => ({ confirm: vi.fn() }));

import { CommandPalette } from '../components/CommandPalette';
import { AllTablesPopover } from '../components/AllTablesPopover';
import { DatabaseSidebar } from '../components/DatabaseSidebar';
import { useGlobalShortcuts } from '../components/useGlobalShortcuts';
import type { TableMeta } from '../types';

// The first render of the palette pulls in Radix and cmdk; on a busy machine that can pass the 5 s default.
vi.setConfig({ testTimeout: 20000 });

beforeAll(() => {
  // cmdk and Radix expect these browser APIs; jsdom does not ship them.
  class RO {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = RO;
  Element.prototype.scrollIntoView = vi.fn();
  Element.prototype.hasPointerCapture = vi.fn(() => false);
  Element.prototype.releasePointerCapture = vi.fn();
});

beforeEach(() => {
  localStorage.clear();
  h.state.activeBaseId = 'b1';
  h.state.activeTableId = 't1';
  h.state.activeViewId = null;
  h.navigateToTable.mockReset();
  h.navigateToBase.mockReset();
  h.navigateToView.mockReset();
  h.navigateTo.mockReset();
});
afterEach(() => cleanup());

function openPalette(onOpenChange = vi.fn()) {
  const onSearchRecords = vi.fn();
  const onBrowseTables = vi.fn();
  render(<CommandPalette open onOpenChange={onOpenChange} onSearchRecords={onSearchRecords} onBrowseTables={onBrowseTables} />);
  return { onOpenChange, onSearchRecords, onBrowseTables };
}

describe('command palette', () => {
  it('lists tables, views, bases and actions in headed groups, without hidden copies', () => {
    openPalette();
    expect(screen.getByText('Tables in KDS Finances')).toBeInTheDocument();
    expect(screen.getByText('Views')).toBeInTheDocument();
    expect(screen.getByText('Bases')).toBeInTheDocument();
    expect(screen.getByText('Actions')).toBeInTheDocument();
    expect(screen.getByText('Income')).toBeInTheDocument();
    expect(screen.getByText('All expenses')).toBeInTheDocument();
    expect(screen.getByText('People')).toBeInTheDocument();
    expect(screen.queryByText('Planner WIP')).not.toBeInTheDocument();
    expect(screen.queryByText('Expenses copy')).not.toBeInTheDocument();
    expect(screen.getByText('Show hidden tables (2)')).toBeInTheDocument();
    expect(screen.getByText('Create table')).toBeInTheDocument();
    expect(screen.getByText('Create base')).toBeInTheDocument();
    expect(screen.getByText('Toggle sidebar')).toBeInTheDocument();
    expect(screen.getByText('Open API docs')).toBeInTheDocument();
  });

  it('filters as you type and opens the best match on Enter', () => {
    const { onOpenChange } = openPalette();
    const input = screen.getByRole('combobox');
    fireEvent.change(input, { target: { value: 'inc' } });
    expect(screen.getAllByRole('option')[0]).toHaveTextContent('Income');
    expect(screen.queryByText('Budget')).not.toBeInTheDocument();
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(h.navigateToTable).toHaveBeenCalledWith('t2');
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('jumps to a base and to a view', () => {
    openPalette();
    fireEvent.click(screen.getByText('People'));
    expect(h.navigateToBase).toHaveBeenCalledWith('b2');
    cleanup();
    openPalette();
    fireEvent.click(screen.getByText('By month'));
    expect(h.navigateToView).toHaveBeenCalledWith('v2');
  });

  it('shows an empty state with a record search offer when nothing matches', () => {
    openPalette();
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'qqzzx' } });
    expect(screen.getByText('Nothing matches "qqzzx"')).toBeInTheDocument();
    expect(screen.getByText(/Search records for "qqzzx"/)).toBeInTheDocument();
  });

  it('shows the last visited items first when nothing is typed', () => {
    localStorage.setItem(
      'kd-ops:db-recents',
      JSON.stringify([
        { kind: 'table', id: 't5', label: 'Budget', baseId: 'b1', tableId: 't5' },
        { kind: 'base', id: 'b2', label: 'People', baseId: 'b2' },
        { kind: 'table', id: 'gone', label: 'Deleted table', baseId: 'b1', tableId: 'gone' },
      ]),
    );
    openPalette();
    expect(screen.getByText('Recent')).toBeInTheDocument();
    const recent = screen.getByText('Recent').closest('[cmdk-group]') as HTMLElement;
    expect(within(recent).getByText('Budget')).toBeInTheDocument();
    expect(within(recent).queryByText('Deleted table')).not.toBeInTheDocument();
    fireEvent.click(within(recent).getByText('People'));
    expect(h.navigateToBase).toHaveBeenCalledWith('b2');
  });

  it('shows hidden tables once the toggle is on, and the open table is always listed', () => {
    localStorage.setItem('kd-ops:db-show-hidden-tables', '1');
    openPalette();
    expect(screen.getByText('Planner WIP')).toBeInTheDocument();
    expect(screen.getByText('Expenses copy')).toBeInTheDocument();
    cleanup();
    localStorage.clear();
    h.state.activeTableId = 't3';
    openPalette();
    expect(screen.getByText('Expenses copy')).toBeInTheDocument();
    expect(screen.queryByText('Planner WIP')).not.toBeInTheDocument();
  });
});

describe('command palette, opened from the keyboard', () => {
  function Harness() {
    const [open, setOpen] = useState(false);
    useGlobalShortcuts({ onOpenShortcuts: vi.fn(), onTogglePalette: () => setOpen((v) => !v) });
    return <CommandPalette open={open} onOpenChange={setOpen} onSearchRecords={vi.fn()} onBrowseTables={vi.fn()} />;
  }

  it('opens with Ctrl+K, filters by typing, goes with Enter and closes with Esc', async () => {
    render(<Harness />);
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
    const input = await screen.findByRole('combobox');
    expect(input).toBeInTheDocument();

    fireEvent.change(input, { target: { value: 'bud' } });
    expect(screen.getAllByRole('option')[0]).toHaveTextContent('Budget');
    expect(screen.queryByText('Income')).not.toBeInTheDocument();

    fireEvent.keyDown(input, { key: 'Enter' });
    expect(h.navigateToTable).toHaveBeenCalledWith('t5');
    await waitFor(() => expect(screen.queryByRole('combobox')).not.toBeInTheDocument());

    // Reopen: the search starts empty again. Esc closes without navigating.
    h.navigateToTable.mockReset();
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
    const again = await screen.findByRole('combobox');
    expect((again as HTMLInputElement).value).toBe('');
    fireEvent.keyDown(again, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('combobox')).not.toBeInTheDocument());
    expect(h.navigateToTable).not.toHaveBeenCalled();
  });

  it('Ctrl+K again closes it', async () => {
    render(<Harness />);
    fireEvent.keyDown(window, { key: 'k', metaKey: true });
    await screen.findByRole('combobox');
    fireEvent.keyDown(window, { key: 'k', metaKey: true });
    await waitFor(() => expect(screen.queryByRole('combobox')).not.toBeInTheDocument());
  });
});

describe('all tables popover', () => {
  const allTables = tables as unknown as TableMeta[];
  const renderPopover = (extra: Partial<React.ComponentProps<typeof AllTablesPopover>> = {}) =>
    render(
      <AllTablesPopover
        open
        onOpenChange={vi.fn()}
        tables={allTables}
        activeTableId="t1"
        pinnedIds={[]}
        manualHidden={new Set()}
        hiddenCount={2}
        showHidden={false}
        onShowHiddenChange={vi.fn()}
        onSelect={vi.fn()}
        onUnhide={vi.fn()}
        {...extra}
      />,
    );

  it('lists every table, marks the open one and the hidden ones', () => {
    renderPopover();
    expect(screen.getByText('All tables (5)')).toBeInTheDocument();
    expect(screen.getByText('Planner WIP')).toBeInTheDocument();
    expect(screen.getAllByText('Hidden')).toHaveLength(2);
    const active = document.querySelector('[data-active-table="true"]');
    expect(active?.textContent).toContain('Expenses');
    expect(active).toHaveAttribute('aria-current', 'true');
  });

  it('searches and selects with Enter', () => {
    const onSelect = vi.fn();
    renderPopover({ onSelect });
    const input = screen.getByRole('combobox');
    fireEvent.change(input, { target: { value: 'bud' } });
    expect(screen.queryByText('Income')).not.toBeInTheDocument();
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onSelect).toHaveBeenCalledWith('t5');
  });

  it('has a switch for hidden tables with the count', () => {
    const onShowHiddenChange = vi.fn();
    renderPopover({ onShowHiddenChange });
    const toggle = screen.getByRole('switch');
    expect(toggle).toHaveTextContent('Show hidden tables (2)');
    fireEvent.click(toggle);
    expect(onShowHiddenChange).toHaveBeenCalledWith(true);
  });
});

describe('sidebar table list', () => {
  const rowNames = () => Array.from(document.querySelectorAll('[data-table-row]')).map((el) => el.getAttribute('title'));

  it('hides copies by default, offers to show them, and keeps the open table', () => {
    render(<DatabaseSidebar />);
    expect(rowNames()).toEqual(['Expenses', 'Income', 'Budget']);
    fireEvent.click(screen.getByText('Show hidden tables (2)'));
    expect(rowNames()).toEqual(['Expenses', 'Income', 'Expenses copy', 'Planner WIP', 'Budget']);
    expect(screen.getByText('Hide hidden tables (2)')).toBeInTheDocument();
  });

  it('puts pinned tables first and remembers them per base', () => {
    render(<DatabaseSidebar />);
    fireEvent.click(screen.getByLabelText('Pin Budget'));
    expect(rowNames()).toEqual(['Budget', 'Expenses', 'Income']);
    expect(screen.getByText('Pinned')).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem('kd-ops:db-pinned-tables:b1') ?? '[]')).toEqual(['t5']);
  });

  it('moves between rows with the arrow keys and opens one with Enter', () => {
    render(<DatabaseSidebar />);
    const rows = Array.from(document.querySelectorAll<HTMLElement>('[data-table-row]'));
    rows[0].focus();
    fireEvent.keyDown(rows[0], { key: 'ArrowDown' });
    expect(document.activeElement).toBe(rows[1]);
    fireEvent.keyDown(rows[1], { key: 'ArrowDown' });
    expect(document.activeElement).toBe(rows[2]);
    fireEvent.keyDown(rows[2], { key: 'ArrowUp' });
    expect(document.activeElement).toBe(rows[1]);
    fireEvent.click(rows[1]);
    expect(h.navigateToTable).toHaveBeenCalledWith('t2');
  });

  it('writes nothing to storage just by showing', () => {
    render(<DatabaseSidebar />);
    expect(localStorage.length).toBe(0);
  });
});

describe('global shortcuts', () => {
  it('Ctrl+K and Cmd+K toggle the palette, Ctrl+J the table switcher', () => {
    const onTogglePalette = vi.fn();
    const onToggleTables = vi.fn();
    renderHook(() => useGlobalShortcuts({ onOpenShortcuts: vi.fn(), onTogglePalette, onToggleTables }));
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
    fireEvent.keyDown(window, { key: 'K', metaKey: true });
    expect(onTogglePalette).toHaveBeenCalledTimes(2);
    fireEvent.keyDown(window, { key: 'j', ctrlKey: true });
    expect(onToggleTables).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(window, { key: 'k' });
    expect(onTogglePalette).toHaveBeenCalledTimes(2);
  });
});
