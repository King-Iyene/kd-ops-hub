import type { SupabaseClient } from '@supabase/supabase-js';

// Mirrors the web app's own manual timer (src/features/timetrack/pages/TimePage.tsx:
// fetchAllActiveTasks + startTimer/stopTimer against time_entries). Desktop agent
// writes to the exact same table with the same shape — including the same
// entry_source value the web app uses. time_entries has a CHECK constraint
// (time_entries_entry_source_check) allowing only 'manual' | 'timer' | 'import';
// there is no separate value for "started from the desktop app" to distinguish
// it by, so this intentionally can't be told apart from a web-started timer in
// reports — confirmed against the live constraint, not assumed.
const ENTRY_SOURCE = 'timer';

export interface PickableTask {
  taskId: string;
  taskName: string;
  projectId: string;
  projectName: string;
  clientName: string | null;
  /** "Client · Project · Task" — precomputed once so the picker UI can do a
   * single case-insensitive substring filter without re-joining on every keystroke. */
  searchLabel: string;
}

export interface ActiveTimer {
  entryId: string;
  taskId: string;
  taskName: string;
  projectId: string;
  projectName: string;
  clientName: string | null;
  startTime: string; // ISO
}

export async function fetchPickableTasks(client: SupabaseClient): Promise<PickableTask[]> {
  const { data, error } = await client
    .from('time_tasks')
    .select('id, name, project_id, time_projects!inner(id, name, is_archived, client_id, time_clients(id, name))')
    .eq('is_archived', false)
    .eq('time_projects.is_archived', false)
    .order('name');
  if (error) throw error;
  type Row = {
    id: string;
    name: string;
    project_id: string;
    time_projects: { id: string; name: string; time_clients: { id: string; name: string } | null } | null;
  };
  return ((data ?? []) as unknown as Row[]).map((r) => {
    const projectName = r.time_projects?.name ?? '(no project)';
    const clientName = r.time_projects?.time_clients?.name ?? null;
    return {
      taskId: r.id,
      taskName: r.name,
      projectId: r.project_id,
      projectName,
      clientName,
      searchLabel: [clientName, projectName, r.name].filter(Boolean).join(' · '),
    };
  });
}

export async function getActiveTimer(client: SupabaseClient, employeeId: string): Promise<ActiveTimer | null> {
  const { data, error } = await client
    .from('time_entries')
    .select(
      'id, task_id, project_id, start_time, time_tasks(name, time_projects(name, time_clients(name)))',
    )
    .eq('employee_id', employeeId)
    .is('end_time', null)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  type Row = {
    id: string;
    task_id: string;
    project_id: string;
    start_time: string;
    time_tasks: { name: string; time_projects: { name: string; time_clients: { name: string } | null } | null } | null;
  };
  const row = data as unknown as Row;
  return {
    entryId: row.id,
    taskId: row.task_id,
    projectId: row.project_id,
    taskName: row.time_tasks?.name ?? 'Task',
    projectName: row.time_tasks?.time_projects?.name ?? '',
    clientName: row.time_tasks?.time_projects?.time_clients?.name ?? null,
    startTime: row.start_time,
  };
}

/** Stops whatever timer is currently open for this employee (if any), then
 * starts a new one on the chosen task — mirrors clicking a different task in
 * the web app's combobox, which the web UI itself doesn't even allow mid-run
 * (it disables the picker while a timer is active); the desktop tray is more
 * permissive (click a new task to switch directly), so this must be atomic
 * from the caller's point of view: old entry closed, new one open, never both
 * running at once. */
