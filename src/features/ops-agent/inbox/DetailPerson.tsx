import { CalendarOff, CheckCircle2, Circle, Clock, ListChecks, TriangleAlert } from 'lucide-react';
import { cn } from '@/lib/utils';
import { PersonAvatar } from '../PersonAvatar';
import type { DetailPerson, DetailToday } from '../detailTypes';
import { spent } from '../liveTypes';

function Cell({ icon: Icon, label, value, tone }: { icon: typeof Clock; label: string; value: string; tone?: 'bad' | 'good' }) {
  return (
    <div className="flex min-w-0 items-center gap-2 bg-card px-3 py-2">
      <Icon className={cn('h-3.5 w-3.5 shrink-0', tone === 'bad' ? 'text-destructive' : tone === 'good' ? 'text-success' : 'text-muted-foreground')} aria-hidden="true" />
      <div className="min-w-0">
        <p className="truncate text-2xs uppercase tracking-wider text-muted-foreground">{label}</p>
        <p className={cn('truncate text-sm font-medium tabular-nums', tone === 'bad' && 'text-destructive')}>{value}</p>
      </div>
    </div>
  );
}

/** A small "today" strip: tracked time, timer, tasks, report and leave. Words as well as colour. */
export function TodayStrip({ today }: { today: DetailToday }) {
  return (
    <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border bg-border sm:grid-cols-3" data-testid="today-strip" aria-label="Today">
      <Cell icon={Clock} label="Tracked" value={spent(today.tracked_minutes * 60)} tone={today.tracked_minutes === 0 && !today.on_leave ? 'bad' : undefined} />
      <Cell icon={today.tracking_now ? CheckCircle2 : Circle} label="Timer" value={today.tracking_now ? 'Running now' : 'Not running'} tone={today.tracking_now ? 'good' : undefined} />
      <Cell icon={ListChecks} label="Open tasks" value={String(today.open_tasks)} />
      <Cell icon={TriangleAlert} label="Overdue" value={String(today.overdue_tasks)} tone={today.overdue_tasks > 0 ? 'bad' : undefined} />
      <Cell icon={today.reported_today ? CheckCircle2 : Circle} label="Daily report" value={today.reported_today ? 'Sent' : 'Not sent'} tone={today.reported_today ? 'good' : undefined} />
      <Cell icon={CalendarOff} label="Leave" value={today.on_leave ? 'On leave' : 'Not on leave'} />
    </div>
  );
}

/** The person the item is about: photo, name, job title, manager, and how today is going. */
export function PersonBlock({ person, today }: { person: DetailPerson; today: DetailToday | null }) {
  return (
    <section aria-label="The person" className="space-y-3" data-testid="detail-person">
      <div className="flex items-center gap-3">
        <PersonAvatar name={person.full_name} photoUrl={person.photo_url} size="lg" />
        <div className="min-w-0">
          <p className="truncate text-base font-semibold leading-tight">{person.full_name ?? 'Unknown'}</p>
          <p className="truncate text-sm text-muted-foreground">{person.job_title ?? 'No job title'}</p>
          {person.manager?.full_name && (
            <p className="mt-0.5 flex items-center gap-1.5 truncate text-xs text-muted-foreground">
              <span>Manager</span><PersonAvatar name={person.manager.full_name} photoUrl={person.manager.photo_url} size="sm" className="!h-5 !w-5 text-3xs" />
              <span className="font-medium text-foreground/80">{person.manager.full_name}</span>
            </p>
          )}
        </div>
      </div>
      {today && <TodayStrip today={today} />}
    </section>
  );
}
