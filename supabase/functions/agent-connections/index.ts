// Ops Agent: connections (Slack, Zoho Cliq, email, webhook, n8n, generic API). Super Admin only.
//
// Deploy: supabase functions deploy agent-connections --no-verify-jwt   (it checks the JWT and the role itself)
//
// POST { action: 'save',   id?, kind, name, url?, token?, to?, chat_id?, method?, auth_type?, header_name?, query_param?, content_type?,
//                          extra_headers?, body_template?, events?, min_severity?, preset?, clear_token? }
// POST { action: 'test',   id }                      sends a short test message and records the result
// POST { action: 'send',   id, text, title? }        sends a message a person wrote or approved
// POST { action: 'send_flag', flag_id, channel: 'email' | 'connection', connection_id?, subject?, text }
//   sends the message a person edited in the Inbox about one item, with the link to the exact thing. When it has gone out the item is marked
//   handled (close: false keeps it open). Answers { ok: true, closed }.
//   It sends the message a person edited in the Inbox about one item. The server decides who it goes to (the person, or their manager
//   for review items) from the item itself, so an address is never taken from the browser. The result is kept on the item.
// POST { action: 'delete', id }
//
// Secrets (a Slack or Cliq webhook address, a token) are written to Vault and never come back. A browser only ever
// learns "a token is set". A call never sends anything the person did not ask for.

import { getCorsHeaders } from '../_shared/cors.ts';
import { authenticateAgentCaller, jsonResponse } from '../_shared/agent-auth.ts';
import { serviceClient } from '../_shared/agent-claude.ts';
import { deliver } from '../_shared/agent-deliver.ts';
import { API_METHODS, AUTH_TYPES, CONTENT_TYPES, buildApiRequest, checkOutboundUrl, parseRecipients, validHeaderName, type ConnectionKind } from '../_shared/agent-deliver-core.ts';

const cors = (req: Request) => ({ ...getCorsHeaders(req), 'Access-Control-Allow-Methods': 'POST, OPTIONS' });
const KINDS: ConnectionKind[] = ['slack', 'cliq', 'discord', 'teams', 'gchat', 'telegram', 'email', 'webhook', 'n8n', 'api'];
const SECRET_URL_KINDS: ConnectionKind[] = ['slack', 'cliq', 'discord', 'teams', 'gchat'];
const LABELS: Record<string, string> = { slack: 'Slack incoming webhook', cliq: 'Zoho Cliq webhook', discord: 'Discord webhook', teams: 'Microsoft Teams webhook', gchat: 'Google Chat webhook' };
const EVENTS = ['flag_high', 'flag_all', 'summary_day', 'summary_week', 'summary_month'];
const SEVERITIES = ['low', 'medium', 'high', 'critical'];
const PRESET = /^[a-z0-9_-]{1,30}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const secretName = (id: string, part: 'url' | 'token') => `agent_conn_${id.replaceAll('-', '')}_${part}`;

