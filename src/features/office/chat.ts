import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';

/**
 * Office chat: messages to everyone in the space and direct messages, saved so people who were offline see them later.
 * The rules for who gets told about a message are in shouldNotify (pure, tested).
 */
export const ALL = 'all';
export const MAX_BODY = 1000;

export interface ChatMsg {
  id: string;
  space_id: string;
  sender_id: string;
  to_id: string | null;
  body: string;
  img: string | null;
  kind: 'text' | 'announcement';
  mentions: string[];
  created_at: string;
}

export interface Who { id: string; name: string }

/** Which conversation a message belongs to, from my point of view: "all", or the other person. */
export function convOf(m: Pick<ChatMsg, 'to_id' | 'sender_id'>, me: string): string {
  if (m.to_id === null) return ALL;
  return m.sender_id === me ? m.to_id : m.sender_id;
}

/** People named with @ in the text: "@Kelvin", "@Kelvin Sampson". Longest matching name wins. */
export function parseMentions(text: string, people: Who[]): string[] {
  const out = new Set<string>();
  // longest names first; a name that matched is used up, so a shorter one cannot match the same words again
  let rest = text.toLowerCase();
  const sorted = [...people].sort((a, b) => b.name.length - a.name.length);
  for (const p of sorted) {
    const full = p.name.trim().toLowerCase();
    if (!full) continue;
    for (const key of [full, full.split(/\s+/)[0]]) {
      if (key.length < 2) continue;
      const re = new RegExp(`(^|[^\\w])@${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\w])`);
      const m = re.exec(rest);
      if (m) {
        out.add(p.id);
        rest = rest.slice(0, m.index + m[1].length) + ' '.repeat(key.length + 1) + rest.slice(m.index + m[1].length + key.length + 1);
        break;
      }
    }
  }
  return [...out];
}

/** Unread messages per conversation (from other people, newer than when I last read that conversation). */
export function unreadCounts(msgs: ChatMsg[], me: string, lastRead: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const m of msgs) {
    if (m.sender_id === me) continue;
    const c = convOf(m, me);
    if (new Date(m.created_at).getTime() > (lastRead[c] ?? 0)) out[c] = (out[c] ?? 0) + 1;
  }
  return out;
}

export type Alert = 'pop' | 'badge' | 'none';

/**
 * How loudly to tell me about a new message:
 *  - my own messages and a chat I am looking at: not at all
 *  - a direct message: a pop-up (just the badge while I am focusing or in a meeting)
 *  - the busy everyone channel: only when I am @mentioned or it is an announcement; otherwise just the badge
 */
export function shouldNotify(m: ChatMsg, me: string, ctx: { quiet: boolean; openConv: string | null; focused: boolean }): Alert {
  if (m.sender_id === me) return 'none';
  const conv = convOf(m, me);
  if (ctx.openConv === conv && ctx.focused) return 'none';
  const direct = m.to_id === me;
  const important = m.kind === 'announcement' || m.mentions.includes(me);
  if (direct || important) return ctx.quiet ? 'badge' : 'pop';
  return 'badge';
}

const READ_KEY = 'kd:office:chatread';
function loadRead(): Record<string, number> {
  try { return JSON.parse(localStorage.getItem(READ_KEY) ?? '{}') as Record<string, number>; } catch { return {}; }
}

// the table is newer than the generated database types, so it is reached without them
const sb = supabase as any;

export function useChat(meId: string | null, spaceId: string | null, onIncoming: (m: ChatMsg) => void) {
  const [msgs, setMsgs] = useState<ChatMsg[]>([]);
  const [lastRead, setLastRead] = useState<Record<string, number>>(() => loadRead());
  const [loading, setLoading] = useState(false);
  const incoming = useRef(onIncoming);
  incoming.current = onIncoming;

  const relevant = useCallback((m: ChatMsg) => {
    if (!meId) return false;
    if (m.to_id === null) return m.space_id === spaceId;
    return m.to_id === meId || m.sender_id === meId;
  }, [meId, spaceId]);

  useEffect(() => {
    if (!meId || !spaceId) { setMsgs([]); return; }
    let live = true;
    setLoading(true);
    void (async () => {
      const { data } = await sb.from('office_messages').select('*')
        .or(`and(space_id.eq.${spaceId},to_id.is.null),to_id.eq.${meId},sender_id.eq.${meId}`)
        .order('created_at', { ascending: false }).limit(300);
      if (!live) return;
      setMsgs(((data ?? []) as ChatMsg[]).reverse());
      setLoading(false);
    })();
    const ch = supabase.channel(`office-chat:${meId}:${spaceId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'office_messages' }, (payload) => {
        const m = payload.new as ChatMsg;
        if (!relevant(m)) return;
        setMsgs((cur) => (cur.some((x) => x.id === m.id) ? cur : [...cur.slice(-299), m]));
        incoming.current(m);
      })
      .subscribe();
    return () => { live = false; void supabase.removeChannel(ch); };
  }, [meId, spaceId, relevant]);

  const markRead = useCallback((conv: string) => {
    setLastRead((cur) => {
      const next = { ...cur, [conv]: Date.now() };
      try { localStorage.setItem(READ_KEY, JSON.stringify(next)); } catch { /* fine */ }
      return next;
    });
  }, []);

  const send = useCallback(async (p: { text: string; to: string | null; img?: string; announce?: boolean; people: Who[] }) => {
    if (!meId || !spaceId) return false;
    const body = p.text.replace(/\s+\n/g, '\n').trim().slice(0, MAX_BODY);
    if (!body && !p.img) return false;
    const { error } = await sb.from('office_messages').insert({
      space_id: spaceId, sender_id: meId, to_id: p.to, body: body || '(picture)', img: p.img ?? null,
      kind: p.announce && p.to === null ? 'announcement' : 'text', mentions: parseMentions(body, p.people),
    });
    return !error;
  }, [meId, spaceId]);

  const unread = useMemo(() => (meId ? unreadCounts(msgs, meId, lastRead) : {}), [msgs, meId, lastRead]);
  const totalUnread = useMemo(() => Object.values(unread).reduce((a, b) => a + b, 0), [unread]);
  return { msgs, loading, send, markRead, unread, totalUnread };
}
