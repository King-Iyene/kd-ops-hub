import { ChevronDown } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { StatusDot } from './StatusDot';
import type { TaskStatus } from '../api/statuses';

export function StatusPill({
  status,
  statuses,
  onChange,
  disabled,
}: {
  status: TaskStatus | undefined;
  statuses: TaskStatus[];
  onChange: (statusId: string) => void;
  disabled?: boolean;
}) {
  const label = status?.name ?? 'No status';
  const color = status?.color ?? 'hsl(var(--muted-foreground))';

  if (disabled) {
    return (
      <span
        className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-3xs font-bold uppercase tracking-wide"
        style={{ backgroundColor: `${color}1a`, color }}
      >
        <StatusDot color={color} />
        {label}
      </span>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-3xs font-bold uppercase tracking-wide hover:opacity-80 kd-transition"
          style={{ backgroundColor: `${color}1a`, color }}
        >
          <StatusDot color={color} />
          {label}
          <ChevronDown className="h-3 w-3" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {statuses.map((s) => (
          <DropdownMenuItem key={s.id} onSelect={() => onChange(s.id)} className="gap-2">
            <StatusDot color={s.color} />
            <span className={cn(s.id === status?.id && 'font-semibold')}>{s.name}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
