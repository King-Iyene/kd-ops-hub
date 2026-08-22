import * as React from 'react';
import { useIsMobile } from '@/hooks/use-mobile';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';

/**
 * ResponsiveDialog — renders as a centred dialog on desktop and a
 * bottom-sheet on mobile (the iOS / Android pattern). The sheet slides up
 * from the bottom with a drag-handle pill, scrolls internally, and the
 * sticky footer always stays in thumb reach.
 *
 * Drop-in shape (single component, no Content wrapper needed by callers):
 *
 *   <ResponsiveDialog
 *     open={open}
 *     onOpenChange={setOpen}
 *     title="Edit vehicle"
 *     description="Change the assigned driver."
 *     footer={<><Button variant="outline">Cancel</Button><Button>Save</Button></>}
 *   >
 *     <form>...form fields...</form>
 *   </ResponsiveDialog>
 */
export interface ResponsiveDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: React.ReactNode;
  description?: React.ReactNode;
  /** Custom header content. If provided, replaces the default title/description block. */
  header?: React.ReactNode;
  /** Sticky footer (typically Cancel + primary action). */
  footer?: React.ReactNode;
  /** Max width on desktop. Default `lg` (32rem). */
  size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl' | '4xl';
  /** Optional extra classes for the content container. */
  className?: string;
  /**
   * Block accidental dismissal — an outside click or Escape no longer
   * closes the dialog; only the explicit X button or a Cancel/Close
   * action in `footer` does. Use for forms where losing in-progress
   * input is costly (money entry, multi-field setup) — a stray click
   * outside a modal shouldn't discard money-related work in progress.
   */
  preventOutsideClose?: boolean;
  /** Body content. */
  children?: React.ReactNode;
}

const SIZE_MAP: Record<NonNullable<ResponsiveDialogProps['size']>, string> = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-xl',
  '2xl': 'max-w-2xl',
  '3xl': 'max-w-3xl',
  '4xl': 'max-w-4xl',
};

export function ResponsiveDialog({
  open,
  onOpenChange,
  title,
  description,
  header,
  footer,
  size = 'lg',
  className,
  preventOutsideClose,
  children,
}: ResponsiveDialogProps) {
  const isMobile = useIsMobile();
  const blockOutside = preventOutsideClose
    ? { onPointerDownOutside: (e: Event) => e.preventDefault(), onEscapeKeyDown: (e: Event) => e.preventDefault() }
    : {};

  const headerNode =
    header ??
    (title || description ? (
      <DialogHeader className="text-left space-y-1">
        {title && <DialogTitle className="kd-display text-lg leading-tight">{title}</DialogTitle>}
        {description && <DialogDescription>{description}</DialogDescription>}
      </DialogHeader>
    ) : null);

  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side="bottom"
          className={cn(
            'rounded-t-2xl border-t border-border/60 max-h-[92vh] p-0 flex flex-col gap-0 safe-bottom',
            className,
          )}
          {...blockOutside}
        >
          {/* Drag-handle pill — communicates "swipe to dismiss" */}
          <div className="flex justify-center pt-2 pb-1 shrink-0">
            <span className="block h-1.5 w-10 rounded-full bg-muted-foreground/25" />
          </div>
          {headerNode && (
            <div className="px-5 pt-1 pb-3 shrink-0 border-b border-border/60">
              {headerNode}
            </div>
          )}
          <div className="flex-1 overflow-y-auto px-5 py-4 min-h-0">{children}</div>
          {footer && (
            <div className="shrink-0 px-5 pt-3 pb-3 border-t border-border/60 bg-background flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              {footer}
            </div>
          )}
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(SIZE_MAP[size], 'max-h-[92vh] flex flex-col gap-0 p-0', className)}
        {...blockOutside}
      >
        {headerNode && (
          <div className="px-6 pt-6 pb-3 shrink-0 border-b border-border/60">{headerNode}</div>
        )}
        <div className="flex-1 overflow-y-auto px-6 py-4 min-h-0">{children}</div>
        {footer && (
          <DialogFooter className="shrink-0 px-6 pb-6 pt-3 border-t border-border/60 bg-background">
            {footer}
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}

/* Re-export raw header pieces so callers can build a custom `header` prop
 * (icon-haloed titles, badges, etc.) using the same primitives this dialog
 * would render. */
export { DialogTitle as ResponsiveDialogTitle, DialogDescription as ResponsiveDialogDescription };
