import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { TaskEntityType } from './comments';

export interface TaskActivityEntry {
  id: string;
  entity_type: TaskEntityType;
  entity_id: string;
  actor_id: string | null;
  actor_name: string;
  action: string;
  diff: Record<string, { before: unknown; after: unknown }> | null;
  created_at: string;
}

export function useActivity(entityType: TaskEntityType, entityId: string | undefined) {
  return useQuery({
    queryKey: ['tk', 'activity', entityType, entityId],
    enabled: !!entityId,
    staleTime: 10_000,
    queryFn: async () => {
      const { data: rows, error } = await supabase
        .from('tk_activity_log')
        .select('id, entity_type, entity_id, actor_id, action, diff, created_at')
        .eq('entity_type', entityType)
        .eq('entity_id', entityId as string)
        .order('created_at');
      if (error) throw error;

      const actorIds = [...new Set((rows ?? []).map((r) => r.actor_id).filter((id): id is string => !!id))];
      let profiles: { id: string; full_name: string }[] = [];
      if (actorIds.length > 0) {
        const { data, error: profErr } = await supabase
          .from('profiles_directory')
          .select('id, full_name')
          .in('id', actorIds);
        if (profErr) throw profErr;
        profiles = data ?? [];
      }
      const byId = new Map(profiles.map((p) => [p.id, p.full_name]));

      return (rows ?? []).map((r) => ({
        ...r,
        actor_name: (r.actor_id && byId.get(r.actor_id)) || 'Someone',
      })) as TaskActivityEntry[];
    },
  });
}
