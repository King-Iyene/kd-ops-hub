import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { TASK_COLOR_SWATCHES } from '../theme/taskTheme';

export function ColorSwatchPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (hex: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Colour">
      {TASK_COLOR_SWATCHES.map((swatch) => {
        const active = swatch.hex.toLowerCase() === value.toLowerCase();
        return (
          <button
            key={swatch.id}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={swatch.label}
            title={swatch.label}
            onClick={() => onChange(swatch.hex)}
            className={cn(
              'h-7 w-7 rounded-full flex items-center justify-center ring-2 ring-offset-2 ring-offset-background transition-all',
              active ? 'ring-foreground/70' : 'ring-transparent hover:ring-border',
            )}
            style={{ backgroundColor: swatch.hex }}
          >
            {active && <Check className="h-3.5 w-3.5 text-white" />}
          </button>
        );
      })}
    </div>
  );
}
