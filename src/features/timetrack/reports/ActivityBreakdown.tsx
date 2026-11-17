import { useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { format } from 'date-fns';
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
    const out: { key: string; isSite: boolean; level: Level; hours: number; hour: number; ts: number }[] = [];
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
                  <span className="truncate font-medium">{r.name}<span className="ml-2 text-xs font-normal text-muted-foreground">{r.isSite ? 'site' : 'app'}</span></span>
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
    return {
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
    { label: 'Active window', value: `${format(new Date(s.first), 'HH:mm')}–${format(new Date(s.last), 'HH:mm')}`, sub: 'first to last capture, any day' },
    { label: 'Most used', value: s.top[0], sub: `${fmtDuration(s.top[1])} · ${s.sites} sites, ${s.apps} apps` },
  ];
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
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

/** Day-by-day table plus an hour-by-day heatmap: when each person actually worked, and how productive it was. */
export function DayDetails({ filters }: { filters: ReportFiltersState }) {
  const { items, isLoading } = useScopedLogs(filters);
  const days = useMemo(() => {
    const by = new Map<string, { total: number; byLevel: Record<Level, number>; first: number; last: number; cells: Map<number, Record<Level, number>> }>();
    for (const i of items) {
      const d = format(new Date(i.ts), 'yyyy-MM-dd');
      const r = by.get(d) ?? { total: 0, byLevel: { productive: 0, neutral: 0, unproductive: 0 }, first: i.ts, last: i.ts, cells: new Map() };
      r.total += i.hours;
      r.byLevel[i.level] += i.hours;
      r.first = Math.min(r.first, i.ts);
      r.last = Math.max(r.last, i.ts);
      const cell = r.cells.get(i.hour) ?? { productive: 0, neutral: 0, unproductive: 0 };
      cell[i.level] += i.hours;
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
  const maxCell = Math.max(0.01, ...days.flatMap(([, r]) => [...r.cells.values()].map((c) => c.productive + c.neutral + c.unproductive)));
  const dominant = (c: Record<Level, number>): Level => (Object.entries(c).sort((a, b) => b[1] - a[1])[0][0]) as Level;

  return (
    <Card>
      <CardHeader><CardTitle className="text-sm">Day by day</CardTitle></CardHeader>
      <CardContent className="space-y-1.5 overflow-x-auto">
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
          return (
            <div key={d} className="flex min-w-[560px] items-center gap-2 text-sm">
              <span className="w-24 shrink-0 font-medium">{format(new Date(`${d}T12:00:00`), 'EEE d MMM')}</span>
              <span className="w-16 shrink-0 text-right font-mono tabular-nums">{fmtDuration(r.total)}</span>
              <span className="w-12 shrink-0 text-right font-mono tabular-nums" style={{ color: pct >= 60 ? CHART_COLORS.productive : pct < 30 ? CHART_COLORS.unproductive : undefined }}>{Math.round(pct)}%</span>
              <span className="w-24 shrink-0 text-center text-xs text-muted-foreground">{format(new Date(r.first), 'HH:mm')}–{format(new Date(r.last), 'HH:mm')}</span>
              <span className="flex h-5 flex-1 gap-px">
                {hours.map((h) => {
                  const c = r.cells.get(h);
                  const v = c ? c.productive + c.neutral + c.unproductive : 0;
                  return (
                    <span
                      key={h} className="flex-1 rounded-[2px] bg-muted/30"
                      title={c ? `${hourName(h)} · ${fmtDuration(v)} · ${Math.round((c.productive / v) * 100)}% productive` : undefined}
                      style={c ? { background: LEVEL_COLOR[dominant(c)], opacity: 0.25 + 0.75 * Math.min(1, v / maxCell) } : undefined}
                    />
                  );
                })}
              </span>
            </div>
          );
        })}
        <p className="pt-1 text-xs text-muted-foreground">Each square is an hour: green mostly productive, red mostly not work, grey neutral. Darker means more time. Hover for details.</p>
      </CardContent>
    </Card>
  );
}
