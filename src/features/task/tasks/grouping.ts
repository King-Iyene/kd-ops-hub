import type { TaskStatus } from '../api/statuses';
import type { TaskRow } from '../api/tasks';
import type { TaskGroupDef } from './TaskGroupSection';

export type ListGroupBy = 'status' | 'assignee' | 'priority' | 'due_date';

const PRIORITY_GROUPS: TaskGroupDef[] = [
  { key: 'urgent', label: 'Urgent' },
  { key: 'high', label: 'High' },
  { key: 'normal', label: 'Normal' },
  { key: 'low', label: 'Low' },
];

const DUE_DATE_GROUPS: TaskGroupDef[] = [
  { key: 'overdue', label: 'Overdue' },
  { key: 'today', label: 'Today' },
  { key: 'this_week', label: 'This week' },
  { key: 'later', label: 'Later' },
  { key: 'no_date', label: 'No due date' },
];

function dueDateBucket(dueDate: string | null, now: Date): string {
  if (!dueDate) return 'no_date';
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const due = new Date(`${dueDate}T00:00:00`);
  const diffDays = Math.round((due.getTime() - today.getTime()) / 86_400_000);
  if (diffDays < 0) return 'overdue';
  if (diffDays === 0) return 'today';
  if (diffDays <= 6) return 'this_week';
  return 'later';
}

export function groupTasks(
  tasks: TaskRow[],
  groupBy: ListGroupBy,
  statuses: TaskStatus[],
  now: Date,
): { groups: TaskGroupDef[]; byGroup: Map<string, TaskRow[]> } {
  let groups: TaskGroupDef[];

  if (groupBy === 'priority') {
    groups = PRIORITY_GROUPS;
  } else if (groupBy === 'due_date') {
    groups = DUE_DATE_GROUPS;
  } else if (groupBy === 'assignee') {
    const seen = new Map<string, string>();
    for (const t of tasks) for (const a of t.assignees) seen.set(a.user_id, a.full_name);
    groups = [...seen.entries()].map(([key, label]) => ({ key, label })).concat([{ key: 'unassigned', label: 'Unassigned' }]);
  } else {
    groups = [...statuses].sort((a, b) => a.position - b.position).map((s) => ({ key: s.id, label: s.name, color: s.color }));
  }

  const byGroup = new Map<string, TaskRow[]>();
  for (const g of groups) byGroup.set(g.key, []);

  for (const t of tasks) {
    let key: string;
    if (groupBy === 'priority') key = t.priority;
    else if (groupBy === 'due_date') key = dueDateBucket(t.due_date, now);
    else if (groupBy === 'assignee') key = t.assignees[0]?.user_id ?? 'unassigned';
    else key = t.status_id ?? '';
    if (byGroup.has(key)) byGroup.get(key)!.push(t);
  }

  return { groups, byGroup };
}
