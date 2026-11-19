// Ops Agent: connections (Slack, Zoho Cliq, email, webhook, n8n, generic API). Super Admin only.
//
// Deploy: supabase functions deploy agent-connections --no-verify-jwt   (it checks the JWT and the role itself)
//
// POST { action: 'save',   id?, kind, name, url?, token?, to?, method?, header_name? }
// POST { action: 'test',   id }                      sends a short test message and records the result
// POST { action: 'send',   id, text, title? }        sends a message a person wrote or approved
// POST { action: 'delete', id }
//
// Secrets (a Slack or Cliq webhook address, a token) are written to Vault and never come back. A browser only ever
// learns "a token is set". A call never sends anything the person did not ask for.

import { getCorsHeaders } from '../_shared/cors.ts';
import { authenticateAgentCaller, jsonResponse } from '../_shared/agent-auth.ts';
import { serviceClient } from '../_shared/agent-claude.ts';
import { deliver } from '../_shared/agent-deliver.ts';
import { checkOutboundUrl, parseRecipients, type ConnectionKind } from '../_shared/agent-deliver-core.ts';

const cors = (req: Request) => ({ ...getCorsHeaders(req), 'Access-Control-Allow-Methods': 'POST, OPTIONS' });
const KINDS: ConnectionKind[] = ['slack', 'cliq', 'email', 'webhook', 'n8n', 'api'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const secretName = (id: string, part: 'url' | 'token') => `agent_conn_${id.replaceAll('-', '')}_${part}`;

interface Body { action?: string; id?: string; kind?: string; name?: string; url?: string; token?: string; to?: string; method?: string; header_name?: string; text?: string; title?: string; clear_token?: boolean }

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors(req) });
  if (req.method !== 'POST') return jsonResponse(cors(req), { error: 'method_not_allowed' }, 405);

  const auth = await authenticateAgentCaller(req);
  if (!auth.ok) return jsonResponse(cors(req), { error: auth.error }, auth.status);
  if (!auth.caller.canConfigure) return jsonResponse(cors(req), { error: 'forbidden' }, 403);
  const actor = auth.caller.userId;

  let body: Body = {};
  try { body = await req.json(); } catch { /* empty */ }
  const db = serviceClient();
  const audit = (action: string, id: string, detail: Record<string, unknown> = {}) =>
    db.rpc('agent_audit_write', { p_actor: actor, p_action: action, p_entity_type: 'agent_connections', p_entity_id: id, p_detail: detail }).then(() => {}, () => {});

  const load = async (id: unknown) => {
    if (typeof id !== 'string' || !UUID.test(id)) return null;
    const { data } = await db.from('agent_connections').select('id, kind, name, config, vault_secret_names').eq('id', id).maybeSingle();
    return data as { id: string; kind: ConnectionKind; name: string; config: Record<string, unknown>; vault_secret_names: string[] } | null;
  };
  const readSecrets = async (c: { id: string; vault_secret_names: string[] }) => {
    const get = async (part: 'url' | 'token') => {
      const n = secretName(c.id, part);
      if (!c.vault_secret_names.includes(n)) return null;
      const { data } = await db.rpc('agent_secret_get', { p_name: n });
      return typeof data === 'string' ? data : null;
    };
    return { url: await get('url'), token: await get('token') };
  };
  const record = (id: string, r: { ok: boolean; error?: string }) =>
    db.from('agent_connections').update({ status: r.ok ? 'connected' : 'error', last_error: r.ok ? null : (r.error ?? 'Failed').slice(0, 300), last_tested_at: new Date().toISOString() }).eq('id', id);

  try {
    if (body.action === 'save') {
      const kind = body.kind as ConnectionKind;
      const name = (body.name ?? '').trim();
      if (!KINDS.includes(kind)) return jsonResponse(cors(req), { ok: false, error: 'Pick a kind of connection.' }, 400);
      if (!name || name.length > 80) return jsonResponse(cors(req), { ok: false, error: 'Give the connection a name (80 characters at most).' }, 400);

      const existing = body.id ? await load(body.id) : null;
      if (body.id && !existing) return jsonResponse(cors(req), { ok: false, error: 'That connection no longer exists.' }, 404);
      if (existing && existing.kind !== kind) return jsonResponse(cors(req), { ok: false, error: 'The kind of a connection cannot be changed. Add a new one.' }, 400);

      const config: Record<string, unknown> = {};
      let secretUrl: string | null = null;
      const url = (body.url ?? '').trim();
      if (kind === 'slack' || kind === 'cliq') {
        if (url) {
          const c = checkOutboundUrl(url);
          if (!c.ok) return jsonResponse(cors(req), { ok: false, error: c.error }, 400);
          secretUrl = c.url.toString(); config.host = c.url.hostname;
        } else if (!existing) return jsonResponse(cors(req), { ok: false, error: `Paste the ${kind === 'slack' ? 'Slack incoming webhook' : 'Zoho Cliq webhook'} address.` }, 400);
        else config.host = existing.config.host;
      } else if (kind === 'email') {
        const to = parseRecipients(body.to);
        if (to.length === 0) return jsonResponse(cors(req), { ok: false, error: 'Add at least one email address.' }, 400);
        config.to = to.join(', ');
      } else {
        const c = checkOutboundUrl(url || String(existing?.config.url ?? ''));
        if (!c.ok) return jsonResponse(cors(req), { ok: false, error: c.error }, 400);
        config.url = c.url.toString();
        if (kind === 'api') { config.method = String(body.method).toUpperCase() === 'GET' ? 'GET' : 'POST'; config.header_name = (body.header_name ?? '').trim() || 'Authorization'; }
      }

      let id = existing?.id;
      if (id) {
        const { error } = await db.from('agent_connections').update({ name, config }).eq('id', id);
        if (error) throw error;
      } else {
        const { data, error } = await db.from('agent_connections').insert({ kind, name, config, created_by: actor }).select('id').single();
        if (error || !data) throw error ?? new Error('insert failed');
        id = data.id as string;
      }

      const names = new Set(existing?.vault_secret_names ?? []);
      if (secretUrl) { await db.rpc('agent_secret_set', { p_name: secretName(id, 'url'), p_value: secretUrl }); names.add(secretName(id, 'url')); }
      const token = (body.token ?? '').trim();
      if (token) { await db.rpc('agent_secret_set', { p_name: secretName(id, 'token'), p_value: token }); names.add(secretName(id, 'token')); }
      if (body.clear_token) { await db.rpc('agent_secret_delete', { p_name: secretName(id, 'token') }); names.delete(secretName(id, 'token')); }
      await db.from('agent_connections').update({ vault_secret_names: [...names] }).eq('id', id);
      await audit(existing ? 'connection.updated' : 'connection.created', id, { kind, name, token_changed: !!token || !!body.clear_token });
      return jsonResponse(cors(req), { ok: true, id });
    }

    if (body.action === 'test' || body.action === 'send') {
      const conn = await load(body.id);
      if (!conn) return jsonResponse(cors(req), { ok: false, error: 'That connection no longer exists.' }, 404);
      const isTest = body.action === 'test';
      const text = isTest ? 'This is a test message from the KD Ops Agent. Nothing needs doing.' : (body.text ?? '').trim();
      if (!text) return jsonResponse(cors(req), { ok: false, error: 'There is nothing to send.' }, 400);
      const r = await deliver({ kind: conn.kind, name: conn.name, config: conn.config }, await readSecrets(conn), { title: isTest ? 'KD Ops Agent test' : body.title, text, event: isTest ? 'test' : 'message' });
      await record(conn.id, r);
      await audit(isTest ? 'connection.tested' : 'connection.sent', conn.id, { ok: r.ok, characters: text.length });
      return jsonResponse(cors(req), r.ok ? { ok: true } : { ok: false, error: r.error });
    }

    if (body.action === 'delete') {
      const conn = await load(body.id);
      if (!conn) return jsonResponse(cors(req), { ok: true });
      for (const n of conn.vault_secret_names) await db.rpc('agent_secret_delete', { p_name: n });
      await db.from('agent_connections').delete().eq('id', conn.id);
      await audit('connection.deleted', conn.id, { kind: conn.kind, name: conn.name });
      return jsonResponse(cors(req), { ok: true });
    }

    return jsonResponse(cors(req), { error: 'unknown_action' }, 400);
  } catch (e) {
    console.error('agent-connections error', e instanceof Error ? e.message : e);
    return jsonResponse(cors(req), { ok: false, error: 'Something went wrong. Nothing was sent.' }, 500);
  }
});
