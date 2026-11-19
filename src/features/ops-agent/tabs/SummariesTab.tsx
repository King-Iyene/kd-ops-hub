import { ScrollText } from 'lucide-react';
import { EmptyState } from '@/components/ui-kit/EmptyState';
import { Skeleton } from '@/components/ui/skeleton';
import { useAgentSummaries } from '@/queries/useOpsAgent';

/** Daily, weekly and monthly write-ups. Generated from Phase 3 on; until then this lists nothing. */
export function SummariesTab() {
  const q = useAgentSummaries();
  if (q.isLoading) return <Skeleton className="h-40 w-full" />;
  if (q.isError) return <p className="text-sm text-destructive" role="alert">Summaries could not be loaded: {q.error.message}</p>;
  const rows = q.data ?? [];
  if (rows.length === 0) {
    return (
      <EmptyState
        icon={ScrollText}
        title="No summaries yet"
        description="Daily, weekly and monthly summaries appear here once the AI layer is switched on. The numbers in them come from the database; the AI only writes them up."
      />
    );
  }
  return (
    <ul className="space-y-2">
      {rows.map((s) => (
        <li key={s.id} className="rounded-lg border bg-card p-3">
          <p className="text-sm font-medium">{s.period_kind} · {s.period_start} to {s.period_end}{s.auto ? ' · automatic' : ''}</p>
          {s.narrative && <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{s.narrative}</p>}
        </li>
      ))}
    </ul>
  );
}
