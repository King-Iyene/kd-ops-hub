/**
 * InfoHint — small inline hint icon with a tooltip on hover/focus.
 *
 * Replaces the raw <Tooltip><TooltipTrigger asChild><Info /></...></Tooltip>
 * pattern that was repeated dozens of times across the platform with
 * mixed styling (different icon sizes, inconsistent side / sideOffset,
 * no max-width, etc.). Drop one of these next to a heading, label, or
 * button and the hint always renders the same way:
 *
 *   <h2 className="flex items-center gap-1.5">
 *     Cash burn
 *     <InfoHint>Average monthly outflow over the last 90 days.</InfoHint>
 *   </h2>
 *
 * Defaults to side="bottom" because info icons usually sit next to a
 * heading at the top of a card, where there's no space above for a
 * tooltip to render without getting clipped.
 */
import * as React from 'react';
import { Info } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

interface Props {
  children: React.ReactNode;
  /** Where to render the bubble. Default 'bottom'. */
  side?: 'top' | 'right' | 'bottom' | 'left';
  /** Optional override for the icon size in px. */
  size?: number;
  className?: string;
  /** Set true if the surrounding container is a button/link and the
   *  click event needs to be stopped from bubbling. */
  stopPropagation?: boolean;
}

export function InfoHint({
  children,
  side = 'bottom',
  size = 14,
  className,
  stopPropagation,
}: Props) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label="More info"
          onClick={(e) => {
            if (stopPropagation) e.stopPropagation();
            // Don't navigate / submit / collapse — this is a hint icon.
            e.preventDefault();
          }}
          className={cn(
            'inline-flex items-center justify-center rounded-full text-muted-foreground/60 hover:text-foreground hover:bg-muted/60 cursor-help kd-transition focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
            className,
          )}
          style={{ width: size + 4, height: size + 4 }}
        >
          <Info style={{ width: size, height: size }} />
        </button>
      </TooltipTrigger>
      <TooltipContent side={side}>
        {children}
      </TooltipContent>
    </Tooltip>
  );
}
