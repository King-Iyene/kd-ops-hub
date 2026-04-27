import { useCallback, useEffect, useRef, useState } from 'react';

function ageLabel(date: Date): string {
  const secs = Math.floor((Date.now() - date.getTime()) / 1000);
  if (secs < 10) return 'just now';
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  return `${Math.floor(mins / 60)}h ago`;
}

interface AutoRefreshResult {
  lastUpdated: Date;
  lastUpdatedLabel: string;
  refresh: () => void;
}

/**
 * Automatically re-fetches data when:
 *  - The window regains focus (user switches back from another tab/app)
 *  - Every `intervalSec` seconds while the page is visible (default 60 s)
 *
 * Pass any stable or unstable reload function — it is captured via ref so
 * stale closure values are never called.
 */
export function useAutoRefresh(
  reload: () => Promise<void> | void,
  intervalSec = 60,
): AutoRefreshResult {
  const [lastUpdated, setLastUpdated] = useState<Date>(() => new Date());
  const [lastUpdatedLabel, setLastUpdatedLabel] = useState('just now');
  const reloadRef = useRef(reload);
  reloadRef.current = reload;

  const refresh = useCallback(() => {
    void reloadRef.current();
    setLastUpdated(new Date());
  }, []);

  // Re-fetch when the window/tab becomes active again.
  useEffect(() => {
    const onFocus = () => refresh();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [refresh]);

  // Periodic background refresh while visible.
  useEffect(() => {
    const id = setInterval(refresh, intervalSec * 1000);
    return () => clearInterval(id);
  }, [refresh, intervalSec]);

  // Tick the human-readable label every 10 s.
  useEffect(() => {
    setLastUpdatedLabel(ageLabel(lastUpdated));
    const id = setInterval(
      () => setLastUpdatedLabel(ageLabel(lastUpdated)),
      10_000,
    );
    return () => clearInterval(id);
  }, [lastUpdated]);

  return { lastUpdated, lastUpdatedLabel, refresh };
}
