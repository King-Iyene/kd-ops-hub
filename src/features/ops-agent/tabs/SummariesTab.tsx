import { useMemo, useState } from 'react';
import { ChevronDown, Loader2, ScrollText, Sparkles } from 'lucide-react';
import { EmptyState } from '@/components/ui-kit/EmptyState';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { useAgentSummaries } from '@/queries/useOpsAgent';
import { useAgentRules, useGenerateSummary, usePeopleDirectory, type GenerateKind, type SummaryKind } from '@/queries/useOpsAgentV4';
import { useAgentToast } from '../settings/useAgentToast';
import { SummaryCard } from './SummaryCard';
import { byNewest, groupByMonth, KIND_LABEL, loadKinds, saveKinds, type KindsShown } from './summaryFormat';

const SCHEDULE = 'Daily summary at 6:30 PM Eastern on working days; weekly on the last working day of the week; monthly on the last working day of the month; scorecard on the first working day of the week at 8:00 AM.';
const KINDS: SummaryKind[] = ['day', 'scorecard', 'week', 'month'];
const GENERATE_KINDS: GenerateKind[] = ['day', 'week', 'month'];

/**
 * Daily, weekly and monthly write-ups, grouped by month. Daily is shown; Weekly and Monthly are hidden until you turn them on
 * (remembered in this browser). The database writes them on a schedule; "Generate now" makes one on request.
 */
export function SummariesTab() {
  const q = useAgentSummaries();
  const people = usePeopleDirectory();
  const rules = useAgentRules();
  const generate = useGenerateSummary();
  const toast = useAgentToast();
  const { toast: notify } = useToast();
  const [shown, setShown] = useState<KindsShown>(loadKinds);
  const ruleTitles = useMemo(() => new Map((rules.data ?? []).map((r) => [r.code, r.title])), [rules.data]);

  const rows = useMemo(() => q.data ?? [], [q.data]);
  const visible = useMemo(() => rows.filter((r) => shown[r.period_kind as SummaryKind]), [rows, shown]);
  const groups = useMemo(() => groupByMonth(visible), [visible]);
  const latestDaily = useMemo(() => rows.filter((r) => r.period_kind === 'day').sort(byNewest)[0]?.id ?? null, [rows]);
  const counts = useMemo(() => Object.fromEntries(KINDS.map((k) => [k, rows.filter((r) => r.period_kind === k).length])) as Record<SummaryKind, number>, [rows]);

  const toggle = (k: SummaryKind) => setShown((s) => { const next = { ...s, [k]: !s[k] }; saveKinds(next); return next; });
  const make = (k: GenerateKind) => generate.mutate(k, {
    onSuccess: () => notify({ title: `${KIND_LABEL[k]} summary made`, description: 'It is at the top of its month.' }),
    onError: toast.failed,
  });

  const toolbar = (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Which summaries to show">
        {KINDS.map((k) => {
          const on = shown[k];
          return (
            <button
              key={k} type="button" aria-pressed={on} onClick={() => toggle(k)} data-testid={`kind-${k}`}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm kd-transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                on ? 'border-primary/40 bg-primary/10 font-medium text-foreground' : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
              )}
            >
              {KIND_LABEL[k]}<span className="text-xs tabular-nums text-muted-foreground">{counts[k]}</span>
              <span className="sr-only">{on ? ', shown' : ', hidden'}</span>
            </button>
          );
        })}
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm" variant="outline" className="h-8" disabled={generate.isPending} data-testid="generate-now">
            {generate.isPending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Sparkles className="mr-1.5 h-3.5 w-3.5" />} Generate now <ChevronDown className="ml-1 h-3.5 w-3.5" aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {GENERATE_KINDS.map((k) => <DropdownMenuItem key={k} onSelect={() => make(k)} data-testid={`generate-${k}`}>{KIND_LABEL[k]}</DropdownMenuItem>)}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );

  if (q.isLoading) return <Skeleton className="h-40 w-full" />;
  if (q.isError) return <p className="text-sm text-destructive" role="alert">Summaries could not be loaded: {q.error.message}. Refresh the page to try again.</p>;

  if (rows.length === 0) {
    return (
      <div className="space-y-4" data-testid="agent-summaries">
        {toolbar}
        <EmptyState icon={ScrollText} title="No summaries yet" description={`${SCHEDULE} Use Generate now to make one straight away.`} />
      </div>
    );
  }

  return (
    <div className="space-y-5" data-testid="agent-summaries">
      {toolbar}
      {groups.length === 0 ? (
        <p className="text-sm text-muted-foreground" data-testid="summaries-none-shown">
          {KINDS.every((k) => !shown[k]) ? 'Nothing is shown. Turn on a kind of summary above.' : 'No summaries of the kinds you are showing yet. Turn on Weekly or Monthly above, or use Generate now.'}
        </p>
      ) : groups.map((g) => (
        <section key={g.key} aria-label={g.heading} data-testid="summary-group">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{g.heading}</h2>
          <ul className="space-y-2">{g.rows.map((s) => <SummaryCard key={s.id} summary={s} defaultOpen={s.id === latestDaily} people={people} ruleTitles={ruleTitles} />)}</ul>
        </section>
      ))}
      <p className="text-xs text-muted-foreground">{SCHEDULE}</p>
    </div>
  );
}
