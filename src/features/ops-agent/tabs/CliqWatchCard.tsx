import { Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { useCliqWatchCheck, useCliqWatchStatus, useSetCliqWatch } from '@/queries/useOpsAgent';
import { useToast } from '@/hooks/use-toast';
import { formatEst } from '../time';

const when = (iso: string | null) => (iso ? formatEst(iso) : 'not yet');

/**
 * The Cliq watch for one Zoho Cliq connection: every 2 working hours the agent reads the channels the connected Zoho user can see, remembers the
 * messages that tag someone, and puts the ones with no reply after 2 working hours in the Inbox. Replies are sent by hand, in the same thread.
 */
export function CliqWatchCard({ connectionId, authorized }: { connectionId: string; authorized: boolean }) {
  const status = useCliqWatchStatus();
  const setWatch = useSetCliqWatch();
  const check = useCliqWatchCheck();
  const { toast } = useToast();
  const mine = (Array.isArray(status.data) ? status.data : []).find((s) => s.connection_id === connectionId);
  const on = !!mine?.enabled;

  const toggle = (enabled: boolean) => setWatch.mutate({ id: connectionId, enabled }, {
    onSuccess: () => toast({ title: enabled ? 'Cliq watch is on' : 'Cliq watch is off', description: enabled ? 'It starts from now. The first read is within the next 2 working hours, or press Check now.' : undefined }),
    onError: (e) => toast({ title: 'Could not change it', description: e.message, variant: 'destructive' }),
  });
  const runCheck = () => check.mutate(connectionId, {
    onSuccess: (r) => toast(r.ok
      ? { title: 'Cliq read', description: `${r.channels ?? 0} channels, ${r.scanned ?? 0} messages, ${r.tracked ?? 0} new tagged, ${r.answered ?? 0} answered.${r.error ? ` ${r.error}` : ''}` }
      : { title: 'Could not read Cliq', description: r.error ?? 'Try again in a moment.', variant: 'destructive' }),
    onError: (e) => toast({ title: 'Could not read Cliq', description: e.message, variant: 'destructive' }),
  });

  return (
    <section aria-label="Cliq watch" className="space-y-2.5 rounded-xl border p-3.5" data-testid="cliq-watch">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold">Watch Cliq for messages nobody answered</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Every 2 working hours (9 to 5, Monday to Friday, Eastern) the agent reads every channel this Zoho account can see. When someone is tagged and does not reply
            (in the thread or the channel) within 2 working hours, it appears in the Inbox. Sending the drafted message posts it in that thread and tags them.
          </p>
        </div>
        <Switch checked={on} disabled={!authorized || setWatch.isPending} onCheckedChange={toggle} aria-label="Watch Cliq" data-testid="cliq-watch-switch" />
      </div>
      {!authorized && <p className="text-xs text-amber-600 dark:text-amber-400" data-testid="cliq-watch-needs-zoho">Press "Connect to Zoho" (or "Reconnect to Zoho") first, and allow the read permissions.</p>}
      {on && (
        <div className="space-y-1.5 text-xs" data-testid="cliq-watch-status">
          <p>Last read: {when(mine?.last_ok_at ?? null)}. {mine ? `${mine.waiting} waiting for an answer, ${mine.answered_7d} answered in the last 7 days.` : ''}</p>
          {mine?.stats?.channels !== undefined && <p className="text-muted-foreground">{mine.stats.channels} channels, {mine.stats.scanned_messages ?? 0} messages read, {mine.stats.new_tagged ?? 0} new tagged messages.</p>}
          {mine?.last_error && <p className="text-destructive" role="alert" data-testid="cliq-watch-error">{mine.last_error}</p>}
          <Button type="button" size="sm" variant="outline" onClick={runCheck} disabled={check.isPending} data-testid="cliq-watch-check">
            {check.isPending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <RefreshCw className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />} Check now
          </Button>
        </div>
      )}
    </section>
  );
}
