import type { FieldMeta, RecordRow, ConditionalFormatRule } from '@/features/database/types';

export function evaluateCondition(
  record: RecordRow,
  rule: ConditionalFormatRule,
  fields: FieldMeta[],
): boolean {
  const field = fields.find((f) => f.id === rule.field_id);
  if (!field) return false;
  const val = record[field.pg_column_name];
  const strVal = val == null ? '' : String(val);
  const ruleVal = rule.value == null ? '' : String(rule.value);
  switch (rule.operator) {
    case 'is':
      return strVal === ruleVal;
    case 'isNot':
      return strVal !== ruleVal;
    case 'contains':
      return strVal.toLowerCase().includes(ruleVal.toLowerCase());
    case 'doesNotContain':
      return !strVal.toLowerCase().includes(ruleVal.toLowerCase());
    case 'isEmpty':
      return val == null || strVal === '';
    case 'isNotEmpty':
      return val != null && strVal !== '';
    case 'gt':
      return parseFloat(strVal) > parseFloat(ruleVal);
    case 'lt':
      return parseFloat(strVal) < parseFloat(ruleVal);
    case 'gte':
      return parseFloat(strVal) >= parseFloat(ruleVal);
    case 'lte':
      return parseFloat(strVal) <= parseFloat(ruleVal);
    default:
      return false;
  }
}
