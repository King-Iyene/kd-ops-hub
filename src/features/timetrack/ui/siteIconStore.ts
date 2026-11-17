import { useSyncExternalStore } from 'react';
import { supabase } from '@/lib/supabase';

/**
 * Official site logos, fetched through our own site-icons function in batches (see
 * supabase/functions/site-icons). Icons are cached for the session; icons that were not found are
 * remembered as null so they are not asked for again.
 */
const cache = new Map<string, string | null>();
const pending = new Set<string>();
const inflight = new Set<string>();
const listeners = new Set<() => void>();
let version = 0;
let timer: ReturnType<typeof setTimeout> | null = null;

function notify() {
  version++;
  listeners.forEach((l) => l());
}

async function flush() {
  timer = null;
  const all = [...pending];
  pending.clear();
  for (let i = 0; i < all.length; i += 50) {
    const batch = all.slice(i, i + 50);
    batch.forEach((d) => inflight.add(d));
    try {
      const { data, error } = await supabase.functions.invoke('site-icons', { body: { domains: batch } });
      if (error) throw error;
      const icons = (data?.icons ?? {}) as Record<string, string | null>;
      for (const d of batch) cache.set(d, icons[d] ?? null);
    } catch {
      // function unavailable or offline: fall back to letter tiles, try again next page load
      for (const d of batch) cache.set(d, null);
    } finally {
      batch.forEach((d) => inflight.delete(d));
      notify();
    }
  }
}

function request(domain: string) {
  if (cache.has(domain) || pending.has(domain) || inflight.has(domain)) return;
  pending.add(domain);
  if (!timer) timer = setTimeout(flush, 40); // gather every icon on screen into one request
}

/** The logo (data URL) for a domain, or null if there is none yet / none exists. */
export function useSiteLogo(domain: string | null): string | null {
  useSyncExternalStore(
    (cb) => { listeners.add(cb); return () => { listeners.delete(cb); }; },
    () => version,
    () => 0,
  );
  if (!domain) return null;
  request(domain);
  return cache.get(domain) ?? null;
}
