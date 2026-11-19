import { Lock } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { useCompanies } from '@/queries/useCompanies';
import { useAgentModules, useCompanyScope, useSetCompanyScope, useSetModuleAccess } from '@/queries/useOpsAgent';
import { Section } from './shared';
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

  return (
    <Section title="What the agent covers" description="Companies and modules it may look at. Anything switched off here is invisible to the agent and to every Admin's Inbox.">
      <div className="space-y-2">
        <p className="text-sm font-medium">Companies</p>
        {companies.isLoading || scope.isLoading ? <Skeleton className="h-16 w-full" /> : (companies.data ?? []).map((c) => (
          <div key={c.id} className="flex items-center justify-between rounded-lg border p-3">
            <span className="text-sm">{c.name}</span>
            <Switch checked={on.get(c.id) ?? false} disabled={readOnly || setCompany.isPending} aria-label={`Cover ${c.name}`}
              onCheckedChange={(enabled) => setCompany.mutate({ company_id: c.id, enabled }, { onSuccess: () => toast.saved(`${c.name} ${enabled ? 'covered' : 'not covered'}`), onError: toast.failed })} />
          </div>
        ))}
      </div>
      <div className="space-y-2">
        <p className="text-sm font-medium">Modules</p>
        {modules.isLoading ? <Skeleton className="h-32 w-full" /> : modules.isError ? (
          <p className="text-sm text-destructive" role="alert">Modules could not be loaded: {modules.error.message}</p>
        ) : (modules.data ?? []).map((m) => (
          <div key={m.key} className="flex items-center justify-between gap-4 rounded-lg border p-3" data-testid={`module-${m.key}`}>
            <div>
              <div className="flex items-center gap-2 text-sm font-medium">{m.label}{m.sensitive && <Badge variant="outline" className="gap-1 text-xs"><Lock className="h-3 w-3" /> Sensitive, locked off</Badge>}</div>
              <p className="text-xs text-muted-foreground">{m.description}</p>
            </div>
            <Switch checked={m.enabled} disabled={readOnly || m.sensitive || setModule.isPending} aria-label={`Allow ${m.label}`}
              onCheckedChange={(enabled) => setModule.mutate({ module_key: m.key, enabled }, { onSuccess: () => toast.saved(`${m.label} ${enabled ? 'on' : 'off'}`), onError: toast.failed })} />
          </div>
        ))}
      </div>
    </Section>
  );
}
