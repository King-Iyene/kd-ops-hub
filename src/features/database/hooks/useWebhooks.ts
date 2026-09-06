import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { WebhookMeta } from '../types';

export function useWebhooks(tableId: string | null) {
  return useQuery({
    queryKey: ['webhooks', tableId],
    queryFn: async () => {
      if (!tableId) return [];
      const { data, error } = await supabase
        .schema('nc_meta')
        .from('webhooks')
        .select('id, base_id, table_id, name, url, events, headers, is_active, secret, created_at, last_triggered_at, failure_count')
        .eq('table_id', tableId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as WebhookMeta[];
    },
    enabled: !!tableId,
  });
}

export function useCreateWebhook() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      base_id: string;
      table_id: string;
      name: string;
      events: string[];
      url: string;
      headers?: Record<string, string>;
      secret?: string;
    }) => {
      const { data: { user } } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .schema('nc_meta')
        .from('webhooks')
        .insert({
          base_id: params.base_id,
          table_id: params.table_id,
          name: params.name,
          events: params.events,
          url: params.url,
          headers: params.headers ?? {},
          is_active: true,
          secret: params.secret ?? null,
          created_by: user?.id ?? null,
        })
        .select()
        .single();
      if (error) throw error;
      return data as WebhookMeta;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['webhooks', vars.table_id] });
    },
  });
}

export function useUpdateWebhook() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (
      params: { id: string; table_id: string } & Partial<
        Pick<WebhookMeta, 'name' | 'events' | 'url' | 'headers' | 'is_active' | 'secret'>
      >,
    ) => {
      const { id, table_id, ...updates } = params;
      const { data, error } = await supabase
        .schema('nc_meta')
        .from('webhooks')
        .update(updates)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data as WebhookMeta;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['webhooks', vars.table_id] });
    },
  });
}

export function useDeleteWebhook() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: { id: string; table_id: string }) => {
      const { error } = await supabase
        .schema('nc_meta')
        .from('webhooks')
        .delete()
        .eq('id', params.id);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['webhooks', vars.table_id] });
    },
  });
}
