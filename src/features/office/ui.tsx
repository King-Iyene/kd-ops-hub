import { useEffect } from 'react';

/**
 * One look for every popup in the office: a refined typeface (Manrope, from Google Fonts), calm frosted surfaces, small
 * caps for labels. Put the class "ko" on a popup's outer element to get the typeface.
 */

/**
 * The Office look, in one static stylesheet (no runtime cost): KD brand colours (deep teal ground, cyan light, gold accent).
 * Every Office popup is a Radix dialog carrying the class "ko", so the dialog selector below re-themes all of them at once:
 * it only swaps the colour variables, so the buttons, inputs and text inside follow without any per-component change.
 */
const KO_CSS = [
  '.ko,.ko *:not(canvas){font-family:"Manrope",ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;letter-spacing:-0.006em}',
  '.ko .mono{font-family:ui-monospace,Menlo,Consolas,monospace}',
  '.ko[role="dialog"][data-state]{--background:200 62% 9%;--foreground:190 35% 95%;--card:199 55% 13%;--card-foreground:190 35% 95%;--popover:200 62% 10%;--popover-foreground:190 35% 95%;--muted:199 45% 17%;--muted-foreground:194 22% 70%;--border:195 45% 22%;--input:195 45% 24%;--ring:186 100% 50%;--primary:186 100% 50%;--primary-foreground:200 100% 9%;--secondary:199 45% 18%;--secondary-foreground:190 35% 95%;--accent:41 62% 58%;--accent-foreground:201 100% 8%;color-scheme:dark;color:hsl(var(--foreground));border:1px solid rgba(0,236,255,.16);box-shadow:0 34px 90px -26px rgba(0,0,0,.85),inset 0 1px 0 rgba(255,255,255,.07);background:radial-gradient(120% 90% at 0% 0%,rgba(0,236,255,.10),transparent 55%),radial-gradient(90% 70% at 100% 100%,rgba(214,172,80,.09),transparent 60%),linear-gradient(165deg,#06384e,#042635 60%,#031a26)}',
  '.kd-card{background:radial-gradient(120% 80% at 50% 0%,rgba(0,236,255,.14),transparent 60%),linear-gradient(170deg,#08415a,#052d3f 70%,#04212e);box-shadow:0 18px 44px -12px rgba(0,0,0,.7),inset 0 1px 0 rgba(255,255,255,.08),0 0 0 1px rgba(0,236,255,.2)}',
  '.kd-card::before{content:"";position:absolute;left:18%;right:18%;top:0;height:2px;border-radius:2px;background:linear-gradient(90deg,transparent,#D6AC50,transparent)}',
  '.kd-chip{display:inline-flex;align-items:center;gap:.3rem;border-radius:999px;padding:.12rem .55rem;font-size:11px;font-weight:600;background:rgba(0,236,255,.10);color:#9ff6ff;box-shadow:inset 0 0 0 1px rgba(0,236,255,.22)}',
  '.kd-gold{background:linear-gradient(135deg,#E6C275,#D6AC50 55%,#B98B2E);color:#2a1c00}',
  '.kd-rise{animation:kd-rise .38s cubic-bezier(.2,.7,.2,1) both;animation-delay:calc(var(--i,0)*45ms)}',
  '@keyframes kd-rise{from{opacity:0;transform:translateY(8px) scale(.98)}to{opacity:1;transform:none}}',
  '@media (prefers-reduced-motion:reduce){.kd-rise{animation:none}}',
].join('');

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
    style.textContent = KO_CSS;
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
