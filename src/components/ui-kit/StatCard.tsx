import { useRef, type MouseEvent } from 'react';
import { type LucideIcon, TrendingUp, TrendingDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CountUp } from '@/components/CountUp';

interface Props {
  title: string;
  value: string | number;
  subtitle?: string;
  icon?: LucideIcon;
  tone?: 'default' | 'primary' | 'success' | 'warning' | 'danger' | 'gold' | 'info';
  trend?: { value: number; label?: string };
  compact?: boolean;
  className?: string;
  onClick?: () => void;
}

// Icon + accent color per tone — consistent across all dashboard surfaces
const toneConfig: Record<NonNullable<Props['tone']>, {
  iconBg: string;
  iconColor: string;
  dot: string;
  trendUp: string;
  trendDown: string;
  bg: string;
  border: string;
}> = {
  default: {
    iconBg:  'bg-slate-100 dark:bg-slate-800/60',
    iconColor: 'text-slate-500 dark:text-slate-400',
    dot:     'bg-slate-400',
    trendUp: 'text-success',
    trendDown: 'text-rose-600 dark:text-rose-400',
    bg:      '',
    border:  '',
  },
  primary: {
    iconBg:  'bg-primary/10 dark:bg-primary/15',
    iconColor: 'text-primary',
    dot:     'bg-primary',
    trendUp: 'text-primary',
    trendDown: 'text-rose-600 dark:text-rose-400',
    bg:      'kd-stat-primary',
    border:  '',
  },
  success: {
    iconBg:  'bg-success/10/25',
    iconColor: 'text-success',
    dot:     'bg-emerald-500',
    trendUp: 'text-success',
    trendDown: 'text-rose-600 dark:text-rose-400',
    bg:      'kd-stat-success',
    border:  '',
  },
  warning: {
    iconBg:  'bg-warning/10/25',
    iconColor: 'text-warning',
    dot:     'bg-amber-500',
    trendUp: 'text-success',
    trendDown: 'text-warning',
    bg:      'kd-stat-warning',
    border:  'border-l-[3px] border-l-amber-500/70',
  },
  danger: {
    iconBg:  'bg-rose-50 dark:bg-rose-900/25',
    iconColor: 'text-rose-600 dark:text-rose-400',
    dot:     'bg-rose-500',
    trendUp: 'text-success',
    trendDown: 'text-rose-600 dark:text-rose-400',
    bg:      'kd-stat-danger',
    border:  'border-l-[3px] border-l-rose-500/70',
  },
  gold: {
    iconBg:  'bg-warning/10/25',
    iconColor: 'text-amber-500 dark:text-amber-400',
    dot:     'bg-amber-400',
    trendUp: 'text-success',
    trendDown: 'text-rose-600 dark:text-rose-400',
    bg:      'kd-stat-gold',
    border:  '',
  },
  info: {
    iconBg:  'bg-sky-50 dark:bg-sky-900/25',
    iconColor: 'text-sky-600 dark:text-sky-400',
    dot:     'bg-sky-500',
    trendUp: 'text-success',
    trendDown: 'text-rose-600 dark:text-rose-400',
    bg:      '',
    border:  '',
  },
};

export function StatCard({
  title,
  value,
  subtitle,
  icon: Icon,
  tone = 'default',
  trend,
  compact,
  className,
  onClick,
}: Props) {
  const cfg = toneConfig[tone];
  const isPositiveTrend = (trend?.value ?? 0) >= 0;
  const cardRef = useRef<HTMLDivElement>(null);

  const handleMouseMove = (e: MouseEvent<HTMLDivElement>) => {
    const el = cardRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    el.style.setProperty('--mx', `${e.clientX - rect.left}px`);
    el.style.setProperty('--my', `${e.clientY - rect.top}px`);
  };

  return (
    <div
      ref={cardRef}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => e.key === 'Enter' && onClick() : undefined}
      onMouseMove={handleMouseMove}
      className={cn(
        'kd-holographic relative rounded-xl border bg-card kd-transition overflow-hidden',
        cfg.bg,
        cfg.border,
        onClick && 'cursor-pointer',
        className,
      )}
      onClick={onClick}
      aria-label={onClick ? `${title}: ${value}` : undefined}
    >
      {/* Hover lift */}
      {onClick && (
        <div className="pointer-events-none absolute inset-0 opacity-0 hover:opacity-100 transition-opacity duration-200 bg-gradient-to-br from-transparent to-[hsl(var(--primary)/0.04)]" />
      )}

      <div className={cn('relative z-[2]', compact ? 'p-3' : 'p-4 sm:p-5')}>
        {/* Header row: label + icon */}
        <div className={cn('flex items-start justify-between gap-2', compact ? 'mb-1.5' : 'mb-3')}>
          <div className="flex items-center gap-1.5 min-w-0">
            <span className={cn('h-1.5 w-1.5 rounded-full shrink-0 mt-px', cfg.dot)} />
            <p className={cn('font-semibold uppercase tracking-[0.08em] text-muted-foreground/80 leading-tight pt-px', compact ? 'text-3xs' : 'text-2xs')}>
              {title}
            </p>
          </div>
          {Icon && (
            <div className={cn(
              'rounded-xl flex items-center justify-center shrink-0 -mt-0.5',
              compact ? 'h-7 w-7 rounded-lg' : 'h-9 w-9',
              cfg.iconBg,
            )}>
              <Icon className={cn(compact ? 'h-3.5 w-3.5' : 'h-4 w-4', cfg.iconColor)} strokeWidth={2} />
            </div>
          )}
        </div>

        {/* Value — display-weight number */}
        <div className={cn(
          'kd-stat-number font-extrabold text-foreground leading-none tabular-nums',
          compact ? 'text-lg' : 'text-stat-md',
          typeof value === 'string' && value.length > 10 && !compact && 'text-xl sm:text-stat-md',
          typeof value === 'string' && value.length > 14 && !compact && '!text-lg sm:!text-xl',
        )}>
          {typeof value === 'number' && Number.isFinite(value)
            ? <CountUp value={value} />
            : value}
        </div>

        {/* Subtitle + trend */}
        {(subtitle || trend) && (
          <div className="flex items-center justify-between gap-2 mt-2">
            {subtitle && (
              <p className="text-2xs text-muted-foreground tabular-nums truncate">{subtitle}</p>
            )}
            {trend && (
              <div className={cn(
                'flex items-center gap-0.5 text-2xs font-semibold tabular-nums shrink-0 ml-auto',
                isPositiveTrend ? cfg.trendUp : cfg.trendDown,
              )}>
                {isPositiveTrend
                  ? <TrendingUp className="h-3 w-3" strokeWidth={2.5} />
                  : <TrendingDown className="h-3 w-3" strokeWidth={2.5} />}
                <span>{isPositiveTrend ? '+' : ''}{trend.value}%</span>
                {trend.label && (
                  <span className="font-normal text-muted-foreground ml-0.5">{trend.label}</span>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
