// Ops Agent: connections (Slack, Zoho Cliq, email, webhook, n8n, generic API). Super Admin only.
//
// Deploy: supabase functions deploy agent-connections --no-verify-jwt   (it checks the JWT and the role itself)
//
// POST { action: 'save',   id?, kind, name, url?, token?, to?, chat_id?, method?, auth_type?, header_name?, query_param?, content_type?,
//                          extra_headers?, body_template?, events?, min_severity?, preset?, clear_token? }
//   Cliq through the API (the way n8n connects): kind 'cliq' with mode 'api' takes dc, client_id, client_secret, channel (the channel's unique name)
//   and cc_manager. The sign-in with Zoho is then done with oauth_start / oauth_finish below; a grant_code or refresh_token may still be pasted instead.
// POST { action: 'oauth_start',  id, redirect_uri }       -> { ok, url }  the Zoho consent address to send the browser to
// POST { action: 'oauth_finish', code, state, redirect_uri, accounts_server? }  swaps the code Zoho sent back for a refresh token (kept in the Vault)
// POST { action: 'cliq_watch_check', id }           reads Cliq now for the connection that has Watch on (what pg_cron does every 2 working hours)
//                                                     -> { ok, channels, scanned, tracked, answered, error? }
// POST { action: 'test',   id }                      sends a short test message and records the result
// POST { action: 'send',   id, text, title? }        sends a message a person wrote or approved
// POST { action: 'send_flag', flag_id, channel: 'email' | 'connection', connection_id?, subject?, text }
//   sends the message a person edited in the Inbox about one item, with the link to the exact thing. cc_manager: tags their manager too (Cliq, Slack) or copies them on the email (default on). When it has gone out the item is marked
//   handled (close: false keeps it open). Answers { ok: true, closed }.
//   It sends the message a person edited in the Inbox about one item. The server decides who it goes to (the person, or their manager
//   for review items) from the item itself, so an address is never taken from the browser. The result is kept on the item.
// POST { action: 'record_test', rule_id }   sends the newest entry of a Task table through one "send new entries" rule, marked as a test
// POST { action: 'delete', id }
//
// Secrets (a Slack or Cliq webhook address, a token) are written to Vault and never come back. A browser only ever
// learns "a token is set". A call never sends anything the person did not ask for.

import { getCorsHeaders } from '../_shared/cors.ts';
import { authenticateAgentCaller, jsonResponse } from '../_shared/agent-auth.ts';
import { serviceClient } from '../_shared/agent-claude.ts';
import { ccFor, managerOf, mentionFor } from '../_shared/agent-mention.ts';
import { validMentionTemplate } from '../_shared/agent-mention-core.ts';
import { deliver } from '../_shared/agent-deliver.ts';
import { buildRecordMessage, effectiveConfig } from '../_shared/tm-record-message.ts';
import { exchangeGrantCode } from '../_shared/agent-cliq.ts';
import { runCliqWatch } from '../_shared/agent-cliq-monitor.ts';
import { consentUrl, dcFromAccountsServer, validChannel, validClientId, validDc, validRedirectUri, validZohoValue } from '../_shared/agent-cliq-core.ts';
import { accessSaver, readConnectionSecrets, secretName } from '../_shared/agent-conn-secrets.ts';
import { API_METHODS, AUTH_TYPES, CONTENT_TYPES, buildApiRequest, checkOutboundUrl, parseRecipients, validHeaderName, type ConnectionKind } from '../_shared/agent-deliver-core.ts';

async function sha256Hex(v: string): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(v));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

