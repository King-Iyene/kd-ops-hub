import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Download, File as FileIcon, FileArchive, FileAudio, FileSpreadsheet, FileText, FileVideo, Megaphone, Paperclip, Presentation, Search, Send, Users, X } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { supabase } from '@/lib/supabase';
import { AvatarFace } from './AvatarFace';
import { ALL, MAX_ATTACHMENTS, MAX_BODY, checkAttachment, convOf, fileKind, formatBytes, isPicture, type ChatMsg } from './chat';
import { splitLinks } from './social';
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

const FILE_ICON = { pdf: FileText, doc: FileText, sheet: FileSpreadsheet, slides: Presentation, zip: FileArchive, audio: FileAudio, video: FileVideo, text: FileIcon } as const;
const FILE_TINT = { pdf: '#ef6a5b', doc: '#4CC9F0', sheet: '#8EE3C8', slides: '#F0A35E', zip: '#D6AC50', audio: '#b79cff', video: '#b79cff', text: '#9fc9d8' } as const;

/** A file in a message: icon, name, size and a download button (the private link is made when it is clicked). */
function ChatFile({ m }: { m: ChatMsg }) {
  const [busy, setBusy] = useState(false);
  const kind = fileKind(m.file_type ?? '', m.file_name ?? '');
  const Icon = FILE_ICON[kind];
  const open = async () => {
    if (!m.file_path || busy) return;
    setBusy(true);
    const r = await supabase.storage.from('office-files').createSignedUrl(m.file_path, 300, { download: m.file_name ?? true });
    setBusy(false);
    if (r.data?.signedUrl) window.open(r.data.signedUrl, '_blank', 'noopener');
  };
  return (
    <button type="button" onClick={() => void open()} title="Download" className="group flex w-64 max-w-full items-center gap-3 rounded-xl border border-white/10 bg-black/20 p-2.5 text-left transition hover:border-[#00ECFF]/40 hover:bg-black/30">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg" style={{ background: `${FILE_TINT[kind]}22`, color: FILE_TINT[kind] }}><Icon className="h-5 w-5" /></span>
      <span className="min-w-0 flex-1"><span className="block truncate text-[13px] font-semibold">{m.file_name ?? 'File'}</span><span className="block text-[11px] opacity-70">{formatBytes(m.file_size ?? 0)}{kind !== 'text' ? ` · ${kind.toUpperCase()}` : ''}</span></span>
      <Download className={`h-4 w-4 shrink-0 opacity-60 transition group-hover:opacity-100 ${busy ? 'animate-pulse' : ''}`} />
    </button>
  );
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
  const [files, setFiles] = useState<File[]>([]);
  const [drag, setDrag] = useState(false);
  const [sel, setSel] = useState(0);
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

  useEffect(() => { if (open) { setErr(null); setFiles([]); setText(''); setAnnounce(false); } }, [open, conv]);
  // a preview address for each picture waiting to be sent, released when it goes
  const previews = useMemo(() => files.map((f) => (isPicture(f.type) ? URL.createObjectURL(f) : null)), [files]);
  useEffect(() => () => { previews.forEach((u) => { if (u) URL.revokeObjectURL(u); }); }, [previews]);
  useEffect(() => { if (open) endRef.current?.scrollIntoView({ block: 'end' }); }, [open, thread.length, conv]);
  useEffect(() => { if (open && thread.length) onRead(conv); }, [open, conv, thread.length, onRead]);

  const other = conv === ALL ? null : byId.get(conv) ?? null;
  const mention = /(^|\s)@(\w*)$/.exec(text);
  const suggestions: { id: string; name: string; avatar: AvatarStyle | null; token: string }[] = mention && conv === ALL
    ? [
      ...(isAdmin && 'everyone'.startsWith(mention[2].toLowerCase()) ? [{ id: '*', name: 'Everyone in the office', avatar: null, token: 'everyone' }] : []),
      ...people.filter((p) => p.id !== meId && (p.name.toLowerCase().split(/\s+/)[0].startsWith(mention[2].toLowerCase()) || p.name.toLowerCase().startsWith(mention[2].toLowerCase()))).slice(0, 6).map((p) => ({ id: p.id, name: p.name, avatar: p.avatar, token: p.name.split(/\s+/)[0] })),
    ]
    : [];
  const insertMention = (token: string) => { setText(text.replace(/@(\w*)$/, `@${token} `)); setSel(0); };

  const addFiles = (list: File[]) => {
    setErr(null);
    const next = [...files];
    for (const raw of list) {
      // a pasted screenshot has no useful name
      const f = raw.name && raw.name !== 'image.png' ? raw : new File([raw], `Pasted image ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }).replace(/[^\d]+/g, '-')}.${(raw.type.split('/')[1] || 'png').replace('jpeg', 'jpg')}`, { type: raw.type });
      const bad = checkAttachment(f);
      if (bad) { setErr(bad); continue; }
      if (next.length >= MAX_ATTACHMENTS) { setErr(`You can attach up to ${MAX_ATTACHMENTS} files at a time.`); break; }
      next.push(f);
    }
    setFiles(next);
  };
  const send = async () => {
    if (busy || (!text.trim() && files.length === 0)) return;
    setBusy(true);
    setErr(null);
    let ok = true;
    if (files.length === 0) ok = await onSend({ text, file: null, to: conv === ALL ? null : conv, announce: announce && conv === ALL });
    // the words travel with the first file; each further file is its own message
    else for (let i = 0; i < files.length && ok; i++) ok = await onSend({ text: i === 0 ? text : '', file: files[i], to: conv === ALL ? null : conv, announce: announce && conv === ALL && i === 0 });
    setBusy(false);
    if (ok) { setText(''); setFiles([]); setAnnounce(false); } else setErr('That did not send. Check your connection and try again.');
  };

  const row = (id: string, name: string, avatar: AvatarStyle | null, online: boolean) => {
    const m = last.get(id);
    const u = unread[id] ?? 0;
    return (
      <button key={id} type="button" onClick={() => { onConv(id); setListOpen(false); }}
        className={`relative flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition ${conv === id ? 'bg-[#00ECFF]/[0.10] ring-1 ring-inset ring-[#00ECFF]/20' : 'hover:bg-white/[0.06]'}`}>
        {avatar ? <span className="relative shrink-0"><AvatarFace avatar={avatar} size={30} dim={!online} />{online && <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-popover bg-emerald-500" />}</span>
          : <span className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full bg-primary/20 text-primary"><Users className="h-4 w-4" /></span>}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-semibold">{name}</span>
          <span className="block truncate text-[11.5px] text-muted-foreground">{m ? (m.sender_id === meId ? 'You: ' : '') + (m.body || 'Picture') : online ? 'Online' : 'Offline'}</span>
        </span>
        {u > 0 && <span className="shrink-0 rounded-full bg-[#D6AC50] px-1.5 py-0.5 text-[10px] font-extrabold text-[#2a1c00]">{u > 99 ? '99+' : u}</span>}
      </button>
    );
  };

  let lastDay = '';
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent onInteractOutside={(e) => e.preventDefault()} className="ko flex h-[min(82vh,44rem)] w-[calc(100vw-1.5rem)] md:max-w-4xl gap-0 overflow-hidden rounded-3xl p-0">
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
            <p className="px-2.5 pb-1 pt-3 text-[10px] font-bold uppercase tracking-[0.14em] text-[#D6AC50]">Direct messages</p>
            {list.map((p) => row(p.id, p.name, p.avatar, p.online))}
            {list.length === 0 && <p className="px-2.5 py-3 text-xs text-muted-foreground">No one matches.</p>}
          </div>
        </aside>

        {/* the conversation */}
        <section onDragOver={(e) => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); setDrag(true); } }} onDragLeave={(e) => { if (e.currentTarget === e.target) setDrag(false); }} onDrop={(e) => { e.preventDefault(); setDrag(false); if (e.dataTransfer.files.length) addFiles([...e.dataTransfer.files]); }} className={`${listOpen ? 'hidden' : 'flex'} relative min-w-0 flex-1 flex-col sm:flex`}>
          {drag && <div className="pointer-events-none absolute inset-2 z-20 flex items-center justify-center rounded-2xl border-2 border-dashed border-[#00ECFF]/70 bg-[#031a26]/90 text-center"><div><Paperclip className="mx-auto mb-2 h-7 w-7 text-[#00ECFF]" /><p className="font-bold">Drop to attach</p><p className="text-xs text-muted-foreground">Pictures, PDFs, documents, sheets, zips, audio, video (up to 25 MB)</p></div></div>}
          <header className="flex items-center gap-3 border-b border-[#00ECFF]/10 bg-gradient-to-r from-[#00ECFF]/[0.07] to-transparent px-4 py-3">
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
                  {showDay && <p className="py-2.5 text-center"><span className="rounded-full bg-[#D6AC50]/15 px-2.5 py-0.5 text-[10.5px] font-bold uppercase tracking-wider text-[#E6C275]">{day}</span></p>}
                  {m.kind === 'announcement' ? (
                    <div className="my-2 rounded-2xl border border-[#D6AC50]/35 bg-gradient-to-br from-[#D6AC50]/15 to-[#D6AC50]/[0.04] px-3.5 py-2.5">
                      <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-[#E6C275]"><Megaphone className="h-3.5 w-3.5" />Announcement · {mine ? 'You' : who?.name ?? 'Admin'} · {clock(m.created_at)}</p>
                      <p className="mt-1 whitespace-pre-wrap break-words text-[13.5px] leading-relaxed"><Body text={m.body} /></p>
                      {m.img && <div className="mt-2"><ChatImage path={m.img} /></div>}
                    </div>
                  ) : (
                    <div className={`flex ${mine ? 'justify-end' : 'justify-start'} ${sameSender ? 'pt-0.5' : 'pt-2'}`}>
                      <div className={`min-w-0 max-w-[80%] rounded-2xl px-3 py-2 ${!mine && m.mentions.includes(meId) ? 'ring-1 ring-[#D6AC50]/60 ' : ''}${mine ? 'rounded-br-md bg-gradient-to-br from-[#0a86b4] to-[#006994] text-white shadow-[0_8px_20px_-10px_rgba(0,160,220,.8)]' : 'rounded-bl-md border border-white/[0.06] bg-white/[0.06]'}`}>
                        {!mine && conv === ALL && !sameSender && <p className="mb-0.5 truncate text-[11.5px] font-bold text-muted-foreground">{who?.name ?? 'Someone'}</p>}
                        {m.body && m.body !== '(picture)' && m.body !== '(file)' && <p className="whitespace-pre-wrap break-words text-[13.5px] leading-relaxed"><Body text={m.body} /></p>}
                        {m.img && <div className={m.body && m.body !== '(picture)' ? 'mt-1.5' : ''}><ChatImage path={m.img} /></div>}
                        {m.file_path && <div className={m.body && m.body !== '(file)' ? 'mt-1.5' : ''}><ChatFile m={m} /></div>}
                        <p className="mt-0.5 text-right text-[10px] text-muted-foreground">{clock(m.created_at)}</p>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
            <div ref={endRef} />
          </div>

          <footer className="border-t border-[#00ECFF]/10 p-3">
            {err && <p className="mb-2 text-xs text-red-400">{err}</p>}
            {files.length > 0 && (
              <div className="mb-2 flex flex-wrap gap-2">
                {files.map((f, i) => (
                  <div key={i} className="group relative flex max-w-[15rem] items-center gap-2 rounded-xl border border-white/10 bg-white/[0.06] p-1.5 pr-7 text-xs">
                    {previews[i] ? <img src={previews[i] ?? ''} alt="" className="h-10 w-10 rounded-lg object-cover" /> : <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#00ECFF]/10 text-[#9ff6ff]"><Paperclip className="h-4 w-4" /></span>}
                    <span className="min-w-0"><span className="block truncate font-semibold">{f.name}</span><span className="opacity-60">{formatBytes(f.size)}</span></span>
                    <button type="button" aria-label={`Remove ${f.name}`} onClick={() => setFiles(files.filter((_, j) => j !== i))} className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/40 opacity-70 hover:opacity-100"><X className="h-3 w-3" /></button>
                  </div>
                ))}
              </div>
            )}
            <div className="relative">
              {suggestions.length > 0 && (
                <div role="listbox" aria-label="People to tag" className="absolute bottom-full left-0 z-10 mb-2 w-64 overflow-hidden rounded-xl border border-[#00ECFF]/20 bg-popover shadow-xl">
                  {suggestions.map((p, i) => (
                    <button key={p.id} type="button" role="option" aria-selected={i === sel % suggestions.length} onMouseDown={(e) => e.preventDefault()} onClick={() => insertMention(p.token)} className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-[13px] ${i === sel % suggestions.length ? 'bg-[#00ECFF]/15' : 'hover:bg-white/10'}`}>
                      {p.avatar ? <AvatarFace avatar={p.avatar} size={22} /> : <span className="flex h-[22px] w-[22px] items-center justify-center rounded-full bg-[#D6AC50] text-[#2a1c00]"><Megaphone className="h-3 w-3" /></span>}{p.name}
                    </button>
                  ))}
                </div>
              )}
              <div className="flex items-end gap-2">
                <input ref={fileRef} type="file" multiple className="hidden" onChange={(e) => { addFiles([...(e.target.files ?? [])]); e.target.value = ''; }} />
                <button type="button" aria-label="Attach files" title="Attach files. You can also paste a picture or drag files here." onClick={() => fileRef.current?.click()} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/[0.06] hover:bg-white/[0.12]"><Paperclip className="h-4 w-4" /></button>
                <textarea value={text} maxLength={MAX_BODY} rows={1} onChange={(e) => { setText(e.target.value); setSel(0); }}
                  onPaste={(e) => { const fs = [...e.clipboardData.files]; if (fs.length) { e.preventDefault(); addFiles(fs); } }}
                  onKeyDown={(e) => {
                    if (suggestions.length > 0) {
                      if (e.key === 'ArrowDown') { e.preventDefault(); setSel((x) => x + 1); return; }
                      if (e.key === 'ArrowUp') { e.preventDefault(); setSel((x) => x + suggestions.length - 1); return; }
                      if (e.key === 'Tab' || e.key === 'Enter') { e.preventDefault(); insertMention(suggestions[sel % suggestions.length].token); return; }
                    }
                    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(); }
                  }}
                  placeholder={other ? `Message ${other.name.split(' ')[0]}` : 'Message everyone'}
                  className="max-h-28 min-h-9 min-w-0 flex-1 resize-none rounded-xl bg-white/[0.06] px-3 py-2 text-[13.5px] outline-none ring-1 ring-white/[0.07] placeholder:text-muted-foreground focus:ring-primary/60" />
                <button type="button" aria-label="Send" disabled={busy || (!text.trim() && files.length === 0)} onClick={() => void send()} className="kd-gold flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition hover:brightness-110 disabled:opacity-40"><Send className="h-4 w-4" /></button>
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
