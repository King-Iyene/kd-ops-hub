import type { RowColorRule, FieldMeta } from '../types';

function evaluateRule(
  record: Record<string, any>,
  rule: RowColorRule,
  field: FieldMeta | undefined,
): boolean {
  if (!field) return false;

  const raw = record[field.pg_column_name];
  const val = raw ?? null;
  const ruleVal = rule.value;

  switch (rule.operator) {
    case 'is':
    case 'eq':
      return String(val) === String(ruleVal);

    case 'isNot':
    case 'neq':
      return String(val) !== String(ruleVal);

    case 'contains':
      return val != null && String(val).toLowerCase().includes(String(ruleVal).toLowerCase());

    case 'doesNotContain':
      return val == null || !String(val).toLowerCase().includes(String(ruleVal).toLowerCase());

    case 'startsWith':
      return val != null && String(val).toLowerCase().startsWith(String(ruleVal).toLowerCase());

    case 'endsWith':
      return val != null && String(val).toLowerCase().endsWith(String(ruleVal).toLowerCase());

    case 'gt':
      return val != null && Number(val) > Number(ruleVal);

    case 'gte':
      return val != null && Number(val) >= Number(ruleVal);

    case 'lt':
      return val != null && Number(val) < Number(ruleVal);

    case 'lte':
      return val != null && Number(val) <= Number(ruleVal);

    case 'isEmpty':
      return val == null || val === '' || (Array.isArray(val) && val.length === 0);

    case 'isNotEmpty':
      return val != null && val !== '' && !(Array.isArray(val) && val.length === 0);

    case 'isBefore':
      return val != null && new Date(val) < new Date(ruleVal);

    case 'isAfter':
      return val != null && new Date(val) > new Date(ruleVal);

    case 'isOnOrBefore':
      return val != null && new Date(val) <= new Date(ruleVal);

    case 'isOnOrAfter':
      return val != null && new Date(val) >= new Date(ruleVal);

    case 'isAnyOf':
      if (Array.isArray(ruleVal)) {
        return ruleVal.includes(String(val));
      }
      return String(ruleVal).split(',').map((s) => s.trim()).includes(String(val));

    case 'isNoneOf':
      if (Array.isArray(ruleVal)) {
        return !ruleVal.includes(String(val));
      }
      return !String(ruleVal).split(',').map((s) => s.trim()).includes(String(val));

    case 'isExactly':
      if (Array.isArray(val) && Array.isArray(ruleVal)) {
        return JSON.stringify([...val].sort()) === JSON.stringify([...ruleVal].sort());
      }
      return String(val) === String(ruleVal);

    case 'isBetween':
      // Expect ruleVal as [start, end] or "start,end"
      if (val == null) return false;
      if (Array.isArray(ruleVal) && ruleVal.length === 2) {
        const d = new Date(val);
        return d >= new Date(ruleVal[0]) && d <= new Date(ruleVal[1]);
      }
      return false;

    case 'linkCountIs':
      return Array.isArray(val) && val.length === Number(ruleVal);

    case 'linkCountGt':
      return Array.isArray(val) && val.length > Number(ruleVal);

    case 'linkCountLt':
      return Array.isArray(val) && val.length < Number(ruleVal);

    default:
      return false;
  }
}

export function getRowColor(
  record: Record<string, any>,
  rules: RowColorRule[],
  fields: FieldMeta[],
): string | undefined {
  if (rules.length === 0) return undefined;

  const fieldMap = new Map<string, FieldMeta>();
  for (const f of fields) {
    fieldMap.set(f.id, f);
  }

  for (const rule of rules) {
    const field = fieldMap.get(rule.field_id);
    if (evaluateRule(record, rule, field)) {
      return rule.color;
    }
  }

  return undefined;
}
