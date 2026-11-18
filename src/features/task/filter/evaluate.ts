import { ME_VALUE, type FilterCondition, type FilterTree, type FilterValue, type RelativeDateKey } from './types';

export interface FilterableTask {
  title: string;
  status: string | null;
  priority: string;
  assignees: string[];
  due_date: string | null;
  start_date: string | null;
  created_at: string;
}

export interface FilterContext {
  now: Date;
  viewerId: string | undefined;
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function startOfWeek(d: Date): Date {
  const day = startOfDay(d);
  const diff = (day.getDay() + 6) % 7; // Monday-first, section 8 BEH-32.
  day.setDate(day.getDate() - diff);
  return day;
}

function relativeDateRange(key: RelativeDateKey, now: Date): { from: Date; to: Date } {
  const today = startOfDay(now);
  switch (key) {
    case 'today':
      return { from: today, to: today };
    case 'this_week': {
      const from = startOfWeek(now);
      const to = new Date(from);
      to.setDate(to.getDate() + 6);
      return { from, to };
    }
    case 'last_week': {
      const from = startOfWeek(now);
      from.setDate(from.getDate() - 7);
      const to = new Date(from);
      to.setDate(to.getDate() + 6);
      return { from, to };
    }
    case 'this_month': {
      const from = new Date(now.getFullYear(), now.getMonth(), 1);
      const to = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      return { from, to };
    }
    case 'last_30_days': {
      const to = today;
      const from = new Date(today);
      from.setDate(from.getDate() - 30);
      return { from, to };
    }
  }
}

function resolveDateValue(value: FilterValue, now: Date): { from: Date; to: Date } | null {
  if (!value) return null;
  if (typeof value === 'string') {
    const d = startOfDay(new Date(value));
    return { from: d, to: d };
  }
  if (!Array.isArray(value) && value.kind === 'relative') return relativeDateRange(value.key, now);
  if (!Array.isArray(value) && value.kind === 'range') {
    return { from: startOfDay(new Date(value.from)), to: startOfDay(new Date(value.to)) };
  }
  return null;
}

function resolvePersonValues(value: FilterValue, viewerId: string | undefined): string[] {
  const raw = Array.isArray(value) ? value : value && typeof value === 'string' ? [value] : [];
  return raw.map((v) => (v === ME_VALUE ? (viewerId ?? '') : v));
}

function evaluateCondition(task: FilterableTask, condition: FilterCondition, ctx: FilterContext): boolean {
  const { field, operator, value } = condition;
  const raw = (task as unknown as Record<string, unknown>)[field];

  if (operator === 'is_set') return raw != null && raw !== '' && !(Array.isArray(raw) && raw.length === 0);
  if (operator === 'is_not_set') return raw == null || raw === '' || (Array.isArray(raw) && raw.length === 0);

  if (field === 'assignees') {
    const people = resolvePersonValues(value, ctx.viewerId);
    const current = task.assignees;
    switch (operator) {
      case 'is': case 'is_any_of': return people.some((p) => current.includes(p));
      case 'is_not': case 'is_none_of': return !people.some((p) => current.includes(p));
      default: return false;
    }
  }

  if (field === 'due_date' || field === 'start_date' || field === 'created_at') {
    const fieldValue = raw as string | null;
    if (!fieldValue) return false;
    const fieldDay = startOfDay(new Date(fieldValue));
    const range = resolveDateValue(value, ctx.now);
    if (!range) return false;
    switch (operator) {
      case 'is': return fieldDay.getTime() === range.from.getTime();
      case 'is_before': return fieldDay.getTime() < range.from.getTime();
      case 'is_after': return fieldDay.getTime() > range.to.getTime();
      case 'is_on_or_before': return fieldDay.getTime() <= range.to.getTime();
      case 'is_on_or_after': return fieldDay.getTime() >= range.from.getTime();
      case 'is_within': return fieldDay.getTime() >= range.from.getTime() && fieldDay.getTime() <= range.to.getTime();
      default: return false;
    }
  }

  // Text and select fields (title, status, priority).
  const options = Array.isArray(value) ? value : value && typeof value === 'string' ? [value] : [];
  switch (operator) {
    case 'is': return raw === options[0];
    case 'is_not': return raw !== options[0];
    case 'is_any_of': return options.includes(raw as string);
    case 'is_none_of': return !options.includes(raw as string);
    case 'contains': return typeof raw === 'string' && typeof options[0] === 'string' && raw.toLowerCase().includes((options[0] as string).toLowerCase());
    case 'does_not_contain': return !(typeof raw === 'string' && typeof options[0] === 'string' && raw.toLowerCase().includes((options[0] as string).toLowerCase()));
    default: return false;
  }
}

/** The tree is an AND of its top-level nodes; an "or_group" node matches
 *  if any one of its conditions matches (one level of OR nesting). */
export function matchesFilter(task: FilterableTask, tree: FilterTree, ctx: FilterContext): boolean {
  return tree.every((node) => {
    if (node.kind === 'condition') return evaluateCondition(task, node.condition, ctx);
    return node.conditions.some((c) => evaluateCondition(task, c, ctx));
  });
}
