import { useMemo } from 'react';
import type { FieldMeta } from '../../types';
import { validateField, type ValidationRule, type ValidationResult } from '../../lib/validation';

/**
 * Hook: run validation rules stored in field.options.validations against a cell value.
 */
export function useFieldValidation(
  value: any,
  field: FieldMeta,
): ValidationResult {
  return useMemo(() => {
    const rules: ValidationRule[] =
      (field.options as any)?.validations ?? [];
    if (rules.length === 0) return { valid: true, errors: [] };
    return validateField(value, field, rules);
  }, [value, field]);
}
