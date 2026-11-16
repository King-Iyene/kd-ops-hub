import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { InfoHint } from '@/components/ui-kit/InfoHint';

interface Props {
  title: string;
  description?: string;
  /** Accepted so existing call sites keep working; the tracker header is plain, with no icon tile. */
  icon?: LucideIcon;
  actions?: ReactNode;
  className?: string;
  badge?: ReactNode;
  info?: ReactNode;
  compact?: boolean;
}

/**
 * Flat page header for the Time Tracking module, modelled on TimeCamp: a plain
 * title and a quiet subtitle. No gradient text, icon glow or aurora halo (the
 * shared PageHeader has all three, which is what made this module look generic).
 * Same props as the shared PageHeader, so pages only change their import.
 */
export function PageHeader({ title, description, actions, badge, info, className, compact }: Props) {
  return (
    <div className={cn('flex items-center justify-between gap-4 flex-wrap', compact ? 'mb-3' : 'mb-5', className)}>
      <div className="min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <h1 className={cn('font-semibold tracking-tight text-foreground', compact ? 'text-lg' : 'text-xl')}>{title}</h1>
          {info && <InfoHint>{info}</InfoHint>}
          {badge}
        </div>
        {description && <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2 flex-wrap">{actions}</div>}
    </div>
  );
}
