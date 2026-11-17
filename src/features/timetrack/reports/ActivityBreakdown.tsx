import { useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Button } from '@/components/ui/button';
import { Tooltip as UiTooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { format } from 'date-fns';
import { SiteIcon } from '../ui/SiteIcon';
import { CHART_COLORS, ChartEmpty, TrendLine, durationAxis, fmtDuration } from '../ui/charts';
import { captureDomain, useLogsWithIntervals } from '../pages/activity/shared';
import type { ReportFiltersState } from './useReportFilters';

type Level = 'productive' | 'neutral' | 'unproductive';
const levelOf = (c: string | null): Level =>
  c === 'productive' ? 'productive' : c === 'unproductive' || c === 'blocked' ? 'unproductive' : 'neutral';
const LEVEL_COLOR: Record<Level, string> = {
  productive: CHART_COLORS.productive, neutral: CHART_COLORS.neutral, unproductive: CHART_COLORS.unproductive,
};
const LEVEL_LABEL: Record<Level, string> = { productive: 'Work tool', neutral: 'Neutral / uncategorised', unproductive: 'Not work' };

interface Row { name: string; hours: number; pct: number; level: Level; isSite: boolean }

/** Shared: the captures in range for the selected people, with each capture's real time share. */
function useScopedLogs(filters: ReportFiltersState) {
  const { data, isLoading } = useLogsWithIntervals(filters.start, filters.end);
  const items = useMemo(() => {
    const out: { key: string; isSite: boolean; level: Level; hours: number; hour: number; ts: number; act: number; win: number; mouse: number; keys: number }[] = [];
    for (const l of data?.logs ?? []) {
      if (l.productivity_category === 'idle') continue;
      if (filters.employeeIds.length > 0 && !filters.employeeIds.includes(l.employee_id)) continue;
      const domain = captureDomain(l);
      out.push({
        key: domain ?? l.app_name ?? 'Unknown',
        isSite: !!domain,
        level: levelOf(l.productivity_category),
        hours: (data?.intervalByEmployee.get(l.employee_id) ?? 10) / 60,
        hour: new Date(l.captured_at).getHours(),
        ts: new Date(l.captured_at).getTime(),
        // captures with a very short window (a task just started) say nothing about activity
        act: (l.window_seconds ?? 0) >= 60 ? (l.active_seconds ?? 0) : 0,
        win: (l.window_seconds ?? 0) >= 60 ? (l.window_seconds ?? 0) : 0,
        mouse: l.mouse_events ?? 0,
        keys: l.input_events ?? 0,
      });
    }
    return out;
  }, [data, filters.employeeIds]);
  return { items, isLoading };
}

function RowTip({ active, payload }: { active?: boolean; payload?: { payload: Row }[] }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-md border border-border bg-popover px-3 py-2 text-xs shadow-md">
      <p className="text-sm font-semibold text-foreground">{d.name}</p>
      <p className="text-muted-foreground">{d.isSite ? 'Website' : 'Application'}</p>
      <p className="mt-1 text-foreground"><span className="font-semibold">{fmtDuration(d.hours)}</span> · {d.pct.toFixed(1)}% of tracked time</p>
      <p className="mt-0.5 flex items-center gap-1.5 text-muted-foreground">
        <span className="h-2 w-2 rounded-sm" style={{ background: LEVEL_COLOR[d.level] }} />{LEVEL_LABEL[d.level]}
      </p>
    </div>
  );
}

/**
 * Where the time went: one column per site/app, tallest first, coloured green (work tool),
 * red (not work) or grey (neutral), names slanted underneath. Hover a column for details;
 * the table below lists the same rows with time, share and category.
 */
