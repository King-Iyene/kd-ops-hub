import { Fragment, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { addDays, endOfMonth, format, startOfMonth, startOfWeek, subMonths } from 'date-fns';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CHART_COLORS, ChartEmpty, durationAxis, fmtDuration } from '../ui/charts';
import { useLogsWithIntervals } from '../pages/activity/shared';
import { DailyTrends, DayDetails, HourlyProductivity, PersonSummaryTiles, TopSitesAppsColumns } from './ActivityBreakdown';
import type { ReportFiltersState } from './useReportFilters';

const fmt = (d: Date) => format(d, 'yyyy-MM-dd');

/** TimeCamp-style quick ranges. Weeks start on Monday. */
export function datePresets(now = new Date()) {
  const weekStart = startOfWeek(now, { weekStartsOn: 1 });
  const lastMonth = subMonths(now, 1);
  return [
    { key: 'today', label: 'Today', start: fmt(now), end: fmt(now) },
    { key: 'yesterday', label: 'Yesterday', start: fmt(addDays(now, -1)), end: fmt(addDays(now, -1)) },
    { key: 'week', label: 'This week', start: fmt(weekStart), end: fmt(now) },
    { key: 'lastweek', label: 'Last week', start: fmt(addDays(weekStart, -7)), end: fmt(addDays(weekStart, -1)) },
    { key: 'month', label: 'This month', start: fmt(startOfMonth(now)), end: fmt(now) },
    { key: 'lastmonth', label: 'Last month', start: fmt(startOfMonth(lastMonth)), end: fmt(endOfMonth(lastMonth)) },
  ];
}

export function DatePresetBar({ filters }: { filters: ReportFiltersState }) {
  const presets = datePresets();
  return (
    <div className="flex flex-wrap gap-1.5">
      {presets.map((p) => {
        const active = filters.start === p.start && filters.end === p.end;
        return (
          <Button
            key={p.key} size="sm" variant={active ? 'default' : 'outline'} className="h-8 text-xs"
            onClick={() => { filters.setStart(p.start); filters.setEnd(p.end); }}
          >
            {p.label}
          </Button>
        );
      })}
    </div>
  );
}

interface PersonRow {
  id: string;
  name: string;
  productive: number;
  neutral: number;
  unproductive: number;
  total: number;
  pct: number;
}

type Mode = 'hours' | 'percent';

const SEGMENTS = [
  { key: 'productive', label: 'Productive', color: CHART_COLORS.productive },
  { key: 'neutral', label: 'Neutral / uncategorised', color: CHART_COLORS.neutral },
  { key: 'unproductive', label: 'Unproductive', color: CHART_COLORS.unproductive },
] as const;

interface TipRow { payload: PersonRow & { pProductive: number; pNeutral: number; pUnproductive: number } }

function PersonTip({ active, payload }: { active?: boolean; payload?: TipRow[] }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-md border border-border bg-popover px-3 py-2 text-xs shadow-md">
      <p className="text-sm font-semibold text-foreground">{d.name}</p>
      <p className="text-muted-foreground">Tracked {fmtDuration(d.total)} · <span className="font-medium text-foreground">{Math.round(d.pct)}% productive</span></p>
      <div className="mt-1.5 space-y-0.5">
        {SEGMENTS.map((s) => (
          <p key={s.key} className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-sm" style={{ background: s.color }} />
            <span className="text-muted-foreground">{s.label}</span>
            <span className="ml-auto pl-4 font-medium text-foreground">{fmtDuration(d[s.key])}</span>
          </p>
        ))}
      </div>
    </div>
  );
}

/**
 * At-a-glance team productivity: one vertical stacked column per employee, split into
 * productive (green), neutral (grey) and unproductive (red) time, names slanted under
 * each column. Toggle between hours and a 100% view to compare people directly.
 * Idle/away time is not counted. Respects the report's date range and People filter.
 */
