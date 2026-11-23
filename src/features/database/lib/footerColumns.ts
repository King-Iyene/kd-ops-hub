import type { FieldMeta, UIType } from '../types';
import type { SummaryFunction } from './store';

/** Field types that hold numbers (and so get a Sum in the footer by default). */
export const NUMERIC_TYPES: UIType[] = ['Number', 'Decimal', 'Currency', 'Percent', 'Rating', 'Duration'];

/**
 * Types whose values are worked out in the browser (or from other tables) and
 * are not a plain column the footer could read for the whole table. Their
 * footer still covers only the loaded rows.
 */
const COMPUTED_TYPES: ReadonlySet<UIType> = new Set<UIType>([
  'Links',
  'Lookup',
  'Rollup',
  'Count',
  'Formula',
  'Button',
  'LinkedTasks',
]);

/** The summary a column shows until someone picks another. */
export function defaultSummary(uiType: UIType): SummaryFunction {
  if (NUMERIC_TYPES.includes(uiType)) return 'sum';
  if (uiType === 'Checkbox') return 'percentFilled';
  if (uiType === 'SingleSelect' || uiType === 'MultiSelect') return 'countFilled';
  return 'none';
}

/** The summary a field's footer cell is set to. */
export function summaryFor(
  field: Pick<FieldMeta, 'id' | 'ui_type'>,
  summaryFunctions: Record<string, SummaryFunction>,
): SummaryFunction {
  return summaryFunctions[field.id] ?? defaultSummary(field.ui_type);
}

export interface FooterPlan {
  /** True when at least one footer cell has a summary chosen, so the whole table is worth reading. */
  needed: boolean;
  /** Database columns to read: the stored columns that have a summary. Sorted so the same plan always gives the same key. */
  columns: string[];
  /** Fields whose footer can be totalled from the whole table. */
  fieldIds: Set<string>;
}

/** What to read from the whole table so the footer can be exact, given the visible fields and their summaries. */
export function footerPlan(
  fields: ReadonlyArray<Pick<FieldMeta, 'id' | 'ui_type' | 'pg_column_name'>>,
  summaryFunctions: Record<string, SummaryFunction>,
): FooterPlan {
  let wantsCount = false;
  const columns = new Set<string>();
  const fieldIds = new Set<string>();
  for (const field of fields) {
    const fn = summaryFor(field, summaryFunctions);
    if (fn === 'none') continue;
    if (fn === 'count') wantsCount = true;
    if (COMPUTED_TYPES.has(field.ui_type) || !field.pg_column_name) continue;
    columns.add(field.pg_column_name);
    fieldIds.add(field.id);
  }
  // Reading the whole table only pays off when it can total a stored column, or count the rows. A sum on a
  // formula column alone cannot be made exact this way, so it does not trigger the read.
  return { needed: columns.size > 0 || wantsCount, columns: [...columns].sort(), fieldIds };
}

/**
 * Apply a just-saved change to the footer's copy of the rows, so the totals move at once instead of after
 * the next read. Understands the variables of the record mutations: edit (one field or several), bulk edit,
 * delete and bulk delete. Anything else (a create has no id yet) leaves the rows as they are; the refresh
 * that follows every save picks those up.
 */
export function patchFooterRows<R extends { id: string }>(rows: readonly R[], variables: unknown): R[] {
  const v = (variables ?? {}) as {
    recordId?: unknown;
    recordIds?: unknown;
    updates?: unknown;
    field?: unknown;
    value?: unknown;
    fields?: unknown;
  };
  if (Array.isArray(v.updates)) {
    const byId = new Map((v.updates as Array<{ id: string; fields: Record<string, unknown> }>).map((u) => [u.id, u.fields]));
    return rows.map((r) => (byId.has(r.id) ? { ...r, ...byId.get(r.id) } : r));
  }
  if (Array.isArray(v.recordIds)) {
    const ids = new Set(v.recordIds as string[]);
    return rows.filter((r) => !ids.has(r.id));
  }
  if (typeof v.recordId === 'string') {
    const id = v.recordId;
    const changes =
      v.fields && typeof v.fields === 'object'
        ? (v.fields as Record<string, unknown>)
        : typeof v.field === 'string'
          ? { [v.field]: v.value }
          : null;
    return changes ? rows.map((r) => (r.id === id ? { ...r, ...changes } : r)) : rows.filter((r) => r.id !== id);
  }
  return rows.slice();
}
