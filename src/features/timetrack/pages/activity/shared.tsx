import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format, startOfMonth } from 'date-fns';
import { Loader2, Download, Monitor } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

export interface ActivityLog {
  id: string;
  employee_id: string;
  window_title: string | null;
  app_name: string | null;
  url: string | null;
  productivity_category: string | null;
  captured_at: string;
  geo_city?: string | null;
  geo_region?: string | null;
  geo_country?: string | null;
  is_outside_geofence?: boolean | null;
}

export const CATEGORY_BADGE: Record<string, string> = {
  productive: 'bg-emerald-500/15 text-emerald-600 border-emerald-500/30',
  neutral: 'bg-muted text-muted-foreground',
  unproductive: 'bg-destructive/15 text-destructive border-destructive/30',
  idle: 'bg-sky-500/15 text-sky-600 border-sky-500/30',
  blocked: 'bg-red-600/20 text-red-600 border-red-600/40 font-semibold',
};

/** Best-effort domain for a capture: real URL when the agent could get one
 * (macOS only — see the url column's migration for why), else null so
 * callers can fall back to app/window-title grouping. */
export function captureDomain(log: Pick<ActivityLog, 'url'>): string | null {
  if (!log.url) return null;
  try {
    return new URL(log.url).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

export function useActivityDateRange() {
  const [start, setStart] = useState(format(startOfMonth(new Date()), 'yyyy-MM-dd'));
  const [end, setEnd] = useState(format(new Date(), 'yyyy-MM-dd'));
  return { start, end, setStart, setEnd };
}

export function ActivityDateRangeBar({ start, end, setStart, setEnd }: {
  start: string; end: string; setStart: (v: string) => void; setEnd: (v: string) => void;
}) {
  return (
    <div className="flex items-end gap-3 mb-4">
      <div><Label>From</Label><Input type="date" value={start} onChange={(e) => setStart(e.target.value)} /></div>
      <div><Label>To</Label><Input type="date" value={end} onChange={(e) => setEnd(e.target.value)} /></div>
    </div>
  );
}

/** Captures in range joined with each employee's capture interval, so raw tick counts can be
 * turned into estimated tracked hours (each tick represents roughly one interval of activity). */
export function useLogsWithIntervals(start: string, end: string) {
  return useQuery({
    queryKey: ['timetrack', 'activity-logs-range', start, end],
    queryFn: async () => {
      const [{ data: logs, error: logsErr }, { data: settings, error: settingsErr }] = await Promise.all([
        supabase.from('time_activity_logs').select('employee_id, app_name, window_title, url, productivity_category, captured_at, geo_city, geo_region, geo_country, is_outside_geofence')
          .gte('captured_at', `${start}T00:00:00`).lt('captured_at', `${end}T23:59:59`)
          .order('captured_at', { ascending: false }).limit(20000),
        supabase.from('time_agent_settings').select('employee_id, capture_interval_minutes'),
      ]);
      if (logsErr) throw logsErr;
      if (settingsErr) throw settingsErr;
      const intervalByEmployee = new Map((settings ?? []).map((s) => [s.employee_id, s.capture_interval_minutes]));
      return { logs: (logs ?? []) as ActivityLog[], intervalByEmployee };
    },
  });
}

/**
 * TimeCamp's own equivalent (top bar "download apps" icon) just links to a
 * marketing page with built installers. This checks the repo's real GitHub
 * Releases for a packaged build and, when one exists, shows direct
 * one-click download buttons per OS (no GitHub browsing, no git clone).
 */
interface GhReleaseAsset { name: string; browser_download_url: string; size: number }
interface GhRelease { tag_name: string; assets: GhReleaseAsset[] }

function pickAsset(assets: GhReleaseAsset[], test: (name: string) => boolean) {
  return assets.find((a) => test(a.name.toLowerCase()));
}

function useLatestDesktopRelease() {
  return useQuery({
    queryKey: ['desktop-agent-latest-release'],
    queryFn: async (): Promise<GhRelease | null> => {
      const res = await fetch(
        'https://api.github.com/repos/King-Iyene/kd-ops-hub/releases/latest',
        { headers: { Accept: 'application/vnd.github+json' } },
      );
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`GitHub releases: ${res.status}`);
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });
}

function DesktopAgentDialogContent() {
  const { data: release, isLoading, isError } = useLatestDesktopRelease();

  const win = release ? pickAsset(release.assets, (n) => n.endsWith('.exe')) : undefined;
  const mac = release ? pickAsset(release.assets, (n) => n.endsWith('.dmg')) : undefined;
  const linux = release ? pickAsset(release.assets, (n) => n.endsWith('.appimage') || n.endsWith('.deb')) : undefined;
  const hasAnyInstaller = Boolean(win || mac || linux);

  return (
    <DialogContent className="max-w-lg">
      <DialogHeader><DialogTitle>KD Ops Time Tracker (desktop agent)</DialogTitle></DialogHeader>
      <div className="space-y-3 text-sm">
        {isLoading && (
          <p className="text-muted-foreground flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" /> Checking for the latest build…
          </p>
        )}
        {!isLoading && hasAnyInstaller && (
          <>
            <p className="text-muted-foreground">Version {release?.tag_name} — click your operating system to download the installer.</p>
            <div className="flex flex-col gap-2">
              {win && <a href={win.browser_download_url}><Button className="w-full justify-start" size="sm"><Download className="h-4 w-4 mr-2" /> Download for Windows (.exe)</Button></a>}
              {mac && <a href={mac.browser_download_url}><Button className="w-full justify-start" size="sm"><Download className="h-4 w-4 mr-2" /> Download for macOS (.dmg)</Button></a>}
              {linux && <a href={linux.browser_download_url}><Button className="w-full justify-start" size="sm"><Download className="h-4 w-4 mr-2" /> Download for Linux</Button></a>}
            </div>
          </>
        )}
        {!isLoading && !hasAnyInstaller && (
          <p className="text-muted-foreground">
            {isError ? "Couldn't check for a download right now — try again in a moment."
              : "No installer is published yet — the agent hasn't been built as a real app yet, only this web UI exists so far. Check back soon."}
          </p>
        )}
        <p className="text-muted-foreground">
          An admin must also enable tracking for that employee first, under
          <span className="font-medium text-foreground"> Agent &amp; policy</span> —
          the agent refuses to capture anything otherwise, even if it's running.
        </p>
      </div>
    </DialogContent>
  );
}

export function GetDesktopAppButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Download className="h-4 w-4 mr-1.5" /> Get desktop app
      </Button>
      <Dialog open={open} onOpenChange={setOpen}><DesktopAgentDialogContent /></Dialog>
    </>
  );
}

/** Global header icon — same placement TimeCamp uses (a small monitor icon
 * next to notifications/profile, present on every page, not tucked away on
 * one report). */
export function DesktopAgentHeaderButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center justify-center h-8 w-8 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/60 kd-transition"
        aria-label="Get desktop app"
        title="Get desktop app"
      >
        <Monitor className="h-4 w-4" />
      </button>
      <Dialog open={open} onOpenChange={setOpen}><DesktopAgentDialogContent /></Dialog>
    </>
  );
}
