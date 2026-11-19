import { addDays, endOfDay, parseISO, startOfDay, startOfWeek, subWeeks } from 'date-fns';
import { TASK_STATUSES, type TaskRow, type TaskStatus } from '@/queries/useTaskModule';
import { dueDateOf, isOverdue } from './taskDates';

// Everything the company-wide Task dashboard shows, worked out from the
// task rows in one pass so the page stays a pure render.

export interface PersonLoad { id: string | null; open: number; overdue: number; dueSoon: number; completed: number }
export interface ListLoad { listId: string; open: number; overdue: number; completed: number; total: number; done: number }

export interface DashboardStats {
  total: number;
  open: number;
  overdue: number;
  dueSoon: number;
  unassignedOpen: number;
  completedInRange: number;
  createdInRange: number;
  byStatus: { status: TaskStatus; count: number }[];
  weekly: { weekStart: Date; completed: number }[];
  people: PersonLoad[];
  lists: ListLoad[];
  overdueTasks: TaskRow[];
}

export const WEEKS_SHOWN = 8;

export interface DateRange { from: Date; to: Date }

/**
 * Completed / created counts use the date range; the weekly chart shows the
 * 8 weeks ending with the range's last week. Open, overdue and due-soon are
 * always as of today.
 */
export function computeDashboard(tasks: TaskRow[], range: DateRange, now = new Date()): DashboardStats {
  const today = startOfDay(now);
  const soonEnd = endOfDay(addDays(today, 7));
  const rangeStart = startOfDay(range.from);
  const rangeEnd = endOfDay(range.to);
  const inRange = (d: Date) => d >= rangeStart && d <= rangeEnd;
  const firstWeek = startOfWeek(subWeeks(startOfDay(range.to), WEEKS_SHOWN - 1), { weekStartsOn: 1 });
  const lastWeekEnd = endOfDay(addDays(firstWeek, WEEKS_SHOWN * 7 - 1));

  const byStatus = new Map<TaskStatus, number>(TASK_STATUSES.map((s) => [s, 0]));
  const weekly = Array.from({ length: WEEKS_SHOWN }, (_, i) => ({ weekStart: addDays(firstWeek, i * 7), completed: 0 }));
  const people = new Map<string | null, PersonLoad>();
  const lists = new Map<string, ListLoad>();
  const person = (id: string | null) => {
    let p = people.get(id);
    if (!p) { p = { id, open: 0, overdue: 0, dueSoon: 0, completed: 0 }; people.set(id, p); }
    return p;
  };
  const list = (id: string) => {
    let l = lists.get(id);
    if (!l) { l = { listId: id, open: 0, overdue: 0, completed: 0, total: 0, done: 0 }; lists.set(id, l); }
    return l;
  };

  let open = 0, overdue = 0, dueSoon = 0, unassignedOpen = 0, completedInRange = 0, createdInRange = 0;
  const overdueTasks: TaskRow[] = [];

  for (const t of tasks) {
    byStatus.set(t.status, (byStatus.get(t.status) ?? 0) + 1);
    const l = list(t.list_id);
    l.total += 1;
    if (inRange(parseISO(t.created_at))) createdInRange += 1;

    if (t.status === 'done') {
      l.done += 1;
      const at = t.completed_at ? parseISO(t.completed_at) : null;
      if (at && inRange(at)) {
        completedInRange += 1;
        l.completed += 1;
        person(t.assignee_id).completed += 1;
      }
      if (at && at >= firstWeek && at <= lastWeekEnd) {
        const w = Math.floor((startOfWeek(at, { weekStartsOn: 1 }).getTime() - firstWeek.getTime()) / (7 * 864e5));
        if (w >= 0 && w < WEEKS_SHOWN) weekly[w].completed += 1;
      }
      continue;
    }

    open += 1;
    l.open += 1;
    const p = person(t.assignee_id);
    p.open += 1;
    if (!t.assignee_id) unassignedOpen += 1;
    const due = dueDateOf(t);
    if (isOverdue(t, today)) {
      overdue += 1; l.overdue += 1; p.overdue += 1;
      overdueTasks.push(t);
    } else if (due && due <= soonEnd) {
      dueSoon += 1; p.dueSoon += 1;
    }
  }

  return {
    total: tasks.length,
    open, overdue, dueSoon, unassignedOpen, completedInRange, createdInRange,
    byStatus: TASK_STATUSES.map((s) => ({ status: s, count: byStatus.get(s) ?? 0 })),
    weekly,
    // Busiest first; "Unassigned" always last.
    people: [...people.values()]
      .filter((p) => p.open + p.completed > 0)
      .sort((a, b) => (a.id === null ? 1 : b.id === null ? -1 : b.open - a.open || b.overdue - a.overdue)),
    lists: [...lists.values()].sort((a, b) => b.open - a.open || b.total - a.total),
    // Longest overdue first.
    overdueTasks: overdueTasks.sort((a, b) => (a.due_date ?? '').localeCompare(b.due_date ?? '')),
  };
}

/** Whole days a task is past its due date. */
export function daysOverdue(t: TaskRow, now = new Date()): number {
  const due = dueDateOf(t);
  if (!due) return 0;
  return Math.max(0, Math.round((startOfDay(now).getTime() - startOfDay(due).getTime()) / 864e5));
}
