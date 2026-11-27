// The admin's inbox: only what is waiting for a decision, oldest first, decided in one click.
import { useMemo, useState } from 'react';
import { AlertTriangle, Check, CheckCheck, ChevronRight, Loader2, PartyPopper, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { useAllLeave, useBalances } from './leaveApi';
import { annualPosition, daysLabel, isoDate, overlaps, rangeLabel } from './leaveMath';
import { PersonAvatar, ReasonDialog, TypeChip } from './leaveUi';
import { useLookups } from './useLookups';
import { useLeaveActions } from './useLeaveActions';
import type { LeaveRow } from './types';

const REJECT_IDEAS = ['The team is short-staffed then', 'Please pick other dates', 'Not enough leave left'];

export function NeedsReviewTab({ onOpen }: { onOpen: (r: LeaveRow) => void }) {
  const { data: all, isLoading } = useAllLeave(true);
  const year = new Date().getFullYear();
  const { data: balances } = useBalances(year, undefined, true);
  const lookups = useLookups();
  const actions = useLeaveActions();
  const [rejecting, setRejecting] = useState<LeaveRow | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const pending = useMemo(
    () => (all ?? []).filter((r) => r.status === 'pending').sort((a, b) => a.created_at.localeCompare(b.created_at)),
    [all],
  );
  const live = useMemo(() => (all ?? []).filter((r) => r.status === 'approved' || r.status === 'pending'), [all]);
  const defaultQuota = lookups.types.find((t) => t.code === 'annual')?.default_days ?? 20;
  const today = isoDate(new Date());

  const approve = async (r: LeaveRow) => { setBusyId(r.id); try { await actions.approveAsking(r); } finally { setBusyId(null); } };

  if (isLoading) return <div className="space-y-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-28 w-full rounded-xl" />)}</div>;

  if (pending.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed py-16 text-center">
        <PartyPopper className="h-10 w-10 text-emerald-500" />
        <p className="text-lg font-semibold">Nothing is waiting for you</p>
        <p className="max-w-sm text-sm text-muted-foreground">New requests show up here the moment someone sends them, and you get a notification.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">{pending.length} request{pending.length === 1 ? '' : 's'} waiting. The one that has waited longest is first.</p>
      {pending.map((r) => {
        const person = lookups.person(r.employee_id);
        const clashes = live.filter((o) => o.id !== r.id && o.employee_id !== r.employee_id && overlaps(o, r));
        const bal = (balances ?? []).find((b) => b.employee_id === r.employee_id) ?? null;
        const pos = annualPosition(bal, defaultQuota, Number(r.start_date.slice(0, 4)), person?.start_date ?? null);
        const overEarned = r.leave_type === 'annual' && pos.used + Number(r.days_requested) > pos.earned;
        const waited = Math.max(0, Math.round((Date.parse(today) - Date.parse(r.created_at.slice(0, 10))) / 86_400_000));
        const busy = busyId === r.id;
        return (
          <article key={r.id} className="rounded-2xl border bg-card p-4 shadow-sm transition-shadow hover:shadow-md">
            <div className="flex items-start gap-3">
              <PersonAvatar name={person?.full_name} photo={person?.photo_url} className="h-11 w-11" />
              <button type="button" onClick={() => onOpen(r)} className="min-w-0 flex-1 text-left">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="font-semibold">{lookups.nameOf(r.employee_id)}</span>
                  <TypeChip name={lookups.typeName(r.leave_type)} color={lookups.typeColor(r.leave_type)} />
                </div>
                <p className="mt-0.5 text-sm">{rangeLabel(r.start_date, r.end_date)} <span className="text-muted-foreground">· {daysLabel(Number(r.days_requested))}{r.is_half_day ? ' (half day)' : ''}</span></p>
                {r.reason && <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">“{r.reason}”</p>}
                <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
                  <span className="rounded-full bg-muted px-2 py-0.5 text-muted-foreground">{waited === 0 ? 'Sent today' : `Waiting ${waited} day${waited === 1 ? '' : 's'}`}</span>
                  {r.leave_type === 'annual' && (
                    <span className={cn('rounded-full px-2 py-0.5', overEarned ? 'bg-amber-500/15 text-amber-800 dark:text-amber-200' : 'bg-muted text-muted-foreground')}>
                      {overEarned ? <AlertTriangle className="mr-1 inline h-3 w-3" /> : null}Earned so far {daysLabel(pos.earned)} · used {daysLabel(pos.used)}
                    </span>
                  )}
                  {clashes.length > 0 && (
                    <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-amber-800 dark:text-amber-200">
                      <AlertTriangle className="mr-1 inline h-3 w-3" />{clashes.length} other{clashes.length === 1 ? '' : 's'} away then: {clashes.slice(0, 2).map((c) => lookups.nameOf(c.employee_id).split(' ')[0]).join(', ')}{clashes.length > 2 ? '…' : ''}
                    </span>
                  )}
                </div>
              </button>
              <ChevronRight className="mt-3 hidden h-4 w-4 shrink-0 text-muted-foreground sm:block" aria-hidden />
            </div>
            <div className="mt-3 flex flex-wrap justify-end gap-2 border-t pt-3">
              <Button variant="outline" size="sm" disabled={busy} onClick={() => setRejecting(r)}><X className="mr-1.5 h-4 w-4" />Not approve</Button>
              <Button size="sm" disabled={busy} onClick={() => approve(r)}>{busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Check className="mr-1.5 h-4 w-4" />}Approve</Button>
            </div>
          </article>
        );
      })}
      <p className="flex items-center gap-2 pt-1 text-xs text-muted-foreground"><CheckCheck className="h-3.5 w-3.5 shrink-0" />Approving takes the days off the balance and tells the person. You can still change or undo it later from All leave.</p>

      <ReasonDialog
        open={!!rejecting} title="Not approve this leave?" description={rejecting ? `${lookups.nameOf(rejecting.employee_id)} will be told, with your reason.` : undefined}
        label="Why not?" required placeholder="Say it kindly and plainly" suggestions={REJECT_IDEAS} confirmLabel="Not approve" destructive
        onClose={() => setRejecting(null)}
        onConfirm={async (reason) => { if (!rejecting) return; const res = await actions.reject(rejecting, reason); if (res.ok) setRejecting(null); }}
      />
    </div>
  );
}
