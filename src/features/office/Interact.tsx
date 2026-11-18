import { useEffect, useState } from 'react';
import { Plus, Trash2, X } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { MAX_ZONES, ZONE_PRESETS, zoneAbbr, zoneParts } from './world/clock';

/** What an admin writes on a board: a heading and a few cards. */
export interface BoardData { title: string; cards: { h: string; t: string }[] }

const ACCENTS = ['#f59e0b', '#10b981', '#3b82f6', '#ec4899', '#8b5cf6', '#ef4444'];

/** The core values wall and the notice board: everyone reads it, admins edit it. */
export function BoardDialog({ open, kind, data, canEdit, saving, onClose, onSave }: {
  open: boolean;
  kind: 'valueswall' | 'noticeboard';
  data: BoardData;
  canEdit: boolean;
  saving: boolean;
  onClose: () => void;
  onSave: (d: BoardData) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<BoardData>(data);
  useEffect(() => { if (open) { setDraft(data); setEditing(false); } }, [open, data]);
  const isValues = kind === 'valueswall';
  const empty = data.cards.length === 0;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl">{editing ? 'Edit board' : data.title}</DialogTitle>
          <DialogDescription>{isValues ? 'What we stand for, and how we work.' : 'What the team should know right now.'}</DialogDescription>
        </DialogHeader>

        {!editing && (
          <>
            {empty ? (
              <div className="rounded-xl border border-dashed p-8 text-center">
                <p className="font-medium">{isValues ? 'The values wall is waiting for its first value.' : 'No notices yet.'}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {canEdit ? 'Press Edit to write the first one.' : 'An admin will post here soon.'}
                </p>
              </div>
            ) : (
              <div className={isValues ? 'grid gap-3 sm:grid-cols-2' : 'space-y-3'}>
                {data.cards.map((c, i) => (
                  <div key={i} className="rounded-xl border bg-card p-4 shadow-sm" style={{ borderTop: `4px solid ${ACCENTS[i % ACCENTS.length]}` }}>
                    <p className="font-semibold">{c.h}</p>
                    {c.t && <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{c.t}</p>}
                  </div>
                ))}
              </div>
            )}
            <DialogFooter>
              <Button variant="ghost" onClick={onClose}>Close</Button>
              {canEdit && <Button onClick={() => setEditing(true)}>Edit</Button>}
            </DialogFooter>
          </>
        )}

        {editing && (
          <>
            <label className="block text-sm font-medium">
              Heading
              <input value={draft.title} maxLength={40} onChange={(e) => setDraft({ ...draft, title: e.target.value })} className="mt-1 h-9 w-full rounded-md border bg-background px-2 text-sm outline-none focus:ring-2 focus:ring-primary/40" />
            </label>
            <div className="space-y-2">
              {draft.cards.map((c, i) => (
                <div key={i} className="rounded-lg border p-2.5">
                  <div className="flex items-center gap-2">
                    <input value={c.h} maxLength={60} placeholder={isValues ? 'Value, for example Integrity' : 'Notice heading'} onChange={(e) => setDraft({ ...draft, cards: draft.cards.map((x, j) => (j === i ? { ...x, h: e.target.value } : x)) })} className="h-8 min-w-0 flex-1 rounded-md border bg-background px-2 text-sm outline-none focus:ring-2 focus:ring-primary/40" />
                    <button type="button" aria-label="Remove" className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-red-500" onClick={() => setDraft({ ...draft, cards: draft.cards.filter((_, j) => j !== i) })}><Trash2 className="h-4 w-4" /></button>
                  </div>
                  <textarea value={c.t} maxLength={400} rows={2} placeholder={isValues ? 'What it means for us' : 'The details'} onChange={(e) => setDraft({ ...draft, cards: draft.cards.map((x, j) => (j === i ? { ...x, t: e.target.value } : x)) })} className="mt-2 w-full rounded-md border bg-background px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-primary/40" />
                </div>
              ))}
              {draft.cards.length < 12 && (
                <Button variant="outline" size="sm" onClick={() => setDraft({ ...draft, cards: [...draft.cards, { h: '', t: '' }] })}><Plus className="mr-1.5 h-4 w-4" />Add a card</Button>
              )}
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => { setDraft(data); setEditing(false); }}>Cancel</Button>
              <Button disabled={saving} onClick={() => onSave({ title: draft.title.trim() || data.title, cards: draft.cards.filter((c) => c.h.trim() || c.t.trim()) })}>{saving ? 'Saving…' : 'Save board'}</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** The wall clock: big live times for up to three places. Admins choose which. */
export function ClockDialog({ open, zones, canEdit, saving, onClose, onSave }: {
  open: boolean;
  zones: string[];
  canEdit: boolean;
  saving: boolean;
  onClose: () => void;
  onSave: (z: string[]) => void;
}) {
  const [now, setNow] = useState(() => Date.now());
  const [draft, setDraft] = useState<string[]>(zones);
  useEffect(() => { if (open) setDraft(zones); }, [open, zones]);
  useEffect(() => {
    if (!open) return;
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [open]);

  const toggle = (id: string) => setDraft((d) => (d.includes(id) ? (d.length > 1 ? d.filter((x) => x !== id) : d) : d.length < MAX_ZONES ? [...d, id] : d));
  const changed = draft.join() !== zones.join();

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Time around the world</DialogTitle>
          <DialogDescription>Where the team and our partners are right now.</DialogDescription>
        </DialogHeader>
        <div className={`grid gap-3 ${zones.length === 1 ? '' : zones.length === 2 ? 'grid-cols-2' : 'grid-cols-3'}`}>
          {zones.map((z) => {
            const { h, m, s } = zoneParts(z, now);
            const city = ZONE_PRESETS.find((p) => p.id === z)?.city ?? z;
            return (
              <div key={z} className="rounded-xl border bg-card p-4 text-center shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{city} · {zoneAbbr(z, now)}</p>
                <p className="mt-1 font-mono text-3xl font-semibold tabular-nums">{String(h).padStart(2, '0')}:{String(m).padStart(2, '0')}<span className="text-lg text-muted-foreground">:{String(s).padStart(2, '0')}</span></p>
              </div>
            );
          })}
        </div>
        {canEdit && (
          <div>
            <p className="mb-1.5 text-sm font-medium">Show up to {MAX_ZONES} places on the wall clock</p>
            <div className="flex flex-wrap gap-1.5">
              {ZONE_PRESETS.map((p) => {
                const on = draft.includes(p.id);
                return (
                  <button key={p.id} type="button" onClick={() => toggle(p.id)} aria-pressed={on} className={`flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs ${on ? 'border-primary bg-primary/10 font-medium text-primary' : 'hover:bg-muted'}`}>
                    {p.city}{on && <X className="h-3 w-3" />}
                  </button>
                );
              })}
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Close</Button>
          {canEdit && <Button disabled={!changed || saving} onClick={() => onSave(draft)}>{saving ? 'Saving…' : 'Save clock'}</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
