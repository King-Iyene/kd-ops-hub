import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import { queryKeys } from './keys';
import { useSupabaseMutation, useSupabaseQuery } from './useSupabaseQuery';
import {
  adb,
  type AgentAdminScope, type AgentAuditRow, type AgentBudget, type AgentCompanyScope, type AgentConnection, type AgentFlag,
  type AgentMemory, type AgentModule, type AgentPersonProfile, type AgentScope, type AgentSettings, type AgentSummary,
  type AgentUsageRow, type AiStatus, type AiTestResult,
} from '@/features/ops-agent/agentDb';

/** Every hook here only reads on mount. Writes happen from a button or a changed field, never from a render. */
const K = queryKeys.opsAgent;

// ── Who am I to the agent ──────────────────────────────────────────────────
export function useAgentScope() {
  return useSupabaseQuery<AgentScope>(K.scope(), () => adb.rpc('agent_my_scope'), { staleTime: 60_000 });
}

// ── Settings ───────────────────────────────────────────────────────────────
export function useAgentSettings(enabled = true) {
  return useSupabaseQuery<AgentSettings>(K.settings(), () => adb.from('agent_settings').select('*').eq('id', true).single(), { enabled, staleTime: 30_000 });
}

/** Saves only the fields that changed. `patch` is expected to hold changed fields only. */
export function useUpdateAgentSettings() {
  const qc = useQueryClient();
  const uid = useAuthStore((s) => s.profile?.id);
  return useSupabaseMutation<AgentSettings, Partial<AgentSettings>>(
    (patch) => adb.from('agent_settings').update({ ...patch, updated_by: uid ?? null }).eq('id', true).select().single(),
    { onSuccess: (row) => { qc.setQueryData(K.settings(), row); qc.invalidateQueries({ queryKey: K.budget() }); qc.invalidateQueries({ queryKey: K.audit() }); } },
  );
}

export function useCompanyScope(enabled = true) {
  return useSupabaseQuery<AgentCompanyScope[]>(K.companyScope(), () => adb.from('agent_company_scope').select('company_id, enabled') as never, { enabled });
}

export function useSetCompanyScope() {
  const qc = useQueryClient();
  const uid = useAuthStore((s) => s.profile?.id);
  return useSupabaseMutation<AgentCompanyScope[], { company_id: string; enabled: boolean }>(
    (v) => adb.from('agent_company_scope').upsert({ ...v, updated_by: uid ?? null }, { onConflict: 'company_id' }).select('company_id, enabled') as never,
    { onSuccess: () => { qc.invalidateQueries({ queryKey: K.companyScope() }); qc.invalidateQueries({ queryKey: K.audit() }); } },
  );
}

export function useAgentModules(enabled = true) {
  return useSupabaseQuery<AgentModule[]>(
    K.modules(),
    async () => {
      const [cat, acc] = await Promise.all([
        adb.from('agent_module_catalog').select('key, label, description, sensitive, sort_order').order('sort_order'),
        adb.from('agent_module_access').select('module_key, enabled'),
      ]);
      if (cat.error) return { data: null, error: cat.error } as never;
      if (acc.error) return { data: null, error: acc.error } as never;
      const on = new Map((acc.data ?? []).map((r: { module_key: string; enabled: boolean }) => [r.module_key, r.enabled]));
      const rows = (cat.data ?? []).map((m: Omit<AgentModule, 'enabled'>) => ({ ...m, enabled: on.get(m.key) ?? false }));
      return { data: rows, error: null } as never;
    },
    { enabled },
  );
}

export function useSetModuleAccess() {
  const qc = useQueryClient();
  const uid = useAuthStore((s) => s.profile?.id);
  return useSupabaseMutation<unknown, { module_key: string; enabled: boolean }>(
    (v) => adb.from('agent_module_access').upsert({ ...v, updated_by: uid ?? null }, { onConflict: 'module_key' }).select(),
    { onSuccess: () => { qc.invalidateQueries({ queryKey: K.modules() }); qc.invalidateQueries({ queryKey: K.audit() }); } },
  );
}

// ── People ─────────────────────────────────────────────────────────────────
export interface AgentPerson { id: string; full_name: string | null; role: string | null; job_title: string | null; pay_group_id: string | null; reporting_manager_id: string | null }

export function useAgentPeople(enabled = true) {
  return useSupabaseQuery<AgentPerson[]>(
    K.people(),
    () => supabase.from('profiles').select('id, full_name, role, job_title, pay_group_id, reporting_manager_id').eq('status', 'active').order('full_name') as never,
    { enabled, staleTime: 60_000 },
  );
}

export function usePersonProfiles(enabled = true) {
  return useSupabaseQuery<AgentPersonProfile[]>(K.profiles(), () => adb.from('agent_person_profile').select('*') as never, { enabled });
}

export function useSavePersonProfile() {
  const qc = useQueryClient();
  const uid = useAuthStore((s) => s.profile?.id);
  return useSupabaseMutation<unknown, Partial<AgentPersonProfile> & { person_id: string }>(
    (v) => adb.from('agent_person_profile').upsert({ ...v, updated_by: uid ?? null }, { onConflict: 'person_id' }).select(),
    { onSuccess: () => { qc.invalidateQueries({ queryKey: K.profiles() }); qc.invalidateQueries({ queryKey: K.audit() }); } },
  );
}

