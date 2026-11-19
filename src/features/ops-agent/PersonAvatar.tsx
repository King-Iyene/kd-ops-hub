import type { CSSProperties } from 'react';
import { cn } from '@/lib/utils';

export function initialsOf(name: string | null | undefined): string {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  return ((parts[0][0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] ?? '' : '')).toUpperCase();
}

/** A stable hue per name so the same person always has the same colour. */
export function hueOf(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) % 360;
  return h;
}

/** Initials in a soft tinted circle. Decorative: the name is always written next to it. */
export function PersonAvatar({ name, size = 'md', className }: { name: string | null | undefined; size?: 'sm' | 'md'; className?: string }) {
  const hue = hueOf(name ?? '');
  return (
    <span
      aria-hidden="true"
      className={cn('inline-flex shrink-0 select-none items-center justify-center rounded-full bg-[hsl(var(--h)_45%_50%_/_0.16)] font-semibold text-[hsl(var(--h)_60%_34%)] dark:text-[hsl(var(--h)_65%_74%)]', size === 'sm' ? 'h-7 w-7 text-2xs' : 'h-9 w-9 text-xs', className)}
      style={{ '--h': hue } as CSSProperties}
    >
      {initialsOf(name)}
    </span>
  );
}
