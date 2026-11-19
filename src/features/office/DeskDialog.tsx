import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { AvatarFace } from './AvatarFace';
import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import type { Person } from './data';
import type { NoteRow } from './useOfficeLife';

const GIFTS = ['🍫', '☕', '🍪', '🌸', '🎁', '⭐', '🍀', '🎈'];

/** A private office: who has it, and what you can do (claim it, unclaim yours, walk there; admins assign or revoke). */
export function DeskDialog({ zone, owner, mine, iHaveOffice, isAdmin, busy, notes, authorName, meId, onLeaveNote, onDeleteNote, onClaim, onUnclaim, onWalk, onAssign, onCustomise, onClose }: {
  /** notes left on this office that you are allowed to see (yours, or ones you wrote) */
  notes: NoteRow[];
  authorName: (id: string | null) => string;
  meId: string;
  onLeaveNote: (body: string, gift: string | null) => Promise<string | null>;
  onDeleteNote: (id: string) => void;
  zone: { id: string; name: string } | null;
  owner: Person | null;
  mine: boolean;
  iHaveOffice: boolean;
  isAdmin: boolean;
  busy: boolean;
  onClaim: () => void;
  onUnclaim: () => void;
  onWalk: () => void;
  onAssign: () => void;
  onCustomise: () => void;
  onClose: () => void;
}) {
  const [body, setBody] = useState('');
  const [gift, setGift] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const leave = async () => {
    if (!body.trim()) { setErr('Write a few words first.'); return; }
    const e = await onLeaveNote(body, gift);
    if (e) { setErr(e); return; }
    setBody(''); setGift(null); setErr(null); setSent(true);
  };
  return (
    <Dialog open={!!zone} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent onInteractOutside={(e) => e.preventDefault()} className="ko md:max-w-sm">
        <DialogHeader><DialogTitle>{owner ? `${owner.name}'s office` : 'Free office'}</DialogTitle></DialogHeader>
        <div className="flex items-center gap-3 rounded-lg bg-muted/50 p-3">
          {owner ? <AvatarFace avatar={owner.avatar} size={44} /> : <span className="flex h-11 w-11 items-center justify-center rounded-full bg-muted text-lg">🪑</span>}
          <div className="min-w-0 text-sm">
            <p className="truncate font-medium">{owner ? owner.name : 'Nobody has claimed this office'}</p>
            <p className="text-xs text-muted-foreground">{mine ? 'This is your office.' : owner ? 'Claimed.' : 'Claim it to put your name and face on the door.'}</p>
          </div>
        </div>
        {owner && !mine && (
          <div className="space-y-2 rounded-lg border border-border p-3">
            <p className="text-xs font-semibold">Leave {owner.name.split(' ')[0]} a note{gift ? ' and a gift' : ''}</p>
            <textarea value={body} onChange={(e) => { setBody(e.target.value); setSent(false); }} maxLength={200} rows={2} placeholder="Thanks for your help today!" aria-label="Your note" className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
            <div className="flex flex-wrap items-center gap-1">
              {GIFTS.map((g) => <button key={g} type="button" onClick={() => setGift(gift === g ? null : g)} aria-label={`Gift ${g}`} aria-pressed={gift === g} className={`h-8 w-8 rounded-lg text-lg transition ${gift === g ? 'bg-primary/20 ring-2 ring-primary' : 'hover:bg-muted'}`}>{g}</button>)}
            </div>
            {err && <p className="text-xs text-destructive">{err}</p>}
            {sent && <p className="text-xs text-emerald-600">Left on their desk. Only they can read it.</p>}
            <Button size="sm" onClick={() => void leave()}>Leave it on their desk</Button>
          </div>
        )}
        {notes.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-xs font-semibold">{mine ? 'Notes on your desk' : 'Notes you left here'}</p>
            {notes.map((n) => (
              <div key={n.id} className="flex items-start gap-2 rounded-lg bg-amber-400/15 p-2 text-sm">
                <span className="text-xl leading-none">{n.gift ?? '📝'}</span>
                <div className="min-w-0 flex-1"><p className="break-words">{n.body}</p><p className="text-[11px] text-muted-foreground">{mine ? authorName(n.from_id) : 'You'}</p></div>
                {(mine || n.from_id === meId || isAdmin) && <button type="button" aria-label="Take the note down" className="text-muted-foreground hover:text-destructive" onClick={() => onDeleteNote(n.id)}><Trash2 className="h-3.5 w-3.5" /></button>}
              </div>
            ))}
          </div>
        )}
        <div className="flex flex-col gap-2">
          {!owner && <Button disabled={busy} onClick={onClaim}>{iHaveOffice ? 'Move my office here' : 'Claim this office'}</Button>}
          {mine && <Button disabled={busy} onClick={onCustomise}>Customise my office</Button>}
          {mine && <Button variant="outline" disabled={busy} onClick={onUnclaim}>Unclaim my office</Button>}
          <Button variant="outline" onClick={onWalk}>Walk there</Button>
          {isAdmin && owner && !mine && <Button variant="outline" disabled={busy} onClick={onUnclaim}>Revoke ({owner.name}) and free it</Button>}
          {isAdmin && <Button variant="ghost" onClick={onAssign}>Assign someone, or rename the plate…</Button>}
        </div>
      </DialogContent>
    </Dialog>
  );
}
