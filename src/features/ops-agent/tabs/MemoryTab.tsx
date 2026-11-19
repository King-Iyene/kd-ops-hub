import { Brain } from 'lucide-react';
import { EmptyState } from '@/components/ui-kit/EmptyState';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useAgentMemory } from '@/queries/useOpsAgent';

/** What the agent has been taught: facts, corrections and exemptions. Teaching it arrives with chat in Phase 4. */
export function MemoryTab() {
  const q = useAgentMemory();
  if (q.isLoading) return <Skeleton className="h-40 w-full" />;
  if (q.isError) return <p className="text-sm text-destructive" role="alert">Memory could not be loaded: {q.error.message}</p>;
  const rows = q.data ?? [];
  if (rows.length === 0) {
    return (
      <EmptyState
        icon={Brain}
        title="Nothing remembered yet"
        description="Corrections and exemptions you give the agent are listed here, and every one can be reviewed, edited or removed. A Super Admin approves anything an Admin teaches it."
      />
    );
  }
  return (
    <ul className="space-y-2">
      {rows.map((m) => (
        <li key={m.id} className="rounded-lg border bg-card p-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">{m.type}</Badge>
            <Badge variant="outline">{m.status}</Badge>
            <span className="text-xs text-muted-foreground">{m.scope}{m.scope_ref ? `: ${m.scope_ref}` : ''}</span>
          </div>
          <p className="mt-1 text-sm">{m.content}</p>
        </li>
      ))}
    </ul>
  );
}
