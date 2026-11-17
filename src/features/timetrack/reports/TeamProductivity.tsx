import { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { supabase } from '@/lib/supabase';
import { toCsv, downloadCsv } from '@/lib/csv';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CHART_COLORS, ChartEmpty, durationAxis, fmtDuration } from '../ui/charts';
import { useLogsWithIntervals } from '../pages/activity/shared';
import { useCompanyEmployeeIds } from '../lib/trackerEmployees';
import { useCompany } from '../lib/company';
import { useReportEntries } from './useReportData';
import { SiteIcon } from '../ui/SiteIcon';
import { siteOrAppKey } from '../pages/activity/shared';
import { useTrackedHours } from '../lib/useTrackedHours';
import { DailyTrends, DayDetails, HourlyProductivity, PersonInsights, PersonSummaryTiles, TopAppsStrip, TopSitesAppsColumns } from './ActivityBreakdown';
import type { ReportFiltersState } from './useReportFilters';

/** The employee's uploaded profile picture, or a coloured initials circle when they have none (or it fails to load). */
function Photo({ url, initials, accent }: { url: string | null; initials: string; accent: string }) {
  const [failed, setFailed] = useState(false);
  if (url && !failed) {
    return <img src={url} alt="" className="h-9 w-9 shrink-0 rounded-full object-cover ring-2" style={{ ['--tw-ring-color' as string]: accent }} onError={() => setFailed(true)} />;
  }
  return <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white" style={{ background: accent }}>{initials}</span>;
}

