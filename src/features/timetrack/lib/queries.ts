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
