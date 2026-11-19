import { useState } from 'react';
import { AlertCircle, CheckCircle2, Loader2, Pencil, Plug, Plus, Send, Trash2 } from 'lucide-react';
import { EmptyState } from '@/components/ui-kit/EmptyState';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { confirm } from '@/hooks/use-confirm';
import { useAgentConnections, useDeleteConnection, useTestConnection } from '@/queries/useOpsAgent';
import { CONNECTION_KINDS, type AgentConnection } from '../agentDb';
import { Section } from '../settings/shared';
import { useAgentToast } from '../settings/useAgentToast';
import { ApiKeysCard } from './ApiKeysCard';
import { ConnectionDialog } from './ConnectionDialog';

const label = (k: string) => CONNECTION_KINDS.find((c) => c.kind === k)?.label ?? k;
const detail = (c: AgentConnection) => {
  if (c.kind === 'email') return c.config.to ?? '';
  if (c.kind === 'slack' || c.kind === 'cliq') return c.config.host ?? '';
  try { return c.config.url ? new URL(c.config.url).host : ''; } catch { return ''; }
};

/** Where the agent can send things (Slack, Zoho Cliq, email, webhook, n8n, any API) and how other systems reach it. Super Admin only. */
export function ConnectionsTab() {
  const list = useAgentConnections();
  const test = useTestConnection();
  const del = useDeleteConnection();
  const toast = useAgentToast();
  const [dialog, setDialog] = useState<{ open: boolean; editing: AgentConnection | null }>({ open: false, editing: null });
  const [testingId, setTestingId] = useState<string | null>(null);

  const runTest = (id: string) => {
    setTestingId(id);
    test.mutate(id, {
      onSuccess: (r) => (r.ok ? toast.saved('Test message delivered') : toast.failed(new Error(r.error ?? 'The test failed'))),
      onError: toast.failed,
      onSettled: () => setTestingId(null),
    });
  };
  const remove = async (c: AgentConnection) => {
    if (await confirm({ title: `Delete ${c.name}?`, description: 'Its saved address and secret are deleted too. Nothing is sent.', confirmLabel: 'Delete', variant: 'destructive' })) {
      del.mutate(c.id, { onSuccess: () => toast.saved('Connection deleted'), onError: toast.failed });
    }
  };

  const rows = list.data ?? [];
  return (
    <div className="space-y-4" data-testid="agent-connections">
      <Section
        title="Send messages"
        description="Places the agent can send a message you have written or approved. It never sends on its own."
        footer={<Button size="sm" onClick={() => setDialog({ open: true, editing: null })} data-testid="connection-add"><Plus className="mr-2 h-3.5 w-3.5" /> Add a connection</Button>}
      >
        {list.isLoading ? <Skeleton className="h-24 w-full" /> : list.isError ? (
          <p className="text-sm text-destructive" role="alert">Connections could not be loaded: {list.error.message}</p>
        ) : rows.length === 0 ? (
          <EmptyState
            icon={Plug} compact title="No connections yet"
            description="Add Slack, Zoho Cliq, email, a webhook, n8n or any HTTPS API. Each one can be tested with one click."
          />
        ) : (
          <ul className="space-y-2" data-testid="connection-list">
            {rows.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-2 rounded-lg border p-3" data-testid="connection-row">
                <span className="font-medium">{c.name}</span>
                <Badge variant="outline">{label(c.kind)}</Badge>
                {c.status === 'connected' && <Badge variant="outline" className="gap-1 text-emerald-600"><CheckCircle2 className="h-3 w-3" /> Working</Badge>}
                {c.status === 'error' && <Badge variant="outline" className="gap-1 text-destructive"><AlertCircle className="h-3 w-3" /> Failed</Badge>}
                {c.status === 'disconnected' && <Badge variant="outline" className="text-muted-foreground">Not tested</Badge>}
                <span className="truncate text-xs text-muted-foreground">{detail(c)}</span>
                <span className="flex-1" />
                <Button size="sm" variant="outline" onClick={() => runTest(c.id)} disabled={testingId === c.id} data-testid="connection-test">
                  {testingId === c.id ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Send className="mr-1.5 h-3.5 w-3.5" />} Test
                </Button>
                <Button size="sm" variant="ghost" aria-label={`Edit ${c.name}`} onClick={() => setDialog({ open: true, editing: c })}><Pencil className="h-3.5 w-3.5" /></Button>
                <Button size="sm" variant="ghost" aria-label={`Delete ${c.name}`} onClick={() => remove(c)}><Trash2 className="h-3.5 w-3.5" /></Button>
                {c.status === 'error' && c.last_error && <p className="basis-full text-xs text-destructive" role="status">{c.last_error}</p>}
                {c.last_tested_at && c.status !== 'error' && <p className="basis-full text-xs text-muted-foreground">Last tested {new Date(c.last_tested_at).toLocaleString()}</p>}
              </li>
            ))}
          </ul>
        )}
      </Section>

      <ApiKeysCard />

      <ConnectionDialog
        open={dialog.open} editing={dialog.editing}
        onOpenChange={(open) => setDialog((d) => ({ ...d, open }))}
        onSaved={(_id, wasNew) => toast.saved(wasNew ? 'Connection added. Press Test to try it.' : 'Connection updated')}
      />
    </div>
  );
}
