import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { FieldMeta } from '../types';
import { getFieldColumn, getTableMeta } from './metaLookups';
import { resolveBaseSchema } from './tableBootstrap';

const EMPTY_LOOKUP: Record<string, string> = {};

export function useLinkDisplayLookup(
  baseId: string | null | undefined,
  fields: FieldMeta[] | undefined,
  /** Wait for this (for example "the first page of rows has arrived") so it does not compete with the data the screen needs first. */
  ready = true,
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
    enabled: ready && !!baseId && (relatedTableIds.length > 0 || linkedTableNames.length > 0 || linkedTableAirtableIds.length > 0),
    staleTime: 60_000,
    gcTime: 5 * 60_000,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const map: Record<string, string> = {};

      // Shared with the link columns, so the base's schema is asked for once for the whole screen.
      let schemaName: string;
      try {
        schemaName = await resolveBaseSchema(baseId as string);
      } catch {
        return map;
      }
      if (!schemaName) return map;
      const baseMeta = { schema_name: schemaName };

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
          // The old Airtable table ids cannot be mapped to tables here, so every table of the base is
          // included and the airtable_id matching further down picks out the right records.
          const { data: allBaseTables } = await supabase
            .schema('nc_meta')
            .from('tables')
            .select('id, pg_table_name')
            .eq('base_id', baseId);
          if (allBaseTables) {
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
            // One shared request each for all the tables and for all the primary columns, not one per table.
            const tableMeta = await getTableMeta(tableId);
            if (!tableMeta?.primary_field_id) return null;

            const pgColumn = await getFieldColumn(tableMeta.primary_field_id);
            if (!pgColumn) return null;

            return { tableId, pgTable: tableMeta.pg_table_name, pgColumn };
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
