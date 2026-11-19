// Ops Agent v4 hooks: the flag detail sheet, drafted messages, the site list questions, Monitoring rules and Summaries.
// Reads happen on mount; every write happens only from a button press or a changed field, never from a render.
import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/store/authStore';
import { adb, type AgentIdentity, type AgentRule } from '@/features/ops-agent/agentDb';
import type { FlagDetail, SendFlagInput, SendFlagResult, SiteVerdictResult } from '@/features/ops-agent/detailTypes';
import { cleanDomain, type SiteCategory } from '@/features/ops-agent/liveTypes';
import { queryKeys } from './keys';
import { invokeAgent, useAgentPeople } from './useOpsAgent';
import { useSupabaseMutation, useSupabaseQuery } from './useSupabaseQuery';

const K = queryKeys.opsAgent;

/** Everything about one Inbox item (`agent_flag_detail`). Only runs while a card is open. */
export function useFlagDetail(flagId: string | null) {
  return useQuery<FlagDetail, Error>({
    queryKey: K.flagDetail(flagId ?? 'none'),
    enabled: !!flagId,
    retry: false,
    staleTime: 10_000,
    queryFn: async () => {
      const { data, error } = await adb.rpc('agent_flag_detail', { p_flag: flagId });
      if (error || !data) throw new Error(error?.message ?? 'No detail came back');
      return data as FlagDetail;
    },
  });
}

/** Refreshes the Inbox, the pulse, and the detail of one item (or every open detail). */
export function useRefreshAgent() {
  const qc = useQueryClient();
  return (flagId?: string) => {
    qc.invalidateQueries({ queryKey: K.flags() });
    qc.invalidateQueries({ queryKey: K.pulse() });
    qc.invalidateQueries({ queryKey: flagId ? K.flagDetail(flagId) : [...K.all, 'flag-detail'] });
  };
}

/** Sends the (edited) drafted message. The server decides the real recipient; no address is ever sent from here. */
export function useSendFlagMessage() {
  const refresh = useRefreshAgent();
  return useMutation<SendFlagResult, Error, SendFlagInput>({
    mutationFn: (v) => invokeAgent('agent-connections', { action: 'send_flag', ...v }),
    onSuccess: (r, v) => { if (r?.ok) refresh(v.flag_id); },
  });
}

/** Puts a site on the approved or unproductive list. Only runs from a button. */
export function useSetDomain() {
  const refresh = useRefreshAgent();
  return useSupabaseMutation<unknown, { domain: string; category: Exclude<SiteCategory, 'unknown'>; flagId?: string }>(
    (v) => adb.rpc('agent_domain_set', { p_domain: v.domain, p_category: v.category }),
    { onSuccess: () => { refresh(); } },
  );
}

/**
 * Asks Claude about up to six sites the database could not place. Failures are silent (the database hint stays), and
 * the answer is cached for the session so reopening the sheet does not ask again.
 */
export function useClassifySites(domains: string[]) {
  const list = [...new Set(domains.map(cleanDomain).filter(Boolean))].slice(0, 6).sort();
  return useQuery<SiteVerdictResult[], Error>({
    queryKey: K.classifySites(list),
    enabled: list.length > 0,
    retry: false,
    staleTime: Infinity,
    gcTime: 60 * 60_000,
    queryFn: async () => {
      try {
        const r = await invokeAgent<{ ok: boolean; results?: SiteVerdictResult[] }>('agent-ai', { action: 'classify_sites', domains: list });
        return r?.ok && Array.isArray(r.results) ? r.results : [];
      } catch { return []; }
    },
  });
}

// ── Monitoring rules ───────────────────────────────────────────────────────
export function useAgentRules(enabled = true) {
  return useSupabaseQuery<AgentRule[]>(
    K.rules(),
    () => adb.from('agent_rules').select('code, module_key, title, description, enabled, severity, params, status, status_note').order('code') as never,
    { enabled, staleTime: 30_000 },
  );
}

/** Switches a rule on or off, or changes its numbers. The audit log records it automatically. */
export function useUpdateRule() {
  const qc = useQueryClient();
  const uid = useAuthStore((s) => s.profile?.id);
  return useSupabaseMutation<unknown, { code: string; patch: Partial<Pick<AgentRule, 'enabled' | 'params'>> }>(
    (v) => adb.from('agent_rules').update({ ...v.patch, updated_by: uid ?? null }).eq('code', v.code).select('code'),
    { onSuccess: () => { qc.invalidateQueries({ queryKey: K.rules() }); qc.invalidateQueries({ queryKey: K.audit() }); } },
  );
}

// ── Summaries ──────────────────────────────────────────────────────────────
export type SummaryKind = 'day' | 'week' | 'month';

/** "Generate now": makes the latest finished period of that kind. */
export function useGenerateSummary() {
  const qc = useQueryClient();
  return useSupabaseMutation<unknown, SummaryKind>(
    (kind) => adb.rpc('agent_generate_summary', { p_kind: kind }),
    { onSuccess: () => { qc.invalidateQueries({ queryKey: K.summaries() }); } },
  );
}

// ── People ─────────────────────────────────────────────────────────────────
export interface DirectoryPerson { id: string; name: string; photo: string | null; jobTitle: string | null }

/** Active people by id, with their profile photo, so a card can show who it is about. */
export function usePeopleDirectory() {
  const people = useAgentPeople();
  return useMemo(
    () => new Map((people.data ?? []).map((p) => [p.id, { id: p.id, name: p.full_name ?? 'Unknown', photo: p.photo_url ?? null, jobTitle: p.job_title ?? null } as DirectoryPerson])),
    [people.data],
  );
}

// ── How people are tagged in Cliq and Slack ────────────────────────────────
/** The saved Cliq and Slack ids, read once with the people list. */
export function useIdentityMap(enabled = true) {
  return useSupabaseQuery<AgentIdentity[]>(K.identities(), () => adb.from('agent_identity_map').select('person_id, cliq_user_id, slack_user_id, email, matched_by') as never, { enabled, staleTime: 60_000 });
}

/** Saves one person's ids. Only runs from that row's Save button. The email column is left as it is. */
export function useSaveIdentity() {
  const qc = useQueryClient();
  return useSupabaseMutation<unknown, { person_id: string; cliq_user_id: string | null; slack_user_id: string | null }>(
    (v) => adb.from('agent_identity_map').upsert({ ...v, matched_by: 'manual' }, { onConflict: 'person_id' }).select('person_id'),
    { onSuccess: () => { qc.invalidateQueries({ queryKey: K.identities() }); qc.invalidateQueries({ queryKey: K.audit() }); } },
  );
}
