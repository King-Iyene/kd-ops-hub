import { useMemo } from 'react';
import { nextOffset, rangeFor } from '../lib/recordPaging';
import { chunkIds, needsSplitting, pickPageIds, type OrderKey } from '../lib/idListPaging';
import { normalizeDateFilter } from '../lib/dateRanges';
import { useQuery, useInfiniteQuery, infiniteQueryOptions, useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { logWarn } from '@/lib/logger';
import type { RecordRow, Filter, FilterGroup, Sort, FieldMeta } from '../types';
import { toast } from '../components/toast-store';
import { useUndoStore } from '../lib/undo';
import { fieldsKey, resolveTableContext, resolveTableSchema } from './tableBootstrap';
import { isIncompleteFilter, isTextColumn, pgQuote } from '../lib/filterRules';

/**
 * Run async batch jobs with a bounded concurrency instead of fully serial
 * or fully parallel execution, to avoid overwhelming the database while
 * still getting a meaningful speedup over one-at-a-time batches.
 */
async function runWithConcurrency<T>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<void>,
): Promise<void> {
  let cursor = 0;
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      await worker(items[index], index);
    }
  });
  await Promise.all(runners);
}

export function fireAutomations(event: string, baseId: string, tableId: string, record?: any, oldRecord?: any) {
  supabase.functions.invoke('automation-runner', {
    body: { event, baseId, tableId, record, oldRecord },
  }).catch((err) => {
    logWarn('Database', 'Automation failed:', err?.message ?? err);
    toast.warning('An automation failed to run. Check automation run history for details.');
  });
}

export function fireWebhooks(event: string, baseId: string, tableId: string, record?: any, oldRecord?: any) {
  supabase.functions.invoke('webhook-dispatcher', {
    body: { event, baseId, tableId, record, oldRecord },
  }).catch((err) => {
    logWarn('Webhooks', 'Webhook dispatch failed:', err?.message ?? err);
  });
}

/** True when the table's fields include the `updated_by` column (the "Last Modified By" system field). */
export function tableHasUpdatedBy(fields: ReadonlyArray<{ pg_column_name?: string | null }> | undefined): boolean {
  return !!fields?.some((f) => f.pg_column_name === 'updated_by');
}

/** Tables the database has told us have no `updated_by` column, so later edits do not try to stamp it. */
const tablesWithoutUpdatedBy = new Set<string>();

/** Test helper: forget which tables lack the column. */
export function resetUpdatedByMemory() {
  tablesWithoutUpdatedBy.clear();
}

/** True when a database error says the named column does not exist on the table. */
export function isMissingColumnError(error: unknown, column: string): boolean {
  const e = error as { code?: string; message?: string } | null;
  const message = e?.message ?? '';
  if (!message.includes(column)) return false;
  return e?.code === 'PGRST204' || e?.code === '42703' || /could not find|does not exist/i.test(message);
}

let _cachedUser: { id: string; email: string } | null = null;
async function getCachedUser() {
  if (_cachedUser) return _cachedUser;
  const { data } = await supabase.auth.getUser();
  if (data.user) _cachedUser = { id: data.user.id, email: data.user.email ?? '' };
  return _cachedUser;
}

