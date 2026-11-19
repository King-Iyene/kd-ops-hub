import { useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { cleanDomain, spent, type LiveFlag, type SiteVisit } from '../liveTypes';
import { formatEst, relativeTime } from '../time';
import { CATEGORY_LABEL, SiteChip, SiteStack } from './SiteFavicon';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "2026-11-12" as "Nov 12". A plain date has no zone, so it is read as written. */
export function dayLabel(v: unknown): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(v ?? ''));
  return m ? `${MONTHS[Number(m[2]) - 1]} ${Number(m[3])}` : String(v ?? '');
}

/** "0m", "45m", "2h 10m". */
const minutes = (n: number) => (n < 1 ? '0m' : spent(Math.round(n) * 60));

function Fact({ label, children, tone, title }: { label: string; children: ReactNode; tone?: 'bad'; title?: string }) {
  return (
    <div className="min-w-0" title={title}>
      <dt className="text-2xs font-medium uppercase tracking-wider text-muted-foreground">{label}</dt>
      <dd className={cn('mt-0.5 text-sm font-medium tabular-nums', tone === 'bad' && 'text-destructive')}>{children}</dd>
    </div>
  );
}

function Facts({ children }: { children: ReactNode }) {
  return <dl className="flex flex-wrap gap-x-7 gap-y-2" data-testid="evidence">{children}</dl>;
}

/** The unexpected sites for one flag: a favicon stack as the summary, expanding into one chip per site. */
function Sites({ sites, total }: { sites: SiteVisit[]; total: number }) {
  const [open, setOpen] = useState(true);
  const sorted = [...sites].sort((a, b) => b.seconds - a.seconds).map((s) => ({ ...s, domain: cleanDomain(s.domain) }));
  const sum = total > 0 ? total : sorted.reduce((t, s) => t + s.seconds, 0);
  const categories = new Set(sorted.map((s) => s.category));
  return (
    <div className="space-y-2" data-testid="evidence">
      <button
        type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open}
        className="-ml-1 inline-flex items-center gap-2.5 rounded-full py-0.5 pl-1 pr-2 text-sm hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring kd-transition"
      >
        <SiteStack sites={sorted} />
        <span className="font-medium">{sorted.length} {sorted.length === 1 ? 'site' : 'sites'}</span>
        <span className="tabular-nums text-muted-foreground">{spent(sum)} in total</span>
        <ChevronDown className={cn('h-3.5 w-3.5 text-muted-foreground motion-safe:transition-transform', open && 'rotate-180')} aria-hidden="true" />
      </button>
      {open && (
        <>
          <ul className="flex flex-wrap gap-1.5" aria-label="Sites visited">{sorted.map((s) => <SiteChip key={s.domain} site={s} />)}</ul>
          <p className="flex flex-wrap gap-x-4 gap-y-1 text-2xs text-muted-foreground">
            {(['unproductive', 'unknown'] as const).filter((c) => categories.has(c)).map((c) => (
              <span key={c} className="inline-flex items-center gap-1.5">
                <span className={cn('h-2 w-2 rounded-full', c === 'unproductive' ? 'bg-destructive' : 'bg-warning')} aria-hidden="true" />{CATEGORY_LABEL[c]}
              </span>
            ))}
            <span>Site names only, never page addresses.</span>
          </p>
        </>
      )}
    </div>
  );
}

/** What the rule saw, in the form that rule's reader needs. Returns nothing when a rule has no evidence to show. */
export function Evidence({ flag, now }: { flag: Pick<LiveFlag, 'rule_code' | 'evidence'>; now: number }) {
  const e = flag.evidence;
  if (!e || typeof e !== 'object') return null;
  const code = (flag.rule_code ?? '').toUpperCase();

  if (code === 'TR01') {
    const last = e.last_tracked_at;
    return (
      <Facts>
        <Fact label="Tracked today" tone={(e.tracked_minutes_today ?? 0) === 0 ? 'bad' : undefined}>{minutes(e.tracked_minutes_today ?? 0)}</Fact>
        <Fact label="Last tracked" title={last ? formatEst(last) : undefined}>{last ? relativeTime(last, now) : 'Not yet today'}</Fact>
        {e.window && <Fact label="Work window">{e.window}</Fact>}
      </Facts>
    );
  }
  if (code === 'TR02') {
    return (
      <Facts>
        <Fact label="Timer running" tone="bad">{typeof e.running_hours === 'number' ? `${e.running_hours.toFixed(1)}h` : 'Unknown'}</Fact>
        {e.started_at && <Fact label="Started">{formatEst(e.started_at)}</Fact>}
      </Facts>
    );
  }
  if (code === 'TR05' && Array.isArray(e.sites) && e.sites.length > 0) return <Sites sites={e.sites} total={e.total_seconds ?? 0} />;
  if (code === 'TK13' || code === 'TK14') {
    return (
      <Facts>
        {e.task_title && <Fact label="Task">{e.task_title}</Fact>}
        {e.by_name && <Fact label={code === 'TK13' ? 'Moved by' : 'Completed by'}>{e.by_name}</Fact>}
      </Facts>
    );
  }
  if (code === 'TK01') {
    return (
      <Facts>
        {e.task_title && <Fact label="Task">{e.task_title}</Fact>}
        {e.due_date && <Fact label="Was due">{dayLabel(e.due_date)}</Fact>}
        {typeof e.days_overdue === 'number' && <Fact label="Overdue" tone="bad">{e.days_overdue} {e.days_overdue === 1 ? 'day' : 'days'}</Fact>}
        {e.assignee_name && <Fact label="Assigned to">{e.assignee_name}</Fact>}
      </Facts>
    );
  }
  if (code === 'TK02') {
    return (
      <Facts>
        {e.task_title && <Fact label="Task">{e.task_title}</Fact>}
        {(e.from || e.to) && <Fact label="Due date">{dayLabel(e.from)} to {dayLabel(e.to)}</Fact>}
        {e.by_name && <Fact label="Changed by">{e.by_name}</Fact>}
      </Facts>
    );
  }
  if (code === 'RP01') {
    return (
      <Facts>
        {e.day && <Fact label="Report for">{dayLabel(e.day)}</Fact>}
        {e.deadline && <Fact label="Was due">{e.deadline}</Fact>}
      </Facts>
    );
  }
  // Any other rule: show the plain facts it attached, if it attached any.
  const generic: [string, ReactNode][] = [];
  if (e.task_title) generic.push(['Task', e.task_title]);
  if (e.assignee_name) generic.push(['Assigned to', e.assignee_name]);
  if (e.due_date) generic.push(['Was due', dayLabel(e.due_date)]);
  if (typeof e.days_overdue === 'number') generic.push(['Overdue', `${e.days_overdue} ${e.days_overdue === 1 ? 'day' : 'days'}`]);
  if (e.day) generic.push(['For', dayLabel(e.day)]);
  if (generic.length === 0) return null;
  return <Facts>{generic.map(([k, v]) => <Fact key={k} label={k}>{v}</Fact>)}</Facts>;
}
