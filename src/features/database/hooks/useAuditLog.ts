import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { AuditLogEntry } from '../types';

const PAGE_SIZE = 50;

export function useAuditLog(baseId: string | null, page = 0) {
  return useQuery({
    queryKey: ['audit_log', baseId, page],
    queryFn: async () => {
      if (!baseId) return { entries: [] as AuditLogEntry[], hasMore: false };
      const from = page * PAGE_SIZE;
      const to = from + PAGE_SIZE;
      const { data, error } = await supabase
        .schema('nc_meta')
        .from('audit_log')
        .select('*')
        .eq('base_id', baseId)
        .order('created_at', { ascending: false })
        .range(from, to);
      if (error) throw error;
      const entries = (data ?? []) as AuditLogEntry[];
      return {
        entries: entries.slice(0, PAGE_SIZE),
        hasMore: entries.length > PAGE_SIZE,
      };
    },
    enabled: !!baseId,
  });
}
