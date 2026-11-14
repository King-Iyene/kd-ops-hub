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
