import type { QueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { FieldMeta, ViewMeta } from '../types';

/**
 * Everything the grid needs to know about a table before it can ask for rows:
 * which schema and table the rows live in, the columns, and the saved views.
 *
 * Opening a table used to fire these as five or six separate requests (the
 * base's schema, the table's name, the columns twice in two shapes, the views),
 * some of them repeated by different parts of the screen, and the rows request
 * only started after the slowest of them. This module collapses them:
 *
 * - one request (a PostgREST embed) returns the table, its base's schema name,
 *   its fields and its views together. If the embed is ever refused the same
 *   data is loaded by the old separate requests, in parallel;
 * - the result is written straight into the TanStack caches that useFields and
 *   useViews read, so those hooks find fresh data and send nothing;
 * - concurrent callers for the same table share one in-flight promise.
 */

export const META_TTL_MS = 300_000;
/** Same freshness window useFields and useViews declare as their staleTime. */
export const META_FRESH_MS = 30_000;

export const fieldsKey = (tableId: string | null | undefined) => ['nc', 'fields', tableId] as const;
export const viewsKey = (tableId: string | null | undefined) => ['nc', 'views', tableId] as const;

// ── Plain fetchers (shared by the hooks and by the fallback path) ──────────

export async function fetchFields(tableId: string): Promise<FieldMeta[]> {
  const { data, error } = await supabase
    .schema('nc_meta')
    .from('fields')
    .select('*')
    .eq('table_id', tableId)
    .order('position');
  if (error) throw error;
  return data as FieldMeta[];
}

export async function fetchViews(tableId: string): Promise<ViewMeta[]> {
  const { data, error } = await supabase
    .schema('nc_meta')
    .from('views')
    .select('*')
    .eq('table_id', tableId)
    .order('position');
  if (error) throw error;
  return data as ViewMeta[];
}

// ── Schema / table name caches ─────────────────────────────────────────────

const contextCache = new Map<string, { schemaName: string; tableName: string; ts: number }>();
const baseSchemaCache = new Map<string, { schemaName: string; ts: number }>();
const baseSchemaInFlight = new Map<string, Promise<string>>();
const tableNameCache = new Map<string, { tableName: string; ts: number }>();
const contextInFlight = new Map<string, Promise<{ schemaName: string; tableName: string }>>();
const bootstrapInFlight = new Map<string, Promise<TableBootstrap>>();
/** Set once the server has refused the combined (embedded) request, so later opens skip straight to the fallback. */
let embedUnsupported = false;

const fresh = (ts: number) => Date.now() - ts < META_TTL_MS;

/** Hand over a table's pg name that something else already fetched (the table list does). */
export function primeTableName(tableId: string, pgTableName: string) {
  tableNameCache.set(tableId, { tableName: pgTableName, ts: Date.now() });
}

/** Hand over a base's schema name that something else already fetched (the base list does). */
export function primeBaseSchema(baseId: string, schemaName: string) {
  if (!schemaName) return;
  baseSchemaCache.set(baseId, { schemaName, ts: Date.now() });
}

function primeTableContext(baseId: string, tableId: string, schemaName: string, tableName: string) {
  contextCache.set(`${baseId}:${tableId}`, { schemaName, tableName, ts: Date.now() });
  primeBaseSchema(baseId, schemaName);
  primeTableName(tableId, tableName);
}

/** Test helper: forget everything this module remembers. */
export function resetBootstrapCaches() {
  contextCache.clear();
  baseSchemaCache.clear();
  baseSchemaInFlight.clear();
  tableNameCache.clear();
  contextInFlight.clear();
  bootstrapInFlight.clear();
  embedUnsupported = false;
}

// A base's schema_name is the same for every one of its tables; concurrent
// callers asking for the same base share one request.
export async function resolveBaseSchema(baseId: string): Promise<string> {
  const cached = baseSchemaCache.get(baseId);
  if (cached && fresh(cached.ts)) return cached.schemaName;

  const inFlight = baseSchemaInFlight.get(baseId);
  if (inFlight) return inFlight;

  const promise = (async () => {
    const { data, error } = await supabase
      .schema('nc_meta')
      .from('bases')
      .select('schema_name')
      .eq('id', baseId)
      .single();
    if (error) throw error;
    const schemaName = data.schema_name as string;
    baseSchemaCache.set(baseId, { schemaName, ts: Date.now() });
    return schemaName;
  })();
  baseSchemaInFlight.set(baseId, promise);
  try {
    return await promise;
  } finally {
    baseSchemaInFlight.delete(baseId);
  }
}

/** The two-request lookup, with no knowledge of the combined request. */
async function resolveTableContextDirect(baseId: string, tableId: string) {
  const primed = tableNameCache.get(tableId);
  const usePrimed = primed && fresh(primed.ts);

  const [schemaName, tableName] = await Promise.all([
    resolveBaseSchema(baseId),
    usePrimed
      ? Promise.resolve(primed.tableName)
      : supabase.schema('nc_meta').from('tables').select('pg_table_name').eq('id', tableId).single()
          .then(({ data, error }) => {
            if (error) throw error;
            return data.pg_table_name as string;
          }),
  ]);

  primeTableContext(baseId, tableId, schemaName, tableName);
  return { schemaName, tableName };
}

/**
 * Schema and table name for a table. Cached, and concurrent callers share one
 * lookup (the records query, the record count and the realtime channel all ask
 * at once and used to send three identical `tables` requests). If the combined
 * table request is already on its way the answer is taken from it.
 */
export async function resolveTableContext(baseId: string, tableId: string) {
  const key = `${baseId}:${tableId}`;
  const cached = contextCache.get(key);
  if (cached && fresh(cached.ts)) {
    return { schemaName: cached.schemaName, tableName: cached.tableName };
  }

  const boot = bootstrapInFlight.get(tableId);
  if (boot) {
    try {
      const b = await boot;
      return { schemaName: b.schemaName, tableName: b.tableName };
    } catch {
      /* the separate lookup below reports a real failure */
    }
  }

  const inFlight = contextInFlight.get(key);
  if (inFlight) return inFlight;

  const promise = resolveTableContextDirect(baseId, tableId);
  contextInFlight.set(key, promise);
  try {
    return await promise;
  } finally {
    contextInFlight.delete(key);
  }
}

// ── The combined request ───────────────────────────────────────────────────

export interface TableBootstrap {
  schemaName: string;
  tableName: string;
  fields: FieldMeta[];
  views: ViewMeta[];
}

/** Turn the embedded PostgREST row into a TableBootstrap, or null when it is not usable. Pure. */
export function parseEmbeddedBootstrap(row: unknown): TableBootstrap | null {
  if (!row || typeof row !== 'object') return null;
  const r = row as {
    pg_table_name?: unknown;
    bases?: { schema_name?: unknown } | Array<{ schema_name?: unknown }> | null;
    fields?: unknown;
    views?: unknown;
  };
  const base = Array.isArray(r.bases) ? r.bases[0] : r.bases;
  const schemaName = base && typeof base.schema_name === 'string' ? base.schema_name : '';
  const tableName = typeof r.pg_table_name === 'string' ? r.pg_table_name : '';
  if (!schemaName || !tableName) return null;
  if (!Array.isArray(r.fields) || !Array.isArray(r.views)) return null;
  return {
    schemaName,
    tableName,
    fields: sortByPosition(r.fields as FieldMeta[]),
    views: sortByPosition(r.views as ViewMeta[]),
  };
}

/** Embedded ordering is requested from the server; this keeps the order right even if it is not honoured. Stable. */
function sortByPosition<T extends { position?: number | null }>(items: T[]): T[] {
  return items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => ((a.item.position ?? 0) - (b.item.position ?? 0)) || a.index - b.index)
    .map((x) => x.item);
}

