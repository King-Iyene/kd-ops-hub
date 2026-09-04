import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { Base } from '../types';

export function useBases(workspaceId?: string) {
  return useQuery({
    queryKey: ['nc', 'bases', workspaceId],
    staleTime: 30_000,
    refetchOnWindowFocus: false,
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

async function ensureWorkspace(): Promise<string> {
  const { data, error } = await supabase
    .schema('nc_meta')
    .from('workspaces')
    .select('id')
    .order('created_at')
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (data) return data.id;

  const { data: created, error: createErr } = await supabase
    .schema('nc_meta')
    .from('workspaces')
    .insert({ name: 'Default Workspace' })
    .select('id')
    .single();
  if (createErr) throw createErr;
  return created.id;
}

export function useCreateBase() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      name: string;
      icon?: string | null;
      color?: string | null;
    }) => {
      const workspaceId = await ensureWorkspace();
      const schemaName = `nc_${toSnakeCase(input.name)}_${Date.now()}`;

      const { data: base, error: insertError } = await supabase
        .schema('nc_meta')
        .from('bases')
        .insert({
          workspace_id: workspaceId,
          name: input.name,
          schema_name: schemaName,
          icon: input.icon ?? null,
          color: input.color ?? null,
          position: 0,
        })
        .select()
        .single();

      if (insertError) throw insertError;

      const { error: ddlError } = await supabase.functions.invoke('ddl-executor', {
        body: { action: 'createSchema', schemaName },
      });

      if (ddlError) throw ddlError;

      const { error: exposeError } = await supabase.functions.invoke('ddl-executor', {
        body: { action: 'exposeSchema', schemaName },
      });

      if (exposeError) throw exposeError;

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

export function useUpdateBase() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      id: string;
      name?: string;
      icon?: string | null;
      color?: string | null;
      position?: number;
    }) => {
      const { id, ...updates } = input;
      const { data, error } = await supabase
        .schema('nc_meta')
        .from('bases')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data as Base;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['nc', 'bases'] });
    },
  });
}
