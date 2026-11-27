import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Loader2, Maximize2, Smile, Trash2, X, ZoomIn, ZoomOut } from 'lucide-react';
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import type { ReactionGroup } from './chat';

/** Pieces of the chat that are worth keeping apart: reactions under a message, the hover bar and the delete question. */

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
      <button type="button" data-emoji-toggle onClick={onMore} title="More reactions" aria-label="More reactions" className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground hover:bg-white/10 hover:text-foreground"><Smile className="h-4 w-4" /></button>
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

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 8;
/** Keep a zoom level inside what makes sense. */
export const clampZoom = (z: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));

/**
 * A picture opened inside the app: dark backdrop, the picture centred, and it can be zoomed (mouse wheel, + and - keys or the buttons,
 * double click) and dragged around when zoomed in. Esc, the X, or a click on the dark part closes only the picture, not the chat behind it.
 */
export function ImageViewer({ src, onClose }: { src: string; onClose: () => void }) {
  const [z, setZ] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number; px: number; py: number; moved: boolean; onBackdrop: boolean } | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const reset = () => { setZ(1); setPos({ x: 0, y: 0 }); };
  /** zoom towards a point (relative to the middle of the screen) so what is under the pointer stays under it */
  const zoomAt = (next: number, cx = 0, cy = 0) => {
    const n = clampZoom(next);
    setPos((p) => (n <= 1 ? { x: 0, y: 0 } : { x: cx - (cx - p.x) * (n / z), y: cy - (cy - p.y) * (n / z) }));
    setZ(n);
  };
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose(); }
      else if (e.key === '+' || e.key === '=') zoomAt(z * 1.25);
      else if (e.key === '-' || e.key === '_') zoomAt(z / 1.25);
      else if (e.key === '0') reset();
    };
    window.addEventListener('keydown', k, true);
    return () => window.removeEventListener('keydown', k, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [z, onClose]);
  const centre = (e: { clientX: number; clientY: number }) => {
    const r = box.current?.getBoundingClientRect();
    return r ? { x: e.clientX - (r.left + r.width / 2), y: e.clientY - (r.top + r.height / 2) } : { x: 0, y: 0 };
  };
  return createPortal(
    <div data-image-viewer className="pointer-events-auto fixed inset-0 z-[90] flex select-none flex-col bg-black/90 backdrop-blur-sm animate-in fade-in duration-150" role="dialog" aria-label="Picture">
      <div className="flex h-12 shrink-0 items-center justify-end gap-1 px-3">
        <span className="mr-auto font-mono text-[11px] text-white/50">{Math.round(z * 100)}%</span>
        <button type="button" aria-label="Zoom out" title="Zoom out (-)" onClick={() => zoomAt(z / 1.25)} className="flex h-8 w-8 items-center justify-center rounded-lg text-white/80 hover:bg-white/10"><ZoomOut className="h-4 w-4" /></button>
        <button type="button" aria-label="Zoom in" title="Zoom in (+)" onClick={() => zoomAt(z * 1.25)} className="flex h-8 w-8 items-center justify-center rounded-lg text-white/80 hover:bg-white/10"><ZoomIn className="h-4 w-4" /></button>
        <button type="button" aria-label="Fit to screen" title="Fit to screen (0)" onClick={reset} className="flex h-8 w-8 items-center justify-center rounded-lg text-white/80 hover:bg-white/10"><Maximize2 className="h-4 w-4" /></button>
        <button type="button" aria-label="Close picture" title="Close (Esc)" onClick={onClose} className="ml-1 flex h-8 w-8 items-center justify-center rounded-lg text-white/80 hover:bg-white/10"><X className="h-4 w-4" /></button>
      </div>
      <div
        ref={box}
        className={`relative min-h-0 flex-1 overflow-hidden ${z > 1 ? (drag.current ? 'cursor-grabbing' : 'cursor-grab') : 'cursor-zoom-in'}`}
        onWheel={(e) => { const c = centre(e); zoomAt(z * Math.exp(-e.deltaY * 0.0015), c.x, c.y); }}
        onPointerDown={(e) => { drag.current = { x: e.clientX, y: e.clientY, px: pos.x, py: pos.y, moved: false, onBackdrop: (e.target as HTMLElement).dataset.backdrop !== undefined }; (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId); }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d) return;
          if (Math.abs(e.clientX - d.x) + Math.abs(e.clientY - d.y) > 4) d.moved = true;
          if (z > 1 && d.moved) setPos({ x: d.px + e.clientX - d.x, y: d.py + e.clientY - d.y });
        }}
        onPointerUp={() => {
          const d = drag.current;
          drag.current = null;
          // a plain click on the dark part (not on the picture) closes it
          if (d && !d.moved && d.onBackdrop) onClose();
        }}
        onDoubleClick={(e) => { if (z > 1) reset(); else { const c = centre(e); zoomAt(2.5, c.x, c.y); } }}
      >
        <div data-backdrop className="absolute inset-0 flex items-center justify-center p-4 pb-6">
          <img src={src} alt="Shared picture" draggable={false} className="max-h-full max-w-full rounded-lg object-contain shadow-2xl" style={{ transform: `translate(${pos.x}px, ${pos.y}px) scale(${z})`, transition: drag.current ? 'none' : 'transform 80ms ease-out' }} />
        </div>
      </div>
    </div>,
    document.body,
  );
}
