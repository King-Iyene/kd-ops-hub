// Crew in Zoho Cliq: the one run that the crew-cliq function makes every minute (and only when the owner switched it on). See crew-cliq-core.ts for the rules.
//
//   INBOUND  reads the channel (or, in direct-message mode, the owner's direct chat with the connected Zoho account), keeps ONLY the messages written by
//            the owner's own Cliq account, and carries out what they ask through the database functions crew_cliq_decide / crew_cliq_say (which run the
//            real crew_decide / crew_say as the owner and keep every rule).
//   OUTBOUND posts each new proposal waiting for the owner, once, with the exact words to reply with: in the channel, or as a direct message to him.
//
// It reuses the Ops Agent's Cliq code: the sign-in (agent-cliq.ts), the channel reading (agent-cliq-monitor-core.ts) and the posting and tagging
// (agent-deliver.ts). Only the fixed Zoho hosts are called. A token or secret is never put in a result or a log; text the owner typed is not logged.
// The last problem is written to crew_settings.cliq_error in plain words, so the settings card can show it.

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';
import { packAccess, validChannel, validDc, type CliqDc } from './agent-cliq-core.ts';
import { cliqAccessToken } from './agent-cliq.ts';
import { accessSaver, readConnectionSecrets } from './agent-conn-secrets.ts';
import { deliver } from './agent-deliver.ts';
import type { ConnectionKind, Secrets } from './agent-deliver-core.ts';
import { channelsUrl, chatMessagesUrl, describeCliqStatus, parseChannels, parseMessages, type CliqMessage } from './agent-cliq-monitor-core.ts';
import {
  dmChatsUrl, dmFailureText, formatChannelNotice, formatDecision, formatError, formatHelp, formatProposal, formatSaid, formatStatus, formatWelcome, parseDmChats,
  parseUserId, pickDmChat, planCommands, resolveAgent, userUrl,
  type AgentRef, type DmChat, type ProposalLine,
} from './crew-cliq-core.ts';

type Fetch = typeof fetch;

export interface CrewCliqResult { ok: boolean; active: boolean; commands: number; ignored: number; notified: number; note?: string; error?: string }

interface Settings {
  cliq_enabled: boolean; cliq_commands_enabled: boolean; cliq_connection_id: string | null; cliq_owner_id: string | null;
  cliq_cursor_ms: number | string; owner_profile_id: string | null;
  cliq_dm?: boolean | null; cliq_dm_chat_id?: string | null; cliq_error?: string | null; cliq_error_at?: string | null;
}

/** At most this many commands per run; the rest wait for the next minute. */
const MAX_COMMANDS = 10;
/** At most this many new proposals are posted per run, so a burst never floods the chat. */
const MAX_POSTS = 5;
/** The generic "could not send you a direct message" line goes into the channel at most this often. */
const NOTICE_EVERY_MS = 6 * 3_600_000;

type Reply = { title: string; text: string };
type Get = (url: string) => Promise<{ ok: true; json: unknown } | { ok: false; status: number }>;

export async function runCrewCliq(db: SupabaseClient, doFetch: Fetch = fetch): Promise<CrewCliqResult> {
  const { data: s } = await db.from('crew_settings')
    .select('cliq_enabled, cliq_commands_enabled, cliq_connection_id, cliq_owner_id, cliq_cursor_ms, owner_profile_id, cliq_dm, cliq_dm_chat_id, cliq_error, cliq_error_at').eq('id', true).maybeSingle();
  const st = s as Settings | null;
  // Dormant: nothing is read, nothing is posted, until the owner has switched everything on and typed his Cliq account.
  if (!st || !st.cliq_enabled || !st.cliq_commands_enabled || !st.cliq_connection_id || !st.cliq_owner_id) return { ok: true, active: false, commands: 0, ignored: 0, notified: 0, note: 'switched off' };
  const out = await run(db, st, doFetch);
  // Keep the last problem where the settings card can show it (and clear it once things work). Written only when it changes.
  const was = st.cliq_error ?? null;
  const now = out.error ?? null;
  if (was !== now) await db.from('crew_settings').update({ cliq_error: now, cliq_error_at: now ? new Date().toISOString() : null }).eq('id', true);
  return out;
}

