import { useState, useRef, useCallback, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { FieldMeta, RecordRow } from '../types';

// ---------------------------------------------------------------------------
// Shared helpers for linked-record UIs (popover, dialog, etc.)
// ---------------------------------------------------------------------------

/** Fetch the primary field of a table (cached). */
export function usePrimaryField(tableId: string | null | undefined, enabled = true) {
  return useQuery({
    queryKey: ['nc', 'primary-field', tableId],
    enabled: !!tableId && enabled,
    queryFn: async () => {
      const { data, error } = await supabase
        .schema('nc_meta')
        .from('fields')
        .select('*')
        .eq('table_id', tableId)
        .eq('is_primary', true)
        .single();
      if (error) return null;
      return data as FieldMeta;
    },
  });
}

/** Derive a human-readable label for a record using the primary field. */
export function getRecordDisplayValue(
  record: RecordRow | Record<string, any>,
  primaryField: FieldMeta | null | undefined,
): string {
  if (primaryField?.pg_column_name && record[primaryField.pg_column_name] != null) {
    return String(record[primaryField.pg_column_name]);
  }
  return record.id ? String(record.id).slice(0, 8) : 'Record';
}

/**
 * Fetch records currently linked to a specific source record through a link
 * field. Handles hm (has-many), bt (belongs-to), and mm (many-to-many).
 */
export function useRecordLinks(opts: {
  baseId: string | null | undefined;
  sourceTableId: string;
  targetTableId: string | null | undefined;
  fieldId: string;
  recordId: string | null;
  linkType: string | undefined;
}) {
  const { baseId, sourceTableId, targetTableId, fieldId, recordId, linkType } = opts;
  return useQuery({
    queryKey: ['nc', 'linked-records', baseId, sourceTableId, fieldId, recordId],
    enabled: !!baseId && !!targetTableId && !!recordId,
    queryFn: async (): Promise<RecordRow[]> => {
      const { data: base } = await supabase
        .schema('nc_meta')
        .from('bases')
        .select('schema_name')
        .eq('id', baseId)
        .single();
      if (!base) return [];

      const { data: srcTable } = await supabase
        .schema('nc_meta')
        .from('tables')
        .select('pg_table_name')
        .eq('id', sourceTableId)
        .single();
      const { data: tgtTable } = await supabase
        .schema('nc_meta')
        .from('tables')
        .select('pg_table_name')
        .eq('id', targetTableId)
        .single();
      if (!srcTable || !tgtTable) return [];

      const schema = base.schema_name;

      if (linkType === 'hm') {
        const fkCol = `${srcTable.pg_table_name}_id`;
        const { data } = await supabase
          .schema(schema)
          .from(tgtTable.pg_table_name)
          .select('*')
          .eq(fkCol, recordId)
          .limit(200);
        return (data ?? []) as RecordRow[];
      }

      if (linkType === 'bt') {
        const fkCol = `${tgtTable.pg_table_name}_id`;
        const { data: srcRow } = await supabase
          .schema(schema)
          .from(srcTable.pg_table_name)
          .select(fkCol)
          .eq('id', recordId)
          .single();
        if (!srcRow || !srcRow[fkCol]) return [];
        const { data } = await supabase
          .schema(schema)
          .from(tgtTable.pg_table_name)
          .select('*')
          .eq('id', srcRow[fkCol])
          .limit(1);
        return (data ?? []) as RecordRow[];
      }

      if (linkType === 'mm') {
        const { data: linkMeta } = await supabase
          .schema('nc_meta')
          .from('links')
          .select('junction_table_id')
          .eq('field_id', fieldId)
          .single();
        if (!linkMeta?.junction_table_id) return [];

        const { data: jTable } = await supabase
          .schema('nc_meta')
          .from('tables')
          .select('pg_table_name')
          .eq('id', linkMeta.junction_table_id)
          .single();
        if (!jTable) return [];

        const { data: jRows } = await supabase
          .schema(schema)
          .from(jTable.pg_table_name)
          .select(`${tgtTable.pg_table_name}_id`)
          .eq(`${srcTable.pg_table_name}_id`, recordId)
          .limit(200);
        if (!jRows || jRows.length === 0) return [];

        const ids = jRows.map((r: any) => r[`${tgtTable.pg_table_name}_id`]).filter(Boolean);
        if (ids.length === 0) return [];

        const { data } = await supabase
          .schema(schema)
          .from(tgtTable.pg_table_name)
          .select('*')
          .in('id', ids);
        return (data ?? []) as RecordRow[];
      }

      return [];
    },
  });
}

/** Search records in a related table by primary-field value. */
export function useRelatedTableSearch(opts: {
  baseId: string | null | undefined;
  targetTableId: string | null | undefined;
  searchTerm: string;
  primaryField: FieldMeta | null | undefined;
  enabled?: boolean;
}) {
  const { baseId, targetTableId, searchTerm, primaryField, enabled = true } = opts;
  return useQuery({
    queryKey: ['nc', 'link-search', targetTableId, searchTerm],
    enabled: !!targetTableId && !!searchTerm && !!baseId && enabled,
    queryFn: async (): Promise<RecordRow[]> => {
      const { data: base } = await supabase
        .schema('nc_meta')
        .from('bases')
        .select('schema_name')
        .eq('id', baseId)
        .single();
      if (!base) return [];

      const { data: table } = await supabase
        .schema('nc_meta')
        .from('tables')
        .select('pg_table_name')
        .eq('id', targetTableId)
        .single();
      if (!table) return [];

      let query = supabase
        .schema(base.schema_name)
        .from(table.pg_table_name)
        .select('*')
        .limit(20);

      if (primaryField?.pg_column_name) {
        query = query.ilike(primaryField.pg_column_name, `%${searchTerm}%`);
      }

      const { data, error } = await query;
      if (error) return [];
      return (data ?? []) as RecordRow[];
    },
  });
}

/**
 * Mutations to link or unlink a target record from a source record.
 * Handles hm, bt, and mm relation types.
 */
export function useLinkMutations(opts: {
  baseId: string | null | undefined;
  field: FieldMeta;
  recordId: string;
}) {
  const { baseId, field, recordId } = opts;
  const linkType = field.options?.type as string | undefined;
  const relatedTableId = field.options?.relatedTableId as string | undefined;
  const qc = useQueryClient();

  const resolveTables = useCallback(async () => {
    if (!baseId || !relatedTableId) return null;
    const { data: base } = await supabase
      .schema('nc_meta')
      .from('bases')
      .select('schema_name')
      .eq('id', baseId)
      .single();
    if (!base) return null;

    const { data: srcTable } = await supabase
      .schema('nc_meta')
      .from('tables')
      .select('pg_table_name')
      .eq('id', field.table_id)
      .single();
    const { data: tgtTable } = await supabase
      .schema('nc_meta')
      .from('tables')
      .select('pg_table_name')
      .eq('id', relatedTableId)
      .single();
    if (!srcTable || !tgtTable) return null;
    return { schema: base.schema_name as string, src: srcTable.pg_table_name as string, tgt: tgtTable.pg_table_name as string };
  }, [baseId, relatedTableId, field.table_id]);

  const invalidate = useCallback(() => {
    qc.invalidateQueries({ queryKey: ['nc', 'linked-records'] });
    qc.invalidateQueries({ queryKey: ['nc', 'records'] });
  }, [qc]);

  const linkRecord = useCallback(
    async (targetRecordId: string) => {
      const t = await resolveTables();
      if (!t) return;

      if (linkType === 'hm') {
        await supabase.schema(t.schema).from(t.tgt).update({ [`${t.src}_id`]: recordId }).eq('id', targetRecordId);
      } else if (linkType === 'bt') {
        await supabase.schema(t.schema).from(t.src).update({ [`${t.tgt}_id`]: targetRecordId }).eq('id', recordId);
      } else if (linkType === 'mm') {
        const { data: linkMeta } = await supabase.schema('nc_meta').from('links').select('junction_table_id').eq('field_id', field.id).single();
        if (!linkMeta?.junction_table_id) return;
        const { data: jTable } = await supabase.schema('nc_meta').from('tables').select('pg_table_name').eq('id', linkMeta.junction_table_id).single();
        if (!jTable) return;
        await supabase.schema(t.schema).from(jTable.pg_table_name).insert({ [`${t.src}_id`]: recordId, [`${t.tgt}_id`]: targetRecordId });
      }
      invalidate();
    },
    [resolveTables, linkType, recordId, field.id, invalidate],
  );

  const unlinkRecord = useCallback(
    async (targetRecordId: string) => {
      const t = await resolveTables();
      if (!t) return;

      if (linkType === 'hm') {
        await supabase.schema(t.schema).from(t.tgt).update({ [`${t.src}_id`]: null }).eq('id', targetRecordId);
      } else if (linkType === 'bt') {
        await supabase.schema(t.schema).from(t.src).update({ [`${t.tgt}_id`]: null }).eq('id', recordId);
      } else if (linkType === 'mm') {
        const { data: linkMeta } = await supabase.schema('nc_meta').from('links').select('junction_table_id').eq('field_id', field.id).single();
        if (!linkMeta?.junction_table_id) return;
        const { data: jTable } = await supabase.schema('nc_meta').from('tables').select('pg_table_name').eq('id', linkMeta.junction_table_id).single();
        if (!jTable) return;
        await supabase.schema(t.schema).from(jTable.pg_table_name).delete().eq(`${t.src}_id`, recordId).eq(`${t.tgt}_id`, targetRecordId);
      }
      invalidate();
    },
    [resolveTables, linkType, recordId, field.id, invalidate],
  );

  return { linkRecord, unlinkRecord };
}

export interface LinkMeta {
  id: string;
  base_id: string;
  source_table_id: string;
  source_field_id: string;
  target_table_id: string;
  target_field_id: string | null;
  relation_type: 'one_to_one' | 'one_to_many' | 'many_to_many';
  junction_table_id: string | null;
  created_at: string;
}

export function useLinks(tableId: string | null | undefined) {
  return useQuery({
    queryKey: ['nc', 'links', tableId],
    enabled: !!tableId,
    queryFn: async () => {
      const { data, error } = await supabase
        .schema('nc_meta')
        .from('links')
        .select('*')
        .eq('source_table_id', tableId);
      if (error) throw error;
      return data as LinkMeta[];
    },
  });
}

export function useCreateLink() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      base_id: string;
      table_id: string;
      field_name: string;
      target_table_id: string;
      relation_type: 'one_to_one' | 'one_to_many' | 'many_to_many';
    }) => {
      // 1. Create the field metadata with type Links
      const { data: field, error: fieldError } = await supabase
        .schema('nc_meta')
        .from('fields')
        .insert({
          table_id: input.table_id,
          name: input.field_name,
          pg_column_name: '',
          ui_type: 'Links',
          pg_type: '',
          options: {
            relatedTableId: input.target_table_id,
            type: input.relation_type === 'one_to_one'
              ? 'oo'
              : input.relation_type === 'one_to_many'
                ? 'hm'
                : 'mm',
          },
          position: 999,
          width: 180,
          is_primary: false,
          is_required: false,
          is_unique: false,
          is_system: false,
          is_hidden: false,
          description: null,
          default_value: null,
        })
        .select()
        .single();

      if (fieldError) throw fieldError;

      // 2. Create the link metadata record
      const { data: link, error: linkError } = await supabase
        .schema('nc_meta')
        .from('links')
        .insert({
          base_id: input.base_id,
          source_table_id: input.table_id,
          source_field_id: (field as FieldMeta).id,
          target_table_id: input.target_table_id,
          relation_type: input.relation_type,
        })
        .select()
        .single();

      if (linkError) throw linkError;

      return { field: field as FieldMeta, link: link as LinkMeta };
    },
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ['nc', 'fields', variables.table_id] });
      qc.invalidateQueries({ queryKey: ['nc', 'links', variables.table_id] });
    },
  });
}

