import { cn } from '@/lib/utils';

interface Props {
  children: React.ReactNode;
  className?: string;
  particles?: boolean;
  scanLine?: boolean;
  texture?: 'hex' | 'dots' | 'none';
}

export function AuroraHero({
  children,
  className,
  // kept for API compat, ignored
  particles: _p,
  scanLine: _s,
  texture: _t,
}: Props) {
  return (
    <div
      className={cn(
        'relative rounded-2xl border border-border/60 bg-card p-5 sm:p-6',
        className,
      )}
    >
      {children}
    </div>
  );
}
