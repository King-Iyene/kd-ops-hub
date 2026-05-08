import { type LucideIcon, TrendingUp, TrendingDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CountUp } from '@/components/CountUp';

interface Props {
  title: string;
  value: string | number;
  subtitle?: string;
  // `icon` kept in the API for backward-compat, but the new
  // bank-grade visual replaces the medallion with a coloured
  // status dot. Pass nothing if you don't have a meaningful tone.
  icon?: LucideIcon;
  tone?: 'default' | 'primary' | 'success' | 'warning' | 'danger' | 'gold';
  trend?: { value: number; label?: string };
  className?: string;
  onClick?: () => void;
}

// Tones map to the leading status dot. Same colour vocabulary used
// across Payments / Transactions / Schedule / Payroll list rows so
// the entire platform reads with one set of hues.
const dotColor: Record<NonNullable<Props['tone']>, string> = {
  default: 'bg-slate-400',
  primary: 'bg-blue-500',
  success: 'bg-emerald-500',
  warning: 'bg-amber-500',
  danger:  'bg-red-500',
  gold:    'bg-amber-400',
};

export function StatCard({
  title,
  value,
  subtitle,
  tone = 'default',
  trend,
  className,
  onClick,
}: Props) {
  const dot = dotColor[tone];
  const isPositiveTrend = (trend?.value ?? 0) >= 0;

  return (
    <div
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => e.key === 'Enter' && onClick() : undefined}
      className={cn(
        'rounded-lg border border-border/60 bg-card px-4 py-3.5 kd-transition',
        onClick && 'cursor-pointer hover:bg-muted/30 hover:border-border',
        className,
      )}
      onClick={onClick}
    >
      <div className="flex items-center gap-1.5">
        <span className={cn('h-1.5 w-1.5 rounded-full shrink-0', dot)} />
        <p className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted-foreground/80 truncate">
          {title}
        </p>
      </div>
      <p className="mt-1.5 text-[22px] font-semibold tabular-nums tracking-tight text-foreground leading-none truncate">
        {typeof value === 'number' && Number.isFinite(value)
          ? <CountUp value={value} />
          : value}
      </p>
      {subtitle && (
        <p className="mt-1 text-[11px] text-muted-foreground tabular-nums truncate">{subtitle}</p>
      )}
      {trend && (
        <div className={cn(
          'flex items-center gap-1 mt-1 text-[11px] font-medium tabular-nums',
          isPositiveTrend ? 'text-emerald-700' : 'text-red-700',
        )}>
          {isPositiveTrend
            ? <TrendingUp className="h-2.5 w-2.5 shrink-0" />
            : <TrendingDown className="h-2.5 w-2.5 shrink-0" />
          }
          <span>{isPositiveTrend ? '+' : ''}{trend.value}%</span>
          {trend.label && <span className="text-muted-foreground font-normal">{trend.label}</span>}
        </div>
      )}
    </div>
  );
}
