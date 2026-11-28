// Crew: posts to the TEAM in Cliq after the database allowed it (crew_cliq_post_reserve). See crew-post-core.ts for the look of the message.
//
// It reuses the Ops Agent's delivery (agent-deliver.ts): the Zoho sign-in of the connection chosen in the owner's standing permission, the fixed Zoho hosts,
// the invisible OWN_MARK on every post, and the tagging of people named as "@Full Name" (only people with a saved Cliq id are really tagged).
// A token or secret is never put in a result or a log.

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';
import { validChannel, validDc } from './agent-cliq-core.ts';
import { accessSaver, readConnectionSecrets } from './agent-conn-secrets.ts';
import { deliver } from './agent-deliver.ts';
import type { ConnectionKind } from './agent-deliver-core.ts';
import { formatTeamPost, type ReserveAllowed } from './crew-post-core.ts';

export async function postTeamMessage(db: SupabaseClient, r: ReserveAllowed, doFetch: typeof fetch = fetch): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: conn } = await db.from('agent_connections').select('id, kind, name, config, vault_secret_names').eq('id', r.connection_id).maybeSingle();
  if (!conn || conn.kind !== 'cliq') return { ok: false, error: 'The Cliq connection no longer exists.' };
  const cfg = (conn.config ?? {}) as Record<string, unknown>;
  if (cfg.mode !== 'api' || !validDc(cfg.dc) || !validChannel(cfg.channel)) return { ok: false, error: 'The Cliq connection needs the Zoho sign-in and a channel.' };
  const ref = conn as { id: string; name: string; vault_secret_names: string[] };
  const secrets = await readConnectionSecrets(db, ref);
  const post = formatTeamPost({ kind: r.kind, text: r.text, agentName: r.agent_name, via: ref.name });
  const res = await deliver(
    { kind: 'cliq' as ConnectionKind, name: ref.name, config: cfg }, secrets,
    { title: post.title, text: post.text, event: 'crew', mentions: r.mentions.filter((m) => m.id) },
    { fetch: doFetch, saveAccess: accessSaver(db, ref) },
  );
  return res.ok ? { ok: true } : { ok: false, error: res.error };
}
