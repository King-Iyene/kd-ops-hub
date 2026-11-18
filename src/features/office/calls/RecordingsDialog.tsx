import { useMemo, useState } from 'react';
import { Download, Trash2, UserMinus, UserPlus } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { errorMessage } from '@/lib/db-errors';
import { signedRecordingUrl, useOfficeMutations, useRecorders, useRecordings, type RecordingRow } from '../data';

function fmtDuration(s: number): string {
  const m = Math.floor(s / 60);
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m ${s % 60}s`;
}
const fmtSize = (b: number) => (b > 1e6 ? `${(b / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1e3))} KB`);

interface Session { id: string; room: string; by: string; at: string; participants: string[]; parts: RecordingRow[] }

/** Saved meeting recordings (yours, or everyone's for admins), and, for admins, who is allowed to record. */
export function RecordingsDialog({ open, onOpenChange, meId, isAdmin }: { open: boolean; onOpenChange: (o: boolean) => void; meId: string; isAdmin: boolean }) {
  const { toast } = useToast();
  const { data: rows, isLoading } = useRecordings(open);
  const { data: rec } = useRecorders(open && isAdmin);
  const actions = useOfficeMutations();
  const [links, setLinks] = useState<Record<string, string>>({});
  const [pick, setPick] = useState('');

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

  const listen = async (r: RecordingRow) => {
    try { setLinks((l) => ({ ...l, [r.id]: '' })); const url = await signedRecordingUrl(r.path); setLinks((l) => ({ ...l, [r.id]: url })); }
    catch (e) { toast({ title: 'Could not open the recording', description: errorMessage(e), variant: 'destructive' }); }
  };
  const remove = async (r: RecordingRow) => {
    if (!window.confirm('Delete this recording part permanently? This cannot be undone.')) return;
    try { await actions.deleteRecording(r); } catch (e) { toast({ title: 'Could not delete', description: errorMessage(e), variant: 'destructive' }); }
  };
  const setRecorder = async (id: string, on: boolean) => {
    try { await actions.setRecorder(id, meId, on); } catch (e) { toast({ title: 'Could not change', description: errorMessage(e), variant: 'destructive' }); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader><DialogTitle>Meeting recordings</DialogTitle></DialogHeader>

        {isAdmin && (
          <section className="rounded-lg border border-border p-3">
            <p className="mb-2 text-sm font-medium">Who can record</p>
            <div className="mb-2 flex flex-wrap gap-1.5">
              {(rec?.recorders ?? []).map((p) => (
                <span key={p.user_id} className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-xs">
                  {p.full_name}
                  <button type="button" onClick={() => void setRecorder(p.user_id, false)} aria-label={`Remove ${p.full_name}`} className="text-muted-foreground hover:text-destructive"><UserMinus className="h-3 w-3" /></button>
                </span>
              ))}
              {rec && rec.recorders.length === 0 && <span className="text-xs text-muted-foreground">Nobody yet.</span>}
            </div>
            <div className="flex gap-2">
              <select value={pick} onChange={(e) => setPick(e.target.value)} className="h-8 min-w-0 flex-1 rounded-md border border-input bg-background px-2 text-sm">
                <option value="">Add a person…</option>
                {(rec?.people ?? []).filter((p) => !rec?.recorders.some((r) => r.user_id === p.user_id)).map((p) => <option key={p.user_id} value={p.user_id}>{p.full_name}</option>)}
              </select>
              <Button size="sm" disabled={!pick} onClick={() => { void setRecorder(pick, true); setPick(''); }}><UserPlus className="mr-1 h-4 w-4" />Add</Button>
            </div>
          </section>
        )}

        <section className="space-y-3">
          {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
          {!isLoading && sessions.length === 0 && <p className="text-sm text-muted-foreground">No recordings yet. Stand in a meeting room, join voice and press Record.</p>}
          {sessions.map((s) => (
            <div key={s.id} className="rounded-lg border border-border p-3">
              <p className="text-sm font-medium">{s.room} · {new Date(s.at).toLocaleString()}</p>
              <p className="text-xs text-muted-foreground">Recorded by {s.by}{s.participants.length ? ` · with ${s.participants.join(', ')}` : ''}</p>
              <div className="mt-2 space-y-2">
                {s.parts.map((r) => (
                  <div key={r.id} className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="w-28 shrink-0 text-muted-foreground">Part {r.part} · {fmtDuration(r.duration_s)} · {fmtSize(r.size_bytes)}</span>
                    {links[r.id] ? (
                      <>
                        <audio controls src={links[r.id]} className="h-8 min-w-0 flex-1" />
                        <a href={links[r.id]} download className="text-primary" aria-label="Download"><Download className="h-4 w-4" /></a>
                      </>
                    ) : (
                      <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => void listen(r)}>Listen</Button>
                    )}
                    {(isAdmin || r.recorded_by === meId) && (
                      <button type="button" onClick={() => void remove(r)} aria-label="Delete this part" className="ml-auto text-muted-foreground hover:text-destructive"><Trash2 className="h-4 w-4" /></button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </section>
      </DialogContent>
    </Dialog>
  );
}
