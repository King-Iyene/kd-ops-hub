import * as React from 'react';
import { useState } from 'react';
import { SlidersHorizontal, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';

/**
 * MobileFilterBar — keeps filter rows usable on phones.
 *
 * On desktop (md+) it renders the search slot and the filters slot inline,
 * exactly like a normal filter row.
 *
 * On mobile it shows the search slot full-width plus a small "Filters"
 * button. Tapping the button opens a bottom-sheet containing the filters.
 * The optional `activeCount` shows a numeric badge so users know filters
 * are applied even when collapsed.
 *
 *   <MobileFilterBar
 *     search={<Input value={q} onChange={...} className="kd-input" />}
 *     filters={
 *       <>
 *         <Select>...</Select>
 *         <Select>...</Select>
 *       </>
 *     }
 *     activeCount={2}
 *     onClear={() => clearAllFilters()}
 *   />
 */
export interface MobileFilterBarProps {
  /** The search input. Always visible on mobile (full width). */
  search?: React.ReactNode;
  /** The non-search filters. Inline on desktop, behind a Filters button on mobile. */
  filters?: React.ReactNode;
  /** Number of filters currently applied — shows as a badge on the Filters button. */
  activeCount?: number;
  /** Optional "Clear all" callback. Shown in the mobile sheet footer when active. */
  onClear?: () => void;
  /** Trailing slot that always stays inline (e.g., an Export CSV button). */
  trailing?: React.ReactNode;
  className?: string;
}

export function MobileFilterBar({
  search,
  filters,
  activeCount = 0,
  onClear,
  trailing,
  className,
}: MobileFilterBarProps) {
  const [open, setOpen] = useState(false);
  const hasFilters = filters !== undefined && filters !== null;

  return (
    <div className={cn('flex flex-wrap items-center gap-2', className)}>
      {/* Search — full width on mobile, natural width on desktop */}
      {search && (
        <div className="flex-1 min-w-0 md:flex-initial md:min-w-[220px]">{search}</div>
      )}

      {/* Desktop: inline filters */}
      {hasFilters && (
        <div className="hidden md:flex items-center gap-2 flex-wrap">{filters}</div>
      )}

      {/* Mobile: Filters button → Sheet */}
      {hasFilters && (
        <Button
          variant="outline"
          size="sm"
          className="md:hidden h-10 px-3 gap-1.5 shrink-0"
          onClick={() => setOpen(true)}
        >
          <SlidersHorizontal className="h-4 w-4" />
          <span className="text-sm">Filters</span>
          {activeCount > 0 && (
            <span className="ml-1 inline-flex items-center justify-center h-5 min-w-5 px-1.5 rounded-full bg-primary text-primary-foreground text-[11px] font-bold">
              {activeCount > 9 ? '9+' : activeCount}
            </span>
          )}
        </Button>
      )}

      {trailing && <div className="flex items-center gap-2 ml-auto">{trailing}</div>}

      {hasFilters && (
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetContent
            side="bottom"
            className="md:hidden rounded-t-2xl max-h-[85vh] p-0 flex flex-col gap-0 safe-bottom"
          >
            <div className="flex justify-center pt-2 pb-1 shrink-0">
              <span className="block h-1.5 w-10 rounded-full bg-muted-foreground/25" />
            </div>
            <div className="px-5 pt-1 pb-3 shrink-0 border-b border-border/60 flex items-center justify-between">
              <h3 className="kd-display text-base font-semibold">Filters</h3>
              <button
                onClick={() => setOpen(false)}
                className="text-muted-foreground hover:text-foreground"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-4 min-h-0 space-y-3 [&_*[data-mobile-filter-row]]:w-full">
              {filters}
            </div>
            <div className="shrink-0 px-5 pt-3 pb-3 border-t border-border/60 bg-background flex gap-2">
              {onClear && activeCount > 0 && (
                <Button variant="outline" className="flex-1 h-11" onClick={() => { onClear(); setOpen(false); }}>
                  Clear all
                </Button>
              )}
              <Button className="flex-1 h-11" onClick={() => setOpen(false)}>
                Apply
              </Button>
            </div>
          </SheetContent>
        </Sheet>
      )}
    </div>
  );
}
