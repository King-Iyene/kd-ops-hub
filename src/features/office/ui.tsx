import { useEffect } from 'react';

/**
 * One look for every popup in the office: a refined typeface (Manrope, from Google Fonts), calm frosted surfaces, small
 * caps for labels. Put the class "ko" on a popup's outer element to get the typeface.
 */
export function useOfficeFont() {
  useEffect(() => {
    if (document.getElementById('ko-font')) return;
    const link = document.createElement('link');
    link.id = 'ko-font';
    link.rel = 'stylesheet';
    link.href = 'https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&display=swap';
    document.head.appendChild(link);
    const style = document.createElement('style');
    style.id = 'ko-style';
    style.textContent = '.ko,.ko *:not(canvas){font-family:"Manrope",ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;letter-spacing:-0.006em}.ko .mono{font-family:ui-monospace,Menlo,Consolas,monospace}';
    document.head.appendChild(style);
  }, []);
}

/** A frosted floating surface (cards, menus). */
export const SURFACE = 'rounded-2xl border border-white/[0.08] bg-popover/95 text-popover-foreground shadow-[0_24px_60px_-18px_rgba(0,0,0,0.7)] ring-1 ring-black/30 backdrop-blur-2xl';

/** Small caps label. */
export const LABEL = 'text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground';

/** A quiet button, and the one that matters. */
export const BTN = 'inline-flex h-8 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-3 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40';
export const BTN_QUIET = `${BTN} bg-white/[0.06] text-foreground hover:bg-white/[0.11]`;
export const BTN_MAIN = `${BTN} bg-primary text-primary-foreground shadow-sm hover:brightness-110`;
export const BTN_ICON = 'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/[0.06] text-foreground transition-colors hover:bg-white/[0.12] disabled:cursor-not-allowed disabled:opacity-40';
