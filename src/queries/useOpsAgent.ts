import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import { queryKeys } from './keys';
import { useSupabaseMutation, useSupabaseQuery } from './useSupabaseQuery';
import {
  adb,
  type AgentAdminScope, type AgentAuditRow, type AgentBudget, type AgentCompanyScope, type AgentConnection, type AgentFlag,
  type AgentModule, type AgentPersonProfile, type AgentScope, type AgentSettings, type AgentSummary,
  type AgentUsageRow, type AiStatus, type AiTestResult, type AgentApiKey, type ChatMessage, type ChatReply, type ChatThread,
  type KeyResult, type OutboxRow, type SaveConnectionInput,
} from '@/features/ops-agent/agentDb';
import { zohoOAuthUrls } from '@/features/ops-agent/zohoOAuth';

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
export interface AgentPerson { id: string; full_name: string | null; role: string | null; job_title: string | null; pay_group_id: string | null; reporting_manager_id: string | null; photo_url?: string | null }

export function useAgentPeople(enabled = true) {
  return useSupabaseQuery<AgentPerson[]>(
    K.people(),
    () => supabase.from('profiles').select('id, full_name, role, job_title, pay_group_id, reporting_manager_id, photo_url').eq('status', 'active').order('full_name') as never,
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
    { onSuccess: () => {
      qc.invalidateQueries({ queryKey: K.profiles() }); qc.invalidateQueries({ queryKey: K.audit() });
      // the dashboard tiles (Reports in ... of ...) depend on exemptions and groups: refresh them at once
      qc.invalidateQueries({ queryKey: [...K.all, 'team-pulse'] });
    } },
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
  return useSupabaseQuery<AgentSummary[]>(K.summaries(), () => adb.from('agent_summaries').select('id, period_kind, period_start, period_end, company_id, narrative, auto, created_at, metrics').order('period_end', { ascending: false }).order('created_at', { ascending: false }).limit(200));
}
export function useAgentConnections(enabled = true) {
  return useSupabaseQuery<AgentConnection[]>(K.connections(), () => adb.from('agent_connections').select('id, kind, name, status, config, vault_secret_names, last_error, last_tested_at').order('created_at') as never, { enabled });
}

/** Recent deliveries to connections. If the table cannot be read (not deployed yet, or no access) the answer is an empty list. */
export function useOutbox(enabled = true) {
  return useQuery<OutboxRow[], Error>({
    queryKey: K.outbox(),
    enabled,
    retry: false,
    staleTime: 15_000,
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await adb.from('agent_outbox').select('id, connection_id, kind, ref_id, status, attempts, error, created_at, sent_at').order('created_at', { ascending: false }).limit(300);
      return error ? [] : ((data ?? []) as OutboxRow[]);
    },
  });
}

/**
 * Calls an agent edge function. Expected refusals come back as { ok: false, ... } (HTTP 200); anything else is thrown
 * with the function's own message when it has one.
 */
export async function invokeAgent<T>(fn: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke(fn, { body });
  if (error) {
    let message = error.message;
    try { const ctx = (error as { context?: Response }).context; if (ctx) { const j = await ctx.json(); message = j?.message ?? j?.error ?? message; } } catch { /* keep the generic message */ }
    throw new Error(message === 'forbidden' ? 'You do not have access to this.' : message);
  }
  return data as T;
}

export function useSaveConnection() {
  const qc = useQueryClient();
  return useMutation<{ ok: boolean; id?: string; error?: string }, Error, SaveConnectionInput>({
    mutationFn: (input) => invokeAgent('agent-connections', { action: 'save', ...input }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: K.connections() }); qc.invalidateQueries({ queryKey: K.audit() }); },
  });
}
/** Sends a test message through a saved connection. `tag_me` also tags the person pressing the button (Cliq and Slack). */
export function useTestConnection() {
  const qc = useQueryClient();
  return useMutation<{ ok: boolean; error?: string }, Error, string | { id: string; tag_me?: boolean }>({
    mutationFn: (v) => invokeAgent('agent-connections', { action: 'test', ...(typeof v === 'string' ? { id: v } : v) }),
    onSettled: () => { qc.invalidateQueries({ queryKey: K.connections() }); },
  });
}
/** Result of asking the server for Zoho's consent address. */
export interface ZohoStartResult { ok: boolean; url?: string; error?: string }
/** Result of handing Zoho's one-time code back to the server. */
export interface ZohoFinishResult { ok: boolean; id?: string; error?: string }

/** The two addresses for Zoho's API console and whether the site address is known yet. Same values on the dialog and the callback page. */
export function useZohoOAuthUrls() {
  const settings = useAgentSettings();
  return { ...zohoOAuthUrls(settings.data?.app_url), ready: !settings.isLoading };
}
/** Step 1 of the Zoho sign-in: the server returns the Zoho consent address to send the browser to. */
export function useZohoOAuthStart() {
  return useMutation<ZohoStartResult, Error, { id: string; redirect_uri: string }>({
    mutationFn: (v) => invokeAgent('agent-connections', { action: 'oauth_start', ...v }),
  });
}
/** Step 2: Zoho sent the person back with a one-time code. The code works once, so call this once per code. */
export function useZohoOAuthFinish() {
  const qc = useQueryClient();
  return useMutation<ZohoFinishResult, Error, { code: string; state: string; redirect_uri: string; accounts_server?: string }>({
    mutationFn: (v) => invokeAgent('agent-connections', { action: 'oauth_finish', ...v }),
    onSettled: () => { qc.invalidateQueries({ queryKey: K.connections() }); qc.invalidateQueries({ queryKey: K.audit() }); },
  });
}
export function useDeleteConnection() {
  const qc = useQueryClient();
  return useMutation<{ ok: boolean }, Error, string>({
    mutationFn: (id) => invokeAgent('agent-connections', { action: 'delete', id }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: K.connections() }); qc.invalidateQueries({ queryKey: K.audit() }); },
  });
}

