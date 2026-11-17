import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';
import { useSiteLogo } from './siteIconStore';

/**
 * The official logo of a site or app, in this order: the icon the desktop tracker read from the
 * app itself, then the site's logo (fetched by our own site-icons function, crisp up to 128px and
 * cached), then a coloured initial tile. Well-known desktop apps are mapped to their website.
 *
 * Privacy: the viewer's browser never contacts a logo service; our server asks for bare domain names only.
 */
const APP_DOMAINS: [RegExp, string][] = [
  [/claude|anthropic/i, 'claude.ai'], [/slack/i, 'slack.com'], [/teams/i, 'teams.microsoft.com'],
  [/zoom/i, 'zoom.us'], [/outlook/i, 'outlook.office.com'], [/excel|word|powerpoint|onenote|office/i, 'office.com'],
  [/chrome/i, 'google.com'], [/edge/i, 'microsoft.com'], [/firefox/i, 'mozilla.org'], [/brave/i, 'brave.com'],
  [/visual studio code|^code$|code\.exe/i, 'code.visualstudio.com'], [/notion/i, 'notion.so'], [/figma/i, 'figma.com'],
  [/canva/i, 'canva.com'], [/spotify/i, 'spotify.com'], [/whatsapp/i, 'whatsapp.com'], [/telegram/i, 'telegram.org'],
  [/discord/i, 'discord.com'], [/kd ops|kdops/i, 'kdsquares.com'], [/github/i, 'github.com'], [/postman/i, 'postman.com'],
  [/docker/i, 'docker.com'], [/steam/i, 'steampowered.com'], [/obsidian/i, 'obsidian.md'], [/vlc/i, 'videolan.org'],
  [/photoshop|illustrator|adobe|acrobat/i, 'adobe.com'], [/zapier/i, 'zapier.com'], [/make\.com|eu\d\.make/i, 'make.com'],
  [/windows terminal|powershell|cmd\.exe|terminal/i, 'microsoft.com'], [/explorer/i, 'microsoft.com'],
];

const BRAND_COLOR: [RegExp, string][] = [
  [/github/i, '#24292f'], [/google|chrome|gmail/i, '#4285f4'], [/facebook/i, '#1877f2'], [/instagram/i, '#d6249f'],
  [/youtube/i, '#ff0000'], [/netflix/i, '#e50914'], [/linkedin/i, '#0a66c2'], [/slack/i, '#611f69'], [/zoom/i, '#2d8cff'],
  [/teams/i, '#6264a7'], [/claude/i, '#d97757'], [/whatsapp/i, '#25d366'], [/spotify/i, '#1db954'],
];

/**
 * How a logo will look on the page. A filled tile (Slack, Claude) is shown as is; a transparent logo
 * with dark ink would vanish on the dark page, so it gets a soft light backing; a blank or all-white
 * image is not a logo at all, so the letter tile is used instead.
 */
type Look = 'ok' | 'dark' | 'light' | 'blank';
const looks = new Map<string, Look>();
function analyze(src: string): Promise<Look> {
  const hit = looks.get(src);
  if (hit) return Promise.resolve(hit);
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const N = 32;
        const c = document.createElement('canvas');
        c.width = N; c.height = N;
        const x = c.getContext('2d', { willReadFrequently: true })!;
        x.drawImage(img, 0, 0, N, N);
        const d = x.getImageData(0, 0, N, N).data;
        let opaque = 0, lum = 0, lumSq = 0;
        for (let i = 0; i < d.length; i += 4) {
          if (d[i + 3] < 40) continue;
          opaque++;
          const l = (0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]) / 255;
          lum += l; lumSq += l * l;
        }
        const frac = opaque / (N * N);
        const mean = opaque ? lum / opaque : 0;
        const sd = opaque ? Math.sqrt(Math.max(0, lumSq / opaque - mean * mean)) : 0;
        let look: Look = 'ok';
        if (frac < 0.02) look = 'blank';
        else if (frac > 0.8 && mean > 0.93 && sd < 0.05) look = 'blank'; // plain white square
        else if (frac <= 0.8 && mean < 0.35) look = 'dark'; // dark ink on transparent
        else if (frac <= 0.8 && mean > 0.85) look = 'light'; // white ink on transparent
        looks.set(src, look);
        resolve(look);
      } catch {
        resolve('ok');
      }
    };
    img.onerror = () => resolve('ok');
    img.src = src;
  });
}

