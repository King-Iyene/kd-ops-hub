import { Repeat2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { DetailRecurrence } from '../detailTypes';
import { formatEstDay } from '../time';

/** How often this has come up for this person, e.g. "The 3rd time in the last 14 days", with the earlier dates. */
export function RecurrenceBanner({ recurrence }: { recurrence: DetailRecurrence }) {
  const repeat = recurrence.count_in_window >= 2;
  const dates = recurrence.dates.slice(0, 8);
  return (
    <div
      className={cn('flex gap-3 rounded-lg border p-3', repeat ? 'border-warning/40 bg-warning/10' : 'bg-muted/40')}
      role="note" aria-label="How often this has happened" data-testid="recurrence-banner" data-repeat={repeat || undefined}
    >
      <Repeat2 className={cn('mt-0.5 h-4 w-4 shrink-0', repeat ? 'text-warning' : 'text-muted-foreground')} aria-hidden="true" />
      <div className="min-w-0 text-sm">
        <p className="font-semibold">{recurrence.label}</p>
        {dates.length > 0 && (
          <p className="mt-0.5 text-xs text-muted-foreground">
            Earlier: {dates.map((d) => formatEstDay(d)).join(', ')}
            {recurrence.total > recurrence.count_in_window && <> · {recurrence.total} in all</>}
          </p>
        )}
      </div>
    </div>
  );
}
