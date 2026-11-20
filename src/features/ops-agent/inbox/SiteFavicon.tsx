import { useState, type CSSProperties } from 'react';
import { cn } from '@/lib/utils';
import { hueOf } from '../PersonAvatar';
import { cleanDomain, spent, type SiteCategory, type SiteVisit } from '../liveTypes';

/**
 * Where a site's favicon can come from, best first. Only a domain is ever sent, never a page address. If one source cannot load
 * (blocked on a network, down, unknown site) the next is tried, and a coloured letter tile stands in only when every one fails.
 */
export function faviconSources(domain: string): string[] {
  const d = encodeURIComponent(cleanDomain(domain));
  return [
    `https://t1.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://${d}&size=64`,
    `https://www.google.com/s2/favicons?domain=${d}&sz=64`,
    `https://icons.duckduckgo.com/ip3/${d}.ico`,
    `https://${d}/favicon.ico`,
  ];
}
export const faviconUrl = (domain: string) => faviconSources(domain)[0];

const RING: Record<SiteCategory, string> = {
  unproductive: 'ring-2 ring-destructive',
  unknown: 'ring-2 ring-warning',
  approved: 'ring-1 ring-border',
};
export const CATEGORY_LABEL: Record<SiteCategory, string> = { unproductive: 'Unproductive site', unknown: 'Not on the site list', approved: 'Approved site' };

/**
 * A site's favicon in a round tile. A red ring means unproductive, an amber ring means not on the list, no ring
 * means approved. The icon is looked for in several places in turn; if none loads (offline, blocked, unknown site) a coloured letter tile stands in.
 */
export function SiteIcon({ domain, category = 'approved', size = 22, className }: { domain: string; category?: SiteCategory; size?: number; className?: string }) {
  const d = cleanDomain(domain);
  // Which source we are on, remembered with the domain it was for (a different site starts again from the first).
  const [tried, setTried] = useState<{ domain: string; n: number }>({ domain: d, n: 0 });
  const sources = faviconSources(d);
  const n = tried.domain === d ? tried.n : 0;
  const failed = n >= sources.length;
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
          key={sources[n]} src={sources[n]} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setTried({ domain: d, n: n + 1 })}
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
