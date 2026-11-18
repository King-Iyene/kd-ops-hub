import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';

export interface TaskPerson {
  id: string;
  full_name: string;
  email: string | null;
  photo_url: string | null;
}

/** People the viewer may pick from for members, assignees and mentions —
 *  tk_visible_people (everyone for owner/admin, self + direct reports for a
 *  manager, self for a member), joined against the safe profiles_directory
 *  view rather than the base profiles table (section 4.1 / DECISIONS.md).
 *  Keyed by user id — see useTaskRole for why identity-dependent queries
 *  must never share a cache entry across accounts. */
export function useVisiblePeople() {
  const userId = useAuthStore((s) => s.user?.id);
  return useQuery({
    queryKey: ['tk', 'people', 'visible', userId],
    enabled: !!userId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data: idRows, error: idErr } = await supabase.rpc('tk_visible_people');
      if (idErr) throw idErr;
      const ids = (idRows ?? []).map((r: { person_id: string }) => r.person_id);
      if (ids.length === 0) return [] as TaskPerson[];

      const { data, error } = await supabase
        .from('profiles_directory')
        .select('id, full_name, email, photo_url')
        .in('id', ids)
        .neq('is_anonymised', true)
        .order('full_name');
      if (error) throw error;
      return (data ?? []) as TaskPerson[];
    },
  });
}
