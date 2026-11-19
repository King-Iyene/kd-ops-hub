// What the agent remembers: the list, the "Remember this?" suggestions chat attaches to an answer, and the changes a Super Admin makes.
// Reads on mount; every write happens only from a button press.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/store/authStore';
import { adb, type AgentMemory, type MemoryScope, type MemoryStatus, type MemoryType } from '@/features/ops-agent/agentDb';
import { queryKeys } from './keys';
import { useSupabaseMutation } from './useSupabaseQuery';

const K = queryKeys.opsAgent;
const FULL = 'id, type, content, detail, scope, scope_ref, source, source_thread, status, created_at, updated_at';
// Until the `detail` and `source_thread` columns exist, the list is read without them so it still shows.
const BASIC = 'id, type, content, scope, scope_ref, source, status, created_at, updated_at';

/** Every memory, newest first. The screen splits them into Active, Waiting and Archived. */
export function useAgentMemory() {
  return useQuery<AgentMemory[], Error>({
    queryKey: K.memory(),
    queryFn: async () => {
      const full = await adb.from('agent_memory').select(FULL).order('created_at', { ascending: false }).limit(500);
      if (!full.error) return (full.data ?? []) as AgentMemory[];
      const basic = await adb.from('agent_memory').select(BASIC).order('created_at', { ascending: false }).limit(500);
      if (basic.error) throw new Error(basic.error.message);
      return (basic.data ?? []) as AgentMemory[];
    },
  });
}

/** The still-pending "Remember this?" rows of one chat thread, so they are not lost when it is reopened. Read only. */
export function useThreadMemorySuggestions(threadId: string | null) {
  return useQuery<AgentMemory[], Error>({
    queryKey: K.memorySuggestions(threadId ?? 'none'),
    enabled: !!threadId,
    retry: false,
    queryFn: async () => {
      const { data, error } = await adb.from('agent_memory').select(FULL).eq('source_thread', threadId).eq('status', 'proposed').order('created_at');
      if (error) return []; // the column may not exist yet: nothing to show
      return (data ?? []) as AgentMemory[];
    },
  });
}

function useRefresh() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: K.memory() });
    qc.invalidateQueries({ queryKey: [...K.all, 'memory-suggestions'] });
    qc.invalidateQueries({ queryKey: K.audit() });
  };
}

/** Approve (active), reject, archive or restore one memory. Approving records who approved it. */
export function useSetMemoryStatus() {
  const uid = useAuthStore((s) => s.profile?.id);
  const refresh = useRefresh();
  return useSupabaseMutation<unknown, { id: string; status: MemoryStatus }>(
    (v) => adb.from('agent_memory').update({ status: v.status, ...(v.status === 'active' ? { approved_by: uid ?? null } : {}) }).eq('id', v.id).select('id'),
    { onSuccess: refresh },
  );
}

/** Edit the text and detail of one memory. */
export function useEditMemory() {
  const refresh = useRefresh();
  return useSupabaseMutation<unknown, { id: string; content: string; detail: string | null }>(
    (v) => adb.from('agent_memory').update({ content: v.content, detail: v.detail }).eq('id', v.id).select('id'),
    { onSuccess: refresh },
  );
}

export interface NewMemory { type: MemoryType; content: string; detail: string | null; scope: MemoryScope; scope_ref: string | null }

/** Adds a memory by hand. It is active at once because a Super Admin wrote it. */
export function useAddMemory() {
  const uid = useAuthStore((s) => s.profile?.id);
  const refresh = useRefresh();
  return useSupabaseMutation<unknown, NewMemory>(
    (v) => adb.from('agent_memory').insert({ ...v, source: 'manual', status: 'active', proposed_by: uid ?? null, approved_by: uid ?? null }).select('id'),
    { onSuccess: refresh },
  );
}
