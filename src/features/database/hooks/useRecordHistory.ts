import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { AuditLogEntry } from '../types';

export function useRecordHistory(
  baseId: string | null | undefined,
  tableId: string | null | undefined,
  recordId: string | null | undefined,
) {
  return useQuery({
    queryKey: ['record_history', baseId, tableId, recordId],
    queryFn: async () => {
      if (!recordId) return [] as AuditLogEntry[];
      let query = supabase
        .schema('nc_meta')
        .from('audit_log')
        .select('*')
        .eq('record_id', recordId)
        .order('created_at', { ascending: false })
        .limit(100);

      if (baseId) query = query.eq('base_id', baseId);
      if (tableId) query = query.eq('table_id', tableId);

      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as AuditLogEntry[];
    },
    enabled: !!recordId,
    staleTime: 30_000,
  });
}
