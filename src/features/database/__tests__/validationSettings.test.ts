import { describe, expect, it } from 'vitest';
import {
  DEFAULT_VALIDATION_SETTINGS,
  allowedRules,
  isValidPattern,
  rulesFromSettings,
  settingsFromRules,
  validateField,
} from '../lib/validation';

const base = DEFAULT_VALIDATION_SETTINGS;
const field = { name: 'Amount', ui_type: 'Number' } as any;

describe('which rules apply', () => {
  it('follows the field type', () => {
    expect(allowedRules('Number')).toEqual(['required', 'min', 'max']);
    expect(allowedRules('SingleLineText')).toContain('regex');
    expect(allowedRules('Checkbox')).toEqual([]);
    expect(allowedRules('Formula')).toEqual([]);
  });
});

describe('rulesFromSettings', () => {
  it('stores nothing for empty settings', () => {
    expect(rulesFromSettings(base, 'Number')).toEqual([]);
  });
  it('builds numeric rules and ignores text rules for a number field', () => {
    const rules = rulesFromSettings({ ...base, required: true, min: '0', max: '100', maxLength: '5', pattern: 'x' }, 'Number');
    expect(rules).toEqual([{ type: 'required' }, { type: 'min', value: 0 }, { type: 'max', value: 100 }]);
  });
  it('builds text rules for a text field', () => {
    const rules = rulesFromSettings({ ...base, minLength: '2', maxLength: '10', pattern: '^[A-Z]+$' }, 'SingleLineText');
    expect(rules).toEqual([
      { type: 'minLength', value: 2 },
      { type: 'maxLength', value: 10 },
      { type: 'regex', value: '^[A-Z]+$' },
    ]);
  });
  it('drops junk numbers and bad patterns instead of storing them', () => {
    expect(rulesFromSettings({ ...base, min: 'abc', maxLength: '-3', pattern: '(' }, 'SingleLineText')).toEqual([]);
  });
  it('keeps rules it does not manage', () => {
    const rules = rulesFromSettings({ ...base, required: true }, 'Email', [{ type: 'email' }, { type: 'required' }]);
    expect(rules).toEqual([{ type: 'required' }, { type: 'email' }]);
  });
  it('allows a minimum of zero', () => {
    expect(rulesFromSettings({ ...base, min: '0' }, 'Number')).toEqual([{ type: 'min', value: 0 }]);
  });
});

describe('settingsFromRules', () => {
  it('round trips', () => {
    const settings = { ...base, required: true, min: '1', max: '9', minLength: '2', maxLength: '4', pattern: 'a+' };
    const rules = rulesFromSettings(settings, 'SingleLineText');
    expect(settingsFromRules(rules).required).toBe(true);
    expect(settingsFromRules(rules).pattern).toBe('a+');
    expect(settingsFromRules([{ type: 'min', value: 5 }]).min).toBe('5');
    expect(settingsFromRules(undefined)).toEqual(base);
  });
});

describe('isValidPattern', () => {
  it('accepts empty and good patterns, rejects broken ones', () => {
    expect(isValidPattern('')).toBe(true);
    expect(isValidPattern('^a+$')).toBe(true);
    expect(isValidPattern('(')).toBe(false);
  });
});

describe('rules in action', () => {
  it('blocks an empty value for a required field and a number out of range', () => {
    expect(validateField('', field, [{ type: 'required' }]).valid).toBe(false);
    expect(validateField(null, field, [{ type: 'required' }]).valid).toBe(false);
    expect(validateField(0, field, [{ type: 'required' }]).valid).toBe(true);
    expect(validateField(5, field, [{ type: 'min', value: 10 }]).valid).toBe(false);
    expect(validateField(15, field, [{ type: 'max', value: 10 }]).valid).toBe(false);
    expect(validateField(10, field, [{ type: 'min', value: 10 }, { type: 'max', value: 10 }]).valid).toBe(true);
  });
});
