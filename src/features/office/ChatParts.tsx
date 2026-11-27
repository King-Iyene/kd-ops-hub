import { useEffect, useRef, useState } from 'react';
import { Loader2, Search, Smile, Trash2 } from 'lucide-react';
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { supabase } from '@/lib/supabase';
import type { ReactionGroup } from './chat';

/** Pieces of the chat that are worth keeping apart: reactions under a message, the hover bar, the delete question and the GIF picker. */

/** The emoji under a message: one chip per emoji with a count, lit when it is mine; click to add or take back yours. */
export function ReactionChips({ groups, nameOf, onToggle, mine }: { groups: ReactionGroup[]; nameOf: (id: string) => string; onToggle: (emoji: string) => void; mine: boolean }) {
  if (!groups.length) return null;
  return (
    <div className={`mt-1 flex flex-wrap gap-1 ${mine ? 'justify-end' : 'justify-start'}`}>
      {groups.map((g) => (
        <button key={g.emoji} type="button" onClick={() => onToggle(g.emoji)} aria-pressed={g.mine} title={`${g.users.map(nameOf).join(', ')} reacted ${g.emoji}`}
          className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[12px] font-semibold ring-1 ring-inset transition hover:scale-105 ${g.mine ? 'bg-[#00ECFF]/20 text-[#bff8ff] ring-[#00ECFF]/50' : 'bg-white/[0.07] text-foreground/90 ring-white/10 hover:bg-white/[0.12]'}`}>
          <span className="text-[14px] leading-none">{g.emoji}</span><span className="font-mono text-[11px] opacity-90">{g.count}</span>
        </button>
      ))}
    </div>
  );
}

/** Shown when you rest the pointer on a message: react with one tap, open every emoji, or delete (when you may). */
export function MessageBar({ quick, onReact, onMore, onDelete, side }: { quick: string[]; onReact: (e: string) => void; onMore: () => void; onDelete?: () => void; side: 'left' | 'right' }) {
  return (
    <div className={`absolute -top-4 z-10 hidden items-center gap-0.5 rounded-full bg-popover/95 px-1 py-0.5 shadow-lg ring-1 ring-[#00ECFF]/25 backdrop-blur group-hover/msg:flex group-focus-within/msg:flex ${side === 'right' ? 'right-2' : 'left-2'}`}>
      {quick.map((e) => (
        <button key={e} type="button" onClick={() => onReact(e)} title={`React ${e}`} aria-label={`React ${e}`} className="flex h-7 w-7 items-center justify-center rounded-full text-[16px] transition-transform hover:scale-125 hover:bg-white/10">{e}</button>
      ))}
      <button type="button" onClick={onMore} title="More reactions" aria-label="More reactions" className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground hover:bg-white/10 hover:text-foreground"><Smile className="h-4 w-4" /></button>
      {onDelete && (
        <>
          <span className="mx-0.5 h-4 w-px bg-white/15" />
          <button type="button" onClick={onDelete} title="Delete message" aria-label="Delete message" className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground hover:bg-red-500/20 hover:text-red-300"><Trash2 className="h-3.5 w-3.5" /></button>
        </>
      )}
    </div>
  );
}

/** "Delete this message?" with the message shown, said plainly, so one slip of the pointer cannot remove it. */
export function ConfirmDelete({ open, preview, authorName, mine, onCancel, onConfirm, busy }: { open: boolean; preview: string; authorName: string; mine: boolean; onCancel: () => void; onConfirm: () => void; busy?: boolean }) {
  return (
    <AlertDialog open={open} onOpenChange={(o) => { if (!o) onCancel(); }}>
      <AlertDialogContent className="ko max-w-sm rounded-2xl">
        <AlertDialogHeader>
          <AlertDialogTitle>Delete this message?</AlertDialogTitle>
          <AlertDialogDescription>
            {mine ? 'It disappears for everyone in the conversation.' : `This is ${authorName}'s message. As an admin you can remove it; it disappears for everyone.`} This cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <p className="line-clamp-3 break-words rounded-xl bg-white/[0.06] px-3 py-2 text-[13px] text-muted-foreground ring-1 ring-inset ring-white/10">{preview}</p>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onCancel}>Keep it</AlertDialogCancel>
          <button type="button" disabled={busy} onClick={onConfirm} className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-red-600 px-4 text-sm font-semibold text-white transition hover:bg-red-500 disabled:opacity-60">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}Delete for everyone
          </button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

interface Gif { id: string; title: string; preview: string; url: string; w: number; h: number }

/** GIF search (through our own function, so the key stays on the server). Pick one and it is sent. */
export function GifPicker({ onPick, onClose }: { onPick: (url: string) => void; onClose: () => void }) {
  const [q, setQ] = useState('');
  const [gifs, setGifs] = useState<Gif[] | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'off' | 'error'>('loading');
  const seq = useRef(0);
  useEffect(() => {
    const mine = ++seq.current;
    setState('loading');
    const t = window.setTimeout(() => {
      void supabase.functions.invoke('office-gifs', { body: { q } }).then(({ data, error }) => {
        if (mine !== seq.current) return;
        const d = data as { configured?: boolean; gifs?: Gif[] } | null;
        if (error || !d) { setState('error'); return; }
        if (d.configured === false) { setState('off'); return; }
        setGifs(d.gifs ?? []);
        setState('ready');
      });
    }, q ? 350 : 0);
    return () => window.clearTimeout(t);
  }, [q]);
  return (
    <div className="ko pointer-events-auto w-[22rem] max-w-[92vw] overflow-hidden rounded-2xl border border-[#00ECFF]/20 bg-popover/95 shadow-[0_24px_60px_-18px_rgba(0,0,0,0.7)] backdrop-blur" role="dialog" aria-label="Choose a GIF">
      <div className="flex items-center gap-2 border-b border-white/[0.07] p-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search GIFs, for example thanks or party" aria-label="Search GIFs" className="h-9 w-full rounded-xl bg-white/[0.06] pl-8 pr-2 text-[13px] outline-none ring-1 ring-white/[0.07] placeholder:text-muted-foreground focus:ring-primary/60" />
        </div>
        <button type="button" onClick={onClose} className="rounded-lg px-2 py-1 text-xs text-muted-foreground hover:bg-white/10 hover:text-foreground">Close</button>
      </div>
      <div className="h-64 overflow-y-auto p-2">
        {state === 'loading' && !gifs && <p className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Loading GIFs…</p>}
        {state === 'off' && <p className="flex h-full items-center justify-center px-4 text-center text-sm text-muted-foreground">GIFs are not set up yet. An admin adds a GIPHY key once and they appear for everyone.</p>}
        {state === 'error' && <p className="flex h-full items-center justify-center px-4 text-center text-sm text-muted-foreground">Could not load GIFs. Check your connection and try again.</p>}
        {state === 'ready' && gifs && gifs.length === 0 && <p className="flex h-full items-center justify-center text-sm text-muted-foreground">No GIFs found for that.</p>}
        {(state === 'ready' || (state === 'loading' && gifs)) && gifs && gifs.length > 0 && (
          <div className="columns-2 gap-2">
            {gifs.map((g) => (
              <button key={g.id} type="button" onClick={() => { onPick(g.url); onClose(); }} title={g.title || 'GIF'} className="mb-2 block w-full overflow-hidden rounded-lg ring-1 ring-white/10 transition hover:ring-[#00ECFF]/60">
                <img src={g.preview} alt={g.title || 'GIF'} loading="lazy" className="w-full" />
              </button>
            ))}
          </div>
        )}
      </div>
      <p className="border-t border-white/[0.07] px-3 py-1.5 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Powered by GIPHY</p>
    </div>
  );
}

/** A GIF in a message. */
export function GifImage({ url }: { url: string }) {
  return (
    <a href={url} target="_blank" rel="noreferrer noopener" className="relative block w-fit">
      <img src={url} alt="GIF" loading="lazy" className="max-h-56 max-w-full rounded-xl object-cover" />
      <span className="absolute bottom-1.5 left-1.5 rounded bg-black/60 px-1.5 text-[9px] font-extrabold tracking-wider text-white">GIF</span>
    </a>
  );
}
