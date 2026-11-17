import { useState } from 'react';
import { DateRangeSelect } from '@/features/timetrack/ui/DateRangeSelect';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { format, startOfMonth } from 'date-fns';
import { Loader2, Download } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
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
  /** Activity level inputs (counts only): seconds with input, the window they cover, pointer bursts, typing/click bursts. */
  active_seconds?: number | null;
  window_seconds?: number | null;
  mouse_events?: number | null;
  input_events?: number | null;
  /** true when one of the admin's rules decided this capture's category (applied now, so rules also cover past captures). */
  ruled?: boolean;
}

export interface ProductivityRule {
  app_name_contains: string | null;
  title_contains: string | null;
  category: string;
  priority: number;
}

/**
 * Category from the admin's rules. Same logic as the desktop app (desktop-agent/src/productivityRules.ts).
 * Precedence: a rule naming the site > a window-title rule > an app rule, so "instagram.com = red"
 * beats "Google Chrome = productive". Lower priority number first within a level.
 */
export function matchProductivityRule(
  rules: ProductivityRule[],
  log: Pick<ActivityLog, 'app_name' | 'window_title' | 'url'>,
): string | null {
  const app = (log.app_name ?? '').toLowerCase();
  const title = (log.window_title ?? '').toLowerCase();
  const host = (captureDomain(log) ?? '').toLowerCase();
  const has = (needle: string | null, hay: string) => !!needle && !!hay && hay.includes(needle.toLowerCase());
  const sorted = [...rules].sort((a, b) => a.priority - b.priority);
  if (host) {
    const site = sorted.find((r) => !r.title_contains && has(r.app_name_contains, host));
    if (site) return site.category;
  }
  const byTitle = sorted.find((r) => has(r.title_contains, title) && (!r.app_name_contains || has(r.app_name_contains, app)));
  if (byTitle) return byTitle.category;
  const byApp = sorted.find((r) => !r.title_contains && has(r.app_name_contains, app));
  return byApp ? byApp.category : null;
}

export const CATEGORY_BADGE: Record<string, string> = {
  productive: 'bg-emerald-500/15 text-emerald-600 border-emerald-500/30',
  neutral: 'bg-muted text-muted-foreground',
  unproductive: 'bg-destructive/15 text-destructive border-destructive/30',
  idle: 'bg-sky-500/15 text-sky-600 border-sky-500/30',
  blocked: 'bg-red-600/20 text-red-600 border-red-600/40 font-semibold',
};

/** Best-effort domain for a capture: real URL when the agent could get one
 * (macOS and, since desktop v1.0.11, Windows), else null so
 * callers can fall back to app/window-title grouping. */
const BROWSER_APP = /chrome|msedge|edge|brave|opera|vivaldi|firefox|arc|safari/i;

/**
 * What to call a capture in site/app lists. A site when the address was read; otherwise, for a browser (or a
 * web app window with no address bar, like WhatsApp Web), the page's own title, so it shows as "WhatsApp Web"
 * and not just "Brave Browser". Anything else is the application name.
 */
export function siteOrAppKey(log: Pick<ActivityLog, 'url' | 'app_name' | 'window_title'>): { key: string; isSite: boolean } {
  const d = captureDomain(log);
  if (d) return { key: d, isSite: true };
  const app = log.app_name ?? 'Unknown';
  if (BROWSER_APP.test(app) && log.window_title) {
    const t = log.window_title
      .replace(/\s[-–—]\s(Google Chrome|Brave( Browser)?( Beta)?|Microsoft\u200b? ?Edge|Mozilla Firefox|Opera|Vivaldi|Arc)(\s[-–—].*)?$/i, '')
      .trim();
    if (t && t.length <= 60) return { key: t, isSite: true };
  }
  return { key: app, isSite: false };
}

