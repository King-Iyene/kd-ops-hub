import { render, cleanup, fireEvent } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.setConfig({ testTimeout: 30000 });
vi.mock('next-themes', () => ({ useTheme: () => ({ resolvedTheme: 'light', theme: 'light' }) }));

import { LinkChips } from '../components/grid/LinkChips';
import { LinksCellRenderer } from '../components/grid/cell-renderers';
import { chipWidth, chipsThatFit, chipsThatFitLines, legacyLinkItems, linesForRowHeight } from '../lib/linkBatch';

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

describe('chips over several lines', () => {
  const measure = (text: string) => text.length * 7; // 7px a character: "Project Alpha" chip = 109px
  const names = ['Jessica: GHL Management', 'Sam Lotus: GHL Management', 'Jeremy: System Builds', 'Extendly & HL Pro', 'Product Development'];

  it('row heights give the lines they can show', () => {
    expect(linesForRowHeight('short')).toBe(1);
    expect(linesForRowHeight('medium')).toBe(2);
    expect(linesForRowHeight('tall')).toBe(2);
    expect(linesForRowHeight('extra-tall')).toBe(4);
  });

  it('puts whole chips on each line and counts the rest, never a half chip', () => {
    const labels = ['Project Alpha', 'Project Beta', 'Project Gamma', 'Project Delta', 'Project Epsilon'];
    // 200px wide: one chip per line (two do not fit), so two lines hold two chips, then "+3".
    expect(chipsThatFitLines(labels, 200, 2, measure)).toBe(2);
    // 260px: line 1 holds Alpha and Beta (215px); line 2 holds Gamma and Delta with room left for the badge (256px). Epsilon does not fit.
    expect(chipsThatFitLines(labels, 260, 2, measure)).toBe(4);
    // Plenty of room: everything fits and no badge is needed.
    expect(chipsThatFitLines(labels, 1000, 2, measure)).toBe(5);
  });

  it('shows everything when it fits the lines, with no room reserved for a badge it will not need', () => {
    expect(chipsThatFitLines(['A', 'B', 'C'], 200, 2, measure)).toBe(3);
  });

  it('long names in a tall cell: whole names, then the count', () => {
    const fit = chipsThatFitLines(names, 180, 2, measure);
    expect(fit).toBeGreaterThanOrEqual(1);
    expect(fit).toBeLessThan(names.length);
  });

  it('a name wider than the cell is cut to the cell, not allowed to overflow', () => {
    expect(chipsThatFitLines(['x'.repeat(100)], 80, 2, measure)).toBe(1);
  });

  it('one line behaves like the single-line fit, and an empty cell shows nothing', () => {
    expect(chipsThatFitLines(names, 300, 1, measure)).toBe(chipsThatFit(names, 300, measure));
    expect(chipsThatFitLines([], 300, 2, measure)).toBe(0);
  });

  it('always shows at least one chip, even in a very narrow cell', () => {
    expect(chipsThatFitLines(names, 20, 2, measure)).toBe(1);
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

  it('a taller row wraps the chips, and still says how many are hidden', () => {
    // No layout in jsdom (width 0), so the row is "too narrow": one whole chip and a badge, never a cut-off chip.
    const { container } = render(<LinkChips items={items} wrap lines={2} />);
    expect(container.querySelectorAll('[data-link-chip]')).toHaveLength(1);
    expect(container.querySelector('[data-link-more]')?.textContent).toBe('+2');
  });
});

describe('clicking a link cell', () => {
  afterEach(cleanup);

  it('a click on a chip or the +N goes to the chip handler and stays out of the cell', () => {
    const onChipClick = vi.fn();
    const onCell = vi.fn();
    const { container } = render(
      <div onClick={onCell}>
        <LinkChips items={[{ id: '1', label: 'Project Alpha' }, { id: '2', label: 'Project Beta' }]} wrap={false} onChipClick={onChipClick} />
      </div>,
    );
    fireEvent.click(container.querySelector('[data-link-chip]')!);
    expect(onChipClick).toHaveBeenCalledTimes(1);
    fireEvent.click(container.querySelector('[data-link-more]')!);
    expect(onChipClick).toHaveBeenCalledTimes(2);
    expect(onCell).not.toHaveBeenCalled();
  });

  it('a click on blank space in the cell still reaches the cell (to select it or edit it)', () => {
    const onChipClick = vi.fn();
    const onCell = vi.fn();
    const { container } = render(
      <div onClick={onCell}>
        <LinkChips items={[{ id: '1', label: 'Project Alpha' }]} wrap={false} onChipClick={onChipClick} />
      </div>,
    );
    fireEvent.click(container.querySelector('[title="Project Alpha"]')!);
    expect(onCell).toHaveBeenCalledTimes(1);
    expect(onChipClick).not.toHaveBeenCalled();
  });

  it('chips without a handler do not look clickable and do not stop the click', () => {
    const onCell = vi.fn();
    const { container } = render(
      <div onClick={onCell}>
        <LinkChips items={[{ id: '1', label: 'Project Alpha' }]} wrap={false} />
      </div>,
    );
    const chip = container.querySelector('[data-link-chip]')!;
    expect(chip.className).not.toContain('cursor-pointer');
    fireEvent.click(chip);
    expect(onCell).toHaveBeenCalledTimes(1);
  });

  it('in the older link cell, a chip opens the row and blank space does not', () => {
    const opened = vi.fn();
    window.addEventListener('grid:expand-row', opened);
    const { container } = render(
      <LinksCellRenderer value={['Project Alpha']} field={{ id: 'f', options: {} } as never} record={{ id: 'r' } as never} rowHeight="short" />,
    );
    fireEvent.click(container.querySelector('[data-link-chip]')!);
    expect(opened).toHaveBeenCalledTimes(1);
    fireEvent.click(container.firstElementChild!);
    expect(opened).toHaveBeenCalledTimes(1);
    window.removeEventListener('grid:expand-row', opened);
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

describe('a link to a known table opens the picker in the cell', () => {
  afterEach(cleanup);

  it('wraps the chips in the picker trigger instead of opening the whole record', () => {
    const opened = vi.fn();
    window.addEventListener('grid:expand-row', opened);
    const { container } = render(
      <LinksCellRenderer
        value={['Project Alpha']}
        field={{ id: 'f', name: 'Projects', options: { relatedTableId: 't2' } } as never}
        record={{ id: 'r' } as never}
        rowHeight="short"
      />,
    );
    const trigger = container.querySelector('[aria-label="Edit Projects"]');
    expect(trigger).not.toBeNull();
    expect(trigger!.querySelector('[data-link-chip]')).not.toBeNull();
    // The trigger is the picker's, so a click opens the list rather than the record panel.
    expect(trigger!.getAttribute('aria-haspopup')).toBe('dialog');
    expect(opened).not.toHaveBeenCalled();
    window.removeEventListener('grid:expand-row', opened);
  });

  it('an empty cell still offers the picker', () => {
    const { container } = render(
      <LinksCellRenderer
        value={[]}
        field={{ id: 'f', name: 'Projects', options: { relatedTableId: 't2' } } as never}
        record={{ id: 'r' } as never}
        rowHeight="short"
      />,
    );
    expect(container.querySelector('[aria-label="Edit Projects"]')).not.toBeNull();
  });
});

describe('names still being fetched', () => {
  it('never shows a raw record id as a chip label', () => {
    const out = legacyLinkItems(['recN6nUEz1qR9m5WJ', 'a1b2c3d4-0000-4000-8000-000000000000', 'plain text']);
    expect(out.map((i) => i.label)).toEqual(['…', '…', 'plain text']);
  });

  it('uses the name as soon as the lookup has it', () => {
    const out = legacyLinkItems(['recN6nUEz1qR9m5WJ'], { recN6nUEz1qR9m5WJ: 'March 2026 — Gift' });
    expect(out[0].label).toBe('March 2026 — Gift');
  });

  it('an object with no name does not fall back to its id either', () => {
    expect(legacyLinkItems([{ id: 'recN6nUEz1qR9m5WJ' }])[0].label).toBe('…');
  });
});