export function TopSitesAppsColumns({ filters }: { filters: ReportFiltersState }) {
  const { items, isLoading } = useScopedLogs(filters);
  const [showAll, setShowAll] = useState(false);

  const { rows, total } = useMemo(() => {
    const by = new Map<string, { hours: number; isSite: boolean; byLevel: Record<Level, number> }>();
    for (const i of items) {
      const r = by.get(i.key) ?? { hours: 0, isSite: i.isSite, byLevel: { productive: 0, neutral: 0, unproductive: 0 } };
      r.hours += i.hours;
      r.byLevel[i.level] += i.hours;
      by.set(i.key, r);
    }
    const total = [...by.values()].reduce((s, r) => s + r.hours, 0);
    const rows: Row[] = [...by.entries()]
      .map(([name, r]) => ({
        name, hours: r.hours, isSite: r.isSite, pct: total ? (r.hours / total) * 100 : 0,
        level: (Object.entries(r.byLevel).sort((a, b) => b[1] - a[1])[0][0]) as Level,
      }))
      .sort((a, b) => b.hours - a.hours);
    return { rows, total };
  }, [items]);

  const top = rows.slice(0, 15);
  const axis = durationAxis(Math.max(0.01, ...top.map((r) => r.hours)));
  const shown = showAll ? rows : rows.slice(0, 10);

  return (
    <Card>
      <CardHeader className="space-y-1">
        <CardTitle className="text-sm">
          Where the time went{' '}
          {total > 0 && <span className="ml-1 font-normal text-muted-foreground">Total time: <span className="font-semibold text-emerald-500">{fmtDuration(total)}</span></span>}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? <ChartEmpty>Loading…</ChartEmpty> : rows.length === 0 ? <ChartEmpty>No computer activity captured in this range.</ChartEmpty> : (
          <>
            <div className="text-foreground" style={{ width: '100%', height: 340 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={top} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                  <CartesianGrid vertical={false} stroke="currentColor" strokeOpacity={0.1} strokeDasharray="3 5" />
                  <XAxis
                    dataKey="name" interval={0} height={96} axisLine={false} tickLine={false}
                    tick={{ fontSize: 11, fill: 'currentColor', fillOpacity: 0.75, angle: -50, textAnchor: 'end' } as never}
                    tickFormatter={(v: string) => (v.length > 24 ? `${v.slice(0, 23)}…` : v)}
                  />
                  <YAxis width={46} domain={axis.domain} ticks={axis.ticks} tickFormatter={axis.format} axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: 'currentColor', fillOpacity: 0.65 }} />
                  <Tooltip cursor={{ fill: 'currentColor', fillOpacity: 0.05 }} content={<RowTip />} />
                  <Bar dataKey="hours" radius={[4, 4, 0, 0]} maxBarSize={48} isAnimationActive={false}>
                    {top.map((r) => <Cell key={r.name} fill={LEVEL_COLOR[r.level]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="overflow-hidden rounded-md border border-border">
              <div className="grid grid-cols-[1fr_90px_60px_190px] gap-2 border-b border-border bg-muted/30 px-3 py-2 text-xs font-medium text-muted-foreground">
                <span>Name</span><span className="text-right">Time</span><span className="text-right">%</span><span>Category</span>
              </div>
              {shown.map((r) => (
                <div key={r.name} className="grid grid-cols-[1fr_90px_60px_190px] items-center gap-2 border-b border-border/60 px-3 py-2 text-sm last:border-0">
                  <span className="flex min-w-0 items-center gap-2 font-medium"><SiteIcon name={r.name} size={18} /><span className="truncate">{r.name}</span><span className="shrink-0 text-xs font-normal text-muted-foreground">{r.isSite ? 'site' : 'app'}</span></span>
                  <span className="text-right font-mono tabular-nums">{fmtDuration(r.hours)}</span>
                  <span className="text-right font-mono tabular-nums text-muted-foreground">{Math.round(r.pct)}%</span>
                  <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <span className="h-2 w-2 rounded-sm" style={{ background: LEVEL_COLOR[r.level] }} />{LEVEL_LABEL[r.level]}
                  </span>
                </div>
              ))}
            </div>
            {rows.length > 10 && (
              <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => setShowAll((v) => !v)}>
                {showAll ? 'Show top 10' : `Show all ${rows.length}`}
              </Button>
            )}
            <p className="text-xs text-muted-foreground">Change a site or app's category on Activity: Sites and apps; it updates every report, past days included.</p>
          </>
        )}
      </CardContent>
    </Card>
  );
}

/** Headline numbers for one person: the first thing HR reads when they open a row. */
export function PersonSummaryTiles({ filters }: { filters: ReportFiltersState }) {
  const { items, isLoading } = useScopedLogs(filters);
  const { data: rawLogs } = useLogsWithIntervals(filters.start, filters.end);
  // idle captures are left out of the productive/neutral/unproductive split, so they are counted here and shown on their own
  const idleHours = useMemo(() => {
    let h = 0;
    for (const l of rawLogs?.logs ?? []) {
      if (l.productivity_category !== 'idle') continue;
      if (filters.employeeIds.length > 0 && !filters.employeeIds.includes(l.employee_id)) continue;
      h += (rawLogs?.intervalByEmployee.get(l.employee_id) ?? 10) / 60;
    }
    return h;
  }, [rawLogs, filters.employeeIds]);
  const s = useMemo(() => {
    if (items.length === 0) return null;
    const sum = (lv: Level) => items.filter((i) => i.level === lv).reduce((a, i) => a + i.hours, 0);
    const total = items.reduce((a, i) => a + i.hours, 0);
    const byKey = new Map<string, number>();
    for (const i of items) byKey.set(i.key, (byKey.get(i.key) ?? 0) + i.hours);
    const top = [...byKey.entries()].sort((a, b) => b[1] - a[1])[0];
    const days = new Set(items.map((i) => format(new Date(i.ts), 'yyyy-MM-dd'))).size;
    const ts = items.map((i) => i.ts);
    const act = items.reduce((a, i) => a + i.act, 0);
    const win = items.reduce((a, i) => a + i.win, 0);
    return {
      activity: win > 0 ? (act / win) * 100 : null,
      mouse: items.reduce((a, i) => a + i.mouse, 0),
      keys: items.reduce((a, i) => a + i.keys, 0),
      total, productive: sum('productive'), neutral: sum('neutral'), unproductive: sum('unproductive'),
      first: Math.min(...ts), last: Math.max(...ts), top, days, sites: new Set(items.filter((i) => i.isSite).map((i) => i.key)).size,
      apps: new Set(items.filter((i) => !i.isSite).map((i) => i.key)).size,
    };
  }, [items]);
  if (isLoading || !s) return null;
  const pct = s.total ? (s.productive / s.total) * 100 : 0;
  const tiles: { label: string; value: string; sub?: string; color?: string }[] = [
    { label: 'Tracked', value: fmtDuration(s.total), sub: `${s.days} active day${s.days === 1 ? '' : 's'} · avg ${fmtDuration(s.total / s.days)}/day` },
    { label: 'Productive', value: `${Math.round(pct)}%`, sub: fmtDuration(s.productive), color: CHART_COLORS.productive },
    { label: 'Neutral', value: fmtDuration(s.neutral), sub: `${Math.round(s.total ? (s.neutral / s.total) * 100 : 0)}% of time`, color: CHART_COLORS.neutral },
    { label: 'Unproductive', value: fmtDuration(s.unproductive), sub: `${Math.round(s.total ? (s.unproductive / s.total) * 100 : 0)}% of time`, color: CHART_COLORS.unproductive },
    { label: 'Idle', value: fmtDuration(idleHours), sub: idleHours > 0 ? 'computer idle, marked as idle' : 'no idle time recorded', color: '#38bdf8' },
    { label: 'Activity level', value: s.activity == null ? 'n/a' : `${Math.round(s.activity)}%`, sub: s.activity == null ? 'needs tracker 1.0.17+' : `${s.mouse.toLocaleString()} mouse · ${s.keys.toLocaleString()} typing/click bursts` },
    { label: 'Active window', value: `${format(new Date(s.first), 'HH:mm')}–${format(new Date(s.last), 'HH:mm')}`, sub: 'first to last capture, any day' },
    { label: 'Most used', value: s.top[0], sub: `${fmtDuration(s.top[1])} · ${s.sites} sites, ${s.apps} apps` },
  ];
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-8">
      {tiles.map((t) => (
        <div key={t.label} className="rounded-lg border border-border bg-card px-3 py-2.5">
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            {t.color && <span className="h-2 w-2 rounded-sm" style={{ background: t.color }} />}{t.label}
          </p>
          <p className="mt-0.5 truncate text-lg font-semibold">{t.value}</p>
          {t.sub && <p className="truncate text-xs text-muted-foreground">{t.sub}</p>}
        </div>
      ))}
    </div>
  );
}

