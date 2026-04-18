import { Info } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface Props {
  text: string;
  side?: 'top' | 'right' | 'bottom' | 'left';
}

export function InfoTip({ text, side = 'top' }: Props) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Info className="h-3.5 w-3.5 text-muted-foreground/60 hover:text-muted-foreground cursor-help inline-block ml-1 shrink-0" />
      </TooltipTrigger>
      <TooltipContent side={side} className="max-w-xs text-xs">
        {text}
      </TooltipContent>
    </Tooltip>
  );
}
