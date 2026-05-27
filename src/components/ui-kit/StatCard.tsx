import { useRef, type MouseEvent } from 'react';
import { type LucideIcon, TrendingUp, TrendingDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CountUp } from '@/components/CountUp';

interface Props {
  title: string;
  value: string | number;
  subtitle?: string;
  icon?: LucideIcon;
  tone?: 'default' | 'primary' | 'success' | 'warning' | 'danger' | 'gold';
  trend?: { value: number; label?: string };
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
}> = {
  default: {
    iconBg:  'bg-slate-100 dark:bg-slate-800',
    iconColor: 'text-slate-500',
    dot:     'bg-slate-400',
    trendUp: 'text-emerald-600 dark:text-emerald-400',
    trendDown: 'text-rose-600 dark:text-rose-400',
    bg:      '',
  },
  primary: {
    iconBg:  'bg-primary/10 dark:bg-primary/15',
    iconColor: 'text-primary',
    dot:     'bg-primary',
    trendUp: 'text-primary',
    trendDown: 'text-rose-600 dark:text-rose-400',
    bg:      'kd-stat-primary',
  },
  success: {
    iconBg:  'bg-emerald-50 dark:bg-emerald-900/20',
    iconColor: 'text-emerald-600 dark:text-emerald-400',
    dot:     'bg-emerald-500',
    trendUp: 'text-emerald-600 dark:text-emerald-400',
    trendDown: 'text-rose-600 dark:text-rose-400',
    bg:      'kd-stat-success',
  },
  warning: {
    iconBg:  'bg-amber-50 dark:bg-amber-900/20',
    iconColor: 'text-amber-600 dark:text-amber-400',
    dot:     'bg-amber-500',
    trendUp: 'text-emerald-600 dark:text-emerald-400',
    trendDown: 'text-amber-600 dark:text-amber-400',
    bg:      'kd-stat-warning',
  },
  danger: {
    iconBg:  'bg-rose-50 dark:bg-rose-900/20',
    iconColor: 'text-rose-600 dark:text-rose-400',
    dot:     'bg-rose-500',
    trendUp: 'text-emerald-600 dark:text-emerald-400',
    trendDown: 'text-rose-600 dark:text-rose-400',
    bg:      'kd-stat-danger',
  },
  gold: {
    iconBg:  'bg-amber-50 dark:bg-amber-900/20',
    iconColor: 'text-amber-500 dark:text-amber-400',
    dot:     'bg-amber-400',
    trendUp: 'text-emerald-600 dark:text-emerald-400',
    trendDown: 'text-rose-600 dark:text-rose-400',
    bg:      'kd-stat-gold',
  },
};

export function StatCard({
  title,
  value,
  subtitle,
  icon: Icon,
  tone = 'default',
  trend,
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

      <div className="relative z-[2] p-4">
        {/* Header row: label + icon */}
        <div className="flex items-start justify-between gap-2 mb-3">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className={cn('h-1.5 w-1.5 rounded-full shrink-0 mt-px', cfg.dot)} />
            <p className="text-label-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground/80 truncate leading-none pt-px">
              {title}
            </p>
          </div>
          {Icon && (
            <div className={cn(
              'h-7 w-7 rounded-lg flex items-center justify-center shrink-0 -mt-0.5',
              cfg.iconBg,
            )}>
              <Icon className={cn('h-3.5 w-3.5', cfg.iconColor)} strokeWidth={2} />
            </div>
          )}
        </div>

        {/* Value — display-weight number */}
        <div className="kd-stat-number text-stat-md font-bold text-foreground leading-none tabular-nums truncate">
          {typeof value === 'number' && Number.isFinite(value)
            ? <CountUp value={value} />
            : value}
        </div>

        {/* Subtitle + trend */}
        {(subtitle || trend) && (
          <div className="flex items-center justify-between gap-2 mt-2">
            {subtitle && (
              <p className="text-[11px] text-muted-foreground tabular-nums truncate">{subtitle}</p>
            )}
            {trend && (
              <div className={cn(
                'flex items-center gap-0.5 text-[11px] font-semibold tabular-nums shrink-0 ml-auto',
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
