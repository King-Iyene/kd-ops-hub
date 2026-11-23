import { useId } from 'react';
import { supportsDefault } from '../lib/fieldDefaults';
import { SETTINGS_INPUT, SettingsSection, ToggleRow } from './SettingsParts';

interface FieldDefaultPanelProps {
  uiType: string;
  choices?: { title: string }[];
  /** The stored default, as text. */
  value: string;
  onChange: (next: string) => void;
  /** Select fields only: can people add options while editing a cell? */
  allowNewOptions?: boolean;
  onAllowNewOptionsChange?: (next: boolean) => void;
}

/** "Default value" for new rows, plus the select-only "allow new options" switch. */
export function FieldDefaultPanel({
  uiType,
  choices = [],
  value,
  onChange,
  allowNewOptions = true,
  onAllowNewOptionsChange,
}: FieldDefaultPanelProps) {
  const inputId = useId();
  if (!supportsDefault(uiType)) return null;
  const isSelect = uiType === 'SingleSelect' || uiType === 'MultiSelect';
  const isNumber = ['Number', 'Decimal', 'Currency', 'Percent', 'Rating'].includes(uiType);

  return (
    <SettingsSection title="Default value" hint="Filled in when a new row is added. Rows that already exist are not changed.">
      {uiType === 'Checkbox' ? (
        <ToggleRow
          label="Checked by default"
          description="New rows start with this box ticked."
          checked={value === 'true'}
          onChange={(on) => onChange(on ? 'true' : '')}
        />
      ) : isSelect ? (
        <div className="space-y-1.5">
          <label htmlFor={inputId} className="block text-xs-plus font-medium text-foreground">Start new rows with</label>
          <select id={inputId} value={value} onChange={(e) => onChange(e.target.value)} className={SETTINGS_INPUT}>
            <option value="">No default</option>
            {choices.map((c) => (
              <option key={c.title} value={c.title}>{c.title}</option>
            ))}
          </select>
        </div>
      ) : (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <label htmlFor={inputId} className="block text-xs-plus font-medium text-foreground">Start new rows with</label>
            {value !== '' && (
              <button
                type="button"
                onClick={() => onChange('')}
                className="text-2xs font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 rounded"
              >
                Clear
              </button>
            )}
          </div>
          <input
            id={inputId}
            value={value}
            inputMode={isNumber ? 'decimal' : undefined}
            onChange={(e) => onChange(e.target.value)}
            placeholder="No default"
            className={SETTINGS_INPUT}
          />
        </div>
      )}

      {isSelect && onAllowNewOptionsChange && (
        <ToggleRow
          label="Let people add new options"
          description="Anyone editing a cell can type a new option instead of choosing from the list."
          checked={allowNewOptions}
          onChange={onAllowNewOptionsChange}
        />
      )}
    </SettingsSection>
  );
}
