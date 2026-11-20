import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adb } from '@/features/ops-agent/agentDb';
import { queryKeys } from './keys';
import { invokeAgent } from './useOpsAgent';
import { useSupabaseQuery } from './useSupabaseQuery';

/**
 * "When a new entry is added to this table, send it to another tool." A rule points a table at one of the connections made in
 * Agent, Connections. The backend does the sending; these hooks only read and change the rules. Every write here is started
 * by a button click (Save, switch, Delete, Send test), never by a render or a mount.
 */
const K = queryKeys.tableConnections;

export interface TableConnection {
  id: string;
  table_id: string;
  connection_id: string;
  name: string;
  enabled: boolean;
  /** The message. Null or empty means "send every answer". */
  template: string | null;
  /** Cliq API connections only: overrides the channel's unique name. */
  channel: string | null;
  tag_person: boolean;
  cc_manager: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  last_sent_at: string | null;
}

/** What a person can set on a rule. */
export interface TableConnectionInput {
  connection_id: string;
  name: string;
  template: string | null;
  channel: string | null;
  tag_person: boolean;
  cc_manager: boolean;
}

/** One delivery made for a rule (a row of agent_outbox with kind 'record'). */
export interface RecordDelivery {
  id: string;
  rule_id: string;
  status: 'pending' | 'sent' | 'failed';
  attempts: number;
  error: string | null;
  created_at: string;
  sent_at: string | null;
}

/** How many recent deliveries are kept per rule. */
export const DELIVERIES_PER_RULE = 5;

const COLUMNS = 'id, table_id, connection_id, name, enabled, template, channel, tag_person, cc_manager, created_by, created_at, updated_at, last_sent_at';

export function useTableConnections(tableId: string, enabled = true) {
  return useSupabaseQuery<TableConnection[]>(
    K.list(tableId),
    () => adb.from('tm_table_connections').select(COLUMNS).eq('table_id', tableId).order('created_at') as never,
    { enabled: enabled && !!tableId },
  );
}

/** The latest few deliveries per rule, newest first. If the table cannot be read the answer is an empty map. */
export function useTableConnectionOutbox(tableId: string, ruleIds: string[], enabled = true) {
  const ids = [...ruleIds].sort();
  return useQuery<Record<string, RecordDelivery[]>, Error>({
    queryKey: [...K.outbox(tableId), ids],
    enabled: enabled && ids.length > 0,
    retry: false,
    staleTime: 10_000,
    refetchInterval: 30_000,
    queryFn: async () => {
      const { data, error } = await adb
        .from('agent_outbox')
        .select('id, rule_id, status, attempts, error, created_at, sent_at')
        .eq('kind', 'record')
        .in('rule_id', ids)
        .order('created_at', { ascending: false })
        .limit(DELIVERIES_PER_RULE * ids.length * 4);
      if (error) return {};
      return groupDeliveries((data ?? []) as RecordDelivery[]);
    },
  });
}

/** Newest first, at most DELIVERIES_PER_RULE per rule. */
export function groupDeliveries(rows: RecordDelivery[]): Record<string, RecordDelivery[]> {
  const out: Record<string, RecordDelivery[]> = {};
  const sorted = [...rows].sort((a, b) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0));
  for (const r of sorted) {
    if (!r.rule_id) continue;
    const list = (out[r.rule_id] ??= []);
    if (list.length < DELIVERIES_PER_RULE) list.push(r);
  }
  return out;
}

function useRefresh(tableId: string) {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: K.list(tableId) });
    qc.invalidateQueries({ queryKey: K.outbox(tableId) });
  };
}

export function useCreateTableConnection(tableId: string, createdBy: string | null) {
  const refresh = useRefresh(tableId);
  return useMutation<void, Error, TableConnectionInput>({
    mutationFn: async (input) => {
      const { error } = await adb.from('tm_table_connections').insert({ table_id: tableId, enabled: true, created_by: createdBy, ...input });
      if (error) throw new Error(error.message);
    },
    onSuccess: refresh,
  });
}

export function useUpdateTableConnection(tableId: string) {
  const refresh = useRefresh(tableId);
  return useMutation<void, Error, { id: string; patch: Partial<TableConnectionInput> }>({
    mutationFn: async ({ id, patch }) => {
      const { error } = await adb.from('tm_table_connections').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id);
      if (error) throw new Error(error.message);
    },
    onSuccess: refresh,
  });
}

/** The Enabled switch. Only called when the person flips it. */
export function useToggleTableConnection(tableId: string) {
  const qc = useQueryClient();
  const refresh = useRefresh(tableId);
  return useMutation<void, Error, { id: string; enabled: boolean }>({
    mutationFn: async ({ id, enabled }) => {
      const { error } = await adb.from('tm_table_connections').update({ enabled, updated_at: new Date().toISOString() }).eq('id', id);
      if (error) throw new Error(error.message);
    },
    // Flip the switch straight away; a failure puts it back.
    onMutate: async ({ id, enabled }) => {
      await qc.cancelQueries({ queryKey: K.list(tableId) });
      const before = qc.getQueryData<TableConnection[]>(K.list(tableId));
      if (before) qc.setQueryData<TableConnection[]>(K.list(tableId), before.map((c) => (c.id === id ? { ...c, enabled } : c)));
      return { before };
    },
    onError: (_e, _v, ctx) => {
      const before = (ctx as { before?: TableConnection[] } | undefined)?.before;
      if (before) qc.setQueryData(K.list(tableId), before);
    },
    onSettled: refresh,
  });
}

export function useDeleteTableConnection(tableId: string) {
  const refresh = useRefresh(tableId);
  return useMutation<void, Error, string>({
    mutationFn: async (id) => {
      const { error } = await adb.from('tm_table_connections').delete().eq('id', id);
      if (error) throw new Error(error.message);
    },
    onSuccess: refresh,
  });
}

/** Sends the table's most recent entry, marked as a test, through one rule. */
export function useTestTableConnection(tableId: string) {
  const refresh = useRefresh(tableId);
  return useMutation<{ ok: boolean; error?: string }, Error, string>({
    mutationFn: (ruleId) => invokeAgent('agent-connections', { action: 'record_test', rule_id: ruleId }),
    onSettled: refresh,
  });
}
