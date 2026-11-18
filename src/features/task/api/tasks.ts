import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

export type TaskPriority = 'urgent' | 'high' | 'normal' | 'low';

export interface TaskAssignee {
  user_id: string;
  full_name: string;
  photo_url: string | null;
}

export interface TaskRow {
  id: string;
  list_id: string;
  parent_task_id: string | null;
  title: string;
  description: unknown;
  description_text: string | null;
  status_id: string | null;
  priority: TaskPriority;
  start_date: string | null;
  due_date: string | null;
  due_has_time: boolean;
  completed_at: string | null;
  position: number;
  created_by: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
  assignees: TaskAssignee[];
}

async function attachAssignees(tasks: { id: string }[]): Promise<Map<string, TaskAssignee[]>> {
  if (tasks.length === 0) return new Map();
  const { data: rows, error } = await supabase
    .from('tk_task_assignees')
    .select('task_id, user_id')
    .in('task_id', tasks.map((t) => t.id));
  if (error) throw error;

  const userIds = [...new Set((rows ?? []).map((r) => r.user_id))];
  let profiles: { id: string; full_name: string; photo_url: string | null }[] = [];
  if (userIds.length > 0) {
    const { data, error: profErr } = await supabase
      .from('profiles_directory')
      .select('id, full_name, photo_url')
      .in('id', userIds);
    if (profErr) throw profErr;
    profiles = data ?? [];
  }
  const profileById = new Map(profiles.map((p) => [p.id, p]));

  const byTask = new Map<string, TaskAssignee[]>();
  for (const row of rows ?? []) {
    const p = profileById.get(row.user_id);
    const list = byTask.get(row.task_id) ?? [];
    list.push({ user_id: row.user_id, full_name: p?.full_name ?? 'Unknown', photo_url: p?.photo_url ?? null });
    byTask.set(row.task_id, list);
  }
  return byTask;
}

export function useTasksForList(listId: string | undefined) {
  return useQuery({
    queryKey: ['tk', 'list', listId, 'tasks'],
    enabled: !!listId,
    staleTime: 10_000,
    queryFn: async () => {
      const { data: tasks, error } = await supabase
        .from('tk_tasks')
        .select('id, list_id, parent_task_id, title, description, description_text, status_id, priority, start_date, due_date, due_has_time, completed_at, position, created_by, archived_at, created_at, updated_at')
        .eq('list_id', listId as string)
        .is('archived_at', null)
        .order('position');
      if (error) throw error;

      const assigneesByTask = await attachAssignees(tasks ?? []);
      return (tasks ?? []).map((t) => ({ ...t, assignees: assigneesByTask.get(t.id) ?? [] })) as TaskRow[];
    },
  });
}

export function useTask(taskId: string | undefined) {
  return useQuery({
    queryKey: ['tk', 'task', taskId],
    enabled: !!taskId,
    staleTime: 10_000,
    queryFn: async () => {
      const { data: task, error } = await supabase
        .from('tk_tasks')
        .select('id, list_id, parent_task_id, title, description, description_text, status_id, priority, start_date, due_date, due_has_time, completed_at, position, created_by, archived_at, created_at, updated_at')
        .eq('id', taskId as string)
        .maybeSingle();
      if (error) throw error;
      if (!task) return null;

      const assigneesByTask = await attachAssignees([task]);
      return { ...task, assignees: assigneesByTask.get(task.id) ?? [] } as TaskRow;
    },
  });
}

function invalidateTask(qc: ReturnType<typeof useQueryClient>, listId: string, taskId?: string) {
  qc.invalidateQueries({ queryKey: ['tk', 'list', listId, 'tasks'] });
  if (taskId) qc.invalidateQueries({ queryKey: ['tk', 'task', taskId] });
}

export interface CreateTaskInput {
  listId: string;
  title: string;
  statusId: string | null;
  priority: TaskPriority;
  dueDate: string | null;
  dueHasTime: boolean;
  assigneeIds: string[];
  createdBy: string;
}

