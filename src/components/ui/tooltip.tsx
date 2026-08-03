import * as React from "react";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";

import { cn } from "@/lib/utils";

const TooltipProvider = TooltipPrimitive.Provider;

const Tooltip = TooltipPrimitive.Root;

const TooltipTrigger = TooltipPrimitive.Trigger;

/**
 * Defaults tightened so platform-wide tooltips feel slick:
 *   • Portal — every other floating surface in this codebase (Select,
 *     Popover, DropdownMenu, Dialog, Sheet…) portals to document.body.
 *     Tooltip was the one exception, which meant it rendered inline
 *     inside whatever scrollable container it was triggered from —
 *     any ancestor with overflow-y:auto (a scrolling Dialog body, a
 *     long form) clipped the bubble at the edges and it lost proper
 *     stacking above the dialog. Portal fixes both at once.
 *   • sideOffset 8 — gives the bubble breathing room from the trigger
 *     so the arrow doesn't fight with the icon glyph.
 *   • collisionPadding 12 — keeps the bubble at least 12px clear of the
 *     viewport edge, fixing the "tooltip is half cropped at the top of
 *     the page" bug on icons sitting near the page header.
 *   • avoidCollisions — Radix flips to the opposite side when there's
 *     no space (default true; we set it explicitly here so it's
 *     obvious).
 *   • max-w-xs by default — long help-text wraps to multiple lines
 *     instead of running off-screen as a single horizontal strip.
 *   • backdrop-blur + ring — bg-popover alone sits too close in
 *     luminance to bg-card in dark mode (11% vs 8% lightness) to read
 *     as "floating" on its own; the blur + hairline ring gives it a
 *     visible edge against any surface it appears over.
 *   • text-xs leading-relaxed + roomier padding — the tight leading-snug
 *     read as cramped for multi-line hint copy.
 */
const TooltipContent = React.forwardRef<
  React.ElementRef<typeof TooltipPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>
>(({ className, sideOffset = 8, collisionPadding = 12, ...props }, ref) => (
  <TooltipPrimitive.Portal>
    <TooltipPrimitive.Content
      ref={ref}
      sideOffset={sideOffset}
      collisionPadding={collisionPadding}
      avoidCollisions
      className={cn(
        "z-[100] max-w-xs overflow-hidden rounded-lg border border-border/80 bg-popover/95 backdrop-blur-sm px-3 py-2 text-xs leading-relaxed text-popover-foreground shadow-lg ring-1 ring-black/[0.04] dark:ring-white/[0.06] animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2",
        className,
      )}
      {...props}
    />
  </TooltipPrimitive.Portal>
));
TooltipContent.displayName = TooltipPrimitive.Content.displayName;

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider };
