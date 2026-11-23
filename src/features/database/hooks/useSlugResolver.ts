import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import {
  idWithoutLookup,
  pickByParent,
  resolveParamsWithoutLookup,
  type ResolvedIds,
} from '../lib/slugParams';

// Each lookup below is "the row with this slug". A slug is only unique inside
// its parent, so when the parent is itself still being looked up the child
// query returns every row with that slug and pickByParent chooses the right one
// once the parent is known. That lets base, table and view be looked up at the
// same time instead of one after another.

async function lookupBaseBySlug(slug: string): Promise<string | undefined> {
  const { data } = await supabase
    .schema('nc_meta')
    .from('bases')
    .select('id')
    .eq('slug', slug)
    .limit(1)
    .single();
  return data?.id;
}

async function lookupTableBySlug(baseId: string | Promise<string | undefined>, slug: string): Promise<string | undefined> {
  if (typeof baseId === 'string') {
    const { data } = await supabase
      .schema('nc_meta')
      .from('tables')
      .select('id')
      .eq('base_id', baseId)
      .eq('slug', slug)
      .limit(1)
      .single();
    return data?.id;
  }
  const [{ data: rows }, resolvedBase] = await Promise.all([
    supabase.schema('nc_meta').from('tables').select('id, base_id').eq('slug', slug),
    baseId,
  ]);
  return pickByParent(rows as { id: string; base_id: string }[] | null, 'base_id', resolvedBase)?.id;
}

async function lookupViewBySlug(tableId: string | Promise<string | undefined>, slug: string): Promise<string | undefined> {
  if (typeof tableId === 'string') {
    const { data } = await supabase
      .schema('nc_meta')
      .from('views')
      .select('id')
      .eq('table_id', tableId)
      .eq('slug', slug)
      .limit(1)
      .single();
    return data?.id;
  }
  const [{ data: rows }, resolvedTable] = await Promise.all([
    supabase.schema('nc_meta').from('views').select('id, table_id').eq('slug', slug),
    tableId,
  ]);
  return pickByParent(rows as { id: string; table_id: string }[] | null, 'table_id', resolvedTable)?.id;
}

export function useSlugResolver(
  rawBase?: string,
  rawTable?: string,
  rawView?: string,
) {
  return useQuery<ResolvedIds>({
    queryKey: ['slug-resolve', rawBase, rawTable, rawView],
    enabled: !!rawBase,
    staleTime: 300_000,
    refetchOnWindowFocus: false,
    // An address made only of short ids needs no lookup at all. Giving the answer up front means the
    // page does not flash a spinner and the table can start loading in the very first render.
    initialData: () => resolveParamsWithoutLookup(rawBase, rawTable, rawView) ?? undefined,
    queryFn: async (): Promise<ResolvedIds> => {
      if (!rawBase) return { baseId: undefined, tableId: undefined, viewId: undefined };

      const baseDecoded = idWithoutLookup(rawBase);
      const basePromise: Promise<string | undefined> = baseDecoded
        ? Promise.resolve(baseDecoded)
        : lookupBaseBySlug(rawBase);

      let tablePromise: Promise<string | undefined> | undefined;
      if (rawTable) {
        const tableDecoded = idWithoutLookup(rawTable);
        tablePromise = tableDecoded
          ? Promise.resolve(tableDecoded)
          : lookupTableBySlug(baseDecoded ?? basePromise, rawTable);
      }

      let viewPromise: Promise<string | undefined> | undefined;
      if (rawView && tablePromise) {
        const viewDecoded = idWithoutLookup(rawView);
        if (viewDecoded) {
          viewPromise = Promise.resolve(viewDecoded);
        } else {
          const tableDecoded = rawTable ? idWithoutLookup(rawTable) : null;
          viewPromise = lookupViewBySlug(tableDecoded ?? tablePromise, rawView);
        }
      }

      const baseId = await basePromise;
      if (!baseId) {
        // Nothing found for the base: the other lookups were speculative, so let them finish quietly.
        tablePromise?.catch(() => {});
        viewPromise?.catch(() => {});
        return { baseId: undefined, tableId: undefined, viewId: undefined };
      }
      const tableId = tablePromise ? await tablePromise : undefined;
      const viewId = viewPromise && tableId ? await viewPromise : undefined;
      if (!tableId) viewPromise?.catch(() => {});
      return { baseId, tableId, viewId };
    },
  });
}
