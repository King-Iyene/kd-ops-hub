import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { AvatarFace } from './AvatarFace';
import type { Person } from './data';

export interface RoomOverride { uid?: string; label?: string; free?: boolean }

/** Who sits in this private office (their name and face go on the plate), or a custom name; meeting rooms can be renamed. */
export function RoomNameDialog({ zone, directory, current, onClose, onSave }: {
  zone: { id: string; name: string; kind: string } | null;
  directory: Person[];
  current: RoomOverride | undefined;
  onClose: () => void;
  onSave: (o: RoomOverride | null) => void;
}) {
  const [uid, setUid] = useState('');
  const [label, setLabel] = useState('');
  const [q, setQ] = useState('');
  useEffect(() => {
    setUid(current?.uid ?? '');
    setLabel(current?.label ?? '');
    setQ('');
  }, [zone?.id, current]);
  const isOffice = zone?.kind === 'office';
  const owner = current?.uid ? directory.find((p) => p.id === current.uid) : undefined;
  const status = current?.free ? 'Free office (nobody assigned)' : owner ? `Assigned to ${owner.name}` : current?.label ? `Custom name: ${current.label}` : 'Free office (nobody has claimed it)';
  const people = directory.filter((p) => p.name.toLowerCase().includes(q.trim().toLowerCase())).slice(0, 60);
  return (
    <Dialog open={!!zone} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent onInteractOutside={(e) => e.preventDefault()} className="ko max-h-[90vh] max-w-md overflow-y-auto">
        <DialogHeader><DialogTitle>{isOffice ? 'Who sits in this office?' : 'Rename this room'}</DialogTitle></DialogHeader>
        {isOffice && <p className="rounded-lg bg-muted/60 px-3 py-1.5 text-xs">Now: <strong>{status}</strong></p>}
        {isOffice && (
          <div className="space-y-2">
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search the team…" aria-label="Search the team" className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm" />
            <div className="max-h-56 space-y-0.5 overflow-y-auto rounded-lg border border-border p-1">
              {people.map((p) => (
                <button key={p.id} type="button" onClick={() => { setUid(p.id); setLabel(''); }} className={`flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-sm hover:bg-muted ${uid === p.id ? 'bg-primary/10 font-medium' : ''}`}>
                  <AvatarFace avatar={p.avatar} size={26} /><span className="truncate">{p.name}</span>
                </button>
              ))}
              {people.length === 0 && <p className="p-2 text-xs text-muted-foreground">Nobody matches.</p>}
            </div>
          </div>
        )}
        <div>
          <p className="mb-1 text-xs font-medium text-muted-foreground">{isOffice ? 'Or a custom name on the plate (for example CEO or Finance)' : 'Name'}</p>
          <input value={label} onChange={(e) => { setLabel(e.target.value.slice(0, 28)); if (isOffice) setUid(''); }} placeholder={zone?.name} aria-label="Name" className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm" />
        </div>
        <DialogFooter className="gap-2 sm:justify-between">
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onSave(null)}>Back to automatic</Button>
            {isOffice && <Button variant="outline" onClick={() => onSave({ free: true })}>Unassign (free office)</Button>}
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose}>Cancel</Button>
            <Button onClick={() => onSave(uid ? { uid } : label.trim() ? { label: label.trim() } : null)}>{uid ? 'Assign' : 'Save'}</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
