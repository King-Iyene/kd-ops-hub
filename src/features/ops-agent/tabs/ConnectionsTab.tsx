import { useMemo, useState } from 'react';
import { Loader2, Pencil, TriangleAlert, Plug, Plus, Send, Trash2 } from 'lucide-react';
import { EmptyState } from '@/components/ui-kit/EmptyState';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { confirm } from '@/hooks/use-confirm';
import { cn } from '@/lib/utils';
import { useAgentConnections, useDeleteConnection, useOutbox, useTestConnection } from '@/queries/useOpsAgent';
import { useTeamPulse } from '@/queries/useOpsAgentLive';
import type { AgentConnection, OutboxRow } from '../agentDb';
import { Section } from '../settings/shared';
import { useAgentToast } from '../settings/useAgentToast';
import { formatEst, relativeTime } from '../time';
import { ApiKeysCard } from './ApiKeysCard';
import { ConnectionDialog } from './ConnectionDialog';
import { ToolIcon, presetForConnection } from './ToolIcon';

const SHORT: Record<string, string> = {
  flag_high: 'High-priority items', flag_all: 'Every item', summary_day: 'Daily summary', summary_week: 'Weekly summary', summary_month: 'Monthly summary',
};
const SEVERITY: Record<string, string> = { low: 'Low and above', medium: 'Medium and above', high: 'High and above', critical: 'Critical only' };

/** Where this connection points, without showing anything secret: a host name or the addresses an email goes to. */
const detail = (c: AgentConnection) => {
  if (c.kind === 'email') return c.config.to ?? '';
  if (c.config.host) return c.config.host;
  try { return c.config.url ? new URL(c.config.url).host : ''; } catch { return ''; }
};

const STATUS = {
  connected: { dot: 'bg-success', label: 'Working' },
  error: { dot: 'bg-destructive', label: 'Failed' },
  disconnected: { dot: 'bg-muted-foreground/50', label: 'Not tested' },
} as const;

function Card({ c, outbox, testing, onTest, onEdit, onDelete }: { c: AgentConnection; outbox: OutboxRow[]; testing: boolean; onTest: () => void; onEdit: () => void; onDelete: () => void }) {
  const preset = presetForConnection(c);
  const status = STATUS[c.status] ?? STATUS.disconnected;
  const events = c.config.events ?? [];
  const pending = outbox.filter((o) => o.status === 'pending').length;
  const failed = outbox.filter((o) => o.status === 'failed').length;
  const lastSent = c.last_sent_at ?? outbox.find((o) => o.status === 'sent')?.sent_at ?? null;
  const lastFailure = outbox.find((o) => o.status === 'failed')?.error ?? null;
  return (
    <li className="space-y-2.5 rounded-xl border bg-card p-3.5" data-testid="connection-row" data-preset={preset.id}>
      <div className="flex flex-wrap items-center gap-3">
        <ToolIcon preset={preset} />
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-x-2 text-sm font-semibold"><span className="truncate">{c.name}</span><span className="text-xs font-normal text-muted-foreground">{preset.name}</span></p>
          <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5" data-testid="connection-status"><span className={cn('h-2 w-2 rounded-full', status.dot)} aria-hidden="true" />{status.label}</span>
            {detail(c) && <span className="truncate">· {detail(c)}</span>}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <Button size="sm" variant="outline" className="h-8" onClick={onTest} disabled={testing} data-testid="connection-test">
            {testing ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Send className="mr-1.5 h-3.5 w-3.5" />} Send test
          </Button>
          <Button size="sm" variant="ghost" className="h-8 w-8 p-0" aria-label={`Edit ${c.name}`} onClick={onEdit}><Pencil className="h-3.5 w-3.5" /></Button>
          <Button size="sm" variant="ghost" className="h-8 w-8 p-0" aria-label={`Delete ${c.name}`} onClick={onDelete}><Trash2 className="h-3.5 w-3.5" /></Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5" data-testid="connection-events" aria-label="Sent automatically">
        {events.length === 0 ? <span className="text-xs text-muted-foreground">Sends nothing automatically</span> : (
          <>
            <span className="text-xs text-muted-foreground">Sends:</span>
            {events.map((e) => <span key={e} className="rounded-full bg-muted px-2 py-0.5 text-2xs font-medium">{SHORT[e] ?? e}</span>)}
            {c.config.min_severity && <span className="rounded-full border px-2 py-0.5 text-2xs text-muted-foreground">{SEVERITY[c.config.min_severity] ?? c.config.min_severity}</span>}
          </>
        )}
      </div>

      <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        {lastSent ? <span title={formatEst(lastSent, { year: true })}>Last sent {relativeTime(lastSent)}</span> : <span>Nothing sent yet</span>}
        {c.last_tested_at && <span title={formatEst(c.last_tested_at, { year: true })}>Tested {relativeTime(c.last_tested_at)}</span>}
        {(pending > 0 || failed > 0) && (
          <span className={cn('font-medium', failed > 0 ? 'text-destructive' : 'text-foreground/80')} data-testid="connection-outbox">
            {pending > 0 && `${pending} pending`}{pending > 0 && failed > 0 && ', '}{failed > 0 && `${failed} failed`} {pending + failed === 1 ? 'delivery' : 'deliveries'}
          </span>
        )}
      </p>
      {c.status === 'error' && (c.last_error ?? lastFailure) && <p className="text-xs text-destructive" role="status">{c.last_error ?? lastFailure}</p>}
    </li>
  );
}

