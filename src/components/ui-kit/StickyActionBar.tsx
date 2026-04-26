import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * StickyActionBar — primary actions that stay glued to the bottom of the
 * screen on mobile so the user's thumb never has to chase them. On desktop
 * the bar renders inline at the foot of the page like a normal flex row.
 *
 * Sits ABOVE the bottom tab bar (h-14) on mobile, with safe-area insets
 * applied so it clears the iOS home-indicator. Use `<StickyActionBarSpacer />`
 * once at the bottom of the page so the sticky bar doesn't visually overlap
 * the last list item.
 *
 * Typical usage on a list/detail page with a primary action:
 *
 *   <StickyActionBar>
 *     <Button variant="outline" className="flex-1 h-12">Cancel</Button>
 *     <Button className="flex-1 h-12">Save changes</Button>
 *   </StickyActionBar>
 *   <StickyActionBarSpacer />
 */
export interface StickyActionBarProps extends React.HTMLAttributes<HTMLDivElement> {
  /** When true, the bar floats with a translucent surface; otherwise it's solid. */
  glass?: boolean;
}

export function StickyActionBar({ className, glass = true, children, ...props }: StickyActionBarProps) {
  return (
    <>
      {/* Mobile: fixed above the tab bar, hidden on desktop */}
      <div
        className={cn(
          'md:hidden fixed inset-x-0 z-30',
          // bottom-14 = above the 56px tab bar; pb adds the safe-area inset
          'bottom-14 pb-[env(safe-area-inset-bottom)]',
          glass
            ? 'bg-card/85 backdrop-blur-md border-t border-border/60 shadow-[0_-2px_12px_-4px_hsl(var(--primary)/0.08)]'
            : 'bg-background border-t border-border/60',
          className,
        )}
        {...props}
      >
        <div className="flex items-stretch gap-2 px-4 py-3">{children}</div>
      </div>

      {/* Desktop: inline at the bottom of the page */}
      <div
        className={cn(
          'hidden md:flex items-center justify-end gap-2 pt-2',
          className,
        )}
        {...props}
      >
        {children}
      </div>
    </>
  );
}

/**
 * Spacer to drop at the very bottom of a page that uses `<StickyActionBar />`.
 * Reserves vertical room equal to the bar's height so the last list item or
 * paragraph isn't hidden behind it on mobile. No-op on desktop.
 */
export function StickyActionBarSpacer({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn('md:hidden', className)}
      style={{ height: 'calc(72px + env(safe-area-inset-bottom))' }}
    />
  );
}
