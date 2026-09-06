import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

export interface SharedView {
  id: string;
  view_id: string;
  table_id: string;
  share_token: string;
  is_password_protected: boolean;
  is_enabled: boolean;
  allow_csv_download: boolean;
  created_at: string;
}

// Never select password_hash from the client - the DB also revokes column
// access to it, but keep the explicit list here as the source of truth.
const SHARED_VIEW_COLUMNS =
  'id, view_id, table_id, share_token, is_password_protected, is_enabled, allow_csv_download, created_at';

export function useSharedView(viewId: string | null | undefined) {
  return useQuery({
    queryKey: ['nc', 'shared_views', viewId],
    enabled: !!viewId,
    queryFn: async () => {
      const { data, error } = await supabase
        .schema('nc_meta')
        .from('shared_views')
        .select(SHARED_VIEW_COLUMNS)
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
        .select(SHARED_VIEW_COLUMNS)
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
      updates: Partial<Pick<SharedView, 'is_enabled' | 'allow_csv_download'>>;
    }) => {
      const { data, error } = await supabase
        .schema('nc_meta')
        .from('shared_views')
        .update(input.updates)
        .eq('id', input.id)
        .select(SHARED_VIEW_COLUMNS)
        .single();
      if (error) throw error;
      return data as SharedView;
    },
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ['nc', 'shared_views', variables.view_id] });
    },
  });
}

// Sets (or clears, with password: null) a shared view's password via a
// SECURITY DEFINER RPC. The password is hashed server-side and never
// stored or read back as plaintext.
export function useSetSharedViewPassword() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (input: { id: string; view_id: string; password: string | null }) => {
      const { error } = await supabase
        .schema('nc_meta')
        .rpc('set_shared_view_password', { p_id: input.id, p_password: input.password });
      if (error) throw error;
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
