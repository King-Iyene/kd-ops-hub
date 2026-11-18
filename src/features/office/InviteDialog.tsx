import { useMemo, useState } from 'react';
import { Copy, Search, UserMinus, UserPlus } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { useInvitable, useInvites, useOfficeMutations } from './data';

/** Admins add other employees to the office (everyone in the two admin pay groups is already in), and copy a link to a spot. */
export function InviteDialog({ open, onClose, link, canInvite, meId }: { open: boolean; onClose: () => void; link: string; canInvite: boolean; meId: string }) {
  const { toast } = useToast();
  const actions = useOfficeMutations();
  const { data: invitable } = useInvitable(open && canInvite);
  const { data: invited } = useInvites(open);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  const shown = useMemo(() => (invitable ?? []).filter((p) => p.name.toLowerCase().includes(q.trim().toLowerCase())), [invitable, q]);

  const run = async (id: string, fn: () => Promise<void>, ok: string) => {
    setBusy(id);
    try {
      await fn();
      toast({ title: ok });
    } catch {
      toast({ title: 'That did not go through', description: 'Only admins can change who is in the office.', variant: 'destructive' });
    } finally {
      setBusy(null);
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      toast({ title: 'Link copied', description: 'It opens the office right here for anyone who is in. Not in yet? Invite them below.' });
    } catch {
      toast({ title: 'Copy this link', description: link });
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent onInteractOutside={(e) => e.preventDefault()} className="ko max-w-md">
        <DialogHeader>
          <DialogTitle>Invite someone in</DialogTitle>
          <DialogDescription>
            KDS admin and directors are already in. Add anyone else below, or share a link to this spot.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2 rounded-lg border bg-muted/40 p-2">
          <input readOnly value={link} className="min-w-0 flex-1 bg-transparent text-xs text-muted-foreground outline-none" onFocus={(e) => e.currentTarget.select()} />
          <Button size="sm" variant="secondary" onClick={() => void copy()}><Copy className="mr-1.5 h-3.5 w-3.5" />Copy link</Button>
        </div>

        {canInvite ? (
          <>
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find an employee" className="h-9 w-full rounded-md border bg-background pl-8 pr-2 text-sm outline-none focus:ring-2 focus:ring-primary/40" />
            </div>
            <div className="max-h-56 space-y-0.5 overflow-y-auto">
              {shown.length === 0 && <p className="px-1 py-2 text-xs text-muted-foreground">Everyone you can invite is already in. Nice.</p>}
              {shown.map((p) => (
                <div key={p.id} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-muted">
                  <span className="min-w-0 flex-1 truncate">{p.name}</span>
                  <Button size="sm" variant="outline" disabled={busy === p.id} onClick={() => void run(p.id, () => actions.invite(p.id, meId), `${p.name} is in. Say hi when they arrive.`)}>
                    <UserPlus className="mr-1.5 h-3.5 w-3.5" />Invite
                  </Button>
                </div>
              ))}
            </div>
            {(invited ?? []).length > 0 && (
              <div>
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Invited ({(invited ?? []).length})</p>
                <div className="max-h-32 space-y-0.5 overflow-y-auto">
                  {(invited ?? []).map((p) => (
                    <div key={p.id} className="flex items-center gap-2 rounded-lg px-2 py-1 text-sm">
                      <span className="min-w-0 flex-1 truncate">{p.name}</span>
                      <Button size="sm" variant="ghost" disabled={busy === p.id} onClick={() => void run(p.id, () => actions.uninvite(p.id), `${p.name} removed`)}>
                        <UserMinus className="mr-1.5 h-3.5 w-3.5" />Remove
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        ) : (
          <p className="text-xs text-muted-foreground">Only admins can invite people.</p>
        )}
        <p className="text-xs text-muted-foreground">Guests without a KD Ops account cannot join yet.</p>
      </DialogContent>
    </Dialog>
  );
}
