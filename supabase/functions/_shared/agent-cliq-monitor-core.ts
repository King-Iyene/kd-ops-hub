// Ops Agent, Cliq watch: the pure parts (no Deno APIs, so they can be unit tested).
//
// What it does with what Zoho Cliq returns:
//   - lists the channels the connected Zoho account can see (and drops archived or external ones),
//   - reads the messages of each channel since the last check,
//   - keeps the messages that tag a person and need an answer (not a thank-you, an FYI or a tag of everyone),
//   - decides whether a tagged person has answered: any later message from them in the same channel or in the thread of that message.
// Zoho answers are read defensively: a field that is not there is skipped, never a crash. Only fixed Zoho hosts are called (see urls below).

import { validDc, type CliqDc } from './agent-cliq-core.ts';

export interface CliqChannel { channelId: string; name: string; unique: string; chatId: string }
export interface CliqMessage { id: string; time: number; senderId: string; senderName: string; text: string; mentionIds: string[]; mentionNames: Record<string, string>; threadChatId: string | null }
export type Classification = 'request' | 'message' | 'ack';
export interface TrackedRow {
  channel_id: string; channel_name: string; channel_unique: string; chat_id: string; message_id: string; thread_chat_id: string | null; posted_at: string;
  sender_cliq_id: string; sender_name: string; tagged_cliq_id: string; tagged_name: string; text: string; classification: Classification;
}
export interface OpenRow { id: string; message_id: string; tagged_cliq_id: string; posted_at: string; thread_chat_id: string | null }

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const str = (v: unknown): string => (typeof v === 'string' ? v : typeof v === 'number' && Number.isFinite(v) ? String(v) : '');

// ── addresses (fixed Zoho hosts only) ──────────────────────────────────────
const safeId = (v: string) => /^[A-Za-z0-9_.:-]{1,120}$/.test(v);
export const channelsUrl = (dc: CliqDc, nextToken?: string | null) => {
  const q = new URLSearchParams({ limit: '100' });
  if (nextToken) q.set('next_token', nextToken);
  return `https://cliq.zoho.${dc}/api/v2/channels?${q.toString()}`;
};
export const chatMessagesUrl = (dc: CliqDc, chatId: string, fromMs: number, nextToken?: string | null): string | null => {
  if (!validDc(dc) || !safeId(chatId)) return null;
  const q = new URLSearchParams({ limit: '100', from_time: String(Math.max(0, Math.floor(fromMs))) });
  if (nextToken) q.set('next_token', nextToken);
  return `https://cliq.zoho.${dc}/api/v2/chats/${encodeURIComponent(chatId)}/messages?${q.toString()}`;
};

// ── what Zoho returned ─────────────────────────────────────────────────────
export function parseChannels(json: unknown): { channels: CliqChannel[]; next: string | null } {
  const j = obj(json);
  const list = Array.isArray(j.channels) ? j.channels : Array.isArray(j.data) ? j.data : [];
  const channels: CliqChannel[] = [];
  for (const raw of list) {
    const c = obj(raw);
    const unique = str(c.unique_name);
    const chatId = str(c.chat_id);
    if (!unique || !chatId) continue;
    const level = str(c.level).toLowerCase();
    const archived = c.archived === true || str(c.status).toLowerCase() === 'archived' || c.is_archived === true;
    if (archived || level === 'external') continue;
    channels.push({ channelId: str(c.channel_id) || chatId, name: str(c.name) || unique, unique, chatId });
  }
  const next = str(j.next_token) || str(obj(j.pagination).next_token);
  return { channels, next: next || null };
}

const MENTION = /\{@([A-Za-z0-9_.-]{1,60})\}/g;
const EVERYONE = new Set(['all', 'everyone', 'channel', 'here']);

export function parseMessages(json: unknown): { messages: CliqMessage[]; next: string | null } {
  const j = obj(json);
  const list = Array.isArray(j.data) ? j.data : Array.isArray(j.messages) ? j.messages : [];
  const messages: CliqMessage[] = [];
  for (const raw of list) {
    const m = obj(raw);
    const id = str(m.id) || str(m.message_id);
    const time = Number(m.time ?? m.timestamp ?? m.created_time);
    if (!id || !Number.isFinite(time)) continue;
    const type = str(m.type).toLowerCase();
    if (type && !['text', 'file', 'comment', 'link', 'image'].includes(type)) continue; // joins, leaves, system lines
    const content = obj(m.content);
    const text = (str(content.text) || str(m.text) || str(content.comment) || '').trim();
    const sender = obj(m.sender ?? m.user ?? m.from);
    const mentionNames: Record<string, string> = {};
    const ids = new Set<string>();
    for (const t of text.matchAll(MENTION)) ids.add(t[1]);
    const list2 = Array.isArray(m.mentions) ? m.mentions : Array.isArray(content.mentions) ? content.mentions : [];
    for (const mm of list2) {
      const o = obj(mm);
      const mid = str(o.id) || str(obj(o.user).id);
      if (!mid) continue;
      ids.add(mid);
      const nm = str(o.name) || str(obj(o.user).name);
      if (nm) mentionNames[mid] = nm;
    }
    const thread = obj(m.thread);
    const threadChatId = str(m.thread_chat_id) || str(thread.chat_id) || str(thread.thread_chat_id) || str(m.thread_id) || null;
    messages.push({
      id, time: time < 1e11 ? time * 1000 : time, senderId: str(sender.id) || str(sender.zuid), senderName: str(sender.name) || str(sender.first_name),
      text, mentionIds: [...ids].filter((x) => !EVERYONE.has(x.toLowerCase())), mentionNames, threadChatId,
    });
  }
  const next = str(j.next_token) || str(obj(j.pagination).next_token);
  return { messages, next: next || null };
}