export interface SuggestResult { written: number; kept_manual: number; skipped_no_company: number }
export function useSuggestProfiles() {
  const qc = useQueryClient();
  return useSupabaseMutation<SuggestResult, void>(
    () => adb.rpc('agent_suggest_person_profiles'),
    { onSuccess: () => { qc.invalidateQueries({ queryKey: K.profiles() }); qc.invalidateQueries({ queryKey: K.audit() }); } },
  );
}

export function useAdminScopes(enabled = true) {
  return useSupabaseQuery<AgentAdminScope[]>(K.adminScopes(), () => adb.from('agent_admin_scope').select('admin_id, company_ids, module_keys') as never, { enabled });
}

export function useSaveAdminScope() {
  const qc = useQueryClient();
  const uid = useAuthStore((s) => s.profile?.id);
  return useSupabaseMutation<unknown, AgentAdminScope>(
    (v) => adb.from('agent_admin_scope').upsert({ ...v, updated_by: uid ?? null }, { onConflict: 'admin_id' }).select(),
    { onSuccess: () => { qc.invalidateQueries({ queryKey: K.adminScopes() }); qc.invalidateQueries({ queryKey: K.audit() }); } },
  );
}

export function useDeleteAdminScope() {
  const qc = useQueryClient();
  return useSupabaseMutation<unknown, string>(
    (adminId) => adb.from('agent_admin_scope').delete().eq('admin_id', adminId).select(),
    { onSuccess: () => { qc.invalidateQueries({ queryKey: K.adminScopes() }); qc.invalidateQueries({ queryKey: K.audit() }); } },
  );
}

export function useReportTables(enabled = true) {
  return useSupabaseQuery<{ id: string; name: string }[]>(K.reportTables(), () => supabase.from('tm_tables').select('id, name').order('name') as never, { enabled });
}

// ── AI: budget, usage, status, test ────────────────────────────────────────
export function useAiBudget() {
  return useSupabaseQuery<AgentBudget>(K.budget(), () => adb.rpc('agent_ai_budget_state'), { staleTime: 30_000 });
}

export function useAiUsage(enabled = true) {
  return useSupabaseQuery<AgentUsageRow[]>(
    K.usage(),
    () => adb.from('agent_ai_usage').select('id, created_at, feature, model, input_tokens, output_tokens, cost_usd, ok, error').order('created_at', { ascending: false }).limit(25),
    { enabled },
  );
}

/** Whether the Claude key is set. Asks the edge function, which is the only place that can see the secret. */
export function useAiStatus() {
  return useQuery<AiStatus | null, Error>({
    queryKey: K.aiStatus(),
    staleTime: 30_000,
    retry: false,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('agent-ai', { body: { action: 'status' } });
      if (error) return null; // function not deployed yet or unreachable: the screen says "unknown"
      return data as AiStatus;
    },
  });
}

export function useAiTest() {
  const qc = useQueryClient();
  return useMutation<AiTestResult, Error, 'fast' | 'smart'>({
    mutationFn: async (alias) => {
      const { data, error } = await supabase.functions.invoke('agent-ai', { body: { action: 'test', alias } });
      if (error) return { ok: false, reason: 'unreachable', error: error.message } as AiTestResult;
      return data as AiTestResult;
    },
    onSettled: () => { qc.invalidateQueries({ queryKey: K.budget() }); qc.invalidateQueries({ queryKey: K.usage() }); qc.invalidateQueries({ queryKey: K.aiStatus() }); },
  });
}

// ── Domains ────────────────────────────────────────────────────────────────
export function useDomainCount(enabled = true) {
  return useQuery<number, Error>({
    queryKey: K.domains(),
    enabled,
    queryFn: async () => {
      const { count, error } = await adb.from('agent_domain_list').select('id', { count: 'exact', head: true });
      if (error) throw new Error(error.message);
      return count ?? 0;
    },
  });
}

export function useSeedDomains() {
  const qc = useQueryClient();
  return useSupabaseMutation<number, void>(() => adb.rpc('agent_seed_domains'), {
    onSuccess: () => { qc.invalidateQueries({ queryKey: K.domains() }); qc.invalidateQueries({ queryKey: K.audit() }); },
  });
}

// ── Audit ──────────────────────────────────────────────────────────────────
export function useAgentAudit(enabled = true) {
  return useSupabaseQuery<AgentAuditRow[]>(K.audit(), () => adb.from('agent_audit_log').select('*').order('at', { ascending: false }).limit(60), { enabled });
}

// ── The six tabs' lists (read only in Phase 1) ─────────────────────────────
export function useAgentFlags() {
  return useSupabaseQuery<AgentFlag[]>(
    K.flags(),
    () => adb.from('agent_flags').select('*').in('status', ['open', 'snoozed']).order('last_seen_at', { ascending: false }).limit(200),
    { refetchInterval: 60_000 },
  );
}
export function useAgentSummaries() {
  return useSupabaseQuery<AgentSummary[]>(K.summaries(), () => adb.from('agent_summaries').select('id, period_kind, period_start, period_end, company_id, narrative, auto, created_at').order('created_at', { ascending: false }).limit(50));
}
export function useAgentMemory() {
  return useSupabaseQuery<AgentMemory[]>(K.memory(), () => adb.from('agent_memory').select('id, type, content, scope, scope_ref, source, status, created_at').neq('status', 'archived').order('created_at', { ascending: false }).limit(100));
}
export function useAgentConnections(enabled = true) {
  return useSupabaseQuery<AgentConnection[]>(K.connections(), () => adb.from('agent_connections').select('id, kind, name, status, last_error, last_tested_at').order('created_at'), { enabled });
}
