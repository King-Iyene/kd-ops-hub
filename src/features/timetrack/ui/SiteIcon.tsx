import { useState } from 'react';
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
  const { data: appIcons } = useAppIcons();
  const appIcon = appIcons?.get(name.trim().toLowerCase());
  const domain = domainFor(name);
  const logo = useSiteLogo(appIcons?.get(name.trim().toLowerCase()) ? null : domain);
  const bg = BRAND_COLOR.find(([re]) => re.test(name))?.[1] ?? hashColor(name);
  const label = (name.replace(/^www\./, '').match(/[a-z0-9]/i)?.[0] ?? '?').toUpperCase();
  const box = { width: size, height: size };

  if (appIcon) {
    return (
      <span className={cn('inline-flex shrink-0 items-center justify-center overflow-hidden', className)} style={{ ...box, borderRadius: size * 0.2 }}>
        <img src={appIcon} alt="" draggable={false} className="h-full w-full object-contain" />
      </span>
    );
  }
  if (logo && !failed) {
    return (
      <span className={cn('inline-flex shrink-0 items-center justify-center overflow-hidden bg-white/95 p-[12%]', className)} style={{ ...box, borderRadius: size * 0.25 }}>
        <img
          src={logo}
          alt=""
          draggable={false}
          onError={() => setFailed(true)}
          className="h-full w-full object-contain"
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