export function TeamProductivity({ filters }: { filters: ReportFiltersState }) {
  const [mode, setMode] = useState<Mode>('hours');
  const [open, setOpen] = useState<string | null>(null);
  const { data: logData, isLoading } = useLogsWithIntervals(filters.start, filters.end);

  const { data: names } = useQuery({
    queryKey: ['timetrack', 'directory-names'],
    queryFn: async () => {
      const { data } = await supabase.from('profiles_directory').select('id, full_name');
      return new Map((data ?? []).map((e) => [e.id as string, (e.full_name as string | null) ?? 'Unknown']));
    },
    staleTime: 5 * 60_000,
  });

  const rows = useMemo<PersonRow[]>(() => {
    const byPerson = new Map<string, PersonRow>();
    for (const l of logData?.logs ?? []) {
      if (l.productivity_category === 'idle') continue;
      if (filters.employeeIds.length > 0 && !filters.employeeIds.includes(l.employee_id)) continue;
      const hours = (logData?.intervalByEmployee.get(l.employee_id) ?? 10) / 60;
      const row = byPerson.get(l.employee_id) ?? {
        id: l.employee_id, name: names?.get(l.employee_id) ?? 'Unknown', productive: 0, neutral: 0, unproductive: 0, total: 0, pct: 0,
      };
      const c = l.productivity_category;
      if (c === 'productive') row.productive += hours;
      else if (c === 'unproductive' || c === 'blocked') row.unproductive += hours;
      else row.neutral += hours;
      byPerson.set(l.employee_id, row);
    }
    return [...byPerson.values()]
      .map((r) => {
        const total = r.productive + r.neutral + r.unproductive;
        return { ...r, total, pct: total > 0 ? (r.productive / total) * 100 : 0 };
      })
      .sort((a, b) => b.pct - a.pct || b.total - a.total);
  }, [logData, names, filters.employeeIds]);

  const chartData = rows.map((r) => ({
    ...r,
    pProductive: r.total ? (r.productive / r.total) * 100 : 0,
    pNeutral: r.total ? (r.neutral / r.total) * 100 : 0,
    pUnproductive: r.total ? (r.unproductive / r.total) * 100 : 0,
  }));
  const axis = mode === 'hours' ? durationAxis(Math.max(0.01, ...rows.map((r) => r.total))) : null;
  const keyFor = (k: (typeof SEGMENTS)[number]['key']) =>
    mode === 'hours' ? k : (`p${k[0].toUpperCase()}${k.slice(1)}` as 'pProductive' | 'pNeutral' | 'pUnproductive');

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0">
        <CardTitle className="text-sm">Team productivity at a glance (click a person for details)</CardTitle>
        <div className="flex gap-1">
          <Button size="sm" variant={mode === 'hours' ? 'default' : 'outline'} className="h-7 text-xs" onClick={() => setMode('hours')}>Hours</Button>
          <Button size="sm" variant={mode === 'percent' ? 'default' : 'outline'} className="h-7 text-xs" onClick={() => setMode('percent')}>% split</Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <ChartEmpty>Loading…</ChartEmpty>
        ) : rows.length === 0 ? (
          <ChartEmpty>No computer activity captured in this range.</ChartEmpty>
        ) : (
          <>
            <div className="text-foreground" style={{ width: '100%', height: 340 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                  <CartesianGrid vertical={false} stroke="currentColor" strokeOpacity={0.1} strokeDasharray="3 5" />
                  <XAxis
                    dataKey="name" interval={0} height={84} axisLine={false} tickLine={false}
                    tick={{ fontSize: 11, fill: 'currentColor', fillOpacity: 0.75, angle: -35, textAnchor: 'end' } as never}
                    tickFormatter={(v: string) => (v.length > 22 ? `${v.slice(0, 21)}…` : v)}
                  />
                  <YAxis
                    width={44} axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: 'currentColor', fillOpacity: 0.65 }}
                    {...(axis
                      ? { domain: axis.domain, ticks: axis.ticks, tickFormatter: axis.format }
                      : { domain: [0, 100] as [number, number], ticks: [0, 25, 50, 75, 100], tickFormatter: (v: number) => `${v}%` })}
                  />
                  <Tooltip cursor={{ fill: 'currentColor', fillOpacity: 0.05 }} content={<PersonTip />} />
                  <Legend verticalAlign="top" height={28} iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                  {SEGMENTS.map((s, i) => (
                    <Bar
                      key={s.key} dataKey={keyFor(s.key)} name={s.label} stackId="t" fill={s.color} maxBarSize={56}
                      radius={i === SEGMENTS.length - 1 ? [4, 4, 0, 0] : 0} isAnimationActive={false}
                    />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="divide-y divide-border/60 rounded-md border border-border">
              {rows.map((r) => {
                const isOpen = open === r.id;
                const maxTotal = Math.max(...rows.map((x) => x.total), 0.01);
                const tone = r.pct >= 60 ? CHART_COLORS.productive : r.pct >= 30 ? CHART_COLORS.neutral : CHART_COLORS.unproductive;
                const seg = (v: number) => (r.total ? `${(v / r.total) * 100}%` : '0%');
                return (
                  <Fragment key={r.id}>
                    <button
                      type="button" onClick={() => setOpen(isOpen ? null : r.id)} aria-expanded={isOpen}
                      className="flex w-full items-center gap-3 px-3 py-3 text-left text-sm transition-colors hover:bg-muted/40"
                    >
                      {isOpen ? <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />}
                      <span className="w-40 shrink-0 truncate font-medium sm:w-52">{r.name}</span>
                      <span className="hidden min-w-0 flex-1 sm:block">
                        <span className="flex h-3.5 overflow-hidden rounded-full bg-muted/40" style={{ width: `${Math.max(6, (r.total / maxTotal) * 100)}%` }}>
                          <span style={{ width: seg(r.productive), background: CHART_COLORS.productive }} />
                          <span style={{ width: seg(r.neutral), background: CHART_COLORS.neutral }} />
                          <span style={{ width: seg(r.unproductive), background: CHART_COLORS.unproductive }} />
                        </span>
                      </span>
                      <span className="ml-auto w-20 shrink-0 text-right font-mono tabular-nums text-muted-foreground">{fmtDuration(r.total)}</span>
                      <span
                        className="w-16 shrink-0 rounded-full px-2 py-0.5 text-center text-xs font-semibold"
                        style={{ background: `${tone}26`, color: r.pct >= 30 && r.pct < 60 ? 'currentColor' : tone }}
                      >
                        {Math.round(r.pct)}%
                      </span>
                    </button>
                    {isOpen && (
                      <div className="space-y-4 bg-muted/10 p-3 sm:p-4">
                        <PersonSummaryTiles filters={{ ...filters, employeeIds: [r.id] }} />
                        <DailyTrends filters={{ ...filters, employeeIds: [r.id] }} />
                        <DayDetails filters={{ ...filters, employeeIds: [r.id] }} />
                        <TopSitesAppsColumns filters={{ ...filters, employeeIds: [r.id] }} />
                        <HourlyProductivity filters={{ ...filters, employeeIds: [r.id] }} />
                      </div>
                    )}
                  </Fragment>
                );
              })}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
