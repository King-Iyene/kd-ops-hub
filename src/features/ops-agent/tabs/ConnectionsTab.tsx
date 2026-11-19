import { Link2 } from 'lucide-react';
import { EmptyState } from '@/components/ui-kit/EmptyState';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useAgentConnections } from '@/queries/useOpsAgent';

/** Where the agent can read from or send drafts to (email, Cliq, Slack, webhooks). Super Admin only. Built in Phase 5. */
export function ConnectionsTab() {
  const q = useAgentConnections();
  if (q.isLoading) return <Skeleton className="h-40 w-full" />;
  if (q.isError) return <p className="text-sm text-destructive" role="alert">Connections could not be loaded: {q.error.message}</p>;
  const rows = q.data ?? [];
  if (rows.length === 0) {
    return (
      <EmptyState
        icon={Link2}
        title="No connections"
        description="Email, Zoho Cliq, Slack and webhooks are added here in a later phase. Credentials are kept in the vault, never in this page. Nothing is sent anywhere today."
      />
    );
  }
  return (
    <ul className="space-y-2">
      {rows.map((c) => (
        <li key={c.id} className="flex items-center gap-2 rounded-lg border bg-card p-3">
          <span className="font-medium">{c.name}</span>
          <Badge variant="outline">{c.kind}</Badge>
          <Badge variant="outline">{c.status}</Badge>
          {c.last_error && <span className="text-xs text-destructive">{c.last_error}</span>}
        </li>
      ))}
    </ul>
  );
}
