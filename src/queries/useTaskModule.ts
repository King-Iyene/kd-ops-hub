import { supabase } from '@/lib/supabase';
import { queryKeys } from './keys';
import { useSupabaseQuery, useSupabaseMutation, useInvalidate } from './useSupabaseQuery';

export interface TaskFolder {
  id: string;
  name: string;
  position: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface TaskListRow {
  id: string;
  folder_id: string;
  name: string;
  position: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export type TaskStatus = 'open' | 'in_progress' | 'done';
export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent';

export interface TaskRow {
  id: string;
  list_id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority | null;
  assignee_id: string | null;
  due_date: string | null;
  position: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

export interface PersonOption {
  id: string;
  full_name: string;
  email: string;
  photo_url: string | null;
}

// ── Folders ─────────────────────────────────────────────────────────────
// Org-wide and small by design ("very light") — fetched in full, no pagination.

export function useTaskFolders() {
  return useSupabaseQuery(queryKeys.taskModule.folders(), () =>
    supabase.from('tm_folders').select('*').order('position').order('created_at'),
  );
}

export function useCreateTaskFolder() {
  const invalidate = useInvalidate();
  return useSupabaseMutation(
    (vars: { name: string; createdBy: string }) =>
      supabase.from('tm_folders').insert({ name: vars.name, created_by: vars.createdBy }).select().single(),
    { onSuccess: () => invalidate(queryKeys.taskModule.folders()) },
  );
}

export function useDeleteTaskFolder() {
  const invalidate = useInvalidate();
  return useSupabaseMutation(
    (folderId: string) => supabase.from('tm_folders').delete().eq('id', folderId).select().single(),
    {
      onSuccess: () => invalidate(queryKeys.taskModule.folders(), queryKeys.taskModule.lists(undefined)),
    },
  );
}

// ── Lists ──────────────────────────────────────────────────────────────
// Fetched all at once (not per-folder) and grouped client-side — avoids an
// N+1 query per folder while folder/list counts stay small.

export function useTaskLists() {
  return useSupabaseQuery(queryKeys.taskModule.lists(undefined), () =>
    supabase.from('tm_lists').select('*').order('position').order('created_at'),
  );
}

export function useCreateTaskList() {
  const invalidate = useInvalidate();
  return useSupabaseMutation(
    (vars: { folderId: string; name: string; createdBy: string }) =>
      supabase
        .from('tm_lists')
        .insert({ folder_id: vars.folderId, name: vars.name, created_by: vars.createdBy })
        .select()
        .single(),
    { onSuccess: () => invalidate(queryKeys.taskModule.lists(undefined)) },
  );
}

export function useDeleteTaskList() {
  const invalidate = useInvalidate();
  return useSupabaseMutation(
    (listId: string) => supabase.from('tm_lists').delete().eq('id', listId).select().single(),
    { onSuccess: () => invalidate(queryKeys.taskModule.lists(undefined)) },
  );
}

// ── Tasks ──────────────────────────────────────────────────────────────

export function useTasks(listId: string) {
  return useSupabaseQuery(
    queryKeys.taskModule.tasks(listId),
    () =>
      supabase
        .from('tm_tasks')
        .select('*')
        .eq('list_id', listId)
        .order('position')
        .order('created_at'),
    { enabled: !!listId },
  );
}

export function useCreateTask(listId: string) {
  const invalidate = useInvalidate();
  return useSupabaseMutation(
    (vars: { title: string; createdBy: string }) =>
      supabase
        .from('tm_tasks')
        .insert({ list_id: listId, title: vars.title, created_by: vars.createdBy })
        .select()
        .single(),
    { onSuccess: () => invalidate(queryKeys.taskModule.tasks(listId)) },
  );
}

export function useUpdateTask(listId: string) {
  const invalidate = useInvalidate();
  return useSupabaseMutation(
    (vars: { id: string; patch: Partial<Pick<TaskRow, 'title' | 'description' | 'status' | 'priority' | 'assignee_id' | 'due_date'>> }) => {
      const patch: Record<string, unknown> = { ...vars.patch };
      if (vars.patch.status) {
        patch.completed_at = vars.patch.status === 'done' ? new Date().toISOString() : null;
      }
      return supabase.from('tm_tasks').update(patch).eq('id', vars.id).select().single();
    },
    { onSuccess: () => invalidate(queryKeys.taskModule.tasks(listId)) },
  );
}

export function useDeleteTask(listId: string) {
  const invalidate = useInvalidate();
  return useSupabaseMutation(
    (taskId: string) => supabase.from('tm_tasks').delete().eq('id', taskId).select().single(),
    { onSuccess: () => invalidate(queryKeys.taskModule.tasks(listId)) },
  );
}

// ── People picker ──────────────────────────────────────────────────────
// profiles_directory excludes sensitive columns (salary, bank details, …)
// and is readable by every authenticated user — the same source every
// other people-picker in the app uses (see Tasks.tsx, TaskTeamDashboard.tsx).

export function useAssignablePeople() {
  return useSupabaseQuery(['task-module', 'assignable-people'] as const, () =>
    supabase
      .from('profiles_directory')
      .select('id, full_name, email, photo_url')
      .eq('is_anonymised', false)
      .in('status', ['active', 'invited'])
      .order('full_name')
      .limit(500),
  );
}
