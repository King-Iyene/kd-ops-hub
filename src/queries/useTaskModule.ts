import { useMutation, useQueryClient, type QueryKey } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { queryKeys } from './keys';
import { useSupabaseQuery, useSupabaseMutation, useInvalidate } from './useSupabaseQuery';
import type { Json, TablesUpdate } from '@/integrations/supabase/types';

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

export const STATUS_META: Record<TaskStatus, { label: string; dot: string; badge: string; text: string }> = {
  to_do:       { label: 'To Do',       dot: 'bg-slate-400',   badge: 'bg-slate-100 text-slate-700 dark:bg-slate-500/10 dark:text-slate-300',         text: 'text-slate-500 dark:text-slate-300' },
  in_progress: { label: 'In Progress', dot: 'bg-blue-500',    badge: 'bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400',              text: 'text-blue-600 dark:text-blue-400' },
  in_review:   { label: 'In Review',   dot: 'bg-amber-500',   badge: 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400',          text: 'text-amber-600 dark:text-amber-400' },
  blocked:     { label: 'Blocked',     dot: 'bg-red-500',     badge: 'bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-400',                  text: 'text-red-600 dark:text-red-400' },
  done:        { label: 'Complete',    dot: 'bg-emerald-500', badge: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400',  text: 'text-emerald-600 dark:text-emerald-400' },
};

export const PRIORITY_META: Record<TaskPriority, { label: string; className: string }> = {
  low:    { label: 'Low',    className: 'bg-slate-100 text-slate-600 dark:bg-slate-500/10 dark:text-slate-400' },
  medium: { label: 'Medium', className: 'bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400' },
  high:   { label: 'High',   className: 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400' },
  urgent: { label: 'Urgent', className: 'bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-400' },
};

// Flag icon colour per priority (filled), used wherever a priority flag shows.
export const PRIORITY_FLAG: Record<TaskPriority, string> = {
  urgent: 'text-red-500 fill-red-500',
  high: 'text-amber-500 fill-amber-500',
  medium: 'text-blue-500 fill-blue-500',
  low: 'text-slate-400 fill-slate-400',
};

// Board columns group the five statuses into three stages.
export type StatusStage = 'not_started' | 'active' | 'done';
export const STAGE_OF: Record<TaskStatus, StatusStage> = {
  to_do: 'not_started', in_progress: 'active', in_review: 'active', blocked: 'active', done: 'done',
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
  parent_id: string | null;
  tags: string[];
  custom: Record<string, unknown>;
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
        .order('created_at')
        .overrideTypes<TaskRow[], { merge: false }>(),
    { enabled: !!listId },
  );
}

// A task shows up in many places at once (its list, My Tasks, every Home
// card, the open detail panel), so any task write refreshes all
// task-module queries rather than trying to enumerate which ones it touched.
export interface NewTask {
  listId: string;
  title: string;
  createdBy: string;
  status?: TaskStatus;
  parentId?: string | null;
  description?: string | null;
  assigneeId?: string | null;
  dueDate?: string | null;
  priority?: TaskPriority | null;
}

export function useCreateTask() {
  const invalidate = useInvalidate();
  return useSupabaseMutation(
    (v: NewTask) =>
      supabase
        .from('tm_tasks')
        .insert({
          list_id: v.listId,
          title: v.title,
          created_by: v.createdBy,
          ...(v.status ? { status: v.status } : {}),
          parent_id: v.parentId ?? null,
          description: v.description || null,
          assignee_id: v.assigneeId ?? null,
          due_date: v.dueDate ?? null,
          priority: v.priority ?? null,
        })
        .select()
        .single(),
    { onSuccess: () => invalidate(queryKeys.taskModule.all) },
  );
}

export type TaskPatch = Partial<Pick<TaskRow, 'title' | 'description' | 'status' | 'priority' | 'assignee_id' | 'due_date' | 'tags'>>;

// Patch a task in place in every cached task-module query (lists, My Tasks,
// Home, the open task) so a change — e.g. a card dropped on another board
// column — shows at once instead of after the refetch.
function patchCachedTask(qc: ReturnType<typeof useQueryClient>, taskId: string, patch: Partial<TaskRow>) {
  const apply = (row: unknown) =>
    row && typeof row === 'object' && (row as TaskRow).id === taskId && 'list_id' in (row as object)
      ? { ...(row as TaskRow), ...patch }
      : row;
  qc.setQueriesData({ queryKey: queryKeys.taskModule.all }, (old: unknown) =>
    Array.isArray(old) ? old.map(apply) : apply(old),
  );
}

export function useUpdateTask() {
  const invalidate = useInvalidate();
  const qc = useQueryClient();
  return useSupabaseMutation(
    (vars: { task: TaskRow; patch: TaskPatch }) => {
      const patch: Record<string, unknown> = { ...vars.patch };
      // Only stamp completed_at on an actual transition, so re-saving a
      // finished task doesn't move its completion date.
      if (vars.patch.status && vars.patch.status !== vars.task.status) {
        patch.completed_at = vars.patch.status === 'done' ? new Date().toISOString() : null;
      }
      return supabase.from('tm_tasks').update(patch as TablesUpdate<'tm_tasks'>).eq('id', vars.task.id).select().single();
    },
    {
      onMutate: async (vars) => {
        await qc.cancelQueries({ queryKey: queryKeys.taskModule.all });
        const snapshot = qc.getQueriesData({ queryKey: queryKeys.taskModule.all });
        patchCachedTask(qc, vars.task.id, vars.patch as Partial<TaskRow>);
        return { snapshot };
      },
      // A failed save puts every cached copy back as it was.
      onError: (_err, _vars, context) => {
        const ctx = context as { snapshot?: [QueryKey, unknown][] } | undefined;
        ctx?.snapshot?.forEach(([key, data]) => qc.setQueryData(key, data));
      },
      onSettled: () => invalidate(queryKeys.taskModule.all),
    },
  );
}

export interface TaskMove { task: TaskRow; position: number; status?: TaskStatus }

// Drag-to-reorder in a list: saves new positions (and a new status when a
// row is dropped into another status group). Shown at once, rolled back if
// any save fails.
export function useMoveTasks() {
  const invalidate = useInvalidate();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (moves: TaskMove[]) => {
      const results = await Promise.all(moves.map((m) => {
        const patch: TablesUpdate<'tm_tasks'> = { position: m.position };
        if (m.status && m.status !== m.task.status) {
          patch.status = m.status;
          patch.completed_at = m.status === 'done' ? new Date().toISOString() : null;
        }
        return supabase.from('tm_tasks').update(patch).eq('id', m.task.id);
      }));
      const failed = results.find((r) => r.error);
      if (failed?.error) throw new Error(failed.error.message);
    },
    onMutate: async (moves: TaskMove[]) => {
      await qc.cancelQueries({ queryKey: queryKeys.taskModule.all });
      const snapshot = qc.getQueriesData({ queryKey: queryKeys.taskModule.all });
      for (const m of moves) {
        patchCachedTask(qc, m.task.id, m.status ? { position: m.position, status: m.status } : { position: m.position });
      }
      return { snapshot };
    },
    onError: (_err, _moves, context) => {
      context?.snapshot?.forEach(([key, data]) => qc.setQueryData(key, data));
    },
    onSettled: () => invalidate(queryKeys.taskModule.all),
  });
}

