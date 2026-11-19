import { useMemo, useState, type ReactNode } from 'react';
import { AlarmClock, Bot, Check, CheckCircle2, Inbox, Loader2, RefreshCw, RotateCcw, UserRoundCheck, X } from 'lucide-react';
import { EmptyState } from '@/components/ui-kit/EmptyState';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { useAgentFlags, useAgentPeople, useFlagAction } from '@/queries/useOpsAgent';
import { useCheckNow, useTeamPulse } from '@/queries/useOpsAgentLive';
import { PersonAvatar } from '../PersonAvatar';
import { CATEGORIES, categoryOf, isCalm, type FlagCategory, type LiveFlag } from '../liveTypes';
import { Evidence } from '../inbox/Evidence';
import { MonitorStatus, TeamPulseSkeleton, TeamPulseTiles, useNow } from '../inbox/TeamPulse';
import { useAgentToast } from '../settings/useAgentToast';
import { formatEst, relativeTime } from '../time';

type Severity = LiveFlag['severity'];
const STRIPE: Record<Severity, string> = {
  critical: 'bg-destructive', high: 'bg-orange-500', medium: 'bg-warning', low: 'bg-sky-500', info: 'bg-muted-foreground/40',
};
const PILL: Record<Severity, string> = {
  critical: 'bg-destructive/10 text-destructive',
  high: 'bg-orange-500/10 text-orange-600 dark:text-orange-400',
  medium: 'bg-warning/10 text-warning',
  low: 'bg-sky-500/10 text-sky-600 dark:text-sky-400',
  info: 'bg-muted text-muted-foreground',
};
const LABEL: Record<Severity, string> = { critical: 'Critical', high: 'High', medium: 'Medium', low: 'Low', info: 'Info' };
const ORDER: Record<Severity, number> = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
const URGENT = (f: LiveFlag) => (f.severity === 'critical' || f.severity === 'high') && !isCalm(f);

type Status = 'open' | 'snoozed' | 'handled' | 'dismissed';

