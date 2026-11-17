import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { addDays, endOfMonth, endOfWeek, endOfYear, format, parseISO, startOfMonth, startOfWeek, startOfYear, subMonths, subYears } from 'date-fns';
import { ArrowLeft, Loader2, FileBarChart } from 'lucide-react';
import { CumulativeChart } from '@/features/timetrack/ui/charts';
import { PageHeader } from '@/features/timetrack/ui/TrackerPageHeader';
import { StatCard } from '@/features/timetrack/ui/TrackerStat';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { CHART_COLORS, fmtDuration } from '@/features/timetrack/ui/charts';
import { captureDomain, useLogsWithIntervals } from '../activity/shared';
import { supabase } from '@/lib/supabase';
import { toCsv, downloadCsv } from '@/lib/csv';
import { MultiSelectFilter } from '../../reports/ReportFiltersBar';
import { useReportLookups, formatHours } from '../../reports/useReportData';
import type { TimeProject } from '../../lib/types';

type RangePreset = 'this_week' | 'last_week' | 'this_month' | 'last_month' | 'this_year' | 'last_year' | 'all_time' | 'custom';

const PRESET_LABELS: Record<RangePreset, string> = {
  this_week: 'This week', last_week: 'Last week', this_month: 'This month', last_month: 'Last month',
  this_year: 'This year', last_year: 'Last year', all_time: 'All time', custom: 'Custom range',
};

function rangeForPreset(preset: RangePreset, custom: { start: string; end: string }): { start: string | null; end: string | null } {
  const today = new Date();
  const f = (d: Date) => format(d, 'yyyy-MM-dd');
  const wk = startOfWeek(today, { weekStartsOn: 1 });
  switch (preset) {
    case 'this_week': return { start: f(wk), end: f(endOfWeek(today, { weekStartsOn: 1 })) };
    case 'last_week': return { start: f(addDays(wk, -7)), end: f(addDays(wk, -1)) };
    case 'this_month': return { start: f(startOfMonth(today)), end: f(endOfMonth(today)) };
    case 'last_month': return { start: f(startOfMonth(subMonths(today, 1))), end: f(endOfMonth(subMonths(today, 1))) };
    case 'this_year': return { start: f(startOfYear(today)), end: f(endOfYear(today)) };
    case 'last_year': return { start: f(startOfYear(subYears(today, 1))), end: f(endOfYear(subYears(today, 1))) };
    case 'all_time': return { start: null, end: null };
    default: return { start: custom.start, end: custom.end };
  }
}

interface ReportTask { task_id: string; task_name: string; hours: number; income: number; cost: number; employee_ids: string[] }
interface ReportEntryRow {
  id: string; employee_id: string; employee_name: string; task_id: string; task_name: string;
  start_time: string; end_time: string | null; duration_minutes: number | null; notes: string | null;
  is_billable: boolean; income: number; cost: number;
}
interface ReportTag { tag_id: string; tag_name: string; employee_id: string; employee_name: string; hours: number }
interface ReportTotals {
  total_hours: number; billable_hours: number; non_billable_hours: number;
  billable_revenue: number; non_billable_revenue: number; total_cost: number;
}
interface ReportPayload {
  tasks: ReportTask[]; cumulative: { date: string; hours: number }[]; totals: ReportTotals;
  entries: ReportEntryRow[]; tags: ReportTag[];
}

/** Reached via "Go to report" from the Projects page. TimeCamp's project
 * drill-down: cumulative-hours chart, start date / hours / costs stat
 * cards, and a Tasks / Activities / Time Entries / Tags tab set. */
