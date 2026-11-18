import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

export interface TaskTag {
  id: string;
  space_id: string;
  name: string;
  color: string;
}

export function useTags(spaceId: string | undefined) {
  return useQuery({
    queryKey: ['tk', 'space', spaceId, 'tags'],
    enabled: !!spaceId,
    staleTime: 15_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tk_tags')
        .select('id, space_id, name, color')
        .eq('space_id', spaceId as string)
        .order('name');
      if (error) throw error;
      return data as TaskTag[];
    },
  });
}

function invalidateTags(qc: ReturnType<typeof useQueryClient>, spaceId: string) {
  qc.invalidateQueries({ queryKey: ['tk', 'space', spaceId, 'tags'] });
}

export function useCreateTag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { spaceId: string; name: string; color: string }) => {
      const { error } = await supabase.from('tk_tags').insert({ space_id: input.spaceId, name: input.name, color: input.color });
      if (error) throw error;
    },
    onSuccess: (_d, vars) => invalidateTags(qc, vars.spaceId),
  });
}

export function useUpdateTag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; spaceId: string; patch: Partial<Pick<TaskTag, 'name' | 'color'>> }) => {
      const { error } = await supabase.from('tk_tags').update(input.patch).eq('id', input.id);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => invalidateTags(qc, vars.spaceId),
  });
}

export function useDeleteTag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; spaceId: string }) => {
      const { error } = await supabase.from('tk_tags').delete().eq('id', input.id);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => invalidateTags(qc, vars.spaceId),
  });
}
