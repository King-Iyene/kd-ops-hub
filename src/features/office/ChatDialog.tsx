import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ImagePlus, Megaphone, Search, Send, Users, X } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { supabase } from '@/lib/supabase';
import { AvatarFace } from './AvatarFace';
import { ALL, MAX_BODY, convOf, type ChatMsg } from './chat';
import { MAX_IMAGE_BYTES, splitLinks } from './social';
import type { AvatarStyle } from './world/types';

export interface ChatPerson { id: string; name: string; avatar: AvatarStyle; online: boolean }

const urls = new Map<string, string>();

/** A picture in a message (a private link that is made when it is first shown). */
function ChatImage({ path }: { path: string }) {
  const [url, setUrl] = useState<string | null>(urls.get(path) ?? null);
  useEffect(() => {
    if (url) return;
    let live = true;
    void supabase.storage.from('office-shared').createSignedUrl(path, 3600).then((r) => {
      if (live && r.data?.signedUrl) { urls.set(path, r.data.signedUrl); setUrl(r.data.signedUrl); }
    });
    return () => { live = false; };
  }, [path, url]);
  if (!url) return <div className="h-32 w-48 animate-pulse rounded-xl bg-white/10" />;
  return <a href={url} target="_blank" rel="noreferrer"><img src={url} alt="Shared picture" className="max-h-60 max-w-full rounded-xl object-cover" /></a>;
}

/** Text with clickable links and highlighted @mentions. */
function Body({ text }: { text: string }) {
  return (
    <>
      {splitLinks(text).map((p, i) => p.href
        ? <a key={i} href={p.href} target="_blank" rel="noreferrer" className="break-all underline underline-offset-2">{p.text}</a>
        : <span key={i}>{p.text.split(/(@[\w.-]+)/g).map((t, j) => (t.startsWith('@') ? <span key={j} className="rounded bg-amber-400/20 px-0.5 font-semibold text-amber-300">{t}</span> : t))}</span>)}
    </>
  );
}

const clock = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
const dayLabel = (iso: string) => {
  const d = new Date(iso);
  const today = new Date();
  const y = new Date(today.getTime() - 86400000);
  return d.toDateString() === today.toDateString() ? 'Today' : d.toDateString() === y.toDateString() ? 'Yesterday' : d.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'short' });
};

/**
 * Chat: everyone in the space, and direct messages. Saved, so people who were away see what they missed.
 * Everyone-channel messages notify only for @mentions and announcements; direct messages always notify.
 */
