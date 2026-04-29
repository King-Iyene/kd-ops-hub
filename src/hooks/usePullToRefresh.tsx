import { useEffect, useRef, useState } from 'react';

/**
 * Pull-to-refresh — native-feeling on mobile, no-op on desktop and on
 * non-touch devices. Hook into any list page that has an async fetch:
 *
 *   const { containerRef, indicator } = usePullToRefresh(fetchData);
 *   return (
 *     <div ref={containerRef}>
 *       {indicator}
 *       ...page content...
 *     </div>
 *   );
 *
 * Behaviour:
 *  - Activates only when the scroll container is at the top (scrollTop = 0)
 *    and the user pulls down with one finger.
 *  - Resists past 80px so the gesture feels like real elastic.
 *  - Crossing the threshold (~64px) and releasing fires `onRefresh`.
 *  - During refresh, the spinner stays pinned at 56px until the promise
 *    resolves (max 8s safety timeout).
 *  - Skipped entirely if the device has no touch input or the viewport is
 *    md+ — desktop users get nothing extra.
 */

const THRESHOLD = 64;
const MAX_PULL = 96;
const MAX_REFRESH_MS = 8000;

export function usePullToRefresh(onRefresh: () => Promise<unknown> | void) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const startY = useRef<number | null>(null);
  const pulling = useRef(false);
  const [pullPx, setPullPx] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    // Skip on desktop and on devices without touch input (most desktop
    // browsers report no touch support; tablets in mouse mode also).
    const isTouch = typeof window !== 'undefined' &&
      ('ontouchstart' in window || navigator.maxTouchPoints > 0);
    if (!isTouch) return;
    if (typeof window !== 'undefined' && window.innerWidth >= 768) return;

    const onTouchStart = (e: TouchEvent) => {
      // Only start a pull when the page is already scrolled to the top —
      // otherwise the user is just scrolling up through the list.
      if (window.scrollY > 0) return;
      if (refreshing) return;
      startY.current = e.touches[0].clientY;
      pulling.current = true;
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!pulling.current || startY.current == null) return;
      const dy = e.touches[0].clientY - startY.current;
      if (dy <= 0) {
        // User reversed direction; cancel the pull.
        pulling.current = false;
        startY.current = null;
        setPullPx(0);
        return;
      }
      // Resistance — feels natural, not 1:1.
      const resisted = Math.min(MAX_PULL, dy * 0.5);
      setPullPx(resisted);
    };

    const onTouchEnd = async () => {
      if (!pulling.current) return;
      const triggered = pullPx >= THRESHOLD;
      pulling.current = false;
      startY.current = null;
      if (triggered) {
        setRefreshing(true);
        setPullPx(56); // pinned spinner position
        const safety = setTimeout(() => setRefreshing(false), MAX_REFRESH_MS);
        try {
          await Promise.resolve(onRefresh());
        } finally {
          clearTimeout(safety);
          setRefreshing(false);
          setPullPx(0);
        }
      } else {
        setPullPx(0);
      }
    };

    // passive:false on touchmove so we can prevent the browser bounce
    // when the user actively pulls (otherwise iOS Safari hijacks).
    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchmove', onTouchMove, { passive: true });
    el.addEventListener('touchend', onTouchEnd, { passive: true });
    el.addEventListener('touchcancel', onTouchEnd, { passive: true });

    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEnd);
      el.removeEventListener('touchcancel', onTouchEnd);
    };
  }, [onRefresh, pullPx, refreshing]);

  // Inline indicator markup — render this at the top of your list. Hidden
  // on desktop via the `md:hidden` class so it never appears on >=768px.
  const indicator = (
    <div
      aria-hidden
      className="md:hidden pointer-events-none flex justify-center"
      style={{
        height: pullPx,
        transition: pulling.current ? 'none' : 'height 220ms cubic-bezier(0.32, 0.72, 0, 1)',
        overflow: 'hidden',
      }}
    >
      <div
        className="flex items-center justify-center w-10 h-10 rounded-full bg-card border border-border/60 shadow-md mt-2"
        style={{
          opacity: Math.min(1, pullPx / THRESHOLD),
          transform: `rotate(${(pullPx / THRESHOLD) * 360}deg)`,
        }}
      >
        <svg
          className={refreshing ? 'animate-spin' : ''}
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          {refreshing
            ? <circle cx="12" cy="12" r="9" strokeDasharray="40 60" />
            : <path d="M21 12a9 9 0 1 1-3-6.7L21 8" />}
        </svg>
      </div>
    </div>
  );

  return { containerRef, indicator, refreshing };
}