export function captureDomain(log: Pick<ActivityLog, 'url'>): string | null {
  if (!log.url) return null;
  try {
    return new URL(log.url).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

/**
 * TimeCamp makes every employee name across its activity/computer-tracking
 * reports a link that drills into that person's own activity — so an admin
 * scanning a table never has to re-filter by hand. Same idea here: every
 * employee name in this module is this component, linking to Activities
 * Summary pre-filtered to just that person (summary.tsx reads `?employee=`).
 */
export function EmployeeLink({ employeeId, name }: { employeeId: string; name: string }) {
  return (
    <Link
      to={`/timetrack/activity/summary?employee=${encodeURIComponent(employeeId)}`}
      className="font-medium text-foreground hover:text-primary hover:underline underline-offset-2 kd-transition"
      title={`View ${name}'s activity`}
    >
      {name}
    </Link>
  );
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
    <div className="mb-4">
      <Label className="text-xs text-muted-foreground">Date range</Label>
      <DateRangeSelect className="mt-1" start={start} end={end} setStart={setStart} setEnd={setEnd} />
    </div>
  );
}

/** Minutes each capture really represents, per employee. The configured interval is only what
 * the admin asked for; if the desktop app actually captured more often (an older build captured
 * about once a minute regardless of a 10-minute setting), counting every capture as the
 * configured interval inflates hours several times over. So use the median gap between that
 * person's consecutive captures when it is smaller than the configured interval. */
function effectiveIntervals(logs: ActivityLog[], configured: Map<string, number>): Map<string, number> {
  const byEmployee = new Map<string, number[]>();
  for (const l of logs) {
    const arr = byEmployee.get(l.employee_id) ?? [];
    arr.push(new Date(l.captured_at).getTime());
    byEmployee.set(l.employee_id, arr);
  }
  const out = new Map<string, number>(configured);
  for (const [employeeId, times] of byEmployee) {
    const cfg = configured.get(employeeId) ?? 10;
    times.sort((a, b) => a - b);
    const gaps: number[] = [];
    for (let i = 1; i < times.length; i++) {
      const gapMin = (times[i] - times[i - 1]) / 60000;
      if (gapMin > 0 && gapMin <= cfg * 3) gaps.push(gapMin);
    }
    if (gaps.length >= 3) {
      gaps.sort((a, b) => a - b);
      const median = gaps[Math.floor(gaps.length / 2)];
      out.set(employeeId, Math.max(0.5, Math.min(cfg, median)));
    } else {
      out.set(employeeId, cfg);
    }
  }
  return out;
}

/** Captures in range joined with each employee's capture interval, so raw tick counts can be
 * turned into estimated tracked hours (each tick represents roughly one interval of activity). */
export function useLogsWithIntervals(start: string, end: string) {
  return useQuery({
    queryKey: ['timetrack', 'activity-logs-range', start, end],
    queryFn: async () => {
      // The server returns at most 1000 rows per request, so a big range (many people, weeks of data) used to be
      // silently cut short. Read it page by page until everything is in (up to 300k captures).
      const PAGE = 1000;
      const logs: Record<string, unknown>[] = [];
      let logsErr: { message: string } | null = null;
      for (let from = 0; from < 300_000; from += PAGE) {
        const { data: page, error } = await supabase.from('time_activity_logs')
          .select('employee_id, app_name, window_title, url, productivity_category, captured_at, geo_city, geo_region, geo_country, is_outside_geofence, active_seconds, window_seconds, mouse_events, input_events')
          .gte('captured_at', `${start}T00:00:00`).lt('captured_at', `${end}T23:59:59`)
          .order('captured_at', { ascending: false }).order('id', { ascending: false })
          .range(from, from + PAGE - 1);
        if (error) { logsErr = error; break; }
        logs.push(...(page ?? []));
        if (!page || page.length < PAGE) break;
      }
      const [{ data: settings, error: settingsErr }, { data: ruleRows }] = await Promise.all([
        supabase.from('time_agent_settings').select('employee_id, capture_interval_minutes'),
        supabase.from('time_productivity_rules').select('app_name_contains, title_contains, category, priority'),
      ]);
      if (logsErr) throw logsErr;
      if (settingsErr) throw settingsErr;
      const configured = new Map((settings ?? []).map((s) => [s.employee_id, s.capture_interval_minutes as number]));
      // Apply the CURRENT rules to every capture, past ones included. Before, a rule only labelled
      // captures taken after it was created, so marking Chrome / Claude / Slack as work tools left all
      // the existing time at 0% productive.
      const rules = (ruleRows ?? []) as ProductivityRule[];
      const typedLogs = ((logs ?? []) as ActivityLog[]).map((l) => {
        if (l.productivity_category === 'idle') return l;
        const category = matchProductivityRule(rules, l);
        return category ? { ...l, productivity_category: category, ruled: true } : l;
      });
      return { logs: typedLogs, intervalByEmployee: effectiveIntervals(typedLogs, configured) };
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
        <Download className="h-4 w-4" />
      </button>
      <Dialog open={open} onOpenChange={setOpen}><DesktopAgentDialogContent /></Dialog>
    </>
  );
}
