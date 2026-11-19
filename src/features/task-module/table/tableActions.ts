import type { TableField, TableRecordRow } from '@/queries/useTaskModule';
import { csvCell, displayText, type NameLookups } from './fieldTypes';

/** The shareable address of a table form. */
export const formLink = (token: string) => `${window.location.origin}/tf/${token}`;

// ── Export ──────────────────────────────────────────────────────────────

export function exportCsv(name: string, fields: TableField[], rows: TableRecordRow[], names: NameLookups) {
  const lines = [
    fields.map((f) => csvCell(f.name)).join(','),
    ...rows.map((r) => fields.map((f) => csvCell(displayText(f, r, names))).join(',')),
  ];
  // BOM so Excel reads ₦ and other non-ASCII text correctly.
  const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${name.replace(/[^\w -]+/g, '').trim() || 'table'}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