export async function switchTimer(
  client: SupabaseClient,
  employeeId: string,
  task: PickableTask,
): Promise<ActiveTimer> {
  const existing = await getActiveTimer(client, employeeId);
  if (existing) {
    await client.from('time_entries').update({ end_time: new Date().toISOString() }).eq('id', existing.entryId);
  }
  const startTime = new Date().toISOString();
  const { data, error } = await client
    .from('time_entries')
    .insert({
      employee_id: employeeId,
      task_id: task.taskId,
      project_id: task.projectId,
      start_time: startTime,
      entry_source: ENTRY_SOURCE,
    })
    .select('id')
    .single();
  if (error) throw error;
  return {
    entryId: data.id as string,
    taskId: task.taskId,
    projectId: task.projectId,
    taskName: task.taskName,
    projectName: task.projectName,
    clientName: task.clientName,
    startTime,
  };
}

export async function stopActiveTimer(client: SupabaseClient, entryId: string): Promise<void> {
  const { error } = await client.from('time_entries').update({ end_time: new Date().toISOString() }).eq('id', entryId);
  if (error) throw error;
}

/** Resuming a paused task is the same operation as switching to it — a new
 * time_entries row, same task_id/project_id. "Pause" itself needs no new
 * server-side concept: it's just stopActiveTimer() plus the caller (main.ts)
 * remembering which task to hand back here on Resume. This keeps the
 * existing time_entries model (sum of rows per task) intact with no schema
 * change — a paused-and-resumed task simply accumulates as multiple rows,
 * exactly like switching away and back already does. */
export const resumeTask = switchTimer;

/** Most recently worked-on tasks for this employee, most recent first,
 * deduped by task — the picker's "Suggested" section. Reads time_entries
 * (which this employee can always see their own rows of, per
 * time_entries_read's RLS) rather than a separate "recents" table, so there's
 * nothing extra to keep in sync. */
export async function fetchSuggestedTasks(
  client: SupabaseClient,
  employeeId: string,
  limit = 5,
): Promise<PickableTask[]> {
  const { data, error } = await client
    .from('time_entries')
    .select(
      'task_id, start_time, time_tasks!inner(id, name, project_id, is_archived, time_projects!inner(id, name, is_archived, client_id, time_clients(id, name)))',
    )
    .eq('employee_id', employeeId)
    .eq('time_tasks.is_archived', false)
    .eq('time_tasks.time_projects.is_archived', false)
    .not('task_id', 'is', null)
    .order('start_time', { ascending: false })
    .limit(limit * 6); // generous over-fetch before de-duping by task below
  if (error) throw error;
  type Row = {
    task_id: string;
    time_tasks: {
      id: string;
      name: string;
      project_id: string;
      time_projects: { id: string; name: string; time_clients: { id: string; name: string } | null } | null;
    } | null;
  };
  const seen = new Set<string>();
  const out: PickableTask[] = [];
  for (const r of (data ?? []) as unknown as Row[]) {
    const t = r.time_tasks;
    if (!t || seen.has(t.id)) continue;
    seen.add(t.id);
    const projectName = t.time_projects?.name ?? '(no project)';
    const clientName = t.time_projects?.time_clients?.name ?? null;
    out.push({
      taskId: t.id,
      taskName: t.name,
      projectId: t.project_id,
      projectName,
      clientName,
      searchLabel: [clientName, projectName, t.name].filter(Boolean).join(' · '),
    });
    if (out.length >= limit) break;
  }
  return out;
}

/** Inline "Create task…" from the picker. Subject to time_tasks' own RLS
 * (time_tasks_write: manage_tasks capability OR project manager of
 * project_id) — a regular employee creating a task under a project they
 * don't manage will get a permissions error back from Supabase, which the
 * caller surfaces rather than this function papering over it. */
export async function createTask(
  client: SupabaseClient,
  employeeId: string,
  projectId: string,
  projectName: string,
  clientName: string | null,
  name: string,
): Promise<PickableTask> {
  const { data, error } = await client
    .from('time_tasks')
    .insert({ project_id: projectId, name, created_by: employeeId })
    .select('id, name')
    .single();
  if (error) throw error;
  return {
    taskId: data.id as string,
    taskName: data.name as string,
    projectId,
    projectName,
    clientName,
    searchLabel: [clientName, projectName, data.name as string].filter(Boolean).join(' · '),
  };
}
