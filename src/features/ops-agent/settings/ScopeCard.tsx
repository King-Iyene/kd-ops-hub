import { ShieldCheck } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { confirm } from '@/hooks/use-confirm';
import { useCompanies } from '@/queries/useCompanies';
import { useAgentModules, useCompanyScope, useSetCompanyScope, useSetModuleAccess } from '@/queries/useOpsAgent';
import { Section, Stat, SummaryStrip } from './shared';
import { useAgentToast } from './useAgentToast';

/** Which companies the agent covers and which parts of KD Ops it may watch. A Super Admin may switch any module on, sensitive ones after a confirmation. */
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

      <Section title="Modules" description="The parts of KD Ops the agent may watch. Every module can be switched on.">
        {modules.isLoading ? <Skeleton className="h-32 w-full" /> : modules.isError ? (
          <p className="text-sm text-destructive" role="alert">Modules could not be loaded: {modules.error.message}. Refresh the page to try again.</p>
        ) : (
          <>
          <p className="rounded-lg border bg-muted/40 p-3 text-xs leading-relaxed text-muted-foreground" data-testid="sensitive-note">
            <ShieldCheck className="mr-1.5 inline h-3.5 w-3.5 align-text-bottom" aria-hidden="true" />
            The agent only counts things here, for example how many loan requests are waiting. It never shows names, amounts, bank details or documents.
          </p>
          <ul className="-my-2 divide-y">
            {(modules.data ?? []).map((m) => (
              <li key={m.key} className="flex items-center justify-between gap-4 py-3" data-testid={`module-${m.key}`}>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2 text-sm font-medium">{m.label}{m.sensitive && <Badge variant="outline" className="gap-1"><ShieldCheck className="h-3 w-3" /> Sensitive, counts only</Badge>}</div>
                  <p className="text-xs text-muted-foreground">{m.description}</p>
                </div>
                <Switch checked={m.enabled} disabled={readOnly || setModule.isPending} aria-label={`Allow ${m.label}`}
                  onCheckedChange={async (enabled) => {
                    // A sensitive module is switched on only after a plain confirmation of what the agent will and will not do.
                    if (enabled && m.sensitive && !(await confirm({
                      title: `Switch on ${m.label}?`,
                      description: 'The agent only counts things here, for example how many loan requests are waiting. It never shows names, amounts, bank details or documents.',
                      confirmLabel: 'Switch on',
                    }))) return;
                    setModule.mutate({ module_key: m.key, enabled }, { onSuccess: () => toast.saved(`${m.label} ${enabled ? 'on' : 'off'}`), onError: toast.failed });
                  }} />
              </li>
            ))}
          </ul>
          </>
        )}
      </Section>
    </>
  );
}
