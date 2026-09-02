import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

export interface SharedView {
  id: string;
  view_id: string;
  table_id: string;
  share_token: string;
  password: string | null;
  is_enabled: boolean;
  allow_csv_download: boolean;
  created_at: string;
}

export function useSharedView(viewId: string | null | undefined) {
  return useQuery({
    queryKey: ['nc', 'shared_views', viewId],
    enabled: !!viewId,
    queryFn: async () => {
      const { data, error } = await supabase
        .schema('nc_meta')
        .from('shared_views')
        .select('*')
        .eq('view_id', viewId)
        .maybeSingle();
      if (error) throw error;
      return data as SharedView | null;
    },
  });
}

export function useCreateSharedView() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (input: { view_id: string; table_id: string }) => {
      const { data, error } = await supabase
        .schema('nc_meta')
        .from('shared_views')
        .insert({ view_id: input.view_id, table_id: input.table_id })
        .select()
        .single();
      if (error) throw error;
      return data as SharedView;
    },
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ['nc', 'shared_views', variables.view_id] });
    },
  });
}

export function useUpdateSharedView() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      id: string;
      view_id: string;
      updates: Partial<Pick<SharedView, 'password' | 'is_enabled' | 'allow_csv_download'>>;
    }) => {
      const { data, error } = await supabase
        .schema('nc_meta')
        .from('shared_views')
        .update(input.updates)
        .eq('id', input.id)
        .select()
        .single();
      if (error) throw error;
      return data as SharedView;
    },
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ['nc', 'shared_views', variables.view_id] });
    },
  });
}

export function useDeleteSharedView() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (input: { id: string; view_id: string }) => {
      const { error } = await supabase
        .schema('nc_meta')
        .from('shared_views')
        .delete()
        .eq('id', input.id);
      if (error) throw error;
    },
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ['nc', 'shared_views', variables.view_id] });
    },
  });
}
