import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { FieldMeta } from '../types';

const EMPTY_LOOKUP: Record<string, string> = {};

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
        try {
          const { data: tableMeta } = await supabase
            .schema('nc_meta')
            .from('tables')
            .select('pg_table_name, primary_field_id')
            .eq('id', tableId)
            .single();
          if (!tableMeta?.primary_field_id) continue;

          const { data: primaryField } = await supabase
            .schema('nc_meta')
            .from('fields')
            .select('pg_column_name')
            .eq('id', tableMeta.primary_field_id)
            .single();
          if (!primaryField?.pg_column_name) continue;

          const { data: rows, error } = await supabase
            .schema(baseMeta.schema_name)
            .from(tableMeta.pg_table_name)
            .select(`id, ${primaryField.pg_column_name}`)
            .limit(5000);

          if (error || !rows) continue;

          for (const row of rows) {
            const displayVal = row[primaryField.pg_column_name];
            if (displayVal == null) continue;
            const label = String(displayVal);
            if (row.id) map[row.id] = label;
          }

          try {
            const { data: atRows } = await supabase
              .schema(baseMeta.schema_name)
              .from(tableMeta.pg_table_name)
              .select('id, airtable_id')
              .not('airtable_id', 'is', null)
              .limit(5000);
            if (atRows) {
              for (const row of atRows) {
                if (row.airtable_id && map[row.id]) {
                  map[row.airtable_id] = map[row.id];
                }
              }
            }
          } catch {
            // table may lack airtable_id column — id mapping is enough
          }
        } catch {
          // table may not exist or primary column may be missing
        }
      }

      return map;
    },
  });

  return lookupMap ?? EMPTY_LOOKUP;
}