// ── which messages count ───────────────────────────────────────────────────
/** The agent's own posts (summaries, follow-ups) carry a title line in bold and a link to KD Ops: they are never waiting for an answer. */
export function isOwnMessage(text: string, appHost: string): boolean {
  if (text.includes(OWN_MARK)) return true;
  return /^\*[^*\n]{2,200}\*\n/.test(text) && !!appHost && text.includes(appHost);
}
/** Added (invisible) to every message the agent posts to Cliq, so the watch can tell them from people's. */
export const OWN_MARK = '⁣';

const ACK_WORDS = /^(thanks?|thank you|thx|ty|ok(ay)?|noted|done|got it|gotcha|fyi|cool|great|nice|good job|well done|congrats|congratulations|welcome|you'?re welcome|sure|will do|alright|perfect|awesome|amazing|lovely|good (morning|afternoon|evening|night)|happy [a-z ]+|cheers|sounds good|no problem|np)$/i;

/** Take the tags out, then decide whether the rest is a question or request, a plain message, or only an acknowledgement (nothing to answer). */
export function classify(text: string): Classification {
  const rest = text.replace(MENTION, ' ').replace(/@[A-Za-z][\w.'-]*(\s[A-Z][\w.'-]*)?/g, ' ').replace(/[\s⁣]+/g, ' ').trim();
  const bare = rest.replace(/[!.,:;~*_()-]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (bare.length === 0) return 'ack';
  if (/^[\p{Extended_Pictographic}\s️]+$/u.test(bare)) return 'ack';
  if (ACK_WORDS.test(bare)) return 'ack';
  if (/^fyi\b/i.test(bare) || /\bfor your (information|awareness)\b/i.test(bare)) return 'ack';
  if (rest.includes('?') || /\b(please|pls|kindly|can you|could you|would you|will you|need(s)?|update|status|confirm|share|send|check|review|let me know|any news|when will|when can|what|why|how|who|where|follow up|reply|respond)\b/i.test(rest)) return 'request';
  return 'message';
}

/** The tag token reads as a name where Zoho gave one, else a plain "@person" (the ids are not shown to people). */
export function readableText(m: CliqMessage): string {
  return m.text.replace(MENTION, (_x, id: string) => `@${m.mentionNames[id] || 'someone'}`).replace(/⁣/g, '').trim().slice(0, 1000);
}

export function trackNew(messages: CliqMessage[], ch: CliqChannel, opts: { appHost: string; sinceMs: number }): TrackedRow[] {
  const out: TrackedRow[] = [];
  for (const m of messages) {
    if (m.time < opts.sinceMs || m.mentionIds.length === 0 || !m.senderId) continue;
    if (isOwnMessage(m.text, opts.appHost)) continue;
    const cls = classify(m.text);
    for (const tagged of m.mentionIds) {
      if (tagged === m.senderId) continue;
      out.push({
        channel_id: ch.channelId, channel_name: ch.name, channel_unique: ch.unique, chat_id: ch.chatId, message_id: m.id, thread_chat_id: m.threadChatId,
        posted_at: new Date(m.time).toISOString(), sender_cliq_id: m.senderId, sender_name: m.senderName, tagged_cliq_id: tagged,
        tagged_name: m.mentionNames[tagged] ?? '', text: readableText(m), classification: cls,
      });
    }
  }
  return out;
}

/** Any later message from the tagged person, in the channel or in the thread of the tagged message, answers it. */
export function findAnswers(open: OpenRow[], channelMessages: CliqMessage[], threadMessages: Record<string, CliqMessage[]> = {}): { id: string; at: string; in: 'channel' | 'thread' }[] {
  const out: { id: string; at: string; in: 'channel' | 'thread' }[] = [];
  for (const row of open) {
    const t0 = Date.parse(row.posted_at);
    let best: { at: number; in: 'channel' | 'thread' } | null = null;
    for (const m of channelMessages) {
      if (m.senderId !== row.tagged_cliq_id || m.id === row.message_id || m.time <= t0) continue;
      if (!best || m.time < best.at) best = { at: m.time, in: 'channel' };
    }
    const thread = row.thread_chat_id ? threadMessages[row.thread_chat_id] ?? [] : [];
    for (const m of thread) {
      if (m.senderId !== row.tagged_cliq_id || m.id === row.message_id || m.time <= t0) continue;
      if (!best || m.time < best.at) best = { at: m.time, in: 'thread' };
    }
    if (best) out.push({ id: row.id, at: new Date(best.at).toISOString(), in: best.in });
  }
  return out;
}

/** A short sentence for what went wrong calling Zoho (never any secret). */
export function describeCliqStatus(status: number): string {
  if (status === 401) return 'Zoho did not accept the saved sign-in. Press "Reconnect to Zoho" on the connection.';
  if (status === 403) return 'Zoho did not allow reading messages. Press "Reconnect to Zoho" and allow the new read permissions.';
  if (status === 404) return 'Zoho could not find that channel.';
  if (status === 429) return 'Zoho asked us to slow down. It will try again at the next check.';
  if (status >= 500) return `Zoho Cliq had a problem (HTTP ${status}). It will try again at the next check.`;
  return `Zoho Cliq answered HTTP ${status}.`;
}
