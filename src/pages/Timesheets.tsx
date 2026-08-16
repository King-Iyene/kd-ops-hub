import { useEffect, useState, useCallback, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import { format, parseISO, startOfWeek, addDays } from 'date-fns';
import { usePageTitle } from '@/hooks/usePageTitle';
import { PageHeader } from '@/components/ui-kit/PageHeader';
import { StatCard } from '@/components/ui-kit/StatCard';
import { EmptyState } from '@/components/ui-kit/EmptyState';
import { TableSkeleton } from '@/components/ui-kit/TableSkeleton';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { Progress } from '@/components/ui/progress';
import {
  Plus, Search, Clock, CheckCircle2, XCircle, Send,
  FileText, Eye, CalendarDays, Percent,
} from 'lucide-react';

interface Timesheet {
  id: string;
  employee_id: string;
  week_start: string;
  status: 'draft' | 'submitted' | 'approved' | 'rejected';
  total_hours: number;
  billable_hours: number;
  submitted_at: string | null;
  approved_by: string | null;
  approved_at: string | null;
  notes: string | null;
  created_at: string;
}

interface TimesheetEntry {
  id: string;
  timesheet_id: string;
  work_date: string;
  project_id: string | null;
  task_description: string | null;
  hours: number;
  is_billable: boolean;
  created_at: string;
}

interface Profile { id: string; full_name: string; }
interface Project { id: string; name: string; }

type TimesheetStatus = Timesheet['status'];

const STATUS_BADGE: Record<TimesheetStatus, { label: string; variant: 'secondary' | 'default' | 'destructive' | 'outline'; className?: string }> = {
  draft:     { label: 'Draft',     variant: 'secondary' },
  submitted: { label: 'Submitted', variant: 'default',  className: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300 border-blue-200 dark:border-blue-800' },
  approved:  { label: 'Approved',  variant: 'default',  className: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800' },
  rejected:  { label: 'Rejected',  variant: 'destructive' },
};

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export default function Timesheets() {
  usePageTitle('Timesheets');
  const { user } = useAuthStore();
  const { toast } = useToast();

  const [timesheets, setTimesheets] = useState<Timesheet[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<TimesheetStatus | 'all'>('all');
  const [weekFilter, setWeekFilter] = useState('');

  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState({ employee_id: '__none__', week_start: '' });
  const [createSaving, setCreateSaving] = useState(false);

  const [detailOpen, setDetailOpen] = useState(false);
  const [activeTimesheet, setActiveTimesheet] = useState<Timesheet | null>(null);
  const [entries, setEntries] = useState<TimesheetEntry[]>([]);
  const [entriesLoading, setEntriesLoading] = useState(false);

  const [entryDialogOpen, setEntryDialogOpen] = useState(false);
  const [entryForm, setEntryForm] = useState({
    work_date: '',
    task_description: '',
    hours: '',
    is_billable: false,
    project_id: '__none__',
  });
  const [entrySaving, setEntrySaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: tsData }, { data: pData }, { data: projData }] = await Promise.all([
      supabase.from('timesheets').select('*').order('week_start', { ascending: false }),
      supabase.from('profiles').select('id, full_name').neq('is_anonymised', true).order('full_name'),
      supabase.from('projects').select('id, name').order('name'),
    ]);
    setTimesheets(tsData ?? []);
    setProfiles(pData ?? []);
    setProjects(projData ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const empName = (id: string) => profiles.find(p => p.id === id)?.full_name ?? '---';
  const projName = (id: string | null) => (id ? projects.find(p => p.id === id)?.name ?? '---' : '');

  const filtered = useMemo(() => {
    const term = search.toLowerCase();
    return timesheets.filter(ts => {
      const emp = profiles.find(p => p.id === ts.employee_id);
      const matchSearch = !term || (emp?.full_name ?? '').toLowerCase().includes(term);
      const matchStatus = statusFilter === 'all' || ts.status === statusFilter;
      const matchWeek = !weekFilter || ts.week_start === weekFilter;
      return matchSearch && matchStatus && matchWeek;
    });
  }, [timesheets, profiles, search, statusFilter, weekFilter]);

  const stats = useMemo(() => {
    const now = new Date();
    const monthStart = format(new Date(now.getFullYear(), now.getMonth(), 1), 'yyyy-MM-dd');
    const totalHours = timesheets.reduce((s, t) => s + Number(t.total_hours), 0);
    const billableHours = timesheets.reduce((s, t) => s + Number(t.billable_hours), 0);
    const billablePct = totalHours > 0 ? (billableHours / totalHours) * 100 : 0;
    const pending = timesheets.filter(t => t.status === 'submitted').length;
    const approvedThisMonth = timesheets.filter(
      t => t.status === 'approved' && t.approved_at && t.approved_at >= monthStart,
    ).length;
    return { total: timesheets.length, pending, totalHours, billablePct, approvedThisMonth };
  }, [timesheets]);

  async function handleCreate() {
    if (createForm.employee_id === '__none__') {
      toast({ title: 'Please select an employee', variant: 'destructive' });
      return;
    }
    if (!createForm.week_start) {
      toast({ title: 'Week start date is required', variant: 'destructive' });
      return;
    }
    setCreateSaving(true);
    const weekStart = format(startOfWeek(parseISO(createForm.week_start), { weekStartsOn: 1 }), 'yyyy-MM-dd');
    const { error } = await supabase.from('timesheets').insert({
      employee_id: createForm.employee_id,
      week_start: weekStart,
      status: 'draft',
    });
    setCreateSaving(false);
    if (error) {
      toast({ title: 'Failed to create timesheet', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: 'Timesheet created' });
    setCreateOpen(false);
    setCreateForm({ employee_id: '__none__', week_start: '' });
    load();
  }

  async function openDetail(ts: Timesheet) {
    setActiveTimesheet(ts);
    setDetailOpen(true);
    setEntriesLoading(true);
    const { data } = await supabase
      .from('timesheet_entries')
      .select('*')
      .eq('timesheet_id', ts.id)
      .order('work_date');
    setEntries(data ?? []);
    setEntriesLoading(false);
  }

  function openAddEntry(dayDate: string) {
    setEntryForm({
      work_date: dayDate,
      task_description: '',
      hours: '',
      is_billable: false,
      project_id: '__none__',
    });
    setEntryDialogOpen(true);
  }

  async function handleAddEntry() {
    if (!activeTimesheet) return;
    const hours = parseFloat(entryForm.hours);
    if (isNaN(hours) || hours <= 0 || hours > 24) {
      toast({ title: 'Hours must be between 0 and 24', variant: 'destructive' });
      return;
    }
    setEntrySaving(true);
    const { error } = await supabase.from('timesheet_entries').insert({
      timesheet_id: activeTimesheet.id,
      work_date: entryForm.work_date,
      task_description: entryForm.task_description.trim() || null,
      hours,
      is_billable: entryForm.is_billable,
      project_id: entryForm.project_id === '__none__' ? null : entryForm.project_id,
    });
    setEntrySaving(false);
    if (error) {
      toast({ title: 'Failed to add entry', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: 'Entry added' });
    setEntryDialogOpen(false);
    await recalcAndRefresh(activeTimesheet.id);
  }

  async function recalcAndRefresh(timesheetId: string) {
    const { data: allEntries } = await supabase
      .from('timesheet_entries')
      .select('*')
      .eq('timesheet_id', timesheetId);
    const list = allEntries ?? [];
    const totalHours = list.reduce((s, e) => s + Number(e.hours), 0);
    const billableHours = list.filter(e => e.is_billable).reduce((s, e) => s + Number(e.hours), 0);
    await supabase.from('timesheets').update({ total_hours: totalHours, billable_hours: billableHours }).eq('id', timesheetId);
    setEntries(list);
    const { data: updated } = await supabase.from('timesheets').select('*').eq('id', timesheetId).single();
    if (updated) setActiveTimesheet(updated);
    load();
  }

  async function updateStatus(ts: Timesheet, newStatus: TimesheetStatus) {
    const updates: Record<string, unknown> = { status: newStatus };
    if (newStatus === 'submitted') updates.submitted_at = new Date().toISOString();
    if (newStatus === 'approved') {
      updates.approved_at = new Date().toISOString();
      updates.approved_by = user?.id;
    }
    const { error } = await supabase.from('timesheets').update(updates).eq('id', ts.id);
    if (error) {
      toast({ title: 'Update failed', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: `Timesheet ${newStatus}` });
    if (activeTimesheet?.id === ts.id) {
      const { data: refreshed } = await supabase.from('timesheets').select('*').eq('id', ts.id).single();
      if (refreshed) setActiveTimesheet(refreshed);
    }
    load();
  }

  function weekDays(weekStart: string): string[] {
    const base = parseISO(weekStart);
    return Array.from({ length: 7 }, (_, i) => format(addDays(base, i), 'yyyy-MM-dd'));
  }

  function billablePct(ts: Timesheet): number {
    const total = Number(ts.total_hours);
    if (total <= 0) return 0;
    return (Number(ts.billable_hours) / total) * 100;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Timesheets"
        description="Track weekly hours and billable time"
        actions={
          <Button onClick={() => setCreateOpen(true)} className="gap-2">
            <Plus className="h-4 w-4" /> New Timesheet
          </Button>
        }
      />

      <div className="kd-stat-grid">
        <StatCard title="Total Timesheets" value={stats.total} icon={FileText} tone="default" />
        <StatCard title="Pending Approval" value={stats.pending} icon={Clock} tone="warning" />
        <StatCard title="Total Hours" value={`${stats.totalHours.toFixed(1)} hrs`} icon={CalendarDays} tone="primary" />
        <StatCard title="Billable %" value={`${stats.billablePct.toFixed(1)}%`} icon={Percent} tone="success" />
        <StatCard title="Approved This Month" value={stats.approvedThisMonth} icon={CheckCircle2} tone="success" />
      </div>

      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Search employee..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Select value={statusFilter} onValueChange={v => setStatusFilter(v as TimesheetStatus | 'all')}>
          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="submitted">Submitted</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
          </SelectContent>
        </Select>
        <Input
          type="date"
          className="w-44"
          value={weekFilter}
          onChange={e => setWeekFilter(e.target.value)}
          placeholder="Filter by week"
        />
        {weekFilter && (
          <Button variant="ghost" size="sm" onClick={() => setWeekFilter('')}>Clear</Button>
        )}
      </div>

      {loading ? (
        <TableSkeleton rows={6} cols={7} />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Clock}
          title="No timesheets found"
          description="Create a timesheet to start tracking hours."
          action={
            <Button className="gap-2" onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4" /> New Timesheet
            </Button>
          }
        />
      ) : (
        <div className="rounded-xl border border-border/60 bg-card overflow-x-auto">
          <table className="w-full text-sm min-w-[800px]">
            <thead className="bg-muted/50">
              <tr className="border-b border-border/50">
                <th className="text-left px-3 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Employee</th>
                <th className="text-left px-3 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Week Starting</th>
                <th className="text-right px-3 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Total Hours</th>
                <th className="text-right px-3 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Billable Hours</th>
                <th className="text-left px-3 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider min-w-[140px]">Billable %</th>
                <th className="text-left px-3 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Status</th>
                <th className="text-right px-3 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {filtered.map(ts => {
                const pct = billablePct(ts);
                const badge = STATUS_BADGE[ts.status];
                return (
                  <tr key={ts.id} className="hover:bg-muted/40 transition-colors">
                    <td className="py-3 px-3 font-medium text-foreground">{empName(ts.employee_id)}</td>
                    <td className="py-3 px-3 text-muted-foreground">{format(parseISO(ts.week_start), 'dd MMM yyyy')}</td>
                    <td className="py-3 px-3 text-right tabular-nums text-foreground">{Number(ts.total_hours).toFixed(1)}</td>
                    <td className="py-3 px-3 text-right tabular-nums text-foreground">{Number(ts.billable_hours).toFixed(1)}</td>
                    <td className="py-3 px-3">
                      <div className="flex items-center gap-2">
                        <Progress value={pct} className="h-2 flex-1" />
                        <span className="text-xs tabular-nums text-muted-foreground w-10 text-right">{pct.toFixed(0)}%</span>
                      </div>
                    </td>
                    <td className="py-3 px-3">
                      <Badge variant={badge.variant} className={badge.className}>{badge.label}</Badge>
                    </td>
                    <td className="py-3 px-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="icon" onClick={() => openDetail(ts)} aria-label="View timesheet">
                          <Eye className="h-4 w-4" />
                        </Button>
                        {ts.status === 'draft' && (
                          <Button variant="ghost" size="icon" onClick={() => updateStatus(ts, 'submitted')} aria-label="Submit timesheet">
                            <Send className="h-4 w-4 text-blue-600" />
                          </Button>
                        )}
                        {ts.status === 'submitted' && (
                          <>
                            <Button variant="ghost" size="icon" onClick={() => updateStatus(ts, 'approved')} aria-label="Approve timesheet">
                              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                            </Button>
                            <Button variant="ghost" size="icon" onClick={() => updateStatus(ts, 'rejected')} aria-label="Reject timesheet">
                              <XCircle className="h-4 w-4 text-destructive" />
                            </Button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Create Timesheet Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Timesheet</DialogTitle>
            <DialogDescription>Create a weekly timesheet for an employee.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Employee</Label>
              <Select value={createForm.employee_id} onValueChange={v => setCreateForm(f => ({ ...f, employee_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Select employee" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__" disabled>Select employee</SelectItem>
                  {profiles.map(p => <SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Week Starting (will snap to Monday)</Label>
              <Input
                type="date"
                value={createForm.week_start}
                onChange={e => setCreateForm(f => ({ ...f, week_start: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={createSaving}>
              {createSaving ? 'Creating...' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Timesheet Detail Dialog */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          {activeTimesheet && (
            <>
              <DialogHeader>
                <DialogTitle>
                  Timesheet --- {empName(activeTimesheet.employee_id)}
                </DialogTitle>
                <DialogDescription>
                  Week of {format(parseISO(activeTimesheet.week_start), 'dd MMM yyyy')}
                  {' '}<Badge variant={STATUS_BADGE[activeTimesheet.status].variant} className={STATUS_BADGE[activeTimesheet.status].className}>
                    {STATUS_BADGE[activeTimesheet.status].label}
                  </Badge>
                </DialogDescription>
              </DialogHeader>

              <div className="flex items-center gap-4 text-sm py-2">
                <span className="text-muted-foreground">Total: <strong className="text-foreground">{Number(activeTimesheet.total_hours).toFixed(1)} hrs</strong></span>
                <span className="text-muted-foreground">Billable: <strong className="text-foreground">{Number(activeTimesheet.billable_hours).toFixed(1)} hrs</strong></span>
                <span className="text-muted-foreground">Billable %: <strong className="text-foreground">{billablePct(activeTimesheet).toFixed(0)}%</strong></span>
              </div>

              {entriesLoading ? (
                <TableSkeleton rows={4} cols={4} />
              ) : (
                <div className="space-y-3">
                  {weekDays(activeTimesheet.week_start).map((dayDate, i) => {
                    const dayEntries = entries.filter(e => e.work_date === dayDate);
                    const dayTotal = dayEntries.reduce((s, e) => s + Number(e.hours), 0);
                    return (
                      <Card key={dayDate} className="border-border/60">
                        <CardHeader className="py-2 px-4">
                          <div className="flex items-center justify-between">
                            <CardTitle className="text-sm font-medium">
                              {DAY_LABELS[i]} --- {format(parseISO(dayDate), 'dd MMM')}
                              {dayTotal > 0 && (
                                <span className="ml-2 text-muted-foreground font-normal">({dayTotal.toFixed(1)} hrs)</span>
                              )}
                            </CardTitle>
                            {activeTimesheet.status === 'draft' && (
                              <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={() => openAddEntry(dayDate)}>
                                <Plus className="h-3 w-3" /> Add
                              </Button>
                            )}
                          </div>
                        </CardHeader>
                        {dayEntries.length > 0 && (
                          <CardContent className="py-2 px-4">
                            <div className="space-y-1.5">
                              {dayEntries.map(entry => (
                                <div key={entry.id} className="flex items-center gap-3 text-sm">
                                  <span className="flex-1 text-foreground truncate">{entry.task_description || 'No description'}</span>
                                  {entry.project_id && (
                                    <span className="text-xs text-muted-foreground truncate max-w-[120px]">{projName(entry.project_id)}</span>
                                  )}
                                  <span className="tabular-nums text-foreground font-medium shrink-0">{Number(entry.hours).toFixed(1)}h</span>
                                  <Badge variant={entry.is_billable ? 'default' : 'secondary'} className={entry.is_billable ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300' : ''}>
                                    {entry.is_billable ? 'Billable' : 'Non-bill'}
                                  </Badge>
                                </div>
                              ))}
                            </div>
                          </CardContent>
                        )}
                      </Card>
                    );
                  })}
                </div>
              )}

              <DialogFooter className="gap-2 pt-4">
                {activeTimesheet.status === 'draft' && (
                  <Button onClick={() => updateStatus(activeTimesheet, 'submitted')} className="gap-2">
                    <Send className="h-4 w-4" /> Submit
                  </Button>
                )}
                {activeTimesheet.status === 'submitted' && (
                  <>
                    <Button variant="destructive" onClick={() => updateStatus(activeTimesheet, 'rejected')} className="gap-2">
                      <XCircle className="h-4 w-4" /> Reject
                    </Button>
                    <Button onClick={() => updateStatus(activeTimesheet, 'approved')} className="gap-2">
                      <CheckCircle2 className="h-4 w-4" /> Approve
                    </Button>
                  </>
                )}
                {activeTimesheet.status === 'rejected' && (
                  <Button variant="outline" onClick={() => updateStatus(activeTimesheet, 'draft')} className="gap-2">
                    Revert to Draft
                  </Button>
                )}
                <Button variant="outline" onClick={() => setDetailOpen(false)}>Close</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Add Entry Dialog */}
      <Dialog open={entryDialogOpen} onOpenChange={setEntryDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Time Entry</DialogTitle>
            <DialogDescription>
              {entryForm.work_date && format(parseISO(entryForm.work_date), 'EEEE, dd MMM yyyy')}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Date</Label>
              <Input type="date" value={entryForm.work_date} onChange={e => setEntryForm(f => ({ ...f, work_date: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Task Description</Label>
              <Textarea
                value={entryForm.task_description}
                onChange={e => setEntryForm(f => ({ ...f, task_description: e.target.value }))}
                placeholder="What did you work on?"
                rows={2}
              />
            </div>
            <div className="space-y-2">
              <Label>Hours</Label>
              <Input
                type="number"
                min="0"
                max="24"
                step="0.25"
                value={entryForm.hours}
                onChange={e => setEntryForm(f => ({ ...f, hours: e.target.value }))}
                placeholder="e.g. 2.5"
              />
            </div>
            <div className="space-y-2">
              <Label>Project (optional)</Label>
              <Select value={entryForm.project_id} onValueChange={v => setEntryForm(f => ({ ...f, project_id: v }))}>
                <SelectTrigger><SelectValue placeholder="No project" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">No project</SelectItem>
                  {projects.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="is_billable"
                checked={entryForm.is_billable}
                onChange={e => setEntryForm(f => ({ ...f, is_billable: e.target.checked }))}
                className="h-4 w-4 rounded border-border"
              />
              <Label htmlFor="is_billable" className="cursor-pointer">Billable</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEntryDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleAddEntry} disabled={entrySaving}>
              {entrySaving ? 'Adding...' : 'Add Entry'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
