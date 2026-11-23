import { supabase } from '@/lib/supabase';
import type { TimeProject, TimeTask, TimeTag } from './types';

export async function fetchActiveProjects(): Promise<TimeProject[]> {
  const { data, error } = await supabase
    .from('time_projects')
    .select('*')
    .eq('is_archived', false)
    .order('name');
  if (error) throw error;
  return (data ?? []) as TimeProject[];
}

/** Every project regardless of archived status — for report filter dropdowns
 * where the person explicitly controls Active/archived via its own filter. */
export async function fetchAllProjects(): Promise<TimeProject[]> {
  const { data, error } = await supabase.from('time_projects').select('*').order('name');
  if (error) throw error;
  return (data ?? []) as TimeProject[];
}

export async function fetchTasksForProject(projectId: string): Promise<TimeTask[]> {
  const { data, error } = await supabase
    .from('time_tasks')
    .select('*')
    .eq('project_id', projectId)
    .eq('is_archived', false)
    .order('name');
  if (error) throw error;
  return (data ?? []) as TimeTask[];
}

/**
 * The projects the signed-in person may track time on, or null when that cannot be worked out (then nothing is hidden: a blank tracker is worse
 * than a project too many, and the database still refuses time on a project that is not theirs). Admins and project managers get their own
 * projects; everyone gets every project that is not "assigned only".
 */
export async function fetchMyProjectIds(): Promise<Set<string> | null> {
  const { data, error } = await (supabase as unknown as { rpc: (fn: string) => Promise<{ data: unknown; error: unknown }> }).rpc('time_my_project_ids');
  if (error || !Array.isArray(data)) return null;
  return new Set((data as unknown[]).map(String));
}

/** Active projects the person may track on: what the tracker's pickers offer. The Projects page and reports use fetchActiveProjects (all of them). */
export async function fetchTrackableProjects(): Promise<TimeProject[]> {
  const [projects, mine] = await Promise.all([fetchActiveProjects(), fetchMyProjectIds()]);
  return mine ? projects.filter((p) => mine.has(p.id)) : projects;
}

export async function fetchAllTags(): Promise<TimeTag[]> {
  const { data, error } = await supabase.from('time_tags').select('*').order('name');
  if (error) throw error;
  return (data ?? []) as TimeTag[];
}

export interface TaskWithProject extends TimeTask {
  time_projects: { id: string; name: string } | null;
}

/** All non-archived tasks across all non-archived projects, project name
 * joined in — for the "What are you working on?" combobox, which needs the
 * full project→task tree up front rather than lazily loading one project's
 * tasks at a time. */
export async function fetchAllActiveTasks(): Promise<TaskWithProject[]> {
  const { data, error } = await supabase
    .from('time_tasks')
    .select('*, time_projects!inner(id, name, is_archived)')
    .eq('is_archived', false)
    .eq('time_projects.is_archived', false)
    .order('name');
  if (error) throw error;
  return (data ?? []) as TaskWithProject[];
}

/** fetchAllActiveTasks limited to the projects the person may track on. */
export async function fetchTrackableTasks(): Promise<TaskWithProject[]> {
  const [tasks, mine] = await Promise.all([fetchAllActiveTasks(), fetchMyProjectIds()]);
  return mine ? tasks.filter((t) => mine.has(t.project_id)) : tasks;
}
