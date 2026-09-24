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
    () => (fields ?? []).filter((f) => f.ui_type === 'Links' && (
      f.options?.relatedTableId || f.options?.linkedTableName || f.options?.linkedTableId
    )),
    [fields],
  );

  const relatedTableIds = useMemo(
    () => [...new Set(linkFields.map((f) => f.options.relatedTableId as string).filter(Boolean))],
    [linkFields],
  );

  const linkedTableNames = useMemo(
    () => [...new Set(
      linkFields
        .filter((f) => !f.options?.relatedTableId && f.options?.linkedTableName)
        .map((f) => f.options.linkedTableName as string),
    )],
    [linkFields],
  );

  const linkedTableAirtableIds = useMemo(
    () => [...new Set(
      linkFields
        .filter((f) => !f.options?.relatedTableId && !f.options?.linkedTableName && f.options?.linkedTableId)
        .map((f) => f.options.linkedTableId as string),
    )],
    [linkFields],
  );

  const cacheKey = useMemo(
    () => [...relatedTableIds, ...linkedTableNames, ...linkedTableAirtableIds].sort().join(','),
    [relatedTableIds, linkedTableNames, linkedTableAirtableIds],
  );

  const { data: lookupMap } = useQuery({
    queryKey: ['nc', 'link-display-lookup', baseId, cacheKey],
    enabled: !!baseId && (relatedTableIds.length > 0 || linkedTableNames.length > 0 || linkedTableAirtableIds.length > 0),
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

      const allTableIds = [...relatedTableIds];

      // Resolve linkedTableNames to table IDs
      if (linkedTableNames.length > 0) {
        const { data: nameMatches } = await supabase
          .schema('nc_meta')
          .from('tables')
          .select('id, name')
          .eq('base_id', baseId)
          .in('name', linkedTableNames);
        if (nameMatches) {
          for (const t of nameMatches) {
            if (!allTableIds.includes(t.id)) allTableIds.push(t.id);
          }
        }
      }

      // Resolve Airtable table IDs (tblXXX) by checking tables' airtable_id column
      if (linkedTableAirtableIds.length > 0) {
        try {
          const { data: allBaseTables } = await supabase
            .schema('nc_meta')
            .from('tables')
            .select('id, pg_table_name')
            .eq('base_id', baseId);
          if (allBaseTables) {
            for (const tbl of allBaseTables) {
              try {
                const { data: atMatch } = await supabase
                  .schema('nc_meta')
                  .from('fields')
                  .select('id')
                  .eq('table_id', tbl.id)
                  .eq('pg_column_name', 'airtable_id')
                  .limit(1);
                if (!atMatch || atMatch.length === 0) continue;
                // This table has airtable_id. Check if any record's airtable_id matches a linkedTableId
                // Actually, linkedTableId is an Airtable TABLE id (tblXXX), not a record id.
                // We need to find which nc_meta table corresponds to this Airtable table.
                // Check if any field on this table references one of the linkedTableAirtableIds
                const { data: fieldMatch } = await supabase
                  .schema('nc_meta')
                  .from('fields')
                  .select('options')
                  .eq('table_id', tbl.id)
                  .eq('pg_column_name', 'airtable_id')
                  .limit(1);
                // We can't easily map tbl IDs from Airtable. Instead, just include ALL base tables
                // in the lookup and let the airtable_id matching handle it.
              } catch { /* skip */ }
            }
            // Simpler approach: include all tables from the base that aren't already included
            for (const tbl of allBaseTables) {
              if (!allTableIds.includes(tbl.id)) allTableIds.push(tbl.id);
            }
          }
        } catch { /* skip */ }
      }

      // Batch-fetch all table metadata in parallel
      const tableResults = await Promise.all(
        allTableIds.map(async (tableId) => {
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

      // Dedupe by pgTable to avoid fetching the same table twice
      const seen = new Set<string>();
      const dedupedTables = validTables.filter((t) => {
        if (seen.has(t.pgTable)) return false;
        seen.add(t.pgTable);
        return true;
      });

      // Fetch display values from all tables in parallel
      await Promise.all(
        dedupedTables.map(async ({ pgTable, pgColumn }) => {
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

            // Also resolve airtable_id mappings
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
              // table may lack airtable_id column — that's fine
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
