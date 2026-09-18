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

      // Batch-fetch all table metadata in parallel
      const tableResults = await Promise.all(
        relatedTableIds.map(async (tableId) => {
          try {
            const { data: tableMeta } = await supabase
              .schema('nc_meta')
              .from('tables')
              .select('pg_table_name, primary_field_id')
              .eq('id', tableId)
              .single();
            if (!tableMeta?.primary_field_id) return null;

            const { data: primaryField } = await supabase
              .schema('nc_meta')
              .from('fields')
              .select('pg_column_name')
              .eq('id', tableMeta.primary_field_id)
              .single();
            if (!primaryField?.pg_column_name) return null;

            return { tableId, pgTable: tableMeta.pg_table_name, pgColumn: primaryField.pg_column_name };
          } catch {
            return null;
          }
        }),
      );

      const validTables = tableResults.filter(Boolean) as { tableId: string; pgTable: string; pgColumn: string }[];

      // Fetch display values from all tables in parallel
      await Promise.all(
        validTables.map(async ({ tableId, pgTable, pgColumn }) => {
          try {
            const { data: rows } = await supabase
              .schema(baseMeta.schema_name)
              .from(pgTable)
              .select(`id, ${pgColumn}`)
              .limit(5000);

            if (!rows) return;
            for (const row of rows) {
              const displayVal = row[pgColumn];
              if (displayVal == null) continue;
              let label: string;
              if (typeof displayVal === 'object' && displayVal !== null) {
                label = displayVal.value ?? displayVal.title ?? displayVal.name ?? displayVal.label ?? String(displayVal);
              } else {
                label = String(displayVal);
              }
              if (row.id) map[row.id] = label;
            }

            // Also resolve airtable_id mappings (only if column exists)
            const { count: atColCount } = await supabase
              .schema('nc_meta')
              .from('fields')
              .select('id', { count: 'exact', head: true })
              .eq('table_id', tableId)
              .eq('pg_column_name', 'airtable_id');
            if (atColCount && atColCount > 0) {
              try {
                const { data: atRows } = await supabase
                  .schema(baseMeta.schema_name)
                  .from(pgTable)
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
                // table may lack airtable_id column
              }
            }
          } catch {
            // table may not exist
          }
        }),
      );

      return map;
    },
  });

  return lookupMap ?? EMPTY_LOOKUP;
}
