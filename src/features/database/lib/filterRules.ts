import type { Filter, FilterGroup } from '../types';

/**
 * Small rules about filters, kept apart from the query code so they can be tested without a database.
 */

/** Operators that need no value to be complete ("is empty", "is checked", "in the past week"). */
const NO_VALUE_OPERATORS = new Set([
  'isEmpty',
  'isNotEmpty',
  'isChecked',
  'isNotChecked',
  'isWithinPastWeek',
  'isWithinPastMonth',
  'isWithinPastYear',
]);

function isBlankValue(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === 'string') return value.trim() === '';
  if (Array.isArray(value)) return value.length === 0 || value.every(isBlankValue);
  return false;
}

/**
 * True for a filter that has been added but not finished (no value yet). Such a filter must not narrow the
 * rows: "Name is [blank]" matches nothing, so adding a filter used to make every row disappear until a value
 * was typed. A "between" needs both ends.
 */
export function isIncompleteFilter(operator: string, value: unknown): boolean {
  if (NO_VALUE_OPERATORS.has(operator)) return false;
  if (operator === 'isBetween') {
    const parts = Array.isArray(value) ? value : typeof value === 'string' ? value.split(',') : [];
    return parts.length < 2 || isBlankValue(parts[0]) || isBlankValue(parts[1]);
  }
  return isBlankValue(value);
}

/** The filters that really apply (finished ones). */
export function completeFilters(filters: readonly Filter[] | undefined): Filter[] {
  return (filters ?? []).filter((f) => !isIncompleteFilter(f.operator, f.value));
}

function countInGroup(group: FilterGroup): number {
  return completeFilters(group.filters).length + (group.groups ?? []).reduce((n, g) => n + countInGroup(g), 0);
}

/** A value made safe to put inside a PostgREST filter string: in double quotes, with quotes and backslashes escaped. */
export function pgQuote(value: unknown): string {
  return `"${String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

/** Column types that are plain text, where "empty" can also mean an empty string. */
export function isTextColumn(pgType: string | undefined): boolean {
  if (!pgType) return false;
  const t = pgType.toUpperCase();
  return (t === 'TEXT' || t.startsWith('VARCHAR') || t.startsWith('CHARACTER VARYING')) && !t.endsWith('[]');
}

export interface Narrowing {
  /** Something is narrowing the rows. */
  active: boolean;
  conditions: number;
  hasSearch: boolean;
  /** A sentence for the "no rows match" message. */
  text: string;
}

/** What is narrowing the rows, in words: used to say why nothing shows, instead of "No records yet". */
export function describeNarrowing(input: {
  filters?: readonly Filter[];
  groups?: readonly FilterGroup[];
  search?: string;
}): Narrowing {
  const conditions = completeFilters(input.filters).length + (input.groups ?? []).reduce((n, g) => n + countInGroup(g), 0);
  const hasSearch = !!input.search?.trim();
  const parts: string[] = [];
  if (conditions > 0) parts.push(conditions === 1 ? '1 filter' : `${conditions} filters`);
  if (hasSearch) parts.push(`the search "${input.search!.trim()}"`);
  const active = parts.length > 0;
  return {
    active,
    conditions,
    hasSearch,
    text: active ? `${parts.join(' and ')} ${parts.length > 1 || conditions > 1 ? 'are' : 'is'} hiding every row.` : '',
  };
}
