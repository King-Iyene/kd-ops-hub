import { cn } from '@/lib/utils';
import { type LucideIcon } from 'lucide-react';
import { InfoHint } from '@/components/ui-kit/InfoHint';

interface Props {
  title: string;
  description?: string;
  icon?: LucideIcon;
  actions?: React.ReactNode;
  className?: string;
  badge?: React.ReactNode;
  info?: React.ReactNode;
  /** Compact variant — shorter margin, smaller type. For sub-page sections. */
  compact?: boolean;
}

export function PageHeader({ title, description, icon: Icon, actions, badge, info, className, compact }: Props) {
  return (
    <div className={cn(
      'flex items-start justify-between gap-4 flex-wrap',
      compact ? 'mb-4' : 'mb-6',
      className,
    )}>
      <div className="flex items-start gap-3 min-w-0">
        {Icon && (
          <div className="relative shrink-0 mt-0.5">
            {/* Aurora glow halo */}
            <span className="pointer-events-none absolute inset-0 rounded-xl bg-[hsl(var(--tod-glow))] opacity-20 blur-lg kd-icon-glow" />
            {/* Icon tile — brand gradient + hairline border */}
            <div className={cn(
              'relative rounded-xl flex items-center justify-center',
              'bg-gradient-to-br from-primary/18 via-primary/10 to-secondary/12',
              'border border-primary/18 shadow-sm backdrop-blur-sm',
              compact ? 'h-9 w-9' : 'h-11 w-11',
            )}>
              <Icon className={cn(
                'text-primary drop-shadow-[0_0_6px_hsl(var(--primary)/0.55)]',
                compact ? 'h-4 w-4' : 'h-5 w-5',
              )} />
            </div>
          </div>
        )}
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className={cn(
              'kd-display font-bold tracking-tight kd-text-gradient',
              compact ? 'text-xl' : 'text-[1.625rem] leading-8',
            )}>
              {title}
            </h1>
            {info && <InfoHint>{info}</InfoHint>}
            {badge}
          </div>
          {description && (
            <p className={cn(
              'text-muted-foreground leading-relaxed mt-1',
              compact ? 'text-xs' : 'text-sm',
            )}>
              {description}
            </p>
          )}
        </div>
      </div>
      {actions && (
        <div className="flex gap-2 flex-wrap items-center shrink-0">
          {actions}
        </div>
      )}
    </div>
  );
}
