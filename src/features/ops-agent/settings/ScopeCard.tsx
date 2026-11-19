import { Lock } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { useCompanies } from '@/queries/useCompanies';
import { useAgentModules, useCompanyScope, useSetCompanyScope, useSetModuleAccess } from '@/queries/useOpsAgent';
import { Section, Stat, SummaryStrip } from './shared';
import { useAgentToast } from './useAgentToast';

/** Which companies the agent covers and which parts of KD Ops it may read. Sensitive modules are locked off. */
export function ScopeCard({ readOnly }: { readOnly: boolean }) {
  const companies = useCompanies();
  const scope = useCompanyScope();
  const modules = useAgentModules();
  const setCompany = useSetCompanyScope();
  const setModule = useSetModuleAccess();
  const toast = useAgentToast();
  const on = new Map((scope.data ?? []).map((s) => [s.company_id, s.enabled]));

  const covered = (companies.data ?? []).filter((c) => on.get(c.id)).length;
  const modulesOn = (modules.data ?? []).filter((m) => m.enabled).length;

  return (
    <>
      <SummaryStrip aria-label="Coverage summary">
        <Stat label="Companies covered" value={<>{covered} <span className="text-sm font-normal text-muted-foreground">of {(companies.data ?? []).length}</span></>} />
        <Stat label="Modules on" value={<>{modulesOn} <span className="text-sm font-normal text-muted-foreground">of {(modules.data ?? []).length}</span></>} />
      </SummaryStrip>

      <Section title="Companies" description="Anything switched off here is invisible to the agent and to every Admin's Inbox.">
        {companies.isLoading || scope.isLoading ? <Skeleton className="h-16 w-full" /> : (
          <ul className="-my-2 divide-y">
            {(companies.data ?? []).map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-4 py-3">
                <span className="text-sm font-medium">{c.name}</span>
                <Switch checked={on.get(c.id) ?? false} disabled={readOnly || setCompany.isPending} aria-label={`Cover ${c.name}`}
                  onCheckedChange={(enabled) => setCompany.mutate({ company_id: c.id, enabled }, { onSuccess: () => toast.saved(`${c.name} ${enabled ? 'covered' : 'not covered'}`), onError: toast.failed })} />
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Modules" description="The parts of KD Ops the agent may read. Sensitive modules stay locked off.">
        {modules.isLoading ? <Skeleton className="h-32 w-full" /> : modules.isError ? (
          <p className="text-sm text-destructive" role="alert">Modules could not be loaded: {modules.error.message}. Refresh the page to try again.</p>
        ) : (
          <ul className="-my-2 divide-y">
            {(modules.data ?? []).map((m) => (
              <li key={m.key} className="flex items-center justify-between gap-4 py-3" data-testid={`module-${m.key}`}>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2 text-sm font-medium">{m.label}{m.sensitive && <Badge variant="outline" className="gap-1"><Lock className="h-3 w-3" /> Sensitive, locked off</Badge>}</div>
                  <p className="text-xs text-muted-foreground">{m.description}</p>
                </div>
                <Switch checked={m.enabled} disabled={readOnly || m.sensitive || setModule.isPending} aria-label={`Allow ${m.label}`}
                  onCheckedChange={(enabled) => setModule.mutate({ module_key: m.key, enabled }, { onSuccess: () => toast.saved(`${m.label} ${enabled ? 'on' : 'off'}`), onError: toast.failed })} />
              </li>
            ))}
          </ul>
        )}
      </Section>
    </>
  );
}