async function fetchEmbedded(tableId: string): Promise<TableBootstrap | null> {
  if (embedUnsupported) return null;
  const { data, error } = await (supabase.schema('nc_meta') as any)
    .from('tables')
    .select('pg_table_name, base_id, bases(schema_name), fields(*), views(*)')
    .eq('id', tableId)
    .order('position', { referencedTable: 'fields' })
    .order('position', { referencedTable: 'views' })
    .maybeSingle();
  if (error) {
    // A PostgREST or SQL-level refusal (ambiguous relationship, unknown column) will not get better, so
    // stop trying for this session. A network problem might, so that case just falls back once.
    const code = String((error as { code?: string }).code ?? '');
    if (code.startsWith('PGRST') || code.startsWith('42')) embedUnsupported = true;
    return null;
  }
  return parseEmbeddedBootstrap(data);
}

/** The combined request for a table if one is running right now. */
export function peekBootstrapInFlight(tableId: string | null | undefined): Promise<TableBootstrap> | undefined {
  return tableId ? bootstrapInFlight.get(tableId) : undefined;
}

function isFreshQuery(qc: QueryClient, key: readonly unknown[]): boolean {
  const state = qc.getQueryState(key);
  return !!state && state.data !== undefined && !state.isInvalidated && Date.now() - state.dataUpdatedAt < META_FRESH_MS;
}