export function useDeleteTask() {
  const invalidate = useInvalidate();
  return useSupabaseMutation(
    (taskId: string) => supabase.from('tm_tasks').delete().eq('id', taskId).select().single(),
    { onSuccess: () => invalidate(queryKeys.taskModule.all) },
  );
}

export function useTask(taskId: string | null) {
  const qc = useQueryClient();
  return useSupabaseQuery(
    queryKeys.taskModule.task(taskId ?? ''),
    () => supabase.from('tm_tasks').select('*').eq('id', taskId ?? '').maybeSingle().overrideTypes<TaskRow | null, { merge: false }>(),
    {
      enabled: !!taskId,
      // Show the copy already loaded by the list behind the dialog straight
      // away; the fresh row replaces it when it arrives.
      placeholderData: () => {
        for (const [, data] of qc.getQueriesData<unknown>({ queryKey: queryKeys.taskModule.all })) {
          const hit = Array.isArray(data) && data.find((r) => r && typeof r === 'object' && r.id === taskId && 'list_id' in r);
          if (hit) return hit as TaskRow;
        }
        return undefined;
      },
    },
  );
}

// Cross-list: every task assigned to one person, for the My Tasks page.
export function useMyTasks(userId: string) {
  return useSupabaseQuery(
    ['task-module', 'my-tasks', userId] as const,
    () => supabase.from('tm_tasks').select('*').eq('assignee_id', userId).order('due_date').overrideTypes<TaskRow[], { merge: false }>(),
    { enabled: !!userId },
  );
}

