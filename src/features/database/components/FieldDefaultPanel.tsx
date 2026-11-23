import { Label } from '@/components/ui/label';
import { supportsDefault } from '../lib/fieldDefaults';

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

const FIELD_CLASS =
  'w-full h-9 px-2 border border-[#E5E5E5] rounded-lg text-xs-plus bg-white dark:bg-[hsl(220,30%,10%)] dark:border-[hsl(220,25%,18%)] dark:text-[hsl(220,25%,88%)] focus:outline-none focus:ring-2 focus:ring-[#2D7FF9]/30 focus:border-[#2D7FF9]';
const LABEL_CLASS = 'text-xs text-[#6A7184] dark:text-[hsl(220,20%,55%)]';

/** "Default value" for new rows, plus the select-only "allow new options" switch. */
export function FieldDefaultPanel({
  uiType,
  choices = [],
  value,
  onChange,
  allowNewOptions = true,
  onAllowNewOptionsChange,
}: FieldDefaultPanelProps) {
  if (!supportsDefault(uiType)) return null;
  const isSelect = uiType === 'SingleSelect' || uiType === 'MultiSelect';
  const isNumber = ['Number', 'Decimal', 'Currency', 'Percent', 'Rating'].includes(uiType);

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label className={LABEL_CLASS}>
          Default value <span className="text-[#9AA2AF]">(optional, used by new rows)</span>
        </Label>
        {uiType === 'Checkbox' ? (
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              className="w-3.5 h-3.5 accent-[#2D7FF9]"
              checked={value === 'true'}
              onChange={(e) => onChange(e.target.checked ? 'true' : '')}
            />
            <span className="text-xs text-[#374151] dark:text-[hsl(220,25%,88%)]">Checked by default</span>
          </label>
        ) : isSelect ? (
          <select value={value} onChange={(e) => onChange(e.target.value)} className={FIELD_CLASS}>
            <option value="">No default</option>
            {choices.map((c) => (
              <option key={c.title} value={c.title}>{c.title}</option>
            ))}
          </select>
        ) : (
          <input
            value={value}
            inputMode={isNumber ? 'decimal' : undefined}
            onChange={(e) => onChange(e.target.value)}
            placeholder={isNumber ? 'No default' : 'Leave empty for no default'}
            className={FIELD_CLASS}
          />
        )}
      </div>

      {isSelect && onAllowNewOptionsChange && (
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            className="w-3.5 h-3.5 accent-[#2D7FF9]"
            checked={allowNewOptions}
            onChange={(e) => onAllowNewOptionsChange(e.target.checked)}
          />
          <span className="text-xs text-[#374151] dark:text-[hsl(220,25%,88%)]">
            Let people add new options while editing a cell
          </span>
        </label>
      )}
    </div>
  );
}
