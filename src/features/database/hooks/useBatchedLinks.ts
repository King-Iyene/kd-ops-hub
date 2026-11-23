import { createContext, useContext, useMemo } from 'react';
import { useQueries, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { FieldMeta } from '../types';
import { chunk, linkLabel, looksLikeId, mapJunctionRows, type JunctionRow } from '../lib/linkBatch';

/**
 * Loads the linked records for a whole column at once.
 *
 * The old cell renderer ran two requests per link cell, so a screen with five
 * link columns and forty rows fired about four hundred requests. This hook
 * runs a handful per page of rows, caches them, and shares the result with
 * every cell (and with the formula engine) through context.
 *
 * Query keys start with ['nc', 'linked-records'] so the existing link and
 * unlink mutations refresh them without any extra wiring.
 */

export interface LinkedItem {
  id: string;
  label: string;
}

/** fieldId -> recordId -> linked items. A missing record means "not loaded yet". */
export type BatchedLinks = Map<string, Map<string, LinkedItem[]>>;

export interface LinkDataValue {
  links: BatchedLinks;
  isLoading: boolean;
  /** Link fields that are preloaded; cells for any other link field load on their own. */
  fieldIds: ReadonlySet<string>;
}

export const LinkDataContext = createContext<LinkDataValue | null>(null);

export function useLinkData(): LinkDataValue | null {
  return useContext(LinkDataContext);
}

const CHUNK_SIZE = 80;
const PAGE = 1000;
const MAX_PAGES = 25;

interface FieldLinkMeta {
  schema: string;
  junctionTable: string | null;
  srcTable: string;
  tgtTable: string;
  primaryColumn: string | null;
  linkType: string | undefined;
  fkColumn: string | undefined;
}

async function resolveFieldLinkMeta(
  qc: QueryClient,
  baseId: string,
  field: FieldMeta,
): Promise<FieldLinkMeta | null> {
  const relatedTableId = field.options?.relatedTableId as string | undefined;
  if (!relatedTableId) return null;
  return qc.fetchQuery({
    queryKey: ['nc', 'link-field-meta', baseId, field.id],
    staleTime: Infinity,
    gcTime: 10 * 60_000,
    queryFn: async (): Promise<FieldLinkMeta | null> => {
      const meta = supabase.schema('nc_meta');
      const [baseRes, linkRes, srcRes, tgtRes] = await Promise.all([
        meta.from('bases').select('schema_name').eq('id', baseId).single(),
        meta.from('links').select('junction_table_id').eq('field_id', field.id).maybeSingle(),
        meta.from('tables').select('pg_table_name').eq('id', field.table_id).single(),
        meta.from('tables').select('pg_table_name, primary_field_id').eq('id', relatedTableId).single(),
      ]);
      if (!baseRes.data || !srcRes.data || !tgtRes.data) return null;

      let junctionTable: string | null = null;
      const junctionId = (linkRes.data as { junction_table_id?: string | null } | null)?.junction_table_id;
      if (junctionId) {
        const { data } = await meta.from('tables').select('pg_table_name').eq('id', junctionId).single();
        junctionTable = (data as { pg_table_name: string } | null)?.pg_table_name ?? null;
      }

      let primaryColumn: string | null = null;
      const primaryId = (tgtRes.data as { primary_field_id?: string | null }).primary_field_id;
      if (primaryId) {
        const { data } = await meta.from('fields').select('pg_column_name').eq('id', primaryId).single();
        primaryColumn = (data as { pg_column_name: string } | null)?.pg_column_name ?? null;
      }
      if (!primaryColumn) {
        const { data } = await meta
          .from('fields')
          .select('pg_column_name')
          .eq('table_id', relatedTableId)
          .eq('is_primary', true)
          .maybeSingle();
        primaryColumn = (data as { pg_column_name: string } | null)?.pg_column_name ?? null;
      }

      return {
        schema: (baseRes.data as { schema_name: string }).schema_name,
        junctionTable,
        srcTable: (srcRes.data as { pg_table_name: string }).pg_table_name,
        tgtTable: (tgtRes.data as { pg_table_name: string }).pg_table_name,
        primaryColumn,
        linkType: field.options?.type as string | undefined,
        fkColumn: field.options?.fkColumnName as string | undefined,
      };
    },
  });
}

/** Read every page of a filtered query (PostgREST caps one response at 1000 rows). */
async function readAll<T>(
  run: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<T[]> {
  const rows: T[] = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const { data, error } = await run(page * PAGE, page * PAGE + PAGE - 1);
    if (error || !data) break;
    rows.push(...data);
    if (data.length < PAGE) break;
  }
  return rows;
}

/** record id -> ids of the records it links to, for one field and one chunk of records. */
async function fetchLinkedIds(
  meta: FieldLinkMeta,
  recordIds: string[],
): Promise<Map<string, string[]>> {
  const idSet = new Set(recordIds);
  const db = supabase.schema(meta.schema);

  if (meta.junctionTable) {
    const table = meta.junctionTable;
    const [bySource, byTarget] = await Promise.all([
      readAll<JunctionRow>((from, to) =>
        db.from(table).select('source_id, target_id').in('source_id', recordIds).range(from, to),
      ),
      readAll<JunctionRow>((from, to) =>
        db.from(table).select('source_id, target_id').in('target_id', recordIds).range(from, to),
      ),
    ]);
    return mapJunctionRows([...bySource, ...byTarget], idSet);
  }

  const result = new Map<string, string[]>();
  if (meta.linkType === 'hm') {
    const fk = meta.fkColumn || `${meta.srcTable}_id`;
    const rows = await readAll<Record<string, string>>((from, to) =>
      db.from(meta.tgtTable).select(`id, ${fk}`).in(fk, recordIds).range(from, to),
    );
    for (const row of rows) {
      const owner = row[fk];
      if (!owner) continue;
      const list = result.get(owner) ?? [];
      list.push(row.id);
      result.set(owner, list);
    }
  } else if (meta.linkType === 'bt') {
    const fk = meta.fkColumn || `${meta.tgtTable}_id`;
    const rows = await readAll<Record<string, string>>((from, to) =>
      db.from(meta.srcTable).select(`id, ${fk}`).in('id', recordIds).range(from, to),
    );
    for (const row of rows) {
      if (row[fk]) result.set(row.id, [row[fk]]);
    }
  }
  return result;
}

async function fetchLabels(meta: FieldLinkMeta, targetIds: string[]): Promise<Map<string, string>> {
  const labels = new Map<string, string>();
  const column = meta.primaryColumn;
  const db = supabase.schema(meta.schema);
  for (const part of chunk(targetIds, 100)) {
    const { data } = await db
      .from(meta.tgtTable)
      .select(column ? `id, ${column}` : 'id')
      .in('id', part);
    for (const row of (data ?? []) as unknown as Record<string, unknown>[]) {
      const text = column ? linkLabel(row[column]) : '';
      // A label that is really an id is shown as an unnamed record, never as the id.
      labels.set(String(row.id), text && !looksLikeId(text) ? text : 'Unnamed record');
    }
  }
  return labels;
}

async function fetchChunk(
  qc: QueryClient,
  baseId: string,
  field: FieldMeta,
  recordIds: string[],
): Promise<Record<string, LinkedItem[]>> {
  const meta = await resolveFieldLinkMeta(qc, baseId, field);
  if (!meta) return {};
  const idMap = await fetchLinkedIds(meta, recordIds);
  const targetIds = [...new Set([...idMap.values()].flat())];
  const labels = targetIds.length > 0 ? await fetchLabels(meta, targetIds) : new Map<string, string>();
  const out: Record<string, LinkedItem[]> = {};
  // Every requested record gets an entry so "no links" is distinguishable from "not loaded".
  for (const recordId of recordIds) {
    out[recordId] = (idMap.get(recordId) ?? []).map((id) => ({ id, label: labels.get(id) ?? 'Unnamed record' }));
  }
  return out;
}

export function useBatchedLinks(
  baseId: string | null | undefined,
  linkFields: FieldMeta[],
  recordIds: string[],
): { links: BatchedLinks; isLoading: boolean } {
  const qc = useQueryClient();
  const chunks = useMemo(() => chunk(recordIds, CHUNK_SIZE), [recordIds]);

  const queries = useMemo(
    () =>
      baseId
        ? linkFields.flatMap((field) =>
            chunks.map((ids) => ({
              queryKey: ['nc', 'linked-records', 'batched', baseId, field.id, ids.join(',')],
              staleTime: 60_000,
              gcTime: 5 * 60_000,
              refetchOnWindowFocus: false,
              queryFn: () => fetchChunk(qc, baseId, field, ids),
              meta: { fieldId: field.id },
            })),
          )
        : [],
    [baseId, linkFields, chunks, qc],
  );

  const results = useQueries({ queries });

  const stamp = results.map((r) => r.dataUpdatedAt).join('|');
  const links = useMemo<BatchedLinks>(() => {
    const out: BatchedLinks = new Map();
    results.forEach((result, i) => {
      const fieldId = (queries[i]?.meta as { fieldId: string } | undefined)?.fieldId;
      if (!fieldId || !result.data) return;
      let perField = out.get(fieldId);
      if (!perField) {
        perField = new Map();
        out.set(fieldId, perField);
      }
      for (const [recordId, items] of Object.entries(result.data)) perField.set(recordId, items);
    });
    return out;
    // `stamp` changes whenever any chunk finishes loading or refreshes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stamp, queries]);

  return { links, isLoading: results.some((r) => r.isLoading) };
}
