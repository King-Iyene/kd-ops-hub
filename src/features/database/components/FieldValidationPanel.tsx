import { Label } from '@/components/ui/label';
import {
  allowedRules,
  isValidPattern,
  type ValidationSettings,
} from '../lib/validation';

interface FieldValidationPanelProps {
  uiType: string;
  value: ValidationSettings;
  onChange: (next: ValidationSettings) => void;
}

const FIELD_CLASS =
  'w-full h-9 px-2 border border-[#E5E5E5] rounded-lg text-xs-plus bg-white dark:bg-[hsl(220,30%,10%)] dark:border-[hsl(220,25%,18%)] dark:text-[hsl(220,25%,88%)] focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary';
const LABEL_CLASS = 'text-xs text-[#6A7184] dark:text-[hsl(220,20%,55%)]';

/** Rules a cell value must satisfy before it is saved: required, range, length, pattern. */
export function FieldValidationPanel({ uiType, value, onChange }: FieldValidationPanelProps) {
  const allowed = new Set(allowedRules(uiType));
  if (allowed.size === 0) return null;
  const set = (patch: Partial<ValidationSettings>) => onChange({ ...value, ...patch });
  const patternBad = !isValidPattern(value.pattern);

  return (
    <div className="space-y-3">
      <Label className={LABEL_CLASS}>
        Rules <span className="text-[#9AA2AF]">(checked when someone edits a cell)</span>
      </Label>

      {allowed.has('required') && (
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            className="w-3.5 h-3.5 accent-primary"
            checked={value.required}
            onChange={(e) => set({ required: e.target.checked })}
          />
          <span className="text-xs text-[#374151] dark:text-[hsl(220,25%,88%)]">Required: the cell cannot be emptied</span>
        </label>
      )}

      {(allowed.has('min') || allowed.has('max')) && (
        <div className="grid grid-cols-2 gap-3">
          {allowed.has('min') && (
            <div className="space-y-1.5">
              <Label className={LABEL_CLASS}>Smallest value</Label>
              <input value={value.min} inputMode="decimal" onChange={(e) => set({ min: e.target.value })} placeholder="No limit" className={FIELD_CLASS} />
            </div>
          )}
          {allowed.has('max') && (
            <div className="space-y-1.5">
              <Label className={LABEL_CLASS}>Largest value</Label>
              <input value={value.max} inputMode="decimal" onChange={(e) => set({ max: e.target.value })} placeholder="No limit" className={FIELD_CLASS} />
            </div>
          )}
        </div>
      )}

      {(allowed.has('minLength') || allowed.has('maxLength')) && (
        <div className="grid grid-cols-2 gap-3">
          {allowed.has('minLength') && (
            <div className="space-y-1.5">
              <Label className={LABEL_CLASS}>Shortest length</Label>
              <input value={value.minLength} inputMode="numeric" onChange={(e) => set({ minLength: e.target.value })} placeholder="No limit" className={FIELD_CLASS} />
            </div>
          )}
          {allowed.has('maxLength') && (
            <div className="space-y-1.5">
              <Label className={LABEL_CLASS}>Longest length</Label>
              <input value={value.maxLength} inputMode="numeric" onChange={(e) => set({ maxLength: e.target.value })} placeholder="No limit" className={FIELD_CLASS} />
            </div>
          )}
        </div>
      )}

      {allowed.has('regex') && (
        <div className="space-y-1.5">
          <Label className={LABEL_CLASS}>Must match this pattern (regular expression)</Label>
          <input
            value={value.pattern}
            onChange={(e) => set({ pattern: e.target.value })}
            placeholder="e.g. ^[A-Z]{3}-[0-9]+$"
            aria-invalid={patternBad}
            className={FIELD_CLASS + (patternBad ? ' border-[#EF4444]' : '')}
          />
          {patternBad && <p className="text-xs text-[#EF4444]">That pattern is not valid, so it will not be saved.</p>}
        </div>
      )}
    </div>
  );
}