function logRecordAudit(action: string, baseId: string, tableId: string, recordId?: string, newValue?: any, oldValue?: any) {
  getCachedUser().then((user) => {
    supabase.schema('nc_meta').from('audit_log').insert({
      base_id: baseId,
      table_id: tableId,
      record_id: recordId ?? null,
      user_id: user?.id ?? null,
      user_email: user?.email ?? null,
      action,
      old_value: oldValue ?? null,
      new_value: newValue ?? null,
      description: `${action} record${recordId ? ` ${recordId.slice(0, 8)}` : ''}`,
    }).then(({ error }) => {
      if (error) logWarn('Audit', 'Audit log failed:', error.message);
    });
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
  enabled?: boolean;
}

interface RecordsResult {
  records: RecordRow[];
  totalCount: number;
}

// Schema / table-name lookups, the combined table request and the caches behind
// them live in tableBootstrap.ts so every caller (records, record count,
// realtime channel, field list, view list) shares one set of requests.
export { primeTableName, primeBaseSchema } from './tableBootstrap';

export async function resolveTableContextShared(baseId: string, tableId: string) {
  return resolveTableContext(baseId, tableId);
}

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
}

export function applyFilter(
  query: any,
  col: string,
  operator: string,
  value: any,
  pgType: string,
): any {
  // "today", "this month" and the like become real dates now, so a saved view moves with the calendar.
  ({ operator, value } = normalizeDateFilter(operator, value, pgType) as { operator: string; value: any });
  switch (operator) {
    case 'is':
    case 'eq':
      return query.eq(col, value);
    case 'isNot':
    case 'neq':
      // "is not X" includes the rows where the cell is empty; a plain != would silently drop them.
      return query.or(`${col}.is.null,${col}.neq.${pgQuote(value)}`);
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
      if (pgType === 'TEXT[]') return query.or(`${col}.is.null,${col}.not.cs.{${value}}`);
      return query.or(`${col}.is.null,${col}.not.ilike.${pgQuote(`%${value}%`)}`);
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
      // An empty string only exists in text columns; asking a number or date column for one is an error.
      return isTextColumn(pgType) ? query.or(`${col}.is.null,${col}.eq.`) : query.is(col, null);
    case 'isNotEmpty':
      if (pgType === 'TEXT[]' || pgType === 'JSONB' || pgType.startsWith('JSONB')) {
        return query.not(col, 'is', null).not(col, 'eq', '{}').not(col, 'eq', '[]');
      }
      return isTextColumn(pgType) ? query.not(col, 'is', null).neq(col, '') : query.not(col, 'is', null);
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
      return query.or(`${col}.is.null,${col}.not.in.(${(Array.isArray(value) ? value : [value]).map((v: string) => pgQuote(v)).join(',')})`);
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
export function buildOrClauseFromFilters(
  filters: Filter[],
  fieldMap: Map<string, any>,
): string | null {
  const parts: string[] = [];
  for (const filter of filters) {
    const field = fieldMap.get(filter.field_id);
    if (!field) continue;
    if (isIncompleteFilter(filter.operator, filter.value)) continue;
    const col = field.pg_column_name;
    const pgType: string = field.pg_type;
    const norm = normalizeDateFilter(filter.operator, filter.value, pgType);
    const val: any = norm.value;

    switch (norm.operator) {
      case 'is':
      case 'eq':
        parts.push(`${col}.eq.${pgQuote(val)}`);
        break;
      case 'isNot':
      case 'neq':
        parts.push(`${col}.is.null,${col}.neq.${pgQuote(val)}`);
        break;
      case 'isExactly':
        parts.push(`${col}.eq.${pgQuote(val)}`);
        break;
      case 'contains':
        if (pgType === 'TEXT[]') parts.push(`${col}.cs.{${val}}`);
        else parts.push(`${col}.ilike.${pgQuote(`%${val}%`)}`);
        break;
      case 'doesNotContain':
        if (pgType === 'TEXT[]') parts.push(`${col}.not.cs.{${val}}`);
        else parts.push(`${col}.is.null,${col}.not.ilike.${pgQuote(`%${val}%`)}`);
        break;
      case 'startsWith':
        parts.push(`${col}.ilike.${pgQuote(`${val}%`)}`);
        break;
      case 'endsWith':
        parts.push(`${col}.ilike.${pgQuote(`%${val}`)}`);
        break;
      case 'isEmpty':
        parts.push(isTextColumn(pgType) ? `${col}.is.null,${col}.eq.""` : `${col}.is.null`);
        break;
      case 'isNotEmpty':
        parts.push(isTextColumn(pgType) ? `and(${col}.not.is.null,${col}.neq."")` : `${col}.not.is.null`);
        break;
      case 'gt':
      case 'isAfter':
        parts.push(`${col}.gt.${pgQuote(val)}`);
        break;
      case 'gte':
      case 'isOnOrAfter':
        parts.push(`${col}.gte.${pgQuote(val)}`);
        break;
      case 'lt':
      case 'isBefore':
        parts.push(`${col}.lt.${pgQuote(val)}`);
        break;
      case 'lte':
      case 'isOnOrBefore':
        parts.push(`${col}.lte.${pgQuote(val)}`);
        break;
      case 'isAnyOf': {
        const arr = Array.isArray(val) ? val : [val];
        parts.push(`${col}.in.(${arr.map((v: string) => pgQuote(v)).join(',')})`);
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
      if (!field || isIncompleteFilter(filter.operator, filter.value)) continue;
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
      if (!field || isIncompleteFilter(filter.operator, filter.value)) continue;
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
  const { baseId, tableId, page = 0, pageSize = 50, filters, filterGroups, sorts, search, enabled } = params;

  return useQuery({
    queryKey: ['nc', 'records', baseId, tableId, page, pageSize, filters, filterGroups, sorts, search],
    enabled: (enabled ?? true) && !!baseId && !!tableId,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    queryFn: async ({ client }): Promise<RecordsResult> => {
      const { fieldsMeta, fieldMap, ...ctx } = await resolveTableSchema(client, baseId, tableId);

      // Pre-resolve linked record filters (linkContains/linkDoesNotContain)
      let linkFilterIncludeIds: string[] | null = null;
      let linkFilterExcludeIds: string[] | null = null;
      const nonLinkFilters: Filter[] = [];

      if (filters && filters.length > 0) {
        for (const filter of filters) {
          const field = fieldMap.get(filter.field_id);
          if (!field) continue;
          if (filter.operator === 'linkContains' && filter.value) {
            const { data: lqData } = await supabase.functions.invoke('ddl-executor', {
              body: { action: 'linkedQuery', fieldId: field.id, mode: 'filter', searchTerm: filter.value },
            });
            linkFilterIncludeIds = lqData?.ids ?? [];
          } else if (filter.operator === 'linkDoesNotContain' && filter.value) {
            const { data: lqData } = await supabase.functions.invoke('ddl-executor', {
              body: { action: 'linkedQuery', fieldId: field.id, mode: 'filter', searchTerm: filter.value },
            });
            linkFilterExcludeIds = lqData?.ids ?? [];
          } else {
            nonLinkFilters.push(filter);
          }
        }
      }

      // Pre-resolve linked record sort ordering
      let linkSortOrderIds: string[] | null = null;
      const nonLinkSorts: Sort[] = [];

      if (sorts && sorts.length > 0) {
        for (const sort of sorts) {
          const field = fieldMap.get(sort.field_id);
          if (field?.ui_type === 'Links') {
            const { data: lqData } = await supabase.functions.invoke('ddl-executor', {
              body: { action: 'linkedQuery', fieldId: field.id, mode: 'sort', direction: sort.direction },
            });
            linkSortOrderIds = lqData?.ids ?? [];
          } else {
            nonLinkSorts.push(sort);
          }
        }
      }

      let query = supabase
        .schema(ctx.schemaName)
        .from(ctx.tableName)
        .select('*', { count: 'estimated' });

      // Apply linked record filter results
      if (linkFilterIncludeIds !== null) {
        if (linkFilterIncludeIds.length === 0) {
          return { records: [], totalCount: 0 };
        }
        query = query.in('id', linkFilterIncludeIds);
      }
      if (linkFilterExcludeIds !== null && linkFilterExcludeIds.length > 0) {
        for (const excludeId of linkFilterExcludeIds) {
          query = query.neq('id', excludeId);
        }
      }

      // Flat filters (AND-chained, legacy path) — non-link filters only
      for (const filter of nonLinkFilters) {
        const field = fieldMap.get(filter.field_id);
        if (!field) continue;
        query = applyFilter(query, field.pg_column_name, filter.operator, filter.value, field.pg_type);
      }

      // Nested filter groups
      if (filterGroups && filterGroups.length > 0) {
        for (const group of filterGroups) {
          query = applyFilterGroup(query, group, fieldMap);
        }
      }

      if (search) {
        const searchableTypes = new Set(['TEXT', 'VARCHAR', 'CHAR', 'UUID']);
        const textCols = (fieldsMeta ?? [])
          .filter((f: any) => searchableTypes.has(f.pg_type) && !f.pg_column_name?.startsWith('nc_'))
          .map((f: any) => f.pg_column_name);
        if (textCols.length > 0) {
          // Quoted, so a comma or bracket typed into the search box cannot break the request.
      const orClause = textCols.map((c: string) => `${c}.ilike.${pgQuote(`%${search}%`)}`).join(',');
          query = query.or(orClause);
        }
      }

      // When sorting by linked record, fetch up to 5000 records and reorder client-side
      if (linkSortOrderIds !== null) {
        const { data: allData, error: allError, count: allCount } = await query.limit(5000);
        if (allError) throw allError;

        const sortedRecords = (allData ?? []) as RecordRow[];
        const orderMap = new Map(linkSortOrderIds.map((id, idx) => [id, idx]));
        sortedRecords.sort((a, b) => {
          const ai = orderMap.get(a.id) ?? Number.MAX_SAFE_INTEGER;
          const bi = orderMap.get(b.id) ?? Number.MAX_SAFE_INTEGER;
          return ai - bi;
        });

        // Apply non-link sorts as tiebreakers
        // (not needed in practice since linkedQuery already handles full ordering)

        const from = page * pageSize;
        return {
          records: sortedRecords.slice(from, from + pageSize),
          totalCount: allCount ?? sortedRecords.length,
        };
      }

      // Pagination
      const from = page * pageSize;
      const to = from + pageSize - 1;
      query = query.range(from, to);

      // Sorting
      if (nonLinkSorts.length > 0) {
        for (const sort of nonLinkSorts) {
          const field = fieldMap.get(sort.field_id);
          if (field) {
            query = query.order(field.pg_column_name, { ascending: sort.direction === 'asc' });
          }
        }
      } else if (!sorts || sorts.length === 0) {
        query = query.order('nc_order', { ascending: true }).order('created_at', { ascending: true });
      }
      // A last, unique sort key: without it rows with equal values can swap places between pages.
      query = query.order('id', { ascending: true });

      const { data, error, count } = await query;
      if (error) throw error;

      return {
        records: (data ?? []) as RecordRow[],
        totalCount: count ?? 0,
      };
    },
  });
}

export interface UseInfiniteRecordsParams {
  baseId: string;
  tableId: string;
  pageSize?: number;
  filters?: Filter[];
  filterGroups?: FilterGroup[];
  sorts?: Sort[];
  search?: string;
  /** Hold the request back (for example until the open view's saved filters are known). */
  enabled?: boolean;
}

interface InfiniteRecordsPage {
  records: RecordRow[];
  totalCount: number;
  /** Where this page starts in the full list (pages after the first are larger, so an index would not say). */
  offset: number;
}

interface LinkQueryState {
  includeIds: string[] | null;
  excludeIds: string[] | null;
  nonLinkFilters: Filter[];
  sortIds: string[] | null;
  nonLinkSorts: Sort[];
}

type LinkFilterState = Pick<LinkQueryState, 'includeIds' | 'excludeIds' | 'nonLinkFilters'>;
type LinkSortState = Pick<LinkQueryState, 'sortIds' | 'nonLinkSorts'>;

// Filters and sorts are cached apart, so the footer (which has filters but no sort) shares the grid's answer
// and a change of sort does not ask the server about the filters again.
const linkFilterCache = new Map<string, { state: LinkFilterState; ts: number }>();
const linkSortCache = new Map<string, { state: LinkSortState; ts: number }>();
const LINK_STATE_TTL_MS = 30_000;

/**
 * Link filters ("contains record X") and link sorts are answered by a server
 * function; every other filter and sort goes straight onto the query. The answers
 * are kept for 30 seconds so paging does not repeat them.
 */
async function resolveLinkQueryState(
  tableId: string,
  filters: Filter[] | undefined,
  sorts: Sort[] | undefined,
  fieldMap: Map<string, FieldMeta>,
): Promise<LinkQueryState> {
  const [filterState, sortState] = await Promise.all([
    resolveLinkFilterState(tableId, filters, fieldMap),
    resolveLinkSortState(tableId, sorts, fieldMap),
  ]);
  return { ...filterState, ...sortState };
}

async function resolveLinkFilterState(
  tableId: string,
  filters: Filter[] | undefined,
  fieldMap: Map<string, FieldMeta>,
): Promise<LinkFilterState> {
  const key = JSON.stringify({ tableId, filters });
  const cached = linkFilterCache.get(key);
  if (cached && Date.now() - cached.ts <= LINK_STATE_TTL_MS) return cached.state;

  let infLinkIncludeIds: string[] | null = null;
  let infLinkExcludeIds: string[] | null = null;
  const infNonLinkFilters: Filter[] = [];

  if (filters && filters.length > 0) {
    for (const filter of filters) {
      const field = fieldMap.get(filter.field_id);
      if (!field) continue;
      if (filter.operator === 'linkContains' && filter.value) {
        const { data: lqData } = await supabase.functions.invoke('ddl-executor', {
          body: { action: 'linkedQuery', fieldId: field.id, mode: 'filter', searchTerm: filter.value },
        });
        infLinkIncludeIds = lqData?.ids ?? [];
      } else if (filter.operator === 'linkDoesNotContain' && filter.value) {
        const { data: lqData } = await supabase.functions.invoke('ddl-executor', {
          body: { action: 'linkedQuery', fieldId: field.id, mode: 'filter', searchTerm: filter.value },
        });
        infLinkExcludeIds = lqData?.ids ?? [];
      } else {
        infNonLinkFilters.push(filter);
      }
    }
  }

  const state: LinkFilterState = {
    includeIds: infLinkIncludeIds,
    excludeIds: infLinkExcludeIds,
    nonLinkFilters: infNonLinkFilters,
  };
  linkFilterCache.set(key, { state, ts: Date.now() });
  return state;
}

async function resolveLinkSortState(
  tableId: string,
  sorts: Sort[] | undefined,
  fieldMap: Map<string, FieldMeta>,
): Promise<LinkSortState> {
  if (!sorts || sorts.length === 0) return { sortIds: null, nonLinkSorts: [] };
  const key = JSON.stringify({ tableId, sorts });
  const cached = linkSortCache.get(key);
  if (cached && Date.now() - cached.ts <= LINK_STATE_TTL_MS) return cached.state;

  let infLinkSortIds: string[] | null = null;
  const infNonLinkSorts: Sort[] = [];
  for (const sort of sorts) {
    const field = fieldMap.get(sort.field_id);
    if (field?.ui_type === 'Links') {
      const { data: lqData } = await supabase.functions.invoke('ddl-executor', {
        body: { action: 'linkedQuery', fieldId: field.id, mode: 'sort', direction: sort.direction },
      });
      infLinkSortIds = lqData?.ids ?? [];
    } else {
      infNonLinkSorts.push(sort);
    }
  }

  const state: LinkSortState = { sortIds: infLinkSortIds, nonLinkSorts: infNonLinkSorts };
  linkSortCache.set(key, { state, ts: Date.now() });
  return state;
}

/**
 * Narrow a rows query by the view's filters, filter groups and the search box.
 * Returns null when the link filters already rule out every row, so the caller
 * can skip the request.
 */
function applyRecordFilters(
  query: any,
  state: LinkQueryState,
  filterGroups: FilterGroup[] | undefined,
  search: string | undefined,
  fieldMap: Map<string, FieldMeta>,
  fieldsMeta: FieldMeta[],
): any | null {
  let q = query;
  if (state.includeIds !== null) {
    if (state.includeIds.length === 0) return null;
    q = q.in('id', state.includeIds);
  }
  if (state.excludeIds !== null && state.excludeIds.length > 0) {
    for (const exId of state.excludeIds) {
      q = q.neq('id', exId);
    }
  }

  for (const filter of state.nonLinkFilters) {
    const field = fieldMap.get(filter.field_id);
    // A filter that has been added but not finished (no value yet) narrows nothing.
    if (!field || isIncompleteFilter(filter.operator, filter.value)) continue;
    q = applyFilter(q, field.pg_column_name, filter.operator, filter.value, field.pg_type);
  }

  if (filterGroups && filterGroups.length > 0) {
    for (const group of filterGroups) {
      q = applyFilterGroup(q, group, fieldMap);
    }
  }

  if (search) {
    const textCols = (fieldsMeta ?? [])
      .filter((f: any) => ['TEXT', 'VARCHAR'].includes(f.pg_type) && !f.pg_column_name.startsWith('nc_'))
      .map((f: any) => f.pg_column_name);
    if (textCols.length > 0) {
      const orClause = textCols.map((c: string) => `${c}.ilike.%${search}%`).join(',');
      q = q.or(orClause);
    }
  }
  return q;
}

/** Most rows the footer will read to total a column; beyond this it falls back to the loaded rows and says so. */
export const FOOTER_ROW_CAP = 20_000;
const FOOTER_PAGE = 1000;

/**
 * Only the named columns of every row that matches the view's filters, read in
 * pages of 1,000, so the footer can total the whole filtered table instead of
 * just the rows that are on screen. Sorting does not change a total, so there
 * is none beyond a stable order for paging. Stops at `cap` rows and reports it.
 */
export async function fetchColumnValues(
  client: QueryClient,
  params: { baseId: string; tableId: string; filters?: Filter[]; filterGroups?: FilterGroup[]; search?: string },
  columns: string[],
  cap: number = FOOTER_ROW_CAP,
): Promise<{ rows: RecordRow[]; truncated: boolean }> {
  const { fieldsMeta, fieldMap, ...ctx } = await resolveTableSchema(client, params.baseId, params.tableId);
  const state = await resolveLinkQueryState(params.tableId, params.filters, undefined, fieldMap);
  const select = ['id', ...new Set(columns.filter((c) => c !== 'id'))].join(', ');

  // A filter that matched thousands of linked rows is read in groups of ids (one long list is refused by the server).
  const states = needsSplitting(state.includeIds)
    ? chunkIds(state.includeIds as string[]).map((ids) => ({ ...state, includeIds: ids }))
    : [state];

  const rows: RecordRow[] = [];
  for (const groupState of states) {
    for (let from = 0; ; from += FOOTER_PAGE) {
      if (rows.length >= cap) return { rows, truncated: true };
      const base = supabase.schema(ctx.schemaName).from(ctx.tableName).select(select);
      const filtered = applyRecordFilters(base, groupState, params.filterGroups, params.search, fieldMap, fieldsMeta);
      if (!filtered) break;
      const { data, error } = await filtered
        .order('id', { ascending: true })
        .range(from, from + FOOTER_PAGE - 1);
      if (error) throw error;
      const page = (data ?? []) as RecordRow[];
      rows.push(...page);
      if (page.length < FOOTER_PAGE) break;
    }
  }
  return { rows, truncated: false };
}

export const DEFAULT_RECORDS_PAGE_SIZE = 100;

/**
 * The query definition for a table's rows. The grid and the prefetchers
 * (table hover, route entry) both build their query from this one function, so
 * a prefetched first page lands under exactly the key the grid later asks for.
 */
export function infiniteRecordsOptions(params: UseInfiniteRecordsParams) {
  const { baseId, tableId, pageSize = DEFAULT_RECORDS_PAGE_SIZE, filters, filterGroups, sorts, search, enabled } = params;

  return infiniteQueryOptions({
    queryKey: ['nc', 'records', baseId, tableId, 'infinite', pageSize, filters, filterGroups, sorts, search] as const,
    enabled: (enabled ?? true) && !!baseId && !!tableId,
    staleTime: 30_000,
    gcTime: 60_000,
    refetchOnWindowFocus: false,
    initialPageParam: 0,
    queryFn: async ({ pageParam, client }): Promise<InfiniteRecordsPage> => {
      const offset = pageParam as number;
      const { fieldsMeta, fieldMap, ...ctx } = await resolveTableSchema(client, baseId, tableId);

      // Pre-resolve linked record filters (cached across pages)
      const linkState = await resolveLinkQueryState(tableId, filters, sorts, fieldMap);
      const { sortIds: infLinkSortIds, nonLinkSorts: infNonLinkSorts } = linkState;

      // A link filter that matched many rows cannot go into one request address: fetch it in groups of ids.
      if (infLinkSortIds === null && needsSplitting(linkState.includeIds)) {
        const order: OrderKey[] = [];
        if (infNonLinkSorts.length > 0) {
          for (const sort of infNonLinkSorts) {
            const field = fieldMap.get(sort.field_id);
            if (field) order.push({ col: field.pg_column_name, ascending: sort.direction === 'asc' });
          }
        } else if (!sorts || sorts.length === 0) {
          order.push({ col: 'nc_order', ascending: true }, { col: 'created_at', ascending: true });
        }
        order.push({ col: 'id', ascending: true });
        const { from, to } = rangeFor(offset, pageSize);
        const keyColumns = [...new Set(order.map((o) => o.col))].join(',');
        const table = () => supabase.schema(ctx.schemaName).from(ctx.tableName);

        // 1. Of each group of ids, the sort keys of the first rows (enough to know which rows make this page).
        const keys: Array<Record<string, unknown> & { id: string }> = [];
        let total = 0;
        await runWithConcurrency(chunkIds(linkState.includeIds as string[]), 4, async (ids) => {
          const groupQuery = applyRecordFilters(
            table().select(keyColumns, { count: 'exact' }),
            { ...linkState, includeIds: ids },
            filterGroups,
            search,
            fieldMap,
            fieldsMeta,
          );
          if (!groupQuery) return;
          let gq = groupQuery;
          for (const o of order) gq = gq.order(o.col, { ascending: o.ascending });
          const { data: keyRows, error: keyError, count: groupCount } = await gq.limit(to + 1);
          if (keyError) throw keyError;
          total += groupCount ?? (keyRows ?? []).length;
          keys.push(...((keyRows ?? []) as unknown as Array<Record<string, unknown> & { id: string }>));
        });

        // 2. Put the groups together in order and cut out this page.
        const pageIds = pickPageIds(keys, order, from, to);

        // 3. Fetch the page's rows (in groups, so the request address stays short) and restore the order.
        const byId = new Map<string, RecordRow>();
        await runWithConcurrency(chunkIds(pageIds), 4, async (ids) => {
          const { data: pageRows, error: pageError } = await table().select('*').in('id', ids);
          if (pageError) throw pageError;
          for (const row of (pageRows ?? []) as RecordRow[]) byId.set(row.id, row);
        });
        return {
          records: pageIds.map((id) => byId.get(id)).filter((r): r is RecordRow => !!r),
          totalCount: total,
          offset,
        };
      }

      const filtered = applyRecordFilters(
        supabase.schema(ctx.schemaName).from(ctx.tableName).select('*', { count: 'estimated' }),
        linkState,
        filterGroups,
        search,
        fieldMap,
        fieldsMeta,
      );
      // The link filters already rule out every row.
      if (!filtered) return { records: [], totalCount: 0, offset };
      let q = filtered;

      if (infLinkSortIds !== null) {
        const { data: allData, error: allError, count: allCount } = await q.limit(5000);
        if (allError) throw allError;
        const sorted = (allData ?? []) as RecordRow[];
        const orderMap = new Map(infLinkSortIds.map((id, idx) => [id, idx]));
        sorted.sort((a, b) => (orderMap.get(a.id) ?? Infinity) - (orderMap.get(b.id) ?? Infinity));
        const { from, to } = rangeFor(offset, pageSize);
        return {
          records: sorted.slice(from, to + 1),
          totalCount: allCount ?? sorted.length,
          offset,
        };
      }

      const { from, to } = rangeFor(offset, pageSize);
      q = q.range(from, to);

      if (infNonLinkSorts.length > 0) {
        for (const sort of infNonLinkSorts) {
          const field = fieldMap.get(sort.field_id);
          if (field) {
            q = q.order(field.pg_column_name, { ascending: sort.direction === 'asc' });
          }
        }
      } else if (!sorts || sorts.length === 0) {
        q = q.order('nc_order', { ascending: true }).order('created_at', { ascending: true });
      }
      // A last, unique sort key: without it rows with equal values can swap places between pages.
      q = q.order('id', { ascending: true });

      const { data, error, count } = await q;
      if (error) throw error;

      return {
        records: (data ?? []) as RecordRow[],
        totalCount: count ?? 0,
        offset,
      };
    },
    getNextPageParam: (lastPage) => nextOffset(lastPage.offset, pageSize, lastPage.totalCount),
  });
}

const NO_RECORDS: RecordRow[] = [];

export function useInfiniteRecords(params: UseInfiniteRecordsParams) {
  const { tableId } = params;

  const query = useInfiniteQuery({
    ...infiniteRecordsOptions(params),
    // Changing a filter, sort or search keeps showing the rows already on screen until the new ones
    // arrive (no flash of skeleton). Never carried across tables: those rows belong to another table.
    placeholderData: (previous, previousQuery) =>
      previousQuery?.queryKey[3] === tableId ? previous : undefined,
  });

  // Memoised so the list keeps its identity between renders; a fresh array every render made every
  // consumer (formula evaluation, the grid) redo its work on every unrelated render.
  const allRecords = useMemo(
    () => (query.data ? query.data.pages.flatMap((p) => p.records) : NO_RECORDS),
    [query.data],
  );
  const totalCount = query.data?.pages[0]?.totalCount ?? 0;

  return {
    ...query,
    records: allRecords,
    totalCount,
  };
}

export function useReorderRows() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      baseId: string;
      tableId: string;
      rows: Array<{ id: string; nc_order: number }>;
    }) => {
      const ctx = await resolveTableContext(input.baseId, input.tableId);
      const { error } = await supabase
        .schema(ctx.schemaName)
        .from(ctx.tableName)
        .upsert(input.rows, { onConflict: 'id' });
      if (error) throw error;
    },
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ['nc', 'records', variables.baseId, variables.tableId] });
    },
    onError: () => {
      toast.error('Failed to reorder rows');
    },
  });
}

