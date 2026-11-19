import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useAgentAudit, useAgentPeople, useDomainCount, useSeedDomains } from '@/queries/useOpsAgent';
import { Section } from './shared';
import { useAgentToast } from './useAgentToast';

/** The site list the rules use to tell approved sites from distractions. Seeded from Track's productivity rules on demand. */
export function DomainsCard({ readOnly }: { readOnly: boolean }) {
  const count = useDomainCount();
  const seed = useSeedDomains();
  const toast = useAgentToast();
  return (
    <Section title="Sites and apps" description="Approved and unproductive sites. Only the site name is ever used; page addresses and window titles are never read.">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm" data-testid="domain-count">{count.isLoading ? 'Loading…' : `${count.data ?? 0} sites on the list`}</span>
        {!readOnly && (
          <Button size="sm" variant="outline" disabled={seed.isPending}
            onClick={() => seed.mutate(undefined, { onSuccess: (n) => toast.saved(n === 0 ? 'Nothing new to add' : `Added ${n} sites from Track's productivity rules`), onError: toast.failed })}>
            {seed.isPending && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}Add sites from Track's rules
          </Button>
        )}
      </div>
    </Section>
  );
}

/** Every change made in these settings, newest first: who, what and which values. A Super Admin sees all; an Admin sees their own. */
export function AuditCard() {
  const audit = useAgentAudit();
  const people = useAgentPeople();
  const names = new Map((people.data ?? []).map((p) => [p.id, p.full_name ?? 'Unnamed']));
  return (
    <Section title="Change log" description="Who changed what in the agent, and when.">
      {audit.isLoading ? <Skeleton className="h-24 w-full" /> : audit.isError ? (
        <p className="text-sm text-destructive" role="alert">The change log could not be loaded: {audit.error.message}</p>
      ) : (audit.data ?? []).length === 0 ? <p className="text-sm text-muted-foreground">No changes yet.</p> : (
        <ul className="max-h-80 space-y-1 overflow-y-auto pr-1" data-testid="agent-audit">
          {audit.data!.map((r) => (
            <li key={r.id} className="text-xs">
              <span className="text-muted-foreground">{new Date(r.at).toLocaleString()}</span>{' '}
              <span className="font-medium">{r.actor_id ? names.get(r.actor_id) ?? 'Someone' : 'System'}</span>{' '}
              {r.action}{r.entity_type ? ` · ${r.entity_type}` : ''}
              {Object.keys(r.detail ?? {}).length > 0 && (
                <span className="block truncate text-muted-foreground" title={JSON.stringify(r.detail)}>{JSON.stringify(r.detail)}</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}
