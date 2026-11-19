import type { TableField, TableRecordRow } from '@/queries/useTaskModule';
import { displayText, type NameLookups } from './fieldTypes';

// Column widths for the table grid.
//
// By default a column is as wide as its content needs, but never wider than
// half the table: short content shows in full, long content takes half and
// wraps. A width set by dragging the column's edge always wins.

export const MIN_COL = 80;
export const DEFAULT_MIN_COL = 120;
const CHAR_PX = 7;          // text-xs, roughly
const CELL_PAD = 28;        // cell padding + room for a link icon
const HEADER_PAD = 76;      // grip, type icon, sort mark and menu
const SAMPLE_ROWS = 200;

/** The widest a column gets on its own: half the table (never below a readable minimum). */
export const halfOf = (container: number) => Math.max(DEFAULT_MIN_COL * 2, Math.floor(container / 2));

/** A width that fits the content, between a readable minimum and half the table. */
export function autoWidth(field: TableField, rows: TableRecordRow[], names: NameLookups, container: number): number {
  const cap = halfOf(container);
  const header = field.name.length * (CHAR_PX + 0.5) + HEADER_PAD;
  if (field.type === 'checkbox') return Math.min(cap, Math.max(MIN_COL + 20, header));
  let longest = 0;
  const n = Math.min(rows.length, SAMPLE_ROWS);
  for (let i = 0; i < n; i++) {
    // The longest line counts: a wrapped paragraph is sized by the cap, not by its total length.
    const text = displayText(field, rows[i], names);
    const len = text.length > 80 ? text.length : Math.max(...text.split('\n').map((l) => l.length), 0);
    if (len > longest) longest = len;
  }
  const extra = field.type === 'person' || field.type === 'created_by' ? 26 : 0; // avatar
  const content = longest * CHAR_PX + CELL_PAD + extra;
  return Math.round(Math.min(cap, Math.max(DEFAULT_MIN_COL, header, content)));
}

export const clampWidth = (w: number, container: number) => Math.round(Math.min(Math.max(MIN_COL, w), Math.max(container, 600)));

/** The width a column is shown at: what was dragged to, else what its content needs. */
export function effectiveWidth(saved: number | undefined, auto: number, container: number): number {
  return typeof saved === 'number' && Number.isFinite(saved) ? clampWidth(saved, container) : auto;
}