// Everything Home needs in one query: tasks assigned to me (My Work, My
// Board, This Week, Summary) plus tasks I created for someone else
// (Delegated).
export function useHomeTasks(userId: string) {
  return useSupabaseQuery(
    queryKeys.taskModule.homeTasks(userId),
    () =>
      supabase
        .from('tm_tasks')
        .select('*')
        .or(`assignee_id.eq.${userId},created_by.eq.${userId}`)
        .order('due_date', { nullsFirst: false })
        .limit(1000)
        .overrideTypes<TaskRow[], { merge: false }>(),
    { enabled: !!userId },
  );
}

// ── Comments ───────────────────────────────────────────────────────────

export interface TaskComment {
  id: string;
  task_id: string;
  author_id: string | null;
  body: string;
  mentions: string[];
  created_at: string;
}

export function useTaskComments(taskId: string | null) {
  return useSupabaseQuery(
    queryKeys.taskModule.comments(taskId ?? ''),
    () => supabase.from('tm_task_comments').select('*').eq('task_id', taskId ?? '').order('created_at').overrideTypes<TaskComment[], { merge: false }>(),
    { enabled: !!taskId },
  );
}

export function useAddComment(taskId: string) {
  const invalidate = useInvalidate();
  return useSupabaseMutation(
    (vars: { authorId: string; body: string; mentions: string[] }) =>
      supabase
        .from('tm_task_comments')
        .insert({ task_id: taskId, author_id: vars.authorId, body: vars.body, mentions: vars.mentions })
        .select()
        .single(),
    { onSuccess: () => invalidate(queryKeys.taskModule.comments(taskId), queryKeys.taskModule.commentFeed()) },
  );
}

export function useDeleteComment(taskId: string) {
  const invalidate = useInvalidate();
  return useSupabaseMutation(
    (commentId: string) => supabase.from('tm_task_comments').delete().eq('id', commentId).select().single(),
    { onSuccess: () => invalidate(queryKeys.taskModule.comments(taskId), queryKeys.taskModule.commentFeed()) },
  );
}

export function useMyCommentFeed() {
  return useSupabaseQuery(queryKeys.taskModule.commentFeed(), () => supabase.rpc('tm_my_comment_feed', { p_days: 7 }));
}

export function useMyRecords() {
  return useSupabaseQuery(queryKeys.taskModule.myRecords(), () => supabase.rpc('tm_my_records'));
}

// ── Home layout ────────────────────────────────────────────────────────

export const HOME_CARDS = ['summary', 'my_work', 'my_board', 'this_week', 'delegated', 'mentions', 'my_records'] as const;
export type HomeCardKey = (typeof HOME_CARDS)[number];
export type HomeDateRange = 'all' | 'week' | 'month' | 'last30' | 'custom';