/** What a person with task time but no desktop tracker has: their hours by project and task, from the timers they ran. */
function TaskTimeOnly({ filters, id, name }: { filters: ReportFiltersState; id: string; name: string }) {
  const { data: entries, isLoading } = useReportEntries({ ...filters, employeeIds: [id] });
  const rows = useMemo(() => {
    const by = new Map<string, { project: string; task: string; minutes: number; running: boolean }>();
    for (const e of entries ?? []) {
      const k = `${e.project_id}|${e.task_id}`;
      const r = by.get(k) ?? { project: e.project_name, task: e.task_name, minutes: 0, running: false };
      r.minutes += e.duration_minutes;
      r.running = r.running || !!e.is_running;
      by.set(k, r);
    }
    return [...by.values()].sort((a, b) => b.minutes - a.minutes);
  }, [entries]);
  return (
    <div className="space-y-3">
      <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs">
        <p className="font-medium text-amber-600 dark:text-amber-400">No desktop tracker data for {name}</p>
        <p className="mt-0.5 text-muted-foreground">
          Only the task timers are known. There is no computer activity, no sites or apps, no screenshots and no idle detection, so productivity cannot be worked out.
          To get all of that, {name} needs to install the desktop tracker, sign in, and start a task there.
        </p>
      </div>
      {isLoading ? null : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No timer entries in this range.</p>
      ) : (
        <div className="divide-y divide-border/60 rounded-md border border-border text-sm">
          {rows.map((r) => (
            <div key={`${r.project}|${r.task}`} className="flex items-center gap-3 px-3 py-2">
              <span className="min-w-0 flex-1 truncate"><span className="font-medium">{r.task}</span><span className="ml-2 text-xs text-muted-foreground">{r.project}</span></span>
              {r.running && <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs text-emerald-500">running now</span>}
              <span className="w-20 text-right font-mono tabular-nums">{fmtDuration(r.minutes / 60)}</span>
            </div>
          ))}
        </div>
      )}
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
  /** days on which this person has any captured activity */
  days: number;
  /** this person's biggest sites/apps, largest first (name, hours) */
  topApps: [string, number][];
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
  const [sort, setSort] = useState<'productive' | 'tracked' | 'name' | 'lowest'>('productive');
  const [attentionOnly, setAttentionOnly] = useState(false);
  const companyIds = useCompanyEmployeeIds();
  const [company, setCompany] = useCompany();
  const tracked = useTrackedHours(filters.start, filters.end);
  const { data: logData, isLoading } = useLogsWithIntervals(filters.start, filters.end);

  const { data: names } = useQuery({
    queryKey: ['timetrack', 'directory-names'],
    queryFn: async () => {
      const { data } = await supabase.from('profiles_directory').select('id, full_name, photo_url');
      return new Map((data ?? []).map((e) => [e.id as string, { name: (e.full_name as string | null) ?? 'Unknown', photo: (e.photo_url as string | null) ?? null }]));
    },
    staleTime: 5 * 60_000,
  });

  // people with activity in this range that the company filter is leaving out (so nobody disappears without a word)
  const hiddenByCompany = useMemo(() => new Set<string>(), []);
  const rows = useMemo<PersonRow[]>(() => {
    const byPerson = new Map<string, PersonRow>();
    const dayKeys = new Map<string, Set<string>>();
    hiddenByCompany.clear();
    const appHours = new Map<string, Map<string, number>>();
    for (const l of logData?.logs ?? []) {
      if (l.productivity_category === 'idle') continue;
      if (filters.employeeIds.length > 0 && !filters.employeeIds.includes(l.employee_id)) continue;
      if (companyIds && !companyIds.has(l.employee_id)) { hiddenByCompany.add(l.employee_id); continue; }
      const hours = (logData?.intervalByEmployee.get(l.employee_id) ?? 10) / 60;
      const row = byPerson.get(l.employee_id) ?? {
        id: l.employee_id, name: names?.get(l.employee_id)?.name ?? 'Unknown', productive: 0, neutral: 0, unproductive: 0, total: 0, pct: 0, days: 0, topApps: [],
      };
      const am = appHours.get(l.employee_id) ?? new Map<string, number>();
      const appKey = siteOrAppKey(l).key;
      am.set(appKey, (am.get(appKey) ?? 0) + hours);
      appHours.set(l.employee_id, am);
      const dk = dayKeys.get(l.employee_id) ?? new Set<string>();
      dk.add(l.captured_at.slice(0, 10));
      dayKeys.set(l.employee_id, dk);
      const c = l.productivity_category;
      if (c === 'productive') row.productive += hours;
      else if (c === 'unproductive' || c === 'blocked') row.unproductive += hours;
      else row.neutral += hours;
      byPerson.set(l.employee_id, row);
    }
    return [...byPerson.values()]
      .map((r) => {
        const total = r.productive + r.neutral + r.unproductive;
        return { ...r, total, pct: total > 0 ? (r.productive / total) * 100 : 0, days: dayKeys.get(r.id)?.size ?? 1, topApps: [...(appHours.get(r.id) ?? new Map<string, number>()).entries()].sort((x, y) => y[1] - x[1]).slice(0, 5) };
      })
      .sort((a, b) => b.pct - a.pct || b.total - a.total);
  }, [logData, names, filters.employeeIds, companyIds, hiddenByCompany]);

  // People with task time but no computer activity at all: their desktop tracker is not installed, not signed in, or never ran.
  const notConnected = [...tracked.entries()]
    .filter(([, t]) => t.entryHours > 0.05 && t.computerHours === 0)
    .filter(([id]) => (filters.employeeIds.length === 0 || filters.employeeIds.includes(id)) && (!companyIds || companyIds.has(id)))
    .map(([id, t]) => ({ id, name: names?.get(id)?.name ?? 'Unknown', hours: t.entryHours }))
    .sort((a, b) => b.hours - a.hours);
  const teamTotal = rows.reduce((a, r) => a + r.total, 0);
  const teamProductive = rows.reduce((a, r) => a + r.productive, 0);
  const teamUnproductive = rows.reduce((a, r) => a + r.unproductive, 0);
  const teamPct = teamTotal ? (teamProductive / teamTotal) * 100 : 0;
  const rangeDays = Math.max(1, Math.round((new Date(`${filters.end}T12:00:00`).getTime() - new Date(`${filters.start}T12:00:00`).getTime()) / 86_400_000) + 1);
  const attention = rows.filter((r) => r.pct < 30);
  const listRows = useMemo(() => {
    const base = attentionOnly ? rows.filter((r) => r.pct < 30) : rows;
    const copy = [...base];
    if (sort === 'tracked') copy.sort((a, b) => b.total - a.total);
    else if (sort === 'name') copy.sort((a, b) => a.name.localeCompare(b.name));
    else if (sort === 'lowest') copy.sort((a, b) => a.pct - b.pct);
    return copy;
  }, [rows, sort, attentionOnly]);
  const exportCsv = () => {
    downloadCsv(
      `team-productivity-${filters.start}-to-${filters.end}.csv`,
      toCsv(['Employee', 'Tracked (h)', 'Productive (h)', 'Neutral (h)', 'Unproductive (h)', 'Productive %'],
        rows.map((r) => [r.name, r.total.toFixed(2), r.productive.toFixed(2), r.neutral.toFixed(2), r.unproductive.toFixed(2), String(Math.round(r.pct))])),
    );
  };
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
        <div className="flex flex-wrap items-center gap-1">
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={exportCsv} disabled={rows.length === 0}>Export CSV</Button>
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
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
              {[
                { label: 'People tracked', value: String(rows.length), sub: 'with computer activity' },
                { label: 'Total tracked', value: fmtDuration(teamTotal), sub: `avg ${fmtDuration(teamTotal / rows.length)} per person` },
                { label: 'Avg per person / day', value: fmtDuration(teamTotal / rows.length / rangeDays), sub: `over ${rangeDays} day${rangeDays === 1 ? '' : 's'}` },
                { label: 'Productive', value: `${Math.round(teamPct)}%`, sub: fmtDuration(teamProductive), color: CHART_COLORS.productive },
                { label: 'Unproductive', value: `${Math.round(teamTotal ? (teamUnproductive / teamTotal) * 100 : 0)}%`, sub: fmtDuration(teamUnproductive), color: CHART_COLORS.unproductive },
                { label: 'Most productive', value: rows[0].name, sub: `${Math.round(rows[0].pct)}% · ${fmtDuration(rows[0].total)}` },
              ].map((t) => (
                <div key={t.label} className="rounded-lg border border-border bg-card px-3 py-2.5">
                  <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    {'color' in t && t.color && <span className="h-2 w-2 rounded-sm" style={{ background: t.color }} />}{t.label}
                  </p>
                  <p className="mt-0.5 truncate text-lg font-semibold">{t.value}</p>
                  <p className="truncate text-xs text-muted-foreground">{t.sub}</p>
                </div>
              ))}
            </div>
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

            {company !== 'all' && hiddenByCompany.size > 0 && (
              <div className="flex flex-wrap items-center gap-2 rounded-md border border-sky-500/40 bg-sky-500/10 px-3 py-2 text-xs">
                <span className="text-sky-600 dark:text-sky-400">
                  The company filter is on, so {hiddenByCompany.size} {hiddenByCompany.size === 1 ? 'person is' : 'people are'} not shown:{' '}
                  {[...hiddenByCompany].map((id) => names?.get(id)?.name ?? 'Unknown').join(', ')}.
                </span>
                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setCompany('all')}>Show everyone</Button>
              </div>
            )}
            {notConnected.length > 0 && (
              <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs">
                <p className="font-medium text-amber-600 dark:text-amber-400">No tracker data for {notConnected.length} {notConnected.length === 1 ? 'person' : 'people'} who logged time</p>
                <p className="mt-0.5 text-muted-foreground">
                  {notConnected.map((n) => `${n.name} (${fmtDuration(n.hours)})`).join(', ')}. They have task time but no computer activity or screenshots, so the desktop tracker is not installed or not signed in on their computer.
                </p>
              </div>
            )}
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="text-muted-foreground">Sort by</span>
              {([['productive', 'Most productive'], ['lowest', 'Lowest productivity'], ['tracked', 'Most tracked'], ['name', 'Name']] as const).map(([k, label]) => (
                <Button key={k} size="sm" variant={sort === k ? 'default' : 'outline'} className="h-7 text-xs" onClick={() => setSort(k)}>{label}</Button>
              ))}
              <Button
                size="sm" variant={attentionOnly ? 'default' : 'outline'} className="ml-auto h-7 text-xs"
                onClick={() => setAttentionOnly((v) => !v)} disabled={attention.length === 0 && !attentionOnly}
              >
                Needs attention ({attention.length})
              </Button>
            </div>
            <div className="space-y-3">
              {listRows.map((r) => {
                const isOpen = open === r.id;
                const maxTotal = Math.max(...rows.map((x) => x.total), 0.01);
                const tone = r.pct >= 60 ? CHART_COLORS.productive : r.pct >= 30 ? CHART_COLORS.neutral : CHART_COLORS.unproductive;
                const seg = (v: number) => (r.total ? `${(v / r.total) * 100}%` : '0%');
                // each person gets their own stable colour so cards are easy to tell apart
                let hue = 0;
                for (let i = 0; i < r.name.length; i++) hue = (hue * 31 + r.name.charCodeAt(i)) % 360;
                const accent = `hsl(${hue} 65% 55%)`;
                const initials = r.name.replace(/\[.*?\]/g, '').trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('');
                return (
                  <section
                    key={r.id}
                    className={`overflow-hidden rounded-xl border bg-card transition-shadow ${isOpen ? 'shadow-xl shadow-black/30' : 'shadow-sm hover:shadow-md'}`}
                    style={{ borderColor: isOpen ? accent : undefined, borderLeft: `4px solid ${accent}` }}
                  >
                    <button
                      type="button" onClick={() => setOpen(isOpen ? null : r.id)} aria-expanded={isOpen}
                      className={`flex w-full items-center gap-3 px-3 py-3 text-left text-sm transition-colors hover:bg-muted/40 ${isOpen ? 'sticky top-0 z-20 border-b border-border bg-card/95 backdrop-blur' : ''}`}
                    >
                      {isOpen ? <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />}
                      <Photo url={names?.get(r.id)?.photo ?? null} initials={initials} accent={accent} />
                      <span className="w-36 shrink-0 truncate text-[15px] font-semibold sm:w-48">{r.name}</span>
                      <span className="hidden shrink-0 items-center gap-1 md:flex" title={r.topApps.map(([n, h]) => `${n} ${fmtDuration(h)}`).join(' · ')}>
                        {r.topApps.map(([n]) => (
                          <SiteIcon key={n} name={n} size={20} className="rounded-md" />
                        ))}
                      </span>
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
                      <div className="space-y-4 p-3 sm:p-4" style={{ background: `linear-gradient(180deg, hsl(${hue} 40% 50% / 0.08), transparent 220px)` }}>
                        <PersonSummaryTiles filters={{ ...filters, employeeIds: [r.id] }} />
                        <PersonInsights filters={{ ...filters, employeeIds: [r.id] }} team={{ pct: teamPct, hoursPerDay: rows.reduce((a, x) => a + x.total / Math.max(1, x.days), 0) / rows.length }} />
                        <TopAppsStrip filters={{ ...filters, employeeIds: [r.id] }} />
                        <DailyTrends filters={{ ...filters, employeeIds: [r.id] }} />
                        <DayDetails filters={{ ...filters, employeeIds: [r.id] }} />
                        <TopSitesAppsColumns filters={{ ...filters, employeeIds: [r.id] }} />
                        <HourlyProductivity filters={{ ...filters, employeeIds: [r.id] }} />
                        <div className="flex items-center justify-between rounded-lg border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
                          <span>End of {r.name}'s details</span>
                          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setOpen(null)}>Collapse</Button>
                        </div>
                      </div>
                    )}
                  </section>
                );
              })}
              {!attentionOnly && notConnected.map((n) => {
                const isOpen = open === n.id;
                const initials = n.name.replace(/\[.*?\]/g, '').trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('');
                return (
                  <section key={n.id} className="overflow-hidden rounded-xl border border-dashed border-amber-500/50 bg-card" style={{ borderLeft: '4px solid #f59e0b' }}>
                    <button
                      type="button" onClick={() => setOpen(isOpen ? null : n.id)} aria-expanded={isOpen}
                      className="flex w-full items-center gap-3 px-3 py-3 text-left text-sm transition-colors hover:bg-muted/40"
                    >
                      {isOpen ? <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />}
                      <Photo url={names?.get(n.id)?.photo ?? null} initials={initials} accent="#f59e0b" />
                      <span className="w-36 shrink-0 truncate text-[15px] font-semibold sm:w-48">{n.name}</span>
                      <span className="hidden min-w-0 flex-1 text-xs text-amber-600 dark:text-amber-400 sm:block">Task timers only, no desktop tracker</span>
                      <span className="ml-auto w-20 shrink-0 text-right font-mono tabular-nums text-muted-foreground">{fmtDuration(n.hours)}</span>
                      <span className="w-16 shrink-0 rounded-full bg-amber-500/15 px-2 py-0.5 text-center text-xs font-semibold text-amber-600 dark:text-amber-400">n/a</span>
                    </button>
                    {isOpen && (
                      <div className="p-3 sm:p-4">
                        <TaskTimeOnly filters={filters} id={n.id} name={n.name} />
                      </div>
                    )}
                  </section>
                );
              })}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
