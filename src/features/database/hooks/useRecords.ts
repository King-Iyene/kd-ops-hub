import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { RecordRow, Filter, FilterGroup, Sort } from '../types';
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
  filterGroups?: FilterGroup[];
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

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
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
    case 'isExactly':
      // For multi-select (TEXT[]) exact array match; otherwise plain eq
      if (pgType === 'TEXT[]') {
        const arr = Array.isArray(value) ? value : String(value).split(',').map((s: string) => s.trim());
        return query.eq(col, arr);
      }
      return query.eq(col, value);
    case 'contains':
      if (pgType === 'TEXT[]') return query.contains(col, [value]);
      return query.ilike(col, `%${value}%`);
    case 'doesNotContain':
      if (pgType === 'TEXT[]') return query.not(col, 'cs', `{${value}}`);
      return query.not(col, 'ilike', `%${value}%`);
    case 'containsAnyOf': {
      const items = Array.isArray(value) ? value : String(value).split(',').map((s: string) => s.trim());
      if (pgType === 'TEXT[]') {
        // overlaps — array shares any element
        return query.overlaps(col, items);
      }
      // Text: ilike OR for each token
      const orClause = items.map((v: string) => `${col}.ilike.%${v}%`).join(',');
      return query.or(orClause);
    }
    case 'doesNotContainAnyOf': {
      const items = Array.isArray(value) ? value : String(value).split(',').map((s: string) => s.trim());
      if (pgType === 'TEXT[]') {
        // NOT overlaps
        return query.not(col, 'ov', `{${items.join(',')}}`);
      }
      // Text: NOT ilike for each token (AND — must not contain any)
      let q = query;
      for (const v of items) {
        q = q.not(col, 'ilike', `%${v}%`);
      }
      return q;
    }
    case 'startsWith':
      return query.ilike(col, `${value}%`);
    case 'endsWith':
      return query.ilike(col, `%${value}`);
    case 'isEmpty':
      if (pgType === 'TEXT[]' || pgType === 'JSONB' || pgType.startsWith('JSONB')) {
        return query.or(`${col}.is.null,${col}.eq.{},${col}.eq.[]`);
      }
      return query.or(`${col}.is.null,${col}.eq.`);
    case 'isNotEmpty':
      if (pgType === 'TEXT[]' || pgType === 'JSONB' || pgType.startsWith('JSONB')) {
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
    case 'isBetween': {
      // value is [start, end] or "start,end"
      const range = Array.isArray(value) ? value : String(value).split(',').map((s: string) => s.trim());
      return query.gte(col, range[0]).lte(col, range[1]);
    }
    case 'isWithin':
      // value is a named range like "pastWeek", "pastMonth", "pastYear", "nextWeek", etc.
      // or a [start, end] pair — fall through to isBetween-style logic
      if (Array.isArray(value) || (typeof value === 'string' && value.includes(','))) {
        const range = Array.isArray(value) ? value : value.split(',').map((s: string) => s.trim());
        return query.gte(col, range[0]).lte(col, range[1]);
      }
      // Named ranges
      switch (value) {
        case 'pastWeek':
          return query.gte(col, daysAgo(7)).lte(col, new Date().toISOString());
        case 'pastMonth':
          return query.gte(col, daysAgo(30)).lte(col, new Date().toISOString());
        case 'pastYear':
          return query.gte(col, daysAgo(365)).lte(col, new Date().toISOString());
        case 'nextWeek': {
          const now = new Date();
          const end = new Date();
          end.setDate(now.getDate() + 7);
          return query.gte(col, now.toISOString()).lte(col, end.toISOString());
        }
        case 'nextMonth': {
          const now = new Date();
          const end = new Date();
          end.setDate(now.getDate() + 30);
          return query.gte(col, now.toISOString()).lte(col, end.toISOString());
        }
        case 'nextYear': {
          const now = new Date();
          const end = new Date();
          end.setDate(now.getDate() + 365);
          return query.gte(col, now.toISOString()).lte(col, end.toISOString());
        }
        default:
          return query;
      }
    case 'isWithinPastWeek':
      return query.gte(col, daysAgo(7)).lte(col, new Date().toISOString());
    case 'isWithinPastMonth':
      return query.gte(col, daysAgo(30)).lte(col, new Date().toISOString());
    case 'isWithinPastYear':
      return query.gte(col, daysAgo(365)).lte(col, new Date().toISOString());
    case 'isAnyOf':
      return query.in(col, Array.isArray(value) ? value : [value]);
    case 'isNoneOf':
      return query.not(col, 'in', `(${(Array.isArray(value) ? value : [value]).map((v: string) => `"${v}"`).join(',')})`);
    case 'isChecked':
      return query.eq(col, true);
    case 'isNotChecked':
      return query.or(`${col}.is.null,${col}.eq.false`);
    case 'linkCountIs': {
      // Links are stored as JSONB arrays; use json_array_length via PostgREST raw filter
      const n = Number(value);
      return query.filter(col, 'eq', n);
    }
    case 'linkCountGt': {
      const n = Number(value);
      return query.filter(col, 'gt', n);
    }
    case 'linkCountLt': {
      const n = Number(value);
      return query.filter(col, 'lt', n);
    }
    default:
      return query;
  }
}

