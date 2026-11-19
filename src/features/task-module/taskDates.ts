import { differenceInCalendarDays, format, parseISO, startOfDay } from 'date-fns';
import type { TaskRow } from '@/queries/useTaskModule';

// due_date is a plain "YYYY-MM-DD"; parseISO reads it as local midnight
// (new Date() would read it as UTC midnight and can land on the wrong day).
export function dueDateOf(task: Pick<TaskRow, 'due_date'>): Date | null {
  return task.due_date ? parseISO(task.due_date) : null;
}

export function isOverdue(task: Pick<TaskRow, 'due_date' | 'status'>, today = startOfDay(new Date())): boolean {
  const due = dueDateOf(task);
  return !!due && task.status !== 'done' && due < today;
}

// "Today", "Tomorrow", a weekday name for the rest of the coming week,
// otherwise "15 Nov".
export function dueLabel(dueDate: string): string {
  const d = parseISO(dueDate);
  const diff = differenceInCalendarDays(d, new Date());
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff > 1 && diff < 7) return format(d, 'EEEE');
  return format(d, 'd MMM');
}
