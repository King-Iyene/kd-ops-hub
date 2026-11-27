import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { toast } from '../components/toast-store';
import { resolveTableContextShared as resolveTableContext, removeRowsFromRecordsCache } from './useRecords';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface TrashEntry {
  id: string;
  base_id: string;
  table_id: string;
  record_id: string;
  deleted_by: string | null;
  deleted_at: string;
  record_data: Record<string, any>;
  expires_at: string;
}

/* ------------------------------------------------------------------ */
/*  Queries                                                            */
/* ------------------------------------------------------------------ */

export function useTrashRecords(baseId: string | null) {
  return useQuery<TrashEntry[]>({
    queryKey: ['nc', 'trash', baseId],
    enabled: !!baseId,
    queryFn: async () => {
      const { data, error } = await supabase
        .schema('nc_meta')
        .from('trash')
        .select('*')
        .eq('base_id', baseId!)
        .order('deleted_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as TrashEntry[];
    },
  });
}

/* ------------------------------------------------------------------ */
/*  Mutations                                                          */
/* ------------------------------------------------------------------ */

export async function restoreByRecordId(baseId: string, tableId: string, recordId: string) {
  const { data: trashEntry } = await supabase
    .schema('nc_meta')
    .from('trash')
    .select('*')
    .eq('base_id', baseId)
    .eq('record_id', recordId)
    .order('deleted_at', { ascending: false })
    .limit(1)
    .single();
  if (!trashEntry) return;
  const ctx = await resolveTableContext(baseId, tableId);
  await supabase.schema(ctx.schemaName).from(ctx.tableName).insert(trashEntry.record_data);
  await supabase.schema('nc_meta').from('trash').delete().eq('id', trashEntry.id);
}

/** Put deleted rows back (used by Ctrl+Z) and refresh the lists. */
export async function restoreRecords(
  qc: ReturnType<typeof useQueryClient>,
  baseId: string,
  tableId: string,
  recordIds: string[],
) {
  for (const id of recordIds) await restoreByRecordId(baseId, tableId, id);
  qc.invalidateQueries({ queryKey: ['nc', 'records', baseId, tableId] });
  qc.invalidateQueries({ queryKey: ['nc', 'recordCount', baseId, tableId] });
  qc.invalidateQueries({ queryKey: ['nc', 'trash', baseId] });
}

export function useSoftDeleteRecord() {
  const qc = useQueryClient();

  const restoreFn = async (input: { baseId: string; tableId: string; recordId: string }) => {
    try {
      await restoreByRecordId(input.baseId, input.tableId, input.recordId);
      toast.success('Record restored');
      qc.invalidateQueries({ queryKey: ['nc', 'records', input.baseId, input.tableId] });
      qc.invalidateQueries({ queryKey: ['nc', 'recordCount', input.baseId, input.tableId] });
      qc.invalidateQueries({ queryKey: ['nc', 'trash', input.baseId] });
    } catch {
      toast.error('Failed to restore record');
    }
  };

  return useMutation({
    mutationKey: ['nc', 'user-save'],
    mutationFn: async (input: {
      baseId: string;
      tableId: string;
      recordId: string;
    }) => {
      const ctx = await resolveTableContext(input.baseId, input.tableId);

      // 1. Read the full record
      const { data: record, error: readErr } = await supabase
        .schema(ctx.schemaName)
        .from(ctx.tableName)
        .select('*')
        .eq('id', input.recordId)
        .single();
      if (readErr) throw readErr;

      // 2. Get current user
      const { data: { user } } = await supabase.auth.getUser();

      // 3. Insert into trash
      const { error: trashErr } = await supabase
        .schema('nc_meta')
        .from('trash')
        .insert({
          base_id: input.baseId,
          table_id: input.tableId,
          record_id: input.recordId,
          deleted_by: user?.id ?? null,
          record_data: record,
        });
      if (trashErr) throw trashErr;

      // 4. Hard-delete from the data table
      const { error: delErr } = await supabase
        .schema(ctx.schemaName)
        .from(ctx.tableName)
        .delete()
        .eq('id', input.recordId);
      if (delErr) throw delErr;
    },
    // The row leaves the grid the moment you delete it; the server catches up in the background.
    onMutate: async (variables) => {
      await qc.cancelQueries({ queryKey: ['nc', 'records', variables.baseId, variables.tableId] });
      return { previous: removeRowsFromRecordsCache(qc, variables.baseId, variables.tableId, [variables.recordId]) };
    },
    onSuccess: (_data, variables) => {
      toast.success('Moved to trash', {
        duration: 3000,
        action: {
          label: 'Undo',
          onClick: () => {
            restoreFn({ baseId: variables.baseId, tableId: variables.tableId, recordId: variables.recordId });
          },
        },
      });
      qc.invalidateQueries({ queryKey: ['nc', 'recordCount', variables.baseId, variables.tableId] });
      qc.invalidateQueries({ queryKey: ['nc', 'trash', variables.baseId] });
    },
    onError: (_err, variables, context) => {
      if (context?.previous) for (const [key, data] of context.previous) qc.setQueryData(key, data);
      qc.invalidateQueries({ queryKey: ['nc', 'records', variables.baseId, variables.tableId] });
      toast.error('Failed to move record to trash');
    },
  });
}

export function useBulkSoftDeleteRecords() {
  const qc = useQueryClient();

  return useMutation({
    mutationKey: ['nc', 'user-save'],
    mutationFn: async (input: {
      baseId: string;
      tableId: string;
      recordIds: string[];
    }) => {
      const ctx = await resolveTableContext(input.baseId, input.tableId);
      const { data: { user } } = await supabase.auth.getUser();

      // Process in batches of 50
      const batchSize = 50;
      for (let i = 0; i < input.recordIds.length; i += batchSize) {
        const batch = input.recordIds.slice(i, i + batchSize);

        // Read records
        const { data: records, error: readErr } = await supabase
          .schema(ctx.schemaName)
          .from(ctx.tableName)
          .select('*')
          .in('id', batch);
        if (readErr) throw readErr;

        // Insert into trash
        const trashEntries = (records ?? []).map((rec: any) => ({
          base_id: input.baseId,
          table_id: input.tableId,
          record_id: rec.id,
          deleted_by: user?.id ?? null,
          record_data: rec,
        }));

        if (trashEntries.length > 0) {
          const { error: trashErr } = await supabase
            .schema('nc_meta')
            .from('trash')
            .insert(trashEntries);
          if (trashErr) throw trashErr;
        }

        // Hard-delete from data table
        const { error: delErr } = await supabase
          .schema(ctx.schemaName)
          .from(ctx.tableName)
          .delete()
          .in('id', batch);
        if (delErr) throw delErr;
      }
    },
    onMutate: async (variables) => {
      await qc.cancelQueries({ queryKey: ['nc', 'records', variables.baseId, variables.tableId] });
      return { previous: removeRowsFromRecordsCache(qc, variables.baseId, variables.tableId, variables.recordIds) };
    },
    onSuccess: (_data, variables) => {
      toast.success(`${variables.recordIds.length} record(s) moved to trash`, { duration: 3000 });
      qc.invalidateQueries({ queryKey: ['nc', 'recordCount', variables.baseId, variables.tableId] });
      qc.invalidateQueries({ queryKey: ['nc', 'trash', variables.baseId] });
    },
    onError: (_err, variables, context) => {
      if (context?.previous) for (const [key, data] of context.previous) qc.setQueryData(key, data);
      qc.invalidateQueries({ queryKey: ['nc', 'records', variables.baseId, variables.tableId] });
      toast.error('Failed to move records to trash');
    },
  });
}

export function useRestoreRecord() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (input: { trashId: string; baseId: string; tableId: string }) => {
      // 1. Read the trash entry
      const { data: trashEntry, error: readErr } = await supabase
        .schema('nc_meta')
        .from('trash')
        .select('*')
        .eq('id', input.trashId)
        .single();
      if (readErr) throw readErr;

      const ctx = await resolveTableContext(input.baseId, input.tableId);

      // 2. Re-insert into original table
      const { error: insertErr } = await supabase
        .schema(ctx.schemaName)
        .from(ctx.tableName)
        .insert(trashEntry.record_data);
      if (insertErr) throw insertErr;

      // 3. Delete from trash
      const { error: delErr } = await supabase
        .schema('nc_meta')
        .from('trash')
        .delete()
        .eq('id', input.trashId);
      if (delErr) throw delErr;
    },
    onSuccess: (_data, variables) => {
      toast.success('Record restored');
      qc.invalidateQueries({ queryKey: ['nc', 'records', variables.baseId, variables.tableId] });
      qc.invalidateQueries({ queryKey: ['nc', 'recordCount', variables.baseId, variables.tableId] });
      qc.invalidateQueries({ queryKey: ['nc', 'trash', variables.baseId] });
    },
    onError: () => {
      toast.error('Failed to restore record');
    },
  });
}

export function usePermanentlyDeleteRecord() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (input: { trashId: string; baseId: string }) => {
      const { error } = await supabase
        .schema('nc_meta')
        .from('trash')
        .delete()
        .eq('id', input.trashId);
      if (error) throw error;
    },
    onSuccess: (_data, variables) => {
      toast.success('Record permanently deleted');
      qc.invalidateQueries({ queryKey: ['nc', 'trash', variables.baseId] });
    },
    onError: () => {
      toast.error('Failed to permanently delete record');
    },
  });
}

export function useEmptyTrash() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (input: { baseId: string }) => {
      const { error } = await supabase
        .schema('nc_meta')
        .from('trash')
        .delete()
        .eq('base_id', input.baseId);
      if (error) throw error;
    },
    onSuccess: (_data, variables) => {
      toast.success('Trash emptied');
      qc.invalidateQueries({ queryKey: ['nc', 'trash', variables.baseId] });
    },
    onError: () => {
      toast.error('Failed to empty trash');
    },
  });
}
