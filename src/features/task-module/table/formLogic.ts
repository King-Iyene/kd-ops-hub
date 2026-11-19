import type { CondOp, FormCondition, FormLogic, FormRule, TableField, TableFieldType } from '@/queries/useTaskModule';

// Show/hide rules for form questions. This mirrors tm_form_cond_met /
// tm_form_rule_visible in the database exactly — the server re-runs the same
// rules on every submission, so what the page hides is also what it ignores.
// Rules are evaluated top to bottom: a hidden question counts as unanswered
// for every rule below it, so a rule can only depend on questions above it.

const NUM = /^-?\d+(\.\d+)?$/;

const isEmptyAnswer = (a: unknown) => a == null || a === '' || a === false || (Array.isArray(a) && a.length === 0);
const asTexts = (a: unknown): string[] => (a == null ? [] : Array.isArray(a) ? a.map(String) : [String(a)]);
const asNumber = (x: unknown): number | null => {
  if (typeof x === 'number' && Number.isFinite(x)) return x;
  if (typeof x === 'string' && NUM.test(x)) return Number(x);
  return null;
};

export function condMet(answer: unknown, op: CondOp, value: unknown): boolean {
  const texts = asTexts(answer);
  const v = value == null ? null : Array.isArray(value) ? null : String(value);
  switch (op) {
    case 'is_empty': return isEmptyAnswer(answer);
    case 'not_empty': return !isEmptyAnswer(answer);
    case 'checked': return answer === true;
    case 'unchecked': return answer !== true;
    case 'is':
    case 'is_not': {
      const hit = v !== null && texts.some((t) => t === v || (NUM.test(t) && NUM.test(v) && Number(t) === Number(v)));
      return op === 'is' ? hit : !hit;
    }
    case 'is_any_of':
    case 'is_none_of': {
      const want = Array.isArray(value) ? value.map(String) : [];
      const hit = texts.some((t) => want.includes(t));
      return op === 'is_any_of' ? hit : !hit;
    }
    case 'contains':
    case 'not_contains': {
      const hit = v !== null && v !== '' && texts.some((t) => t.toLowerCase().includes(v.toLowerCase()));
      return op === 'contains' ? hit : !hit;
    }
    case 'gt': case 'gte': case 'lt': case 'lte': {
      const a = asNumber(answer);
      const b = asNumber(value);
      if (a === null || b === null) return false;
      return op === 'gt' ? a > b : op === 'gte' ? a >= b : op === 'lt' ? a < b : a <= b;
    }
    default: return false;
  }
}

/** Is a question shown, given the answers of the questions shown above it? */
export function ruleVisible(rule: FormRule | undefined, answers: Record<string, unknown>): boolean {
  if (!rule || !Array.isArray(rule.conditions) || rule.conditions.length === 0) return true;
  const results = rule.conditions.map((c) => condMet(answers[c.field], c.op, c.value));
  const met = rule.match === 'any' ? results.some(Boolean) : results.every(Boolean);
  return rule.mode === 'hide' ? !met : met;
}

/**
 * Which questions are shown, top to bottom, and the answers that count (a
 * hidden question's answer is thrown away).
 */
export function computeVisible(orderedIds: string[], logic: FormLogic, answers: Record<string, unknown>) {
  const shown = new Set<string>();
  const effective: Record<string, unknown> = {};
  for (const id of orderedIds) {
    if (ruleVisible(logic[id], effective)) {
      shown.add(id);
      if (id in answers) effective[id] = answers[id];
    }
  }
  return { shown, effective };
}

// ── What the builder offers ─────────────────────────────────────────────

const OPS_BY_TYPE: Partial<Record<TableFieldType, CondOp[]>> = {
  single_select: ['is', 'is_not', 'is_any_of', 'is_none_of', 'is_empty', 'not_empty'],
  multi_select: ['is', 'is_not', 'is_any_of', 'is_none_of', 'is_empty', 'not_empty'],
  checkbox: ['checked', 'unchecked'],
  number: ['is', 'is_not', 'gt', 'gte', 'lt', 'lte', 'is_empty', 'not_empty'],
  currency: ['is', 'is_not', 'gt', 'gte', 'lt', 'lte', 'is_empty', 'not_empty'],
  rating: ['is', 'is_not', 'gt', 'gte', 'lt', 'lte', 'is_empty', 'not_empty'],
  text: ['contains', 'not_contains', 'is', 'is_not', 'is_empty', 'not_empty'],
  long_text: ['contains', 'not_contains', 'is_empty', 'not_empty'],
  email: ['contains', 'not_contains', 'is_empty', 'not_empty'],
  phone: ['contains', 'not_contains', 'is_empty', 'not_empty'],
  link: ['contains', 'not_contains', 'is_empty', 'not_empty'],
  person: ['is_any_of', 'is_none_of', 'is_empty', 'not_empty'],
  date: ['is_empty', 'not_empty'],
  task: ['is_empty', 'not_empty'],
};

/** Questions a rule may look at. */
export const isConditionSource = (f: TableField) => !!OPS_BY_TYPE[f.type];
export const opsForField = (type: TableFieldType): CondOp[] => OPS_BY_TYPE[type] ?? [];

