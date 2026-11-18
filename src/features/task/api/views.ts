import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { FilterTree } from '../filter/types';

export type TaskViewType = 'list' | 'board' | 'calendar' | 'table' | 'grid';

export interface TaskViewConfig {
  filter: FilterTree;
  groupBy: string;
  sortBy: string;
  meOnly: boolean;
  showClosed: boolean;
}

export interface TaskView {
  id: string;
  parent_type: 'list' | 'table';
  parent_id: string;
  name: string;
  type: TaskViewType;
  config: Partial<TaskViewConfig>;
  is_shared: boolean;
  created_by: string | null;
  position: number;
}

export function useViews(parentType: 'list' | 'table', parentId: string | undefined) {
  return useQuery({
    queryKey: ['tk', parentType, parentId, 'views'],
    enabled: !!parentId,
    staleTime: 15_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tk_views')
        .select('id, parent_type, parent_id, name, type, config, is_shared, created_by, position')
        .eq('parent_type', parentType)
        .eq('parent_id', parentId as string)
        .order('position');
      if (error) throw error;
      return data as TaskView[];
    },
  });
}

function invalidateViews(qc: ReturnType<typeof useQueryClient>, parentType: string, parentId: string) {
  qc.invalidateQueries({ queryKey: ['tk', parentType, parentId, 'views'] });
}

export function useCreateView() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      parentType: 'list' | 'table';
      parentId: string;
      name: string;
      type: TaskViewType;
      config: Partial<TaskViewConfig>;
      isShared: boolean;
      createdBy: string;
      position: number;
    }) => {
      const { data, error } = await supabase
        .from('tk_views')
        .insert({
          parent_type: input.parentType,
          parent_id: input.parentId,
          name: input.name,
          type: input.type,
          config: input.config,
          is_shared: input.isShared,
          created_by: input.createdBy,
          position: input.position,
        })
        .select()
        .single();
      if (error) throw error;
      return data as TaskView;
    },
    onSuccess: (view) => invalidateViews(qc, view.parent_type, view.parent_id),
  });
}

export function useUpdateView() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; parentType: string; parentId: string; patch: Partial<Pick<TaskView, 'name' | 'config' | 'is_shared'>> }) => {
      const { error } = await supabase.from('tk_views').update(input.patch).eq('id', input.id);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => invalidateViews(qc, vars.parentType, vars.parentId),
  });
}

export function useDeleteView() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; parentType: string; parentId: string }) => {
      const { error } = await supabase.from('tk_views').delete().eq('id', input.id);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => invalidateViews(qc, vars.parentType, vars.parentId),
  });
}
