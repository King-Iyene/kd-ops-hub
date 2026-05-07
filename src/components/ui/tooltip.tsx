import * as React from "react";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";

import { cn } from "@/lib/utils";

const TooltipProvider = TooltipPrimitive.Provider;

const Tooltip = TooltipPrimitive.Root;

const TooltipTrigger = TooltipPrimitive.Trigger;

/**
 * Defaults tightened so platform-wide tooltips feel slick:
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
 *   • text-xs leading-snug + slightly tighter padding — reads better
 *     for the short hint copy that 90% of these surfaces carry.
 */
const TooltipContent = React.forwardRef<
  React.ElementRef<typeof TooltipPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>
>(({ className, sideOffset = 8, collisionPadding = 12, ...props }, ref) => (
  <TooltipPrimitive.Content
    ref={ref}
    sideOffset={sideOffset}
    collisionPadding={collisionPadding}
    avoidCollisions
    className={cn(
      "z-50 max-w-xs overflow-hidden rounded-lg border border-border/80 bg-popover px-2.5 py-1.5 text-xs leading-snug text-popover-foreground shadow-lg animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2",
      className,
    )}
    {...props}
  />
));
TooltipContent.displayName = TooltipPrimitive.Content.displayName;

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider };
