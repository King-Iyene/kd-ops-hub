import { Label } from '@/components/ui/label';
import {
  formatCurrency,
  formatNumber,
  formatPercent,
  type NumberFormatSettings,
} from '../lib/numberFormat';

type NumberLikeType = 'Number' | 'Decimal' | 'Currency' | 'Percent';

interface NumberFormatPanelProps {
  uiType: NumberLikeType;
  currencyCode?: string;
  value: NumberFormatSettings;
  onChange: (next: NumberFormatSettings) => void;
  /** Currency fields already have their own decimal places picker. */
  showPrecision: boolean;
}

const SELECT_CLASS =
  'w-full h-9 px-2 border border-[#E5E5E5] rounded-lg text-xs-plus bg-white dark:bg-[hsl(220,30%,10%)] dark:border-[hsl(220,25%,18%)] dark:text-[hsl(220,25%,88%)] focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary';
const INPUT_CLASS = SELECT_CLASS;
const LABEL_CLASS = 'text-xs text-[#6A7184] dark:text-[hsl(220,20%,55%)]';

function preview(uiType: NumberLikeType, s: NumberFormatSettings, currencyCode: string | undefined, sample: number): string {
  const common = {
    precision: s.precision,
    thousands: s.thousands,
    negativeStyle: s.negativeStyle,
    abbreviate: s.abbreviate,
  };
  if (uiType === 'Currency') return formatCurrency(sample, { ...common, currencyCode });
  if (uiType === 'Percent') return formatPercent(sample, common);
  return formatNumber(sample, {
    ...common,
    defaultPrecision: uiType === 'Decimal' ? 2 : null,
    prefix: s.prefix,
    suffix: s.suffix,
  });
}

/**
 * Display options shared by Number, Decimal, Currency and Percent fields, with a
 * live preview so the effect of each setting is visible before saving.
 */
export function NumberFormatPanel({ uiType, currencyCode, value, onChange, showPrecision }: NumberFormatPanelProps) {
  const set = (patch: Partial<NumberFormatSettings>) => onChange({ ...value, ...patch });
  const affixes = uiType === 'Number' || uiType === 'Decimal';
  const precisionDefault = uiType === 'Decimal' ? '2 (default)' : uiType === 'Percent' ? 'Automatic' : 'Automatic';

  return (
    <div className="space-y-3">
      {showPrecision && (
        <div className="space-y-1.5">
          <Label className={LABEL_CLASS}>Decimal places</Label>
          <select
            value={value.precision == null ? '' : String(value.precision)}
            onChange={(e) => set({ precision: e.target.value === '' ? null : Number(e.target.value) })}
            className={SELECT_CLASS}
          >
            <option value="">{precisionDefault}</option>
            {[0, 1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
              <option key={n} value={n}>
                {n === 0 ? '0 (1,000)' : `${n} (1,000.${'0'.repeat(n)})`}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className={LABEL_CLASS}>Negative numbers</Label>
          <select
            value={value.negativeStyle}
            onChange={(e) => set({ negativeStyle: e.target.value as NumberFormatSettings['negativeStyle'] })}
            className={SELECT_CLASS}
          >
            <option value="minus">Minus sign (-1,234)</option>
            <option value="parentheses">Brackets (1,234)</option>
          </select>
        </div>
        <div className="space-y-1.5">
          <Label className={LABEL_CLASS}>Thousands</Label>
          <select
            value={value.thousands ? 'on' : 'off'}
            onChange={(e) => set({ thousands: e.target.value === 'on' })}
            className={SELECT_CLASS}
          >
            <option value="on">Separated (1,234,567)</option>
            <option value="off">Plain (1234567)</option>
          </select>
        </div>
      </div>

      {affixes && (
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className={LABEL_CLASS}>Text before</Label>
            <input
              value={value.prefix}
              maxLength={12}
              onChange={(e) => set({ prefix: e.target.value })}
              placeholder="e.g. #"
              className={INPUT_CLASS}
            />
          </div>
          <div className="space-y-1.5">
            <Label className={LABEL_CLASS}>Text after</Label>
            <input
              value={value.suffix}
              maxLength={12}
              onChange={(e) => set({ suffix: e.target.value })}
              placeholder="e.g. kg"
              className={INPUT_CLASS}
            />
          </div>
        </div>
      )}

      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          className="w-3.5 h-3.5 accent-primary"
          checked={value.abbreviate}
          onChange={(e) => set({ abbreviate: e.target.checked })}
        />
        <span className="text-xs text-[#374151] dark:text-[hsl(220,25%,88%)]">
          Shorten large numbers (1.2M). The full amount is kept.
        </span>
      </label>

      {uiType === 'Percent' && (
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            className="w-3.5 h-3.5 accent-primary"
            checked={value.percentBar}
            onChange={(e) => set({ percentBar: e.target.checked })}
          />
          <span className="text-xs text-[#374151] dark:text-[hsl(220,25%,88%)]">Show a progress bar next to the number</span>
        </label>
      )}

      <div className="rounded-lg border border-dashed border-[#E5E5E5] dark:border-[hsl(220,25%,18%)] px-3 py-2">
        <p className="text-3xs font-semibold uppercase tracking-widest text-[#9AA2AF]">Preview</p>
        <div className="mt-1 flex items-baseline justify-between gap-3 tabular-nums text-sm text-[#374151] dark:text-[hsl(220,25%,88%)]">
          <span>{preview(uiType, value, currencyCode, uiType === 'Percent' ? 45.5 : 1234567.891)}</span>
          <span className="text-[#EF4444]">{preview(uiType, value, currencyCode, uiType === 'Percent' ? -12.25 : -1234.5)}</span>
        </div>
      </div>
    </div>
  );
}
