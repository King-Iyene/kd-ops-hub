import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

export type TaskEntityType = 'task' | 'record';

export interface TaskComment {
  id: string;
  entity_type: TaskEntityType;
  entity_id: string;
  body: unknown;
  body_text: string;
  created_by: string;
  author_name: string;
  author_photo_url: string | null;
  edited_at: string | null;
  created_at: string;
}

export function useComments(entityType: TaskEntityType, entityId: string | undefined) {
  return useQuery({
    queryKey: ['tk', 'comments', entityType, entityId],
    enabled: !!entityId,
    staleTime: 10_000,
    queryFn: async () => {
      const { data: rows, error } = await supabase
        .from('tk_comments')
        .select('id, entity_type, entity_id, body, body_text, created_by, edited_at, created_at')
        .eq('entity_type', entityType)
        .eq('entity_id', entityId as string)
        .order('created_at');
      if (error) throw error;

      const authorIds = [...new Set((rows ?? []).map((r) => r.created_by))];
      let profiles: { id: string; full_name: string; photo_url: string | null }[] = [];
      if (authorIds.length > 0) {
        const { data, error: profErr } = await supabase
          .from('profiles_directory')
          .select('id, full_name, photo_url')
          .in('id', authorIds);
        if (profErr) throw profErr;
        profiles = data ?? [];
      }
      const byId = new Map(profiles.map((p) => [p.id, p]));

      return (rows ?? []).map((r) => ({
        ...r,
        author_name: byId.get(r.created_by)?.full_name ?? 'Unknown',
        author_photo_url: byId.get(r.created_by)?.photo_url ?? null,
      })) as TaskComment[];
    },
  });
}

function invalidateComments(qc: ReturnType<typeof useQueryClient>, entityType: TaskEntityType, entityId: string) {
  qc.invalidateQueries({ queryKey: ['tk', 'comments', entityType, entityId] });
  qc.invalidateQueries({ queryKey: ['tk', 'activity', entityType, entityId] });
}

export function useCreateComment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      entityType: TaskEntityType;
      entityId: string;
      body: unknown;
      bodyText: string;
      mentions: string[];
      createdBy: string;
    }) => {
      const { error } = await supabase.from('tk_comments').insert({
        entity_type: input.entityType,
        entity_id: input.entityId,
        body: input.body,
        body_text: input.bodyText,
        mentions: input.mentions,
        created_by: input.createdBy,
      });
      if (error) throw error;
    },
    onSuccess: (_d, vars) => invalidateComments(qc, vars.entityType, vars.entityId),
  });
}

export function useUpdateComment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; entityType: TaskEntityType; entityId: string; body: unknown; bodyText: string }) => {
      const { error } = await supabase
        .from('tk_comments')
        .update({ body: input.body, body_text: input.bodyText, edited_at: new Date().toISOString() })
        .eq('id', input.id);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => invalidateComments(qc, vars.entityType, vars.entityId),
  });
}

export function useDeleteComment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; entityType: TaskEntityType; entityId: string }) => {
      const { error } = await supabase.from('tk_comments').delete().eq('id', input.id);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => invalidateComments(qc, vars.entityType, vars.entityId),
  });
}
