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

export type TaskStatus = 'to_do' | 'in_progress' | 'in_review' | 'blocked' | 'done';
export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent';

export const TASK_STATUSES: TaskStatus[] = ['to_do', 'in_progress', 'in_review', 'blocked', 'done'];

export const STATUS_META: Record<TaskStatus, { label: string; dot: string; badge: string }> = {
  to_do:       { label: 'To Do',       dot: 'bg-slate-400',   badge: 'bg-slate-100 text-slate-700 dark:bg-slate-500/10 dark:text-slate-300' },
  in_progress: { label: 'In Progress', dot: 'bg-blue-500',    badge: 'bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400' },
  in_review:   { label: 'In Review',   dot: 'bg-amber-500',   badge: 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400' },
  blocked:     { label: 'Blocked',     dot: 'bg-red-500',     badge: 'bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-400' },
  done:        { label: 'Done',        dot: 'bg-emerald-500', badge: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400' },
};

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
    (vars: { title: string; createdBy: string; status?: TaskStatus }) =>
      supabase
        .from('tm_tasks')
        .insert({ list_id: listId, title: vars.title, created_by: vars.createdBy, ...(vars.status ? { status: vars.status } : {}) })
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

// Cross-list: every task assigned to one person, for the My Tasks page.
export function useMyTasks(userId: string) {
  return useSupabaseQuery(
    ['task-module', 'my-tasks', userId] as const,
    () => supabase.from('tm_tasks').select('*').eq('assignee_id', userId).order('due_date'),
    { enabled: !!userId },
  );
}

export function useDeleteTask(listId: string) {
  const invalidate = useInvalidate();
  return useSupabaseMutation(
    (taskId: string) => supabase.from('tm_tasks').delete().eq('id', taskId).select().single(),
    { onSuccess: () => invalidate(queryKeys.taskModule.tasks(listId)) },
  );
}

// ── Tables ─────────────────────────────────────────────────────────────

export type TableFieldType = 'text' | 'long_text' | 'number' | 'date' | 'checkbox' | 'single_select' | 'person' | 'task';

export interface TaskTable {
  id: string;
  folder_id: string;
  name: string;
  position: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface TableField {
  id: string;
  table_id: string;
  name: string;
  type: TableFieldType;
  config: { options?: string[] };
  position: number;
  created_at: string;
}

export interface TableRecordRow {
  id: string;
  table_id: string;
  data: Record<string, unknown>;
  position: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export function useTaskTables() {
  return useSupabaseQuery(queryKeys.taskModule.tables(undefined), () =>
    supabase.from('tm_tables').select('*').order('position').order('created_at'),
  );
}

export function useCreateTaskTable() {
  const invalidate = useInvalidate();
  return useSupabaseMutation(
    (vars: { folderId: string; name: string; createdBy: string }) =>
      supabase
        .from('tm_tables')
        .insert({ folder_id: vars.folderId, name: vars.name, created_by: vars.createdBy })
        .select()
        .single(),
    { onSuccess: () => invalidate(queryKeys.taskModule.tables(undefined)) },
  );
}

export function useDeleteTaskTable() {
  const invalidate = useInvalidate();
  return useSupabaseMutation(
    (tableId: string) => supabase.from('tm_tables').delete().eq('id', tableId).select().single(),
    { onSuccess: () => invalidate(queryKeys.taskModule.tables(undefined)) },
  );
}

export function useTableFields(tableId: string) {
  return useSupabaseQuery(
    queryKeys.taskModule.fields(tableId),
    () => supabase.from('tm_table_fields').select('*').eq('table_id', tableId).order('position').order('created_at'),
    { enabled: !!tableId },
  );
}

export function useCreateTableField(tableId: string) {
  const invalidate = useInvalidate();
  return useSupabaseMutation(
    (vars: { name: string; type: TableFieldType; options?: string[] }) =>
      supabase
        .from('tm_table_fields')
        .insert({
          table_id: tableId,
          name: vars.name,
          type: vars.type,
          config: vars.options?.length ? { options: vars.options } : {},
        })
        .select()
        .single(),
    { onSuccess: () => invalidate(queryKeys.taskModule.fields(tableId)) },
  );
}

export function useDeleteTableField(tableId: string) {
  const invalidate = useInvalidate();
  return useSupabaseMutation(
    (fieldId: string) => supabase.from('tm_table_fields').delete().eq('id', fieldId).select().single(),
    { onSuccess: () => invalidate(queryKeys.taskModule.fields(tableId)) },
  );
}

export function useTableRecords(tableId: string) {
  return useSupabaseQuery(
    queryKeys.taskModule.records(tableId),
    () => supabase.from('tm_table_records').select('*').eq('table_id', tableId).order('position').order('created_at'),
    { enabled: !!tableId },
  );
}

export function useCreateTableRecord(tableId: string) {
  const invalidate = useInvalidate();
  return useSupabaseMutation(
    (createdBy: string) => supabase.from('tm_table_records').insert({ table_id: tableId, created_by: createdBy }).select().single(),
    { onSuccess: () => invalidate(queryKeys.taskModule.records(tableId)) },
  );
}

export function useDeleteTableRecord(tableId: string) {
  const invalidate = useInvalidate();
  return useSupabaseMutation(
    (recordId: string) => supabase.from('tm_table_records').delete().eq('id', recordId).select().single(),
    { onSuccess: () => invalidate(queryKeys.taskModule.records(tableId)) },
  );
}

// Routes through the tm_set_record_cell RPC (atomic jsonb_set) rather than a
// client-side read-modify-write on the whole `data` column — see the
// migration comment for why: two people editing different cells of the same
// row at once would otherwise silently clobber one another.
export function useSetRecordCell(tableId: string) {
  const invalidate = useInvalidate();
  return useSupabaseMutation<TableRecordRow, { recordId: string; fieldId: string; value: unknown }>(
    (vars) =>
      supabase.rpc('tm_set_record_cell', {
        p_record_id: vars.recordId,
        p_field_id: vars.fieldId,
        p_value: vars.value,
      }),
    { onSuccess: () => invalidate(queryKeys.taskModule.records(tableId)) },
  );
}

// Every task across every list, for the Table "task" field type's link
// picker. Title + list name only — enough to disambiguate options in a
// dropdown without pulling full task detail.
export function useAllTasksForPicker() {
  return useSupabaseQuery(['task-module', 'all-tasks-picker'] as const, () =>
    supabase.from('tm_tasks').select('id, title, list_id').order('created_at', { ascending: false }).limit(1000),
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
