// What a person sees about their own leave: what is left, what is coming, what happened.
import { useMemo } from 'react';
import { CalendarPlus, Plane, Stethoscope } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/store/authStore';
import { useBalances, useMyLeave, usePeople } from './leaveApi';
import { annualPosition, daysLabel, isoDate, rangeLabel, relativeStart, usedFor } from './leaveMath';
import { LeaveStatusPill, TypeChip } from './leaveUi';
import { useLookups } from './useLookups';
import type { LeaveRow } from './types';

export function MyLeaveTab({ onRequest, onOpen }: { onRequest: () => void; onOpen: (r: LeaveRow) => void }) {
  const me = useAuthStore((s) => s.profile);
  const lookups = useLookups();
  const year = new Date().getFullYear();
  const { data: rows, isLoading } = useMyLeave(me?.id);
  const { data: balances } = useBalances(year, me?.id, false);
  const { data: people } = usePeople();
  const today = isoDate(new Date());

  const myStart = people?.find((p) => p.id === me?.id)?.start_date ?? null;
  const defaultQuota = lookups.types.find((t) => t.code === 'annual')?.default_days ?? 20;
  const sickAllowance = lookups.types.find((t) => t.code === 'sick')?.default_days ?? 0;
  const bal = balances?.[0] ?? null;
  const pos = annualPosition(bal, defaultQuota, year, myStart);

  const { upcoming, earlier } = useMemo(() => {
    const list = rows ?? [];
    const up = list.filter((r) => (r.status === 'pending' || r.status === 'approved') && r.end_date >= today).sort((a, b) => a.start_date.localeCompare(b.start_date));
    const rest = list.filter((r) => !up.includes(r)).sort((a, b) => b.start_date.localeCompare(a.start_date));
    return { upcoming: up, earlier: rest };
  }, [rows, today]);

  const pct = (n: number) => `${pos.quota > 0 ? Math.min(100, Math.max(0, (n / pos.quota) * 100)) : 0}%`;

  return (
    <div className="space-y-6">
      <section className="grid gap-3 sm:grid-cols-3" aria-label="My balance">
        <div className="rounded-2xl border bg-card p-4 sm:col-span-2">
          <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground"><Plane className="h-4 w-4" />Annual leave {year}</div>
          <p className="mt-2 text-3xl font-bold tabular-nums">{pos.left}<span className="ml-1.5 text-base font-medium text-muted-foreground">{pos.left === 1 ? 'day' : 'days'} you can take now</span></p>
          <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-muted" role="img" aria-label={`${pos.used} used, ${pos.earned} earned so far, ${pos.quota} for the year`}>
            <div className="relative h-full">
              <div className="absolute inset-y-0 left-0 rounded-full bg-primary/25" style={{ width: pct(pos.earned) }} />
              <div className="absolute inset-y-0 left-0 rounded-full bg-primary" style={{ width: pct(pos.used) }} />
            </div>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">{pos.used} used · {pos.earned} earned so far · {pos.quota} for the whole year. You earn a little every month.</p>
        </div>
        <div className="rounded-2xl border bg-card p-4">
          <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground"><Stethoscope className="h-4 w-4" />Sick leave</div>
          <p className="mt-2 text-3xl font-bold tabular-nums">{usedFor(bal, 'sick')}<span className="ml-1.5 text-base font-medium text-muted-foreground">{sickAllowance ? `of ${sickAllowance} used` : 'used'}</span></p>
          <p className="mt-2 text-xs text-muted-foreground">Other leave used this year: {daysLabel(['unpaid', 'maternity', 'paternity', 'compassionate', 'study'].reduce((n, t) => n + usedFor(bal, t), 0))}</p>
        </div>
      </section>

      <section aria-label="Coming up">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold">Coming up and waiting</h2>
          <Button size="sm" onClick={onRequest}><CalendarPlus className="mr-1.5 h-4 w-4" />Request leave</Button>
        </div>
        {isLoading ? <Skeleton className="h-20 w-full" /> : upcoming.length === 0 ? (
          <div className="rounded-2xl border border-dashed py-10 text-center">
            <p className="text-sm text-muted-foreground">You have no leave planned.</p>
            <Button variant="link" onClick={onRequest}>Plan some time off</Button>
          </div>
        ) : <LeaveList rows={upcoming} onOpen={onOpen} today={today} />}
      </section>

      {earlier.length > 0 && (
        <section aria-label="Earlier">
          <h2 className="mb-3 text-base font-semibold">Earlier</h2>
          <LeaveList rows={earlier.slice(0, 30)} onOpen={onOpen} today={today} muted />
        </section>
      )}
    </div>
  );
}

function LeaveList({ rows, onOpen, today, muted }: { rows: LeaveRow[]; onOpen: (r: LeaveRow) => void; today: string; muted?: boolean }) {
  const lookups = useLookups();
  return (
    <ul className="divide-y rounded-2xl border bg-card">
      {rows.map((r) => (
        <li key={r.id}>
          <button type="button" onClick={() => onOpen(r)} className={cn('flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none', muted && 'opacity-90')}>
            <div className="min-w-0 flex-1">
              <TypeChip name={lookups.typeName(r.leave_type)} color={lookups.typeColor(r.leave_type)} />
              <p className="mt-0.5 font-medium">{rangeLabel(r.start_date, r.end_date)}</p>
              <p className="text-sm text-muted-foreground">
                {daysLabel(Number(r.days_requested))}{r.status === 'approved' ? ` · ${relativeStart(r.start_date, r.end_date, today)}` : ''}
                {r.status === 'rejected' && (r.rejection_reason ?? r.review_note) ? ` · “${r.rejection_reason ?? r.review_note}”` : ''}
              </p>
            </div>
            <LeaveStatusPill status={r.status} short />
          </button>
        </li>
      ))}
    </ul>
  );
}