interface Body { close?: boolean; chat_id?: string; auth_type?: string; query_param?: string; content_type?: string; extra_headers?: Record<string, unknown>; body_template?: string; events?: unknown; min_severity?: string; preset?: string; flag_id?: string; channel?: string; connection_id?: string; subject?: string; action?: string; id?: string; kind?: string; name?: string; url?: string; token?: string; to?: string; method?: string; header_name?: string; text?: string; title?: string; clear_token?: boolean }

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
      if (SECRET_URL_KINDS.includes(kind)) {
        if (url) {
          const c = checkOutboundUrl(url);
          if (!c.ok) return jsonResponse(cors(req), { ok: false, error: c.error }, 400);
          secretUrl = c.url.toString(); config.host = c.url.hostname;
        } else if (!existing) return jsonResponse(cors(req), { ok: false, error: `Paste the ${LABELS[kind]} address.` }, 400);
        else config.host = existing.config.host;
      } else if (kind === 'telegram') {
        const chat = (body.chat_id ?? '').trim();
        if (!/^(-?\d{1,20}|@[A-Za-z0-9_]{3,64})$/.test(chat)) return jsonResponse(cors(req), { ok: false, error: 'The chat id must be a number such as -1001234567890, or @channelname.' }, 400);
        config.chat_id = chat;
        if (!existing && !(body.token ?? '').trim()) return jsonResponse(cors(req), { ok: false, error: 'Paste the bot token from BotFather.' }, 400);
      } else if (kind === 'email') {
        const to = parseRecipients(body.to);
        if (to.length === 0) return jsonResponse(cors(req), { ok: false, error: 'Add at least one email address.' }, 400);
        config.to = to.join(', ');
      } else {
        const c = checkOutboundUrl(url || String(existing?.config.url ?? ''));
        if (!c.ok) return jsonResponse(cors(req), { ok: false, error: c.error }, 400);
        config.url = c.url.toString();
        if (kind === 'api') {
          const m = String(body.method ?? 'POST').toUpperCase();
          config.method = (API_METHODS as readonly string[]).includes(m) ? m : 'POST';
          const auth = String(body.auth_type ?? 'bearer');
          if (!(AUTH_TYPES as readonly string[]).includes(auth)) return jsonResponse(cors(req), { ok: false, error: 'Choose how the token is sent.' }, 400);
          config.auth_type = auth;
          const hn = (body.header_name ?? '').trim() || 'Authorization';
          if (auth === 'header' && hn.toLowerCase() !== 'authorization' && !validHeaderName(hn)) return jsonResponse(cors(req), { ok: false, error: 'The token header name is not valid.' }, 400);
          config.header_name = hn;
          const qp = (body.query_param ?? '').trim() || 'token';
          if (auth === 'query' && !/^[A-Za-z0-9_.-]{1,60}$/.test(qp)) return jsonResponse(cors(req), { ok: false, error: 'The token parameter name is not valid.' }, 400);
          config.query_param = qp;
          config.content_type = body.content_type && body.content_type in CONTENT_TYPES ? body.content_type : 'json';
          const extra: Record<string, string> = {};
          for (const [k, v] of Object.entries(body.extra_headers ?? {}).slice(0, 10)) {
            if (!validHeaderName(k)) return jsonResponse(cors(req), { ok: false, error: `The header name "${k}" is not allowed.` }, 400);
            const val = String(v ?? '');
            if (/[\r\n]/.test(val) || val.length > 300) return jsonResponse(cors(req), { ok: false, error: `The value of header "${k}" is not valid.` }, 400);
            extra[k] = val;
          }
          config.extra_headers = extra;
          const tpl = (body.body_template ?? '').slice(0, 5000);
          if (tpl.trim()) {
            config.body_template = tpl;
            // Prove the template once, with sample values, so a broken body is caught now and not at 3 AM.
            const probe = buildApiRequest(config, { token: 'x' }, { title: 'Sample', text: 'Sample text', event: 'test', meta: { severity: 'high', rule: 'TR01', person: 'Sample Person' } }, 'Sample', 'Sample text', new Date());
            if (probe.type === 'error') return jsonResponse(cors(req), { ok: false, error: probe.error }, 400);
          }
        }
      }

      // What the agent sends on its own, and the preset the person chose (so the card shows the right tool)
      const events = Array.isArray(body.events) ? [...new Set(body.events.filter((e): e is string => typeof e === 'string' && EVENTS.includes(e)))] : (existing?.config.events ?? []);
      config.events = events;
      if (body.min_severity && SEVERITIES.includes(body.min_severity)) config.min_severity = body.min_severity;
      else if (existing?.config.min_severity && body.min_severity === undefined) config.min_severity = existing.config.min_severity;
      if (typeof body.preset === 'string' && PRESET.test(body.preset)) config.preset = body.preset;
      else if (existing?.config.preset) config.preset = existing.config.preset;

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

    if (body.action === 'send_flag') {
      const text = (body.text ?? '').trim().slice(0, 3000);
      if (!text) return jsonResponse(cors(req), { ok: false, error: 'There is nothing to send.' }, 400);
      if (typeof body.flag_id !== 'string' || !UUID.test(body.flag_id)) return jsonResponse(cors(req), { ok: false, error: 'That item no longer exists.' }, 404);
      // The draft carries the recipient; reading it as the caller proves they may see this item.
      const { data: draft, error: draftError } = await auth.caller.asUser.rpc('agent_flag_draft', { p_flag: body.flag_id });
      if (draftError || !draft) return jsonResponse(cors(req), { ok: false, error: 'That item no longer exists.' }, 404);
      const d = draft as { recipient_id: string | null; recipient_name: string | null; recipient_email: string | null; subject: string | null; link?: { label?: string; url?: string; person_url?: string | null } | null };
      const subject = (body.subject ?? d.subject ?? 'Ops Agent').trim().slice(0, 200);
      const label = d.recipient_name ?? 'the person';
      let r: { ok: boolean; error?: string };
      let channel: 'email' | 'slack' | 'cliq' | 'webhook';
      if (body.channel === 'email') {
        if (!d.recipient_email) return jsonResponse(cors(req), { ok: false, error: `${label} has no email address on their profile.` }, 400);
        channel = 'email';
        // the person gets the link they can open (never an admin-only page)
        const personLink = d.link?.person_url ? { url: d.link.person_url, label: d.link.label ?? 'Open it' } : undefined;
        r = await deliver({ kind: 'email', name: 'Email', config: { to: d.recipient_email } }, { url: null, token: null }, { title: subject, text, event: 'flag_message', link: personLink });
      } else if (body.channel === 'connection') {
        const conn = await load(body.connection_id);
        if (!conn) return jsonResponse(cors(req), { ok: false, error: 'That connection no longer exists.' }, 404);
        channel = conn.kind === 'slack' || conn.kind === 'cliq' ? conn.kind : 'webhook';
        r = await deliver({ kind: conn.kind, name: conn.name, config: conn.config }, await readSecrets(conn), { title: `For ${label}: ${subject}`, text, event: 'flag_message', link: d.link?.url ? { url: d.link.url, label: d.link.label ?? 'Open it' } : undefined });
        await record(conn.id, r);
      } else {
        return jsonResponse(cors(req), { ok: false, error: 'Choose email or a connection.' }, 400);
      }
      const now = new Date().toISOString();
      await db.from('agent_messages').insert({ flag_id: body.flag_id, recipient_id: d.recipient_id, recipient_label: label, channel, body: text,
        status: r.ok ? 'sent' : 'failed', error: r.ok ? null : (r.error ?? 'Failed').slice(0, 300), sent_by: actor, sent_at: r.ok ? now : null });
      await db.from('agent_flag_events').insert({ flag_id: body.flag_id, kind: r.ok ? 'message_sent' : 'message_failed', actor_id: actor, detail: { channel, recipient: label } });
      await audit(r.ok ? 'flag.message_sent' : 'flag.message_failed', body.flag_id, { channel, characters: text.length });
      // A message that went out closes the item: it is handled, with a note of who it was sent to and how. (If the problem is still
      // there a day or two later, the agent raises it again as "Still happening".) Pass close: false to leave it open.
      let closed = false;
      if (r.ok && body.close !== false) {
        const { error: closeError } = await auth.caller.asUser.rpc('agent_flag_set_status', { p_id: body.flag_id, p_status: 'handled', p_note: `Message sent to ${label} by ${channel}.` });
        closed = !closeError;
      }
      return jsonResponse(cors(req), r.ok ? { ok: true, closed } : { ok: false, error: r.error });
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