async function run(db: SupabaseClient, st: Settings, doFetch: Fetch): Promise<CrewCliqResult> {
  const out: CrewCliqResult = { ok: true, active: true, commands: 0, ignored: 0, notified: 0 };
  const fail = (error: string): CrewCliqResult => ({ ...out, ok: false, error });
  const ownerId = st.cliq_owner_id as string;
  const dm = st.cliq_dm === true;

  const { data: conn } = await db.from('agent_connections').select('id, kind, name, config, vault_secret_names').eq('id', st.cliq_connection_id as string).maybeSingle();
  if (!conn || conn.kind !== 'cliq') return fail('The chosen Cliq connection no longer exists.');
  const cfg = (conn.config ?? {}) as Record<string, unknown>;
  const dc = cfg.dc;
  const channel = cfg.channel;
  if (cfg.mode !== 'api' || !validDc(dc)) return fail('Commands need the Cliq connection that signs in with Zoho.');
  if (!dm && !validChannel(channel)) return fail('Commands need the Cliq connection that signs in with Zoho, with a channel.');
  const ref = conn as { id: string; name: string; vault_secret_names: string[] };
  const secrets = await readConnectionSecrets(db, ref);
  const save = accessSaver(db, ref);
  const tok = await cliqAccessToken(cfg, secrets, save, doFetch);
  if (!tok.ok) return fail(tok.error);
  // The same token for every call in this run (a run is well under a minute), so Zoho is asked for one token at most.
  const live: Secrets = { ...secrets, access: packAccess(tok.token, 300, Date.now()) };
  const deps = { fetch: doFetch, saveAccess: save };
  const connection = { kind: 'cliq' as ConnectionKind, name: ref.name, config: cfg };

  const { data: prof } = st.owner_profile_id ? await db.from('profiles').select('full_name').eq('id', st.owner_profile_id).maybeSingle() : { data: null };
  const mention = { name: (prof?.full_name as string | undefined) ?? 'Owner', id: ownerId };
  /**
   * Send one message to the owner: as a direct message (he is the one addressed, so no tag is needed) or in the channel with him tagged.
   * A failed direct message says why in plain words (a 401 or 403 means Zoho's sign-in lacks a permission).
   */
  const send = async (m: Reply): Promise<{ ok: true } | { ok: false; error: string }> => {
    const r = dm
      ? await deliver(connection, live, { title: m.title, text: m.text, event: 'crew', cliq: { dm: ownerId } }, deps)
      : await deliver(connection, live, { title: m.title, text: m.text, event: 'crew', mention }, deps);
    if (r.ok) return { ok: true };
    return { ok: false, error: dm ? dmFailureText(r.status, ref.name) : r.error };
  };
  /**
   * When a direct message cannot be sent, the only thing posted in a channel is a short generic line with no proposal, name or amount in it
   * (a channel is seen by other people), and only if the connection has a channel, and at most every few hours.
   */
  const noticeInChannel = async () => {
    if (!dm || !validChannel(channel)) return;
    if (st.cliq_error && st.cliq_error_at && Date.now() - Date.parse(st.cliq_error_at) < NOTICE_EVERY_MS) return;
    const n = formatChannelNotice();
    await deliver(connection, live, { title: n.title, text: n.text, event: 'crew', mention }, deps);
  };

  // The first run after the owner turned this on (or changed the account or destination): start reading from NOW, so no old message is ever carried out,
  // and do not announce proposals that were already waiting one by one: say how many, and the owner can ask for "status".
  const cursor = Number(st.cliq_cursor_ms);
  if (!Number.isFinite(cursor) || cursor <= 0) {
    const { data: claimed } = await db.from('crew_settings').update({ cliq_cursor_ms: Date.now() }).eq('id', true).eq('cliq_cursor_ms', 0).select('id');
    if (!claimed || claimed.length === 0) return out;
    const { data: marked } = await db.from('crew_proposals').update({ cliq_notified_at: new Date().toISOString() }).eq('status', 'pending').is('cliq_notified_at', null).select('id');
    const r = await send(formatWelcome((marked ?? []).length));
    if (!r.ok) { out.error = r.error; out.ok = false; await noticeInChannel(); }
    return { ...out, note: 'started' };
  }

  const get: Get = async (url) => {
    try {
      const r = await doFetch(url, { headers: { Authorization: `Zoho-oauthtoken ${tok.token}`, Accept: 'application/json' }, redirect: 'manual', signal: AbortSignal.timeout(15_000) });
      if (r.status < 200 || r.status >= 300) { await r.body?.cancel().catch(() => {}); return { ok: false, status: r.status }; }
      return { ok: true, json: await r.json().catch(() => ({})) };
    } catch { return { ok: false, status: 0 }; }
  };
  // The owner as Zoho knows him: a typed email is turned into his Cliq user id by one look-up (done at most once a run, and only when needed).
  let resolved: string | null | undefined;
  const resolveOwner = async (): Promise<string | null> => {
    if (!ownerId.includes('@')) return ownerId;
    if (resolved === undefined) {
      const url = userUrl(dc, ownerId);
      const r = url ? await get(url) : null;
      resolved = r && r.ok ? parseUserId(r.json) : null;
    }
    return resolved;
  };

  // ── INBOUND ──────────────────────────────────────────────────────────────
  const inbound = dm ? await readDm(db, st, get, dc, cursor, resolveOwner) : await readChannel(get, dc, channel as string, cursor);
  if (!inbound.ok) out.error = inbound.error;
  else {
    // An owner typed as an email: Zoho may not put the email in a message, so compare the ids as well.
    const fresh = inbound.messages.filter((m) => m.time > cursor);
    const idForCompare = ownerId.includes('@') && fresh.some((m) => !m.senderEmail) ? await resolveOwner() : null;
    // planCommands keeps only the owner's account and drops everything carrying our own mark: in a direct chat with oneself ALL messages come
    // from the owner's account, so that mark is what stops the bot from obeying its own proposals.
    const plan = planCommands(
      inbound.messages.map((m) => ({ id: m.id, time: m.time, text: m.text, senderId: m.senderId, senderEmail: m.senderEmail })),
      { ownerId, cursorMs: cursor, resolvedOwnerId: idForCompare },
    );
    let agents: AgentRef[] | null = null;
    for (const { message: m, command: c } of plan.slice(0, MAX_COMMANDS)) {
      // Move the mark past this message BEFORE doing anything: if two runs overlap, only one of them gets it, and a message is never carried out twice.
      const { data: claimed } = await db.from('crew_settings').update({ cliq_cursor_ms: m.time }).eq('id', true).lt('cliq_cursor_ms', m.time).select('id');
      if (!claimed || claimed.length === 0) continue;
      if (c.kind === 'unknown') { out.ignored++; continue; }

      let reply: Reply;
      if (c.kind === 'help') reply = formatHelp();
      else if (c.kind === 'status') {
        const { data, error } = await db.rpc('crew_cliq_pending_list', { p_limit: 10 });
        reply = error ? formatError(error.message) : formatStatus((data ?? []) as ProposalLine[]);
      } else if (c.kind === 'approve' || c.kind === 'reject') {
        const note = c.kind === 'approve' ? (c.confirm ? 'CONFIRM' : null) : (c.reason || null);
        const { data, error } = await db.rpc('crew_cliq_decide', { p_code: c.code, p_decision: c.kind, p_note: note });
        const d = (data ?? {}) as { status?: string; error?: string | null; agent?: string; summary?: string };
        reply = error ? formatError(error.message) : formatDecision(c.kind, d);
      } else {
        // "name: message": only when the name is somebody on the team. Otherwise the owner is talking to a person in the chat: stay silent.
        if (!agents) {
          const { data } = await db.from('crew_agents').select('slug, name').eq('active', true);
          agents = (data ?? []) as AgentRef[];
        }
        const who = resolveAgent(c.agent, agents);
        if (!who.ok && who.why === 'none') { out.ignored++; continue; }
        if (!who.ok) reply = formatError(`More than one person is called ${c.agent}: use their slug, for example cfo.`);
        else {
          const { data, error } = await db.rpc('crew_cliq_say', { p_agent_slug: who.slug, p_body: c.message });
          reply = error ? formatError(error.message) : formatSaid(String((data as { agent?: string } | null)?.agent ?? c.agent));
        }
      }
      out.commands++;
      const r = await send(reply);
      if (!r.ok) out.error = r.error;
    }
  }

  // ── OUTBOUND ─────────────────────────────────────────────────────────────
  const { data: rows } = await db.rpc('crew_cliq_pending_to_notify', { p_limit: MAX_POSTS });
  const list = (rows ?? []) as (ProposalLine & { id: string })[];
  if (list.length > 0) {
    // Take them before posting (two overlapping runs never post the same one twice); give back any that could not be posted.
    const { data: took } = await db.rpc('crew_cliq_mark_notified', { p_ids: list.map((r) => r.id) });
    const mine = new Set(((took ?? []) as string[]));
    const left = list.filter((r) => mine.has(r.id));
    const unposted = new Set(left.map((r) => r.id));
    for (const row of left) {
      const r = await send(formatProposal(row));
      if (!r.ok) { out.error = r.error; await noticeInChannel(); break; }
      unposted.delete(row.id);
      out.notified++;
    }
    if (unposted.size > 0) await db.rpc('crew_cliq_unmark_notified', { p_ids: [...unposted] });
  }

  out.ok = !out.error;
  return out;
}

