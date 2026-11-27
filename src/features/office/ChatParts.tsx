import { Loader2, Smile, Trash2 } from 'lucide-react';
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
