import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

export interface WorkspaceUser {
  id: string;
  email: string;
  full_name: string;
  photo_url?: string | null;
}

/**
 * Real system users for People/User fields.
 *
 * Reads `profiles_directory` (the same anon-safe directory view the Tasks
 * page uses for assignees) rather than `profiles`, so the picker shows the
 * same people, with the same active/invited filtering, everywhere.
 */
export function useWorkspaceUsers() {
  return useQuery({
    queryKey: ['nc', 'workspace-users'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles_directory')
        .select('id, full_name, email, photo_url, status')
        .eq('is_anonymised', false)
        .in('status', ['active', 'invited'])
        .order('full_name')
        .limit(500);
      if (error) throw error;
      return ((data ?? []) as Array<Record<string, unknown>>).map((p) => ({
        id: String(p.id),
        email: String(p.email ?? ''),
        full_name: String(p.full_name ?? p.email ?? ''),
        photo_url: (p.photo_url as string | null) ?? null,
      })) as WorkspaceUser[];
    },
    staleTime: 5 * 60 * 1000,
  });
}