export interface HomeLayout {
  cards: HomeCardKey[];
  dateRange: HomeDateRange;
  /** yyyy-MM-dd, only for a custom range. */
  rangeFrom?: string | null;
  rangeTo?: string | null;
}
export interface HomeLayoutRow { cards: string[]; date_range: string; range_from: string | null; range_to: string | null }

export const DEFAULT_HOME_LAYOUT: HomeLayout = { cards: [...HOME_CARDS], dateRange: 'all' };

// Read once; nothing is written until the person actually changes the
// layout (CLAUDE.md: no writes on mount).
export function useHomeLayout(userId: string) {
  return useSupabaseQuery(
    queryKeys.taskModule.homeLayout(userId),
    () => supabase.from('tm_home_layouts').select('cards, date_range, range_from, range_to').eq('user_id', userId).maybeSingle(),
    { enabled: !!userId, staleTime: Infinity },
  );
}

const customRange = (l: HomeLayout) => (l.dateRange === 'custom'
  ? { range_from: l.rangeFrom ?? null, range_to: l.rangeTo ?? null }
  : { range_from: null, range_to: null });

// Optimistic: the new layout shows immediately (a dragged card stays where
// it was dropped) and is rolled back only if the save fails.
export function useSaveHomeLayout(userId: string) {
  const qc = useQueryClient();
  const key = queryKeys.taskModule.homeLayout(userId);
  return useMutation<unknown, Error, HomeLayout, { previous: unknown }>({
    mutationFn: async (layout) => {
      const { error } = await supabase
        .from('tm_home_layouts')
        .upsert({ user_id: userId, cards: layout.cards, date_range: layout.dateRange, ...customRange(layout) });
      if (error) throw new Error(error.message);
    },
    onMutate: async (layout) => {
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData(key);
      qc.setQueryData<HomeLayoutRow>(key, { cards: layout.cards, date_range: layout.dateRange, ...customRange(layout) });
      return { previous };
    },
    onError: (_err, _layout, ctx) => qc.setQueryData(key, ctx?.previous),
  });
}

// ── Tables ─────────────────────────────────────────────────────────────

// "person" is shown as People and "task" as Task link (stored names kept).
// The last four are computed from the record and never edited.
export type TableFieldType =
  | 'text' | 'long_text' | 'number' | 'currency' | 'date' | 'checkbox' | 'single_select' | 'multi_select'
  | 'link' | 'email' | 'phone' | 'person' | 'task' | 'attachment' | 'rating'
  | 'created_by' | 'created_at' | 'last_modified' | 'auto_number';

export interface TableFieldConfig {
  required?: boolean;
  max_length?: number;
  options?: string[];
  currency?: string;
  decimals?: number;
  rating_max?: number;
  multiple?: boolean;
}

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
  config: TableFieldConfig;
  position: number;
  created_at: string;
}

