import { useQueryClient } from '@tanstack/react-query';
import { useSupabaseMutation, useSupabaseQuery } from '@/queries/useSupabaseQuery';
import { cdb, type CliqConnection, type CrewAgent, type CrewAgentPrivate, type CrewIdea, type CrewMistake, type CrewSettings, type CrewKnowledge, type CrewMessage, type CrewNote, type CrewOrder, type CrewProposal, type CrewRun, type ProposalStatus } from './crewDb';

/** Every hook here only reads on mount. A write happens from a button, never from a render. */
const KEY = ['crew'] as const;
const k = {
  agents: () => [...KEY, 'agents'] as const,
  priv: () => [...KEY, 'private'] as const,
  proposals: (s: string) => [...KEY, 'proposals', s] as const,
  messages: () => [...KEY, 'messages'] as const,
  orders: () => [...KEY, 'orders'] as const,
  notes: (id: string) => [...KEY, 'notes', id] as const,
  knowledge: () => [...KEY, 'knowledge'] as const,
  runs: (id: string) => [...KEY, 'runs', id] as const,
};

export function useCrewAgents() {
  return useSupabaseQuery<CrewAgent[]>(k.agents(), () => cdb.from('crew_agents').select('*').eq('active', true).order('department').order('name') as never, { staleTime: 15_000, refetchInterval: 30_000 });
}

export function useCrewPrivate() {
  return useSupabaseQuery<CrewAgentPrivate[]>(k.priv(), () => cdb.from('crew_agent_private').select('agent_id, persona, instructions, notes, model, advisor_model, allowed_actions, max_pending, max_runs_per_day') as never, { staleTime: 60_000 });
}

const GROUPS: Record<string, ProposalStatus[]> = {
  waiting: ['pending'],
  carry_out: ['approved'],
  history: ['executed', 'rejected', 'failed', 'expired', 'withdrawn'],
};

export function useCrewProposals(group: keyof typeof GROUPS) {
  return useSupabaseQuery<CrewProposal[]>(
    k.proposals(group),
    () => cdb.from('crew_proposals').select('*').in('status', GROUPS[group]).order('created_at', { ascending: group !== 'history' }).limit(group === 'history' ? 100 : 200) as never,
    { staleTime: 10_000, refetchInterval: 20_000 },
  );
}

export function useCrewMessages() {
  return useSupabaseQuery<CrewMessage[]>(k.messages(), () => cdb.from('crew_messages').select('*').or('to_owner.eq.true,from_agent.is.null').order('created_at', { ascending: false }).limit(150) as never, { staleTime: 10_000, refetchInterval: 20_000 });
}

export function useCrewOrders() {
  return useSupabaseQuery<CrewOrder[]>(k.orders(), () => cdb.from('crew_orders').select('*').order('created_at', { ascending: false }).limit(100) as never, { staleTime: 10_000, refetchInterval: 30_000 });
}

export function useCrewNotes(agentId: string | null) {
  return useSupabaseQuery<CrewNote[]>(k.notes(agentId ?? ''), () => cdb.from('crew_notes').select('*').eq('agent_id', agentId!).eq('status', 'active').order('created_at', { ascending: false }).limit(100) as never, { enabled: !!agentId, staleTime: 30_000 });
}

export function useCrewRuns(agentId: string | null) {
  return useSupabaseQuery<CrewRun[]>(k.runs(agentId ?? ''), () => cdb.from('crew_runs').select('id, agent_id, kind, started_at, finished_at, ok, summary').eq('agent_id', agentId!).order('started_at', { ascending: false }).limit(10) as never, { enabled: !!agentId, staleTime: 30_000 });
}

export function useCrewKnowledge() {
  return useSupabaseQuery<CrewKnowledge[]>(k.knowledge(), () => cdb.from('crew_knowledge').select('*').order('topic') as never, { staleTime: 30_000 });
}

function useRefresh() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: KEY });
}

export function useDecideProposal() {
  const refresh = useRefresh();
  return useSupabaseMutation<{ status: string; error?: string | null; result?: Record<string, unknown> }, { id: string; decision: 'approve' | 'reject'; note?: string }>(
    (v) => cdb.rpc('crew_decide', { p_proposal: v.id, p_decision: v.decision, p_note: v.note?.trim() ? v.note.trim() : null }) as never,
    { onSuccess: refresh },
  );
}

export function useMarkDone() {
  const refresh = useRefresh();
  return useSupabaseMutation<null, { id: string; note?: string }>((v) => cdb.rpc('crew_mark_done', { p_proposal: v.id, p_note: v.note?.trim() ? v.note.trim() : null }) as never, { onSuccess: refresh });
}

export function useSay() {
  const refresh = useRefresh();
  return useSupabaseMutation<string, { agentId: string; body: string }>((v) => cdb.rpc('crew_say', { p_agent: v.agentId, p_body: v.body.trim() }) as never, { onSuccess: refresh });
}

export function useMarkRead() {
  const refresh = useRefresh();
  return useSupabaseMutation<null, string[]>((ids) => cdb.rpc('crew_mark_read', { p_ids: ids }) as never, { onSuccess: refresh });
}

export function useGiveOrder() {
  const refresh = useRefresh();
  return useSupabaseMutation<string, { agentId: string; text: string }>((v) => cdb.rpc('crew_give_order', { p_agent: v.agentId, p_text: v.text.trim() }) as never, { onSuccess: refresh });
}