/**
 * Build a PostgREST OR clause string for a flat list of filters.
 * Each filter becomes a PostgREST filter expression fragment.
 * Returns null when the list is empty or all filters are unresolvable.
 */
function buildOrClauseFromFilters(
  filters: Filter[],
  fieldMap: Map<string, any>,
): string | null {
  const parts: string[] = [];
  for (const filter of filters) {
    const field = fieldMap.get(filter.field_id);
    if (!field) continue;
    const col = field.pg_column_name;
    const val = filter.value;
    const pgType: string = field.pg_type;

    switch (filter.operator) {
      case 'is':
      case 'eq':
        parts.push(`${col}.eq.${val}`);
        break;
      case 'isNot':
      case 'neq':
        parts.push(`${col}.neq.${val}`);
        break;
      case 'isExactly':
        parts.push(`${col}.eq.${val}`);
        break;
      case 'contains':
        if (pgType === 'TEXT[]') parts.push(`${col}.cs.{${val}}`);
        else parts.push(`${col}.ilike.%${val}%`);
        break;
      case 'doesNotContain':
        if (pgType === 'TEXT[]') parts.push(`${col}.not.cs.{${val}}`);
        else parts.push(`${col}.not.ilike.%${val}%`);
        break;
      case 'startsWith':
        parts.push(`${col}.ilike.${val}%`);
        break;
      case 'endsWith':
        parts.push(`${col}.ilike.%${val}`);
        break;
      case 'isEmpty':
        parts.push(`${col}.is.null`);
        break;
      case 'isNotEmpty':
        parts.push(`${col}.not.is.null`);
        break;
      case 'gt':
      case 'isAfter':
        parts.push(`${col}.gt.${val}`);
        break;
      case 'gte':
      case 'isOnOrAfter':
        parts.push(`${col}.gte.${val}`);
        break;
      case 'lt':
      case 'isBefore':
        parts.push(`${col}.lt.${val}`);
        break;
      case 'lte':
      case 'isOnOrBefore':
        parts.push(`${col}.lte.${val}`);
        break;
      case 'isAnyOf': {
        const arr = Array.isArray(val) ? val : [val];
        parts.push(`${col}.in.(${arr.map((v: string) => `"${v}"`).join(',')})`);
        break;
      }
      case 'isChecked':
        parts.push(`${col}.eq.true`);
        break;
      case 'isNotChecked':
        parts.push(`${col}.is.null,${col}.eq.false`);
        break;
      case 'isWithinPastWeek':
        parts.push(`${col}.gte.${daysAgo(7)}`);
        break;
      case 'isWithinPastMonth':
        parts.push(`${col}.gte.${daysAgo(30)}`);
        break;
      case 'isWithinPastYear':
        parts.push(`${col}.gte.${daysAgo(365)}`);
        break;
      default:
        // Complex operators (isBetween, containsAnyOf, link counts, etc.)
        // cannot be expressed in a single PostgREST OR fragment.
        // Fall back to AND-chaining for those in the group applier.
        break;
    }
  }
  return parts.length > 0 ? parts.join(',') : null;
}

