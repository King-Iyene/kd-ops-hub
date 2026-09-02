import type { FieldMeta, UIType, ValidationRule } from '../types';

export type { ValidationRule };

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const URL_RE = /^https?:\/\/.+/;

export function validateField(
  value: any,
  field: FieldMeta,
  rules: ValidationRule[],
): ValidationResult {
  const errors: string[] = [];

  for (const rule of rules) {
    switch (rule.type) {
      case 'required': {
        const empty =
          value === null ||
          value === undefined ||
          value === '' ||
          (Array.isArray(value) && value.length === 0);
        if (empty) {
          errors.push(rule.message ?? `${field.name} is required`);
        }
        break;
      }
      case 'min': {
        if (value != null && value !== '' && Number(value) < Number(rule.value)) {
          errors.push(rule.message ?? `${field.name} must be at least ${rule.value}`);
        }
        break;
      }
      case 'max': {
        if (value != null && value !== '' && Number(value) > Number(rule.value)) {
          errors.push(rule.message ?? `${field.name} must be at most ${rule.value}`);
        }
        break;
      }
      case 'minLength': {
        if (typeof value === 'string' && value.length > 0 && value.length < Number(rule.value)) {
          errors.push(rule.message ?? `${field.name} must be at least ${rule.value} characters`);
        }
        break;
      }
      case 'maxLength': {
        if (typeof value === 'string' && value.length > Number(rule.value)) {
          errors.push(rule.message ?? `${field.name} must be at most ${rule.value} characters`);
        }
        break;
      }
      case 'regex': {
        if (typeof value === 'string' && value.length > 0) {
          try {
            const re = new RegExp(rule.value);
            if (!re.test(value)) {
              errors.push(rule.message ?? `${field.name} does not match the required pattern`);
            }
          } catch {
            // invalid regex — skip
          }
        }
        break;
      }
      case 'unique': {
        // Unique validation requires row-level context; handled externally.
        // This is a placeholder so the rule type is recognized.
        break;
      }
      case 'email': {
        if (typeof value === 'string' && value.length > 0 && !EMAIL_RE.test(value)) {
          errors.push(rule.message ?? `${field.name} must be a valid email address`);
        }
        break;
      }
      case 'url': {
        if (typeof value === 'string' && value.length > 0 && !URL_RE.test(value)) {
          errors.push(rule.message ?? `${field.name} must be a valid URL`);
        }
        break;
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

/** Which validation rule types are relevant for each field type. */
export const DEFAULT_VALIDATIONS: Partial<Record<UIType, ValidationRule['type'][]>> = {
  SingleLineText: ['required', 'minLength', 'maxLength', 'regex'],
  LongText: ['required', 'minLength', 'maxLength'],
  Email: ['required', 'email'],
  PhoneNumber: ['required', 'minLength', 'maxLength', 'regex'],
  URL: ['required', 'url'],
  Number: ['required', 'min', 'max'],
  Decimal: ['required', 'min', 'max'],
  Currency: ['required', 'min', 'max'],
  Percent: ['required', 'min', 'max'],
  Rating: ['required', 'min', 'max'],
  Duration: ['required', 'min', 'max'],
  Date: ['required'],
  DateTime: ['required'],
  Year: ['required', 'min', 'max'],
  Time: ['required'],
  SingleSelect: ['required'],
  MultiSelect: ['required'],
  Checkbox: [],
  JSON: ['required'],
};

/** Human-readable label for each rule type. */
export const RULE_LABELS: Record<ValidationRule['type'], string> = {
  required: 'Required',
  min: 'Minimum value',
  max: 'Maximum value',
  minLength: 'Minimum length',
  maxLength: 'Maximum length',
  regex: 'Pattern (regex)',
  unique: 'Unique',
  email: 'Valid email',
  url: 'Valid URL',
};

/** Whether a rule type needs a value input. */
export function ruleNeedsValue(type: ValidationRule['type']): boolean {
  return ['min', 'max', 'minLength', 'maxLength', 'regex'].includes(type);
}
