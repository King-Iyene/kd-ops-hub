import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { RecordRow, Filter, Sort } from '../types';

interface UseRecordsParams {
  baseId: string;
  tableId: string;
  page?: number;
  pageSize?: number;
  filters?: Filter[];
  sorts?: Sort[];
  search?: string;
}

interface RecordsResult {
  records: RecordRow[];
  totalCount: number;
}

async function resolveTableContext(baseId: string, tableId: string) {
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
    .eq('id', tableId)
    .single();
  if (tableError) throw tableError;

  return { schemaName: base.schema_name, tableName: table.pg_table_name };
}

export function useRecords(params: UseRecordsParams) {
  const { baseId, tableId, page = 1, pageSize = 50, sorts, search } = params;

  return useQuery({
    queryKey: ['nc', 'records', baseId, tableId, page, pageSize, sorts, search],
    enabled: !!baseId && !!tableId,
    queryFn: async (): Promise<RecordsResult> => {
      const ctx = await resolveTableContext(baseId, tableId);

      let query = supabase
        .schema(ctx.schemaName)
        .from(ctx.tableName)
        .select('*', { count: 'exact' });

      // Pagination
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;
      query = query.range(from, to);

      // Sorting
      if (sorts && sorts.length > 0) {
        // Get field metadata to resolve field_id -> pg_column_name
        const { data: fields } = await supabase
          .schema('nc_meta')
          .from('fields')
          .select('id, pg_column_name')
          .eq('table_id', tableId);

        const fieldMap = new Map((fields ?? []).map((f: any) => [f.id, f.pg_column_name]));

        for (const sort of sorts) {
          const col = fieldMap.get(sort.field_id);
          if (col) {
            query = query.order(col, { ascending: sort.direction === 'asc' });
          }
        }
      } else {
        query = query.order('nc_order', { ascending: true }).order('created_at', { ascending: true });
      }

      const { data, error, count } = await query;
      if (error) throw error;

      return {
        records: (data ?? []) as RecordRow[],
        totalCount: count ?? 0,
      };
    },
  });
}

export function useCreateRecord() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      baseId: string;
      tableId: string;
      record: Record<string, any>;
    }) => {
      const ctx = await resolveTableContext(input.baseId, input.tableId);

      const { data, error } = await supabase
        .schema(ctx.schemaName)
        .from(ctx.tableName)
        .insert(input.record)
        .select()
        .single();

      if (error) throw error;
      return data as RecordRow;
    },
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ['nc', 'records', variables.baseId, variables.tableId] });
    },
  });
}

export function useUpdateRecord() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      baseId: string;
      tableId: string;
      recordId: string;
      field: string; // pg_column_name
      value: any;
    }) => {
      const ctx = await resolveTableContext(input.baseId, input.tableId);

      const { data, error } = await supabase
        .schema(ctx.schemaName)
        .from(ctx.tableName)
        .update({ [input.field]: input.value })
        .eq('id', input.recordId)
        .select()
        .single();

      if (error) throw error;
      return data as RecordRow;
    },
    onMutate: async (variables) => {
      const queryKey = ['nc', 'records', variables.baseId, variables.tableId];

      await qc.cancelQueries({ queryKey });

      const previous = qc.getQueryData<RecordsResult>(queryKey);

      // Optimistic update: find matching page cache and patch it
      qc.setQueriesData<RecordsResult>({ queryKey }, (old) => {
        if (!old) return old;
        return {
          ...old,
          records: old.records.map((r) =>
            r.id === variables.recordId
              ? { ...r, [variables.field]: variables.value }
              : r
          ),
        };
      });

      return { previous, queryKey };
    },
    onError: (_err, _variables, context) => {
      if (context?.previous) {
        qc.setQueryData(context.queryKey, context.previous);
      }
    },
    onSettled: (_data, _error, variables) => {
      qc.invalidateQueries({ queryKey: ['nc', 'records', variables.baseId, variables.tableId] });
    },
  });
}

export function useDeleteRecord() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      baseId: string;
      tableId: string;
      recordId: string;
    }) => {
      const ctx = await resolveTableContext(input.baseId, input.tableId);

      const { error } = await supabase
        .schema(ctx.schemaName)
        .from(ctx.tableName)
        .delete()
        .eq('id', input.recordId);

      if (error) throw error;
    },
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ['nc', 'records', variables.baseId, variables.tableId] });
    },
  });
}

export function useBulkDeleteRecords() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      baseId: string;
      tableId: string;
      recordIds: string[];
    }) => {
      const ctx = await resolveTableContext(input.baseId, input.tableId);

      const { error } = await supabase
        .schema(ctx.schemaName)
        .from(ctx.tableName)
        .delete()
        .in('id', input.recordIds);

      if (error) throw error;
    },
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ['nc', 'records', variables.baseId, variables.tableId] });
    },
  });
}

export function useDuplicateRecord() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      baseId: string;
      tableId: string;
      record: Record<string, any>;
    }) => {
      const ctx = await resolveTableContext(input.baseId, input.tableId);

      const { id, created_at, updated_at, nc_order, ...rest } = input.record;

      const { data, error } = await supabase
        .schema(ctx.schemaName)
        .from(ctx.tableName)
        .insert(rest)
        .select()
        .single();

      if (error) throw error;
      return data as RecordRow;
    },
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ['nc', 'records', variables.baseId, variables.tableId] });
    },
  });
}
