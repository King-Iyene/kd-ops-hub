import { render, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.setConfig({ testTimeout: 30000 });
vi.mock('next-themes', () => ({ useTheme: () => ({ resolvedTheme: 'light', theme: 'light' }) }));

import { LinkChips } from '../components/grid/LinkChips';
import { LinksCellRenderer } from '../components/grid/cell-renderers';
import { chipWidth, chipsThatFit, legacyLinkItems } from '../lib/linkBatch';

describe('chip fitting with a real text measurer', () => {
  // Pretend every character is exactly 7px wide.
  const measure = (text: string) => text.length * 7;

  it('uses the measurer instead of the average-width guess', () => {
    expect(chipWidth('Project Alpha', measure)).toBe(Math.ceil(13 * 7) + 18);
    expect(chipWidth('Project Alpha')).not.toBe(chipWidth('Project Alpha', measure));
  });

  it('shows whole chips, then leaves room for the +N badge', () => {
    const labels = ['Project Alpha', 'Project Gamma', 'Project Beta'];
    // Each chip is 109px; two need 109 + 4 + 109 = 222, plus the badge (34) while one is still hidden.
    expect(chipsThatFit(labels, 300, measure)).toBe(2);
    expect(chipsThatFit(labels, 150, measure)).toBe(1);
    expect(chipsThatFit(labels, 480, measure)).toBe(3);
  });

  it('a cell that is too narrow for even one chip still shows one', () => {
    expect(chipsThatFit(['Project Alpha', 'Project Gamma'], 60, measure)).toBe(1);
  });
});

describe('LinkChips', () => {
  afterEach(cleanup);
  const items = [
    { id: '1', label: 'Project Alpha' },
    { id: '2', label: 'Project Gamma' },
    { id: '3', label: 'Project Beta' },
  ];

  it('never squeezes chips when several are shown, and says how many are hidden', () => {
    // jsdom has no layout (width 0), so the cell is "too narrow": one chip and a +2 badge.
    const { container } = render(<LinkChips items={items} wrap={false} />);
    const chips = container.querySelectorAll('[data-link-chip]');
    expect(chips).toHaveLength(1);
    expect(chips[0].textContent).toBe('Project Alpha');
    const more = container.querySelector('[data-link-more]');
    expect(more?.textContent).toBe('+2');
    expect(more?.getAttribute('title')).toBe('Project Gamma, Project Beta');
  });

  it('a cell with room for everything shows no badge', () => {
    const { container } = render(<LinkChips items={items.slice(0, 1)} wrap={false} />);
    expect(container.querySelector('[data-link-more]')).toBeNull();
    expect(container.querySelectorAll('[data-link-chip]')).toHaveLength(1);
  });

  it('a taller row wraps the chips instead', () => {
    const { container } = render(<LinkChips items={items} wrap />);
    expect(container.querySelectorAll('[data-link-chip]')).toHaveLength(3);
    expect(container.querySelector('[data-link-more]')).toBeNull();
  });
});

describe('links stored as a list of ids or objects (the older link cell)', () => {
  afterEach(cleanup);

  it('resolves ids through the record lookup and falls back to the id', () => {
    const out = legacyLinkItems(['a', 'b', 'c'], { a: 'Alpha', b: 'Beta' });
    expect(out.map((i) => i.label)).toEqual(['Alpha', 'Beta', 'c']);
  });

  it('reads the name from objects', () => {
    const out = legacyLinkItems([{ id: 'x', title: 'Roadmap' }, { id: 'y', name: 'Launch' }]);
    expect(out.map((i) => i.label)).toEqual(['Roadmap', 'Launch']);
  });

  it('keeps every item distinct even when ids repeat', () => {
    const out = legacyLinkItems(['a', 'a']);
    expect(new Set(out.map((i) => i.id)).size).toBe(2);
  });

  it('is empty for anything that is not a list', () => {
    expect(legacyLinkItems(null)).toEqual([]);
    expect(legacyLinkItems('text')).toEqual([]);
  });

  it('renders through the shared chips, with a +N badge instead of cut names', () => {
    const { container } = render(
      <LinksCellRenderer
        value={['Project Alpha', 'Project Gamma', 'Project Beta']}
        field={{ id: 'f', options: {} } as never}
        record={{ id: 'r' } as never}
        rowHeight="short"
      />,
    );
    expect(container.querySelectorAll('[data-link-chip]')).toHaveLength(1);
    expect(container.querySelector('[data-link-more]')?.textContent).toBe('+2');
  });

  it('shows the add button when there are no links', () => {
    const { container } = render(
      <LinksCellRenderer value={[]} field={{ id: 'f', options: {} } as never} record={{ id: 'r' } as never} rowHeight="short" />,
    );
    expect(container.querySelector('[aria-label="Add linked record"]')).not.toBeNull();
  });
});
