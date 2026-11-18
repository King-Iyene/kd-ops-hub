import { cn } from '@/lib/utils';
import { formatDue } from '../lib/format';

export function DueDate({ dueDate, hasTime, className }: { dueDate: string | null; hasTime: boolean; className?: string }) {
  if (!dueDate) return null;
  const { text, variant } = formatDue(dueDate, new Date(), hasTime);
  return (
    <span
      className={cn(
        'text-2xs font-medium whitespace-nowrap',
        variant === 'overdue' ? 'text-destructive' : 'text-muted-foreground',
        className,
      )}
    >
      {text}
    </span>
  );
}
