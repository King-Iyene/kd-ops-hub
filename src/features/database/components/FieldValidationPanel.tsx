import { useId } from 'react';
import {
  allowedRules,
  describeRange,
  isValidPattern,
  rangeProblem,
  type ValidationSettings,
} from '../lib/validation';
import { RangeField, SETTINGS_INPUT, SettingsSection, ToggleRow } from './SettingsParts';

interface FieldValidationPanelProps {
  uiType: string;
  value: ValidationSettings;
  onChange: (next: ValidationSettings) => void;
}

/** Rules a cell value must satisfy before it is saved: required, range, length, pattern. */
export function FieldValidationPanel({ uiType, value, onChange }: FieldValidationPanelProps) {
  const patternId = useId();
  const allowed = new Set(allowedRules(uiType));
  if (allowed.size === 0) return null;
  const set = (patch: Partial<ValidationSettings>) => onChange({ ...value, ...patch });
  const patternBad = !isValidPattern(value.pattern);
  const hasRange = allowed.has('min') || allowed.has('max');
  const hasLength = allowed.has('minLength') || allowed.has('maxLength');

  return (
    <SettingsSection title="Rules" hint="Checked whenever someone edits a cell. A value that breaks a rule is not saved.">
      {allowed.has('required') && (
        <ToggleRow
          label="Required"
          description="The cell cannot be left empty."
          checked={value.required}
          onChange={(required) => set({ required })}
        />
      )}

      {hasRange && (
        <RangeField
          label="Allowed range"
          min={value.min}
          max={value.max}
          onMin={(min) => set({ min })}
          onMax={(max) => set({ max })}
          showMin={allowed.has('min')}
          showMax={allowed.has('max')}
          summary={describeRange(value.min, value.max)}
          error={rangeProblem(value.min, value.max)}
        />
      )}

      {hasLength && (
        <RangeField
          label="Allowed length"
          minLabel="Shortest"
          maxLabel="Longest"
          min={value.minLength}
          max={value.maxLength}
          onMin={(minLength) => set({ minLength })}
          onMax={(maxLength) => set({ maxLength })}
          showMin={allowed.has('minLength')}
          showMax={allowed.has('maxLength')}
          inputMode="numeric"
          summary={describeRange(value.minLength, value.maxLength, 'characters')}
          error={rangeProblem(value.minLength, value.maxLength)}
        />
      )}

      {allowed.has('regex') && (
        <div className="space-y-1.5">
          <label htmlFor={patternId} className="block text-xs-plus font-medium text-foreground">
            Must match a pattern
          </label>
          <input
            id={patternId}
            value={value.pattern}
            onChange={(e) => set({ pattern: e.target.value })}
            placeholder="e.g. ^[A-Z]{3}-[0-9]+$"
            aria-invalid={patternBad}
            aria-describedby={`${patternId}-hint`}
            className={`${SETTINGS_INPUT} font-mono`}
          />
          {patternBad ? (
            <p id={`${patternId}-hint`} role="alert" className="text-2xs text-destructive">
              <span className="sr-only">Error: </span>
              That pattern is not valid, so it will not be saved.
            </p>
          ) : (
            <p id={`${patternId}-hint`} className="text-2xs text-muted-foreground">
              A regular expression. Leave empty to accept any text.
            </p>
          )}
        </div>
      )}
    </SettingsSection>
  );
}
