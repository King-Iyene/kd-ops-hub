import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { FieldMeta, RecordRow } from '../types';
import { chunk } from '../lib/linkBatch';
import { createBatcher } from './metaLookups';
import { fetchLinkedIds, resolveFieldLinkMeta, type FieldLinkMeta } from './useBatchedLinks';

/**
 * The linked records themselves (whole rows) for lookup and rollup cells, loaded in batches.
 *
 * Each lookup or rollup cell used to ask for its own record's links and then the linked rows: two requests
 * per cell, so a page of rows in a table with a few such columns sent hundreds. Cells that ask in the same
 * moment are now folded together: one request finds the links of all those rows, one request per chunk
 * fetches the linked rows. TanStack Query remains the cache (so edits that invalidate it still refresh the
 * cells); the batcher itself remembers nothing.
 */

/** Whole rows by id, in chunks to keep the request address short. */
async function fetchRowsByIds(meta: FieldLinkMeta, ids: string[]): Promise<Map<string, RecordRow>> {
  const rows = new Map<string, RecordRow>();
  for (const part of chunk(ids, 100)) {
    const { data, error } = await supabase.schema(meta.schema).from(meta.tgtTable).select('*').in('id', part);
    if (error) throw error;
    for (const row of (data ?? []) as RecordRow[]) rows.set(String(row.id), row);
  }
  return rows;
}

/** Link field and record ids in, linked rows per record out. Exported for tests. */
export async function loadLinkedRows(meta: FieldLinkMeta, recordIds: string[]): Promise<Map<string, RecordRow[]>> {
  const idMap = await fetchLinkedIds(meta, recordIds);
  const targetIds = [...new Set([...idMap.values()].flat())];
  const rows = targetIds.length > 0 ? await fetchRowsByIds(meta, targetIds) : new Map<string, RecordRow>();
  const out = new Map<string, RecordRow[]>();
  for (const recordId of recordIds) {
    out.set(recordId, (idMap.get(recordId) ?? []).map((id) => rows.get(id)).filter((r): r is RecordRow => !!r));
  }
  return out;
}

const batchers = new Map<string, ReturnType<typeof createBatcher<RecordRow[]>>>();

function batcherFor(qc: QueryClient, baseId: string, field: FieldMeta) {
  const key = `${baseId}:${field.id}`;
  let batcher = batchers.get(key);
  if (!batcher) {
    batcher = createBatcher<RecordRow[]>(
      async (recordIds) => {
        const meta = await resolveFieldLinkMeta(qc, baseId, field);
        return meta ? loadLinkedRows(meta, recordIds) : new Map<string, RecordRow[]>();
      },
      { ttlMs: 0 },
    );
    batchers.set(key, batcher);
  }
  return batcher;
}

/** Test helper: forget the batchers. */
export function resetLinkedRecordBatchers() {
  for (const b of batchers.values()) b.clear();
  batchers.clear();
}

const NO_ROWS: RecordRow[] = [];

export function useBatchedLinkedRecords(opts: {
  baseId: string | null | undefined;
  /** The link field on the record's own table. */
  linkField: FieldMeta | null | undefined;
  recordId: string | null | undefined;
  enabled: boolean;
}) {
  const { baseId, linkField, recordId, enabled } = opts;
  const qc = useQueryClient();
  return useQuery({
    // Starts with ['nc', 'linked-records'], so link and unlink mutations refresh it without extra wiring.
    queryKey: ['nc', 'linked-records', 'rows-batched', baseId, linkField?.id, recordId],
    enabled: enabled && !!baseId && !!linkField && !!recordId,
    staleTime: 30_000,
    gcTime: 5 * 60_000,
    refetchOnWindowFocus: false,
    queryFn: async (): Promise<RecordRow[]> => (await batcherFor(qc, baseId!, linkField!).get(recordId!)) ?? NO_ROWS,
  });
}