export function useResolveOrder() {
  const refresh = useRefresh();
  return useSupabaseMutation<null, { id: string; resolution: 'veto' | 'insist' | 'accept_challenge'; note?: string }>(
    (v) => cdb.rpc('crew_resolve_order', { p_order: v.id, p_resolution: v.resolution, p_note: v.note?.trim() ? v.note.trim() : null }) as never,
    { onSuccess: refresh },
  );
}

export function useRetireNote() {
  const refresh = useRefresh();
  return useSupabaseMutation<null, string>((id) => cdb.rpc('crew_retire_note', { p_note: id }) as never, { onSuccess: refresh });
}

export function useSetKnowledge() {
  const refresh = useRefresh();
  return useSupabaseMutation<null, { topic: string; body: string }>((v) => cdb.rpc('crew_set_knowledge', { p_topic: v.topic, p_body: v.body }) as never, { onSuccess: refresh });
}

export function useIssueToken() {
  return useSupabaseMutation<string, { slug: string; label: string }>((v) => cdb.rpc('crew_issue_token', { p_slug: v.slug, p_label: v.label }) as never);
}

export function useRevokeTokens() {
  return useSupabaseMutation<number, string>((slug) => cdb.rpc('crew_revoke_tokens', { p_slug: slug }) as never);
}

export function useCrewIdeas() {
  return useSupabaseQuery<CrewIdea[]>([...KEY, 'ideas'], () => cdb.from('crew_ideas').select('*').neq('status', 'merged').order('support_count', { ascending: false }).order('created_at', { ascending: false }).limit(200) as never, { staleTime: 15_000, refetchInterval: 30_000 });
}

export function useDecideIdea() {
  const refresh = useRefresh();
  return useSupabaseMutation<null, { id: string; decision: 'approve' | 'reject' | 'building' | 'shipped'; note?: string }>(
    (v) => cdb.rpc('crew_idea_decide', { p_idea: v.id, p_decision: v.decision, p_note: v.note?.trim() ? v.note.trim() : null }) as never,
    { onSuccess: refresh },
  );
}

export function useAddIdea() {
  const refresh = useRefresh();
  return useSupabaseMutation<string, { title: string; problem: string; proposal: string }>(
    (v) => cdb.rpc('crew_idea_owner_add', { p_title: v.title.trim(), p_problem: v.problem.trim(), p_proposal: v.proposal.trim() }) as never,
    { onSuccess: refresh },
  );
}

export function useCrewSettings() {
  return useSupabaseQuery<CrewSettings>([...KEY, 'settings'], () => cdb.from('crew_settings').select('*').eq('id', true).single() as never, { staleTime: 30_000 });
}

export function useCliqConnections() {
  return useSupabaseQuery<CliqConnection[]>([...KEY, 'cliq-connections'], () => cdb.from('agent_connections').select('id, name, kind, config').eq('kind', 'cliq').order('name') as never, { staleTime: 60_000 });
}

export function useSaveCrewSettings() {
  const refresh = useRefresh();
  return useSupabaseMutation<null, { enabled: boolean; connection: string | null; profile: string | null; kinds: string[] }>(
    (v) => cdb.rpc('crew_save_settings', { p_enabled: v.enabled, p_connection: v.connection, p_profile: v.profile, p_kinds: v.kinds }) as never,
    { onSuccess: refresh },
  );
}

export function useSetOfficeViewers() {
  const refresh = useRefresh();
  return useSupabaseMutation<string[], string[]>((ids) => cdb.rpc('crew_set_office_viewers', { p_ids: ids }) as never, { onSuccess: refresh });
}

/** The owner's inbox, polled; shared with the Messages tab through the same query key. `enabled` is false for everyone but the owner (no queries are made). */
export function useCrewInbox(enabled: boolean) {
  return useSupabaseQuery<CrewMessage[]>(k.messages(), () => cdb.from('crew_messages').select('*').or('to_owner.eq.true,from_agent.is.null').order('created_at', { ascending: false }).limit(150) as never, { enabled, staleTime: 10_000, refetchInterval: 20_000 });
}

/** What is waiting on the owner: messages from the executives he has not read, and proposals to decide. */
export function useCrewAttention(enabled: boolean) {
  const inbox = useCrewInbox(enabled);
  const waiting = useSupabaseQuery<CrewProposal[]>(k.proposals('waiting'), () => cdb.from('crew_proposals').select('*').in('status', GROUPS.waiting).order('created_at', { ascending: true }).limit(200) as never, { enabled, staleTime: 10_000, refetchInterval: 20_000 });
  const unread = (inbox.data ?? []).filter((m) => m.to_owner && !m.read_at && m.from_agent !== null);
  const waitingCount = (waiting.data ?? []).length;
  return { unread, unreadCount: unread.length, waitingCount, total: unread.length + waitingCount };

export function useCrewMistakes(agentId: string | null) {
  return useSupabaseQuery<CrewMistake[]>([...KEY, 'mistakes', agentId ?? ''], () => cdb.from('crew_mistakes').select('*').eq('agent_id', agentId!).order('created_at', { ascending: false }).limit(20) as never, { enabled: !!agentId, staleTime: 20_000 });
}

export function useLogMistake() {
  const refresh = useRefresh();
  return useSupabaseMutation<string, { agentId: string; kind: string; note: string }>((v) => cdb.rpc('crew_log_mistake', { p_target: v.agentId, p_kind: v.kind, p_note: v.note.trim() }) as never, { onSuccess: refresh });
}

export function useRetireAgent() {
  const refresh = useRefresh();
  return useSupabaseMutation<{ retired: string }, { agentId: string; reason: string }>((v) => cdb.rpc('crew_retire_agent', { p_agent: v.agentId, p_reason: v.reason.trim() }) as never, { onSuccess: refresh });
}
