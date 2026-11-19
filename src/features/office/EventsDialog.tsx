import { useState } from 'react';
import { MapPin, Plus, Trash2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { isLive, upcoming, whenText, type EventRow } from './useOfficeLife';

const pad = (n: number) => String(n).padStart(2, '0');
/** A value for a datetime-local input, rounded up to the next quarter hour. */
function soon(): string {
  const d = new Date(Date.now() + 15 * 60000);
  d.setMinutes(Math.ceil(d.getMinutes() / 15) * 15, 0, 0);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** The office calendar: office hours, all-hands, workshops. Anyone can add one, pick a room, and walk straight there. */
export function EventsDialog({ open, onClose, events, rooms, me, isAdmin, onCreate, onDelete, onWalk }: {
  open: boolean;
  onClose: () => void;
  events: EventRow[];
  rooms: { id: string; name: string }[];
  me: string;
  isAdmin: boolean;
  onCreate: (title: string, details: string, startsAt: Date, minutes: number, zone: string | null) => Promise<string | null>;
  onDelete: (id: string) => void;
  onWalk: (zoneId: string) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState('');
  const [details, setDetails] = useState('');
  const [when, setWhen] = useState(soon);
  const [minutes, setMinutes] = useState(30);
  const [zone, setZone] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const list = upcoming(events);
  const submit = async () => {
    const at = new Date(when);
    if (title.trim().length < 3) { setErr('Give it a title.'); return; }
    if (Number.isNaN(at.getTime())) { setErr('Pick a date and time.'); return; }
    setBusy(true);
    const e = await onCreate(title, details, at, minutes, zone || null);
    setBusy(false);
    if (e) { setErr(e); return; }
    setTitle(''); setDetails(''); setZone(''); setErr(null); setAdding(false); setWhen(soon());
  };
  const roomName = (id: string | null) => rooms.find((r) => r.id === id)?.name;
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent onInteractOutside={(e) => e.preventDefault()} className="ko max-h-[88vh] max-w-xl overflow-y-auto">
        <DialogHeader><DialogTitle>📅 Events and office hours</DialogTitle></DialogHeader>
        {adding ? (
          <div className="space-y-2">
            <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} placeholder="What is it? (for example Friday all-hands)" aria-label="Event title" className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm" />
            <div className="grid gap-2 sm:grid-cols-2">
              <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} aria-label="Starts" className="h-9 rounded-md border border-input bg-background px-3 text-sm" />
              <select value={minutes} onChange={(e) => setMinutes(Number(e.target.value))} aria-label="How long" className="h-9 rounded-md border border-input bg-background px-2 text-sm">
                {[15, 30, 45, 60, 90, 120, 180].map((m) => <option key={m} value={m}>{m >= 60 ? `${m / 60} hour${m > 60 ? 's' : ''}` : `${m} minutes`}</option>)}
              </select>
            </div>
            <select value={zone} onChange={(e) => setZone(e.target.value)} aria-label="Where" className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm">
              <option value="">Anywhere in the office</option>
              {rooms.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
            <textarea value={details} onChange={(e) => setDetails(e.target.value)} maxLength={300} rows={2} placeholder="Anything people should know (optional)" aria-label="Details" className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
            {err && <p className="text-xs text-destructive">{err}</p>}
            <div className="flex justify-end gap-2"><Button variant="ghost" onClick={() => { setAdding(false); setErr(null); }}>Cancel</Button><Button onClick={() => void submit()} disabled={busy}>{busy ? 'Adding…' : 'Add event'}</Button></div>
          </div>
        ) : (
          <>
            <Button onClick={() => setAdding(true)}><Plus className="mr-1 h-4 w-4" />Add an event</Button>
            {list.length === 0 && <p className="text-sm text-muted-foreground">Nothing planned yet. Add office hours, a stand-up or a workshop so people know where to be.</p>}
            <div className="space-y-2">
              {list.map((e) => (
                <div key={e.id} className={`rounded-2xl border p-3 ${isLive(e) ? 'border-emerald-500 bg-emerald-500/10' : 'border-border bg-card'}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold">{e.title} {isLive(e) && <span className="ml-1 rounded-full bg-emerald-500 px-2 py-0.5 text-[10px] font-bold text-white">LIVE NOW</span>}</p>
                      <p className="text-xs text-muted-foreground">{whenText(e.starts_at)} · until {new Date(e.ends_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}{roomName(e.zone) ? ` · ${roomName(e.zone)}` : ''}</p>
                      {e.details && <p className="mt-1 break-words text-sm">{e.details}</p>}
                    </div>
                    <div className="flex shrink-0 gap-1">
                      {e.zone && roomName(e.zone) && <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => { onWalk(e.zone!); onClose(); }}><MapPin className="mr-1 h-3.5 w-3.5" />Go there</Button>}
                      {(e.created_by === me || isAdmin) && <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => onDelete(e.id)} aria-label="Delete event"><Trash2 className="h-3.5 w-3.5" /></Button>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