export function useRecordCount(baseId: string | null | undefined, tableId: string | null | undefined) {
  return useQuery({
    queryKey: ['nc', 'recordCount', baseId, tableId],
    enabled: !!baseId && !!tableId,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const ctx = await resolveTableContext(baseId!, tableId!);
      const { count, error } = await supabase
        .schema(ctx.schemaName)
        .from(ctx.tableName)
        .select('*', { count: 'estimated', head: true });
      if (error) throw error;
      return count ?? 0;
    },
  });
}

/**
 * The rows one cached records query holds, whatever its shape: a single page
 * (`{ records }`) or the grid's infinite list (`{ pages: [{ records }] }`).
 */
function cachedRows(data: unknown): RecordRow[] {
  const d = data as { records?: RecordRow[]; pages?: Array<{ records?: RecordRow[] }> } | null | undefined;
  if (Array.isArray(d?.records)) return d.records;
  if (Array.isArray(d?.pages)) return d.pages.flatMap((p) => p.records ?? []);
  return [];
}

/** Find a row by id in any of the cached records queries (every loaded page of each). */
function findCachedRecord(entries: ReadonlyArray<readonly [unknown, unknown]>, recordId: string): RecordRow | undefined {
  for (const [, data] of entries) {
    const rec = cachedRows(data).find((r) => r.id === recordId);
    if (rec) return rec;
  }
  return undefined;
}

