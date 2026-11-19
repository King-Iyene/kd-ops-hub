import { useEffect, useState, type ReactNode } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import type { TeamPulse } from '../liveTypes';
import { formatEst, relativeTime } from '../time';

/** The current time, refreshed on an interval so "40s ago" keeps counting without a refetch. */
export function useNow(everyMs = 15_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), everyMs);
    return () => clearInterval(t);
  }, [everyMs]);
  return now;
}

/** "18:00" as "6:00 PM EST", using that day's real zone name. */
function deadlineLabel(hhmm: string, day: string): string {
  const [h, m] = (hhmm ?? '').split(':').map(Number);
  if (Number.isNaN(h)) return hhmm;
  // Noon UTC on the pulse's day is the same calendar day in New York, so it has the zone name that applies that day.
  const probe = new Date(`${/^\d{4}-\d{2}-\d{2}$/.test(day) ? day : new Date().toISOString().slice(0, 10)}T12:00:00Z`);
  const zone = formatEst(probe, { timeOnly: true }).split(' ').pop() ?? 'EST';
  return `${h % 12 || 12}:${String(m ?? 0).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'} ${zone}`;
}

const GOOD_MINUTES = 3 * 60_000;

/** "Monitoring · last check 40s ago": green while the last check is under three minutes old, amber after that. */
export function MonitorStatus({ pulse, now }: { pulse: TeamPulse; now: number }) {
  const last = pulse.last_run_at ? new Date(pulse.last_run_at).getTime() : null;
  const age = last === null ? null : now - last;
  const fresh = age !== null && age < GOOD_MINUTES && pulse.last_run_ok;
  const tone = fresh ? 'good' : 'warn';
  const text = last === null
    ? 'Waiting for the first check'
    : fresh ? `Monitoring · last check ${relativeTime(pulse.last_run_at, now)}`
    : pulse.last_run_ok ? `Last check ${relativeTime(pulse.last_run_at, now)} · ${formatEst(pulse.last_run_at, { timeOnly: true })}`
    : `Last check had errors · ${formatEst(pulse.last_run_at, { timeOnly: true })}`;
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs" data-testid="monitor-status">
      <span
        className={cn('inline-flex items-center gap-2 rounded-full px-3 py-1.5 font-medium', tone === 'good' ? 'bg-success/10 text-success' : 'bg-warning/10 text-warning')}
        title={pulse.last_run_at ? `Last check ${formatEst(pulse.last_run_at, { seconds: true })}` : undefined}
        role="status" data-tone={tone}
      >
        <span className="relative flex h-2 w-2" aria-hidden="true">
          {tone === 'good' && <span className="absolute inline-flex h-full w-full rounded-full bg-success opacity-60 motion-safe:animate-ping" />}
          <span className={cn('relative inline-flex h-2 w-2 rounded-full', tone === 'good' ? 'bg-success' : 'bg-warning')} />
        </span>
        {text}
      </span>
      <span className="text-muted-foreground"><span className="tabular-nums">{pulse.team_size}</span> {pulse.team_size === 1 ? 'person' : 'people'} watched</span>
    </div>
  );
}

function Tile({ label, children, hint, bar, tone, testId }: { label: string; children: ReactNode; hint?: ReactNode; bar?: number; tone?: 'good' | 'warn' | 'bad'; testId: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-1 bg-card px-4 py-3.5" data-testid={testId}>
      <p className="text-2xs font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="flex items-baseline gap-1.5 text-2xl font-semibold leading-none tabular-nums">{children}</p>
      {bar !== undefined && (
        <div className="mt-1 h-1 overflow-hidden rounded-full bg-muted" aria-hidden="true">
          <div className={cn('h-full rounded-full motion-safe:transition-[width] motion-safe:duration-500', tone === 'bad' ? 'bg-destructive' : tone === 'warn' ? 'bg-warning' : 'bg-success')} style={{ width: `${Math.min(100, Math.max(0, bar))}%` }} />
        </div>
      )}
      {hint && <p className="truncate text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

const of = (n: number) => <span className="text-sm font-normal text-muted-foreground">of {n}</span>;

/** Four figures about the team right now. A summary strip with hairline dividers, not four separate cards. */
export function TeamPulseTiles({ pulse }: { pulse: TeamPulse }) {
  const trackingPct = pulse.team_size > 0 ? (pulse.tracking_now / pulse.team_size) * 100 : 0;
  const reportsPct = pulse.reports_expected > 0 ? (pulse.reports_in / pulse.reports_expected) * 100 : 0;
  const trackingHint = !pulse.working_day ? 'Not a work day' : !pulse.in_work_window ? 'Outside work hours' : `${pulse.tracked_today} tracked today`;
  return (
    <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border bg-border lg:grid-cols-4" data-testid="team-pulse">
      <Tile testId="pulse-tracking" label="Tracking now" bar={trackingPct} tone={pulse.working_day && pulse.in_work_window && trackingPct < 50 ? 'warn' : 'good'} hint={trackingHint}>
        {pulse.tracking_now}{of(pulse.team_size)}
      </Tile>
      <Tile testId="pulse-reports" label="Reports in" bar={reportsPct} tone={reportsPct >= 100 ? 'good' : 'warn'} hint={`Due ${deadlineLabel(pulse.reports_due_at, pulse.day)}`}>
        {pulse.reports_in}{of(pulse.reports_expected)}
      </Tile>
      <Tile testId="pulse-overdue" label="Overdue tasks" hint={pulse.overdue_tasks === 0 ? 'None overdue' : 'Past their due date'}>
        <span className={cn(pulse.overdue_tasks > 0 && 'text-destructive')}>{pulse.overdue_tasks}</span>
      </Tile>
      <Tile testId="pulse-flags" label="Open flags" hint={pulse.high_flags > 0 ? `${pulse.high_flags} high or critical` : 'None urgent'}>
        <span className={cn(pulse.high_flags > 0 && 'text-warning')}>{pulse.open_flags}</span>
      </Tile>
    </div>
  );
}

export function TeamPulseSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border bg-border lg:grid-cols-4" aria-hidden="true">
      {[0, 1, 2, 3].map((i) => <div key={i} className="space-y-2 bg-card px-4 py-3.5"><Skeleton className="h-3 w-20" /><Skeleton className="h-6 w-14" /><Skeleton className="h-3 w-24" /></div>)}
    </div>
  );
}