export function ChatDialog({ open, onClose, meId, spaceName, people, conv, onConv, msgs, unread, isAdmin, loading, onRead, onSend }: {
  open: boolean;
  onClose: () => void;
  meId: string;
  spaceName: string;
  people: ChatPerson[];
  conv: string;
  onConv: (c: string) => void;
  msgs: ChatMsg[];
  unread: Record<string, number>;
  isAdmin: boolean;
  loading: boolean;
  onRead: (c: string) => void;
  onSend: (p: { text: string; file: File | null; to: string | null; announce: boolean }) => Promise<boolean>;
}) {
  const [q, setQ] = useState('');
  const [text, setText] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [announce, setAnnounce] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [listOpen, setListOpen] = useState(false); // on narrow screens: the list or the conversation
  const endRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const byId = useMemo(() => new Map(people.map((p) => [p.id, p])), [people]);
  const thread = useMemo(() => msgs.filter((m) => convOf(m, meId) === conv), [msgs, meId, conv]);
  const last = useMemo(() => {
    const out = new Map<string, ChatMsg>();
    for (const m of msgs) out.set(convOf(m, meId), m);
    return out;
  }, [msgs, meId]);

  const list = useMemo(() => {
    const n = q.trim().toLowerCase();
    return people
      .filter((p) => p.id !== meId && (!n || p.name.toLowerCase().includes(n)))
      .sort((a, b) => {
        const la = last.get(a.id)?.created_at ?? '';
        const lb = last.get(b.id)?.created_at ?? '';
        if (la !== lb) return la < lb ? 1 : -1;
        if (a.online !== b.online) return a.online ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
  }, [people, q, last, meId]);

  useEffect(() => { if (open) { setErr(null); setFile(null); setText(''); setAnnounce(false); } }, [open, conv]);
  useEffect(() => { if (open) endRef.current?.scrollIntoView({ block: 'end' }); }, [open, thread.length, conv]);
  useEffect(() => { if (open && thread.length) onRead(conv); }, [open, conv, thread.length, onRead]);

  const other = conv === ALL ? null : byId.get(conv) ?? null;
  const mention = /(^|\s)@(\w*)$/.exec(text);
  const suggestions = mention && conv === ALL ? people.filter((p) => p.id !== meId && p.name.toLowerCase().split(/\s+/)[0].startsWith(mention[2].toLowerCase())).slice(0, 5) : [];

  const pick = (f: File | null) => {
    setErr(null);
    if (f && (!/^image\/(png|jpe?g|gif|webp)$/.test(f.type) || f.size > MAX_IMAGE_BYTES)) { setErr('Pictures must be PNG, JPG, GIF or WebP, up to 5 MB.'); return; }
    setFile(f);
  };
  const send = async () => {
    if (busy || (!text.trim() && !file)) return;
    setBusy(true);
    setErr(null);
    const ok = await onSend({ text, file, to: conv === ALL ? null : conv, announce: announce && conv === ALL });
    setBusy(false);
    if (ok) { setText(''); setFile(null); setAnnounce(false); } else setErr('That did not send. Check your connection and try again.');
  };

  const row = (id: string, name: string, avatar: AvatarStyle | null, online: boolean) => {
    const m = last.get(id);
    const u = unread[id] ?? 0;
    return (
      <button key={id} type="button" onClick={() => { onConv(id); setListOpen(false); }}
        className={`flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition ${conv === id ? 'bg-white/[0.1]' : 'hover:bg-white/[0.06]'}`}>
        {avatar ? <span className="relative shrink-0"><AvatarFace avatar={avatar} size={30} dim={!online} />{online && <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-popover bg-emerald-500" />}</span>
          : <span className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full bg-primary/20 text-primary"><Users className="h-4 w-4" /></span>}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-semibold">{name}</span>
          <span className="block truncate text-[11.5px] text-muted-foreground">{m ? (m.sender_id === meId ? 'You: ' : '') + (m.body || 'Picture') : online ? 'Online' : 'Offline'}</span>
        </span>
        {u > 0 && <span className="shrink-0 rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-bold text-white">{u > 99 ? '99+' : u}</span>}
      </button>
    );
  };

  let lastDay = '';
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent onInteractOutside={(e) => e.preventDefault()} className="ko flex h-[min(82vh,44rem)] w-[calc(100vw-1.5rem)] md:max-w-4xl gap-0 overflow-hidden rounded-3xl border-white/[0.08] bg-popover/95 p-0 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.75)] backdrop-blur-2xl">
        <DialogTitle className="sr-only">Chat</DialogTitle>
        <DialogDescription className="sr-only">Message everyone in the space, or one person.</DialogDescription>

        {/* conversations */}
        <aside className={`${listOpen ? 'flex' : 'hidden'} w-full shrink-0 flex-col border-r border-white/[0.07] sm:flex sm:w-72`}>
          <div className="px-3 pb-2 pt-4">
            <p className="px-1 pb-2 text-[17px] font-extrabold tracking-tight">Chat</p>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a person" className="h-9 w-full rounded-xl bg-white/[0.05] pl-9 pr-3 text-[13px] outline-none ring-1 ring-white/[0.07] placeholder:text-muted-foreground focus:ring-primary/60" />
            </div>
          </div>
          <div className="min-h-0 flex-1 space-y-0.5 overflow-y-auto px-2 pb-3">
            {row(ALL, `Everyone in ${spaceName}`, null, true)}
            <p className="px-2.5 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">Direct messages</p>
            {list.map((p) => row(p.id, p.name, p.avatar, p.online))}
            {list.length === 0 && <p className="px-2.5 py-3 text-xs text-muted-foreground">No one matches.</p>}
          </div>
        </aside>

        {/* the conversation */}
        <section className={`${listOpen ? 'hidden' : 'flex'} min-w-0 flex-1 flex-col sm:flex`}>
          <header className="flex items-center gap-3 border-b border-white/[0.07] px-4 py-3">
            <button type="button" aria-label="Back to conversations" onClick={() => setListOpen(true)} className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-white/10 sm:hidden"><ArrowLeft className="h-4 w-4" /></button>
            {other ? <AvatarFace avatar={other.avatar} size={34} dim={!other.online} /> : <span className="flex h-[34px] w-[34px] items-center justify-center rounded-full bg-primary/20 text-primary"><Users className="h-4 w-4" /></span>}
            <div className="min-w-0 flex-1 pr-8">
              <p className="truncate text-[15px] font-bold tracking-tight">{other ? other.name : `Everyone in ${spaceName}`}</p>
              <p className="truncate text-xs text-muted-foreground">{other ? (other.online ? 'Online' : 'Offline. They will see this when they are back.') : 'Everyone in the office can read this. @name to get someone\'s attention.'}</p>
            </div>
          </header>

          <div className="min-h-0 flex-1 space-y-1 overflow-y-auto px-4 py-3">
            {loading && thread.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">Loading…</p>}
            {!loading && thread.length === 0 && (
              <div className="flex h-full flex-col items-center justify-center gap-1 text-center">
                <p className="text-sm font-semibold">{other ? `Say hello to ${other.name.split(' ')[0]}` : 'No messages yet'}</p>
                <p className="max-w-xs text-xs text-muted-foreground">{other ? 'Messages are saved, so they will see it even if they are away.' : 'Post something for the whole office, or @mention someone.'}</p>
              </div>
            )}
            {thread.map((m, i) => {
              const mine = m.sender_id === meId;
              const day = dayLabel(m.created_at);
              const showDay = day !== lastDay;
              lastDay = day;
              const prev = thread[i - 1];
              const sameSender = prev && prev.sender_id === m.sender_id && !showDay && m.kind === 'text' && prev.kind === 'text';
              const who = byId.get(m.sender_id);
              return (
                <div key={m.id}>
                  {showDay && <p className="py-2 text-center text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{day}</p>}
                  {m.kind === 'announcement' ? (
                    <div className="my-2 rounded-2xl border border-amber-400/30 bg-amber-400/10 px-3.5 py-2.5">
                      <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-amber-300"><Megaphone className="h-3.5 w-3.5" />Announcement · {mine ? 'You' : who?.name ?? 'Admin'} · {clock(m.created_at)}</p>
                      <p className="mt-1 whitespace-pre-wrap break-words text-[13.5px] leading-relaxed"><Body text={m.body} /></p>
                      {m.img && <div className="mt-2"><ChatImage path={m.img} /></div>}
                    </div>
                  ) : (
                    <div className={`flex ${mine ? 'justify-end' : 'justify-start'} ${sameSender ? 'pt-0.5' : 'pt-2'}`}>
                      <div className={`min-w-0 max-w-[80%] rounded-2xl px-3 py-2 ${mine ? 'rounded-br-md bg-white/[0.14]' : 'rounded-bl-md bg-white/[0.06]'}`}>
                        {!mine && conv === ALL && !sameSender && <p className="mb-0.5 truncate text-[11.5px] font-bold text-muted-foreground">{who?.name ?? 'Someone'}</p>}
                        {m.body && m.body !== '(picture)' && <p className="whitespace-pre-wrap break-words text-[13.5px] leading-relaxed"><Body text={m.body} /></p>}
                        {m.img && <div className={m.body && m.body !== '(picture)' ? 'mt-1.5' : ''}><ChatImage path={m.img} /></div>}
                        <p className="mt-0.5 text-right text-[10px] text-muted-foreground">{clock(m.created_at)}</p>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
            <div ref={endRef} />
          </div>

          <footer className="border-t border-white/[0.07] p-3">
            {err && <p className="mb-2 text-xs text-red-400">{err}</p>}
            {file && (
              <div className="mb-2 inline-flex max-w-full items-center gap-2 rounded-lg bg-white/[0.07] px-2.5 py-1 text-xs">
                <ImagePlus className="h-3.5 w-3.5 shrink-0" /><span className="truncate">{file.name}</span>
                <button type="button" aria-label="Remove picture" onClick={() => { setFile(null); if (fileRef.current) fileRef.current.value = ''; }}><X className="h-3.5 w-3.5" /></button>
              </div>
            )}
            <div className="relative">
              {suggestions.length > 0 && (
                <div className="absolute bottom-full left-0 z-10 mb-2 w-56 overflow-hidden rounded-xl border border-white/10 bg-popover shadow-xl">
                  {suggestions.map((p) => (
                    <button key={p.id} type="button" onClick={() => setText(text.replace(/@(\w*)$/, `@${p.name.split(/\s+/)[0]} `))} className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[13px] hover:bg-white/10">
                      <AvatarFace avatar={p.avatar} size={22} />{p.name}
                    </button>
                  ))}
                </div>
              )}
              <div className="flex items-end gap-2">
                <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/gif,image/webp" className="hidden" onChange={(e) => pick(e.target.files?.[0] ?? null)} />
                <button type="button" aria-label="Attach a picture" onClick={() => fileRef.current?.click()} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/[0.06] hover:bg-white/[0.12]"><ImagePlus className="h-4 w-4" /></button>
                <textarea value={text} maxLength={MAX_BODY} rows={1} onChange={(e) => setText(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(); } }}
                  placeholder={other ? `Message ${other.name.split(' ')[0]}` : 'Message everyone'}
                  className="max-h-28 min-h-9 min-w-0 flex-1 resize-none rounded-xl bg-white/[0.06] px-3 py-2 text-[13.5px] outline-none ring-1 ring-white/[0.07] placeholder:text-muted-foreground focus:ring-primary/60" />
                <button type="button" aria-label="Send" disabled={busy || (!text.trim() && !file)} onClick={() => void send()} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/90 text-slate-900 transition hover:bg-white disabled:opacity-40"><Send className="h-4 w-4" /></button>
              </div>
              {isAdmin && conv === ALL && (
                <label className="mt-2 flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
                  <input type="checkbox" checked={announce} onChange={(e) => setAnnounce(e.target.checked)} className="accent-amber-400" />
                  <Megaphone className="h-3.5 w-3.5" />Send as an announcement (everyone is notified)
                </label>
              )}
            </div>
          </footer>
        </section>
      </DialogContent>
    </Dialog>
  );
}