type Read = { ok: true; messages: CliqMessage[] } | { ok: false; error: string };
const zohoError = (status: number) => (status === 0 ? 'Could not reach Zoho Cliq.' : describeCliqStatus(status));

/** The messages of one chat since a little before the mark (a channel's chat, or the owner's direct chat). */
async function readChat(get: Get, dc: CliqDc, chatId: string, cursorMs: number): Promise<{ ok: true; messages: CliqMessage[] } | { ok: false; status: number; error: string }> {
  const messages: CliqMessage[] = [];
  let tokenNext: string | null = null;
  for (let page = 0; page < 3; page++) {
    const url = chatMessagesUrl(dc, chatId, Math.max(0, cursorMs - 60_000), tokenNext);
    if (!url) return { ok: false, status: 0, error: 'The chat address is not valid.' };
    const r = await get(url);
    if (!r.ok) return { ok: false, status: r.status, error: zohoError(r.status) };
    const p = parseMessages(r.json);
    messages.push(...p.messages);
    tokenNext = p.next;
    if (!tokenNext) break;
  }
  return { ok: true, messages };
}

/** The messages in the configured channel. Finds the channel's chat by its unique name, as the Cliq watch does. */
async function readChannel(get: Get, dc: CliqDc, unique: string, cursorMs: number): Promise<Read> {
  let chatId: string | null = null;
  let next: string | null = null;
  for (let page = 0; page < 5 && !chatId; page++) {
    const r = await get(channelsUrl(dc, next));
    if (!r.ok) return { ok: false, error: zohoError(r.status) };
    const p = parseChannels(r.json);
    chatId = p.channels.find((c) => c.unique === unique)?.chatId ?? null;
    next = p.next;
    if (!next) break;
  }
  if (!chatId) return { ok: false, error: 'The channel was not found for the connected Zoho account.' };
  const r = await readChat(get, dc, chatId, cursorMs);
  return r.ok ? r : { ok: false, error: r.error };
}

