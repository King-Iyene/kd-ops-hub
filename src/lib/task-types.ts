export type Priority = 'critical' | 'high' | 'normal' | 'low';
export type TaskStatus = 'open' | 'in_progress' | 'blocked' | 'complete';

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
