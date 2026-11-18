import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { AvatarFace } from './AvatarFace';
import type { Person } from './data';

export interface OfficeSettings { builders?: string[]; recorders?: string[]; maxItems?: number; boards?: Record<string, { title: string; cards: { h: string; t: string }[] }>; clock?: string[] }

function PeopleList({ title, hint, ids, directory, onChange }: { title: string; hint: string; ids: string[]; directory: Person[]; onChange: (ids: string[]) => void }) {
  const [q, setQ] = useState('');
  const chosen = ids.map((id) => directory.find((p) => p.id === id)).filter(Boolean) as Person[];
  const matches = q.trim() ? directory.filter((p) => !ids.includes(p.id) && p.name.toLowerCase().includes(q.trim().toLowerCase())).slice(0, 6) : [];
  return (
    <section className="space-y-2">
      <div>
        <p className="text-sm font-medium">{title}</p>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {chosen.map((p) => (
          <span key={p.id} className="inline-flex items-center gap-1.5 rounded-full bg-muted py-0.5 pl-1 pr-2 text-xs">
            <AvatarFace avatar={p.avatar} size={20} />{p.name}
            <button type="button" aria-label={`Remove ${p.name}`} className="text-muted-foreground hover:text-destructive" onClick={() => onChange(ids.filter((x) => x !== p.id))}><X className="h-3 w-3" /></button>
          </span>
        ))}
        {chosen.length === 0 && <span className="text-xs text-muted-foreground">Only admins.</span>}
      </div>
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Add someone…" aria-label={`Add to ${title}`} className="h-8 w-full rounded-md border border-input bg-background px-2 text-sm" />
      {matches.length > 0 && (
        <div className="rounded-lg border border-border p-1">
          {matches.map((p) => (
            <button key={p.id} type="button" onClick={() => { onChange([...ids, p.id]); setQ(''); }} className="flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-sm hover:bg-muted"><AvatarFace avatar={p.avatar} size={22} />{p.name}</button>
          ))}
        </div>
      )}
    </section>
  );
}

/** Who can edit the office, who can record, and how much furniture a builder may add. Admins only. */
export function OfficeSettingsDialog({ open, onClose, settings, directory, saving, onSave }: {
  open: boolean;
  onClose: () => void;
  settings: OfficeSettings;
  directory: Person[];
  saving: boolean;
  onSave: (s: OfficeSettings) => void;
}) {
  const [draft, setDraft] = useState<OfficeSettings>(settings);
  useEffect(() => { if (open) setDraft(settings); }, [open, settings]);
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent onInteractOutside={(e) => e.preventDefault()} className="ko max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader><DialogTitle>Office settings</DialogTitle></DialogHeader>
        <PeopleList title="Builders" hint="Can edit the office (furniture, colours, name plates). Admins always can." ids={draft.builders ?? []} directory={directory} onChange={(builders) => setDraft({ ...draft, builders })} />
        <PeopleList title="Recorders" hint="Can record meetings (everyone in the room is told). Admins always can." ids={draft.recorders ?? []} directory={directory} onChange={(recorders) => setDraft({ ...draft, recorders })} />
        <section className="space-y-1">
          <p className="text-sm font-medium">Furniture limit for builders</p>
          <p className="text-xs text-muted-foreground">The most objects a builder can save in the office (admins have no limit). Empty means no limit.</p>
          <input type="number" min={50} max={2000} value={draft.maxItems ?? ''} onChange={(e) => setDraft({ ...draft, maxItems: e.target.value ? Math.max(50, Math.min(2000, Number(e.target.value))) : undefined })} aria-label="Furniture limit" className="h-8 w-32 rounded-md border border-input bg-background px-2 text-sm" />
        </section>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={() => onSave(draft)} disabled={saving}>{saving ? 'Saving…' : 'Save settings'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