/**
 * The messages in the owner's direct chat with the connected Zoho account. The chat is found once in Zoho's list of direct chats (the one that has the
 * owner in it) and remembered in crew_settings.cliq_dm_chat_id; Zoho allows only about five chat-list calls a minute, so the list is not asked every run.
 * No chat yet is not an error: the first direct message we send creates it, and it is found on the next run.
 */
async function readDm(db: SupabaseClient, st: Settings, get: Get, dc: CliqDc, cursorMs: number, resolveOwner: () => Promise<string | null>): Promise<Read> {
  let chatId = st.cliq_dm_chat_id ?? null;
  if (chatId) {
    const r = await readChat(get, dc, chatId, cursorMs);
    if (r.ok) return r;
    if (r.status !== 404 && r.status !== 400) return { ok: false, error: r.error };
    chatId = null;   // the remembered chat is gone: look it up again
  }
  const owner = await resolveOwner();
  if (!owner) return { ok: false, error: 'Could not look up your Cliq account from that email. Type your Cliq user id (the number) instead.' };
  const chats: DmChat[] = [];
  let next: string | null = null;
  for (let page = 0; page < 5; page++) {
    const url = dmChatsUrl(dc, next);
    if (!url) break;
    const r = await get(url);
    if (!r.ok) return { ok: false, error: r.status === 401 || r.status === 403 ? 'Zoho did not allow reading your direct chats. Open Agent > Connections and press Reconnect to Zoho, then allow the permissions.' : zohoError(r.status) };
    const p = parseDmChats(r.json);
    chats.push(...p.chats);
    chatId = pickDmChat(chats, owner);
    next = p.next;
    if (chatId || !next) break;
  }
  if (!chatId) return { ok: true, messages: [] };
  await db.from('crew_settings').update({ cliq_dm_chat_id: chatId }).eq('id', true);
  const r = await readChat(get, dc, chatId, cursorMs);
  return r.ok ? r : { ok: false, error: r.error };
}
