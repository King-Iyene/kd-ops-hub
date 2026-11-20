// Ops Agent connections: where each part of a connection's secrets lives in the Vault, and how to read it back (server side only).
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';
import type { Secrets } from './agent-deliver-core.ts';

export type SecretPart = 'url' | 'token' | 'secret' | 'refresh' | 'access';
export const SECRET_PARTS: SecretPart[] = ['url', 'token', 'secret', 'refresh', 'access'];
export const secretName = (id: string, part: SecretPart) => `agent_conn_${id.replaceAll('-', '')}_${part}`;

interface ConnRef { id: string; vault_secret_names: string[] }

export async function readConnectionSecrets(db: SupabaseClient, c: ConnRef): Promise<Secrets> {
  const out: Secrets = {};
  for (const part of SECRET_PARTS) {
    const n = secretName(c.id, part);
    if (!(c.vault_secret_names ?? []).includes(n)) continue;
    const { data } = await db.rpc('agent_secret_get', { p_name: n });
    if (typeof data === 'string') out[part] = data;
  }
  return out;
}

/** Saves a fresh Cliq access token next to the other secrets, and makes sure the connection lists it. */
export function accessSaver(db: SupabaseClient, c: ConnRef) {
  return async (packed: string) => {
    const n = secretName(c.id, 'access');
    await db.rpc('agent_secret_set', { p_name: n, p_value: packed });
    if (!(c.vault_secret_names ?? []).includes(n)) {
      const names = [...new Set([...(c.vault_secret_names ?? []), n])];
      await db.from('agent_connections').update({ vault_secret_names: names }).eq('id', c.id);
      c.vault_secret_names = names;
    }
  };
}
