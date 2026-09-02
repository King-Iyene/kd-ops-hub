import { useMemo, useState } from 'react';
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

interface ValidationIndicatorProps {
  errors: string[];
}

/**
 * Small red dot with hover tooltip listing validation errors.
 */
export function ValidationIndicator({ errors }: ValidationIndicatorProps) {
  const [show, setShow] = useState(false);

  if (errors.length === 0) return null;

  return (
    <span
      className="relative inline-flex items-center"
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      <span
        className="w-2 h-2 rounded-full flex-shrink-0"
        style={{ backgroundColor: '#EF4444' }}
      />
      {show && (
        <span
          className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 z-50 whitespace-nowrap rounded px-2 py-1 text-[11px] leading-tight shadow-lg pointer-events-none"
          style={{
            backgroundColor: '#1F2937',
            color: '#F9FAFB',
            maxWidth: 260,
            whiteSpace: 'pre-wrap',
          }}
        >
          {errors.join('\n')}
        </span>
      )}
    </span>
  );
}
