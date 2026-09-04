import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { AuditLogEntry } from '../types';

const PAGE_SIZE = 50;

export function useAuditLog(
  baseId: string | null,
  page = 0,
  actionFilter?: string | null,
  search?: string | null,
) {
  return useQuery({
    queryKey: ['audit_log', baseId, page, actionFilter, search],
    queryFn: async () => {
      if (!baseId) return { entries: [] as AuditLogEntry[], hasMore: false };
      const from = page * PAGE_SIZE;
      const to = from + PAGE_SIZE;
      let query = supabase
        .schema('nc_meta')
        .from('audit_log')
        .select('*')
        .eq('base_id', baseId)
        .order('created_at', { ascending: false });

      if (actionFilter && actionFilter !== 'ALL') {
        query = query.eq('action', actionFilter);
      }
      if (search?.trim()) {
        const q = `%${search.trim()}%`;
        query = query.or(`description.ilike.${q},user_email.ilike.${q}`);
      }

      const { data, error } = await query.range(from, to);
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