/** TimeCamp's "Top active apps" strip: the biggest sites/apps as icons with their share of tracked time. */
export function TopAppsStrip({ filters }: { filters: ReportFiltersState }) {
  const { items, isLoading } = useScopedLogs(filters);
  const [expanded, setExpanded] = useState(false);
  const top = useMemo(() => {
    const by = new Map<string, number>();
    let total = 0;
    for (const i of items) { by.set(i.key, (by.get(i.key) ?? 0) + i.hours); total += i.hours; }
    return [...by.entries()].sort((a, b) => b[1] - a[1]).map(([name, h]) => ({ name, h, pct: total ? (h / total) * 100 : 0 }));
  }, [items]);
  if (isLoading || top.length === 0) return null;
  // Biggest apps get big icons and the long tail shrinks. Past 24 they fold into a clickable "+N more".
  const MAX = 24;
  const shown = top.slice(0, MAX);
  const rest = top.slice(MAX);
  const size = (i: number) => (i < 4 ? 36 : i < 10 ? 28 : 22);
  const tip = (t: { name: string; h: number; pct: number }) => (
    <TooltipContent side="top" className="text-xs">
      <p className="font-semibold">{t.name}</p>
      <p className="text-muted-foreground">{fmtDuration(t.h)} · {t.pct.toFixed(1)}% of tracked time</p>
    </TooltipContent>
  );
  return (
    <TooltipProvider delayDuration={80}>
      <div className="rounded-lg border border-border bg-card px-3 py-3">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-xs text-muted-foreground">Top active apps and sites ({top.length})</p>
          {top.length > 8 && (
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setExpanded((v) => !v)}>
              {expanded ? 'Show icons' : `Show all ${top.length} as a list`}
            </Button>
          )}
        </div>
        {expanded ? (
          <div className="grid gap-x-6 gap-y-1.5 sm:grid-cols-2 lg:grid-cols-3">
            {top.map((t) => (
              <div key={t.name} className="flex items-center gap-2 text-sm">
                <SiteIcon name={t.name} size={18} />
                <span className="min-w-0 flex-1 truncate">{t.name}</span>
                <span className="font-mono text-xs tabular-nums text-muted-foreground">{fmtDuration(t.h)}</span>
                <span className="w-10 text-right font-mono text-xs tabular-nums">{t.pct >= 1 ? `${Math.round(t.pct)}%` : '<1%'}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
            {shown.map((t, i) => {
              const px = size(i);
              return (
                <UiTooltip key={t.name}>
                  <TooltipTrigger asChild>
                    <div className="flex cursor-default flex-col items-center gap-1" style={{ width: Math.max(px + 12, 50) }}>
                      <SiteIcon name={t.name} className="rounded-xl" size={px} />
                      {i < 10 && <span className="w-full truncate text-center text-[11px]">{t.name}</span>}
                      <span className="text-xs font-semibold">{t.pct >= 1 ? `${Math.round(t.pct)}%` : '<1%'}</span>
                    </div>
                  </TooltipTrigger>
                  {tip(t)}
                </UiTooltip>
              );
            })}
            {rest.length > 0 && (
              <button
                type="button" onClick={() => setExpanded(true)}
                className="flex h-9 items-center rounded-full border border-border px-3 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                +{rest.length} more · {Math.round(rest.reduce((a, r) => a + r.pct, 0))}% — click to see all
              </button>
            )}
          </div>
        )}
      </div>
    </TooltipProvider>
  );
}

/** Day-by-day: productive share and tracked time, drawn as lines (needs 2+ days to say anything). */
export function DailyTrends({ filters }: { filters: ReportFiltersState }) {
  const { items, isLoading } = useScopedLogs(filters);
  const days = useMemo(() => {
    const by = new Map<string, { total: number; productive: number }>();
    for (const i of items) {
      const d = format(new Date(i.ts), 'yyyy-MM-dd');
      const r = by.get(d) ?? { total: 0, productive: 0 };
      r.total += i.hours;
      if (i.level === 'productive') r.productive += i.hours;
      by.set(d, r);
    }
    return [...by.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([d, r]) => ({
      label: format(new Date(`${d}T12:00:00`), 'd MMM'), total: r.total, pct: r.total ? (r.productive / r.total) * 100 : 0,
    }));
  }, [items]);
  if (isLoading || days.length < 2) return null;
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader><CardTitle className="text-sm">Tracked time per day</CardTitle></CardHeader>
        <CardContent><TrendLine data={days.map((d) => ({ label: d.label, value: d.total }))} height={200} /></CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle className="text-sm">Productive share per day</CardTitle></CardHeader>
        <CardContent><TrendLine kind="percent" data={days.map((d) => ({ label: d.label, value: d.pct }))} height={200} /></CardContent>
      </Card>
    </div>
  );
}

/** Hover card for the by-hour chart: uses the page's own popover colours, so it reads in both light and dark mode. */
function HourTip({ active, payload, label }: { active?: boolean; payload?: { payload: HourRow }[]; label?: string }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  const total = d.productive + d.neutral + d.unproductive;
  const rows: [string, number, string][] = [
    ['Productive', d.productive, CHART_COLORS.productive],
    ['Neutral', d.neutral, CHART_COLORS.neutral],
    ['Unproductive', d.unproductive, CHART_COLORS.unproductive],
  ];
  return (
    <div className="rounded-md border border-border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md">
      <p className="text-sm font-semibold text-foreground">{label ?? d.label} · {fmtDuration(total)} tracked</p>
      <div className="mt-1.5 space-y-0.5">
        {rows.map(([name, v, color]) => (
          <p key={name} className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-sm" style={{ background: color }} />
            <span className="text-muted-foreground">{name}</span>
            <span className="ml-auto pl-4 font-medium text-foreground">{fmtDuration(v)}</span>
          </p>
        ))}
      </div>
    </div>
  );
}

interface HourRow { label: string; productive: number; neutral: number; unproductive: number }

const hourName = (h: number) => (h === 0 ? '12a' : h < 12 ? `${h}a` : h === 12 ? '12p' : `${h - 12}p`);

/** Productive vs unproductive time by hour of day (TimeCamp's day summary panel). */
export function HourlyProductivity({ filters }: { filters: ReportFiltersState }) {
  const { items, isLoading } = useScopedLogs(filters);
  const rows = useMemo<HourRow[]>(() => {
    if (items.length === 0) return [];
    const hrs = items.map((i) => i.hour);
    const lo = Math.max(0, Math.min(...hrs) - 1);
    const hi = Math.min(23, Math.max(...hrs) + 1);
    const out: HourRow[] = [];
    for (let h = lo; h <= hi; h++) out.push({ label: hourName(h), productive: 0, neutral: 0, unproductive: 0 });
    for (const i of items) out[i.hour - lo][i.level] += i.hours;
    return out;
  }, [items]);
  const axis = durationAxis(Math.max(0.01, ...rows.map((r) => r.productive + r.neutral + r.unproductive)));

  return (
    <Card>
      <CardHeader><CardTitle className="text-sm">Productive vs unproductive, by hour of day</CardTitle></CardHeader>
      <CardContent>
        {isLoading ? <ChartEmpty>Loading…</ChartEmpty> : rows.length === 0 ? <ChartEmpty>No computer activity captured in this range.</ChartEmpty> : (
          <div className="text-foreground" style={{ width: '100%', height: 240 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid vertical={false} stroke="currentColor" strokeOpacity={0.1} strokeDasharray="3 5" />
                <XAxis dataKey="label" interval={0} axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: 'currentColor', fillOpacity: 0.7 }} />
                <YAxis width={46} domain={axis.domain} ticks={axis.ticks} tickFormatter={axis.format} axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: 'currentColor', fillOpacity: 0.65 }} />
                <Tooltip cursor={{ fill: 'currentColor', fillOpacity: 0.05 }} content={<HourTip />} />
                <Legend verticalAlign="top" height={26} iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="productive" name="Productive" stackId="h" fill={CHART_COLORS.productive} maxBarSize={32} isAnimationActive={false} />
                <Bar dataKey="neutral" name="Neutral" stackId="h" fill={CHART_COLORS.neutral} maxBarSize={32} isAnimationActive={false} />
                <Bar dataKey="unproductive" name="Unproductive" stackId="h" fill={CHART_COLORS.unproductive} radius={[3, 3, 0, 0]} maxBarSize={32} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

interface Cell { productive: number; neutral: number; unproductive: number; apps: Map<string, number>; act: number; win: number; first: number; last: number }

/**
 * Day-by-day heatmap: one row per day, one square per hour. Hover a square for the full story of that
 * hour (split, activity level, the apps used with their logos, first and last capture); hover a date
 * for the day's summary.
 */
export function DayDetails({ filters }: { filters: ReportFiltersState }) {
  const { items, isLoading } = useScopedLogs(filters);
  const [showAllDays, setShowAllDays] = useState(false);
  const days = useMemo(() => {
    const by = new Map<string, { total: number; byLevel: Record<Level, number>; first: number; last: number; act: number; win: number; cells: Map<number, Cell>; apps: Map<string, number> }>();
    for (const i of items) {
      const d = format(new Date(i.ts), 'yyyy-MM-dd');
      const r = by.get(d) ?? { total: 0, byLevel: { productive: 0, neutral: 0, unproductive: 0 }, first: i.ts, last: i.ts, act: 0, win: 0, cells: new Map(), apps: new Map() };
      r.total += i.hours;
      r.byLevel[i.level] += i.hours;
      r.first = Math.min(r.first, i.ts);
      r.last = Math.max(r.last, i.ts);
      r.act += i.act;
      r.win += i.win;
      r.apps.set(i.key, (r.apps.get(i.key) ?? 0) + i.hours);
      const cell = r.cells.get(i.hour) ?? { productive: 0, neutral: 0, unproductive: 0, apps: new Map(), act: 0, win: 0, first: i.ts, last: i.ts };
      cell[i.level] += i.hours;
      cell.apps.set(i.key, (cell.apps.get(i.key) ?? 0) + i.hours);
      cell.act += i.act;
      cell.win += i.win;
      cell.first = Math.min(cell.first, i.ts);
      cell.last = Math.max(cell.last, i.ts);
      r.cells.set(i.hour, cell);
      by.set(d, r);
    }
    return [...by.entries()].sort(([a], [b]) => b.localeCompare(a));
  }, [items]);
  const totalDays = days.length;
  const shownDays = showAllDays ? days : days.slice(0, 31);
  if (isLoading || days.length === 0) return null;
  const allHours = items.map((i) => i.hour);
  const lo = Math.min(...allHours);
  const hi = Math.max(...allHours);
  const hours = Array.from({ length: hi - lo + 1 }, (_, k) => lo + k);
  const cellTotal = (c: Cell) => c.productive + c.neutral + c.unproductive;
  const maxCell = Math.max(0.01, ...days.flatMap(([, r]) => [...r.cells.values()].map(cellTotal)));
  const dominant = (c: Cell): Level => (['productive', 'neutral', 'unproductive'] as Level[]).sort((a, b) => c[b] - c[a])[0];
  const topApps = (m: Map<string, number>, n = 4) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);

  const Split = ({ p, n, u }: { p: number; n: number; u: number }) => {
    const t = p + n + u || 1;
    return (
      <div className="mt-1.5 space-y-1">
        <div className="flex h-2 overflow-hidden rounded-full bg-muted/40">
          <span style={{ width: `${(p / t) * 100}%`, background: CHART_COLORS.productive }} />
          <span style={{ width: `${(n / t) * 100}%`, background: CHART_COLORS.neutral }} />
          <span style={{ width: `${(u / t) * 100}%`, background: CHART_COLORS.unproductive }} />
        </div>
        <div className="flex justify-between gap-3 text-[11px] text-muted-foreground">
          <span style={{ color: CHART_COLORS.productive }}>{fmtDuration(p)} productive</span>
          <span>{fmtDuration(n)} neutral</span>
          <span style={{ color: CHART_COLORS.unproductive }}>{fmtDuration(u)} not work</span>
        </div>
      </div>
    );
  };
  const Apps = ({ m }: { m: Map<string, number> }) => (
    <div className="mt-2 space-y-1">
      {topApps(m).map(([name, h]) => (
        <div key={name} className="flex items-center gap-2">
          <SiteIcon name={name} size={16} />
          <span className="min-w-0 flex-1 truncate">{name}</span>
          <span className="font-mono text-[11px] text-muted-foreground">{fmtDuration(h)}</span>
        </div>
      ))}
      {m.size > 4 && <p className="text-[11px] text-muted-foreground">+{m.size - 4} more</p>}
    </div>
  );

  return (
    <Card>
      <CardHeader><CardTitle className="text-sm">Day by day</CardTitle></CardHeader>
      <CardContent className="space-y-1.5 overflow-x-auto">
        <TooltipProvider delayDuration={60}>
          <div className="flex min-w-[560px] items-center gap-2 text-xs text-muted-foreground">
            <span className="w-24 shrink-0">Date</span>
            <span className="w-16 shrink-0 text-right">Tracked</span>
            <span className="w-12 shrink-0 text-right">Prod.</span>
            <span className="w-24 shrink-0 text-center">Window</span>
            <span className="flex flex-1 gap-px">
              {hours.map((h) => <span key={h} className="flex-1 text-center text-[10px]">{hours.length <= 14 || h % 2 === 0 ? hourName(h) : ''}</span>)}
            </span>
          </div>
          {shownDays.map(([d, r]) => {
            const pct = r.total ? (r.byLevel.productive / r.total) * 100 : 0;
            const act = r.win > 0 ? Math.round((r.act / r.win) * 100) : null;
            return (
              <div key={d} className="flex min-w-[560px] items-center gap-2 text-sm">
                <UiTooltip>
                  <TooltipTrigger asChild>
                    <span className="w-24 shrink-0 cursor-default font-medium">{format(new Date(`${d}T12:00:00`), 'EEE d MMM')}</span>
                  </TooltipTrigger>
                  <TooltipContent side="right" className="w-72 text-xs">
                    <p className="text-sm font-semibold">{format(new Date(`${d}T12:00:00`), 'EEEE d MMMM yyyy')}</p>
                    <p className="text-muted-foreground">
                      {fmtDuration(r.total)} tracked · {Math.round(pct)}% productive{act != null ? ` · ${act}% active` : ''} · {format(new Date(r.first), 'HH:mm')} to {format(new Date(r.last), 'HH:mm')}
                    </p>
                    <Split p={r.byLevel.productive} n={r.byLevel.neutral} u={r.byLevel.unproductive} />
                    <Apps m={r.apps} />
                  </TooltipContent>
                </UiTooltip>
                <span className="w-16 shrink-0 text-right font-mono tabular-nums">{fmtDuration(r.total)}</span>
                <span className="w-12 shrink-0 text-right font-mono tabular-nums" style={{ color: pct >= 60 ? CHART_COLORS.productive : pct < 30 ? CHART_COLORS.unproductive : undefined }}>{Math.round(pct)}%</span>
                <span className="w-24 shrink-0 text-center text-xs text-muted-foreground">{format(new Date(r.first), 'HH:mm')}–{format(new Date(r.last), 'HH:mm')}</span>
                <span className="flex h-6 flex-1 gap-px">
                  {hours.map((h) => {
                    const c = r.cells.get(h);
                    if (!c) return <span key={h} className="flex-1 rounded-[2px] bg-muted/30" />;
                    const v = cellTotal(c);
                    const cellAct = c.win > 0 ? Math.round((c.act / c.win) * 100) : null;
                    return (
                      <UiTooltip key={h}>
                        <TooltipTrigger asChild>
                          <span
                            className="flex-1 cursor-default rounded-[2px] transition-transform hover:scale-y-125 hover:ring-1 hover:ring-foreground/40"
                            style={{ background: LEVEL_COLOR[dominant(c)], opacity: 0.25 + 0.75 * Math.min(1, v / maxCell) }}
                          />
                        </TooltipTrigger>
                        <TooltipContent side="top" className="w-72 text-xs">
                          <p className="text-sm font-semibold">{format(new Date(`${d}T12:00:00`), 'EEE d MMM')}, {hourName(h)} to {hourName((h + 1) % 24)}</p>
                          <p className="text-muted-foreground">
                            {fmtDuration(v)} tracked · {Math.round((c.productive / v) * 100)}% productive{cellAct != null ? ` · ${cellAct}% active` : ''}
                          </p>
                          <p className="text-muted-foreground">Captures from {format(new Date(c.first), 'HH:mm')} to {format(new Date(c.last), 'HH:mm')}</p>
                          <Split p={c.productive} n={c.neutral} u={c.unproductive} />
                          <Apps m={c.apps} />
                        </TooltipContent>
                      </UiTooltip>
                    );
                  })}
                </span>
              </div>
            );
          })}
        </TooltipProvider>
        {totalDays > 31 && (
          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setShowAllDays((v) => !v)}>
            {showAllDays ? 'Show the latest 31 days' : `Show all ${totalDays} days`}
          </Button>
        )}
        <p className="pt-1 text-xs text-muted-foreground">Days with captured activity in the chosen range, newest first ({totalDays} found). Each square is an hour: green mostly productive, red mostly not work, grey neutral. Darker means more time. Hover a square for that hour's apps, split and activity, or a date for the whole day.</p>
      </CardContent>
    </Card>
  );
}

/** Plain-language read-out for one person, compared with the team: what stands out, and what to do about it. */
export function PersonInsights({ filters, team }: { filters: ReportFiltersState; team: { pct: number; hoursPerDay: number } }) {
  const { items, isLoading } = useScopedLogs(filters);
  const notes = useMemo(() => {
    if (items.length === 0) return [];
    const total = items.reduce((a, i) => a + i.hours, 0);
    const prod = items.filter((i) => i.level === 'productive').reduce((a, i) => a + i.hours, 0);
    const pct = total ? (prod / total) * 100 : 0;
    const out: { tone: 'good' | 'warn' | 'bad' | 'info'; text: string; link?: { to: string; label: string } }[] = [];

    const diff = pct - team.pct;
    if (Math.abs(diff) >= 5) out.push({ tone: diff > 0 ? 'good' : 'warn', text: `${Math.round(Math.abs(diff))} points ${diff > 0 ? 'above' : 'below'} the team's productive share (${Math.round(pct)}% vs ${Math.round(team.pct)}%).` });
    else out.push({ tone: 'info', text: `In line with the team's productive share (${Math.round(pct)}% vs ${Math.round(team.pct)}%).` });

    const byDay = new Map<string, { t: number; p: number }>();
    for (const i of items) {
      const d = format(new Date(i.ts), 'yyyy-MM-dd');
      const r = byDay.get(d) ?? { t: 0, p: 0 };
      r.t += i.hours;
      if (i.level === 'productive') r.p += i.hours;
      byDay.set(d, r);
    }
    const days = [...byDay.entries()].filter(([, r]) => r.t >= 0.5).map(([d, r]) => ({ d, pct: (r.p / r.t) * 100, t: r.t }));
    if (days.length >= 2) {
      const best = [...days].sort((a, b) => b.pct - a.pct)[0];
      const worst = [...days].sort((a, b) => a.pct - b.pct)[0];
      out.push({ tone: 'info', text: `Best day ${format(new Date(`${best.d}T12:00:00`), 'EEE d MMM')} (${Math.round(best.pct)}% productive); weakest ${format(new Date(`${worst.d}T12:00:00`), 'EEE d MMM')} (${Math.round(worst.pct)}%).` });
    }

    const byHour = new Map<number, number>();
    for (const i of items) byHour.set(i.hour, (byHour.get(i.hour) ?? 0) + i.hours);
    const peak = [...byHour.entries()].sort((a, b) => b[1] - a[1])[0];
    if (peak) out.push({ tone: 'info', text: `Busiest hour is ${hourName(peak[0])}, with ${fmtDuration(peak[1])} tracked in it across the range.` });

    const perDay = total / Math.max(1, byDay.size);
    if (team.hoursPerDay > 0 && Math.abs(perDay - team.hoursPerDay) / team.hoursPerDay >= 0.25) {
      out.push({ tone: perDay > team.hoursPerDay ? 'good' : 'warn', text: `Tracks ${fmtDuration(perDay)} per active day, ${perDay > team.hoursPerDay ? 'more' : 'less'} than the team average of ${fmtDuration(team.hoursPerDay)}.` });
    }

    const off = new Map<string, number>();
    for (const i of items) if (i.level === 'unproductive') off.set(i.key, (off.get(i.key) ?? 0) + i.hours);
    const worstOff = [...off.entries()].sort((a, b) => b[1] - a[1])[0];
    if (worstOff) out.push({ tone: 'bad', text: `Most time off-task: ${worstOff[0]} (${fmtDuration(worstOff[1])}); ${fmtDuration([...off.values()].reduce((a, v) => a + v, 0))} in total on not-work sites and apps.` });

    const act = items.reduce((a, i) => a + i.act, 0);
    const win = items.reduce((a, i) => a + i.win, 0);
    if (win > 0) {
      const a = (act / win) * 100;
      if (a < 30) out.push({ tone: 'warn', text: `Low keyboard and mouse activity (${Math.round(a)}%): the computer was on but little was typed or clicked.` });
      else if (a >= 60) out.push({ tone: 'good', text: `High keyboard and mouse activity (${Math.round(a)}%).` });
    }

    const unknown = new Map<string, number>();
    for (const i of items) if (i.level === 'neutral') unknown.set(i.key, (unknown.get(i.key) ?? 0) + i.hours);
    const big = [...unknown.entries()].filter(([, h]) => h >= 5 / 60).sort((a, b) => b[1] - a[1]);
    if (big.length > 0) {
      out.push({
        tone: 'info',
        text: `${big.length} site${big.length === 1 ? '' : 's'} or app${big.length === 1 ? '' : 's'} with 5+ minutes aren't marked as work or not-work (top: ${big.slice(0, 3).map(([k]) => k).join(', ')}). Marking them makes this report more accurate.`,
        link: { to: '/timetrack/activity/sites-apps', label: 'Categorise them' },
      });
    }
    return out;
  }, [items, team.pct, team.hoursPerDay]);

  if (isLoading || notes.length === 0) return null;
  const dot = { good: CHART_COLORS.productive, warn: '#f59e0b', bad: CHART_COLORS.unproductive, info: '#38bdf8' };
  return (
    <Card>
      <CardHeader><CardTitle className="text-sm">What stands out</CardTitle></CardHeader>
      <CardContent className="space-y-2">
        {notes.map((n, i) => (
          <div key={i} className="flex items-start gap-2.5 text-sm">
            <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full" style={{ background: dot[n.tone] }} />
            <p className="min-w-0 flex-1">
              {n.text}{' '}
              {n.link && <a href={n.link.to} className="font-medium text-primary underline-offset-2 hover:underline">{n.link.label}</a>}
            </p>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
