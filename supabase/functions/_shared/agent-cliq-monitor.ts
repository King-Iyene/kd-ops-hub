// Ops Agent, Cliq watch: one read of Zoho Cliq for every connection that has "Watch" switched on.
// Called by the agent-cliq-monitor function (pg_cron, every 2 working hours) and by "Check now" in Connections.
// It only reads Cliq and writes our own tables (agent_cliq_watch, agent_cliq_messages). The Inbox items come from rule CQ01 in the database.
// A secret is never put in a result or a log: only short sentences.

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';
import { validDc, type CliqDc } from './agent-cliq-core.ts';
import { cliqAccessToken } from './agent-cliq.ts';
import { accessSaver, readConnectionSecrets } from './agent-conn-secrets.ts';
import { channelsUrl, chatMessagesUrl, describeCliqStatus, findAnswers, parseChannels, parseMessages, trackNew, type CliqChannel, type CliqMessage, type OpenRow } from './agent-cliq-monitor-core.ts';

type Fetch = typeof fetch;
export interface WatchResult { connection_id: string; ok: boolean; error?: string; channels: number; scanned: number; tracked: number; answered: number; failed_channels: number; skipped?: boolean }

const DAY = 86_400_000;
const MAX_CHANNELS = 120;
const MAX_PAGES = 5;

interface Watch { connection_id: string; enabled_at: string | null; checked_through: string | null; last_run_at: string | null }

export async function runCliqWatch(db: SupabaseClient, opts: { connectionId?: string; force?: boolean } = {}, doFetch: Fetch = fetch): Promise<WatchResult[]> {
  let q = db.from('agent_cliq_watch').select('connection_id, enabled_at, checked_through, last_run_at').eq('enabled', true);
  if (opts.connectionId) q = q.eq('connection_id', opts.connectionId);
  const { data } = await q;
  const out: WatchResult[] = [];
  for (const w of (data ?? []) as Watch[]) {
    if (!opts.force && w.last_run_at && Date.now() - Date.parse(w.last_run_at) < 90 * 60_000) {
      out.push({ connection_id: w.connection_id, ok: true, skipped: true, channels: 0, scanned: 0, tracked: 0, answered: 0, failed_channels: 0 });
      continue;
    }
    out.push(await runOne(db, w, doFetch));
  }
  return out;
}

