import { useMemo, useState } from 'react';
import { Download, Play, Search, Trash2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { errorMessage } from '@/lib/db-errors';
import { useDeleteConfirm } from '@/features/task-module/DeleteConfirm';
import { signedRecordingUrl, useOfficeMutations, useRecordings, type RecordingRow } from '../data';

function fmtDuration(s: number): string {
  const m = Math.floor(s / 60);
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m ${s % 60}s`;
}
const fmtWhen = (iso: string) => new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const fmtSize = (b: number) => (b > 1e6 ? `${(b / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1e3))} KB`);

interface Session { id: string; room: string; by: string; at: string; participants: string[]; parts: RecordingRow[] }

/** Saved meeting recordings. Only admins can record and listen. */
export function RecordingsDialog({ open, onOpenChange, meId, isAdmin }: { open: boolean; onOpenChange: (o: boolean) => void; meId: string; isAdmin: boolean }) {
  const { toast } = useToast();
  const { data: rows, isLoading } = useRecordings(open);
  const actions = useOfficeMutations();
  const [links, setLinks] = useState<Record<string, string>>({});
  const [query, setQuery] = useState('');
  const { ask, dialog } = useDeleteConfirm();

  const sessions = useMemo<Session[]>(() => {
    const m = new Map<string, Session>();
    for (const r of rows ?? []) {
      const s = m.get(r.session_id) ?? { id: r.session_id, room: r.room_name, by: r.recorder_name || 'Someone', at: r.started_at, participants: [], parts: [] };
      s.parts.push(r);
      if (r.started_at < s.at) s.at = r.started_at;
      for (const p of r.participants) if (!s.participants.includes(p)) s.participants.push(p);
      m.set(r.session_id, s);
    }
    return [...m.values()].sort((a, b) => b.at.localeCompare(a.at));
  }, [rows]);
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? sessions.filter((s) => `${s.room} ${s.by} ${s.participants.join(' ')} ${fmtWhen(s.at)}`.toLowerCase().includes(q)) : sessions;
  }, [sessions, query]);

  const listen = async (r: RecordingRow) => {
    try { setLinks((l) => ({ ...l, [r.id]: '' })); const url = await signedRecordingUrl(r.path); setLinks((l) => ({ ...l, [r.id]: url })); }
    catch (e) { toast({ title: 'Could not open the recording', description: errorMessage(e), variant: 'destructive' }); }
  };
  const download = async (r: RecordingRow, room: string) => {
    try {
      const ext = r.path.split('.').pop() || 'webm';
      const name = `${room.replace(/\W+/g, '-')}-${new Date(r.started_at).toISOString().slice(0, 16).replace(/[:T]/g, '-')}-part-${r.part}.${ext}`;
      const url = await signedRecordingUrl(r.path, name);
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      a.click();
    } catch (e) { toast({ title: 'Could not download', description: errorMessage(e), variant: 'destructive' }); }
  };
  const remove = (r: RecordingRow, room: string, parts: number) => {
    ask({
      what: 'recording part',
      name: `${room}, ${fmtWhen(r.started_at)}, part ${r.part}`,
      consequence: `The ${fmtDuration(r.duration_s)} recording (${fmtSize(r.size_bytes)}) is deleted for everyone and cannot be played or downloaded again.${parts > 1 ? ' The other parts of this meeting are not touched.' : ''}`,
      onConfirm: () => { void actions.deleteRecording(r).catch((e: unknown) => toast({ title: 'Could not delete', description: errorMessage(e), variant: 'destructive' })); },
    });
  };

  const iconBtn = 'inline-flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground';
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* a fixed height with its own scroll area: twenty recordings scroll inside the window instead of running off the screen */}
      <DialogContent onInteractOutside={(e) => e.preventDefault()} className="ko flex max-h-[80vh] flex-col gap-3 p-4 md:max-w-xl" data-testid="recordings">
        <DialogHeader className="space-y-0">
          <DialogTitle className="text-base">Meeting recordings{sessions.length > 0 && <span className="ml-2 text-xs font-normal text-muted-foreground">{sessions.length}</span>}</DialogTitle>
        </DialogHeader>

        {sessions.length > 4 && (
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by room, person or date" aria-label="Search recordings" className="h-8 pl-8 text-xs" />
          </div>
        )}

        <section className="-mr-1 min-h-0 flex-1 space-y-1.5 overflow-y-auto pr-1" data-testid="recordings-list">
          {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
          {!isLoading && sessions.length === 0 && <p className="text-sm text-muted-foreground">No recordings yet. Stand in a meeting room, join voice and press Record.</p>}
          {!isLoading && sessions.length > 0 && shown.length === 0 && <p className="text-sm text-muted-foreground">Nothing matches that.</p>}
          {shown.map((s) => (
            <div key={s.id} className="rounded-lg border border-border px-3 py-2" data-testid="recording-session">
              <p className="truncate text-[13px] font-medium" title={`${s.room} · ${fmtWhen(s.at)}`}>{s.room} <span className="font-normal text-muted-foreground">· {fmtWhen(s.at)}</span></p>
              <p className="truncate text-[11px] text-muted-foreground" title={s.participants.join(', ')}>By {s.by}{s.participants.length ? ` · with ${s.participants.join(', ')}` : ''}</p>
              <div className="mt-1 divide-y divide-border/60">
                {s.parts.map((r) => (
                  <div key={r.id} className="py-1">
                    <div className="flex items-center gap-1.5 text-[11px]">
                      <span className="min-w-0 flex-1 truncate text-muted-foreground">Part {r.part} · {fmtDuration(r.duration_s)} · {fmtSize(r.size_bytes)}</span>
                      {!links[r.id] && <button type="button" className={iconBtn} title="Listen" aria-label={`Listen to part ${r.part}`} onClick={() => void listen(r)}><Play className="h-3.5 w-3.5" /></button>}
                      <button type="button" className={iconBtn} title="Download" aria-label={`Download part ${r.part}`} onClick={() => void download(r, s.room)}><Download className="h-3.5 w-3.5" /></button>
                      {(isAdmin || r.recorded_by === meId) && (
                        <button type="button" onClick={() => remove(r, s.room, s.parts.length)} title="Delete this part" aria-label="Delete this part" className={`${iconBtn} hover:text-destructive`}><Trash2 className="h-3.5 w-3.5" /></button>
                      )}
                    </div>
                    {links[r.id] && (r.path.includes('-v.') ? <video controls src={links[r.id]} className="mt-1 max-h-56 w-full rounded-lg bg-black" /> : <audio controls src={links[r.id]} className="mt-1 h-8 w-full" />)}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </section>
        {dialog}
      </DialogContent>
    </Dialog>
  );
}