/** True when the page background is dark (works for the app's light and dark themes). */
function pageIsDark(): boolean {
  try {
    const m = getComputedStyle(document.body).backgroundColor.match(/d+(.d+)?/g);
    if (!m) return true;
    const [r, g, b] = m.map(Number);
    return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 < 0.5;
  } catch {
    return true;
  }
}

/** A soft backing only when the logo's ink would disappear into the page: dark ink on a dark page, white ink on a light page. */
function backing(look: Look, box: { width: number; height: number }, size: number) {
  const dark = pageIsDark();
  if (look === 'dark' && dark) return { ...box, background: 'rgba(255,255,255,0.92)', borderRadius: size * 0.22, padding: size * 0.1 };
  if (look === 'light' && !dark) return { ...box, background: 'rgba(31,41,55,0.92)', borderRadius: size * 0.22, padding: size * 0.1 };
  return box;
}

function hashColor(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 360;
  return `hsl(${h} 55% 42%)`;
}

/** The website behind a capture's name: a domain is used as-is, app names are mapped, anything else has none. */
function domainFor(name: string): string | null {
  const n = name.trim().toLowerCase();
  if (/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(n)) return n.replace(/^www\./, '');
  return APP_DOMAINS.find(([re]) => re.test(name))?.[1] ?? null;
}

/** Real icons the desktop tracker read from each app's program file (shared, loaded once). */
function useAppIcons() {
  return useQuery({
    queryKey: ['timetrack', 'app-icons'],
    queryFn: async () => {
      const { data } = await supabase.from('time_app_icons').select('app_name, icon');
      return new Map((data ?? []).map((r) => [(r.app_name as string).toLowerCase(), r.icon as string]));
    },
    staleTime: 10 * 60_000,
  });
}

export function SiteIcon({ name, className, size = 24 }: { name: string; className?: string; size?: number }) {
  const [failed, setFailed] = useState(false);
  const [look, setLook] = useState<Look>('ok');
  const { data: appIcons } = useAppIcons();
  const appIcon = appIcons?.get(name.trim().toLowerCase());
  const domain = domainFor(name);
  const logo = useSiteLogo(appIcons?.get(name.trim().toLowerCase()) ? null : domain);
  const bg = BRAND_COLOR.find(([re]) => re.test(name))?.[1] ?? hashColor(name);
  const label = (name.replace(/^www\./, '').match(/[a-z0-9]/i)?.[0] ?? '?').toUpperCase();
  const box = { width: size, height: size };

  useEffect(() => {
    const src = appIcon ?? logo;
    if (!src) return;
    let live = true;
    void analyze(src).then((l) => { if (live) setLook(l); });
    return () => { live = false; };
  }, [appIcon, logo]);

  if (appIcon && look !== 'blank') {
    return (
      <span className={cn('inline-flex shrink-0 items-center justify-center', className)} style={backing(look, box, size)}>
        <img src={appIcon} alt="" draggable={false} className="h-full w-full object-contain" style={{ filter: 'drop-shadow(0 0 0.6px rgba(255,255,255,0.55))' }} />
      </span>
    );
  }
  if (logo && !failed && look !== 'blank') {
    return (
      <span className={cn('inline-flex shrink-0 items-center justify-center', className)} style={backing(look, box, size)}>
        <img
          src={logo}
          alt=""
          draggable={false}
          onError={() => setFailed(true)}
          className="h-full w-full object-contain"
          // no tile behind it: the logo sits straight on the page; a faint light edge keeps dark logos visible in dark mode
          style={{ filter: 'drop-shadow(0 0 0.6px rgba(255,255,255,0.55))' }}
        />
      </span>
    );
  }
  return (
    <span
      className={cn('inline-flex shrink-0 items-center justify-center font-bold leading-none text-white', className)}
      style={{ ...box, background: bg, borderRadius: size * 0.25, fontSize: Math.max(9, Math.round(size * 0.4)) }}
      aria-hidden
    >
      {label}
    </span>
  );
}