/** Where the agent sends things (any chat tool, email, a webhook, n8n or any API) and how other systems reach it. Super Admin only. */
export function ConnectionsTab() {
  const list = useAgentConnections();
  const outbox = useOutbox();
  const pulse = useTeamPulse();
  const test = useTestConnection();
  const del = useDeleteConnection();
  const toast = useAgentToast();
  const [dialog, setDialog] = useState<{ open: boolean; editing: AgentConnection | null }>({ open: false, editing: null });
  const [testingId, setTestingId] = useState<string | null>(null);
  const byConnection = useMemo(() => {
    const m = new Map<string, OutboxRow[]>();
    for (const o of outbox.data ?? []) m.set(o.connection_id, [...(m.get(o.connection_id) ?? []), o]);
    return m;
  }, [outbox.data]);

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
  // Only warn when a connection asks for automatic sending AND the database says the sender cannot run. A failed pulse call shows nothing.
  const cannotDispatch = pulse.data?.dispatch_ready === false && rows.some((c) => (c.config.events?.length ?? 0) > 0);
  return (
    <div className="space-y-4" data-testid="agent-connections">
      {cannotDispatch && (
        <div className="flex items-start gap-3 rounded-xl border border-warning/40 bg-warning/10 p-3.5 text-sm" role="alert" data-testid="dispatch-warning">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
          <p>Automatic sending cannot run yet: the database is missing the shared secret that wakes the sender. The Inbox will also show a System item with the exact steps.</p>
        </div>
      )}
      <Section
        title="Send to other tools"
        description="Connect a tool once and choose what the agent sends to it by itself. A connection only sends data out."
        footer={<Button size="sm" className="mx-4 mb-4 sm:mx-5 sm:mb-5" onClick={() => setDialog({ open: true, editing: null })} data-testid="connection-add"><Plus className="mr-2 h-3.5 w-3.5" /> Add a connection</Button>}
      >
        {list.isLoading ? <Skeleton className="h-24 w-full" /> : list.isError ? (
          <p className="text-sm text-destructive" role="alert">Connections could not be loaded: {list.error.message}</p>
        ) : rows.length === 0 ? (
          <EmptyState
            icon={Plug} compact title="No connections yet"
            description="Connect Slack, Teams, Telegram, email, Airtable, Notion or any tool with an API. Each one comes with a short how-to and can be tested with one click."
          />
        ) : (
          <ul className="space-y-2.5" data-testid="connection-list">
            {rows.map((c) => (
              <Card
                key={c.id} c={c} outbox={byConnection.get(c.id) ?? []} testing={testingId === c.id}
                onTest={() => runTest(c.id)} onEdit={() => setDialog({ open: true, editing: c })} onDelete={() => remove(c)}
              />
            ))}
          </ul>
        )}
      </Section>

      <ApiKeysCard />

      <ConnectionDialog
        open={dialog.open} editing={dialog.editing}
        onOpenChange={(open) => setDialog((d) => ({ ...d, open }))}
        onSaved={(_id, wasNew) => toast.saved(wasNew ? 'Connection added. Press Send test to try it.' : 'Connection updated')}
      />
    </div>
  );
}