const OP_WORDS: Record<CondOp, string> = {
  is: 'is', is_not: 'is not', is_any_of: 'is any of', is_none_of: 'is none of',
  contains: 'contains', not_contains: 'does not contain', is_empty: 'is empty', not_empty: 'is not empty',
  checked: 'is ticked', unchecked: 'is not ticked',
  gt: 'is greater than', gte: 'is at least', lt: 'is less than', lte: 'is at most',
};
const MULTI_WORDS: Partial<Record<CondOp, string>> = {
  is: 'includes', is_not: 'does not include', is_any_of: 'includes any of', is_none_of: 'includes none of',
};
export const opLabel = (op: CondOp, type: TableFieldType) => (type === 'multi_select' ? MULTI_WORDS[op] : undefined) ?? OP_WORDS[op];

export type ValueKind = 'none' | 'text' | 'number' | 'option' | 'options' | 'people';
/** What kind of value box a condition needs. */
export function valueKind(type: TableFieldType, op: CondOp): ValueKind {
  if (['is_empty', 'not_empty', 'checked', 'unchecked'].includes(op)) return 'none';
  if (type === 'person') return 'people';
  if (type === 'single_select' || type === 'multi_select') return op === 'is_any_of' || op === 'is_none_of' ? 'options' : 'option';
  if (['number', 'currency', 'rating'].includes(type)) return 'number';
  return 'text';
}

/** A condition that still needs a value can't be saved: it would silently hide (or show) the question. */
export function conditionComplete(c: FormCondition, type: TableFieldType): boolean {
  switch (valueKind(type, c.op)) {
    case 'none': return true;
    case 'number': return asNumber(c.value) !== null;
    case 'options':
    case 'people': return Array.isArray(c.value) && c.value.length > 0;
    default: return typeof c.value === 'string' && c.value.trim() !== '';
  }
}

export function defaultCondition(source: TableField): FormCondition {
  const op = opsForField(source.type)[0];
  const kind = valueKind(source.type, op);
  return { field: source.id, op, ...(kind === 'options' || kind === 'people' ? { value: [] } : {}) };
}

/** A new value for the condition after its field or operator changed: keep the value only when it still fits. */
export function conditionWith(c: FormCondition, patch: Partial<FormCondition>, source: TableField): FormCondition {
  const next = { ...c, ...patch };
  const before = valueKind(source.type, c.op);
  const after = valueKind(source.type, next.op);
  if (before !== after || patch.field !== undefined) {
    const { value: _v, ...rest } = next;
    return after === 'options' || after === 'people' ? { ...rest, value: [] } : rest;
  }
  return next;
}

/**
 * Conditions a rule can't use: they look at a question that isn't on the
 * form, is the question itself, sits below it, or can't be used in rules.
 */
export function invalidConditions(rule: FormRule | undefined, questionId: string, orderedIds: string[], fieldsById: Map<string, TableField>): FormCondition[] {
  if (!rule) return [];
  const above = new Set(orderedIds.slice(0, orderedIds.indexOf(questionId)));
  return rule.conditions.filter((c) => {
    const f = fieldsById.get(c.field);
    return !above.has(c.field) || !f || !isConditionSource(f) || !opsForField(f.type).includes(c.op);
  });
}

/** The rules to save: drops unusable conditions, and rules left with none. */
export function cleanLogic(logic: FormLogic, orderedIds: string[], fieldsById: Map<string, TableField>): FormLogic {
  const out: FormLogic = {};
  for (const id of orderedIds) {
    const rule = logic[id];
    if (!rule) continue;
    const bad = new Set(invalidConditions(rule, id, orderedIds, fieldsById));
    const conditions = rule.conditions.filter((c) => !bad.has(c));
    if (conditions.length) out[id] = { mode: rule.mode, match: rule.match, conditions };
  }
  return out;
}

/** The first rule with a half-filled condition, so the builder can point at it. */
export function firstIncomplete(logic: FormLogic, orderedIds: string[], fieldsById: Map<string, TableField>): string | null {
  for (const id of orderedIds) {
    const rule = logic[id];
    if (rule?.conditions.some((c) => {
      const f = fieldsById.get(c.field);
      return f ? !conditionComplete(c, f.type) : false;
    })) return id;
  }
  return null;
}

/** "Show when Status is Blocked and Hours is greater than 8" — a one-line summary of a rule. */
export function describeRule(rule: FormRule, fieldsById: Map<string, TableField>, nameOf: (type: TableFieldType, value: unknown) => string): string {
  const parts = rule.conditions.map((c) => {
    const f = fieldsById.get(c.field);
    if (!f) return 'a removed question';
    const kind = valueKind(f.type, c.op);
    return `${f.name} ${opLabel(c.op, f.type)}${kind === 'none' ? '' : ` ${nameOf(f.type, c.value)}`}`;
  });
  return `${rule.mode === 'hide' ? 'Hidden' : 'Shown'} when ${parts.join(rule.match === 'any' ? ' or ' : ' and ')}`;
}