const cors = (req: Request) => ({ ...getCorsHeaders(req), 'Access-Control-Allow-Methods': 'POST, OPTIONS' });
const KINDS: ConnectionKind[] = ['slack', 'cliq', 'discord', 'teams', 'gchat', 'telegram', 'email', 'webhook', 'n8n', 'api'];
const SECRET_URL_KINDS: ConnectionKind[] = ['slack', 'cliq', 'discord', 'teams', 'gchat'];
const LABELS: Record<string, string> = { slack: 'Slack incoming webhook', cliq: 'Zoho Cliq webhook', discord: 'Discord webhook', teams: 'Microsoft Teams webhook', gchat: 'Google Chat webhook' };
// Only the summaries are sent on their own. Items (flag_*) are sent by hand from the Inbox, so they are no longer accepted here.
const EVENTS = ['summary_day', 'summary_week', 'summary_month', 'summary_scorecard'];
const SEVERITIES = ['low', 'medium', 'high', 'critical'];
const PRESET = /^[a-z0-9_-]{1,30}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface Body { rule_id?: string; redirect_uri?: string; code?: string; state?: string; accounts_server?: string; mode?: string; dc?: string; client_id?: string; client_secret?: string; grant_code?: string; refresh_token?: string; channel_name?: string; cc_manager?: boolean; tag_me?: boolean; mention_people?: boolean; mention_template?: string; close?: boolean; chat_id?: string; auth_type?: string; query_param?: string; content_type?: string; extra_headers?: Record<string, unknown>; body_template?: string; events?: unknown; min_severity?: string; preset?: string; flag_id?: string; channel?: string; connection_id?: string; subject?: string; action?: string; id?: string; kind?: string; name?: string; url?: string; token?: string; to?: string; method?: string; header_name?: string; text?: string; title?: string; clear_token?: boolean }

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors(req) });
  if (req.method !== 'POST') return jsonResponse(cors(req), { error: 'method_not_allowed' }, 405);

  const auth = await authenticateAgentCaller(req);
  if (!auth.ok) return jsonResponse(cors(req), { error: auth.error }, auth.status);
  // Setting up and changing connections is for Super Admins. Sending a message about an item is not: an Admin who may see the item may send it
  // (reading the draft as the caller, below, proves that).
  const action = (await req.clone().json().catch(() => ({})) as { action?: string }).action;
  if (!auth.caller.canConfigure && action !== 'send_flag') return jsonResponse(cors(req), { error: 'forbidden' }, 403);
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
  const readSecrets = (c: { id: string; vault_secret_names: string[] }) => readConnectionSecrets(db, c);
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
      const cliqApi = kind === 'cliq' && (body.mode === 'api' || (body.mode === undefined && existing?.config.mode === 'api'));
      let cliqClientSecret: string | null = null;
      let cliqRefresh: string | null = null;
      let resetSignIn = false;
      if (cliqApi) {
        if (existing && existing.config.mode !== 'api') return jsonResponse(cors(req), { ok: false, error: 'This connection uses a webhook address. Add a new Cliq connection to use the API.' }, 400);
        const dc = body.dc ?? (existing?.config.dc as string | undefined) ?? 'com';
        if (!validDc(dc)) return jsonResponse(cors(req), { ok: false, error: 'Pick the Zoho data center that matches your Zoho account.' }, 400);
        const clientId = (body.client_id ?? (existing?.config.client_id as string | undefined) ?? '').trim();
        if (!validClientId(clientId)) return jsonResponse(cors(req), { ok: false, error: 'Paste the Client ID from the Zoho API console.' }, 400);
        const channelName = String(body.channel_name ?? body.channel ?? existing?.config.channel ?? '').trim();
        if (!validChannel(channelName)) return jsonResponse(cors(req), { ok: false, error: 'The channel unique name must be lowercase letters, digits and underscores (find it in Cliq under Channel settings, Unique name).' }, 400);
        // A refresh token belongs to one Zoho client and data center: a different one means signing in again.
        resetSignIn = !!existing && (existing.config.client_id !== clientId || existing.config.dc !== dc);
        config.mode = 'api'; config.dc = dc; config.client_id = clientId; config.channel = channelName;
        config.cc_manager = body.cc_manager === undefined ? (existing?.config.cc_manager ?? true) : body.cc_manager === true;
        const secretIn = (body.client_secret ?? '').trim();
        const code = (body.grant_code ?? '').trim();
        const refreshIn = (body.refresh_token ?? '').trim();
        if (secretIn && !validZohoValue(secretIn)) return jsonResponse(cors(req), { ok: false, error: 'That does not look like a Zoho Client Secret. Copy it again from the API console.' }, 400);
        if (code && !validZohoValue(code)) return jsonResponse(cors(req), { ok: false, error: 'That does not look like a grant code. Copy it again from the Self Client.' }, 400);
        if (refreshIn && !validZohoValue(refreshIn)) return jsonResponse(cors(req), { ok: false, error: 'That does not look like a refresh token.' }, 400);
        const haveSecret = secretIn || (existing ? existing.vault_secret_names.includes(secretName(existing.id, 'secret')) : false);
        if (!haveSecret) return jsonResponse(cors(req), { ok: false, error: 'Paste the Client Secret from the Zoho API console.' }, 400);
        cliqClientSecret = secretIn || null;
        if (refreshIn) cliqRefresh = refreshIn;
        else if (code) {
          // Swap the one-time code now: it only works once, and a wrong one should be reported before anything is saved.
          const sec = secretIn || (existing ? (await readSecrets(existing)).secret ?? '' : '');
          if (!sec) return jsonResponse(cors(req), { ok: false, error: 'Paste the Client Secret from the Zoho API console.' }, 400);
          const swapped = await exchangeGrantCode(dc, clientId, sec, code);
          if (!swapped.ok) return jsonResponse(cors(req), { ok: false, error: swapped.error }, 400);
          cliqRefresh = swapped.refresh;
        }
      } else if (SECRET_URL_KINDS.includes(kind)) {
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

      // Tagging: Cliq and Slack can tag the person a message is about. On by default; the Cliq tag format is editable.
      if (kind === 'cliq' || kind === 'slack') {
        config.mention_people = body.mention_people === undefined ? (existing?.config.mention_people ?? true) : body.mention_people === true;
        if (!cliqApi) config.cc_manager = body.cc_manager === undefined ? (existing?.config.cc_manager ?? false) : body.cc_manager === true;
        if (body.mention_template !== undefined && body.mention_template !== '') {
          if (!validMentionTemplate(body.mention_template)) return jsonResponse(cors(req), { ok: false, error: 'The tag format must contain %s where the person goes, for example {@%s}.' }, 400);
          config.mention_template = body.mention_template;
        } else if (existing?.config.mention_template && body.mention_template === undefined) config.mention_template = existing.config.mention_template;
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
      if (resetSignIn && !cliqRefresh) {
        for (const part of ['refresh', 'access'] as const) { await db.rpc('agent_secret_delete', { p_name: secretName(id, part) }); names.delete(secretName(id, part)); }
      }
      if (cliqClientSecret) { await db.rpc('agent_secret_set', { p_name: secretName(id, 'secret'), p_value: cliqClientSecret }); names.add(secretName(id, 'secret')); }
      if (cliqRefresh) {
        await db.rpc('agent_secret_set', { p_name: secretName(id, 'refresh'), p_value: cliqRefresh }); names.add(secretName(id, 'refresh'));
        // a new sign-in makes any saved access token stale
        await db.rpc('agent_secret_delete', { p_name: secretName(id, 'access') }); names.delete(secretName(id, 'access'));
      }
      const token = (body.token ?? '').trim();
      if (token) { await db.rpc('agent_secret_set', { p_name: secretName(id, 'token'), p_value: token }); names.add(secretName(id, 'token')); }
      if (body.clear_token) { await db.rpc('agent_secret_delete', { p_name: secretName(id, 'token') }); names.delete(secretName(id, 'token')); }
      await db.from('agent_connections').update({ vault_secret_names: [...names] }).eq('id', id);
      await audit(existing ? 'connection.updated' : 'connection.created', id, { kind, name, token_changed: !!token || !!body.clear_token, mode: cliqApi ? 'api' : undefined });
      return jsonResponse(cors(req), { ok: true, id });
    }

    if (body.action === 'test' || body.action === 'send') {
      const conn = await load(body.id);
      if (!conn) return jsonResponse(cors(req), { ok: false, error: 'That connection no longer exists.' }, 404);
      const isTest = body.action === 'test';
      const text = isTest ? 'This is a test message from the KD Ops Agent. Nothing needs doing.' : (body.text ?? '').trim();
      if (!text) return jsonResponse(cors(req), { ok: false, error: 'There is nothing to send.' }, 400);
      // "Send test and tag me": proves the tag format works before any real person is tagged.
      const mention = isTest && body.tag_me ? await mentionFor(db, conn.kind, actor) : undefined;
      if (isTest && body.tag_me && !mention?.id && (conn.kind === 'cliq' || conn.kind === 'slack')) return jsonResponse(cors(req), { ok: false, error: 'There is no Cliq or Slack id or email on your profile to tag. Add yours in Settings, People.' }, 400);
      const r = await deliver({ kind: conn.kind, name: conn.name, config: conn.config }, await readSecrets(conn), { title: isTest ? 'KD Ops Agent test' : body.title, text: mention?.id ? 'This is a test message. If your name is highlighted above, tagging works.' : text, event: isTest ? 'test' : 'message', mention }, { saveAccess: accessSaver(db, conn) });
      await record(conn.id, r);
      await audit(isTest ? 'connection.tested' : 'connection.sent', conn.id, { ok: r.ok, characters: text.length });
      return jsonResponse(cors(req), r.ok ? { ok: true } : { ok: false, error: r.error });
    }

    if (body.action === 'cliq_watch_check') {
      const conn = await load(body.id);
      if (!conn || conn.kind !== 'cliq' || conn.config.mode !== 'api') return jsonResponse(cors(req), { ok: false, error: 'Choose a Zoho Cliq connection that signs in with Zoho.' }, 404);
      const { data: w } = await db.from('agent_cliq_watch').select('enabled').eq('connection_id', conn.id).maybeSingle();
      if (!w?.enabled) return jsonResponse(cors(req), { ok: false, error: 'Switch the watch on first.' }, 400);
      const [r] = await runCliqWatch(db, { connectionId: conn.id, force: true });
      await audit('connection.cliq_watch_checked', conn.id, { ok: r?.ok ?? false, channels: r?.channels ?? 0 });
      return jsonResponse(cors(req), { ok: r?.ok ?? false, error: r?.error, channels: r?.channels ?? 0, scanned: r?.scanned ?? 0, tracked: r?.tracked ?? 0, answered: r?.answered ?? 0 });
    }

    if (body.action === 'send_flag') {
      const text = (body.text ?? '').trim().slice(0, 3000);
      if (!text) return jsonResponse(cors(req), { ok: false, error: 'There is nothing to send.' }, 400);
      if (typeof body.flag_id !== 'string' || !UUID.test(body.flag_id)) return jsonResponse(cors(req), { ok: false, error: 'That item no longer exists.' }, 404);
      // The draft carries the recipient; reading it as the caller proves they may see this item.
      const { data: draft, error: draftError } = await auth.caller.asUser.rpc('agent_flag_draft', { p_flag: body.flag_id });
      if (draftError || !draft) return jsonResponse(cors(req), { ok: false, error: 'That item no longer exists.' }, 404);
      const d = draft as { to?: string; recipient_id: string | null; recipient_name: string | null; recipient_email: string | null; subject: string | null; link?: { label?: string; url?: string; person_url?: string | null } | null };
      const subject = (body.subject ?? d.subject ?? 'Ops Agent').trim().slice(0, 200);
      const label = d.recipient_name ?? 'the person';
      let r: { ok: boolean; status?: number; error?: string };
      let channel: 'email' | 'slack' | 'cliq' | 'webhook';
      if (body.channel === 'email') {
        if (!d.recipient_email) return jsonResponse(cors(req), { ok: false, error: `${label} has no email address on their profile.` }, 400);
        channel = 'email';
        // the person gets the link they can open (never an admin-only page)
        const personLink = d.link?.person_url ? { url: d.link.person_url, label: d.link.label ?? 'Open it' } : undefined;
        // Their manager is copied (unless the caller says not to). The address comes from the manager's own profile, never from the browser.
        let ccEmail = '';
        if (d.to !== 'manager' && body.cc_manager !== false) {
          const { data: fl } = await db.from('agent_flags').select('person_id').eq('id', body.flag_id).maybeSingle();
          const managerId = await managerOf(db, (fl?.person_id as string | null) ?? d.recipient_id);
          if (managerId && managerId !== d.recipient_id) ccEmail = ((await db.from('profiles').select('email').eq('id', managerId).maybeSingle()).data?.email as string | undefined) ?? '';
        }
        r = await deliver({ kind: 'email', name: 'Email', config: { to: d.recipient_email, ...(ccEmail ? { cc: ccEmail } : {}) } }, { url: null, token: null }, { title: subject, text, event: 'flag_message', link: personLink });
      } else if (body.channel === 'connection') {
        const conn = await load(body.connection_id);
        if (!conn) return jsonResponse(cors(req), { ok: false, error: 'That connection no longer exists.' }, 404);
        channel = conn.kind === 'slack' || conn.kind === 'cliq' ? conn.kind : 'webhook';
        // The person it is about is tagged, and their manager is CC'd: the connection's setting unless the caller says otherwise
        // (on unless the connection turned it off). The manager comes from the one rule in agent_manager_of.
        let mention = await mentionFor(db, conn.kind, d.recipient_id);
        // A Cliq "tagged and not answered" item is answered in the thread it came from: same channel, as a reply to the message, tagging the person.
        const { data: fl0 } = await db.from('agent_flags').select('rule_code, evidence').eq('id', body.flag_id).maybeSingle();
        let cliqTarget: { channel: string; replyTo: string } | undefined;
        let askedBy = 'them';
        if (fl0?.rule_code === 'CQ01') {
          const ev = (fl0.evidence ?? {}) as { message_row_id?: string; sender_name?: string };
          const { data: row } = typeof ev.message_row_id === 'string' && UUID.test(ev.message_row_id)
            ? await db.from('agent_cliq_messages').select('connection_id, channel_unique, message_id, tagged_cliq_id, tagged_name').eq('id', ev.message_row_id).maybeSingle() : { data: null };
          if (!row) return jsonResponse(cors(req), { ok: false, error: 'That Cliq message is no longer on record.' }, 404);
          if (conn.kind !== 'cliq' || conn.config.mode !== 'api' || row.connection_id !== conn.id) return jsonResponse(cors(req), { ok: false, error: 'Send this one through the Zoho Cliq connection that watches the channel.' }, 400);
          cliqTarget = { channel: row.channel_unique as string, replyTo: row.message_id as string };
          mention = { name: (row.tagged_name as string) || label, id: row.tagged_cliq_id as string };
          askedBy = ev.sender_name || 'them';
        }
        const wantCc = body.cc_manager === undefined ? conn.config.cc_manager !== false : body.cc_manager === true;
        let cc;
        if (wantCc) {
          const { data: fl } = await db.from('agent_flags').select('person_id').eq('id', body.flag_id).maybeSingle();
          cc = await ccFor(db, conn.kind, (fl?.person_id as string | null) ?? d.recipient_id, d.recipient_id);
        }
        const secrets = await readSecrets(conn);
        const link = cliqTarget ? undefined : d.link?.url ? { url: d.link.url, label: d.link.label ?? 'Open it' } : undefined;
        r = await deliver({ kind: conn.kind, name: conn.name, config: conn.config }, secrets, { title: cliqTarget ? undefined : subject, text, event: 'flag_message', link, mention, cc, ...(cliqTarget ? { cliq: cliqTarget } : {}) }, { saveAccess: accessSaver(db, conn) });
        // If Zoho refuses the thread reply, the message is still posted in the same channel, saying whose message it is about.
        if (!r.ok && cliqTarget && r.status === 400) {
          r = await deliver({ kind: conn.kind, name: conn.name, config: conn.config }, secrets, { text: `(replying to ${askedBy}'s message above)\n${text}`, event: 'flag_message', mention, cc, cliq: { channel: cliqTarget.channel } }, { saveAccess: accessSaver(db, conn) });
        }
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

    if (body.action === 'oauth_start' || body.action === 'oauth_finish') {
      const { data: st } = await db.from('agent_settings').select('app_url').eq('id', true).maybeSingle();
      const origins = [(st?.app_url as string | undefined) ?? null, req.headers.get('origin')];
      const redirectUri = validRedirectUri(body.redirect_uri, origins);
      if (!redirectUri) return jsonResponse(cors(req), { ok: false, error: 'That return address is not allowed. Open KD Ops from its normal address and try again.' }, 400);

      if (body.action === 'oauth_start') {
        const conn = await load(body.id);
        if (!conn || conn.kind !== 'cliq' || conn.config.mode !== 'api') return jsonResponse(cors(req), { ok: false, error: 'Save the Zoho Cliq connection first.' }, 404);
        const dc = conn.config.dc, clientId = String(conn.config.client_id ?? '');
        if (!validDc(dc) || !validClientId(clientId)) return jsonResponse(cors(req), { ok: false, error: 'The Client ID or data center is missing.' }, 400);
        if (!conn.vault_secret_names.includes(secretName(conn.id, 'secret'))) return jsonResponse(cors(req), { ok: false, error: 'Save the Client Secret first.' }, 400);
        // A one-time state ties the way back to this connection and this moment; only its hash is kept.
        const state = `${crypto.randomUUID()}${crypto.randomUUID()}`.replaceAll('-', '');
        await db.from('agent_connections').update({ config: { ...conn.config, oauth: { state_hash: await sha256Hex(state), exp: Date.now() + 10 * 60_000 } } }).eq('id', conn.id);
        await audit('connection.oauth_started', conn.id, { dc });
        return jsonResponse(cors(req), { ok: true, url: consentUrl({ dc, clientId, redirectUri, state }) });
      }

      const code = (body.code ?? '').trim(), state = (body.state ?? '').trim();
      if (!code || !/^[A-Za-z0-9._-]{8,300}$/.test(code) || !/^[a-f0-9]{64}$/.test(state)) return jsonResponse(cors(req), { ok: false, error: 'Zoho did not send back what was needed. Press "Connect to Zoho" again.' }, 400);
      const { data: found } = await db.from('agent_connections').select('id').filter('config->oauth->>state_hash', 'eq', await sha256Hex(state)).maybeSingle();
      const conn = found ? await load((found as { id: string }).id) : null;
      const oauth = conn?.config.oauth as { exp?: number } | undefined;
      if (!conn || !oauth || typeof oauth.exp !== 'number' || oauth.exp < Date.now()) return jsonResponse(cors(req), { ok: false, error: 'That sign-in link has expired or was already used. Press "Connect to Zoho" again.' }, 400);
      const dc = dcFromAccountsServer(body.accounts_server) ?? conn.config.dc;
      const sec = (await readSecrets(conn)).secret;
      if (!validDc(dc) || !sec) return jsonResponse(cors(req), { ok: false, error: 'The Client Secret is missing. Save it and try again.' }, 400);
      // The one-time state is spent before the code is, so a replay finds nothing.
      const { oauth: _spent, ...rest } = conn.config; void _spent;
      await db.from('agent_connections').update({ config: { ...rest, dc } }).eq('id', conn.id);
      const swapped = await exchangeGrantCode(dc, String(conn.config.client_id), sec, code, fetch, redirectUri);
      if (!swapped.ok) { await audit('connection.oauth_failed', conn.id, { dc }); return jsonResponse(cors(req), { ok: false, error: swapped.error }, 400); }
      await db.rpc('agent_secret_set', { p_name: secretName(conn.id, 'refresh'), p_value: swapped.refresh });
      await db.rpc('agent_secret_delete', { p_name: secretName(conn.id, 'access') });
      const names = new Set(conn.vault_secret_names); names.add(secretName(conn.id, 'refresh')); names.delete(secretName(conn.id, 'access'));
      await db.from('agent_connections').update({ vault_secret_names: [...names], last_error: null }).eq('id', conn.id);
      await audit('connection.oauth_connected', conn.id, { dc });
      return jsonResponse(cors(req), { ok: true, id: conn.id });
    }

    if (body.action === 'record_test') {
      if (typeof body.rule_id !== 'string' || !UUID.test(body.rule_id)) return jsonResponse(cors(req), { ok: false, error: 'That connection no longer exists.' }, 404);
      const { data: rule } = await db.from('tm_table_connections').select('connection_id').eq('id', body.rule_id).maybeSingle();
      const conn = rule ? await load((rule as { connection_id: string }).connection_id) : null;
      if (!conn) return jsonResponse(cors(req), { ok: false, error: 'That connection no longer exists.' }, 404);
      const { data: st } = await db.from('agent_settings').select('app_url').eq('id', true).maybeSingle();
      const built = await buildRecordMessage(db, body.rule_id, null, (st?.app_url as string | undefined) ?? 'https://ops.kdsquares.com', conn.kind, true);
      if (!built.ok) return jsonResponse(cors(req), { ok: false, error: built.error }, 200);
      const r = await deliver({ kind: conn.kind, name: conn.name, config: effectiveConfig(conn.config, conn.kind, built.rule) }, await readSecrets(conn), built.msg, { saveAccess: accessSaver(db, conn) });
      await record(conn.id, r);
      await audit('table_connection.tested', body.rule_id, { ok: r.ok });
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
