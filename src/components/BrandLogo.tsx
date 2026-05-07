/**
 * Single source of truth for the company logo + name across the
 * platform. Use this in the sidebar header, receipt header, login
 * card, and any other surface where the brand needs to render.
 *
 * Loading order, so the logo never flickers:
 *   1. localStorage cache (instant on every page load).
 *   2. Background fetch from company_settings — updates state +
 *      refreshes the cache when the row resolves.
 *   3. Bundled PWA icon (/icon-192.png) as the universal fallback —
 *      same emblem the user sees on the home-screen install. Never
 *      degrades to "KS" / "KD" text initials, which were the source
 *      of the cross-role inconsistency that made receipts look
 *      different for different operators.
 */
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';

const LOGO_CACHE_KEY  = 'kdops_logo_url';
const NAME_CACHE_KEY  = 'kdops_company_name';
const FALLBACK_LOGO   = '/icon-192.png';
const FALLBACK_NAME   = 'KD Squares';

interface BrandState {
  logoUrl: string;
  companyName: string;
  /** True until the first DB fetch resolves. Renders are still safe — the
   *  cached / fallback values are used in the meantime. */
  loading: boolean;
}

let inflight: Promise<{ logo_url: string | null; company_name: string | null } | null> | null = null;

async function fetchBrand() {
  if (!inflight) {
    inflight = supabase
      .from('company_settings')
      .select('logo_url, company_name')
      .limit(1)
      .maybeSingle()
      .then(({ data }) => data as { logo_url: string | null; company_name: string | null } | null)
      .catch(() => null)
      .finally(() => { inflight = null; });
  }
  return inflight;
}

export function useBrand(): BrandState {
  const [state, setState] = useState<BrandState>(() => ({
    logoUrl:     (typeof window !== 'undefined' && localStorage.getItem(LOGO_CACHE_KEY))  || FALLBACK_LOGO,
    companyName: (typeof window !== 'undefined' && localStorage.getItem(NAME_CACHE_KEY))  || FALLBACK_NAME,
    loading:     true,
  }));

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const data = await fetchBrand();
      if (cancelled) return;
      const nextLogo = data?.logo_url   || FALLBACK_LOGO;
      const nextName = data?.company_name || FALLBACK_NAME;
      try {
        if (data?.logo_url)     localStorage.setItem(LOGO_CACHE_KEY,  data.logo_url);
        if (data?.company_name) localStorage.setItem(NAME_CACHE_KEY,  data.company_name);
      } catch { /* localStorage unavailable */ }
      setState({ logoUrl: nextLogo, companyName: nextName, loading: false });
    })();
    return () => { cancelled = true; };
  }, []);

  return state;
}

/** A simple <img> tag with consistent sizing and the right fallback in
 *  case the URL 404s (which can happen if the storage object expires
 *  or RLS rotates). Drop-in replacement for places that previously
 *  rendered initials. */
export function BrandLogo({
  className,
  size = 36,
  alt = 'KDOps',
}: {
  className?: string;
  size?: number;
  alt?: string;
}) {
  const { logoUrl } = useBrand();
  return (
    <img
      src={logoUrl}
      alt={alt}
      width={size}
      height={size}
      className={cn('object-contain', className)}
      onError={(e) => {
        // Storage object missing or 403 — fall back to the bundled
        // PWA icon so the receipt / sidebar / login still renders the
        // brand emblem instead of a broken-image glyph.
        const t = e.currentTarget;
        if (t.src !== window.location.origin + FALLBACK_LOGO) {
          t.src = FALLBACK_LOGO;
        }
      }}
    />
  );
}
