// Theme toggle — light / dark / system.
//
// Cycle behaviour: light → dark → system → light…
// The icon reflects the *resolved* theme (so "system" shows whichever the OS
// is currently using). A small dot accent on the corner indicates "system".
//
// IMPORTANT: this is independent from useTimeOfDay(). Time-of-day controls
// the decorative aurora gradient (--tod-*); theme controls surface colors.

import { useEffect, useState } from 'react';
import { useTheme } from 'next-themes';
import { Moon, Sun, Monitor } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

const ORDER: Array<'light' | 'dark' | 'system'> = ['light', 'dark', 'system'];

export function ThemeToggle() {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  // next-themes hydrates after the first render — wait so SSR/CSR markup matches.
  useEffect(() => setMounted(true), []);

  const cycle = () => {
    const current = (theme as typeof ORDER[number]) ?? 'system';
    const next = ORDER[(ORDER.indexOf(current) + 1) % ORDER.length];
    setTheme(next);
  };

  if (!mounted) {
    // Match the size of the eventual button to avoid layout shift.
    return <div className="h-8 w-8" aria-hidden />;
  }

  const isSystem = theme === 'system';
  const Icon =
    isSystem ? Monitor
    : resolvedTheme === 'dark' ? Moon
    : Sun;

  const label =
    theme === 'light' ? 'Light theme · click for dark'
    : theme === 'dark' ? 'Dark theme · click for system'
    : 'System theme · click for light';

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            onClick={cycle}
            aria-label={label}
            className="h-8 w-8 relative"
          >
            <Icon className="h-4 w-4 transition-transform" />
            {isSystem && (
              <span
                aria-hidden
                className="absolute bottom-1 right-1 h-1.5 w-1.5 rounded-full bg-primary"
              />
            )}
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">{label}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
