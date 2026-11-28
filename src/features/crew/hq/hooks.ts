// Crew HQ's own queries. They live here (not in useCrew.ts) so this screen adds nothing to the shared hooks; every key starts with 'crew', so the
// existing mutations (which invalidate ['crew']) refresh them too. Nothing polls faster than the hooks it sits beside.
import { useMemo } from 'react';
import { useSupabaseQuery } from '@/queries/useSupabaseQuery';
import { cdb, type CrewNote, type CrewRun } from '../crewDb';
import type { WakeRow } from './logic';
import { latestRunByAgent } from './logic';

const KEY = ['crew'] as const;

/**
 * The wake queue: the owner may read it (policy crew_wake_queue_owner). If it cannot be read (the table is missing or the policy refuses), the
 * query errors and callers fall back to each agent's own status, which is why `data` is optional there.
 */
export function useWakeQueue() {
  return useSupabaseQuery<WakeRow[]>([...KEY, 'wake-queue'], () => cdb.from('crew_wake_queue').select('id, agent_id, status, created_at, fired_at, error').order('created_at', { ascending: false }).limit(80) as never, { staleTime: 10_000, refetchInterval: 20_000, retry: 1 });
}

/** The latest runs of every agent in one query (rather than one per agent): used for "last run" on the team pulse. */
export function useLatestRuns() {
  const q = useSupabaseQuery<Pick<CrewRun, 'agent_id' | 'started_at' | 'ok' | 'summary'>[]>([...KEY, 'runs-latest'], () => cdb.from('crew_runs').select('agent_id, started_at, ok, summary').order('started_at', { ascending: false }).limit(120) as never, { staleTime: 30_000, refetchInterval: 60_000 });
  const byAgent = useMemo(() => latestRunByAgent(q.data ?? []), [q.data]);
  return { ...q, byAgent };
}

/** Notes the agents wrote in the last 7 days (the weekly "what they learned" digest). */
export function useWeeklyNotes() {
  return useSupabaseQuery<CrewNote[]>([...KEY, 'notes-week'], () => {
    const since = new Date(Date.now() - 7 * 24 * 3600_000).toISOString();
    return cdb.from('crew_notes').select('*').eq('status', 'active').gte('created_at', since).order('created_at', { ascending: false }).limit(300) as never;
  }, { staleTime: 60_000 });
}

export interface SelfReview { agent_id: string; status: string; created_at: string; fired_at: string | null }
/** When each agent last had its weekly self-review woken (the wake reason starts with "WEEKLY SELF-REVIEW"). */
export function useSelfReviews() {
  return useSupabaseQuery<SelfReview[]>([...KEY, 'self-reviews'], () => cdb.from('crew_wake_queue').select('agent_id, status, created_at, fired_at').like('reason', 'WEEKLY SELF-REVIEW%').order('created_at', { ascending: false }).limit(40) as never, { staleTime: 5 * 60_000 });
}

export interface AgentAccess { agent_id: string; allowed_sources: string[] | null; allowed_read_bases: string[]; allowed_write_bases: string[]; scorecard: Record<string, unknown> | null }
/** What each agent may read (`allowed_sources` are the named app data sources; bases are the older record tables). Owner only. */
export function useAgentAccess() {
  return useSupabaseQuery<AgentAccess[]>([...KEY, 'agent-access'], () => cdb.from('crew_agent_private').select('agent_id, allowed_sources, allowed_read_bases, allowed_write_bases, scorecard') as never, { staleTime: 60_000, retry: 1 });
}
