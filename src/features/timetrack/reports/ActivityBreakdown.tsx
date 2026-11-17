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
                  <span className="flex min-w-0 items-center gap-2 font-medium"><SiteIcon name={r.name} /><span className="truncate">{r.name}</span><span className="shrink-0 text-xs font-normal text-muted-foreground">{r.isSite ? 'site' : 'app'}</span></span>
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
    { label: 'Activity level', value: s.activity == null ? 'n/a' : `${Math.round(s.activity)}%`, sub: s.activity == null ? 'needs tracker 1.0.17+' : `${s.mouse.toLocaleString()} mouse · ${s.keys.toLocaleString()} typing/click bursts` },
    { label: 'Active window', value: `${format(new Date(s.first), 'HH:mm')}–${format(new Date(s.last), 'HH:mm')}`, sub: 'first to last capture, any day' },
    { label: 'Most used', value: s.top[0], sub: `${fmtDuration(s.top[1])} · ${s.sites} sites, ${s.apps} apps` },
  ];
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7">
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
  const size = (i: number) => (i < 4 ? 44 : i < 10 ? 34 : 26);
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
                <SiteIcon name={t.name} size={22} />
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
                    <div className="flex cursor-default flex-col items-center gap-1" style={{ width: Math.max(px + 14, 56) }}>
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
                <Tooltip
                  cursor={{ fill: 'currentColor', fillOpacity: 0.05 }}
                  formatter={(v: number, n: string) => [fmtDuration(v), n]}
                  contentStyle={{ borderRadius: 8, fontSize: 12 }}
                />
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
    return [...by.entries()].sort(([a], [b]) => b.localeCompare(a)).slice(0, 31);
  }, [items]);
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
          {days.map(([d, r]) => {
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
        <p className="pt-1 text-xs text-muted-foreground">Each square is an hour: green mostly productive, red mostly not work, grey neutral. Darker means more time. Hover a square for that hour's apps, split and activity, or a date for the whole day.</p>
      </CardContent>
    </Card>
  );
}
