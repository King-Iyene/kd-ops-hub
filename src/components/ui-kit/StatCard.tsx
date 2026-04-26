import { useRef, type MouseEvent } from 'react';
import { type LucideIcon, TrendingUp, TrendingDown } from 'lucide-react';
import { cn } from '@/lib/utils';

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

const toneConfig: Record<NonNullable<Props['tone']>, { icon: string; gradient: string; glow: string }> = {
  default: {
    icon: 'bg-primary/10 text-primary',
    gradient: 'from-primary/5 to-transparent',
    glow: 'hover:shadow-[0_4px_20px_-4px_hsl(var(--primary)/0.15)]',
  },
  primary: {
    icon: 'bg-primary/10 text-primary',
    gradient: 'from-primary/5 to-transparent',
    glow: 'hover:shadow-[0_4px_20px_-4px_hsl(var(--primary)/0.15)]',
  },
  success: {
    icon: 'bg-success/10 text-success',
    gradient: 'from-success/5 to-transparent',
    glow: 'hover:shadow-[0_4px_20px_-4px_hsl(var(--success)/0.15)]',
  },
  warning: {
    icon: 'bg-warning/10 text-warning',
    gradient: 'from-warning/8 to-transparent',
    glow: 'hover:shadow-[0_4px_20px_-4px_hsl(var(--warning)/0.15)]',
  },
  danger: {
    icon: 'bg-destructive/10 text-destructive',
    gradient: 'from-destructive/5 to-transparent',
    glow: 'hover:shadow-[0_4px_20px_-4px_hsl(var(--destructive)/0.12)]',
  },
  gold: {
    icon: 'bg-amber-500/10 text-amber-600',
    gradient: 'from-amber-500/6 to-transparent',
    glow: 'hover:shadow-[0_4px_20px_-4px_hsl(41_62%_58%/0.2)]',
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
  const config = toneConfig[tone];
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
        'kd-holographic relative overflow-hidden rounded-xl border border-border/60 bg-card p-5',
        'kd-transition shadow-[var(--shadow-sm)]',
        onClick && 'cursor-pointer hover:-translate-y-0.5 hover:border-primary/20',
        onClick && config.glow,
        onClick && 'hover:shadow-[var(--shadow-md)]',
        className,
      )}
      onClick={onClick}
    >
      {/* Subtle gradient wash */}
      <div className={cn('absolute inset-0 bg-gradient-to-br pointer-events-none', config.gradient)} />

      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/80 truncate mb-2">
            {title}
          </p>
          <p className={cn('text-2xl font-bold leading-none currency kd-stat-number truncate', tone === 'gold' && 'kd-text-gradient-gold')}>
            {value}
          </p>
          {subtitle && (
            <p className="text-xs text-muted-foreground mt-1.5 truncate">{subtitle}</p>
          )}
          {trend && (
            <div className={cn(
              'flex items-center gap-1 mt-2 text-xs font-medium',
              isPositiveTrend ? 'text-success' : 'text-destructive',
            )}>
              {isPositiveTrend
                ? <TrendingUp className="h-3 w-3 shrink-0" />
                : <TrendingDown className="h-3 w-3 shrink-0" />
              }
              <span>{isPositiveTrend ? '+' : ''}{trend.value}%</span>
              {trend.label && <span className="text-muted-foreground font-normal">{trend.label}</span>}
            </div>
          )}
        </div>
        {Icon && (
          <div className={cn('h-11 w-11 rounded-xl flex items-center justify-center shrink-0', config.icon)}>
            <Icon className="h-5 w-5" />
          </div>
        )}
      </div>

      {/* Bottom accent line */}
      {onClick && (
        <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-primary/20 to-transparent opacity-0 group-hover:opacity-100 kd-transition" />
      )}
    </div>
  );
}