async function runOne(db: SupabaseClient, w: Watch, doFetch: Fetch): Promise<WatchResult> {
  const res: WatchResult = { connection_id: w.connection_id, ok: false, channels: 0, scanned: 0, tracked: 0, answered: 0, failed_channels: 0 };
  const started = Date.now();
  const finish = async (error: string | null) => {
    res.ok = !error;
    if (error) res.error = error;
    const patch: Record<string, unknown> = {
      last_run_at: new Date(started).toISOString(), last_error: error, updated_at: new Date().toISOString(),
      stats: { channels: res.channels, scanned_messages: res.scanned, new_tagged: res.tracked, answered: res.answered, failed_channels: res.failed_channels, took_ms: Date.now() - started },
    };
    if (!error) patch.last_ok_at = new Date(started).toISOString();
    // Only move the "read up to here" mark forward when every channel was read, so nothing is skipped.
    if (!error && res.failed_channels === 0) patch.checked_through = new Date(started).toISOString();
    await db.from('agent_cliq_watch').update(patch).eq('connection_id', w.connection_id);
    return res;
  };

  const { data: conn } = await db.from('agent_connections').select('id, kind, name, config, vault_secret_names').eq('id', w.connection_id).maybeSingle();
  if (!conn || conn.kind !== 'cliq' || (conn.config as Record<string, unknown>)?.mode !== 'api') return finish('This is not a Zoho Cliq connection that signs in with Zoho.');
  const cfg = conn.config as Record<string, unknown>;
  const dc = cfg.dc;
  if (!validDc(dc)) return finish('The Zoho data center is missing on the connection.');
  const secrets = await readConnectionSecrets(db, conn as { id: string; vault_secret_names: string[] });
  const tok = await cliqAccessToken(cfg, secrets, accessSaver(db, conn as { id: string; vault_secret_names: string[] }), doFetch);
  if (!tok.ok) return finish(tok.error);

  const get = async (url: string): Promise<{ ok: true; json: unknown } | { ok: false; status: number }> => {
    try {
      const r = await doFetch(url, { headers: { Authorization: `Zoho-oauthtoken ${tok.token}`, Accept: 'application/json' }, redirect: 'manual', signal: AbortSignal.timeout(15_000) });
      if (r.status === 204) return { ok: true, json: {} };
      if (r.status < 200 || r.status >= 300) { await r.body?.cancel().catch(() => {}); return { ok: false, status: r.status }; }
      return { ok: true, json: await r.json().catch(() => ({})) };
    } catch { return { ok: false, status: 0 }; }
  };

  // 1. the channels this Zoho account can see
  const channels: CliqChannel[] = [];
  let next: string | null = null;
  for (let page = 0; page < MAX_PAGES; page++) {
    const r = await get(channelsUrl(dc as CliqDc, next));
    if (!r.ok) return finish(r.status === 0 ? 'Could not reach Zoho Cliq.' : describeCliqStatus(r.status));
    const p = parseChannels(r.json);
    channels.push(...p.channels);
    next = p.next;
    if (!next) break;
  }
  res.channels = channels.length;
  if (channels.length === 0) return finish('Zoho returned no channels for this account. Check that the connected Zoho user belongs to the channels to watch.');

  const { data: st } = await db.from('agent_settings').select('app_url').eq('id', true).maybeSingle();
  let appHost = '';
  try { appHost = new URL(String((st as { app_url?: string } | null)?.app_url ?? 'https://ops.kdsquares.com')).host; } catch { /* keep empty */ }

  const now = Date.now();
  const enabledMs = w.enabled_at ? Date.parse(w.enabled_at) : now;
  const checkedMs = w.checked_through ? Date.parse(w.checked_through) : enabledMs;
  const floor = now - 7 * DAY;
  const { data: openAll } = await db.from('agent_cliq_messages').select('id, chat_id, message_id, tagged_cliq_id, posted_at, thread_chat_id').eq('connection_id', w.connection_id).eq('status', 'open').limit(3000);
  const openByChat = new Map<string, (OpenRow & { chat_id: string })[]>();
  for (const o of (openAll ?? []) as (OpenRow & { chat_id: string })[]) { const a = openByChat.get(o.chat_id) ?? []; a.push(o); openByChat.set(o.chat_id, a); }

  const fetchMessages = async (chatId: string, fromMs: number): Promise<CliqMessage[] | null> => {
    const all: CliqMessage[] = [];
    let tokenNext: string | null = null;
    for (let page = 0; page < MAX_PAGES; page++) {
      const url = chatMessagesUrl(dc as CliqDc, chatId, fromMs, tokenNext);
      if (!url) return null;
      const r = await get(url);
      if (!r.ok) { if (res.failed_channels === 0) res.error = r.status === 0 ? 'Could not reach Zoho Cliq.' : describeCliqStatus(r.status); return null; }
      const p = parseMessages(r.json);
      all.push(...p.messages);
      tokenNext = p.next;
      if (!tokenNext) break;
    }
    return all;
  };

  // 2. each channel: new tagged messages, and answers to the ones still waiting
  const work = channels.slice(0, MAX_CHANNELS);
  let cursor = 0;
  const worker = async () => {
    while (cursor < work.length) {
      const ch = work[cursor++];
      const waiting = openByChat.get(ch.chatId) ?? [];
      const oldestWaiting = waiting.length ? Math.min(...waiting.map((o) => Date.parse(o.posted_at))) : Infinity;
      const from = Math.max(floor, Math.min(checkedMs - 10 * 60_000, oldestWaiting - 60_000));
      const msgs = await fetchMessages(ch.chatId, from);
      if (!msgs) { res.failed_channels++; continue; }
      res.scanned += msgs.length;

      const fresh = trackNew(msgs, ch, { appHost, sinceMs: Math.max(floor, enabledMs) });
      if (fresh.length) {
        const rows = fresh.map((r) => ({ ...r, connection_id: w.connection_id, status: r.classification === 'ack' ? 'no_answer_needed' : 'open' }));
        const { data: ins } = await db.from('agent_cliq_messages').upsert(rows, { onConflict: 'connection_id,message_id,tagged_cliq_id', ignoreDuplicates: true }).select('id');
        res.tracked += (ins ?? []).length;
      }

      const { data: openNow } = await db.from('agent_cliq_messages').select('id, message_id, tagged_cliq_id, posted_at, thread_chat_id').eq('connection_id', w.connection_id).eq('chat_id', ch.chatId).eq('status', 'open');
      const open = (openNow ?? []) as OpenRow[];
      if (open.length === 0) continue;
      // replies inside a thread live in the thread's own chat: read those too (a few per channel)
      const threadMsgs: Record<string, CliqMessage[]> = {};
      for (const tid of [...new Set(open.map((o) => o.thread_chat_id).filter((t): t is string => !!t))].slice(0, 15)) {
        const tm = await fetchMessages(tid, Math.max(floor, Math.min(...open.filter((o) => o.thread_chat_id === tid).map((o) => Date.parse(o.posted_at))) - 60_000));
        if (tm) threadMsgs[tid] = tm;
      }
      for (const a of findAnswers(open, msgs, threadMsgs)) {
        const { data: upd } = await db.from('agent_cliq_messages').update({ status: 'answered', answered_at: a.at, answered_in: a.in }).eq('id', a.id).eq('status', 'open').select('id');
        res.answered += (upd ?? []).length;
      }
    }
  };
  await Promise.all([worker(), worker(), worker(), worker()]);

  const firstError = res.failed_channels > 0 ? (res.error ?? 'Some channels could not be read.') : null;
  res.error = undefined;
  return finish(res.failed_channels === work.length ? (firstError ?? 'No channel could be read.') : null).then((r) => {
    if (r.ok && firstError) r.error = `${res.failed_channels} channel${res.failed_channels === 1 ? '' : 's'} could not be read: ${firstError}`;
    return r;
  });
}
