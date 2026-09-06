import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { FieldMeta } from '../types';

/**
 * For each Links field in the current table, fetch a lookup map of
 * airtable_id → primary-field display value from the related table.
 * Used to resolve raw Airtable ID arrays stored in link columns
 * before formula evaluation.
 */
export function useLinkDisplayLookup(
  baseId: string | null | undefined,
  fields: FieldMeta[] | undefined,
) {
  const linkFields = useMemo(
    () => (fields ?? []).filter((f) => f.ui_type === 'Links' && f.options?.relatedTableId),
    [fields],
  );

  const relatedTableIds = useMemo(
    () => [...new Set(linkFields.map((f) => f.options.relatedTableId as string))],
    [linkFields],
  );

  const { data: lookupMap } = useQuery({
    queryKey: ['nc', 'link-display-lookup', baseId, relatedTableIds.join(',')],
    enabled: !!baseId && relatedTableIds.length > 0,
    staleTime: 60_000,
    gcTime: 5 * 60_000,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const map: Record<string, string> = {};

      const { data: baseMeta } = await supabase
        .schema('nc_meta')
        .from('bases')
        .select('schema_name')
        .eq('id', baseId)
        .single();
      if (!baseMeta?.schema_name) return map;

      for (const tableId of relatedTableIds) {
        const { data: tableMeta } = await supabase
          .schema('nc_meta')
          .from('tables')
          .select('pg_table_name, primary_field_id')
          .eq('id', tableId)
          .single();
        if (!tableMeta) continue;

        const { data: primaryField } = await supabase
          .schema('nc_meta')
          .from('fields')
          .select('pg_column_name')
          .eq('id', tableMeta.primary_field_id)
          .single();
        if (!primaryField?.pg_column_name) continue;

        const { data: rows } = await supabase
          .schema(baseMeta.schema_name)
          .from(tableMeta.pg_table_name)
          .select(`airtable_id, ${primaryField.pg_column_name}`)
          .not('airtable_id', 'is', null)
          .limit(5000);

        if (rows) {
          for (const row of rows) {
            if (row.airtable_id && row[primaryField.pg_column_name] != null) {
              map[row.airtable_id] = String(row[primaryField.pg_column_name]);
            }
          }
        }
      }

      return map;
    },
  });

  return lookupMap ?? {};
}
