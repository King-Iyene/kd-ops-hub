import {
  addDays, endOfDay, endOfWeek, isSameDay, parseISO, startOfDay, startOfMonth, subDays,
} from 'date-fns';
import type { TaskMove, TaskRow, TaskStatus } from '@/queries/useTaskModule';
import { dueDateOf, isOverdue } from './taskDates';

// Pure logic behind the task views: filter matching, sorting, and where a
// dragged row lands. Kept out of the components so it can be unit-tested.

// A ClickUp-style filter is a stack of conditions joined with AND, each one
// "<field> <operator> <values>". Conditions with nothing picked yet are
// ignored, so adding a filter never hides everything by surprise.
export type FilterField = 'status' | 'assignee' | 'priority' | 'tag' | 'list' | 'title' | 'due' | 'completed' | 'created' | 'updated';
export interface FilterCond { id: string; field: FilterField; negate: boolean; values: string[]; text: string }

/** A condition with nothing chosen is incomplete and filters nothing. */
export function isActive(c: FilterCond): boolean {
  return c.field === 'title' ? c.text.trim().length > 0 : c.values.length > 0;
}

function inPast(iso: string | null, bucket: string, now: Date): boolean {
  if (!iso) return false;
  const d = parseISO(iso);
  const today = startOfDay(now);
  switch (bucket) {
    case 'today': return d >= today;
    case 'yesterday': return d >= subDays(today, 1) && d < today;
    case 'last7': return d >= subDays(today, 6);
    case 'last30': return d >= subDays(today, 29);
    case 'month': return d >= startOfMonth(now);
    default: return false;
  }
}

function dueBucketMatches(t: TaskRow, bucket: string, now: Date): boolean {
  const today = startOfDay(now);
  const due = dueDateOf(t);
  switch (bucket) {
    case 'none': return !due;
    case 'overdue': return isOverdue(t, today);
    case 'today': return !!due && isSameDay(due, today);
    case 'tomorrow': return !!due && isSameDay(due, addDays(today, 1));
    case 'week': return !!due && due >= today && due <= endOfWeek(today, { weekStartsOn: 1 });
    case 'next7': return !!due && due >= today && due <= endOfDay(addDays(today, 7));
    case 'later': return !!due && due > endOfDay(addDays(today, 7));
    default: return false;
  }
}

function condMatches(t: TaskRow, c: FilterCond, meId: string | undefined, now: Date): boolean {
  let hit: boolean;
  switch (c.field) {
    case 'status': hit = c.values.includes(t.status); break;
    case 'priority': hit = c.values.includes(t.priority ?? 'none'); break;
    case 'assignee':
      hit = c.values.some((v) => (v === 'me' ? !!meId && t.assignee_id === meId : v === 'none' ? !t.assignee_id : t.assignee_id === v));
      break;
    case 'tag': hit = (t.tags ?? []).some((tag) => c.values.includes(tag)); break;
    case 'list': hit = c.values.includes(t.list_id); break;
    case 'title': hit = t.title.toLowerCase().includes(c.text.trim().toLowerCase()); break;
    case 'due': hit = c.values.some((v) => dueBucketMatches(t, v, now)); break;
    case 'completed':
      hit = c.values.some((v) => (v === 'not' ? t.status !== 'done' : t.status === 'done' && inPast(t.completed_at, v, now)));
      break;
    case 'created': hit = c.values.some((v) => inPast(t.created_at, v, now)); break;
    case 'updated': hit = c.values.some((v) => inPast(t.updated_at, v, now)); break;
    default: hit = true;
  }
  return c.negate ? !hit : hit;
}

export function matchesFilters(t: TaskRow, conds: FilterCond[], meId: string | undefined, now = new Date()): boolean {
  return conds.every((c) => !isActive(c) || condMatches(t, c, meId, now));
}

export type SortBy = 'manual' | 'due' | 'priority' | 'title' | 'created';
export type SortDir = 'asc' | 'desc';
const PRIORITY_RANK: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 };
const GAP = 1024;

/** Sort rows; tasks missing the sort value (no due date, no priority) always go last. */
export function sortTasks(rows: TaskRow[], by: SortBy, dir: SortDir): TaskRow[] {
  const flip = dir === 'desc' ? -1 : 1;
  const missingLast = (a: unknown, b: unknown) => (a == null ? (b == null ? 0 : 1) : b == null ? -1 : null);
  return [...rows].sort((a, b) => {
    if (by === 'manual') return a.position - b.position || a.created_at.localeCompare(b.created_at);
    if (by === 'due') return missingLast(a.due_date, b.due_date) ?? flip * a.due_date!.localeCompare(b.due_date!);
    if (by === 'priority') {
      const ra = a.priority ? PRIORITY_RANK[a.priority] : null;
      const rb = b.priority ? PRIORITY_RANK[b.priority] : null;
      return missingLast(ra, rb) ?? flip * (ra! - rb!);
    }
    if (by === 'title') return flip * a.title.localeCompare(b.title, undefined, { sensitivity: 'base' });
    return flip * b.created_at.localeCompare(a.created_at);
  });
}

/**
 * Where a dragged task lands among `items` (the target group in display
 * order, without the dragged task) when dropped before index `at`.
 * Uses the gap between neighbours when there is one, otherwise renumbers
 * the group.
 */
export function planMove(items: TaskRow[], dragged: TaskRow, at: number, status?: TaskStatus): TaskMove[] {
  const prev = items[at - 1];
  const next = items[at];
  let pos: number | null;
  if (!prev && !next) pos = GAP;
  else if (!prev) pos = next.position - GAP;
  else if (!next) pos = prev.position + GAP;
  else pos = next.position - prev.position > 1 ? Math.floor((prev.position + next.position) / 2) : null;
  if (pos !== null) return [{ task: dragged, position: pos, status }];
  const order = [...items.slice(0, at), dragged, ...items.slice(at)];
  return order
    .map((t, i) => ({ task: t, position: (i + 1) * GAP, status: t.id === dragged.id ? status : undefined }))
    .filter((m) => m.task.id === dragged.id || m.task.position !== m.position);
}

