import { useMemo, useState } from 'react';
import { Building2, Footprints, Hammer, Pencil, Search, Settings, Trash2, UserMinus, UserPlus, Users, Video } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

export interface Claimable { id: string; name: string; kind: 'office' | 'seat'; owner: string | null }

/**
 * One place to run the space: who has which office and seat, who is in the office, the tools, and the space itself.
 * Admins see everything; builders see the tools.
 */
export function ManageDialog({ open, onClose, spaceName, isAdmin, isSuper, canEdit, canDelete, rows, onAssign, onUnclaim, onRename, onWalk, onInvite, onSettings, onEdit, onRecordings, onRenameSpace, onDeleteSpace, onNewSpace }: {
  open: boolean;
  onClose: () => void;
  spaceName: string;
  isAdmin: boolean;
  isSuper: boolean;
  canEdit: boolean;
  canDelete: boolean;
  rows: Claimable[];
  onAssign: (id: string) => void;
  onUnclaim: (id: string) => void;
  onRename: (id: string) => void;
  onWalk: (id: string) => void;
  onInvite: () => void;
  onSettings: () => void;
  onEdit: () => void;
  onRecordings: () => void;
  onRenameSpace: () => void;
  onDeleteSpace: () => void;
  onNewSpace: () => void;
}) {
  const [tab, setTab] = useState<'places' | 'people' | 'tools' | 'space'>('places');
  const [q, setQ] = useState('');
  const [only, setOnly] = useState<'all' | 'free' | 'taken'>('all');
  const shown = useMemo(() => rows.filter((r) => {
    if (only === 'free' && r.owner) return false;
    if (only === 'taken' && !r.owner) return false;
    const n = q.trim().toLowerCase();
    return !n || r.name.toLowerCase().includes(n) || (r.owner ?? '').toLowerCase().includes(n);
  }), [rows, q, only]);
  const taken = rows.filter((r) => r.owner).length;

  const tabs: { id: typeof tab; label: string; icon: JSX.Element }[] = [
    { id: 'places', label: 'Offices and seats', icon: <Building2 className="h-4 w-4" /> },
    { id: 'people', label: 'People', icon: <Users className="h-4 w-4" /> },
    { id: 'tools', label: 'Tools', icon: <Hammer className="h-4 w-4" /> },
    { id: 'space', label: 'This space', icon: <Settings className="h-4 w-4" /> },
  ];
  const go = (fn: () => void) => () => { onClose(); fn(); };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-h-[88vh] max-w-2xl overflow-hidden p-0">
        <DialogHeader className="px-5 pt-5">
          <DialogTitle>Manage {spaceName}</DialogTitle>
          <DialogDescription>Offices, seats, people and tools, all in one place.</DialogDescription>
        </DialogHeader>
        <div className="flex gap-1 border-b px-4">
          {tabs.map((t) => (
            <button key={t.id} type="button" onClick={() => setTab(t.id)} className={`flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm ${tab === t.id ? 'border-primary font-medium' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>{t.icon}{t.label}</button>
          ))}
        </div>

        <div className="max-h-[60vh] overflow-y-auto px-5 pb-5">
          {tab === 'places' && (
            <div className="space-y-3 pt-3">
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative min-w-40 flex-1">
                  <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find an office, seat or person" className="h-9 w-full rounded-md border bg-background pl-8 pr-2 text-sm outline-none focus:ring-2 focus:ring-primary/40" />
                </div>
                {(['all', 'free', 'taken'] as const).map((f) => (
                  <button key={f} type="button" onClick={() => setOnly(f)} className={`rounded-full border px-3 py-1 text-xs ${only === f ? 'border-primary bg-primary/10 font-medium text-primary' : 'hover:bg-muted'}`}>{f === 'all' ? `All ${rows.length}` : f === 'free' ? `Free ${rows.length - taken}` : `Taken ${taken}`}</button>
                ))}
              </div>
              <div className="divide-y rounded-lg border">
                {shown.length === 0 && <p className="p-4 text-center text-sm text-muted-foreground">Nothing matches.</p>}
                {shown.map((r) => (
                  <div key={r.id} className="flex items-center gap-2 px-3 py-2 text-sm">
                    <span className={`h-2 w-2 shrink-0 rounded-full ${r.owner ? 'bg-primary' : 'bg-muted-foreground/40'}`} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{r.name}</span>
                      <span className="block truncate text-xs text-muted-foreground">{r.kind === 'seat' ? 'Seat' : 'Private office'} · {r.owner ? `Claimed by ${r.owner}` : 'Free'}</span>
                    </span>
                    <Button size="sm" variant="ghost" title="Walk there" onClick={go(() => onWalk(r.id))}><Footprints className="h-4 w-4" /></Button>
                    {isAdmin && <Button size="sm" variant="outline" onClick={go(() => onAssign(r.id))}><UserPlus className="mr-1.5 h-3.5 w-3.5" />{r.owner ? 'Change' : 'Assign'}</Button>}
                    {isAdmin && r.owner && <Button size="sm" variant="ghost" title="Unclaim" onClick={() => onUnclaim(r.id)}><UserMinus className="h-4 w-4" /></Button>}
                    {isAdmin && <Button size="sm" variant="ghost" title="Rename" onClick={go(() => onRename(r.id))}><Pencil className="h-4 w-4" /></Button>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {tab === 'people' && (
            <div className="space-y-3 pt-3">
              <p className="text-sm text-muted-foreground">KDS administration and directors are in the office. Everyone else comes by invite.</p>
              <div className="flex flex-wrap gap-2">
                {isAdmin && <Button onClick={go(onInvite)}><UserPlus className="mr-1.5 h-4 w-4" />Invite people</Button>}
                {isAdmin && <Button variant="outline" onClick={go(onSettings)}><Settings className="mr-1.5 h-4 w-4" />Who can build and record</Button>}
              </div>
            </div>
          )}

          {tab === 'tools' && (
            <div className="grid gap-2 pt-3 sm:grid-cols-2">
              {canEdit && <Button variant="outline" className="h-auto justify-start gap-2 p-3 text-left" onClick={go(onEdit)}><Hammer className="h-4 w-4 shrink-0" /><span><span className="block font-medium">Edit the space</span><span className="block text-xs font-normal text-muted-foreground">Objects, walls, floors, name plates</span></span></Button>}
              <Button variant="outline" className="h-auto justify-start gap-2 p-3 text-left" onClick={go(onRecordings)}><Video className="h-4 w-4 shrink-0" /><span><span className="block font-medium">Recordings</span><span className="block text-xs font-normal text-muted-foreground">Listen to and download meetings</span></span></Button>
              {isAdmin && <Button variant="outline" className="h-auto justify-start gap-2 p-3 text-left" onClick={go(onSettings)}><Settings className="h-4 w-4 shrink-0" /><span><span className="block font-medium">Permissions and limits</span><span className="block text-xs font-normal text-muted-foreground">Builders, recorders, how much furniture</span></span></Button>}
              <p className="col-span-full text-xs text-muted-foreground">Walk up to the core values wall, notice board or wall clock and press F to edit what they say.</p>
            </div>
          )}

          {tab === 'space' && (
            <div className="space-y-2 pt-3">
              {isSuper && <Button variant="outline" className="w-full justify-start" onClick={go(onRenameSpace)}><Pencil className="mr-2 h-4 w-4" />Rename this space</Button>}
              {isAdmin && <Button variant="outline" className="w-full justify-start" onClick={go(onNewSpace)}><Building2 className="mr-2 h-4 w-4" />Create another space</Button>}
              {isSuper && canDelete && <Button variant="outline" className="w-full justify-start text-red-500 hover:text-red-500" onClick={go(onDeleteSpace)}><Trash2 className="mr-2 h-4 w-4" />Delete this space</Button>}
              {!isAdmin && <p className="text-sm text-muted-foreground">Only admins can change the space itself.</p>}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