function readFreshBootstrap(qc: QueryClient, baseId: string, tableId: string): TableBootstrap | null {
  const ctx = contextCache.get(`${baseId}:${tableId}`);
  if (!ctx || !fresh(ctx.ts)) return null;
  if (!isFreshQuery(qc, fieldsKey(tableId)) || !isFreshQuery(qc, viewsKey(tableId))) return null;
  return {
    schemaName: ctx.schemaName,
    tableName: ctx.tableName,
    fields: qc.getQueryData<FieldMeta[]>(fieldsKey(tableId)) ?? [],
    views: qc.getQueryData<ViewMeta[]>(viewsKey(tableId)) ?? [],
  };
}

async function loadBootstrap(qc: QueryClient, baseId: string, tableId: string): Promise<TableBootstrap> {
  let boot: TableBootstrap | null = null;
  try {
    boot = await fetchEmbedded(tableId);
  } catch {
    boot = null;
  }
  if (!boot) {
    // The same data by the separate requests, all at once.
    const [ctx, fields, views] = await Promise.all([
      resolveTableContextDirect(baseId, tableId),
      fetchFields(tableId),
      fetchViews(tableId),
    ]);
    boot = { schemaName: ctx.schemaName, tableName: ctx.tableName, fields, views };
  }
  primeTableContext(baseId, tableId, boot.schemaName, boot.tableName);
  qc.setQueryData(fieldsKey(tableId), boot.fields);
  qc.setQueryData(viewsKey(tableId), boot.views);
  return boot;
}

/**
 * Load (or find already loaded) a table's context, fields and views, and put
 * them in the query caches. Safe to call from anywhere, any number of times.
 */
export function ensureTableBootstrap(qc: QueryClient, baseId: string, tableId: string): Promise<TableBootstrap> {
  const inFlight = bootstrapInFlight.get(tableId);
  if (inFlight) return inFlight;

  const cached = readFreshBootstrap(qc, baseId, tableId);
  if (cached) return Promise.resolve(cached);

  const promise: Promise<TableBootstrap> = loadBootstrap(qc, baseId, tableId).finally(() => {
    if (bootstrapInFlight.get(tableId) === promise) bootstrapInFlight.delete(tableId);
  });
  bootstrapInFlight.set(tableId, promise);
  // Whoever awaits it handles a failure; this keeps a fire-and-forget caller from raising an unhandled rejection.
  promise.catch(() => {});
  return promise;
}

// ── What the records query needs ───────────────────────────────────────────

export interface TableSchema {
  schemaName: string;
  tableName: string;
  fieldsMeta: FieldMeta[];
  fieldMap: Map<string, FieldMeta>;
}

const fieldMapCache = new WeakMap<FieldMeta[], Map<string, FieldMeta>>();

export function fieldMapFor(fields: FieldMeta[]): Map<string, FieldMeta> {
  let map = fieldMapCache.get(fields);
  if (!map) {
    map = new Map(fields.map((f) => [f.id, f]));
    fieldMapCache.set(fields, map);
  }
  return map;
}

/**
 * Schema, table name and columns for building a records request. Uses the
 * fields the grid already has in its cache; if there are none it takes them
 * from the combined request (which also fills the cache, so the field list on
 * screen does not send its own).
 */
export async function resolveTableSchema(qc: QueryClient, baseId: string, tableId: string): Promise<TableSchema> {
  const cachedFields = qc.getQueryData<FieldMeta[]>(fieldsKey(tableId));
  if (cachedFields) {
    const ctx = await resolveTableContext(baseId, tableId);
    return { ...ctx, fieldsMeta: cachedFields, fieldMap: fieldMapFor(cachedFields) };
  }
  const boot = await ensureTableBootstrap(qc, baseId, tableId);
  return {
    schemaName: boot.schemaName,
    tableName: boot.tableName,
    fieldsMeta: boot.fields,
    fieldMap: fieldMapFor(boot.fields),
  };
}
