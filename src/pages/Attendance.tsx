import { useEffect, useState, useCallback, useMemo } from 'react';
import {
  Plus, Search, Download, Pencil, Trash2, Clock,
  CheckCircle2, XCircle, AlertTriangle, CalendarDays,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import { logAudit } from '@/lib/audit';
import { format, parseISO, startOfMonth, endOfMonth } from 'date-fns';
import { usePageTitle } from '@/hooks/usePageTitle';
import { PageHeader } from '@/components/ui-kit/PageHeader';
import ClockInWidget from '@/components/hr/ClockInWidget';
import { StatCard } from '@/components/ui-kit/StatCard';
import { EmptyState } from '@/components/ui-kit/EmptyState';
import { TableSkeleton } from '@/components/ui-kit/TableSkeleton';
import { Pagination } from '@/components/ui-kit/Pagination';
import { MobileCard, MobileCardHeader, MobileCardTitle, MobileCardMeta, MobileCardRow, MobileCardFooter } from '@/components/ui-kit/MobileCard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';

type AttendanceStatus = 'present' | 'absent' | 'late' | 'half_day' | 'remote' | 'on_leave' | 'public_holiday';

const STATUS_CONFIG: Record<AttendanceStatus, { label: string; variant: 'default' | 'secondary' | 'outline' | 'destructive'; icon: React.ElementType }> = {
  present:        { label: 'Present',         variant: 'default',     icon: CheckCircle2 },
  absent:         { label: 'Absent',          variant: 'destructive', icon: XCircle },
  late:           { label: 'Late',            variant: 'outline',     icon: AlertTriangle },
  half_day:       { label: 'Half Day',        variant: 'secondary',   icon: Clock },
  remote:         { label: 'Remote',          variant: 'outline',     icon: CheckCircle2 },
  on_leave:       { label: 'On Leave',        variant: 'secondary',   icon: CalendarDays },
  public_holiday: { label: 'Public Holiday',  variant: 'secondary',   icon: CalendarDays },
};

interface AttendanceRecord {
  id: string;
  employee_id: string;
  work_date: string;
  clock_in: string | null;
  clock_out: string | null;
  status: AttendanceStatus;
  overtime_minutes: number;
  notes: string | null;
  recorded_by: string | null;
  created_at: string;
}

interface Profile { id: string; full_name: string; }

const EMPTY_FORM = {
  employee_id: '__none__',
  work_date: format(new Date(), 'yyyy-MM-dd'),
  clock_in: '',
  clock_out: '',
  status: 'present' as AttendanceStatus,
  overtime_minutes: '0',
  notes: '',
};

export default function Attendance() {
  usePageTitle('Attendance');
  const { user, profile } = useAuthStore();
  const { toast } = useToast();

  const PAGE_SIZE = 50;
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(0);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [lateThreshold, setLateThreshold] = useState('09:15');

  const today = new Date();
  const [monthStart, setMonthStart] = useState(format(startOfMonth(today), 'yyyy-MM-dd'));
  const [monthEnd, setMonthEnd] = useState(format(endOfMonth(today), 'yyyy-MM-dd'));

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<AttendanceStatus | 'all'>('all');
  const [empFilter, setEmpFilter] = useState('__none__');

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<AttendanceRecord | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<AttendanceRecord | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const from = page * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;
    const [{ data: rData, count }, { data: pData }] = await Promise.all([
      supabase.from('attendance_records')
        .select('*', { count: 'exact' })
        .gte('work_date', monthStart)
        .lte('work_date', monthEnd)
        .order('work_date', { ascending: false })
        .range(from, to),
      supabase.from('profiles').select('id, full_name').neq('is_anonymised', true).order('full_name'),
    ]);
    setRecords(rData ?? []);
    setTotalCount(count ?? 0);
    setProfiles(pData ?? []);
    setLoading(false);
  }, [monthStart, monthEnd, page]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('company_settings')
        .select('late_threshold_time')
        .eq('id', '00000000-0000-0000-0000-000000000001')
        .maybeSingle();
      const raw = (data as any)?.late_threshold_time as string | undefined;
      if (raw) setLateThreshold(raw.slice(0, 5));
    })();
  }, []);

  const empName = (id: string) => profiles.find(p => p.id === id)?.full_name ?? '—';

  function openCreate() {
    setEditing(null);
    setForm({ ...EMPTY_FORM });
    setDialogOpen(true);
  }

  function openEdit(r: AttendanceRecord) {
    setEditing(r);
    setForm({
      employee_id: r.employee_id,
      work_date: r.work_date,
      clock_in: r.clock_in ?? '',
      clock_out: r.clock_out ?? '',
      status: r.status,
      overtime_minutes: String(r.overtime_minutes),
      notes: r.notes ?? '',
    });
    setDialogOpen(true);
  }

  async function handleSave() {
    if (!form.employee_id || form.employee_id === '__none__') {
      toast({ title: 'Please select an employee', variant: 'destructive' }); return;
    }
    if (!form.work_date) {
      toast({ title: 'Work date is required', variant: 'destructive' }); return;
    }
    setSaving(true);
    const payload = {
      employee_id: form.employee_id,
      work_date: form.work_date,
      clock_in: form.clock_in || null,
      clock_out: form.clock_out || null,
      status: form.status,
      overtime_minutes: parseInt(form.overtime_minutes) || 0,
      notes: form.notes.trim() || null,
      recorded_by: user?.id,
    };

    const { error } = editing
      ? await supabase.from('attendance_records').update(payload).eq('id', editing.id)
      : await supabase.from('attendance_records').upsert(payload, { onConflict: 'employee_id,work_date' });

    setSaving(false);
    if (error) { toast({ title: 'Save failed', description: error.message, variant: 'destructive' }); return; }
    const name = empName(form.employee_id);
    await logAudit(
      editing ? 'attendance_updated' : 'attendance_recorded',
      `${editing ? 'Attendance updated' : 'Attendance recorded'} for ${name} on ${form.work_date} (${STATUS_CONFIG[form.status].label})`,
      profile,
    );
    toast({ title: editing ? 'Record updated' : 'Attendance recorded' });
    setDialogOpen(false);
    load();
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    const { error } = await supabase.from('attendance_records').delete().eq('id', deleteTarget.id);
    if (error) {
      toast({ title: 'Delete failed', description: error.message, variant: 'destructive' });
    } else {
      const name = empName(deleteTarget.employee_id);
      await logAudit(
        'attendance_deleted',
        `Attendance record deleted for ${name} on ${deleteTarget.work_date}`,
        profile,
      );
      toast({ title: 'Record deleted' });
      load();
    }
    setDeleteTarget(null);
  }

  function shiftMonth(delta: number) {
    const current = parseISO(monthStart);
    const next = new Date(current.getFullYear(), current.getMonth() + delta, 1);
    setMonthStart(format(startOfMonth(next), 'yyyy-MM-dd'));
    setMonthEnd(format(endOfMonth(next), 'yyyy-MM-dd'));
    setPage(0);
  }

  const filtered = records.filter(r => {
    const emp = profiles.find(p => p.id === r.employee_id);
    const term = search.toLowerCase();
    const matchSearch = !term || (emp?.full_name ?? '').toLowerCase().includes(term);
    const matchStatus = statusFilter === 'all' || r.status === statusFilter;
    const matchEmp = empFilter === '__none__' || r.employee_id === empFilter;
    return matchSearch && matchStatus && matchEmp;
  });

  function exportCSV() {
    const rows = filtered.map(r => {
      const emp = profiles.find(p => p.id === r.employee_id);
      return [
        emp?.full_name ?? r.employee_id,
        r.work_date,
        STATUS_CONFIG[r.status].label,
        r.clock_in ?? '',
        r.clock_out ?? '',
        r.overtime_minutes,
        r.notes ?? '',
      ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(',');
    });
    const csv = ['Employee,Date,Status,Clock In,Clock Out,Overtime (min),Notes', ...rows].join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = `attendance-${monthStart.slice(0, 7)}.csv`; a.click();
  }

  // Summary counts for the current filtered month
  const counts: Record<string, number> = {};
  for (const r of records) {
    counts[r.status] = (counts[r.status] ?? 0) + 1;
  }
  const totalOvertimeHours = records.reduce((sum, r) => sum + r.overtime_minutes, 0) / 60;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  // --- Per-month analytics summary ---
  const analytics = useMemo(() => {
    const presentDays = records.filter(r => r.status === 'present').length;
    const lateDays = records.filter(r => r.status === 'late').length;
    const absentDays = records.filter(r => r.status === 'absent').length;
    const totalOTMinutes = records.reduce((sum, r) => sum + r.overtime_minutes, 0);
    const avgOTMinutes = records.length > 0 ? totalOTMinutes / records.length : 0;

    const attendedStatuses: AttendanceStatus[] = ['present', 'late', 'half_day', 'remote'];
    const attendedCount = records.filter(r => attendedStatuses.includes(r.status)).length;
    const attendanceRate = records.length > 0 ? (attendedCount / records.length) * 100 : 0;

    return { presentDays, lateDays, absentDays, avgOTMinutes, attendanceRate };
  }, [records]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Attendance"
        description="Daily attendance records and timesheet management"
        actions={
          <Button onClick={openCreate} className="gap-2">
            <Plus className="h-4 w-4" /> Record Attendance
          </Button>
        }
      />

      {/* Employee-facing clock in / out with geo + selfie */}
      <div className="max-w-md">
        <ClockInWidget lateThreshold={lateThreshold} />
      </div>

      {/* Month navigator */}
      <div className="flex items-center gap-3">
        <Button variant="outline" size="sm" onClick={() => shiftMonth(-1)}>← Prev</Button>
        <span className="font-medium min-w-[120px] text-center text-foreground">
          {format(parseISO(monthStart), 'MMMM yyyy')}
        </span>
        <Button variant="outline" size="sm" onClick={() => shiftMonth(1)}>Next →</Button>
      </div>

      {/* Summary cards */}
      <div className="kd-stat-grid">
        {([
          { status: 'present',  tone: 'success' },
          { status: 'late',     tone: 'warning' },
          { status: 'absent',   tone: 'danger' },
          { status: 'on_leave', tone: 'default' },
        ] as { status: AttendanceStatus; tone: 'success' | 'warning' | 'danger' | 'default' }[]).map(({ status: s, tone }) => {
          const cfg = STATUS_CONFIG[s];
          return (
            <StatCard
              key={s}
              title={cfg.label}
              value={counts[s] ?? 0}
              subtitle="records"
              icon={cfg.icon as any}
              tone={tone}
            />
          );
        })}
      </div>
      {totalOvertimeHours > 0 && (
        <p className="text-sm text-muted-foreground">Total overtime this period: <strong className="text-foreground">{totalOvertimeHours.toFixed(1)} hrs</strong></p>
      )}

      {/* Monthly analytics summary */}
      <div className="kd-stat-grid">
        <StatCard
          title="Present Days"
          value={analytics.presentDays}
          subtitle="this month"
          icon={CheckCircle2 as any}
          tone="success"
        />
        <StatCard
          title="Late Arrivals"
          value={analytics.lateDays}
          subtitle="this month"
          icon={AlertTriangle as any}
          tone="warning"
        />
        <StatCard
          title="Absent Days"
          value={analytics.absentDays}
          subtitle="this month"
          icon={XCircle as any}
          tone="danger"
        />
        <StatCard
          title="Avg Overtime"
          value={`${Math.round(analytics.avgOTMinutes)} min`}
          subtitle="per record this month"
          icon={Clock as any}
          tone="default"
        />
      </div>

      {/* Attendance rate */}
      <div className="rounded-xl border border-border/60 bg-card px-4 py-3 flex items-center gap-3">
        <CheckCircle2 className="h-5 w-5 text-emerald-500" />
        <p className="text-sm text-muted-foreground">
          Overall attendance rate:{' '}
          <strong className="text-foreground text-base">{analytics.attendanceRate.toFixed(1)}%</strong>
          <span className="ml-1.5 text-xs">(present + late + half day + remote)</span>
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Search employee…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Select value={statusFilter} onValueChange={v => setStatusFilter(v as AttendanceStatus | 'all')}>
          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            {(Object.keys(STATUS_CONFIG) as AttendanceStatus[]).map(s => (
              <SelectItem key={s} value={s}>{STATUS_CONFIG[s].label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={empFilter} onValueChange={setEmpFilter}>
          <SelectTrigger className="w-48"><SelectValue placeholder="All Employees" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">All Employees</SelectItem>
            {profiles.map(p => <SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" onClick={exportCSV} className="gap-2">
          <Download className="h-4 w-4" /> Export
        </Button>
      </div>

      {/* Records table */}
      {loading ? (
        <TableSkeleton rows={6} cols={7} />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Clock}
          title="No attendance records for this period"
          description="Record attendance to start building this month's timesheet."
          action={
            <Button className="gap-2" onClick={openCreate}><Plus className="h-4 w-4" /> Record Attendance</Button>
          }
        />
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden md:block rounded-xl border border-border/60 bg-card overflow-x-auto">
            <table className="w-full text-sm min-w-[640px]">
              <thead className="bg-muted/50">
                <tr className="border-b border-border/50">
                  <th className="text-left px-3 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Employee</th>
                  <th className="text-left px-3 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Date</th>
                  <th className="text-left px-3 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Status</th>
                  <th className="text-left px-3 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Clock In</th>
                  <th className="text-left px-3 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Clock Out</th>
                  <th className="text-left px-3 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">OT (min)</th>
                  <th className="text-right px-3 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {filtered.map(r => {
                  const cfg = STATUS_CONFIG[r.status];
                  return (
                    <tr key={r.id} className="hover:bg-muted/40 transition-colors">
                      <td className="py-3 px-3 font-medium text-foreground">{empName(r.employee_id)}</td>
                      <td className="py-3 px-3 text-muted-foreground">{format(parseISO(r.work_date), 'EEE, dd MMM')}</td>
                      <td className="py-3 px-3"><Badge variant={cfg.variant}>{cfg.label}</Badge></td>
                      <td className="py-3 px-3 text-muted-foreground tabular-nums">{r.clock_in ?? '—'}</td>
                      <td className="py-3 px-3 text-muted-foreground tabular-nums">{r.clock_out ?? '—'}</td>
                      <td className="py-3 px-3 text-muted-foreground tabular-nums">{r.overtime_minutes > 0 ? r.overtime_minutes : '—'}</td>
                      <td className="py-3 px-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="ghost" size="icon" onClick={() => openEdit(r)} aria-label="Edit record"><Pencil className="h-4 w-4" /></Button>
                          <Button variant="ghost" size="icon" onClick={() => setDeleteTarget(r)} aria-label="Delete record"><Trash2 className="h-4 w-4 text-destructive" /></Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile card list */}
          <div className="md:hidden divide-y divide-border/60">
            {filtered.map(r => {
              const cfg = STATUS_CONFIG[r.status];
              return (
                <MobileCard key={r.id} className="rounded-none border-0 shadow-none bg-transparent backdrop-blur-none">
                  <MobileCardHeader>
                    <MobileCardTitle>{empName(r.employee_id)}</MobileCardTitle>
                    <MobileCardMeta>{format(parseISO(r.work_date), 'EEE, dd MMM')}</MobileCardMeta>
                  </MobileCardHeader>
                  <MobileCardRow label="Status"><Badge variant={cfg.variant}>{cfg.label}</Badge></MobileCardRow>
                  <MobileCardRow label="Clock In">{r.clock_in ?? '—'}</MobileCardRow>
                  <MobileCardRow label="Clock Out">{r.clock_out ?? '—'}</MobileCardRow>
                  {r.overtime_minutes > 0 && (
                    <MobileCardRow label="OT (min)">{r.overtime_minutes}</MobileCardRow>
                  )}
                  <MobileCardFooter>
                    <Button size="sm" variant="outline" className="flex-1 h-9" onClick={() => openEdit(r)}>
                      <Pencil className="h-4 w-4 mr-1.5" /> Edit
                    </Button>
                    <Button size="sm" variant="ghost" className="h-9 px-3 text-destructive" onClick={() => setDeleteTarget(r)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </MobileCardFooter>
                </MobileCard>
              );
            })}
          </div>

          <Pagination
            page={page}
            totalPages={totalPages}
            totalItems={totalCount}
            pageSize={PAGE_SIZE}
            onPageChange={setPage}
            hasPrev={page > 0}
            hasNext={page < totalPages - 1}
          />
        </>
      )}

      {/* Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit Record' : 'Record Attendance'}</DialogTitle>
            <DialogDescription>Log daily attendance for an employee</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="kd-label">Employee *</Label>
              <Select value={form.employee_id} onValueChange={v => setForm(f => ({ ...f, employee_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Select employee" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">— Select employee —</SelectItem>
                  {profiles.map(p => <SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="kd-label">Work Date *</Label>
                <Input type="date" value={form.work_date} onChange={e => setForm(f => ({ ...f, work_date: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label className="kd-label">Status</Label>
                <Select value={form.status} onValueChange={v => setForm(f => ({ ...f, status: v as AttendanceStatus }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(Object.keys(STATUS_CONFIG) as AttendanceStatus[]).map(s => (
                      <SelectItem key={s} value={s}>{STATUS_CONFIG[s].label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="kd-label">Clock In</Label>
                <Input type="time" value={form.clock_in} onChange={e => setForm(f => ({ ...f, clock_in: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label className="kd-label">Clock Out</Label>
                <Input type="time" value={form.clock_out} onChange={e => setForm(f => ({ ...f, clock_out: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="kd-label">Overtime (minutes)</Label>
              <Input type="number" min="0" value={form.overtime_minutes} onChange={e => setForm(f => ({ ...f, overtime_minutes: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label className="kd-label">Notes</Label>
              <Textarea rows={2} placeholder="Any remarks…" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : editing ? 'Save Changes' : 'Record'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={o => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete attendance record?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget ? `${empName(deleteTarget.employee_id)} — ${format(parseISO(deleteTarget.work_date), 'dd MMM yyyy')}` : ''} will be permanently removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
