import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { RecordRow, Filter, Sort } from '../types';
import { toast } from '../components/Toast';

function fireAutomations(event: string, baseId: string, tableId: string, record?: any, oldRecord?: any) {
  supabase.functions.invoke('automation-runner', {
    body: { event, baseId, tableId, record, oldRecord },
  }).catch(() => {});
}

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

const contextCache = new Map<string, { schemaName: string; tableName: string; ts: number }>();

async function resolveTableContext(baseId: string, tableId: string) {
  const key = `${baseId}:${tableId}`;
  const cached = contextCache.get(key);
  if (cached && Date.now() - cached.ts < 60_000) {
    return { schemaName: cached.schemaName, tableName: cached.tableName };
  }

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

  const result = { schemaName: base.schema_name, tableName: table.pg_table_name };
  contextCache.set(key, { ...result, ts: Date.now() });
  return result;
}

function applyFilter(
  query: any,
  col: string,
  operator: string,
  value: any,
  pgType: string,
): any {
  switch (operator) {
    case 'is':
    case 'eq':
      return query.eq(col, value);
    case 'isNot':
    case 'neq':
      return query.neq(col, value);
    case 'contains':
      if (pgType === 'TEXT[]') return query.contains(col, [value]);
      return query.ilike(col, `%${value}%`);
    case 'doesNotContain':
      if (pgType === 'TEXT[]') return query.not(col, 'cs', `{${value}}`);
      return query.not(col, 'ilike', `%${value}%`);
    case 'startsWith':
      return query.ilike(col, `${value}%`);
    case 'endsWith':
      return query.ilike(col, `%${value}`);
    case 'isEmpty':
      if (pgType === 'TEXT[]' || pgType === 'JSONB') {
        return query.or(`${col}.is.null,${col}.eq.{},${col}.eq.[]`);
      }
      return query.or(`${col}.is.null,${col}.eq.`);
    case 'isNotEmpty':
      if (pgType === 'TEXT[]' || pgType === 'JSONB') {
        return query.not(col, 'is', null).not(col, 'eq', '{}').not(col, 'eq', '[]');
      }
      return query.not(col, 'is', null).neq(col, '');
    case 'gt':
    case 'isAfter':
      return query.gt(col, value);
    case 'gte':
    case 'isOnOrAfter':
      return query.gte(col, value);
    case 'lt':
    case 'isBefore':
      return query.lt(col, value);
    case 'lte':
    case 'isOnOrBefore':
      return query.lte(col, value);
    case 'isAnyOf':
      return query.in(col, Array.isArray(value) ? value : [value]);
    case 'isNoneOf':
      return query.not(col, 'in', `(${(Array.isArray(value) ? value : [value]).map((v: string) => `"${v}"`).join(',')})`);
    default:
      return query;
  }
}

export function useRecords(params: UseRecordsParams) {
  const { baseId, tableId, page = 0, pageSize = 50, filters, sorts, search } = params;

  return useQuery({
    queryKey: ['nc', 'records', baseId, tableId, page, pageSize, filters, sorts, search],
    enabled: !!baseId && !!tableId,
    queryFn: async (): Promise<RecordsResult> => {
      const ctx = await resolveTableContext(baseId, tableId);

      const { data: fieldsMeta } = await supabase
        .schema('nc_meta')
        .from('fields')
        .select('id, pg_column_name, pg_type, ui_type')
        .eq('table_id', tableId);

      const fieldMap = new Map(
        (fieldsMeta ?? []).map((f: any) => [f.id, f]),
      );

      let query = supabase
        .schema(ctx.schemaName)
        .from(ctx.tableName)
        .select('*', { count: 'exact' });

      // Filters
      if (filters && filters.length > 0) {
        for (const filter of filters) {
          const field = fieldMap.get(filter.field_id);
          if (!field) continue;
          query = applyFilter(query, field.pg_column_name, filter.operator, filter.value, field.pg_type);
        }
      }

      // Search across text columns
      if (search) {
        const textCols = (fieldsMeta ?? [])
          .filter((f: any) => ['TEXT'].includes(f.pg_type) && !f.pg_column_name.startsWith('nc_'))
          .map((f: any) => f.pg_column_name);
        if (textCols.length > 0) {
          const orClause = textCols.map((c: string) => `${c}.ilike.%${search}%`).join(',');
          query = query.or(orClause);
        }
      }

      // Pagination
      const from = page * pageSize;
      const to = from + pageSize - 1;
      query = query.range(from, to);

      // Sorting
      if (sorts && sorts.length > 0) {
        for (const sort of sorts) {
          const field = fieldMap.get(sort.field_id);
          if (field) {
            query = query.order(field.pg_column_name, { ascending: sort.direction === 'asc' });
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
    onMutate: async (variables) => {
      const queryKey = ['nc', 'records', variables.baseId, variables.tableId];
      await qc.cancelQueries({ queryKey });

      const optimisticRecord: RecordRow = {
        id: `temp-${Date.now()}`,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        ...variables.record,
      };

      qc.setQueriesData<RecordsResult>({ queryKey }, (old) => {
        if (!old) return old;
        return {
          ...old,
          records: [...old.records, optimisticRecord],
          totalCount: old.totalCount + 1,
        };
      });

      return { queryKey };
    },
    onSuccess: (data, variables) => {
      qc.invalidateQueries({ queryKey: ['nc', 'records', variables.baseId, variables.tableId] });
      toast.success('Record created');
      fireAutomations('record.created', variables.baseId, variables.tableId, data);
    },
    onError: (_err, variables, context) => {
      if (context?.queryKey) {
        qc.invalidateQueries({ queryKey: context.queryKey });
      }
      toast.error('Failed to create record');
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
    onSuccess: (data, variables) => {
      fireAutomations('record.updated', variables.baseId, variables.tableId, data);
    },
    onSettled: (_data, _error, variables) => {
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
      record: RecordRow;
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
      toast.success('Record deleted');
      fireAutomations('record.deleted', variables.baseId, variables.tableId, { id: variables.recordId });
    },
    onError: () => {
      toast.error('Failed to delete record');
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
      toast.success(`${variables.recordIds.length} record${variables.recordIds.length > 1 ? 's' : ''} deleted`);
    },
    onError: () => {
      toast.error('Failed to delete records');
    },
  });
}

