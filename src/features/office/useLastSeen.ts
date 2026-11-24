import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

/** When each person was last in the Office (profile id to ISO time), refreshed every minute while the list is open. */
export function useLastSeen() {
  return useQuery({
    queryKey: ['office', 'lastSeen'],
    refetchInterval: 60_000,
    staleTime: 30_000,
    queryFn: async (): Promise<Map<string, string>> => {
      const { data } = await supabase.from('office_last_seen' as never).select('profile_id, seen_at');
      return new Map(((data ?? []) as unknown as { profile_id: string; seen_at: string }[]).map((r) => [r.profile_id, r.seen_at]));
    },
  });
}

/** While the Office is open, note that I am here: once when it opens, then every two minutes (never on a re-draw). */
export function useKeepSeen(profileId: string | undefined) {
  useEffect(() => {
    if (!profileId) return;
    const mark = () => { void supabase.from('office_last_seen' as never).upsert({ profile_id: profileId, seen_at: new Date().toISOString() } as never).then(() => undefined, () => undefined); };
    mark();
    const t = window.setInterval(mark, 120_000);
    return () => { window.clearInterval(t); mark(); };
  }, [profileId]);
}
