import { supabase } from '@/lib/supabase';
import { resolveTableContext } from '../hooks/tableBootstrap';

/**
 * How many records use a select option, so removing it can say what it touches. Single selects hold the option
 * text; multi selects hold a list (or, in older imports, text). Returns null when it cannot be counted, in
 * which case the caller should not claim a number.
 */
export async function countOptionUsage(
  baseId: string,
  tableId: string,
  column: string,
  uiType: string,
  title: string,
): Promise<number | null> {
  try {
    const ctx = await resolveTableContext(baseId, tableId);
    const base = () => supabase.schema(ctx.schemaName).from(ctx.tableName).select('id', { count: 'exact', head: true });

    if (uiType !== 'MultiSelect') {
      const { count, error } = await base().eq(column, title);
      return error ? null : count ?? 0;
    }

    // A list column: the value is in the list.
    const asList = await base().contains(column, [title]);
    if (!asList.error) return asList.count ?? 0;

    // A text column (older imports): count the text that contains it. This can over-count, so it is reported as is.
    const escaped = title.replace(/[\\%_]/g, (c) => `\\${c}`);
    const asText = await base().ilike(column, `%${escaped}%`);
    return asText.error ? null : asText.count ?? 0;
  } catch {
    return null;
  }
}

/** The sentence shown before an option is removed from a field. */
export function describeOptionRemoval(title: string, count: number): string {
  const records = `${count.toLocaleString()} record${count === 1 ? '' : 's'}`;
  return `"${title}" is used by ${records}. Those records keep the text, but it will no longer be one of the options. Remove it?`;
}
