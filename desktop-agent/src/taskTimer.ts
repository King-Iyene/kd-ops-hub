import type { SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';
import { queueInsert, queueUpdate, writeOrQueue } from './offlineQueue';

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

export interface PickableProject {
  projectId: string;
  projectName: string;
  clientName: string | null;
}

/**
 * The projects this person may track time on, or null when that cannot be worked out (then nothing is hidden: a blank picker is worse than
 * a project too many, and the database still refuses time on a project that is not theirs). A project marked "assigned only" is offered
 * only to the people assigned to it, its project manager and admins; every other project is offered to everyone.
 */
export async function fetchMyProjectIds(client: SupabaseClient): Promise<Set<string> | null> {
  try {
    const { data, error } = await (client as unknown as { rpc: (fn: string) => Promise<{ data: unknown; error: unknown }> }).rpc('time_my_project_ids');
    if (error || !Array.isArray(data)) return null;
    return new Set((data as unknown[]).map(String));
  } catch {
    return null;
  }
}

/** All active projects, independent of whether any task exists under them yet.
 * fetchPickableTasks (below) only sees projects that already have at least one
 * task — so a brand-new project with zero tasks is invisible to it, which
 * means the "Create task" dialog's project dropdown (built from that task
 * list) could never offer a new project as a choice, blocking creation of the
 * very first task in it. This is queried directly from time_projects instead
 * so that gap doesn't exist — confirmed time_projects_read's RLS (`qual: true`)
 * allows any signed-in employee to read it, not just managers. */
export async function fetchAllProjects(client: SupabaseClient): Promise<PickableProject[]> {
  const { data, error } = await client
    .from('time_projects')
    .select('id, name, time_clients(id, name)')
    .eq('is_archived', false)
    .order('name');
  if (error) throw error;
  type Row = { id: string; name: string; time_clients: { id: string; name: string } | null };
  const mine = await fetchMyProjectIds(client);
  return ((data ?? []) as unknown as Row[]).filter((r) => !mine || mine.has(r.id)).map((r) => ({
    projectId: r.id,
    projectName: r.name,
    clientName: r.time_clients?.name ?? null,
  }));
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
  const mine = await fetchMyProjectIds(client);
  return ((data ?? []) as unknown as Row[]).filter((r) => !mine || mine.has(r.project_id)).map((r) => {
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
// Every timer write (start, switch, pause, stop) goes through this one chain, in the
// order it was requested. They run in the background (so the UI never waits on the
// network), and without this a "stop" could reach the offline queue BEFORE the
// "start" it belongs to; replayed in that order the stop finds no row, and the
// entry would stay open forever.
let timerWrites: Promise<unknown> = Promise.resolve();
function enqueueTimerWrite(job: () => Promise<void>): Promise<void> {
  const run = timerWrites.then(job, job);
  timerWrites = run.catch(() => undefined);
  return run;
}

export function switchTimer(
  client: SupabaseClient,
  employeeId: string,
  task: PickableTask,
  knownActive?: ActiveTimer | null,
): Promise<ActiveTimer> {
  // Returns IMMEDIATELY with the new timer and does the server work in the
  // background. Every server call can take many seconds to fail when the
  // connection is dead or flaky, and the old version awaited all of them before
  // the widget could react, so starting a task felt frozen offline. The ids and
  // timestamps are generated here, so nothing depends on a round trip: writes
  // either land now or sit in the offline queue and upload later, in order.
  const now = new Date().toISOString();
  const entryId = randomUUID();
  const payload = {
    id: entryId,
    employee_id: employeeId,
    task_id: task.taskId,
    project_id: task.projectId,
    start_time: now,
    entry_source: ENTRY_SOURCE,
  };

  void enqueueTimerWrite(async () => {
    // Close whatever is running (the web app may have started something this app
    // doesn't know about, so ask the server; offline, fall back to what we know).
    let existing: ActiveTimer | null = null;
    try {
      existing = await getActiveTimer(client, employeeId);
    } catch {
      existing = knownActive ?? null;
    }
    if (existing && existing.entryId !== entryId) {
      const old = existing;
      await writeOrQueue(
        () => client.from('time_entries').update({ end_time: now }).eq('id', old.entryId),
        () => queueUpdate('time_entries', old.entryId, { end_time: now }, { column: 'id', value: old.entryId }),
      );
    }
    await writeOrQueue(
      () => client.from('time_entries').insert(payload),
      () => queueInsert('time_entries', payload),
    );
  }).catch((err) => console.error('[taskTimer] start/switch write failed:', err));

  return Promise.resolve({
    entryId,
    taskId: task.taskId,
    projectId: task.projectId,
    taskName: task.taskName,
    projectName: task.projectName,
    clientName: task.clientName,
    startTime: now,
  });
}

export function stopActiveTimer(client: SupabaseClient, entryId: string, endAtIso?: string): Promise<void> {
  // captured now (or given: idle / sleep / crash recovery end the entry at the moment the
  // person actually stopped working, not at the moment we noticed), never when the write runs
  const endTime = endAtIso ?? new Date().toISOString();
  return enqueueTimerWrite(() =>
    writeOrQueue(
      () => client.from('time_entries').update({ end_time: endTime }).eq('id', entryId),
      () => queueUpdate('time_entries', entryId, { end_time: endTime }, { column: 'id', value: entryId }),
    ),
  );
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
  const mine = await fetchMyProjectIds(client);
  for (const r of (data ?? []) as unknown as Row[]) {
    const t = r.time_tasks;
    if (!t || seen.has(t.id)) continue;
    if (mine && !mine.has(t.project_id)) continue; // recently used, but no longer assigned to this project
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
