import { useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AgentSummary } from '../agentDb';
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
  const missing = m?.reports?.missing ?? [];
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
          {m && summary.period_kind !== 'scorecard' && (
            <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border bg-border lg:grid-cols-4" data-testid="summary-tiles">
              <Tile testId="tile-tracking" label="Tracking" main={of(m.tracking?.tracked_days, m.tracking?.expected_days)} hint={`person-days · ${m.tracking?.hours ?? 0} h`} />
              <Tile testId="tile-reports" label="Reports" main={of(m.reports?.submitted, m.reports?.expected)} hint="sent of expected" />
              <Tile testId="tile-tasks" label="Tasks" main={<>{m.tasks?.completed ?? 0} <span className="text-sm font-normal text-muted-foreground">done</span></>} hint={`${m.tasks?.overdue ?? 0} overdue`} />
              <Tile testId="tile-items" label="Items" main={<>{m.flags?.opened ?? 0} <span className="text-sm font-normal text-muted-foreground">opened</span></>} hint={`${m.flags?.high ?? 0} high or critical`} />
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
                    <SiteIcon domain={s.domain} category="unknown" size={22} />
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
