import { useId, type ReactNode } from 'react';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';

/**
 * Building blocks for the field settings dialogs, so every section looks and behaves the same:
 * a titled section with a one-line explanation, a switch row, and a paired range.
 */

export const SETTINGS_INPUT =
  'w-full h-9 px-3 rounded-lg border border-input bg-background text-xs-plus text-foreground placeholder:text-muted-foreground/70 ' +
  'transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:border-primary ' +
  'aria-[invalid=true]:border-destructive aria-[invalid=true]:ring-destructive/20';

export function SettingsSection({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-xl border border-border/70 bg-muted/30 p-4 space-y-4">
      <header>
        <h3 className="text-xs font-semibold text-foreground">{title}</h3>
        {hint && <p className="text-2xs text-muted-foreground mt-0.5 leading-snug">{hint}</p>}
      </header>
      {children}
    </section>
  );
}

/** A label and one line of explanation on the left, a switch on the right. Clicking the text toggles it. */
export function ToggleRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  const id = useId();
  return (
    <div className="flex items-start justify-between gap-4">
      <label htmlFor={id} className="min-w-0 cursor-pointer select-none">
        <span className="block text-xs-plus font-medium text-foreground">{label}</span>
        {description && <span className="block text-2xs text-muted-foreground leading-snug mt-0.5">{description}</span>}
      </label>
      <Switch id={id} checked={checked} onCheckedChange={onChange} className="mt-0.5 shrink-0" />
    </div>
  );
}

/** Two numbers that bound a value ("Smallest" and "Largest"), with a plain-words summary and one shared error. */
export function RangeField({
  label,
  minLabel = 'Smallest',
  maxLabel = 'Largest',
  min,
  max,
  onMin,
  onMax,
  summary,
  error,
  inputMode = 'decimal',
  showMin = true,
  showMax = true,
}: {
  label: string;
  minLabel?: string;
  maxLabel?: string;
  min: string;
  max: string;
  onMin: (next: string) => void;
  onMax: (next: string) => void;
  summary: string;
  error?: string;
  inputMode?: 'decimal' | 'numeric';
  showMin?: boolean;
  showMax?: boolean;
}) {
  const id = useId();
  const describedBy = `${id}-summary${error ? ` ${id}-error` : ''}`;
  return (
    <fieldset className="space-y-1.5 min-w-0">
      <legend className="text-xs-plus font-medium text-foreground mb-1.5">{label}</legend>
      <div className={cn('grid items-center gap-2', showMin && showMax ? 'grid-cols-[1fr_auto_1fr]' : 'grid-cols-1')}>
        {showMin && (
          <input
            aria-label={minLabel}
            aria-invalid={!!error}
            aria-describedby={describedBy}
            value={min}
            inputMode={inputMode}
            onChange={(e) => onMin(e.target.value)}
            placeholder={minLabel}
            className={SETTINGS_INPUT}
          />
        )}
        {showMin && showMax && <span className="text-2xs text-muted-foreground" aria-hidden="true">to</span>}
        {showMax && (
          <input
            aria-label={maxLabel}
            aria-invalid={!!error}
            aria-describedby={describedBy}
            value={max}
            inputMode={inputMode}
            onChange={(e) => onMax(e.target.value)}
            placeholder={maxLabel}
            className={SETTINGS_INPUT}
          />
        )}
      </div>
      <p id={`${id}-summary`} className="text-2xs text-muted-foreground">{summary}</p>
      {error && (
        <p id={`${id}-error`} role="alert" className="text-2xs text-destructive">
          <span className="sr-only">Error: </span>
          {error}
        </p>
      )}
    </fieldset>
  );
}
