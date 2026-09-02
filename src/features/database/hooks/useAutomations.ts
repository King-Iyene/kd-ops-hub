import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { Automation } from '../types';

export function useAutomations(tableId: string | null) {
  return useQuery({
    queryKey: ['automations', tableId],
    queryFn: async () => {
      if (!tableId) return [];
      const { data, error } = await supabase
        .schema('nc_meta')
        .from('automations')
        .select('*')
        .eq('table_id', tableId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as Automation[];
    },
    enabled: !!tableId,
  });
}

export function useCreateAutomation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: { base_id: string; table_id: string; name?: string; trigger_type: Automation['trigger_type'] }) => {
      const { data, error } = await supabase
        .schema('nc_meta')
        .from('automations')
        .insert({
          base_id: params.base_id,
          table_id: params.table_id,
          name: params.name ?? 'Untitled automation',
          trigger_type: params.trigger_type,
          enabled: false,
          trigger_config: {},
          actions: [],
        })
        .select()
        .single();
      if (error) throw error;
      return data as Automation;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['automations', vars.table_id] });
    },
  });
}

export function useUpdateAutomation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: { id: string; table_id: string } & Partial<Pick<Automation, 'name' | 'enabled' | 'trigger_type' | 'trigger_config' | 'actions'>>) => {
      const { id, table_id, ...updates } = params;
      const { data, error } = await supabase
        .schema('nc_meta')
        .from('automations')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data as Automation;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['automations', vars.table_id] });
    },
  });
}

export function useDeleteAutomation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: { id: string; table_id: string }) => {
      const { error } = await supabase
        .schema('nc_meta')
        .from('automations')
        .delete()
        .eq('id', params.id);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['automations', vars.table_id] });
    },
  });
}
