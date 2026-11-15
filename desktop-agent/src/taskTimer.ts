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
  projectName: string;
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
    .select('id, task_id, start_time, time_tasks(name, time_projects(name))')
    .eq('employee_id', employeeId)
    .is('end_time', null)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  type Row = { id: string; task_id: string; start_time: string; time_tasks: { name: string; time_projects: { name: string } | null } | null };
  const row = data as unknown as Row;
  return {
    entryId: row.id,
    taskId: row.task_id,
    taskName: row.time_tasks?.name ?? 'Task',
    projectName: row.time_tasks?.time_projects?.name ?? '',
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
    taskName: task.taskName,
    projectName: task.projectName,
    startTime,
  };
}

export async function stopActiveTimer(client: SupabaseClient, entryId: string): Promise<void> {
  const { error } = await client.from('time_entries').update({ end_time: new Date().toISOString() }).eq('id', entryId);
  if (error) throw error;
}
