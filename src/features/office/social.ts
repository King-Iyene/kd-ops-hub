// Ringing and messaging people in the office. Pure helpers, no browser APIs.

export const MAX_MESSAGE = 280;
/** Do not ring or message the same person more often than this. */
export const MIN_GAP_MS = 8000;

/** A short note sent straight to one person: a ring (knock on their shoulder) or a text message. */
export interface Ping {
  k: 'ring' | 'dm';
  /** from */
  f: string;
  /** sender display name */
  n: string;
  /** to */
  t: string;
  /** the office the sender is in (so the receiver can go there) */
  s: string | null;
  text?: string;
  /** a picture in the 'office-shared' bucket, uploaded by the sender into their own folder */
  img?: string;
}

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const IMG_PATH = /^[0-9a-f-]{36}\/[\w-]{8,60}\.(png|jpe?g|gif|webp)$/i;

/** A shared picture must live in the sender's own folder, with a plain file name. */
export function validImagePath(path: unknown, senderId: string): path is string {
  return typeof path === 'string' && path.startsWith(`${senderId}/`) && IMG_PATH.test(path);
}

export type Piece = { text: string; href?: string };

/** Split text into plain pieces and clickable web links (only http and https, never other schemes). */
export function splitLinks(text: string): Piece[] {
  const out: Piece[] = [];
  const re = /https?:\/\/[^\s<>"']+/gi;
  let last = 0;
  for (const m of text.matchAll(re)) {
    const idx = m.index ?? 0;
    const url = m[0].replace(/[.,!?)]+$/, '');
    try { new URL(url); } catch { continue; }
    if (idx > last) out.push({ text: text.slice(last, idx) });
    out.push({ text: url, href: url });
    last = idx + url.length;
  }
  if (last < text.length) out.push({ text: text.slice(last) });
  return out;
}

export function cleanText(s: string): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, MAX_MESSAGE);
}

/** Accept only well-formed pings addressed to me. */
export function parsePing(raw: unknown, myId: string): Ping | null {
  if (!raw || typeof raw !== 'object') return null;
  const p = raw as Record<string, unknown>;
  if (p.k !== 'ring' && p.k !== 'dm') return null;
  if (typeof p.f !== 'string' || p.f.length > 64 || p.f === myId || p.t !== myId) return null;
  if (typeof p.n !== 'string') return null;
  const s = typeof p.s === 'string' && p.s.length <= 64 ? p.s : null;
  const text = typeof p.text === 'string' ? cleanText(p.text) : undefined;
  const img = validImagePath(p.img, p.f) ? p.img : undefined;
  if (p.k === 'dm' && !text && !img) return null;
  return { k: p.k, f: p.f, n: p.n.slice(0, 60), t: myId, s, text: p.k === 'dm' ? text : undefined, img: p.k === 'dm' ? img : undefined };
}

/** May I send this person another ring or message yet? */
export function canSendTo(lastSent: Map<string, number>, id: string, now: number, kind: 'ring' | 'dm'): boolean {
  const key = `${kind}:${id}`;
  const prev = lastSent.get(key) ?? 0;
  // texts can follow each other quickly (a conversation); rings cannot
  return now - prev >= (kind === 'ring' ? MIN_GAP_MS : 600);
}

/** Search people and rooms by a few typed letters (every word must appear somewhere in the name). */
export function matches(name: string, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const n = name.toLowerCase();
  return q.split(/\s+/).every((w) => n.includes(w));
}
