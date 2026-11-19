import { useState, type CSSProperties } from 'react';
import { cn } from '@/lib/utils';
import { hueOf } from '../PersonAvatar';
import { cleanDomain, spent, type SiteCategory, type SiteVisit } from '../liveTypes';

/** The favicon for a site. Only a domain is ever sent, never a page address. */
export const faviconUrl = (domain: string) => `https://www.google.com/s2/favicons?domain=${encodeURIComponent(cleanDomain(domain))}&sz=64`;

const RING: Record<SiteCategory, string> = {
  unproductive: 'ring-2 ring-destructive',
  unknown: 'ring-2 ring-warning',
  approved: 'ring-1 ring-border',
};
export const CATEGORY_LABEL: Record<SiteCategory, string> = { unproductive: 'Unproductive site', unknown: 'Not on the site list', approved: 'Approved site' };

/**
 * A site's favicon in a round tile. A red ring means unproductive, an amber ring means not on the list, no ring
 * means approved. If the icon cannot load (offline, blocked, unknown site) a coloured letter tile stands in.
 */
export function SiteIcon({ domain, category = 'approved', size = 22, className }: { domain: string; category?: SiteCategory; size?: number; className?: string }) {
  const [failed, setFailed] = useState(false);
  const d = cleanDomain(domain);
  return (
    <span
      className={cn('relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-white', RING[category], className)}
      style={{ width: size, height: size }} data-testid="site-icon" data-category={category}
    >
      {failed ? (
        <span
          data-testid="site-icon-fallback" aria-hidden="true"
          className="flex h-full w-full items-center justify-center bg-[hsl(var(--h)_50%_42%)] font-semibold uppercase text-white"
          style={{ '--h': hueOf(d), fontSize: Math.round(size * 0.5) } as CSSProperties}
        >{d.charAt(0) || '?'}</span>
      ) : (
        <img
          src={faviconUrl(d)} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)}
          className="h-full w-full object-contain" style={{ padding: Math.max(2, Math.round(size * 0.16)) }}
        />
      )}
    </span>
  );
}

/** One site as a chip: icon, domain and the time spent ("youtube.com 12m"). */
export function SiteChip({ site }: { site: SiteVisit }) {
  const d = cleanDomain(site.domain);
  return (
    <li
      className="inline-flex max-w-full items-center gap-2 rounded-full border bg-background/60 py-1 pl-1 pr-3 text-xs"
      title={`${d}: ${CATEGORY_LABEL[site.category] ?? ''}, ${spent(site.seconds)}`} data-testid="site-chip"
    >
      <SiteIcon domain={d} category={site.category} size={22} />
      <span className="truncate font-medium">{d}</span>
      <span className="tabular-nums text-muted-foreground">{spent(site.seconds)}</span>
    </li>
  );
}

/** Overlapping favicons, the way an avatar group looks. Shows up to four, then "+N". */
export function SiteStack({ sites, size = 24 }: { sites: SiteVisit[]; size?: number }) {
  const shown = sites.slice(0, 4);
  const more = sites.length - shown.length;
  return (
    <span className="inline-flex items-center" aria-hidden="true">
      {shown.map((s, i) => (
        <SiteIcon key={s.domain} domain={s.domain} category={s.category} size={size} className={cn(i > 0 && '-ml-1', 'ring-offset-1 ring-offset-card')} />
      ))}
      {more > 0 && <span className="-ml-1 inline-flex items-center justify-center rounded-full bg-muted px-1.5 text-2xs font-medium tabular-nums text-muted-foreground ring-2 ring-card" style={{ height: size, minWidth: size }}>+{more}</span>}
    </span>
  );
}
