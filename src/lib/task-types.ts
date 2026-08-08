export type Priority = 'critical' | 'high' | 'normal' | 'low';
export type TaskStatus = 'open' | 'in_progress' | 'blocked' | 'complete';
export type TaskType = 'task' | 'milestone' | 'bug' | 'feature';
export type DependencyType = 'blocks' | 'is_blocked_by' | 'relates_to';

export interface Task {
  id: string;
  title: string;
  description: string | null;
  assignee_id: string | null;
  due_date: string | null;
  priority: Priority;
  status: TaskStatus;
  created_by: string | null;
  completed_at: string | null;
  created_at: string;
  tags: string[] | null;
  parent_id: string | null;
  project_id: string | null;
  list_id: string | null;
  sort_order: number;
  start_date: string | null;
  time_estimate_minutes: number | null;
  time_spent_minutes: number;
  task_type: TaskType;
  blocked_reason: string | null;
  goal_id: string | null;
}

export interface ProfileRow {
  id: string;
  full_name: string;
  email: string;
}

export interface Tag {
  id: string;
  name: string;
  color: string | null;
  module: string | null;
}

export interface TaskComment {
  id: string;
  task_id: string;
  author_id: string;
  body: string;
  created_at: string;
}

export interface TaskDependency {
  id: string;
  task_id: string;
  depends_on_id: string;
  dependency_type: DependencyType;
  created_at: string;
}

export interface TaskChecklist {
  id: string;
  task_id: string;
  title: string;
  is_checked: boolean;
  assignee_id: string | null;
  sort_order: number;
  created_at: string;
}

export interface TaskTimeEntry {
  id: string;
  task_id: string;
  user_id: string;
  started_at: string;
  ended_at: string | null;
  duration_minutes: number | null;
  description: string | null;
  created_at: string;
}

export interface TaskList {
  id: string;
  project_id: string | null;
  space_id: string | null;
  folder_id: string | null;
  name: string;
  color: string | null;
  sort_order: number;
  created_at: string;
}

export interface SpaceFolder {
  id: string;
  space_id: string;
  name: string;
  color: string | null;
  sort_order: number;
  created_by: string | null;
  created_at: string;
}

export interface SpaceStatus {
  id: string;
  space_id: string;
  name: string;
  color: string;
  status_group: 'not_started' | 'active' | 'done' | 'closed';
  sort_order: number;
}

export const STATUSES: { value: TaskStatus; label: string }[] = [
  { value: 'open', label: 'Open' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'blocked', label: 'Blocked' },
  { value: 'complete', label: 'Complete' },
];

export const PRIORITY_OPTIONS: { value: Priority; label: string }[] = [
  { value: 'critical', label: 'Critical' },
  { value: 'high', label: 'High' },
  { value: 'normal', label: 'Normal' },
  { value: 'low', label: 'Low' },
];

export const PRIORITY_CLASS: Record<Priority, string> = {
  critical: 'bg-destructive/10 text-destructive border border-destructive/30',
  high: 'bg-warning/10 text-warning border border-warning/30',
  normal: 'bg-info/10 text-info border border-info/30',
  low: 'bg-muted text-muted-foreground border border-border',
};

export const STATUS_CLASS: Record<TaskStatus, string> = {
  open: 'bg-muted text-muted-foreground',
  in_progress: 'bg-info/10 text-info',
  blocked: 'bg-destructive/10 text-destructive',
  complete: 'bg-success/10 text-success',
};

export const STATUS_DOT: Record<TaskStatus, string> = {
  open: 'bg-slate-400',
  in_progress: 'bg-blue-500',
  blocked: 'bg-red-500',
  complete: 'bg-green-500',
};

export const PRIORITY_BORDER: Record<Priority, string> = {
  critical: 'border-l-destructive',
  high: 'border-l-warning',
  normal: 'border-l-info',
  low: 'border-l-border',
};