export default function ProjectReportPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const { employees } = useReportLookups();

  const [preset, setPreset] = useState<RangePreset>('this_week');
  const [employeeIds, setEmployeeIds] = useState<string[]>([]);
  const [custom, setCustom] = useState({ start: format(startOfMonth(new Date()), 'yyyy-MM-dd'), end: format(new Date(), 'yyyy-MM-dd') });
  const { start, end } = rangeForPreset(preset, custom);

  const { data: project } = useQuery({
    queryKey: ['timetrack', 'project', projectId],
    queryFn: async () => {
      const { data, error } = await supabase.from('time_projects').select('*').eq('id', projectId!).single();
      if (error) throw error;
      return data as TimeProject;
    },
    enabled: !!projectId,
  });

  const { data: report, isLoading } = useQuery({
    queryKey: ['timetrack', 'project-report', projectId, start, end, employeeIds],
    queryFn: async (): Promise<ReportPayload> => {
      const { data, error } = await supabase.rpc('time_project_report', {
        p_project_id: projectId!,
        p_start: start,
        p_end: end,
        p_employee_ids: employeeIds.length > 0 ? employeeIds : null,
      });
      if (error) throw error;
      return data as unknown as ReportPayload;
    },
    enabled: !!projectId,
  });

  const cumulativeChart = useMemo(
    () => (report?.cumulative ?? []).map((d) => ({ label: format(parseISO(d.date), 'd MMM'), hours: d.hours })),
    [report],
  );

  const exportTimeEntries = () => {
    const rows = (report?.entries ?? []).map((e) => [
      format(new Date(e.start_time), 'yyyy-MM-dd'), e.employee_name, e.task_name,
      formatHours((e.duration_minutes ?? 0) / 60), e.notes ?? '',
      format(new Date(e.start_time), 'HH:mm'), e.end_time ? format(new Date(e.end_time), 'HH:mm') : '',
    ]);
    downloadCsv(
      `${(project?.name ?? 'project').replace(/\s+/g, '-')}-time-entries.csv`,
      toCsv(['Date', 'User', 'Task', 'Hours', 'Note', 'From', 'To'], rows),
    );
  };

  if (!projectId) return null;

  return (
    <div className="space-y-3 sm:space-y-6">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={() => navigate('/timetrack/projects')}>
          <ArrowLeft className="h-4 w-4 mr-1.5" /> Projects
        </Button>
      </div>
      <PageHeader title={project?.name ?? 'Project report'} description="Cumulative hours and a full breakdown of time logged against this project" icon={FileBarChart} />

      <div className="flex flex-wrap items-end gap-3">
        <div>
          <Label className="text-xs text-muted-foreground">Date range</Label>
          <Select value={preset} onValueChange={(v) => setPreset(v as RangePreset)}>
            <SelectTrigger className="h-8 text-xs w-[150px] mt-1"><SelectValue /></SelectTrigger>
            <SelectContent>
              {(Object.keys(PRESET_LABELS) as RangePreset[]).map((k) => <SelectItem key={k} value={k}>{PRESET_LABELS[k]}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        {preset === 'custom' && (
          <div>
            <Label className="text-xs text-muted-foreground">From – to</Label>
            <div className="mt-1 flex items-center gap-1.5">
              <Input type="date" value={custom.start} onChange={(e) => e.target.value && setCustom((c) => ({ ...c, start: e.target.value }))} className="h-8 w-[136px] text-xs" />
              <span className="text-xs text-muted-foreground">–</span>
              <Input type="date" value={custom.end} onChange={(e) => e.target.value && setCustom((c) => ({ ...c, end: e.target.value }))} className="h-8 w-[136px] text-xs" />
            </div>
          </div>
        )}
        <div className="w-56">
          <MultiSelectFilter
            label="People" allLabel="All users"
            options={(employees.data ?? []).map((e) => ({ id: e.id, name: e.full_name ?? e.email }))}
            selected={employeeIds} onChange={setEmployeeIds}
          />
        </div>
      </div>

      {preset !== 'all_time' && (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          You are looking at a limited time frame that does not contain the full project lifespan. To see the whole lifespan of this project, select <strong>All time</strong> above.
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : (
        <>
          <Card>
            <CardContent className="pt-4">
              <p className="text-sm font-medium mb-2">Cumulative hours over time</p>
              <CumulativeChart data={cumulativeChart} />

            </CardContent>
          </Card>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <StatCard
              title="Start date"
              value={project ? format(new Date(project.created_at), 'd MMM yyyy') : '—'}
              subtitle={project ? `${Math.max(0, Math.floor((Date.now() - new Date(project.created_at).getTime()) / 86400000))} days ago` : undefined}
              tone="default"
            />
            <StatCard
              title="Total hours"
              value={formatHours(report?.totals.total_hours ?? 0)}
              subtitle={`Billable: ${formatHours(report?.totals.billable_hours ?? 0)} · Non-billable: ${formatHours(report?.totals.non_billable_hours ?? 0)}`}
              tone="primary"
            />
          </div>

          <Tabs defaultValue="tasks">
            <TabsList>
              <TabsTrigger value="tasks">Tasks</TabsTrigger>
              <TabsTrigger value="activities">Activities</TabsTrigger>
              <TabsTrigger value="entries">Time Entries</TabsTrigger>
              <TabsTrigger value="tags">Tags</TabsTrigger>
            </TabsList>

            <TabsContent value="tasks" className="mt-4">
              <Card>
                <CardContent className="pt-4">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Task</TableHead>
                        <TableHead>Hours</TableHead>
                        <TableHead>Assigned</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(report?.tasks ?? []).map((t) => (
                        <TableRow key={t.task_id}>
                          <TableCell>{t.task_name}</TableCell>
                          <TableCell>{formatHours(t.hours)}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">{t.employee_ids.length} {t.employee_ids.length === 1 ? 'person' : 'people'}</TableCell>
                        </TableRow>
                      ))}
                      <TableRow className="font-medium">
                        <TableCell>Total:</TableCell>
                        <TableCell>{formatHours(report?.totals.total_hours ?? 0)}</TableCell>
                        <TableCell>—</TableCell>
                      </TableRow>
                      {(report?.tasks ?? []).length === 0 && (
                        <TableRow><TableCell colSpan={3} className="text-center text-sm text-muted-foreground py-6">No data match your criteria.</TableCell></TableRow>
                      )}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="activities" className="mt-4">
              <ProjectActivities entries={report?.entries ?? []} start={start} end={end} />
            </TabsContent>

            <TabsContent value="entries" className="mt-4">
              <Card>
                <CardContent className="pt-4">
                  <div className="flex justify-end mb-2">
                    <Button variant="outline" size="sm" onClick={exportTimeEntries}>Export</Button>
                  </div>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>User</TableHead>
                        <TableHead>Task</TableHead>
                        <TableHead>Hours</TableHead>
                        <TableHead>Note</TableHead>
                        <TableHead>From</TableHead>
                        <TableHead>To</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(report?.entries ?? []).map((e) => (
                        <TableRow key={e.id}>
                          <TableCell>{format(new Date(e.start_time), 'd MMM yyyy')}</TableCell>
                          <TableCell>{e.employee_name}</TableCell>
                          <TableCell>{e.task_name}</TableCell>
                          <TableCell>{formatHours((e.duration_minutes ?? 0) / 60)}</TableCell>
                          <TableCell className="max-w-[160px] truncate">{e.notes ?? ''}</TableCell>
                          <TableCell>{format(new Date(e.start_time), 'HH:mm')}</TableCell>
                          <TableCell>{e.end_time ? format(new Date(e.end_time), 'HH:mm') : '—'}</TableCell>
                        </TableRow>
                      ))}
                      {(report?.entries ?? []).length === 0 && (
                        <TableRow><TableCell colSpan={7} className="text-center text-sm text-muted-foreground py-6">No data match your criteria.</TableCell></TableRow>
                      )}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="tags" className="mt-4">
              <Card>
                <CardContent className="pt-4">
                  <p className="text-xs text-muted-foreground mb-3">The time entry was divided between the tags assigned to this task.</p>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Tag</TableHead>
                        <TableHead>User</TableHead>
                        <TableHead>Hours</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(report?.tags ?? []).map((t) => (
                        <TableRow key={`${t.tag_id}-${t.employee_id}`}>
                          <TableCell><Badge variant="secondary">{t.tag_name}</Badge></TableCell>
                          <TableCell>{t.employee_name}</TableCell>
                          <TableCell>{formatHours(t.hours)}</TableCell>
                        </TableRow>
                      ))}
                      {(report?.tags ?? []).length === 0 && (
                        <TableRow><TableCell colSpan={3} className="text-center text-sm text-muted-foreground py-6">No data</TableCell></TableRow>
                      )}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  );
}

/** Computer activity captured while this project's timers were running: which sites/apps, for how long, and how they were classed. */
function ProjectActivities({ entries, start, end }: { entries: ReportEntryRow[]; start: string | null; end: string | null }) {
  const first = entries.length ? format(new Date(Math.min(...entries.map((e) => new Date(e.start_time).getTime()))), 'yyyy-MM-dd') : format(new Date(), 'yyyy-MM-dd');
  const { data, isLoading } = useLogsWithIntervals(start ?? first, end ?? format(new Date(), 'yyyy-MM-dd'));

  const rows = useMemo(() => {
    const spans = new Map<string, { s: number; e: number }[]>();
    for (const e of entries) {
      const list = spans.get(e.employee_id) ?? [];
      list.push({ s: new Date(e.start_time).getTime(), e: e.end_time ? new Date(e.end_time).getTime() : Date.now() });
      spans.set(e.employee_id, list);
    }
    const by = new Map<string, { hours: number; isSite: boolean; cat: Record<string, number> }>();
    let total = 0;
    for (const l of data?.logs ?? []) {
      if (l.productivity_category === 'idle') continue;
      const t = new Date(l.captured_at).getTime();
      if (!(spans.get(l.employee_id) ?? []).some((x) => t >= x.s - 60_000 && t <= x.e + 60_000)) continue;
      const domain = captureDomain(l);
      const key = domain ?? l.app_name ?? 'Unknown';
      const hours = (data?.intervalByEmployee.get(l.employee_id) ?? 10) / 60;
      const r = by.get(key) ?? { hours: 0, isSite: !!domain, cat: {} };
      r.hours += hours;
      const c = l.productivity_category === 'productive' ? 'productive' : l.productivity_category === 'unproductive' || l.productivity_category === 'blocked' ? 'unproductive' : 'neutral';
      r.cat[c] = (r.cat[c] ?? 0) + hours;
      by.set(key, r);
      total += hours;
    }
    return {
      total,
      list: [...by.entries()].map(([name, r]) => ({
        name, hours: r.hours, isSite: r.isSite, pct: total ? (r.hours / total) * 100 : 0,
        cat: (Object.entries(r.cat).sort((x, y) => y[1] - x[1])[0]?.[0] ?? 'neutral') as 'productive' | 'neutral' | 'unproductive',
      })).sort((x, y) => y.hours - x.hours),
    };
  }, [data, entries]);

  const color = { productive: CHART_COLORS.productive, neutral: CHART_COLORS.neutral, unproductive: CHART_COLORS.unproductive };
  const label = { productive: 'Work tool', neutral: 'Neutral / uncategorised', unproductive: 'Not work' };

  return (
    <Card>
      <CardContent className="pt-4">
        {isLoading ? (
          <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : rows.list.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No computer activity was captured while this project's timer ran in this period. Activity comes from the desktop tracker, so time
            started from the website alone has none.
          </p>
        ) : (
          <>
            <p className="mb-3 text-sm text-muted-foreground">Computer activity during this project's time: <span className="font-semibold text-foreground">{fmtDuration(rows.total)}</span></p>
            <Table>
              <TableHeader>
                <TableRow><TableHead>Site / app</TableHead><TableHead className="text-right">Time</TableHead><TableHead className="text-right">%</TableHead><TableHead>Category</TableHead></TableRow>
              </TableHeader>
              <TableBody>
                {rows.list.slice(0, 30).map((r) => (
                  <TableRow key={r.name}>
                    <TableCell className="font-medium">{r.name}<span className="ml-2 text-xs font-normal text-muted-foreground">{r.isSite ? 'site' : 'app'}</span></TableCell>
                    <TableCell className="text-right font-mono tabular-nums">{fmtDuration(r.hours)}</TableCell>
                    <TableCell className="text-right font-mono tabular-nums text-muted-foreground">{Math.round(r.pct)}%</TableCell>
                    <TableCell><span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground"><span className="h-2 w-2 rounded-sm" style={{ background: color[r.cat] }} />{label[r.cat]}</span></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </>
        )}
      </CardContent>
    </Card>
  );
}
