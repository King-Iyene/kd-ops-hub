import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useAgentAudit, useAgentPeople, useDomainCount, useSeedDomains } from '@/queries/useOpsAgent';
import { formatEst } from '../time';
import { Section, Stat, SummaryStrip } from './shared';
import { useAgentToast } from './useAgentToast';

/** The site list the rules use to tell approved sites from distractions. Seeded from Track's productivity rules on demand. */
export function DomainsCard({ readOnly }: { readOnly: boolean }) {
  const count = useDomainCount();
  const seed = useSeedDomains();
  const toast = useAgentToast();
  return (
    <>
      <SummaryStrip aria-label="Sites summary">
        <Stat label="Site list" value={<span data-testid="domain-count">{count.isLoading ? 'Loading…' : count.isError ? 'Not available' : `${count.data ?? 0} sites on the list`}</span>} />
      </SummaryStrip>
      <Section title="Approved and unproductive sites" description="Only the site name is ever used; page addresses and window titles are never read.">
        {!readOnly ? (
          <div className="flex flex-wrap items-center gap-3">
            <Button
              size="sm" variant="outline" disabled={seed.isPending}
              onClick={() => seed.mutate(undefined, { onSuccess: (n) => toast.saved(n === 0 ? 'Nothing new to add' : `Added ${n} sites from Track's productivity rules`), onError: toast.failed })}
            >
              {seed.isPending && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}Add sites from Track&apos;s rules
            </Button>
            <span className="text-xs text-muted-foreground">Adds only sites that are not on the list yet.</span>
          </div>
        ) : <p className="text-sm text-muted-foreground">A Super Admin manages this list.</p>}
      </Section>
    </>
  );
}

/** Every change made in these settings, newest first: who, what and which values. A Super Admin sees all; an Admin sees their own. */
export function AuditCard() {
  const audit = useAgentAudit();
  const people = useAgentPeople();
  const names = new Map((people.data ?? []).map((p) => [p.id, p.full_name ?? 'Unnamed']));
  return (
    <Section title="Recent changes" description="Newest first. Times are Eastern.">
      {audit.isLoading ? <Skeleton className="h-24 w-full" /> : audit.isError ? (
        <p className="text-sm text-destructive" role="alert">The change log could not be loaded: {audit.error.message}. Refresh the page to try again.</p>
      ) : (audit.data ?? []).length === 0 ? <p className="text-sm text-muted-foreground">No changes yet. Edits to these settings appear here.</p> : (
        <ul className="-my-2 divide-y" data-testid="agent-audit">
          {audit.data!.map((r) => (
            <li key={r.id} className="grid gap-x-4 gap-y-0.5 py-3 text-sm sm:grid-cols-[10.5rem_1fr]">
              <time dateTime={r.at} className="text-xs tabular-nums text-muted-foreground sm:pt-0.5">{formatEst(r.at)}</time>
              <div className="min-w-0">
                <p><span className="font-medium">{r.actor_id ? names.get(r.actor_id) ?? 'Someone' : 'System'}</span> <span className="text-muted-foreground">{r.action}{r.entity_type ? ` · ${r.entity_type}` : ''}</span></p>
                {Object.keys(r.detail ?? {}).length > 0 && (
                  <p className="truncate font-mono text-xs text-muted-foreground" title={JSON.stringify(r.detail)}>{JSON.stringify(r.detail)}</p>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}
