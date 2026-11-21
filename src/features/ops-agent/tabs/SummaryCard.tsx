import { useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AgentSummary, SummaryConsistency } from '../agentDb';
import { Markdown } from '../Markdown';
import { PersonAvatar } from '../PersonAvatar';
import { SiteIcon } from '../inbox/SiteFavicon';
import { formatEst } from '../time';
import type { DirectoryPerson } from '@/queries/useOpsAgentV4';
import { KIND_LABEL, outlookOf, periodLabel } from './summaryFormat';

function Tile({ label, main, hint, testId }: { label: string; main: ReactNode; hint?: ReactNode; testId: string }) {
  return (
    <div className="min-w-0 bg-card px-3 py-2.5" data-testid={testId}>
      <p className="truncate text-2xs font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-lg font-semibold leading-tight tabular-nums">{main}</p>
      {hint && <p className="truncate text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

const pct = (n: number | null | undefined) => (n === null || n === undefined ? '—' : `${n}%`);
const was = (label: string, n: number | string | null | undefined) => (n === null || n === undefined ? '' : ` · ${label} ${n}`);

const of = (a: number | undefined, b: number | undefined) => <>{a ?? 0} <span className="text-sm font-normal text-muted-foreground">of {b ?? 0}</span></>;

function Names({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="min-w-0 space-y-1.5">
      <h4 className="text-2xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</h4>
      <ul className="space-y-1.5">{children}</ul>
    </div>
  );
}

function Person({ id, name, people, children }: { id: string; name: string; people: Map<string, DirectoryPerson>; children: ReactNode }) {
  return (
    <li className="flex items-center gap-2 text-sm">
      <PersonAvatar name={name} photoUrl={people.get(id)?.photo} size="sm" />
      <span className="min-w-0 truncate font-medium">{name}</span>
      <span className="ml-auto shrink-0 text-xs text-muted-foreground tabular-nums">{children}</span>
    </li>
  );
}

/** One summary as a collapsible card: a headline always, and when open the four figures, the write-up and the lists. */
export function SummaryCard({ summary, defaultOpen, people, ruleTitles }: { summary: AgentSummary; defaultOpen: boolean; people: Map<string, DirectoryPerson>; ruleTitles: Map<string, string> }) {
  const [open, setOpen] = useState(defaultOpen);
  const m = summary.metrics ?? null;
  const kind = (summary.period_kind as keyof typeof KIND_LABEL) in KIND_LABEL ? KIND_LABEL[summary.period_kind as keyof typeof KIND_LABEL] : summary.period_kind;
  const label = periodLabel(summary.period_kind, summary.period_start, summary.period_end);
  const headline = m?.headline ?? summary.narrative?.split('\n').find((l) => l.trim() && !l.startsWith('#'))?.slice(0, 220) ?? null;
  const k = m?.kpis ?? null;
  const pk = m?.previous ?? null;
  const kt = k?.tasks;
  const prevWord = summary.period_kind === 'month' ? 'last month' : 'last week';
  const slow = (k?.trackers_inconsistent ?? []) as SummaryConsistency[];
  const late = (k?.reporters_inconsistent ?? []) as SummaryConsistency[];
  const missing = k ? [] : (m?.reports?.missing ?? []);
  const repeat = m?.repeat ?? [];
  const sites = m?.sites ?? [];
  // The write-up opens with the period as a heading; the card header already says it.
  const narrative = summary.narrative?.replace(/^\s*#{1,3} [^\n]*\n+/, '') ?? null;
  const outlook = outlookOf(m);
  const bodyId = `summary-${summary.id}`;

  return (
    <li className="rounded-xl border bg-card" data-testid="summary-card" data-kind={summary.period_kind}>
      <button
        type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-controls={bodyId}
        className="flex w-full items-start gap-3 rounded-xl px-4 py-3 text-left hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring kd-transition"
      >
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-semibold">
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-2xs font-semibold text-primary">{kind}</span>
            <span>{label}</span>
            {!summary.auto && <span className="text-2xs font-normal text-muted-foreground">Made by hand</span>}
          </p>
          {headline && <p className={cn('mt-1 text-sm text-muted-foreground', !open && 'line-clamp-2')}>{headline}</p>}
        </div>
        <ChevronDown className={cn('mt-1 h-4 w-4 shrink-0 text-muted-foreground motion-safe:transition-transform', open && 'rotate-180')} aria-hidden="true" />
      </button>

      {open && (
        <div id={bodyId} className="space-y-4 border-t px-4 pb-4 pt-3">
          {m && k && (summary.period_kind === 'week' || summary.period_kind === 'month') && (
            <div className="space-y-px overflow-hidden rounded-lg border bg-border" data-testid="summary-tiles">
              <div className="grid grid-cols-2 gap-px lg:grid-cols-4">
                <Tile testId="tile-trackers" label="Consistent trackers" main={of(k.trackers_consistent, k.trackers_total)}
                  hint={`${k.threshold ?? 80}%+ of days${was(prevWord, pk?.trackers_total ? `${pk.trackers_consistent ?? 0} of ${pk.trackers_total}` : null)}`} />
                <Tile testId="tile-reporters" label="Consistent reporters" main={of(k.reporters_consistent, k.reporters_total)}
                  hint={`${k.threshold ?? 80}%+ of days${was(prevWord, pk?.reporters_total ? `${pk.reporters_consistent ?? 0} of ${pk.reporters_total}` : null)}`} />
                <Tile testId="tile-completion" label="Task completion" main={pct(kt?.completion_rate)}
                  hint={`${kt?.closed ?? 0} closed of ${kt?.workload ?? 0} in play${was(prevWord, pk?.tasks?.workload ? pct(pk.tasks.completion_rate) : null)}`} />
                <Tile testId="tile-items" label="Team items" main={<>{m.flags?.opened ?? 0} <span className="text-sm font-normal text-muted-foreground">opened</span></>} hint={`${m.flags?.high ?? 0} high or critical`} />
              </div>
              <div className="grid grid-cols-2 gap-px lg:grid-cols-4" data-testid="summary-extras">
                <Tile testId="tile-hours" label="Hours tracked" main={<>{k.hours ?? 0} <span className="text-sm font-normal text-muted-foreground">of {k.expected_hours ?? 0} h</span></>}
                  hint={`${pct(k.hours_pct)} of expected · ${k.avg_hours_per_day ?? 0} h a tracked day`} />
                <Tile testId="tile-opened-closed" label="Tasks opened / closed" main={<>{kt?.opened ?? 0} <span className="text-sm font-normal text-muted-foreground">/ {kt?.closed ?? 0}</span></>}
                  hint={`open ${kt?.open_start ?? 0} → ${kt?.open_end ?? 0}`} />
                <Tile testId="tile-ontime" label="Closed on time" main={pct(kt?.on_time_rate)}
                  hint={kt?.on_time_n ? `of ${kt.on_time_n} with a due date` : 'no due dates'} />
                <Tile testId="tile-overdue" label="Overdue now" main={<span className={cn((kt?.overdue_now ?? 0) > 0 && 'text-destructive')}>{kt?.overdue_now ?? 0}</span>}
                  hint={kt?.avg_days_to_close ? `a task took ${kt.avg_days_to_close} days to close` : undefined} />
              </div>
            </div>
          )}
          {m && !k && summary.period_kind !== 'scorecard' && (
            <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border bg-border lg:grid-cols-4" data-testid="summary-tiles">
              <Tile testId="tile-tracking" label="Tracking" main={of(m.tracking?.tracked_days, m.tracking?.expected_days)} hint={`person-days · ${m.tracking?.hours ?? 0} h`} />
              <Tile testId="tile-reports" label="Reports" main={of(m.reports?.submitted, m.reports?.expected)} hint="sent of expected" />
              <Tile testId="tile-tasks" label="Tasks" main={<>{m.tasks?.completed ?? 0} <span className="text-sm font-normal text-muted-foreground">done</span></>} hint={`${m.tasks?.overdue ?? 0} overdue`} />
              <Tile testId="tile-items" label="Items" main={<>{m.flags?.opened ?? 0} <span className="text-sm font-normal text-muted-foreground">opened</span></>} hint={`${m.flags?.high ?? 0} high or critical · team items`} />
            </div>
          )}

          {outlook && (
            <p className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg bg-muted/40 px-3 py-2 text-sm" data-testid="summary-outlook">
              <span className="text-2xs font-semibold uppercase tracking-wider text-muted-foreground">{outlook.label}</span>
              <span><span className="font-medium tabular-nums">{outlook.due}</span> {outlook.due === 1 ? 'task is' : 'tasks are'} due</span>
              <span><span className="font-medium tabular-nums">{outlook.leave}</span> {outlook.leave === 1 ? 'person is' : 'people are'} on leave</span>
            </p>
          )}

          {narrative && <Markdown text={narrative} className="text-sm" />}

          {k && (slow.length > 0 || late.length > 0) && (
            <div className="grid gap-4 sm:grid-cols-2" data-testid="summary-inconsistent">
              {slow.length > 0 && (
                <Names title="Not tracking consistently">
                  {slow.map((p) => <Person key={p.person_id} id={p.person_id} name={p.name} people={people}>{p.days} of {p.expected} days</Person>)}
                </Names>
              )}
              {late.length > 0 && (
                <Names title="Not reporting consistently">
                  {late.map((p) => <Person key={p.person_id} id={p.person_id} name={p.name} people={people}>{p.days} of {p.expected} days</Person>)}
                </Names>
              )}
            </div>
          )}

          {(missing.length > 0 || repeat.length > 0) && (
            <div className="grid gap-4 sm:grid-cols-2">
              {missing.length > 0 && (
                <Names title="Missing reports">
                  {missing.map((p) => <Person key={p.person_id} id={p.person_id} name={p.name} people={people}>{p.days} {p.days === 1 ? 'day' : 'days'}</Person>)}
                </Names>
              )}
              {repeat.length > 0 && (
                <Names title="Keeps happening">
                  {repeat.map((p) => <Person key={`${p.person_id}-${p.rule}`} id={p.person_id} name={p.name} people={people}>{ruleTitles.get(p.rule) ?? p.rule} · {p.count}×</Person>)}
                </Names>
              )}
            </div>
          )}

          {sites.length > 0 && (
            <div className="space-y-1.5">
              <h4 className="text-2xs font-semibold uppercase tracking-wider text-muted-foreground">Flagged sites</h4>
              <ul className="flex flex-wrap gap-1.5" aria-label="Flagged sites">
                {sites.map((s) => (
                  <li key={s.domain} className="inline-flex max-w-full items-center gap-2 rounded-full border bg-background/60 py-1 pl-1 pr-3 text-xs" data-testid="summary-site">
                    <SiteIcon domain={s.domain} category={s.category === 'unproductive' ? 'unproductive' : 'unknown'} size={22} />
                    <span className="truncate font-medium">{s.domain}</span>
                    <span className="tabular-nums text-muted-foreground">{s.minutes}m · {s.people} {s.people === 1 ? 'person' : 'people'}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <p className="text-2xs text-muted-foreground">{summary.auto ? 'Made automatically' : 'Made on request'} · <time dateTime={summary.created_at} className="tabular-nums">{formatEst(summary.created_at, { year: true })}</time></p>
        </div>
      )}
    </li>
  );
}
