import { cn } from '@/lib/utils';

/**
 * A small brand-coloured tile for a site or app. Drawn locally from the name (known brands get their
 * own colour, everything else a stable colour from the name), so no site names are ever sent to a
 * third-party favicon service.
 */
const BRANDS: [RegExp, string, string][] = [
  [/github/i, '#24292f', 'GH'], [/google|gmail|chrome/i, '#4285f4', 'G'], [/docs\.google/i, '#4285f4', 'D'],
  [/sheets/i, '#0f9d58', 'S'], [/facebook/i, '#1877f2', 'f'], [/instagram/i, '#d6249f', 'IG'],
  [/tiktok/i, '#111111', 'TT'], [/twitter|^x\.com/i, '#111111', 'X'], [/youtube/i, '#ff0000', 'YT'],
  [/netflix/i, '#e50914', 'N'], [/linkedin/i, '#0a66c2', 'in'], [/slack/i, '#611f69', 'S'],
  [/zoom/i, '#2d8cff', 'Z'], [/teams/i, '#6264a7', 'T'], [/outlook/i, '#0078d4', 'O'], [/excel/i, '#217346', 'X'],
  [/word/i, '#2b579a', 'W'], [/powerpoint/i, '#d24726', 'P'], [/notion/i, '#111111', 'N'], [/figma/i, '#a259ff', 'F'],
  [/canva/i, '#00c4cc', 'C'], [/claude|anthropic/i, '#d97757', 'C'], [/supabase/i, '#3ecf8e', 'S'],
  [/vercel/i, '#000000', '▲'], [/whatsapp/i, '#25d366', 'W'], [/telegram/i, '#27a7e7', 'T'], [/spotify/i, '#1db954', 'S'],
  [/reddit/i, '#ff4500', 'R'], [/twitch/i, '#9146ff', 'T'], [/code|visual studio/i, '#007acc', '<>'],
  [/stripe/i, '#635bff', 'S'], [/kdsquares/i, '#006994', 'KD'], [/gohighlevel/i, '#1d6fef', 'GH'], [/make\.com/i, '#6d00cc', 'M'],
];

function hashColor(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 360;
  return `hsl(${h} 55% 42%)`;
}

export function SiteIcon({ name, className, size = 24 }: { name: string; className?: string; size?: number }) {
  const brand = BRANDS.find(([re]) => re.test(name));
  const bg = brand?.[1] ?? hashColor(name);
  const label = brand?.[2] ?? (name.replace(/^www\./, '').match(/[a-z0-9]/i)?.[0] ?? '?').toUpperCase();
  return (
    <span
      className={cn('inline-flex shrink-0 items-center justify-center rounded-md font-bold leading-none text-white', className)}
      style={{ background: bg, width: size, height: size, fontSize: Math.max(9, Math.round(size * 0.38)) }}
      aria-hidden
    >
      {label}
    </span>
  );
}
