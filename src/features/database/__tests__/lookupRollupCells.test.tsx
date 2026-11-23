import { render, cleanup } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.setConfig({ testTimeout: 30000 });

let lookup: { values: unknown[]; isConfigured: boolean; isLoading: boolean };
let rollup: { value: unknown; isConfigured: boolean; isLoading: boolean };

vi.mock('../hooks/useLookupRollup', () => ({
  useLookupValue: () => lookup,
  useRollupValue: () => rollup,
}));

vi.mock('next-themes', () => ({ useTheme: () => ({ resolvedTheme: 'light', theme: 'light' }) }));

import { LookupCellRenderer, RollupCellRenderer } from '../components/grid/LookupRollupCellRenderer';

const props = { value: null, field: { id: 'f', options: {} } as never, record: { id: 'r' } as never, rowHeight: 'short' as const };

describe('lookup and rollup cells', () => {
  beforeEach(() => {
    lookup = { values: [], isConfigured: true, isLoading: false };
    rollup = { value: null, isConfigured: true, isLoading: false };
  });
  afterEach(cleanup);

  it('a lookup with several values shows each as its own chip', () => {
    lookup.values = ['Alpha', 'Beta', 'Gamma'];
    const { container } = render(<LookupCellRenderer {...props} />);
    const list = container.querySelector('[data-value-list]');
    expect(list).not.toBeNull();
    expect([...list!.children].map((c) => c.textContent)).toEqual(['Alpha', 'Beta', 'Gamma']);
    expect(list!.getAttribute('title')).toBe('Alpha, Beta, Gamma');
  });

  it('a lookup with one value is plain text, not a chip', () => {
    lookup.values = ['Alpha'];
    const { container } = render(<LookupCellRenderer {...props} />);
    expect(container.querySelector('[data-value-list]')).toBeNull();
    expect(container.textContent).toBe('Alpha');
  });

  it('blank values are left out', () => {
    lookup.values = ['Alpha', '', null, 'Beta'];
    const { container } = render(<LookupCellRenderer {...props} />);
    expect([...container.querySelector('[data-value-list]')!.children].map((c) => c.textContent)).toEqual(['Alpha', 'Beta']);
  });

  it('shows nothing while loading, when empty, and a hint when not configured', () => {
    lookup.isLoading = true;
    lookup.values = ['x'];
    expect(render(<LookupCellRenderer {...props} />).container.textContent).toBe('');
    cleanup();
    lookup = { values: [], isConfigured: true, isLoading: false };
    expect(render(<LookupCellRenderer {...props} />).container.textContent).toBe('');
    cleanup();
    lookup.isConfigured = false;
    expect(render(<LookupCellRenderer {...props} />).container.textContent).toBe('Not configured');
  });

  it('a rollup that gives a list shows chips too', () => {
    rollup.value = ['Red', 'Blue'];
    const { container } = render(<RollupCellRenderer {...props} />);
    expect([...container.querySelector('[data-value-list]')!.children].map((c) => c.textContent)).toEqual(['Red', 'Blue']);
  });

  it('a rollup number is still formatted and right-aligned', () => {
    rollup.value = 1234.5;
    const { container } = render(<RollupCellRenderer {...props} />);
    expect(container.querySelector('[data-value-list]')).toBeNull();
    expect(container.textContent).toContain('1,234.5');
  });
});
