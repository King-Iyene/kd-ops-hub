import { supabase } from '@/lib/supabase';
import { chunk } from '../lib/linkBatch';
import { primeTableName } from './tableBootstrap';

/**
 * Small lookups into the metadata tables (a table's name, a field's column, a
 * link's junction table), shared by everything on the screen.
 *
 * A grid with several link columns used to ask for these one record at a time
 * and once per column, which put dozens of near-identical requests on the wire
 * before the first row showed its links. Here every caller that asks within the
 * same moment is folded into one `in (...)` request, answers are remembered for
 * a few minutes, and a repeat of a question that is already on its way waits
 * for that answer instead of sending its own.
 */

const TTL_MS = 300_000;
/** Callers that arrive within this many milliseconds share one request. */
const WINDOW_MS = 4;
/** Keys per request, to keep the address of the request short. */
const KEYS_PER_REQUEST = 100;

interface Batcher<V> {
  get(key: string): Promise<V | null>;
  /** Forget everything (tests, and after the schema is changed). */
  clear(): void;
}

/**
 * A batching, caching loader. `load` receives the distinct keys that were asked
 * for and returns what it found; a key it does not return resolves to null. If
 * `load` throws, every key waiting on it is rejected and nothing is cached, so
 * the next caller tries again.
 */
export function createBatcher<V>(load: (keys: string[]) => Promise<Map<string, V>>): Batcher<V> {
  const cache = new Map<string, { value: V | null; ts: number }>();
  const waiting = new Map<string, Array<{ resolve: (v: V | null) => void; reject: (e: unknown) => void }>>();
  const inFlight = new Map<string, Promise<V | null>>();
  let timer: ReturnType<typeof setTimeout> | null = null;

  async function flush() {
    timer = null;
    const batch = new Map(waiting);
    waiting.clear();
    const keys = [...batch.keys()];
    for (const part of chunk(keys, KEYS_PER_REQUEST)) {
      try {
        const found = await load(part);
        for (const key of part) {
          const value = found.get(key) ?? null;
          cache.set(key, { value, ts: Date.now() });
          for (const w of batch.get(key) ?? []) w.resolve(value);
        }
      } catch (error) {
        for (const key of part) for (const w of batch.get(key) ?? []) w.reject(error);
      }
    }
  }

  return {
    get(key) {
      const hit = cache.get(key);
      if (hit && Date.now() - hit.ts < TTL_MS) return Promise.resolve(hit.value);

      const pending = inFlight.get(key);
      if (pending) return pending;

      const promise = new Promise<V | null>((resolve, reject) => {
        const list = waiting.get(key) ?? [];
        list.push({ resolve, reject });
        waiting.set(key, list);
        if (!timer) timer = setTimeout(() => { void flush(); }, WINDOW_MS);
      }).finally(() => {
        if (inFlight.get(key) === promise) inFlight.delete(key);
      });
      inFlight.set(key, promise);
      // A caller handles its own failure; this keeps an abandoned lookup from raising an unhandled rejection.
      promise.catch(() => {});
      return promise;
    },
    clear() {
      cache.clear();
      inFlight.clear();
      waiting.clear();
      if (timer) { clearTimeout(timer); timer = null; }
    },
  };
}

export interface TableMetaRow {
  id: string;
  pg_table_name: string;
  primary_field_id: string | null;
}

const tableMeta = createBatcher<TableMetaRow>(async (ids) => {
  const { data, error } = await supabase
    .schema('nc_meta')
    .from('tables')
    .select('id, pg_table_name, primary_field_id')
    .in('id', ids);
  if (error) throw error;
  const out = new Map<string, TableMetaRow>();
  for (const row of (data ?? []) as TableMetaRow[]) {
    out.set(row.id, row);
    // The record queries look table names up by the same key, so give them this answer too.
    primeTableName(row.id, row.pg_table_name);
  }
  return out;
});

const fieldColumn = createBatcher<string>(async (ids) => {
  const { data, error } = await supabase
    .schema('nc_meta')
    .from('fields')
    .select('id, pg_column_name')
    .in('id', ids);
  if (error) throw error;
  const out = new Map<string, string>();
  for (const row of (data ?? []) as Array<{ id: string; pg_column_name: string | null }>) {
    if (row.pg_column_name) out.set(row.id, row.pg_column_name);
  }
  return out;
});

const linkJunction = createBatcher<string>(async (fieldIds) => {
  const { data, error } = await supabase
    .schema('nc_meta')
    .from('links')
    .select('field_id, junction_table_id')
    .in('field_id', fieldIds);
  if (error) throw error;
  const out = new Map<string, string>();
  for (const row of (data ?? []) as Array<{ field_id: string; junction_table_id: string | null }>) {
    if (row.junction_table_id) out.set(row.field_id, row.junction_table_id);
  }
  return out;
});

/** A table's pg name and primary field, or null if it does not exist. */
export function getTableMeta(tableId: string): Promise<TableMetaRow | null> {
  return tableMeta.get(tableId);
}

/** The database column behind a field (used for a table's primary field), or null. */
export function getFieldColumn(fieldId: string): Promise<string | null> {
  return fieldColumn.get(fieldId);
}

/** The id of the junction table behind a link field, or null if the link has none. */
export function getLinkJunctionTableId(fieldId: string): Promise<string | null> {
  return linkJunction.get(fieldId);
}

/** Test helper. */
export function resetMetaLookups() {
  tableMeta.clear();
  fieldColumn.clear();
  linkJunction.clear();
}