function updateInfiniteCache<_T>(
  qc: ReturnType<typeof useQueryClient>,
  queryKeyPrefix: string[],
  updater: (records: RecordRow[]) => RecordRow[],
  countDelta = 0,
  /** For adding rows: in the grid's list of pages only the last page is changed, so a new row shows up once, at the end. */
  lastPageOnly = false,
) {
  qc.setQueriesData({ queryKey: queryKeyPrefix }, (old: any) => {
    if (!old) return old;
    if (Array.isArray(old.records)) {
      return { ...old, records: updater(old.records), totalCount: old.totalCount + countDelta };
    }
    if (old.pages && Array.isArray(old.pages)) {
      const lastIndex = old.pages.length - 1;
      return {
        ...old,
        pages: old.pages.map((page: any, i: number) => ({
          ...page,
          records: lastPageOnly && i !== lastIndex ? (page.records ?? []) : updater(page.records ?? []),
          totalCount: (page.totalCount ?? 0) + (i === 0 ? countDelta : 0),
        })),
      };
    }
    return old;
  });
}

export function useCreateRecord() {
  const qc = useQueryClient();

  return useMutation({
    mutationKey: ['nc', 'user-save'],
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
      const previous = qc.getQueriesData({ queryKey });
      const optimisticRow = { id: `temp-${Date.now()}`, ...variables.record } as RecordRow;
      updateInfiniteCache(qc, queryKey, (records) => [...records, optimisticRow], 1, true);
      return { previous };
    },
    onError: (_err, variables, context) => {
      if (context?.previous) {
        for (const [key, data] of context.previous) {
          qc.setQueryData(key, data);
        }
      }
      toast.error('Failed to create record');
    },
    onSuccess: (data, variables) => {
      qc.invalidateQueries({ queryKey: ['nc', 'records', variables.baseId, variables.tableId] });
      qc.invalidateQueries({ queryKey: ['nc', 'recordCount'] });
      fireAutomations('record.created', variables.baseId, variables.tableId, data);
      fireWebhooks('record.created', variables.baseId, variables.tableId, data);
      logRecordAudit('INSERT', variables.baseId, variables.tableId, data.id, data);
    },
  });
}

