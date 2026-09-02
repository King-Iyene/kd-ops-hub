import { useState, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

interface SearchResult {
  baseId: string;
  baseName: string;
  tableId: string;
  tableName: string;
  recordId: string;
  title: string;
  matchField: string;
  matchValue: string;
}

async function searchAcrossBases(query: string): Promise<SearchResult[]> {
  if (!query || query.length < 2) return [];

  const { data: bases } = await supabase
    .schema('nc_meta')
    .from('bases')
    .select('id, name, schema_name');

  if (!bases || bases.length === 0) return [];

  const { data: tables } = await supabase
    .schema('nc_meta')
    .from('tables')
    .select('id, base_id, name, pg_table_name');

  if (!tables || tables.length === 0) return [];

  const { data: allFields } = await supabase
    .schema('nc_meta')
    .from('fields')
    .select('id, table_id, name, pg_column_name, pg_type, is_primary');

  if (!allFields) return [];

  const results: SearchResult[] = [];
  const baseMap = new Map(bases.map((b: any) => [b.id, b]));

  for (const table of tables) {
    const base = baseMap.get(table.base_id);
    if (!base) continue;

    const textFields = allFields.filter(
      (f: any) =>
        f.table_id === table.id &&
        f.pg_type === 'TEXT' &&
        !f.pg_column_name.startsWith('nc_'),
    );

    if (textFields.length === 0) continue;

    const primaryField = allFields.find(
      (f: any) => f.table_id === table.id && f.is_primary,
    );

    const orClause = textFields
      .map((f: any) => `${f.pg_column_name}.ilike.%${query}%`)
      .join(',');

    try {
      const { data: records } = await supabase
        .schema(base.schema_name)
        .from(table.pg_table_name)
        .select('*')
        .or(orClause)
        .limit(5);

      if (!records) continue;

      for (const record of records) {
        const matchedField = textFields.find(
          (f: any) =>
            record[f.pg_column_name] &&
            String(record[f.pg_column_name])
              .toLowerCase()
              .includes(query.toLowerCase()),
        );

        const title = primaryField
          ? String(record[primaryField.pg_column_name] ?? record.id)
          : record.id;

        results.push({
          baseId: base.id,
          baseName: base.name,
          tableId: table.id,
          tableName: table.name,
          recordId: record.id,
          title,
          matchField: matchedField?.name ?? '',
          matchValue: matchedField
            ? String(record[matchedField.pg_column_name] ?? '')
            : '',
        });
      }
    } catch {
      // table might not exist yet
    }

    if (results.length >= 20) break;
  }

  return results.slice(0, 20);
}

export function useGlobalSearch(query: string) {
  return useQuery({
    queryKey: ['nc', 'global-search', query],
    queryFn: () => searchAcrossBases(query),
    enabled: query.length >= 2,
    staleTime: 10_000,
  });
}

export function useGlobalSearchDialog() {
  const [open, setOpen] = useState(false);
  const toggle = useCallback(() => setOpen((v) => !v), []);
  return { open, setOpen, toggle };
}
