import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { useCompanies } from '@/queries/useCompanies';
import { useAdminScopes, useAgentModules, useAgentPeople, useDeleteAdminScope, useSaveAdminScope } from '@/queries/useOpsAgent';
import type { AgentAdminScope } from '../agentDb';
import { Section } from './shared';
import { useAgentToast } from './useAgentToast';

type Pick = { companies: string[] | null; modules: string[] | null };

/** Admins see everything the agent covers unless a Super Admin narrows them here. Null means "all". */
function AdminRow({ admin, saved, companies, modules }: {
  admin: { id: string; full_name: string | null }; saved: AgentAdminScope | undefined;
  companies: { id: string; name: string }[]; modules: { key: string; label: string }[];
}) {
  const initial: Pick = { companies: saved?.company_ids ?? null, modules: saved?.module_keys ?? null };
  const [draft, setDraft] = useState<Pick>(initial);
  const save = useSaveAdminScope();
  const reset = useDeleteAdminScope();
  const toast = useAgentToast();
  const dirty = JSON.stringify(draft) !== JSON.stringify(initial);

  const toggleAll = (k: keyof Pick, all: string[], limited: boolean) => setDraft((d) => ({ ...d, [k]: limited ? [...all] : null }));
  const toggleOne = (k: keyof Pick, id: string) => setDraft((d) => {
    const cur = d[k] ?? [];
    return { ...d, [k]: cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id] };
  });

  const block = (k: keyof Pick, title: string, items: { id: string; label: string }[]) => (
    <div className="space-y-1.5">
      <label className="flex items-center gap-2 text-sm font-medium">
        <Checkbox checked={draft[k] === null} onCheckedChange={(c) => toggleAll(k, items.map((i) => i.id), c !== true)} />
        All {title}
      </label>
      {draft[k] !== null && (
        <div className="ml-6 space-y-1">
          {items.map((i) => (
            <label key={i.id} className="flex items-center gap-2 text-sm">
              <Checkbox checked={(draft[k] ?? []).includes(i.id)} onCheckedChange={() => toggleOne(k, i.id)} /> {i.label}
            </label>
          ))}
          {(draft[k] ?? []).length === 0 && <p className="text-xs text-amber-600">None selected: this Admin will see nothing in {title}.</p>}
        </div>
      )}
    </div>
  );

  return (
    <li className="space-y-3 rounded-lg border p-3" data-testid="agent-admin-scope">
      <p className="text-sm font-medium">{admin.full_name ?? 'Unnamed'}</p>
      <div className="grid gap-4 sm:grid-cols-2">
        {block('companies', 'companies', companies.map((c) => ({ id: c.id, label: c.name })))}
        {block('modules', 'modules', modules.map((m) => ({ id: m.key, label: m.label })))}
      </div>
      {dirty && (
        <div className="flex gap-2">
          <Button size="sm" disabled={save.isPending}
            onClick={() => save.mutate({ admin_id: admin.id, company_ids: draft.companies, module_keys: draft.modules }, { onSuccess: () => toast.saved(`${admin.full_name ?? 'Admin'} scope saved`), onError: toast.failed })}>
            {save.isPending && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}Save
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setDraft(initial)}>Discard</Button>
        </div>
      )}
      {!dirty && saved && (
        <Button size="sm" variant="ghost" disabled={reset.isPending}
          onClick={() => reset.mutate(admin.id, { onSuccess: () => { setDraft({ companies: null, modules: null }); toast.saved('Back to everything covered'); }, onError: toast.failed })}>
          Remove limits
        </Button>
      )}
    </li>
  );
}

export function AdminScopeCard() {
  const people = useAgentPeople();
  const scopes = useAdminScopes();
  const companies = useCompanies();
  const modules = useAgentModules();
  const admins = (people.data ?? []).filter((p) => p.role === 'admin');
  const byAdmin = new Map((scopes.data ?? []).map((s) => [s.admin_id, s]));
  const safeModules = (modules.data ?? []).filter((m) => !m.sensitive);

  return (
    <Section title="Admin access" description="Super Admins see everything. Each Admin sees all covered companies and modules unless you limit them here.">
      {people.isLoading || scopes.isLoading || companies.isLoading || modules.isLoading ? <Skeleton className="h-24 w-full" /> : admins.length === 0 ? (
        <p className="text-sm text-muted-foreground">There are no Admins to limit.</p>
      ) : (
        <ul className="space-y-3">
          {admins.map((a) => <AdminRow key={`${a.id}:${JSON.stringify(byAdmin.get(a.id) ?? null)}`} admin={a} saved={byAdmin.get(a.id)} companies={companies.data ?? []} modules={safeModules} />)}
        </ul>
      )}
    </Section>
  );
}
