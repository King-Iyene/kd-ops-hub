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
  let needed = false;
  const columns = new Set<string>();
  const fieldIds = new Set<string>();
  for (const field of fields) {
    if (summaryFor(field, summaryFunctions) === 'none') continue;
    needed = true;
    if (COMPUTED_TYPES.has(field.ui_type) || !field.pg_column_name) continue;
    columns.add(field.pg_column_name);
    fieldIds.add(field.id);
  }
  return { needed, columns: [...columns].sort(), fieldIds };
}
