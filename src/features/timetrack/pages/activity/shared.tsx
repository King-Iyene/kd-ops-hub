import { useMemo, useState } from 'react';
import { captureDomain } from '../../lib/siteNames';
import { useFieldTeamIds } from '../../lib/trackerEmployees';
import { DateRangeSelect } from '@/features/timetrack/ui/DateRangeSelect';
import { STICKY_FILTERS } from '@/features/timetrack/ui/stickyFilters';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { format, startOfMonth } from 'date-fns';
import { Loader2, Download } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { TRACKER_OSES, fetchTrackerVersion, startTrackerDownload, trackerOsFor, type TrackerOs } from '../../lib/trackerDownload';

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
export { captureDomain, siteOrAppKey } from '../../lib/siteNames';

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
    <div className={`mb-4 ${STICKY_FILTERS}`}>
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
  const fieldIds = useFieldTeamIds();
  const q = useQuery({
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
  // The KD Squares field team is never part of Track: their captures are left out of every page that reads this.
  const data = useMemo(() => {
    if (!q.data || fieldIds.size === 0) return q.data;
    return { ...q.data, logs: q.data.logs.filter((l) => !fieldIds.has(l.employee_id)) };
  }, [q.data, fieldIds]);
  return { ...q, data };
}

/**
 * TimeCamp's own equivalent (top bar "download apps" icon) just links to a marketing page with built installers. Ours gives one-click
 * download buttons per system. The installers are served from our own project's storage, never from GitHub (the repository is private,
 * so GitHub would show a login or error page): a click starts the download right here, and if the file is not there yet it says so.
 */
function DesktopAgentDialogContent() {
  const version = useQuery({ queryKey: ['tracker-version'], queryFn: fetchTrackerVersion, staleTime: 5 * 60 * 1000, retry: 1 });
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState<TrackerOs | null>(null);
  const mine = trackerOsFor();

  const get = async (os: TrackerOs) => {
    setBusy(os);
    setNote(null);
    const r = await startTrackerDownload(os, version.data ?? null);
    setBusy(null);
    setNote(r === 'started' ? 'Your download has started. When it finishes, open the installer.' : 'This installer is not ready yet. Please try again in a few minutes, or ask an admin.');
  };

  return (
    <DialogContent className="max-w-lg">
      <DialogHeader><DialogTitle>KD Ops Time Tracker (desktop agent)</DialogTitle></DialogHeader>
      <div className="space-y-3 text-sm">
        <p className="text-muted-foreground">{version.data ? `Version ${version.data}. ` : ''}Click your operating system to download the installer.</p>
        <div className="flex flex-col gap-2">
          {TRACKER_OSES.map(({ os, label }) => (
            <Button key={os} variant={os === mine ? 'default' : 'outline'} className="w-full justify-start" size="sm" disabled={busy !== null} onClick={() => void get(os)}>
              {busy === os ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />} Download for {label}
            </Button>
          ))}
        </div>
        {note && <p role="status" className="rounded-md bg-muted px-3 py-2 text-foreground">{note}</p>}
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
