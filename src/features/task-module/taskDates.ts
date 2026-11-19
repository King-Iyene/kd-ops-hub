import * as chrono from 'chrono-node';
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

// "Draft the weekly report tomorrow 3pm" -> title "Draft the weekly report",
// due tomorrow. Uses the last date phrase in the name; a trailing "on",
// "by" or "due" before it goes too. Due dates are days, so a time is dropped.
// If the whole name is a date ("Friday"), it's left as the title.
export function parseDueFromName(name: string, ref = new Date()): { title: string; due: string | null } {
  const results = chrono.parse(name, ref, { forwardDate: true });
  const hit = results[results.length - 1];
  if (!hit) return { title: name.trim(), due: null };
  const before = name.slice(0, hit.index).replace(/\s+(due|by|on)\s*$/i, '');
  const title = `${before} ${name.slice(hit.index + hit.text.length)}`.replace(/\s+/g, ' ').trim();
  if (!title) return { title: name.trim(), due: null };
  return { title, due: format(hit.start.date(), 'yyyy-MM-dd') };
}