export function useCreateTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateTaskInput) => {
      const { data: task, error } = await supabase
        .from('tk_tasks')
        .insert({
          list_id: input.listId,
          title: input.title,
          status_id: input.statusId,
          priority: input.priority,
          due_date: input.dueDate,
          due_has_time: input.dueHasTime,
          position: Date.now(),
          created_by: input.createdBy,
        })
        .select()
        .single();
      if (error) throw error;

      if (input.assigneeIds.length > 0) {
        const { error: assignErr } = await supabase.from('tk_task_assignees').insert(
          input.assigneeIds.map((userId) => ({ task_id: task.id, user_id: userId, assigned_by: input.createdBy })),
        );
        if (assignErr) throw assignErr;
      }
      return task as TaskRow;
    },
    onSuccess: (task) => invalidateTask(qc, task.list_id),
  });
}

export function useUpdateTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; listId: string; patch: Record<string, unknown> }) => {
      const { error } = await supabase.from('tk_tasks').update(input.patch).eq('id', input.id);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => invalidateTask(qc, vars.listId, vars.id),
  });
}

export function useArchiveTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; listId: string; archived: boolean }) => {
      const { error } = await supabase
        .from('tk_tasks')
        .update({ archived_at: input.archived ? new Date().toISOString() : null })
        .eq('id', input.id);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => invalidateTask(qc, vars.listId, vars.id),
  });
}

export function useDeleteTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; listId: string }) => {
      const { error } = await supabase.from('tk_tasks').delete().eq('id', input.id);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => invalidateTask(qc, vars.listId),
  });
}

export function useDuplicateTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { task: TaskRow; createdBy: string }) => {
      const { task, createdBy } = input;
      const { data: copy, error } = await supabase
        .from('tk_tasks')
        .insert({
          list_id: task.list_id,
          title: task.title,
          description: task.description,
          description_text: task.description_text,
          status_id: task.status_id,
          priority: task.priority,
          start_date: task.start_date,
          due_date: task.due_date,
          due_has_time: task.due_has_time,
          position: Date.now(),
          created_by: createdBy,
        })
        .select()
        .single();
      if (error) throw error;

      if (task.assignees.length > 0) {
        const { error: assignErr } = await supabase.from('tk_task_assignees').insert(
          task.assignees.map((a) => ({ task_id: copy.id, user_id: a.user_id, assigned_by: createdBy })),
        );
        if (assignErr) throw assignErr;
      }
      return copy as TaskRow;
    },
    onSuccess: (task) => invalidateTask(qc, task.list_id),
  });
}

export function useIsWatching(taskId: string | undefined, userId: string | undefined) {
  return useQuery({
    queryKey: ['tk', 'task', taskId, 'watching', userId],
    enabled: !!taskId && !!userId,
    staleTime: 10_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tk_task_watchers')
        .select('task_id')
        .eq('task_id', taskId as string)
        .eq('user_id', userId as string)
        .maybeSingle();
      if (error) throw error;
      return !!data;
    },
  });
}

export function useToggleWatch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { taskId: string; userId: string; watching: boolean }) => {
      if (input.watching) {
        const { error } = await supabase.from('tk_task_watchers').delete().eq('task_id', input.taskId).eq('user_id', input.userId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('tk_task_watchers').insert({ task_id: input.taskId, user_id: input.userId });
        if (error) throw error;
      }
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['tk', 'task', vars.taskId, 'watching'] });
    },
  });
}

export function useSetTaskAssignees() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { taskId: string; listId: string; add: string[]; remove: string[]; assignedBy: string }) => {
      if (input.remove.length > 0) {
        const { error } = await supabase
          .from('tk_task_assignees')
          .delete()
          .eq('task_id', input.taskId)
          .in('user_id', input.remove);
        if (error) throw error;
      }
      if (input.add.length > 0) {
        const { error } = await supabase.from('tk_task_assignees').insert(
          input.add.map((userId) => ({ task_id: input.taskId, user_id: userId, assigned_by: input.assignedBy })),
        );
        if (error) throw error;
      }
    },
    onSuccess: (_d, vars) => invalidateTask(qc, vars.listId, vars.taskId),
  });
}