/**
 * Apply a nested FilterGroup to the query. Groups can contain filters and
 * sub-groups with their own conjunction (AND/OR).
 */
function applyFilterGroup(
  query: any,
  group: FilterGroup,
  fieldMap: Map<string, any>,
): any {
  if (group.filters.length === 0 && group.groups.length === 0) return query;

  if (group.conjunction === 'or') {
    // For OR groups we build a PostgREST .or() clause from the flat filters.
    // Sub-groups with AND inside an OR parent are applied as nested .and() inside the .or().
    const orParts: string[] = [];

    // Flat filters — build OR clause parts
    const flatOr = buildOrClauseFromFilters(group.filters, fieldMap);
    if (flatOr) orParts.push(flatOr);

    // Sub-groups: recursively build nested clauses
    for (const sub of group.groups) {
      if (sub.conjunction === 'and') {
        // Nested AND inside OR — PostgREST supports and() inside or()
        const andParts = buildOrClauseFromFilters(sub.filters, fieldMap);
        if (andParts) orParts.push(`and(${andParts})`);
      } else {
        const subOr = buildOrClauseFromFilters(sub.filters, fieldMap);
        if (subOr) orParts.push(subOr);
      }
    }

    if (orParts.length > 0) {
      query = query.or(orParts.join(','));
    }

    // Handle complex operator filters that couldn't be expressed as OR fragments
    // by falling back to AND-chaining (best effort — true OR for these would
    // require a server-side function).
    for (const filter of group.filters) {
      const field = fieldMap.get(filter.field_id);
      if (!field) continue;
      const op = filter.operator;
      if (['isBetween', 'isWithin', 'containsAnyOf', 'doesNotContainAnyOf',
           'linkCountIs', 'linkCountGt', 'linkCountLt'].includes(op)) {
        query = applyFilter(query, field.pg_column_name, op, filter.value, field.pg_type);
      }
    }
  } else {
    // AND conjunction — chain each filter sequentially
    for (const filter of group.filters) {
      const field = fieldMap.get(filter.field_id);
      if (!field) continue;
      query = applyFilter(query, field.pg_column_name, filter.operator, filter.value, field.pg_type);
    }

    // Recurse into sub-groups
    for (const sub of group.groups) {
      query = applyFilterGroup(query, sub, fieldMap);
    }
  }

  return query;
}

export function useRecords(params: UseRecordsParams) {
  const { baseId, tableId, page = 0, pageSize = 50, filters, filterGroups, sorts, search } = params;

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
          .filter((f: any) => ['TEXT', 'VARCHAR'].includes(f.pg_type) && !f.pg_column_name.startsWith('nc_'))
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

export function useRecordCount(baseId: string | null | undefined, tableId: string | null | undefined) {
  return useQuery({
    queryKey: ['nc', 'recordCount', baseId, tableId],
    enabled: !!baseId && !!tableId,
    staleTime: 30_000,
    queryFn: async () => {
      const ctx = await resolveTableContext(baseId!, tableId!);
      const { count, error } = await supabase
        .schema(ctx.schemaName)
        .from(ctx.tableName)
        .select('*', { count: 'exact', head: true });
      if (error) throw error;
      return count ?? 0;
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
    onSuccess: (data, variables) => {
      qc.invalidateQueries({ queryKey: ['nc', 'records', variables.baseId, variables.tableId] });
      toast.success('Record created');
      fireAutomations('record.created', variables.baseId, variables.tableId, data);
    },
    onError: () => {
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

