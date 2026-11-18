import type { TaskRow } from '../api/tasks';

export type SortBy = 'manual' | 'due_date' | 'priority' | 'created_at' | 'title';

const PRIORITY_RANK: Record<string, number> = { urgent: 0, high: 1, normal: 2, low: 3 };

export function sortTasks(tasks: TaskRow[], sortBy: SortBy): TaskRow[] {
  if (sortBy === 'manual') return tasks;
  const sorted = [...tasks];
  sorted.sort((a, b) => {
    switch (sortBy) {
      case 'due_date':
        if (!a.due_date && !b.due_date) return 0;
        if (!a.due_date) return 1;
        if (!b.due_date) return -1;
        return a.due_date.localeCompare(b.due_date);
      case 'priority':
        return PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
      case 'created_at':
        return a.created_at.localeCompare(b.created_at);
      case 'title':
        return a.title.localeCompare(b.title);
      default:
        return 0;
    }
  });
  return sorted;
}
