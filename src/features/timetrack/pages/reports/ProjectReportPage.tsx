import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth } from 'date-fns';
import { ArrowLeft, Loader2, FileBarChart, Trash2 } from 'lucide-react';
import { LineChart, Line, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { PageHeader } from '@/components/ui-kit/PageHeader';
import { StatCard } from '@/components/ui-kit/StatCard';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { supabase } from '@/lib/supabase';
import { errorMessage } from '@/lib/db-errors';
import { useToast } from '@/hooks/use-toast';
import { toCsv, downloadCsv } from '@/lib/csv';
import { useTimetrackCapabilities } from '../../lib/capabilities';
import { MultiSelectFilter } from '../../reports/ReportFiltersBar';
import { useReportLookups, formatHours } from '../../reports/useReportData';
import type { TimeProject } from '../../lib/types';

type RangePreset = 'this_week' | 'this_month' | 'all_time' | 'custom';

function rangeForPreset(preset: RangePreset): { start: string | null; end: string | null } {
  const today = new Date();
  if (preset === 'this_week') return { start: format(startOfWeek(today, { weekStartsOn: 1 }), 'yyyy-MM-dd'), end: format(endOfWeek(today, { weekStartsOn: 1 }), 'yyyy-MM-dd') };
  if (preset === 'this_month') return { start: format(startOfMonth(today), 'yyyy-MM-dd'), end: format(endOfMonth(today), 'yyyy-MM-dd') };
  if (preset === 'all_time') return { start: null, end: null };
  return { start: format(today, 'yyyy-MM-dd'), end: format(today, 'yyyy-MM-dd') };
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
  const { toast } = useToast();
  const qc = useQueryClient();
  const { has } = useTimetrackCapabilities();
  const { employees } = useReportLookups();

  const [preset, setPreset] = useState<RangePreset>('this_week');
  const [employeeIds, setEmployeeIds] = useState<string[]>([]);
  const { start, end } = rangeForPreset(preset);

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
    () => (report?.cumulative ?? []).map((d) => ({ date: format(new Date(d.date), 'd MMM'), hours: d.hours })),
    [report],
  );

  const eraseRecordedTime = async () => {
    try {
      let q = supabase.from('time_entries').delete().eq('project_id', projectId!);
      if (start) q = q.gte('start_time', `${start}T00:00:00`);
      if (end) q = q.lte('start_time', `${end}T23:59:59`);
      const { error } = await q;
      if (error) throw error;
      toast({ title: 'Recorded time erased', description: 'All time entries in this range were permanently deleted.' });
      qc.invalidateQueries({ queryKey: ['timetrack', 'project-report', projectId] });
    } catch (err) {
      toast({ title: 'Could not erase time', description: errorMessage(err), variant: 'destructive' });
    }
  };

  const exportTimeEntries = () => {
    const rows = (report?.entries ?? []).map((e) => [
      format(new Date(e.start_time), 'yyyy-MM-dd'), e.employee_name, e.task_name,
      formatHours((e.duration_minutes ?? 0) / 60), e.notes ?? '',
      format(new Date(e.start_time), 'HH:mm'), e.end_time ? format(new Date(e.end_time), 'HH:mm') : '',
      e.income.toFixed(2), e.cost.toFixed(2),
    ]);
    downloadCsv(
      `${(project?.name ?? 'project').replace(/\s+/g, '-')}-time-entries.csv`,
      toCsv(['Date', 'User', 'Task', 'Hours', 'Note', 'From', 'To', 'Income', 'Cost'], rows),
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
      <PageHeader title={project?.name ?? 'Project report'} description="Cumulative hours, costs, and a full breakdown of time logged against this project" icon={FileBarChart} />

      <div className="flex flex-wrap items-end gap-3">
        <div>
          <Label className="text-xs text-muted-foreground">Date range</Label>
          <Select value={preset} onValueChange={(v) => setPreset(v as RangePreset)}>
            <SelectTrigger className="h-8 text-xs w-[140px] mt-1"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="this_week">This week</SelectItem>
              <SelectItem value="this_month">This month</SelectItem>
              <SelectItem value="all_time">All time</SelectItem>
            </SelectContent>
          </Select>
        </div>
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
              {cumulativeChart.length === 0 ? (
                <p className="text-sm text-muted-foreground py-10 text-center">No data to display.</p>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={cumulativeChart}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip formatter={(v: number) => formatHours(v)} />
                    <Line type="monotone" dataKey="hours" stroke="#10b981" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              )}

              <div className="flex items-center justify-end gap-2 mt-3">
                {has('manage_projects') && (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="outline" size="sm" className="text-destructive hover:text-destructive">
                        <Trash2 className="h-3.5 w-3.5 mr-1.5" /> Erase recorded time
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Erase recorded time?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This permanently deletes every time entry logged against <strong>{project?.name}</strong> in the selected date range
                          ({preset === 'all_time' ? 'all time' : `${start} to ${end}`}). This cannot be undone.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={eraseRecordedTime} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                          Erase permanently
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
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
            <StatCard
              title="Total costs"
              value={`$${(report?.totals.total_cost ?? 0).toFixed(2)}`}
              subtitle={`Billable revenue: $${(report?.totals.billable_revenue ?? 0).toFixed(2)} · Non-billable revenue: $${(report?.totals.non_billable_revenue ?? 0).toFixed(2)}`}
              tone="success"
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
                        <TableHead>Income</TableHead>
                        <TableHead>Cost</TableHead>
                        <TableHead>Assigned</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(report?.tasks ?? []).map((t) => (
                        <TableRow key={t.task_id}>
                          <TableCell>{t.task_name}</TableCell>
                          <TableCell>{formatHours(t.hours)}</TableCell>
                          <TableCell>${t.income.toFixed(2)}</TableCell>
                          <TableCell>${t.cost.toFixed(2)}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">{t.employee_ids.length} {t.employee_ids.length === 1 ? 'person' : 'people'}</TableCell>
                        </TableRow>
                      ))}
                      <TableRow className="font-medium">
                        <TableCell>Total:</TableCell>
                        <TableCell>{formatHours(report?.totals.total_hours ?? 0)}</TableCell>
                        <TableCell>${(report?.totals.billable_revenue ?? 0).toFixed(2)}</TableCell>
                        <TableCell>${(report?.totals.total_cost ?? 0).toFixed(2)}</TableCell>
                        <TableCell>—</TableCell>
                      </TableRow>
                      {(report?.tasks ?? []).length === 0 && (
                        <TableRow><TableCell colSpan={5} className="text-center text-sm text-muted-foreground py-6">No data match your criteria.</TableCell></TableRow>
                      )}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="activities" className="mt-4">
              <Card><CardContent className="pt-4">
                <p className="text-sm text-muted-foreground text-center py-6">No data match your criteria.</p>
              </CardContent></Card>
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
                        <TableHead>Income</TableHead>
                        <TableHead>Cost</TableHead>
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
                          <TableCell>${e.income.toFixed(2)}</TableCell>
                          <TableCell>${e.cost.toFixed(2)}</TableCell>
                        </TableRow>
                      ))}
                      {(report?.entries ?? []).length === 0 && (
                        <TableRow><TableCell colSpan={9} className="text-center text-sm text-muted-foreground py-6">No data match your criteria.</TableCell></TableRow>
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
