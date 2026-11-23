import type { FieldMeta, UIType, ValidationRule } from '../types';

export type { ValidationRule };

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const URL_RE = /^(https?:\/\/.+|[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z]{2,})+(\/.*)?)$/;

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
        if (value != null && value !== '') {
          if (isNaN(Number(value))) {
            errors.push(rule.message ?? `${field.name} must be a number`);
          } else if (Number(value) < Number(rule.value)) {
            errors.push(rule.message ?? `${field.name} must be at least ${rule.value}`);
          }
        }
        break;
      }
      case 'max': {
        if (value != null && value !== '') {
          if (isNaN(Number(value))) {
            errors.push(rule.message ?? `${field.name} must be a number`);
          } else if (Number(value) > Number(rule.value)) {
            errors.push(rule.message ?? `${field.name} must be at most ${rule.value}`);
          }
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

// ---------------------------------------------------------------------------
// Field settings <-> rules (used by the field dialogs)
// ---------------------------------------------------------------------------

export interface ValidationSettings {
  required: boolean;
  min: string;
  max: string;
  minLength: string;
  maxLength: string;
  pattern: string;
}

export const DEFAULT_VALIDATION_SETTINGS: ValidationSettings = {
  required: false,
  min: '',
  max: '',
  minLength: '',
  maxLength: '',
  pattern: '',
};

/** The rule types a field of this type can have (empty for types that cannot be validated). */
export function allowedRules(uiType: string): ValidationRule['type'][] {
  return DEFAULT_VALIDATIONS[uiType as UIType] ?? [];
}

export function settingsFromRules(rules: ValidationRule[] | null | undefined): ValidationSettings {
  const out: ValidationSettings = { ...DEFAULT_VALIDATION_SETTINGS };
  for (const rule of rules ?? []) {
    if (rule.type === 'required') out.required = true;
    else if (rule.type === 'min') out.min = String(rule.value ?? '');
    else if (rule.type === 'max') out.max = String(rule.value ?? '');
    else if (rule.type === 'minLength') out.minLength = String(rule.value ?? '');
    else if (rule.type === 'maxLength') out.maxLength = String(rule.value ?? '');
    else if (rule.type === 'regex') out.pattern = String(rule.value ?? '');
  }
  return out;
}

/** Whether a pattern can be used (empty is fine: it means no pattern). */
export function isValidPattern(pattern: string): boolean {
  if (!pattern) return true;
  try {
    new RegExp(pattern);
    return true;
  } catch {
    return false;
  }
}

/**
 * The rules to store: only those that apply to the field type and have a usable
 * value. Other rules already stored on the field (email, url, unique) are kept
 * so saving the dialog never silently drops them.
 */
export function rulesFromSettings(
  settings: ValidationSettings,
  uiType: string,
  existing: ValidationRule[] | null | undefined = [],
): ValidationRule[] {
  const allowed = new Set(allowedRules(uiType));
  const kept = (existing ?? []).filter((r) => !['required', 'min', 'max', 'minLength', 'maxLength', 'regex'].includes(r.type));
  const rules: ValidationRule[] = [];
  const num = (text: string) => (text.trim() !== '' && Number.isFinite(Number(text)) ? Number(text) : null);
  if (allowed.has('required') && settings.required) rules.push({ type: 'required' });
  if (allowed.has('min') && num(settings.min) !== null) rules.push({ type: 'min', value: num(settings.min) });
  if (allowed.has('max') && num(settings.max) !== null) rules.push({ type: 'max', value: num(settings.max) });
  const minLen = num(settings.minLength);
  const maxLen = num(settings.maxLength);
  if (allowed.has('minLength') && minLen !== null && minLen > 0) rules.push({ type: 'minLength', value: Math.floor(minLen) });
  if (allowed.has('maxLength') && maxLen !== null && maxLen > 0) rules.push({ type: 'maxLength', value: Math.floor(maxLen) });
  if (allowed.has('regex') && settings.pattern.trim() !== '' && isValidPattern(settings.pattern)) {
    rules.push({ type: 'regex', value: settings.pattern });
  }
  return [...rules, ...kept];
}