// ── Inbound API keys ───────────────────────────────────────────────────────
export function useApiKeys(enabled = true) {
  return useSupabaseQuery<AgentApiKey[]>(
    K.apiKeys(),
    () => adb.from('agent_api_keys').select('id, name, key_prefix, scopes, rate_limit_per_min, created_at, last_used_at, revoked_at').order('created_at', { ascending: false }) as never,
    { enabled },
  );
}
/** The plain key is in the result once. It cannot be read again. */
export function useCreateApiKey() {
  const qc = useQueryClient();
  return useSupabaseMutation<{ id: string; key: string; prefix: string }, { name: string; scopes: string[] }>(
    (v) => adb.rpc('agent_api_key_create', { p_name: v.name, p_scopes: v.scopes }),
    { onSuccess: () => { qc.invalidateQueries({ queryKey: K.apiKeys() }); qc.invalidateQueries({ queryKey: K.audit() }); } },
  );
}
export function useRevokeApiKey() {
  const qc = useQueryClient();
  return useSupabaseMutation<unknown, string>(
    (id) => adb.from('agent_api_keys').update({ revoked_at: new Date().toISOString() }).eq('id', id).select('id'),
    { onSuccess: () => { qc.invalidateQueries({ queryKey: K.apiKeys() }); qc.invalidateQueries({ queryKey: K.audit() }); } },
  );
}

// ── The Claude key (write only) ────────────────────────────────────────────
export function useSetClaudeKey() {
  const qc = useQueryClient();
  return useMutation<KeyResult, Error, string>({
    mutationFn: (key) => invokeAgent('agent-ai', { action: 'set_key', key }),
    onSuccess: (r) => { if (r.ok) { qc.invalidateQueries({ queryKey: K.aiStatus() }); qc.invalidateQueries({ queryKey: K.audit() }); } },
  });
}
export function useClearClaudeKey() {
  const qc = useQueryClient();
  return useMutation<KeyResult, Error, void>({
    mutationFn: () => invokeAgent('agent-ai', { action: 'clear_key' }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: K.aiStatus() }); qc.invalidateQueries({ queryKey: K.audit() }); },
  });
}

// ── Chat ───────────────────────────────────────────────────────────────────
export function useChatThreads() {
  return useSupabaseQuery<ChatThread[]>(K.chatThreads(), () => adb.from('agent_chat_threads').select('id, title, updated_at').eq('archived', false).order('updated_at', { ascending: false }).limit(50));
}
export function useChatMessages(threadId: string | null) {
  return useSupabaseQuery<ChatMessage[]>(
    K.chatMessages(threadId ?? 'none'),
    () => adb.from('agent_chat_messages').select('id, thread_id, role, content, tool_calls, created_at').eq('thread_id', threadId).in('role', ['user', 'assistant']).order('created_at') as never,
    { enabled: !!threadId },
  );
}
export function useSendChat() {
  const qc = useQueryClient();
  return useMutation<ChatReply, Error, { message: string; thread_id?: string | null }>({
    mutationFn: (v) => invokeAgent('agent-chat', { message: v.message, ...(v.thread_id ? { thread_id: v.thread_id } : {}) }),
    onSettled: (r, _e, v) => {
      qc.invalidateQueries({ queryKey: K.chatThreads() });
      const id = r?.thread_id ?? v.thread_id;
      if (id) qc.invalidateQueries({ queryKey: K.chatMessages(id) });
      qc.invalidateQueries({ queryKey: K.flags() }); // a "human action" request lands in the Inbox
      qc.invalidateQueries({ queryKey: K.budget() });
    },
  });
}
export function useDeleteChatThread() {
  const qc = useQueryClient();
  return useSupabaseMutation<unknown, string>(
    (id) => adb.from('agent_chat_threads').delete().eq('id', id).select('id'),
    { onSuccess: () => { qc.invalidateQueries({ queryKey: K.chatThreads() }); } },
  );
}

// ── Inbox actions ──────────────────────────────────────────────────────────
export function useFlagAction() {
  const qc = useQueryClient();
  return useSupabaseMutation<unknown, { id: string; status: 'open' | 'snoozed' | 'handled' | 'dismissed'; note?: string; until?: string }>(
    (v) => adb.rpc('agent_flag_set_status', { p_id: v.id, p_status: v.status, p_note: v.note ?? null, p_snooze_until: v.until ?? null }),
    { onSuccess: () => { qc.invalidateQueries({ queryKey: K.flags() }); } },
  );
}
