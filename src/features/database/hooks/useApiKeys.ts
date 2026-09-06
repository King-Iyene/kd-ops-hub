import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

export interface ApiKey {
  id: string;
  name: string;
  key_prefix: string;
  scopes: string[];
  created_at: string;
  last_used_at: string | null;
  expires_at: string | null;
}

async function hashKey(raw: string): Promise<string> {
  const data = new TextEncoder().encode(raw);
  const buf = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function generateKey(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return (
    'kdops_' +
    Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')
  );
}

export function useApiKeys(baseId: string | null | undefined) {
  return useQuery({
    queryKey: ['nc', 'api_keys', baseId],
    enabled: !!baseId,
    queryFn: async (): Promise<ApiKey[]> => {
      const { data, error } = await supabase
        .schema('nc_meta')
        .from('api_keys')
        .select('id, name, key_prefix, scopes, created_at, last_used_at, expires_at')
        .eq('workspace_id', baseId)
        .is('revoked_at', null)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as ApiKey[];
    },
  });
}

export function useCreateApiKey() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { baseId: string; name: string; scopes: string[] }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const rawKey = generateKey();
      const keyHash = await hashKey(rawKey);
      const keyPrefix = rawKey.slice(0, 10);

      const { data, error } = await supabase
        .schema('nc_meta')
        .from('api_keys')
        .insert({
          workspace_id: input.baseId,
          name: input.name,
          key_hash: keyHash,
          key_prefix: keyPrefix,
          scopes: input.scopes,
          created_by: user.id,
        })
        .select('id, name, key_prefix, scopes, created_at, last_used_at, expires_at')
        .single();
      if (error) throw error;
      return { ...(data as ApiKey), rawKey };
    },
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ['nc', 'api_keys', variables.baseId] });
    },
  });
}

export function useRevokeApiKey() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; baseId: string }) => {
      const { error } = await supabase
        .schema('nc_meta')
        .from('api_keys')
        .update({ revoked_at: new Date().toISOString() })
        .eq('id', input.id);
      if (error) throw error;
    },
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ['nc', 'api_keys', variables.baseId] });
    },
  });
}
