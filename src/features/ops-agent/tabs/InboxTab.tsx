import { useState } from 'react';
import { AlarmClock, Check, Inbox, RotateCcw, UserRoundCheck, X } from 'lucide-react';
import { EmptyState } from '@/components/ui-kit/EmptyState';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useAgentFlags, useAgentPeople, useFlagAction } from '@/queries/useOpsAgent';
import type { AgentFlag } from '../agentDb';
import { useAgentToast } from '../settings/useAgentToast';

const SEVERITY: Record<AgentFlag['severity'], string> = {
  info: 'bg-slate-100 text-slate-700 dark:bg-slate-500/10 dark:text-slate-300',
  low: 'bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400',
  medium: 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400',
  high: 'bg-orange-50 text-orange-700 dark:bg-orange-500/10 dark:text-orange-400',
  critical: 'bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-400',
};
const ORDER: Record<AgentFlag['severity'], number> = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };

/**
 * Everything the agent wants a person to look at: items other systems send in, requests chat could not do itself
 * ("Human action required"), and what the rules find. Handle, snooze or dismiss each one. Nothing here changes a record.
 */
export function InboxTab() {
  const flags = useAgentFlags();
  const people = useAgentPeople();
  const act = useFlagAction();
  const toast = useAgentToast();
  const [showSnoozed, setShowSnoozed] = useState(false);
  const names = new Map((people.data ?? []).map((p) => [p.id, p.full_name ?? 'Unknown']));

  if (flags.isLoading) return <Skeleton className="h-40 w-full" />;
  if (flags.isError) return <p className="text-sm text-destructive" role="alert">The Inbox could not be loaded: {flags.error.message}</p>;
  const all = flags.data ?? [];
  const open = all.filter((f) => f.status === 'open').sort((a, b) => ORDER[a.severity] - ORDER[b.severity] || b.last_seen_at.localeCompare(a.last_seen_at));
  const snoozed = all.filter((f) => f.status === 'snoozed');

  const run = (f: AgentFlag, status: 'open' | 'snoozed' | 'handled' | 'dismissed', done: string) =>
    act.mutate({ id: f.id, status }, { onSuccess: () => toast.saved(done), onError: toast.failed });

  const card = (f: AgentFlag) => (
    <li key={f.id} className="rounded-lg border bg-card p-3" data-testid="inbox-item">
      <div className="flex flex-wrap items-center gap-2">
        {f.item_type === 'human_action'
          ? <Badge variant="outline" className="gap-1 border-violet-500/40 text-violet-600 dark:text-violet-300"><UserRoundCheck className="h-3 w-3" /> Human action required</Badge>
          : <Badge variant="outline" className={SEVERITY[f.severity]}>{f.severity}</Badge>}
        <span className="font-medium">{f.title}</span>
        <span className="text-xs text-muted-foreground">{f.rule_code}</span>
        {f.occurrence_count > 1 && <span className="text-xs text-muted-foreground">seen {f.occurrence_count} times</span>}
      </div>
      {f.why && <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{f.why}</p>}
      {f.suggested_action && <p className="mt-1 text-sm">Suggested: {f.suggested_action}</p>}
      <p className="mt-1 text-xs text-muted-foreground">
        {f.person_id ? `${names.get(f.person_id) ?? 'Unknown'} · ` : ''}last seen {new Date(f.last_seen_at).toLocaleString()}
        {f.status === 'snoozed' ? ' · snoozed' : ''}
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        {f.status === 'open' ? (
          <>
            <Button size="sm" variant="outline" disabled={act.isPending} onClick={() => run(f, 'handled', 'Marked as handled')} data-testid="flag-handled"><Check className="mr-1.5 h-3.5 w-3.5" /> Handled</Button>
            <Button size="sm" variant="ghost" disabled={act.isPending} onClick={() => run(f, 'snoozed', 'Snoozed for a day')}><AlarmClock className="mr-1.5 h-3.5 w-3.5" /> Snooze a day</Button>
            <Button size="sm" variant="ghost" disabled={act.isPending} onClick={() => run(f, 'dismissed', 'Dismissed')}><X className="mr-1.5 h-3.5 w-3.5" /> Dismiss</Button>
          </>
        ) : (
          <Button size="sm" variant="outline" disabled={act.isPending} onClick={() => run(f, 'open', 'Back in the Inbox')}><RotateCcw className="mr-1.5 h-3.5 w-3.5" /> Reopen</Button>
        )}
      </div>
    </li>
  );

  if (open.length === 0 && snoozed.length === 0) {
    return (
      <EmptyState
        icon={Inbox}
        title="Nothing needs attention"
        description="Items appear here when another system sends one through Connections, when you ask Chat for something it cannot do itself, or when a rule finds a problem."
      />
    );
  }

  return (
    <div className="space-y-3" data-testid="agent-inbox">
      {open.length === 0 ? <p className="text-sm text-muted-foreground">Nothing open. Everything is handled or snoozed.</p> : <ul className="space-y-2">{open.map(card)}</ul>}
      {snoozed.length > 0 && (
        <div className="space-y-2">
          <Button size="sm" variant="ghost" onClick={() => setShowSnoozed((v) => !v)} aria-expanded={showSnoozed}>{showSnoozed ? 'Hide' : 'Show'} {snoozed.length} snoozed</Button>
          {showSnoozed && <ul className="space-y-2">{snoozed.map(card)}</ul>}
        </div>
      )}
    </div>
  );
}
