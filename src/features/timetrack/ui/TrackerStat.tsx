import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  title: string;
  value: string | number;
  subtitle?: string;
  /** Accepted so existing call sites keep working; flat tiles carry no icon. */
  icon?: LucideIcon;
  tone?: 'default' | 'primary' | 'success' | 'warning' | 'danger' | 'gold' | 'info';
  className?: string;
}

/**
 * Flat stat tile for the Time Tracking module: small caption, big number, plain
 * border. TimeCamp style, with none of the shared StatCard's gradient wash, glow,
 * hover tilt or count-up animation.
 */
export function StatCard({ title, value, subtitle, className }: Props) {
  return (
    <div className={cn('rounded-lg border border-border bg-card px-4 py-3', className)}>
      <p className="text-xs text-muted-foreground">{title}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">{value}</p>
      {subtitle && <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>}
    </div>
  );
}
