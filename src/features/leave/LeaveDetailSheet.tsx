// Everything about one leave: the facts, what you can do with it, and its history.
import { useState } from 'react';
import { AlertTriangle, Ban, Check, CheckCircle2, Clock, History, Pencil, RotateCcw, StickyNote, Trash2, X, XCircle } from 'lucide-react';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { formatDateTime } from '@/lib/format';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/store/authStore';
import { useAllLeave, useLeaveEvents } from './leaveApi';
import { daysLabel, eventSentence, isoDate, overlaps, rangeLabel, relativeStart } from './leaveMath';
import { LeaveStatusPill, PersonAvatar, ReasonDialog, TypeChip } from './leaveUi';
import { useLookups } from './useLookups';
import { RequestDialog } from './RequestDialog';
import { useLeaveActions } from './useLeaveActions';
import type { LeaveRow } from './types';

const REJECT_IDEAS = ['The team is short-staffed then', 'Please pick other dates', 'Not enough leave left'];
const CANCEL_IDEAS = ['Plans changed', 'Entered by mistake', 'Needed at work'];

export function LeaveDetailSheet({ row, admin, onClose }: { row: LeaveRow | null; admin: boolean; onClose: () => void }) {
  const me = useAuthStore((s) => s.profile);
  const actions = useLeaveActions();
  const lookups = useLookups();
  const { data: events, isLoading } = useLeaveEvents(row?.id ?? null);
  const { data: all } = useAllLeave(admin);
  const [dialog, setDialog] = useState<null | 'reject' | 'cancel' | 'revert' | 'edit'>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const today = isoDate(new Date());

  const run = async (fn: () => Promise<unknown>) => { setBusy(true); try { await fn(); } finally { setBusy(false); } };
  const close = () => { setDialog(null); setNote(''); onClose(); };

  if (!row) return <Sheet open={false} onOpenChange={() => undefined}><SheetContent /></Sheet>;

  const mine = row.employee_id === me?.id;
  const person = lookups.person(row.employee_id);
  const name = lookups.nameOf(row.employee_id);
  const clashes = admin
    ? (all ?? []).filter((r) => r.id !== row.id && r.employee_id !== row.employee_id && (r.status === 'approved' || r.status === 'pending') && overlaps(r, row))
    : [];
  const decisionNote = row.status === 'rejected' ? row.rejection_reason ?? row.review_note : row.status === 'cancelled' ? row.cancel_reason : row.review_note;
  const canEmployeeCancel = mine && (row.status === 'pending' || (row.status === 'approved' && row.start_date > today));

  return (
    <>
      <Sheet open onOpenChange={(o) => { if (!o) close(); }}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-md">
          <SheetHeader className="pr-8 text-left">
            <div className="flex items-center gap-3">
              <PersonAvatar name={name} photo={person?.photo_url} className="h-11 w-11" />
              <div className="min-w-0">
                <SheetTitle className="truncate">{name}</SheetTitle>
                <SheetDescription className="truncate">{person?.job_title ?? 'Leave details'}</SheetDescription>
              </div>
            </div>
          </SheetHeader>

          <div className="mt-5 space-y-5">
            <div className="rounded-xl border p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <TypeChip name={lookups.typeName(row.leave_type)} color={lookups.typeColor(row.leave_type)} className="text-sm" />
                <LeaveStatusPill status={row.status} />
              </div>
              <p className="mt-3 text-lg font-semibold leading-snug">{rangeLabel(row.start_date, row.end_date)}</p>
              <p className="text-sm text-muted-foreground">
                {daysLabel(Number(row.days_requested))}{row.is_half_day ? ' (half day)' : ''}
                {row.status === 'approved' ? ` · ${relativeStart(row.start_date, row.end_date, today)}` : ''}
              </p>
              {row.reason && <p className="mt-3 rounded-lg bg-muted/60 px-3 py-2 text-sm"><span className="text-muted-foreground">Reason: </span>{row.reason}</p>}
              {decisionNote && <p className="mt-2 rounded-lg bg-muted/60 px-3 py-2 text-sm"><span className="text-muted-foreground">{row.status === 'rejected' ? 'Why it was not approved: ' : row.status === 'cancelled' ? 'Why it was cancelled: ' : 'Note: '}</span>{decisionNote}</p>}
              {row.source === 'admin' && <p className="mt-2 text-xs text-muted-foreground">Added by {lookups.nameOf(row.created_by)} for {name}.</p>}
            </div>

            {clashes.length > 0 && (
              <div className="rounded-xl border border-amber-500/40 bg-amber-500/5 p-3 text-sm">
                <p className="flex items-center gap-2 font-medium text-amber-800 dark:text-amber-200"><AlertTriangle className="h-4 w-4" />{clashes.length === 1 ? '1 other person is' : `${clashes.length} other people are`} away at the same time</p>
                <ul className="mt-1.5 space-y-0.5 text-muted-foreground">
                  {clashes.slice(0, 6).map((c) => <li key={c.id}>{lookups.nameOf(c.employee_id)} · {rangeLabel(c.start_date, c.end_date)}{c.status === 'pending' ? ' (waiting)' : ''}</li>)}
                </ul>
              </div>
            )}

            {/* What you can do, depending on the status */}
            {admin && (
              <div className="flex flex-wrap gap-2">
                {row.status === 'pending' && (
                  <>
                    <Button disabled={busy} onClick={() => run(async () => { if (await actions.approveAsking(row)) close(); })}><Check className="mr-1.5 h-4 w-4" />Approve</Button>
                    <Button variant="outline" disabled={busy} onClick={() => setDialog('reject')}><X className="mr-1.5 h-4 w-4" />Not approve</Button>
                  </>
                )}
                {(row.status === 'pending' || row.status === 'approved') && (
                  <Button variant="outline" disabled={busy} onClick={() => setDialog('edit')}><Pencil className="mr-1.5 h-4 w-4" />Change dates or type</Button>
                )}
                {row.status === 'approved' && (
                  <Button variant="outline" disabled={busy} onClick={() => setDialog('cancel')}><Ban className="mr-1.5 h-4 w-4" />Cancel leave</Button>
                )}
                {row.status !== 'pending' && (
                  <Button variant="outline" disabled={busy} onClick={() => setDialog('revert')}><RotateCcw className="mr-1.5 h-4 w-4" />Move back to pending</Button>
                )}
                {row.status === 'pending' && (
                  <Button variant="ghost" disabled={busy} onClick={() => setDialog('cancel')}><Ban className="mr-1.5 h-4 w-4" />Cancel request</Button>
                )}
                <Button variant="ghost" className="text-red-600 hover:text-red-700" disabled={busy} onClick={() => run(async () => { const r = await actions.remove(row); if (r.ok) close(); })}><Trash2 className="mr-1.5 h-4 w-4" />Delete</Button>
              </div>
            )}
            {!admin && canEmployeeCancel && (
              <Button variant="outline" disabled={busy} onClick={() => setDialog('cancel')}><Ban className="mr-1.5 h-4 w-4" />Cancel my {row.status === 'pending' ? 'request' : 'leave'}</Button>
            )}

            <section aria-label="History">
              <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold"><History className="h-4 w-4 text-muted-foreground" />What happened</h3>
              {isLoading ? <Skeleton className="h-16 w-full" /> : (
                <ol className="relative space-y-4 border-l pl-5">
                  {(events ?? []).map((e) => (
                    <li key={e.id} className="relative">
                      <span className={cn('absolute -left-[27px] flex h-5 w-5 items-center justify-center rounded-full bg-background ring-2 ring-background', dotColor(e.kind))}>{dotIcon(e.kind)}</span>
                      <p className="text-sm">{eventSentence(e, lookups.nameOf(e.actor_id))}</p>
                      {e.note && <p className="mt-0.5 rounded-md bg-muted/60 px-2 py-1 text-xs text-muted-foreground">“{e.note}”</p>}
                      <p className="mt-0.5 text-[11px] text-muted-foreground">{formatDateTime(e.created_at)}</p>
                    </li>
                  ))}
                  {(events ?? []).length === 0 && <li className="text-sm text-muted-foreground">No history yet.</li>}
                </ol>
              )}
              {admin && (
                <form className="mt-4 flex gap-2" onSubmit={(ev) => { ev.preventDefault(); if (note.trim()) void run(async () => { const r = await actions.addNote(row, note.trim()); if (r.ok) setNote(''); }); }}>
                  <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add a private note for the record" aria-label="Add a note" />
                  <Button type="submit" variant="outline" disabled={!note.trim() || busy}><StickyNote className="mr-1.5 h-4 w-4" />Save</Button>
                </form>
              )}
            </section>
          </div>
        </SheetContent>
      </Sheet>

      <ReasonDialog
        open={dialog === 'reject'} title="Not approve this leave?" description={`${name} will be told, with your reason.`}
        label="Why not?" required placeholder="Say it kindly and plainly" suggestions={REJECT_IDEAS} confirmLabel="Not approve" destructive
        onClose={() => setDialog(null)}
        onConfirm={async (reason) => { const r = await actions.reject(row, reason); if (r.ok) close(); }}
      />
      <ReasonDialog
        open={dialog === 'cancel'}
        title={admin ? 'Cancel this leave?' : 'Cancel your leave?'}
        description={row.status === 'approved' ? 'The days go back to the balance.' : 'It will not be counted.'}
        label="Reason" placeholder="Optional" suggestions={admin ? CANCEL_IDEAS : undefined} confirmLabel="Yes, cancel it" destructive
        onClose={() => setDialog(null)}
        onConfirm={async (reason) => { const r = await actions.cancel(row, reason || null); if (r.ok) close(); }}
      />
      <ReasonDialog
        open={dialog === 'revert'} title="Move back to pending?"
        description={row.status === 'approved' ? 'The days go back to the balance and it waits for a new decision.' : 'It goes back to waiting for a decision.'}
        label="Note" placeholder="Optional" confirmLabel="Move back"
        onClose={() => setDialog(null)}
        onConfirm={async (n) => { const r = await actions.revert(row, n || null); if (r.ok) close(); }}
      />
      <RequestDialog open={dialog === 'edit'} mode="edit" row={row} onClose={() => setDialog(null)} onDone={close} />
    </>
  );
}

function dotColor(kind: string) {
  return kind === 'approved' || kind === 'recorded' ? 'text-emerald-600' : kind === 'rejected' || kind === 'cancelled' || kind === 'deleted' ? 'text-red-600' : kind === 'edited' || kind === 'reverted' ? 'text-amber-600' : 'text-muted-foreground';
}
function dotIcon(kind: string) {
  const c = 'h-4 w-4';
  switch (kind) {
    case 'approved': case 'recorded': return <CheckCircle2 className={c} />;
    case 'rejected': case 'cancelled': case 'deleted': return <XCircle className={c} />;
    case 'edited': return <Pencil className="h-3.5 w-3.5" />;
    case 'reverted': return <RotateCcw className="h-3.5 w-3.5" />;
    case 'noted': return <StickyNote className="h-3.5 w-3.5" />;
    default: return <Clock className={c} />;
  }
}
