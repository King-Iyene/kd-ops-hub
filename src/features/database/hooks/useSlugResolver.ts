import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { isUuid, shortToUuid } from '../lib/shortId';

interface ResolvedIds {
  baseId: string | undefined;
  tableId: string | undefined;
  viewId: string | undefined;
}

function tryDecodeShortId(param: string): string | null {
  if (isUuid(param)) return null;
  if (param.length > 25) return null;
  const decoded = shortToUuid(param);
  return decoded !== param && isUuid(decoded) ? decoded : null;
}

async function resolveBaseParam(param: string): Promise<string | undefined> {
  if (isUuid(param)) return param;
  const decoded = tryDecodeShortId(param);
  if (decoded) return decoded;
  const { data } = await supabase
    .schema('nc_meta')
    .from('bases')
    .select('id')
    .eq('slug', param)
    .limit(1)
    .single();
  return data?.id;
}

async function resolveTableParam(baseId: string, param: string): Promise<string | undefined> {
  if (isUuid(param)) return param;
  const decoded = tryDecodeShortId(param);
  if (decoded) return decoded;
  const { data } = await supabase
    .schema('nc_meta')
    .from('tables')
    .select('id')
    .eq('base_id', baseId)
    .eq('slug', param)
    .limit(1)
    .single();
  return data?.id;
}

async function resolveViewParam(tableId: string, param: string): Promise<string | undefined> {
  if (isUuid(param)) return param;
  const decoded = tryDecodeShortId(param);
  if (decoded) return decoded;
  const { data } = await supabase
    .schema('nc_meta')
    .from('views')
    .select('id')
    .eq('table_id', tableId)
    .eq('slug', param)
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
    staleTime: 300_000,
    refetchOnWindowFocus: false,
    queryFn: async (): Promise<ResolvedIds> => {
      // Fast path: when all segments are UUIDs, skip all network calls
      const allUuids = (!rawBase || isUuid(rawBase)) &&
                       (!rawTable || isUuid(rawTable)) &&
                       (!rawView || isUuid(rawView));
      if (allUuids) {
        return {
          baseId: rawBase,
          tableId: rawTable,
          viewId: rawView,
        };
      }

      const baseId = rawBase ? await resolveBaseParam(rawBase) : undefined;
      if (!baseId) return { baseId: undefined, tableId: undefined, viewId: undefined };

      const tableId = rawTable ? await resolveTableParam(baseId, rawTable) : undefined;
      const viewId = rawView && tableId ? await resolveViewParam(tableId, rawView) : undefined;

      return { baseId, tableId, viewId };
    },
  });
}