function Flag({ f, name, now, busy, onAct }: { f: LiveFlag; name: string | null; now: number; busy: boolean; onAct: (f: LiveFlag, s: Status, done: string) => void }) {
  const calm = isCalm(f);
  const human = f.item_type === 'human_action';
  const who = name ?? f.evidence?.assignee_name ?? null;
  return (
    <li className="relative flex gap-3 py-4 pl-4 pr-1 sm:gap-4 sm:pl-5" data-testid="inbox-item" data-severity={f.severity} data-rule={f.rule_code} data-calm={calm || undefined}>
      {!calm && <span className={cn('absolute bottom-3 left-0 top-3 w-1 rounded-full', STRIPE[f.severity])} aria-hidden="true" />}
      <div className="pt-0.5">
        {calm ? (
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-success/12 text-success" aria-hidden="true"><CheckCircle2 className="h-[18px] w-[18px]" /></span>
        ) : who ? <PersonAvatar name={who} /> : (
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-muted text-muted-foreground" aria-hidden="true">{human ? <UserRoundCheck className="h-4 w-4" /> : <Bot className="h-4 w-4" />}</span>
        )}
      </div>
      <div className="min-w-0 flex-1 space-y-2">
        <div>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h3 className="text-sm font-semibold leading-snug">{f.title}</h3>
            {human
              ? <span className="inline-flex items-center gap-1 rounded-full bg-violet-500/10 px-2 py-0.5 text-2xs font-semibold text-violet-600 dark:text-violet-300"><UserRoundCheck className="h-3 w-3" /> Human action required</span>
              : calm
                ? <span className="inline-flex items-center rounded-full bg-success/10 px-2 py-0.5 text-2xs font-semibold text-success">{f.rule_code === 'TK13' ? 'For review' : 'Done'}</span>
                : <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-2xs font-semibold', PILL[f.severity])}>{LABEL[f.severity]}</span>}
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {who && <span className="font-medium text-foreground/80">{who}</span>}
            {who && ' · '}
            <time dateTime={f.last_seen_at} title={formatEst(f.last_seen_at)} className="tabular-nums">{relativeTime(f.last_seen_at, now)}</time>
            {f.occurrence_count > 1 && <> · seen <span className="tabular-nums">{f.occurrence_count}</span> times</>}
            {f.status === 'snoozed' && ' · snoozed'}
            <span className="hidden sm:inline"> · <span className="font-mono">{f.rule_code}</span></span>
          </p>
        </div>
        {f.why && <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">{f.why}</p>}
        <Evidence flag={f} now={now} />
        {f.suggested_action && <p className="text-sm"><span className="text-muted-foreground">Suggested:</span> {f.suggested_action}</p>}
        <div className="flex flex-wrap gap-1 pt-0.5">
          {f.status === 'open' ? (
            <>
              <Button size="sm" variant="outline" className="h-8 px-2.5" disabled={busy} onClick={() => onAct(f, 'handled', 'Marked as handled')} data-testid="flag-handled"><Check className="mr-1 h-3.5 w-3.5" /> Handled</Button>
              <Button size="sm" variant="ghost" className="h-8 px-2" disabled={busy} onClick={() => onAct(f, 'snoozed', 'Snoozed for a day')} aria-label="Snooze a day"><AlarmClock className="mr-1 h-3.5 w-3.5" /> Snooze<span className="hidden sm:inline">&nbsp;a day</span></Button>
              <Button size="sm" variant="ghost" className="h-8 px-2" disabled={busy} onClick={() => onAct(f, 'dismissed', 'Dismissed')}><X className="mr-1 h-3.5 w-3.5" /> Dismiss</Button>
            </>
          ) : (
            <Button size="sm" variant="outline" disabled={busy} onClick={() => onAct(f, 'open', 'Back in the Inbox')}><RotateCcw className="mr-1.5 h-3.5 w-3.5" /> Reopen</Button>
          )}
        </div>
      </div>
    </li>
  );
}

function Group({ title, count, urgent, children }: { title: string; count: number; urgent?: boolean; children: ReactNode }) {
  return (
    <section aria-label={title} data-testid={urgent ? 'group-urgent' : 'group-rest'}>
      <h2 className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        <span className={cn('h-2 w-2 rounded-full', urgent ? 'bg-destructive' : 'bg-muted-foreground/40')} aria-hidden="true" />
        {title} <span className="tabular-nums font-medium">{count}</span>
      </h2>
      <ul className="divide-y">{children}</ul>
    </section>
  );
}

/**
 * Live monitoring: the team pulse and monitor status at the top, then everything the agent wants a person to look at:
 * what the rules find, items other systems send in, and requests chat could not do itself ("Human action required").
 * Handle, snooze or dismiss each one. Nothing here changes a record.
 */
export function InboxTab() {
  const flags = useAgentFlags();
  const people = useAgentPeople();
  const pulse = useTeamPulse();
  const act = useFlagAction();
  const check = useCheckNow();
  const toast = useAgentToast();
  const { toast: notify } = useToast();
  const now = useNow();
  const [showSnoozed, setShowSnoozed] = useState(false);
  const [filter, setFilter] = useState<FlagCategory | 'all'>('all');
  const names = useMemo(() => new Map((people.data ?? []).map((p) => [p.id, p.full_name ?? 'Unknown'])), [people.data]);

  const all = useMemo(() => (flags.data ?? []) as LiveFlag[], [flags.data]);
  const open = useMemo(() => all.filter((f) => f.status === 'open'), [all]);
  const snoozed = useMemo(() => all.filter((f) => f.status === 'snoozed'), [all]);
  const counts = useMemo(() => {
    const c: Record<string, number> = { all: open.length };
    for (const f of open) c[categoryOf(f.rule_code)] = (c[categoryOf(f.rule_code)] ?? 0) + 1;
    return c;
  }, [open]);
  const visible = useMemo(
    () => open.filter((f) => filter === 'all' || categoryOf(f.rule_code) === filter).sort((a, b) => ORDER[a.severity] - ORDER[b.severity] || b.last_seen_at.localeCompare(a.last_seen_at)),
    [open, filter],
  );
  const urgent = visible.filter(URGENT);
  const rest = visible.filter((f) => !URGENT(f));

  const run = (f: LiveFlag, status: Status, done: string) =>
    act.mutate({ id: f.id, status }, { onSuccess: () => toast.saved(done), onError: toast.failed });
  const nameOf = (f: LiveFlag) => (f.person_id ? names.get(f.person_id) ?? null : null);
  const row = (f: LiveFlag) => <Flag key={f.id} f={f} name={nameOf(f)} now={now} busy={act.isPending} onAct={run} />;

  const checkNow = () => check.mutate(undefined, {
    onSuccess: (r) => notify({ title: `Checked: ${r.created} new, ${r.resolved} cleared`, description: r.errors > 0 ? `${r.errors} ${r.errors === 1 ? 'rule' : 'rules'} failed to run.` : undefined }),
    onError: (e) => notify({ title: 'The check could not run', description: `${e.message}. Try again in a moment.`, variant: 'destructive' }),
  });
  const checkButton = (
    <Button size="sm" variant="outline" className="h-8" onClick={checkNow} disabled={check.isPending} data-testid="check-now">
      {check.isPending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-1.5 h-3.5 w-3.5" />} Check now
    </Button>
  );
  const pulseBlock = (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        {pulse.data ? <MonitorStatus pulse={pulse.data} now={now} /> : <span />}
        {checkButton}
      </div>
      {pulse.isLoading ? <TeamPulseSkeleton /> : pulse.data ? <TeamPulseTiles pulse={pulse.data} /> : null}
    </div>
  );

  if (flags.isLoading) return <div className="space-y-4">{pulseBlock}<Skeleton className="h-40 w-full" /></div>;
  if (flags.isError) return <p className="text-sm text-destructive" role="alert">The Inbox could not be loaded: {flags.error.message}. Refresh the page; if it keeps happening, check your connection.</p>;

  if (open.length === 0 && snoozed.length === 0) {
    return (
      <div className="space-y-4" data-testid="agent-inbox">
        {pulseBlock}
        <EmptyState
          icon={Inbox}
          title="Nothing needs attention"
          description="Items appear here when another system sends one through Connections, when you ask Chat for something it cannot do itself, or when a rule finds a problem."
        />
      </div>
    );
  }

  return (
    <div className="space-y-5" data-testid="agent-inbox">
      {pulseBlock}

      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter by type">
        {[{ key: 'all' as const, label: 'All' }, ...CATEGORIES].map((c) => {
          const n = counts[c.key] ?? 0;
          const on = filter === c.key;
          return (
            <button
              key={c.key} type="button" aria-pressed={on} onClick={() => setFilter(c.key)} data-testid={`filter-${c.key}`}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm kd-transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                on ? 'border-primary/40 bg-primary/10 font-medium text-foreground' : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
                n === 0 && !on && 'opacity-60',
              )}
            >
              {c.label}<span className="text-xs tabular-nums text-muted-foreground">{n}</span>
            </button>
          );
        })}
      </div>

      {open.length === 0 ? <p className="text-sm text-muted-foreground">Nothing open. Everything is handled or snoozed.</p>
        : visible.length === 0 ? <p className="text-sm text-muted-foreground" data-testid="filter-empty">Nothing open in {CATEGORIES.find((c) => c.key === filter)?.label}. Pick another type, or All.</p>
        : (
          <div className="space-y-6">
            {urgent.length > 0 && <Group title="Needs attention now" count={urgent.length} urgent>{urgent.map(row)}</Group>}
            {rest.length > 0 && <Group title="Everything else" count={rest.length}>{rest.map(row)}</Group>}
          </div>
        )}

      {snoozed.length > 0 && (
        <div className="space-y-2">
          <Button size="sm" variant="ghost" onClick={() => setShowSnoozed((v) => !v)} aria-expanded={showSnoozed}>{showSnoozed ? 'Hide' : 'Show'} {snoozed.length} snoozed</Button>
          {showSnoozed && <ul className="divide-y">{snoozed.map(row)}</ul>}
        </div>
      )}
    </div>
  );
}
