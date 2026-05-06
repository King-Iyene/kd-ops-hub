import { cn } from '@/lib/utils';
import { type LucideIcon } from 'lucide-react';

interface Props {
  title: string;
  description?: string;
  icon?: LucideIcon;
  actions?: React.ReactNode;
  className?: string;
  badge?: React.ReactNode;
}

export function PageHeader({ title, description, icon: Icon, actions, badge, className }: Props) {
  return (
    <div className={cn('flex items-start justify-between gap-4 flex-wrap mb-6', className)}>
      <div className="flex items-start gap-3 min-w-0">
        {Icon && (
          // Tech-tile icon container — gradient surface, hairline border ring,
          // animated outer glow that breathes with the time-of-day palette.
          <div className="relative h-11 w-11 shrink-0 mt-0.5">
            <span className="pointer-events-none absolute inset-0 rounded-xl bg-[hsl(var(--tod-glow))] opacity-25 blur-lg kd-icon-glow" />
            <div className="relative h-11 w-11 rounded-xl bg-gradient-to-br from-primary/20 via-primary/10 to-secondary/15 border border-primary/20 flex items-center justify-center shadow-sm backdrop-blur-sm">
              <Icon className="h-5 w-5 text-primary drop-shadow-[0_0_6px_hsl(var(--primary)/0.6)]" />
            </div>
          </div>
        )}
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            {/* Gradient brand title — visible tech feel without losing legibility */}
            <h1 className="kd-display text-2xl font-bold tracking-tight kd-text-gradient">{title}</h1>
            {badge}
          </div>
          {description && (
            <p className="text-sm text-muted-foreground mt-1 leading-relaxed">{description}</p>
          )}
        </div>
      </div>
      {actions && <div className="flex gap-2 flex-wrap items-center">{actions}</div>}
    </div>
  );
}