export interface TableRecordRow {
  id: string;
  table_id: string;
  data: Record<string, unknown>;
  position: number;
  row_number: number | null;
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

// Rename a space, list or table (admins; enforced by RLS).
export function useRenameTaskItem() {
  const invalidate = useInvalidate();
  return useSupabaseMutation(
    (vars: { kind: 'folder' | 'list' | 'table'; id: string; name: string }) => {
      const table = vars.kind === 'folder' ? 'tm_folders' : vars.kind === 'list' ? 'tm_lists' : 'tm_tables';
      return supabase.from(table).update({ name: vars.name }).eq('id', vars.id).select('id').single();
    },
    {
      onSuccess: () => invalidate(
        queryKeys.taskModule.folders(), queryKeys.taskModule.lists(undefined), queryKeys.taskModule.tables(undefined),
      ),
    },
  );
}

export function useTableFields(tableId: string) {
  return useSupabaseQuery(
    queryKeys.taskModule.fields(tableId),
    () =>
      supabase.from('tm_table_fields').select('*').eq('table_id', tableId).order('position').order('created_at')
        .overrideTypes<TableField[], { merge: false }>(),
    { enabled: !!tableId },
  );
}

export function useCreateTableField(tableId: string) {
  const invalidate = useInvalidate();
  return useSupabaseMutation(
    (vars: { name: string; type: TableFieldType; config: TableFieldConfig; position: number }) =>
      supabase
        .from('tm_table_fields')
        .insert({ table_id: tableId, name: vars.name, type: vars.type, config: vars.config as Json, position: vars.position })
        .select()
        .single(),
    { onSuccess: () => invalidate(queryKeys.taskModule.fields(tableId)) },
  );
}

// Name and settings only — a field's type is fixed once it holds data.
export function useUpdateTableField(tableId: string) {
  const invalidate = useInvalidate();
  return useSupabaseMutation(
    (vars: { id: string; name: string; config: TableFieldConfig }) =>
      supabase.from('tm_table_fields').update({ name: vars.name, config: vars.config as Json }).eq('id', vars.id).select().single(),
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
    () =>
      supabase.from('tm_table_records').select('*').eq('table_id', tableId).order('position').order('created_at')
        .overrideTypes<TableRecordRow[], { merge: false }>(),
    { enabled: !!tableId },
  );
}

export function useCreateTableRecord(tableId: string) {
  const invalidate = useInvalidate();
  return useSupabaseMutation(
    (vars: { createdBy: string; data?: Record<string, unknown> }) =>
      supabase.from('tm_table_records')
        .insert({ table_id: tableId, created_by: vars.createdBy, data: (vars.data ?? {}) as Json })
        .select().single(),
    { onSuccess: () => invalidate(queryKeys.taskModule.records(tableId)) },
  );
}

// Import: many rows in one insert.
export function useInsertTableRecords(tableId: string) {
  const invalidate = useInvalidate();
  return useSupabaseMutation(
    (vars: { createdBy: string; rows: Record<string, unknown>[] }) =>
      supabase.from('tm_table_records')
        .insert(vars.rows.map((data) => ({ table_id: tableId, created_by: vars.createdBy, data: data as Json })))
        .select('id'),
    { onSuccess: () => invalidate(queryKeys.taskModule.records(tableId)) },
  );
}

export function useDeleteTableRecords(tableId: string) {
  const invalidate = useInvalidate();
  return useSupabaseMutation(
    (recordIds: string[]) => supabase.from('tm_table_records').delete().in('id', recordIds).select('id'),
    { onSuccess: () => invalidate(queryKeys.taskModule.records(tableId)) },
  );
}

// Routes through the tm_set_record_cell RPC (atomic jsonb_set) rather than a
// client-side read-modify-write on the whole `data` column — see the
// migration comment for why: two people editing different cells of the same
// row at once would otherwise silently clobber one another.
export function useSetRecordCell(tableId: string) {
  const invalidate = useInvalidate();
  const qc = useQueryClient();
  return useSupabaseMutation<TableRecordRow, { recordId: string; fieldId: string; value: unknown }>(
    (vars) =>
      supabase.rpc('tm_set_record_cell', {
        p_record_id: vars.recordId,
        p_field_id: vars.fieldId,
        p_value: (vars.value ?? null) as Json,
      }).overrideTypes<TableRecordRow, { merge: false }>(),
    {
      // Show the new value at once (e.g. a card dragged to another column).
      onMutate: (vars) => {
        qc.setQueryData<TableRecordRow[]>(queryKeys.taskModule.records(tableId), (old) =>
          old?.map((r) => (r.id === vars.recordId ? { ...r, data: { ...r.data, [vars.fieldId]: vars.value } } : r)));
      },
      onSettled: () => invalidate(queryKeys.taskModule.records(tableId)),
    },
  );
}

// Open tasks across every list, for Task link fields. Completed tasks are
// left out on purpose: a link is for work that's still going.
export interface TaskOption { id: string; title: string; list_id: string; assignee_id: string | null; status: TaskStatus }
export function useOpenTasksForPicker() {
  return useSupabaseQuery(
    [...queryKeys.taskModule.all, 'open-tasks-picker'] as const,
    () =>
      supabase.from('tm_tasks').select('id, title, list_id, assignee_id, status').neq('status', 'done')
        .order('created_at', { ascending: false }).limit(2000)
        .overrideTypes<TaskOption[], { merge: false }>(),
  );
}

// Titles for tasks already linked in a table, including ones finished since.
export function useTaskTitles(ids: string[]) {
  const key = [...ids].sort().join(',');
  return useSupabaseQuery(
    [...queryKeys.taskModule.all, 'task-titles', key] as const,
    () => supabase.from('tm_tasks').select('id, title, status').in('id', ids.length ? ids : ['00000000-0000-0000-0000-000000000000'])
      .overrideTypes<{ id: string; title: string; status: TaskStatus }[], { merge: false }>(),
    { enabled: ids.length > 0 },
  );
}

// ── Forms ──────────────────────────────────────────────────────────────

export interface TaskForm {
  id: string;
  table_id: string;
  token: string;
  title: string;
  description: string | null;
  field_ids: string[];
  access: 'members' | 'public';
  is_open: boolean;
  success_message: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export function useTableForms(tableId: string) {
  return useSupabaseQuery(
    [...queryKeys.taskModule.all, 'forms', tableId] as const,
    () => supabase.from('tm_forms').select('*').eq('table_id', tableId).order('created_at')
      .overrideTypes<TaskForm[], { merge: false }>(),
    { enabled: !!tableId },
  );
}

export type FormDraft = Pick<TaskForm, 'title' | 'description' | 'field_ids' | 'access' | 'is_open' | 'success_message'>;

export function useSaveForm(tableId: string) {
  const invalidate = useInvalidate();
  return useSupabaseMutation(
    (vars: { id?: string; draft: FormDraft; createdBy: string }) =>
      vars.id
        ? supabase.from('tm_forms').update(vars.draft).eq('id', vars.id).select().single()
        : supabase.from('tm_forms').insert({ ...vars.draft, table_id: tableId, created_by: vars.createdBy }).select().single(),
    { onSuccess: () => invalidate([...queryKeys.taskModule.all, 'forms', tableId]) },
  );
}

export function useDeleteForm(tableId: string) {
  const invalidate = useInvalidate();
  return useSupabaseMutation(
    (formId: string) => supabase.from('tm_forms').delete().eq('id', formId).select('id').single(),
    { onSuccess: () => invalidate([...queryKeys.taskModule.all, 'forms', tableId]) },
  );
}

// ── People picker ──────────────────────────────────────────────────────
// profiles_directory excludes sensitive columns (salary, bank details, …)
// and is readable by every authenticated user — the same source every
// other people-picker in the app uses (see Tasks.tsx, TaskTeamDashboard.tsx).

export function useAssignablePeople() {
  return useSupabaseQuery(queryKeys.taskModule.people(), () =>
    supabase
      .from('profiles_directory')
      .select('id, full_name, email, photo_url')
      .eq('is_anonymised', false)
      .in('status', ['active', 'invited'])
      .order('full_name')
      .limit(500),
  );
}

// ── Task detail: subtasks, custom fields, checklists, watchers,
//    attachments, activity ───────────────────────────────────────────

const tm = queryKeys.taskModule.all;

export function useSubtasks(parentId: string | null) {
  return useSupabaseQuery(
    [...tm, 'subtasks', parentId ?? ''] as const,
    () => supabase.from('tm_tasks').select('*').eq('parent_id', parentId ?? '').order('position').order('created_at').overrideTypes<TaskRow[], { merge: false }>(),
    { enabled: !!parentId },
  );
}

export type ListFieldType = 'text' | 'long_text' | 'number' | 'date' | 'checkbox' | 'single_select' | 'person';

export interface ListField {
  id: string;
  list_id: string;
  name: string;
  type: ListFieldType;
  config: { options?: string[] };
  position: number;
  created_at: string;
}

export function useListFields(listId: string | null) {
  return useSupabaseQuery(
    [...tm, 'list-fields', listId ?? ''] as const,
    () => supabase.from('tm_list_fields').select('*').eq('list_id', listId ?? '').order('position').order('created_at').overrideTypes<ListField[], { merge: false }>(),
    { enabled: !!listId },
  );
}

export function useCreateListField(listId: string) {
  const invalidate = useInvalidate();
  return useSupabaseMutation(
    (v: { name: string; type: ListFieldType; options?: string[] }) =>
      supabase
        .from('tm_list_fields')
        .insert({ list_id: listId, name: v.name, type: v.type, config: v.options?.length ? { options: v.options } : {} })
        .select()
        .single(),
    { onSuccess: () => invalidate(tm) },
  );
}

export function useDeleteListField() {
  const invalidate = useInvalidate();
  return useSupabaseMutation(
    (fieldId: string) => supabase.from('tm_list_fields').delete().eq('id', fieldId).select().single(),
    { onSuccess: () => invalidate(tm) },
  );
}

// Atomic single-key edit (tm_set_task_field), same reason as table cells.
export function useSetTaskField() {
  const invalidate = useInvalidate();
  return useSupabaseMutation<TaskRow, { taskId: string; fieldId: string; value: unknown }>(
    (v) => supabase.rpc('tm_set_task_field', { p_task_id: v.taskId, p_field_id: v.fieldId, p_value: v.value as never }) as never,
    { onSuccess: () => invalidate(tm) },
  );
}

export interface ChecklistItem { id: string; checklist_id: string; body: string; done: boolean; position: number; created_at: string }
export interface Checklist { id: string; task_id: string; name: string; position: number; created_at: string; items: ChecklistItem[] }

export function useChecklists(taskId: string | null) {
  return useSupabaseQuery(
    [...tm, 'checklists', taskId ?? ''] as const,
    () =>
      supabase
        .from('tm_task_checklists')
        .select('*, items:tm_task_checklist_items(*)')
        .eq('task_id', taskId ?? '')
        .order('position')
        .order('created_at'),
    { enabled: !!taskId },
  );
}

export function useChecklistMutations() {
  const invalidate = useInvalidate();
  const done = { onSuccess: () => invalidate(tm) };
  return {
    addChecklist: useSupabaseMutation(
      (v: { taskId: string; name: string }) => supabase.from('tm_task_checklists').insert({ task_id: v.taskId, name: v.name }).select().single(),
      done,
    ),
    deleteChecklist: useSupabaseMutation(
      (id: string) => supabase.from('tm_task_checklists').delete().eq('id', id).select().single(),
      done,
    ),
    addItem: useSupabaseMutation(
      (v: { checklistId: string; body: string; position: number }) =>
        supabase.from('tm_task_checklist_items').insert({ checklist_id: v.checklistId, body: v.body, position: v.position }).select().single(),
      done,
    ),
    toggleItem: useSupabaseMutation(
      (v: { id: string; done: boolean }) => supabase.from('tm_task_checklist_items').update({ done: v.done }).eq('id', v.id).select().single(),
      done,
    ),
    deleteItem: useSupabaseMutation(
      (id: string) => supabase.from('tm_task_checklist_items').delete().eq('id', id).select().single(),
      done,
    ),
  };
}

export function useWatchers(taskId: string | null) {
  return useSupabaseQuery(
    [...tm, 'watchers', taskId ?? ''] as const,
    () => supabase.from('tm_task_watchers').select('user_id').eq('task_id', taskId ?? ''),
    { enabled: !!taskId },
  );
}

export function useToggleWatch(taskId: string) {
  const invalidate = useInvalidate();
  return useSupabaseMutation(
    (v: { userId: string; watch: boolean }) =>
      v.watch
        ? supabase.from('tm_task_watchers').insert({ task_id: taskId, user_id: v.userId }).select()
        : supabase.from('tm_task_watchers').delete().eq('task_id', taskId).eq('user_id', v.userId).select(),
    { onSuccess: () => invalidate(tm) },
  );
}

export const ATTACHMENT_BUCKET = 'tm-attachments';
export const ATTACHMENT_MAX_BYTES = 25 * 1024 * 1024;

export interface TaskAttachment {
  id: string;
  task_id: string;
  storage_path: string;
  file_name: string;
  size_bytes: number;
  mime_type: string | null;
  uploaded_by: string | null;
  created_at: string;
}

export function useAttachments(taskId: string | null) {
  return useSupabaseQuery(
    [...tm, 'attachments', taskId ?? ''] as const,
    () => supabase.from('tm_task_attachments').select('*').eq('task_id', taskId ?? '').order('created_at'),
    { enabled: !!taskId },
  );
}

// Upload the file, then record it. If recording fails, the uploaded file
// is removed again so storage doesn't collect orphans.
export function useUploadAttachment(taskId: string) {
  const invalidate = useInvalidate();
  return useMutation<void, Error, { file: File; userId: string }>({
    mutationFn: async ({ file, userId }) => {
      if (file.size > ATTACHMENT_MAX_BYTES) throw new Error(`${file.name} is over 25 MB`);
      const safeName = file.name.replace(/[^\w.-]+/g, '_');
      const path = `${userId}/${taskId}/${crypto.randomUUID()}-${safeName}`;
      const up = await supabase.storage.from(ATTACHMENT_BUCKET).upload(path, file, { contentType: file.type || undefined });
      if (up.error) throw new Error(up.error.message);
      const { error } = await supabase.from('tm_task_attachments').insert({
        task_id: taskId,
        storage_path: path,
        file_name: file.name,
        size_bytes: file.size,
        mime_type: file.type || null,
        uploaded_by: userId,
      });
      if (error) {
        await supabase.storage.from(ATTACHMENT_BUCKET).remove([path]);
        throw new Error(error.message);
      }
    },
    onSuccess: () => invalidate(tm),
  });
}

export function useDeleteAttachment() {
  const invalidate = useInvalidate();
  return useMutation<void, Error, TaskAttachment>({
    mutationFn: async (a) => {
      const { error } = await supabase.from('tm_task_attachments').delete().eq('id', a.id);
      if (error) throw new Error(error.message);
      await supabase.storage.from(ATTACHMENT_BUCKET).remove([a.storage_path]);
    },
    onSuccess: () => invalidate(tm),
  });
}

export async function attachmentUrl(path: string, download?: string): Promise<string> {
  const { data, error } = await supabase.storage.from(ATTACHMENT_BUCKET).createSignedUrl(path, 3600, download ? { download } : undefined);
  if (error || !data) throw new Error(error?.message ?? 'Could not open the file');
  return data.signedUrl;
}

export interface TaskActivity {
  id: string;
  task_id: string;
  actor_id: string | null;
  kind: string;
  detail: Record<string, unknown>;
  created_at: string;
}

export function useTaskActivity(taskId: string | null) {
  return useSupabaseQuery(
    [...tm, 'activity', taskId ?? ''] as const,
    () => supabase.from('tm_task_activity').select('*').eq('task_id', taskId ?? '').order('created_at').overrideTypes<TaskActivity[], { merge: false }>(),
    { enabled: !!taskId },
  );
}

// Company-wide dashboard (admins only): every top-level task in the org.
// The module is deliberately small, so this is one capped query that the
// page aggregates client-side.
export const DASHBOARD_TASK_LIMIT = 5000;
export function useAllTasksForDashboard(enabled: boolean) {
  return useSupabaseQuery(
    [...tm, 'dashboard'] as const,
    () =>
      supabase
        .from('tm_tasks')
        .select('*')
        .is('parent_id', null)
        .order('created_at', { ascending: false })
        .limit(DASHBOARD_TASK_LIMIT)
        .overrideTypes<TaskRow[], { merge: false }>(),
    { enabled },
  );
}
