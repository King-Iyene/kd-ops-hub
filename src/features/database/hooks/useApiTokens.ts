import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

export interface ApiToken {
  id: string;
  base_id: string;
  name: string;
  token: string;
  permissions: string[];
  created_at: string;
  last_used_at: string | null;
}

export function useApiTokens(baseId: string | null | undefined) {
  return useQuery({
    queryKey: ['nc', 'api_tokens', baseId],
    enabled: !!baseId,
    queryFn: async () => {
      const { data, error } = await supabase
        .schema('nc_meta')
        .from('api_tokens')
        .select('*')
        .eq('base_id', baseId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []).map((t: any) => ({
        ...t,
        token: t.token ? `${t.token.slice(0, 8)}...${t.token.slice(-4)}` : '',
      })) as ApiToken[];
    },
  });
}

export function useCreateApiToken() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      base_id: string;
      name: string;
      permissions: string[];
    }) => {
      const { data, error } = await supabase
        .schema('nc_meta')
        .from('api_tokens')
        .insert({
          base_id: input.base_id,
          name: input.name,
          permissions: input.permissions,
        })
        .select()
        .single();
      if (error) throw error;
      return data as ApiToken;
    },
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ['nc', 'api_tokens', variables.base_id] });
    },
  });
}

export function useDeleteApiToken() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (input: { id: string; base_id: string }) => {
      const { error } = await supabase
        .schema('nc_meta')
        .from('api_tokens')
        .delete()
        .eq('id', input.id);
      if (error) throw error;
    },
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ['nc', 'api_tokens', variables.base_id] });
    },
  });
}
