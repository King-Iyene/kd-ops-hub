import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

export interface PlatformTask {
  id: string;
  title: string;
  status: string | null;
}

/**
 * Rows from the REAL production `public.tasks` table, for the
 * "Linked Tasks" field type. This deliberately does not go through the
 * nc_meta record layer — Linked Tasks points at the platform's own task
 * list, not at another nc_meta table (that's what the Links field is for).
 */
export function usePlatformTasks(publicToken?: string, publicPassword?: string) {
  return useQuery({
    queryKey: ['nc', 'platform-tasks', publicToken ?? null],
    queryFn: async () => {
      if (publicToken) {
        // Unauthenticated shared-form visitor: anon cannot read public.tasks
        // directly, so use the anon-safe RPC gated on the share token.
        const { data, error } = await supabase
          .schema('nc_meta')
          .rpc('shared_form_tasks', { p_share_token: publicToken, p_password: publicPassword ?? null });
        if (error) throw error;
        return ((data ?? []) as Array<Record<string, unknown>>).map((t) => ({
          id: String(t.id),
          title: String(t.title ?? 'Untitled task'),
          status: (t.status as string | null) ?? null,
        })) as PlatformTask[];
      }
      const { data, error } = await supabase
        .from('tasks')
        .select('id, title, status')
        .order('created_at', { ascending: false })
        .limit(1000);
      if (error) throw error;
      return ((data ?? []) as Array<Record<string, unknown>>).map((t) => ({
        id: String(t.id),
        title: String(t.title ?? 'Untitled task'),
        status: (t.status as string | null) ?? null,
      })) as PlatformTask[];
    },
    staleTime: 60 * 1000,
  });
}
