import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { Base } from '../types';

export function useBases(workspaceId?: string) {
  return useQuery({
    queryKey: ['nc', 'bases', workspaceId],
    queryFn: async () => {
      let query = supabase
        .schema('nc_meta')
        .from('bases')
        .select('*')
        .order('position');

      if (workspaceId) {
        query = query.eq('workspace_id', workspaceId);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as Base[];
    },
  });
}

function toSnakeCase(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .substring(0, 63);
}

export function useCreateBase() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      workspace_id: string;
      name: string;
      icon?: string | null;
      color?: string | null;
      position?: number;
    }) => {
      const schemaName = `nc_${toSnakeCase(input.name)}_${Date.now()}`;

      const { data: base, error: insertError } = await supabase
        .schema('nc_meta')
        .from('bases')
        .insert({
          workspace_id: input.workspace_id,
          name: input.name,
          schema_name: schemaName,
          icon: input.icon ?? null,
          color: input.color ?? null,
          position: input.position ?? 0,
        })
        .select()
        .single();

      if (insertError) throw insertError;

      const { error: ddlError } = await supabase.functions.invoke('ddl-executor', {
        body: { action: 'createSchema', schemaName },
      });

      if (ddlError) throw ddlError;

      return base as Base;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['nc', 'bases'] });
    },
  });
}

export function useDeleteBase() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (baseId: string) => {
      const { data: base, error: fetchError } = await supabase
        .schema('nc_meta')
        .from('bases')
        .select('schema_name')
        .eq('id', baseId)
        .single();

      if (fetchError) throw fetchError;

      const { error: ddlError } = await supabase.functions.invoke('ddl-executor', {
        body: { action: 'dropSchema', schemaName: base.schema_name },
      });

      if (ddlError) throw ddlError;

      const { error: deleteError } = await supabase
        .schema('nc_meta')
        .from('bases')
        .delete()
        .eq('id', baseId);

      if (deleteError) throw deleteError;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['nc', 'bases'] });
    },
  });
}
