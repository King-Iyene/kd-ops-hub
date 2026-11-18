/**
 * The shared filter engine (master prompt section 8's `FilterBuilder`,
 * and the "Shared rules" paragraph under 7.3): "The same filter engine
 * powers views, Home cards and the Team Dashboard and must behave
 * identically in all three." Kept independent of any one screen so Home
 * (Phase 7) and the Team Dashboard (Phase 11) can reuse it unchanged.
 */

export type FilterFieldType = 'text' | 'select' | 'person' | 'date';

export type FilterOperator =
  | 'is' | 'is_not' | 'is_any_of' | 'is_none_of'
  | 'contains' | 'does_not_contain'
  | 'is_set' | 'is_not_set'
  | 'gt' | 'gte' | 'lt' | 'lte'
  | 'is_before' | 'is_after' | 'is_on_or_before' | 'is_on_or_after' | 'is_within';

export const OPERATORS_BY_FIELD_TYPE: Record<FilterFieldType, FilterOperator[]> = {
  text: ['contains', 'does_not_contain', 'is_set', 'is_not_set'],
  select: ['is', 'is_not', 'is_any_of', 'is_none_of', 'is_set', 'is_not_set'],
  person: ['is', 'is_not', 'is_any_of', 'is_none_of', 'is_set', 'is_not_set'],
  date: ['is', 'is_before', 'is_after', 'is_on_or_before', 'is_on_or_after', 'is_within', 'is_set', 'is_not_set'],
};

export const OPERATOR_LABELS: Record<FilterOperator, string> = {
  is: 'is',
  is_not: 'is not',
  is_any_of: 'is any of',
  is_none_of: 'is none of',
  contains: 'contains',
  does_not_contain: 'does not contain',
  is_set: 'is set',
  is_not_set: 'is not set',
  gt: 'greater than',
  gte: 'greater or equal',
  lt: 'less than',
  lte: 'less or equal',
  is_before: 'is before',
  is_after: 'is after',
  is_on_or_before: 'is on or before',
  is_on_or_after: 'is on or after',
  is_within: 'is within',
};

/** The sentinel resolved to the viewer's own id at evaluation time. */
export const ME_VALUE = '__me__';

export type RelativeDateKey = 'today' | 'this_week' | 'last_week' | 'this_month' | 'last_30_days';

export type FilterValue =
  | string
  | string[]
  | { kind: 'relative'; key: RelativeDateKey }
  | { kind: 'range'; from: string; to: string }
  | null;

export interface FilterCondition {
  id: string;
  field: string;
  operator: FilterOperator;
  value: FilterValue;
}

export type FilterNode =
  | { kind: 'condition'; condition: FilterCondition }
  | { kind: 'or_group'; id: string; conditions: FilterCondition[] };

/** The whole tree is an implicit AND of its top-level nodes; an OR group
 *  is the one level of nesting the PRD allows. */
export type FilterTree = FilterNode[];

export interface FilterFieldDef {
  key: string;
  label: string;
  type: FilterFieldType;
  /** For select fields: the fixed option list (e.g. priority). Status and
   *  person fields resolve their options from live data instead. */
  options?: { value: string; label: string }[];
}
