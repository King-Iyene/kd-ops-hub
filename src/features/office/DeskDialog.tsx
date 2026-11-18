import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { AvatarFace } from './AvatarFace';
import type { Person } from './data';

/** A private office: who has it, and what you can do (claim it, unclaim yours, walk there; admins assign or revoke). */
export function DeskDialog({ zone, owner, mine, iHaveOffice, isAdmin, busy, onClaim, onUnclaim, onWalk, onAssign, onCustomise, onClose }: {
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
  return (
    <Dialog open={!!zone} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>{owner ? `${owner.name}'s office` : 'Free office'}</DialogTitle></DialogHeader>
        <div className="flex items-center gap-3 rounded-lg bg-muted/50 p-3">
          {owner ? <AvatarFace avatar={owner.avatar} size={44} /> : <span className="flex h-11 w-11 items-center justify-center rounded-full bg-muted text-lg">🪑</span>}
          <div className="min-w-0 text-sm">
            <p className="truncate font-medium">{owner ? owner.name : 'Nobody has claimed this office'}</p>
            <p className="text-xs text-muted-foreground">{mine ? 'This is your office.' : owner ? 'Claimed.' : 'Claim it to put your name and face on the door.'}</p>
          </div>
        </div>
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
