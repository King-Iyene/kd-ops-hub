import { useState, type CSSProperties } from 'react';
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

const SIZES = { sm: 'h-7 w-7 text-2xs', md: 'h-9 w-9 text-xs', lg: 'h-12 w-12 text-sm' } as const;

function Photo({ url, className }: { url: string; className?: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) return null;
  return (
    <img
      src={url} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)} data-testid="person-photo"
      className={cn('absolute inset-0 h-full w-full rounded-full object-cover', className)}
    />
  );
}

/**
 * The person's profile photo (a public URL on `profiles.photo_url`), or their initials in a soft tinted circle when there is
 * no photo or it cannot load. Decorative: the name is always written next to it.
 */
export function PersonAvatar({ name, photoUrl, size = 'md', className }: { name: string | null | undefined; photoUrl?: string | null; size?: keyof typeof SIZES; className?: string }) {
  const hue = hueOf(name ?? '');
  return (
    <span
      aria-hidden="true"
      className={cn('relative inline-flex shrink-0 select-none items-center justify-center overflow-hidden rounded-full bg-[hsl(var(--h)_45%_50%_/_0.16)] font-semibold text-[hsl(var(--h)_60%_34%)] dark:text-[hsl(var(--h)_65%_74%)]', SIZES[size], className)}
      style={{ '--h': hue } as CSSProperties}
    >
      {initialsOf(name)}
      {photoUrl ? <Photo key={photoUrl} url={photoUrl} /> : null}
    </span>
  );
}
