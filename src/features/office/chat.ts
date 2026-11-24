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
  /** a file that is not a picture (document, sheet, zip, audio...), kept in the office-files bucket */
  file_path?: string | null;
  file_name?: string | null;
  file_size?: number | null;
  file_type?: string | null;
  kind: 'text' | 'announcement';
  mentions: string[];
  created_at: string;
}

export interface Who { id: string; name: string }

// ── attachments ────────────────────────────────────────────────────────────
export const MAX_FILE_BYTES = 25 * 1024 * 1024;
export const MAX_PICTURE_BYTES = 5 * 1024 * 1024;
export const MAX_ATTACHMENTS = 5;
const PICTURE = /^image\/(png|jpe?g|gif|webp)$/;
/** Types the office-files bucket accepts (the same list the database enforces). */
const FILE_TYPES = new Set([
  'application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain', 'text/csv', 'application/zip', 'application/x-zip-compressed',
  'audio/mpeg', 'audio/mp4', 'audio/wav', 'audio/webm', 'video/mp4', 'video/quicktime', 'video/webm',
]);
export const isPicture = (type: string) => PICTURE.test(type);
/** null when the file can be sent, else the sentence to show. */
export function checkAttachment(f: { name: string; type: string; size: number }): string | null {
  if (isPicture(f.type)) return f.size > MAX_PICTURE_BYTES ? 'Pictures can be up to 5 MB.' : null;
  if (!FILE_TYPES.has(f.type)) return `${f.name || 'That file'} is not a type we can send here. Use a picture, PDF, Word, Excel, PowerPoint, text, CSV, zip, audio or video file.`;
  if (f.size > MAX_FILE_BYTES) return `${f.name} is over 25 MB.`;
  if (f.size === 0) return `${f.name} is empty.`;
  return null;
}
export function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n < 0) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / 1024 / 1024).toFixed(n < 10 * 1024 * 1024 ? 1 : 0)} MB`;
}
/** A safe name for the storage path: letters, digits, dot, dash. */
export const safeFileName = (name: string) => (name.replace(/[^\w.-]+/g, '_').replace(/^[._]+/, '').slice(-80) || 'file');
export const fileKind = (type: string, name: string): 'pdf' | 'doc' | 'sheet' | 'slides' | 'zip' | 'audio' | 'video' | 'text' => {
  if (type === 'application/pdf') return 'pdf';
  if (/word/.test(type) || /\.docx?$/i.test(name)) return 'doc';
  if (/excel|spreadsheet|csv/.test(type) || /\.(xlsx?|csv)$/i.test(name)) return 'sheet';
  if (/powerpoint|presentation/.test(type)) return 'slides';
  if (/zip/.test(type)) return 'zip';
  if (type.startsWith('audio/')) return 'audio';
  if (type.startsWith('video/')) return 'video';
  return 'text';
};

/** Which conversation a message belongs to, from my point of view: "all", or the other person. */
export function convOf(m: Pick<ChatMsg, 'to_id' | 'sender_id'>, me: string): string {
  if (m.to_id === null) return ALL;
  return m.sender_id === me ? m.to_id : m.sender_id;
}

/** People named with @ in the text: "@Kelvin", "@Kelvin Sampson". Longest matching name wins. */
export function parseMentions(text: string, people: Who[], opts: { everyone?: boolean } = {}): string[] {
  const out = new Set<string>();
  // @everyone / @all / @channel tags the whole team, but only where the sender is allowed to (admins)
  if (opts.everyone && /(^|[^\w])@(everyone|all|channel)(?![\w])/i.test(text)) for (const p of people) out.add(p.id);
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

  const send = useCallback(async (p: { text: string; to: string | null; img?: string; file?: { path: string; name: string; size: number; type: string }; announce?: boolean; everyone?: boolean; people: Who[] }) => {
    if (!meId || !spaceId) return false;
    const body = p.text.replace(/\s+\n/g, '\n').trim().slice(0, MAX_BODY);
    if (!body && !p.img && !p.file) return false;
    const { error } = await sb.from('office_messages').insert({
      space_id: spaceId, sender_id: meId, to_id: p.to, body: body || (p.file ? '(file)' : '(picture)'), img: p.img ?? null,
      ...(p.file ? { file_path: p.file.path, file_name: p.file.name, file_size: p.file.size, file_type: p.file.type } : {}),
      kind: p.announce && p.to === null ? 'announcement' : 'text', mentions: parseMentions(body, p.people, { everyone: p.everyone }),
    });
    return !error;
  }, [meId, spaceId]);

  const unread = useMemo(() => (meId ? unreadCounts(msgs, meId, lastRead) : {}), [msgs, meId, lastRead]);
  const totalUnread = useMemo(() => Object.values(unread).reduce((a, b) => a + b, 0), [unread]);
  return { msgs, loading, send, markRead, unread, totalUnread };
}
