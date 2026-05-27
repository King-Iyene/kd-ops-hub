import { type LucideIcon, Inbox } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Illustration, type IllustrationKind } from '@/components/Illustrations';

interface Props {
  icon?: LucideIcon;
  /** Use a bespoke animated illustration instead of the icon. Takes precedence. */
  illustration?: IllustrationKind;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
  compact?: boolean;
  /** Tone affects the icon container background. */
  tone?: 'default' | 'primary' | 'success' | 'warning' | 'danger';
}

const toneBg: Record<NonNullable<Props['tone']>, string> = {
  default:  'bg-muted/50',
  primary:  'bg-primary/8',
  success:  'bg-emerald-50 dark:bg-emerald-900/20',
  warning:  'bg-amber-50 dark:bg-amber-900/20',
  danger:   'bg-rose-50 dark:bg-rose-900/20',
};

const toneIcon: Record<NonNullable<Props['tone']>, string> = {
  default:  'text-muted-foreground/60',
  primary:  'text-primary/70',
  success:  'text-emerald-500',
  warning:  'text-amber-500',
  danger:   'text-rose-500',
};

export function EmptyState({
  icon: Icon = Inbox,
  illustration,
  title,
  description,
  action,
  className,
  compact = false,
  tone = 'default',
}: Props) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center text-center px-6',
        compact ? 'py-6 gap-2' : 'py-14 gap-5',
        className,
      )}
      role="status"
    >
      {illustration && !compact ? (
        <Illustration kind={illustration} className="h-36 w-36 -mb-1 opacity-90" />
      ) : (
        <div className={cn(
          'relative rounded-2xl flex items-center justify-center',
          toneBg[tone],
          compact ? 'h-10 w-10' : 'h-16 w-16',
          !compact && 'kd-animate-float',
        )}>
          {/* Outer glow halo */}
          {!compact && (
            <span className="pointer-events-none absolute inset-0 rounded-2xl bg-[hsl(var(--tod-glow))] opacity-10 blur-2xl" />
          )}
          <Icon className={cn(
            'relative',
            toneIcon[tone],
            compact ? 'h-5 w-5' : 'h-8 w-8',
          )} />
        </div>
      )}

      <div className={cn(
        'space-y-1.5 max-w-[280px]',
        compact && 'space-y-1',
      )}>
        <h3 className={cn(
          'font-semibold text-foreground leading-snug',
          compact ? 'text-sm' : 'text-base',
        )}>
          {title}
        </h3>
        {description && (
          <p className={cn(
            'text-muted-foreground leading-relaxed',
            compact ? 'text-xs' : 'text-sm',
          )}>
            {description}
          </p>
        )}
      </div>

      {action && (
        <div className={cn('mt-1', compact && 'mt-0')}>{action}</div>
      )}
    </div>
  );
}
