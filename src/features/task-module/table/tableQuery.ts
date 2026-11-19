import type { TableField, TableFieldType, TableRecordRow } from '@/queries/useTaskModule';
import { asList, cellValue, displayText, type NameLookups } from './fieldTypes';

// Search, filter and sort for table rows. Pure, so it can be unit-tested.

export type RowFilterOp = 'contains' | 'not_contains' | 'any' | 'none' | 'empty' | 'not_empty' | 'checked' | 'unchecked';
export interface RowFilter { id: string; fieldId: string; op: RowFilterOp; text: string; values: string[] }

const PICK_TYPES: TableFieldType[] = ['single_select', 'multi_select', 'person', 'task', 'created_by'];

export function opsFor(type: TableFieldType): RowFilterOp[] {
  if (type === 'checkbox') return ['checked', 'unchecked'];
  if (PICK_TYPES.includes(type)) return ['any', 'none', 'empty', 'not_empty'];
  return ['contains', 'not_contains', 'empty', 'not_empty'];
}

export const OP_LABELS: Record<RowFilterOp, string> = {
  contains: 'contains', not_contains: 'does not contain', any: 'is any of', none: 'is none of',
  empty: 'is empty', not_empty: 'is not empty', checked: 'is ticked', unchecked: 'is not ticked',
};

/** Incomplete conditions (nothing typed or picked yet) are ignored. */
export function isRowFilterActive(f: RowFilter): boolean {
  if (f.op === 'contains' || f.op === 'not_contains') return f.text.trim().length > 0;
  if (f.op === 'any' || f.op === 'none') return f.values.length > 0;
  return true;
}

function isEmpty(v: unknown): boolean {
  return v == null || v === '' || v === false || (Array.isArray(v) && v.length === 0);
}

export function rowMatches(record: TableRecordRow, fields: TableField[], filters: RowFilter[], names: NameLookups): boolean {
  return filters.every((f) => {
    if (!isRowFilterActive(f)) return true;
    const field = fields.find((x) => x.id === f.fieldId);
    if (!field) return true;
    const v = cellValue(field, record);
    switch (f.op) {
      case 'empty': return isEmpty(v);
      case 'not_empty': return !isEmpty(v);
      case 'checked': return v === true;
      case 'unchecked': return v !== true;
      case 'any': return asList(v).some((x) => f.values.includes(x));
      case 'none': return !asList(v).some((x) => f.values.includes(x));
      case 'contains':
      case 'not_contains': {
        const hit = displayText(field, record, names).toLowerCase().includes(f.text.trim().toLowerCase());
        return f.op === 'contains' ? hit : !hit;
      }
      default: return true;
    }
  });
}

export function rowSearch(record: TableRecordRow, fields: TableField[], q: string, names: NameLookups): boolean {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  return fields.some((f) => displayText(f, record, names).toLowerCase().includes(needle));
}

export interface RowSort { fieldId: string; dir: 'asc' | 'desc' }

/** Empty cells always sort last, whichever the direction. */
export function sortRows(rows: TableRecordRow[], fields: TableField[], sort: RowSort | null, names: NameLookups): TableRecordRow[] {
  if (!sort) return rows;
  const field = fields.find((f) => f.id === sort.fieldId);
  if (!field) return rows;
  const flip = sort.dir === 'desc' ? -1 : 1;
  const numeric = ['number', 'currency', 'rating', 'auto_number'].includes(field.type);
  const iso = ['date', 'created_at', 'last_modified'].includes(field.type);
  return [...rows].sort((a, b) => {
    const va = cellValue(field, a);
    const vb = cellValue(field, b);
    if (isEmpty(va) || isEmpty(vb)) return isEmpty(va) === isEmpty(vb) ? 0 : isEmpty(va) ? 1 : -1;
    if (numeric) return flip * (Number(va) - Number(vb));
    if (iso) return flip * String(va).localeCompare(String(vb));
    if (field.type === 'checkbox') return 0;
    return flip * displayText(field, a, names).localeCompare(displayText(field, b, names), undefined, { sensitivity: 'base', numeric: true });
  });
}
