import { Inbox } from 'lucide-react';
import { EmptyState } from '@/components/ui-kit/EmptyState';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useAgentFlags, useAgentPeople, useAgentSettings } from '@/queries/useOpsAgent';
import { MODE_META, type AgentFlag } from '../agentDb';

const SEVERITY: Record<AgentFlag['severity'], string> = {
  info: 'bg-slate-100 text-slate-700 dark:bg-slate-500/10 dark:text-slate-300',
  low: 'bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400',
  medium: 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400',
  high: 'bg-orange-50 text-orange-700 dark:bg-orange-500/10 dark:text-orange-400',
  critical: 'bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-400',
};

/**
 * Everything the agent wants a person to look at. Phase 1 only lists what is already there (nothing yet:
 * the rules arrive in Phase 2), so a new install shows an honest empty state, not a made-up list.
 */
export function InboxTab() {
  const flags = useAgentFlags();
  const people = useAgentPeople();
  const settings = useAgentSettings();
  const names = new Map((people.data ?? []).map((p) => [p.id, p.full_name ?? 'Unknown']));
  const mode = settings.data?.mode;

  if (flags.isLoading) return <Skeleton className="h-40 w-full" />;
  if (flags.isError) return <p className="text-sm text-destructive" role="alert">The Inbox could not be loaded: {flags.error.message}</p>;
  const rows = flags.data ?? [];

  if (rows.length === 0) {
    return (
      <EmptyState
        icon={Inbox}
        title="Nothing needs attention"
        description={
          mode
            ? `The agent is in ${MODE_META[mode].label} mode. ${MODE_META[mode].help} The rules that fill this Inbox are switched on in the next phase, so nothing is flagged yet.`
            : 'Nothing has been flagged yet.'
        }
      />
    );
  }

  return (
    <ul className="space-y-2" data-testid="agent-inbox">
      {rows.map((f) => (
        <li key={f.id} className="rounded-lg border bg-card p-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className={SEVERITY[f.severity]}>{f.severity}</Badge>
            <span className="font-medium">{f.title}</span>
            <span className="text-xs text-muted-foreground">{f.rule_code}</span>
            {f.occurrence_count > 1 && <span className="text-xs text-muted-foreground">seen {f.occurrence_count} times</span>}
          </div>
          {f.why && <p className="mt-1 text-sm text-muted-foreground">{f.why}</p>}
          <p className="mt-1 text-xs text-muted-foreground">
            {f.person_id ? `${names.get(f.person_id) ?? 'Unknown'} · ` : ''}last seen {new Date(f.last_seen_at).toLocaleString()}
          </p>
        </li>
      ))}
    </ul>
  );
}
