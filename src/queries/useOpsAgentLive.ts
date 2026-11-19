// Live monitoring hooks for the Ops Agent: the team pulse, realtime flags and the KD Squares team list.
// Kept apart from useOpsAgent.ts. Everything here only reads; nothing writes on mount.
import { useEffect, useMemo, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { adb } from '@/features/ops-agent/agentDb';
import type { LiveFlag, TeamPulse } from '@/features/ops-agent/liveTypes';
import { expectedReporters } from '@/features/task-module/table/reporters';
import { queryKeys } from './keys';
import { useSupabaseQuery } from './useSupabaseQuery';

const K = queryKeys.opsAgent;

/**
 * The numbers at the top of the Inbox. The database function may not be deployed yet, so an error is not thrown at the
 * screen: `data` stays undefined and the tiles hide.
 */
export function useTeamPulse() {
  return useQuery<TeamPulse | null, Error>({
    queryKey: [...K.all, 'team-pulse'],
    retry: false,
    staleTime: 15_000,
    refetchInterval: 30_000,
    queryFn: async () => {
      const { data, error } = await adb.rpc('agent_team_pulse');
      if (error || !data) return null;
      return data as TeamPulse;
    },
  });
}

export interface CheckNowResult { created: number; resolved: number; errors: number }

/** Runs the monitor right now (`agent_check_now`), then refreshes the Inbox and the pulse. Only runs when a button is pressed. */
export function useCheckNow() {
  const qc = useQueryClient();
  return useMutation<CheckNowResult, Error, void>({
    mutationFn: async () => {
      const { data, error } = await adb.rpc('agent_check_now');
      if (error) throw new Error(error.message);
      const r = (data ?? {}) as Partial<CheckNowResult>;
      return { created: r.created ?? 0, resolved: r.resolved ?? 0, errors: r.errors ?? 0 };
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: K.flags() });
      qc.invalidateQueries({ queryKey: [...K.all, 'team-pulse'] });
    },
  });
}

/**
 * Watches the agent_flags table. Any change refreshes the Inbox list and the pulse; a NEW open high or critical flag
 * calls `onUrgent` (the page shows a toast). The channel is removed when the page closes.
 */
export function useAgentFlagsRealtime(onUrgent?: (flag: LiveFlag) => void) {
  const qc = useQueryClient();
  const cb = useRef(onUrgent);
  cb.current = onUrgent;
  const announced = useRef(new Set<string>());
  useEffect(() => {
    const channel = supabase
      .channel('agent-flags-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'agent_flags' }, (payload: { eventType?: string; new?: Partial<LiveFlag>; old?: Partial<LiveFlag> }) => {
        qc.invalidateQueries({ queryKey: K.flags() });
        qc.invalidateQueries({ queryKey: [...K.all, 'team-pulse'] });
        const row = payload?.new;
        const urgent = !!row && row.status === 'open' && (row.severity === 'high' || row.severity === 'critical');
        if (!urgent || !row) return;
        // New means just inserted, or reopened from another status. An update to a flag that was already open (the
        // rules refresh last_seen_at every run) is not new. The old row is only there when the table sends it.
        const isNew = payload.eventType === 'INSERT' || (payload.eventType === 'UPDATE' && !!payload.old?.status && payload.old.status !== 'open');
        if (isNew && !(row.id && announced.current.has(`${row.id}:${row.status}:${payload.eventType}:${row.last_seen_at}`))) {
          if (row.id) announced.current.add(`${row.id}:${row.status}:${payload.eventType}:${row.last_seen_at}`);
          cb.current?.(row as LiveFlag);
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [qc]);
}

export interface KdPerson { id: string; full_name: string; job_title: string | null; role: string | null; pay_group_id: string | null; photo_url?: string | null; email?: string | null }

/**
 * The KD Squares team the agent watches: active people whose pay group belongs to the company named like "KD Squares",
 * leaving out Field Agents. Loaded the same way the Task module's daily report list is.
 */
export function useKdTeam(enabled = true) {
  const profiles = useSupabaseQuery<KdPerson[]>([...K.all, 'kd-profiles'], () =>
    supabase.from('profiles').select('id, full_name, job_title, role, pay_group_id, photo_url, email').eq('is_anonymised', false).eq('status', 'active').order('full_name').limit(1000) as never,
    { enabled, staleTime: 60_000 });
  const groups = useSupabaseQuery<{ id: string; company_id: string | null }[]>([...K.all, 'kd-pay-groups'], () =>
    supabase.from('pay_groups').select('id, company_id').limit(500) as never, { enabled, staleTime: 60_000 });
  const companies = useSupabaseQuery<{ id: string; name: string }[]>([...K.all, 'kd-companies'], () =>
    supabase.from('companies').select('id, name').limit(50) as never, { enabled, staleTime: 60_000 });
  const team = useMemo(
    () => expectedReporters(profiles.data ?? [], groups.data ?? [], companies.data ?? []),
    [profiles.data, groups.data, companies.data],
  );
  const error = profiles.error ?? groups.error ?? companies.error ?? null;
  return { team, isLoading: profiles.isLoading || groups.isLoading || companies.isLoading, error };
}
