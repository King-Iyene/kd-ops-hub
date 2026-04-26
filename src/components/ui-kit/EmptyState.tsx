import { type LucideIcon, Inbox } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
  compact?: boolean;
}

export function EmptyState({
  icon: Icon = Inbox,
  title,
  description,
  action,
  className,
  compact = false,
}: Props) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center text-center px-6',
        compact ? 'py-8 gap-2.5' : 'py-16 gap-4',
        className,
      )}
    >
      <div className={cn(
        'relative rounded-2xl bg-muted/60 flex items-center justify-center kd-animate-float',
        compact ? 'h-10 w-10' : 'h-14 w-14',
      )}>
        {/* Soft aurora halo */}
        {!compact && (
          <span className="pointer-events-none absolute inset-0 rounded-2xl bg-[hsl(var(--tod-glow))] opacity-10 blur-xl" />
        )}
        <Icon className={cn('relative text-muted-foreground/70', compact ? 'h-5 w-5' : 'h-7 w-7')} />
      </div>
      <div className="space-y-1.5 max-w-xs">
        <h3 className={cn('font-semibold text-foreground', compact ? 'text-sm' : 'text-base')}>
          {title}
        </h3>
        {description && (
          <p className="text-sm text-muted-foreground leading-relaxed">{description}</p>
        )}
      </div>
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}
