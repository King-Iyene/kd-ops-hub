import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { isUuid } from '../lib/shortId';

interface ResolvedIds {
  baseId: string | undefined;
  tableId: string | undefined;
  viewId: string | undefined;
}

async function resolveBaseSlug(slug: string): Promise<string | undefined> {
  if (isUuid(slug)) return slug;
  const { data } = await supabase
    .schema('nc_meta')
    .from('bases')
    .select('id')
    .eq('slug', slug)
    .limit(1)
    .single();
  return data?.id;
}

async function resolveTableSlug(baseId: string, slug: string): Promise<string | undefined> {
  if (isUuid(slug)) return slug;
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

async function resolveViewSlug(tableId: string, slug: string): Promise<string | undefined> {
  if (isUuid(slug)) return slug;
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

export function useSlugResolver(
  rawBase?: string,
  rawTable?: string,
  rawView?: string,
) {
  return useQuery<ResolvedIds>({
    queryKey: ['slug-resolve', rawBase, rawTable, rawView],
    enabled: !!rawBase,
    staleTime: 60_000,
    queryFn: async (): Promise<ResolvedIds> => {
      const baseId = rawBase ? await resolveBaseSlug(rawBase) : undefined;
      if (!baseId) return { baseId: undefined, tableId: undefined, viewId: undefined };

      const tableId = rawTable ? await resolveTableSlug(baseId, rawTable) : undefined;
      const viewId = rawView && tableId ? await resolveViewSlug(tableId, rawView) : undefined;

      return { baseId, tableId, viewId };
    },
  });
}
