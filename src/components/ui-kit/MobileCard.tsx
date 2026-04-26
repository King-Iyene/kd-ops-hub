import * as React from 'react';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * MobileCard — a thumb-sized list-row card, used as the mobile counterpart
 * to a desktop table row. Consistent height, glass-light surface, taps with
 * an iOS-style scale-down. Use the `MobileCardRow`, `MobileCardTitle`, and
 * `MobileCardMeta` building blocks inside for a uniform look across pages.
 *
 * Typical pattern in a list page:
 *
 *   <div className="hidden md:block"><Table>...</Table></div>
 *   <div className="md:hidden space-y-2">
 *     {rows.map(r => (
 *       <MobileCard key={r.id} onClick={() => openDetail(r)}>
 *         <MobileCardHeader>
 *           <MobileCardTitle>{r.name}</MobileCardTitle>
 *           <MobileCardMeta>{formatNaira(r.amount)}</MobileCardMeta>
 *         </MobileCardHeader>
 *         <MobileCardRow label="Date">{formatDate(r.date)}</MobileCardRow>
 *         <MobileCardRow label="Status"><StatusBadge status={r.status} /></MobileCardRow>
 *       </MobileCard>
 *     ))}
 *   </div>
 */
export interface MobileCardProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Show a chevron on the right edge — hint that the card opens a detail view. */
  chevron?: boolean;
  /** Subtle accent bar on the left edge (e.g., status colour). Pass a Tailwind bg class. */
  accentClassName?: string;
}

export const MobileCard = React.forwardRef<HTMLDivElement, MobileCardProps>(
  ({ className, chevron, accentClassName, children, onClick, ...props }, ref) => {
    const interactive = !!onClick || props.role === 'button' || props.tabIndex === 0;
    return (
      <div
        ref={ref}
        onClick={onClick}
        className={cn(
          'relative rounded-xl border border-border/60 bg-card/80 backdrop-blur-sm overflow-hidden',
          'kd-transition shadow-[0_1px_2px_hsl(var(--border)/0.4)]',
          interactive && 'cursor-pointer active:scale-[0.985] active:bg-muted/40 hover:border-border',
          className,
        )}
        {...props}
      >
        {accentClassName && (
          <span className={cn('absolute inset-y-2 left-0 w-1 rounded-r-full', accentClassName)} />
        )}
        <div className={cn('flex items-stretch gap-3 px-4 py-3', accentClassName && 'pl-4')}>
          <div className="flex-1 min-w-0 space-y-2">{children}</div>
          {chevron && (
            <ChevronRight className="h-4 w-4 text-muted-foreground/50 shrink-0 self-center" />
          )}
        </div>
      </div>
    );
  },
);
MobileCard.displayName = 'MobileCard';

/** Top row of a card — title on the left, meta (e.g., amount) on the right. */
export function MobileCardHeader({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('flex items-start justify-between gap-3 min-w-0', className)}
      {...props}
    >
      {children}
    </div>
  );
}

/** Primary card label — driver name, batch label, employee, etc. */
export function MobileCardTitle({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('text-sm font-semibold text-foreground truncate min-w-0 flex-1', className)}
      {...props}
    >
      {children}
    </div>
  );
}

/** Right-aligned metadata — amount, status badge, time. */
export function MobileCardMeta({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('text-sm font-medium tabular-nums text-foreground shrink-0 text-right', className)}
      {...props}
    >
      {children}
    </div>
  );
}

/** A label/value row inside the card body. */
export function MobileCardRow({
  label,
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { label: React.ReactNode }) {
  return (
    <div
      className={cn('flex items-center justify-between gap-3 text-xs', className)}
      {...props}
    >
      <span className="text-muted-foreground/80 shrink-0">{label}</span>
      <span className="text-foreground/90 truncate min-w-0 text-right">{children}</span>
    </div>
  );
}

/** Footer row inside a card — typically used for actions or secondary info. */
export function MobileCardFooter({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'pt-2 mt-1 border-t border-border/40 flex items-center justify-between gap-2 text-xs',
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

/**
 * MobileCardList — a wrapper that switches between desktop (children passed
 * through) and mobile (a stacked list of cards rendered from `data`). Keeps
 * the call site readable when both views co-exist on the same page.
 *
 * Usage:
 *   <MobileCardList
 *     data={rows}
 *     mobile={(row) => (
 *       <MobileCard key={row.id} onClick={() => open(row)}>...</MobileCard>
 *     )}
 *     desktop={<Table>...</Table>}
 *   />
 */
export function MobileCardList<T>({
  data,
  desktop,
  mobile,
  empty,
  className,
}: {
  data: T[];
  desktop: React.ReactNode;
  mobile: (row: T, index: number) => React.ReactNode;
  empty?: React.ReactNode;
  className?: string;
}) {
  return (
    <>
      <div className="hidden md:block">{desktop}</div>
      <div className={cn('md:hidden space-y-2', className)}>
        {data.length === 0 ? empty : data.map((row, i) => mobile(row, i))}
      </div>
    </>
  );
}
