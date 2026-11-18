import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

export interface TaskList {
  id: string;
  space_id: string;
  name: string;
  description: string | null;
  position: number;
  created_by: string | null;
  archived_at: string | null;
  created_at: string;
}

export function useLists(spaceId: string | undefined) {
  return useQuery({
    queryKey: ['tk', 'space', spaceId, 'lists'],
    enabled: !!spaceId,
    staleTime: 15_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tk_lists')
        .select('id, space_id, name, description, position, created_by, archived_at, created_at')
        .eq('space_id', spaceId as string)
        .is('archived_at', null)
        .order('position')
        .order('created_at');
      if (error) throw error;
      return data as TaskList[];
    },
  });
}

export interface TaskListWithSpace extends TaskList {
  space_name: string;
}

/** Every list the viewer can access, across every space — for quick
 *  create's list picker (section 7.8). RLS on tk_spaces already limits
 *  this to spaces the viewer can see. */
export function useAllAccessibleLists() {
  return useQuery({
    queryKey: ['tk', 'lists', 'all'],
    staleTime: 15_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tk_lists')
        .select('id, space_id, name, description, position, created_by, archived_at, created_at, tk_spaces(name)')
        .is('archived_at', null)
        .order('name');
      if (error) throw error;
      return (data ?? []).map((row) => {
        const { tk_spaces, ...rest } = row as typeof row & { tk_spaces: { name: string } | null };
        return { ...rest, space_name: tk_spaces?.name ?? '' };
      }) as TaskListWithSpace[];
    },
  });
}

export function useList(listId: string | undefined) {
  return useQuery({
    queryKey: ['tk', 'list', listId],
    enabled: !!listId,
    staleTime: 15_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tk_lists')
        .select('id, space_id, name, description, position, created_by, archived_at, created_at')
        .eq('id', listId as string)
        .maybeSingle();
      if (error) throw error;
      return data as TaskList | null;
    },
  });
}

export function useCreateList() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { spaceId: string; name: string; description: string | null; createdBy: string }) => {
      const { data, error } = await supabase
        .from('tk_lists')
        .insert({ space_id: input.spaceId, name: input.name, description: input.description, created_by: input.createdBy })
        .select()
        .single();
      if (error) throw error;
      return data as TaskList;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['tk', 'space', vars.spaceId, 'lists'] });
    },
  });
}