export function useUpdateRecord() {
  const qc = useQueryClient();

  return useMutation({
    mutationKey: ['nc', 'user-save'],
    mutationFn: async (input: {
      baseId: string;
      tableId: string;
      recordId: string;
      // Legacy single-field form (still supported for existing callers):
      field?: string; // pg_column_name
      value?: any;
      // New multi-field form — pass a map of pg_column_name -> value.
      fields?: Record<string, any>;
    }) => {
      const ctx = await resolveTableContext(input.baseId, input.tableId);
      const updates = input.fields ?? (input.field ? { [input.field]: input.value } : {});

      // Stamp the current user as the last modifier, but only where the table can take it. Tables from an
      // import or an older version have no `updated_by` column (the import even lists a "Last Modified By"
      // field for it), and the database rejects an update that names a column the table does not have,
      // which made every edit in those tables fail. So: skip the stamp when the table is known to lack the
      // column, and if the database says so, send the edit again without it and remember that.
      // If the table's fields are not loaded yet the stamp is tried anyway, as it always was; the resend below covers a missing column.
      const knownFields = qc.getQueryData<FieldMeta[]>(fieldsKey(input.tableId));
      const mayStamp = (knownFields === undefined || tableHasUpdatedBy(knownFields)) && !tablesWithoutUpdatedBy.has(input.tableId);
      const stampUser = mayStamp ? (await getCachedUser())?.id : undefined;

      const send = (payload: Record<string, any>) =>
        supabase
          .schema(ctx.schemaName)
          .from(ctx.tableName)
          .update(payload)
          .eq('id', input.recordId)
          .select()
          .single();

      let { data, error } = await send(stampUser ? { ...updates, updated_by: stampUser } : updates);
      if (error && stampUser && isMissingColumnError(error, 'updated_by')) {
        tablesWithoutUpdatedBy.add(input.tableId);
        ({ data, error } = await send(updates));
      }

      if (error) throw error;
      return data as RecordRow;
    },
    onMutate: async (variables) => {
      const queryKey = ['nc', 'records', variables.baseId, variables.tableId];

      await qc.cancelQueries({ queryKey });

      const previous = qc.getQueriesData<RecordsResult>({ queryKey });
      const updates = variables.fields ?? (variables.field ? { [variables.field]: variables.value } : {});

      // Capture the record's prior values (for the fields being changed) so we
      // can push an undo entry that restores them.
      let oldValues: Record<string, any> | null = null;
      const cachedRecord = findCachedRecord(previous, variables.recordId);
      if (cachedRecord) {
        oldValues = {};
        for (const key of Object.keys(updates)) {
          oldValues[key] = (cachedRecord as any)[key];
        }
      }

      if (oldValues) {
        const updateRecordFn = async (fields: Record<string, any>) => {
          const ctx = await resolveTableContext(variables.baseId, variables.tableId);
          const { error } = await supabase
            .schema(ctx.schemaName)
            .from(ctx.tableName)
            .update(fields)
            .eq('id', variables.recordId);
          if (error) throw error;
          qc.invalidateQueries({ queryKey });
        };

        useUndoStore.getState().push({
          type: 'cell_update',
          description: 'Update record',
          payload: { recordId: variables.recordId, oldValues, newValues: updates },
          undo: () => updateRecordFn(oldValues!),
          redo: () => updateRecordFn(updates),
        });
      }

      updateInfiniteCache(qc, queryKey, (records) =>
        records.map((r) => r.id === variables.recordId ? { ...r, ...updates } : r),
      );

      // Capture full old record for automation condition evaluation
      const foundRecord = findCachedRecord(previous, variables.recordId);
      const oldRecord: Record<string, any> | undefined = foundRecord ? { ...foundRecord } : undefined;

      return { previous, oldRecord };
    },
    onError: (_err, _variables, context) => {
      if (context?.previous) {
        for (const [key, data] of context.previous) {
          qc.setQueryData(key, data);
        }
      }
    },
    onSuccess: (data, variables, context) => {
      const updates = variables.fields ?? (variables.field ? { [variables.field]: variables.value } : {});
      fireAutomations('record.updated', variables.baseId, variables.tableId, data, context?.oldRecord);
      fireWebhooks('record.updated', variables.baseId, variables.tableId, data);
      logRecordAudit('UPDATE', variables.baseId, variables.tableId, variables.recordId, updates);
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

      const { id: _id, created_at: _ca, updated_at: _ua, nc_order: _nc, ...rest } = input.record;

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
    mutationKey: ['nc', 'user-save'],
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
    onMutate: async (variables) => {
      const queryKey = ['nc', 'records', variables.baseId, variables.tableId];
      await qc.cancelQueries({ queryKey });
      const previous = qc.getQueriesData<RecordsResult>({ queryKey });

      const deletedRecord: RecordRow | null = findCachedRecord(previous, variables.recordId) ?? null;

      if (deletedRecord) {
        const record = deletedRecord;
        useUndoStore.getState().push({
          type: 'row_delete',
          description: 'Delete record',
          payload: { record },
          undo: async () => {
            const ctx = await resolveTableContext(variables.baseId, variables.tableId);
            const { id: _id, ...rest } = record as any;
            const { error } = await supabase
              .schema(ctx.schemaName)
              .from(ctx.tableName)
              .insert({ id: _id, ...rest });
            if (error) throw error;
            qc.invalidateQueries({ queryKey });
          },
          redo: async () => {
            const ctx = await resolveTableContext(variables.baseId, variables.tableId);
            const { error } = await supabase
              .schema(ctx.schemaName)
              .from(ctx.tableName)
              .delete()
              .eq('id', variables.recordId);
            if (error) throw error;
            qc.invalidateQueries({ queryKey });
          },
        });
      }

      updateInfiniteCache(qc, queryKey, (records) =>
        records.filter((r) => r.id !== variables.recordId), -1,
      );
      return { previous };
    },
    onError: (_err, _variables, context) => {
      if (context?.previous) {
        for (const [key, data] of context.previous) {
          qc.setQueryData(key, data);
        }
      }
      toast.error('Failed to delete record');
    },
    onSuccess: (_data, variables) => {
      fireAutomations('record.deleted', variables.baseId, variables.tableId, { id: variables.recordId });
      fireWebhooks('record.deleted', variables.baseId, variables.tableId, { id: variables.recordId });
      logRecordAudit('DELETE', variables.baseId, variables.tableId, variables.recordId);
    },
    onSettled: (_data, _error, variables) => {
      qc.invalidateQueries({ queryKey: ['nc', 'records', variables.baseId, variables.tableId] });
    },
  });
}

export function useBulkCreateRecords() {
  const qc = useQueryClient();

  return useMutation({
    mutationKey: ['nc', 'user-save'],
    mutationFn: async (input: {
      baseId: string;
      tableId: string;
      records: Array<Record<string, any>>;
      onProgress?: (completed: number, total: number) => void;
    }) => {
      const ctx = await resolveTableContext(input.baseId, input.tableId);
      const batchSize = 50;
      const total = input.records.length;
      const batches: Array<Record<string, any>[]> = [];
      for (let i = 0; i < total; i += batchSize) {
        batches.push(input.records.slice(i, i + batchSize));
      }

      let created = 0;
      await runWithConcurrency(batches, 4, async (batch) => {
        const { error } = await supabase
          .schema(ctx.schemaName)
          .from(ctx.tableName)
          .insert(batch);
        if (error) throw error;
        created += batch.length;
        input.onProgress?.(created, total);
      });

      return { created };
    },
    onMutate: async (variables) => {
      const queryKey = ['nc', 'records', variables.baseId, variables.tableId];
      await qc.cancelQueries({ queryKey });
      const previous = qc.getQueriesData({ queryKey });
      const optimisticRows = variables.records.map((rec, i) => ({
        id: `temp-${Date.now()}-${i}`,
        ...rec,
      })) as RecordRow[];
      updateInfiniteCache(qc, queryKey, (records) => [...records, ...optimisticRows], optimisticRows.length, true);
      return { previous };
    },
    onSuccess: (data, variables) => {
      qc.invalidateQueries({ queryKey: ['nc', 'records', variables.baseId, variables.tableId] });
      qc.invalidateQueries({ queryKey: ['nc', 'recordCount', variables.baseId, variables.tableId] });
      fireAutomations('record.created', variables.baseId, variables.tableId, { count: data.created });
      fireWebhooks('record.created', variables.baseId, variables.tableId, { count: data.created });
      toast.success(`${data.created} record${data.created !== 1 ? 's' : ''} created`);
    },
    onError: (_err, _variables, context) => {
      if (context?.previous) {
        for (const [key, data] of context.previous) {
          qc.setQueryData(key, data);
        }
      }
      toast.error('Failed to create records');
    },
  });
}

export function useBulkUpdateRecords() {
  const qc = useQueryClient();

  return useMutation({
    mutationKey: ['nc', 'user-save'],
    mutationFn: async (input: {
      baseId: string;
      tableId: string;
      updates: Array<{ id: string; fields: Record<string, any> }>;
      onProgress?: (completed: number, total: number) => void;
    }) => {
      const ctx = await resolveTableContext(input.baseId, input.tableId);
      const batchSize = 50;
      const total = input.updates.length;
      const batches: Array<Array<{ id: string; fields: Record<string, any> }>> = [];
      for (let i = 0; i < total; i += batchSize) {
        batches.push(input.updates.slice(i, i + batchSize));
      }

      let updated = 0;
      await runWithConcurrency(batches, 4, async (batch) => {
        const rows = batch.map((u) => ({ id: u.id, ...u.fields }));
        const { error } = await supabase
          .schema(ctx.schemaName)
          .from(ctx.tableName)
          .upsert(rows, { onConflict: 'id' });
        if (error) throw error;
        updated += batch.length;
        input.onProgress?.(updated, total);
      });

      return { updated };
    },
    onMutate: async (variables) => {
      const queryKey = ['nc', 'records', variables.baseId, variables.tableId];
      await qc.cancelQueries({ queryKey });
      const previous = qc.getQueriesData({ queryKey });
      const updatesById = new Map(variables.updates.map((u) => [u.id, u.fields]));
      updateInfiniteCache(qc, queryKey, (records) =>
        records.map((r) => updatesById.has(r.id) ? { ...r, ...updatesById.get(r.id) } : r),
      );
      return { previous };
    },
    onSuccess: (data, variables) => {
      qc.invalidateQueries({ queryKey: ['nc', 'records', variables.baseId, variables.tableId] });
      fireAutomations('record.updated', variables.baseId, variables.tableId, { count: data.updated });
      fireWebhooks('record.updated', variables.baseId, variables.tableId, { count: data.updated });
    },
    onError: (_err, _variables, context) => {
      if (context?.previous) {
        for (const [key, data] of context.previous) {
          qc.setQueryData(key, data);
        }
      }
      toast.error('Failed to update records');
    },
  });
}

export function useBulkDeleteRecords() {
  const qc = useQueryClient();

  return useMutation({
    mutationKey: ['nc', 'user-save'],
    mutationFn: async (input: {
      baseId: string;
      tableId: string;
      recordIds: string[];
      onProgress?: (completed: number, total: number) => void;
    }) => {
      const ctx = await resolveTableContext(input.baseId, input.tableId);
      const batchSize = 50;
      const total = input.recordIds.length;
      const batches: string[][] = [];
      for (let i = 0; i < total; i += batchSize) {
        batches.push(input.recordIds.slice(i, i + batchSize));
      }

      let deleted = 0;
      await runWithConcurrency(batches, 4, async (batch) => {
        const { error } = await supabase
          .schema(ctx.schemaName)
          .from(ctx.tableName)
          .delete()
          .in('id', batch);
        if (error) throw error;
        deleted += batch.length;
        input.onProgress?.(deleted, total);
      });

      return { deleted };
    },
    onMutate: async (variables) => {
      const queryKey = ['nc', 'records', variables.baseId, variables.tableId];
      await qc.cancelQueries({ queryKey });
      const idsSet = new Set(variables.recordIds);
      const previous = qc.getQueriesData({ queryKey });
      updateInfiniteCache(
        qc,
        queryKey,
        (records) => records.filter((r) => !idsSet.has(r.id)),
        -variables.recordIds.length,
      );
      return { previous };
    },
    onError: (_err, _variables, context) => {
      if (context?.previous) {
        for (const [key, data] of context.previous) {
          qc.setQueryData(key, data);
        }
      }
      toast.error('Failed to delete records');
    },
    onSuccess: (data, variables) => {
      fireAutomations('record.deleted', variables.baseId, variables.tableId, { count: data.deleted });
      fireWebhooks('record.deleted', variables.baseId, variables.tableId, { count: data.deleted });
    },
    onSettled: (_data, _error, variables) => {
      qc.invalidateQueries({ queryKey: ['nc', 'records', variables.baseId, variables.tableId] });
      qc.invalidateQueries({ queryKey: ['nc', 'recordCount', variables.baseId, variables.tableId] });
    },
  });
}

