import { CalendarIcon, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

function toLocalDateString(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function TaskDatePicker({
  value,
  onChange,
  placeholder = 'Set date',
  className,
}: {
  value: string | null;
  onChange: (date: string | null) => void;
  placeholder?: string;
  className?: string;
}) {
  const selected = value ? new Date(`${value}T00:00:00`) : undefined;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={cn('h-7 text-xs gap-1.5 font-normal', !value && 'text-muted-foreground', className)}
        >
          <CalendarIcon className="h-3 w-3" />
          {value ? selected?.toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : placeholder}
          {value && (
            <span
              role="button"
              tabIndex={-1}
              onClick={(e) => { e.stopPropagation(); onChange(null); }}
              className="ml-0.5 hover:text-destructive"
            >
              <X className="h-3 w-3" />
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={selected}
          onSelect={(day) => onChange(day ? toLocalDateString(day) : null)}
          initialFocus
        />
      </PopoverContent>
    </Popover>
  );
}