export function useLinkedRecords(
  baseId: string | null | undefined,
  targetTableId: string | null | undefined,
  recordIds?: string[],
) {
  return useQuery({
    queryKey: ['nc', 'linked-records', baseId, targetTableId, recordIds],
    enabled: !!baseId && !!targetTableId,
    queryFn: async (): Promise<RecordRow[]> => {
      // Resolve schema and table name
      const { data: base, error: baseError } = await supabase
        .schema('nc_meta')
        .from('bases')
        .select('schema_name')
        .eq('id', baseId)
        .single();
      if (baseError) throw baseError;

      const { data: table, error: tableError } = await supabase
        .schema('nc_meta')
        .from('tables')
        .select('pg_table_name')
        .eq('id', targetTableId)
        .single();
      if (tableError) throw tableError;

      let query = supabase
        .schema(base.schema_name)
        .from(table.pg_table_name)
        .select('*')
        .order('created_at', { ascending: true })
        .limit(200);

      if (recordIds && recordIds.length > 0) {
        query = query.in('id', recordIds);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as RecordRow[];
    },
  });
}

/** Resolve schema/table names for a linked table. Cached separately so paginated queries can reuse it. */
function useLinkedTableMeta(
  baseId: string | null | undefined,
  targetTableId: string | null | undefined,
) {
  return useQuery({
    queryKey: ['nc', 'linked-table-meta', baseId, targetTableId],
    enabled: !!baseId && !!targetTableId,
    queryFn: async () => {
      const { data: base, error: baseError } = await supabase
        .schema('nc_meta')
        .from('bases')
        .select('schema_name')
        .eq('id', baseId)
        .single();
      if (baseError) throw baseError;

      const { data: table, error: tableError } = await supabase
        .schema('nc_meta')
        .from('tables')
        .select('pg_table_name')
        .eq('id', targetTableId)
        .single();
      if (tableError) throw tableError;

      return { schemaName: base.schema_name as string, tableName: table.pg_table_name as string };
    },
  });
}

export interface PaginatedLinkedRecords {
  records: RecordRow[];
  totalCount: number;
  hasMore: boolean;
  isLoadingMore: boolean;
  loadMore: () => void;
  isLoading: boolean;
}

/**
 * Paginated hook for the linked-record picker.
 * Loads `pageSize` records at a time and supports server-side search via `ilike` on
 * a given column (typically the primary field).
 */
export function useLinkedRecordsPaginated(
  baseId: string | null | undefined,
  targetTableId: string | null | undefined,
  options?: {
    pageSize?: number;
    search?: string;
    searchColumn?: string;
  },
): PaginatedLinkedRecords {
  const pageSize = options?.pageSize ?? 50;
  const search = options?.search ?? '';
  const searchColumn = options?.searchColumn;

  const { data: meta } = useLinkedTableMeta(baseId, targetTableId);

  // Total count (with search filter applied)
  const { data: totalCount = 0 } = useQuery({
    queryKey: ['nc', 'linked-records-count', baseId, targetTableId, search, searchColumn],
    enabled: !!meta,
    queryFn: async () => {
      let query = supabase
        .schema(meta!.schemaName)
        .from(meta!.tableName)
        .select('*', { count: 'exact', head: true });

      if (search && searchColumn) {
        query = query.ilike(searchColumn, `%${search}%`);
      }

      const { count, error } = await query;
      if (error) throw error;
      return count ?? 0;
    },
  });

  // Track how many pages have been loaded
  const [pages, setPages] = useState(1);

  // Reset pages when search changes
  const prevSearchRef = useRef(search);
  if (prevSearchRef.current !== search) {
    prevSearchRef.current = search;
    setPages(1);
  }

  const limit = pages * pageSize;

  const { data: records = [], isLoading, isFetching } = useQuery({
    queryKey: ['nc', 'linked-records-page', baseId, targetTableId, search, searchColumn, limit],
    enabled: !!meta,
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<RecordRow[]> => {
      let query = supabase
        .schema(meta!.schemaName)
        .from(meta!.tableName)
        .select('*')
        .order('created_at', { ascending: true })
        .limit(limit);

      if (search && searchColumn) {
        query = query.ilike(searchColumn, `%${search}%`);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as RecordRow[];
    },
  });

  const loadMore = useCallback(() => {
    setPages((p) => p + 1);
  }, []);

  return {
    records,
    totalCount,
    hasMore: records.length < totalCount,
    isLoadingMore: isFetching && records.length > 0,
    loadMore,
    isLoading,
  };
}
