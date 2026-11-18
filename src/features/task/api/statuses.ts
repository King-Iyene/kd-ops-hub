import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

export type TaskStatusCategory = 'not_started' | 'active' | 'done' | 'closed';

export interface TaskStatus {
  id: string;
  space_id: string;
  name: string;
  color: string;
  category: TaskStatusCategory;
  position: number;
}

export function useStatuses(spaceId: string | undefined) {
  return useQuery({
    queryKey: ['tk', 'space', spaceId, 'statuses'],
    enabled: !!spaceId,
    staleTime: 15_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tk_statuses')
        .select('id, space_id, name, color, category, position')
        .eq('space_id', spaceId as string)
        .order('position');
      if (error) throw error;
      return data as TaskStatus[];
    },
  });
}

function invalidateStatuses(qc: ReturnType<typeof useQueryClient>, spaceId: string) {
  qc.invalidateQueries({ queryKey: ['tk', 'space', spaceId, 'statuses'] });
}

export function useCreateStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { spaceId: string; name: string; color: string; category: TaskStatusCategory; position: number }) => {
      const { error } = await supabase.from('tk_statuses').insert({
        space_id: input.spaceId,
        name: input.name,
        color: input.color,
        category: input.category,
        position: input.position,
      });
      if (error) throw error;
    },
    onSuccess: (_d, vars) => invalidateStatuses(qc, vars.spaceId),
  });
}

export function useUpdateStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; spaceId: string; patch: Partial<Pick<TaskStatus, 'name' | 'color' | 'category' | 'position'>> }) => {
      const { error } = await supabase.from('tk_statuses').update(input.patch).eq('id', input.id);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => invalidateStatuses(qc, vars.spaceId),
  });
}

export function useDeleteStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; spaceId: string }) => {
      const { error } = await supabase.from('tk_statuses').delete().eq('id', input.id);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => invalidateStatuses(qc, vars.spaceId),
  });
}
