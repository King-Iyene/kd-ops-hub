import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { RatingGlyph } from './grid/RatingGlyph';
import {
  RATING_COLORS,
  RATING_ICONS,
  ratingHexOf,
  type RatingIcon,
} from '../lib/ratingStyle';

interface RatingOptionsPanelProps {
  max: number;
  icon: RatingIcon;
  color: string;
  onChange: (next: { max: number; icon: RatingIcon; color: string }) => void;
}

const LABEL_CLASS = 'text-xs text-[#6A7184] dark:text-[hsl(220,20%,55%)]';

/** How many icons, which icon and which colour a rating field uses, with a live preview. */
export function RatingOptionsPanel({ max, icon, color, onChange }: RatingOptionsPanelProps) {
  const hex = ratingHexOf(color);
  const previewFilled = Math.max(1, Math.ceil(max * 0.6));
  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label className={LABEL_CLASS}>Maximum rating</Label>
        <select
          value={max}
          onChange={(e) => onChange({ max: Number(e.target.value), icon, color })}
          className="w-full h-9 px-2 border border-[#E5E5E5] rounded-lg text-xs-plus bg-white dark:bg-[hsl(220,30%,10%)] dark:border-[hsl(220,25%,18%)] dark:text-[hsl(220,25%,88%)] focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
        >
          {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
            <option key={n} value={n}>{n}</option>
          ))}
        </select>
      </div>

      <div className="space-y-1.5">
        <Label className={LABEL_CLASS}>Icon</Label>
        <div className="flex gap-2" role="radiogroup" aria-label="Rating icon">
          {RATING_ICONS.map((i) => (
            <button
              key={i.value}
              type="button"
              role="radio"
              aria-checked={icon === i.value}
              aria-label={i.label}
              title={i.label}
              onClick={() => onChange({ max, icon: i.value, color })}
              className={cn(
                'h-9 w-9 inline-flex items-center justify-center rounded-lg border transition-colors',
                icon === i.value
                  ? 'border-primary bg-primary/10'
                  : 'border-[#E5E5E5] dark:border-[hsl(220,25%,18%)] hover:bg-[#F4F4F5] dark:hover:bg-[hsl(220,25%,12%)]',
              )}
            >
              <RatingGlyph icon={i.value} filled hex={hex} size={16} />
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-1.5">
        <Label className={LABEL_CLASS}>Colour</Label>
        <div className="flex gap-2" role="radiogroup" aria-label="Rating colour">
          {RATING_COLORS.map((c) => (
            <button
              key={c.value}
              type="button"
              role="radio"
              aria-checked={color === c.value}
              aria-label={c.label}
              title={c.label}
              onClick={() => onChange({ max, icon, color: c.value })}
              className={cn(
                'h-6 w-6 rounded-full transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1',
                color === c.value ? 'ring-2 ring-offset-1 ring-[#374151] dark:ring-[hsl(220,25%,88%)]' : '',
              )}
              style={{ backgroundColor: c.hex }}
            />
          ))}
        </div>
      </div>

      <div className="rounded-lg border border-dashed border-[#E5E5E5] dark:border-[hsl(220,25%,18%)] px-3 py-2">
        <p className="text-3xs font-semibold uppercase tracking-widest text-[#9AA2AF]">Preview</p>
        <div className="mt-1 flex items-center gap-0.5">
          {Array.from({ length: max }, (_, i) => (
            <RatingGlyph key={i} icon={icon} filled={i < previewFilled} hex={hex} />
          ))}
        </div>
      </div>
    </div>
  );
}
