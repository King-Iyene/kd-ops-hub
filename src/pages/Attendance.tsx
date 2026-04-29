import { useEffect, useState, useCallback } from 'react';
import {
  Plus, Search, Download, Pencil, Trash2, Clock,
  CheckCircle2, XCircle, AlertTriangle, CalendarDays,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import { format, parseISO, startOfMonth, endOfMonth } from 'date-fns';
import { usePageTitle } from '@/hooks/usePageTitle';
import { PageHeader } from '@/components/ui-kit/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
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
  const { user } = useAuthStore();
  const { toast } = useToast();

  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);

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
    const [{ data: rData }, { data: pData }] = await Promise.all([
      supabase.from('attendance_records')
        .select('*')
        .gte('work_date', monthStart)
        .lte('work_date', monthEnd)
        .order('work_date', { ascending: false }),
      supabase.from('profiles').select('id, full_name').order('full_name'),
    ]);
    setRecords(rData ?? []);
    setProfiles(pData ?? []);
    setLoading(false);
  }, [monthStart, monthEnd]);

  useEffect(() => { load(); }, [load]);

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
    toast({ title: editing ? 'Record updated' : 'Attendance recorded' });
    setDialogOpen(false);
    load();
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    const { error } = await supabase.from('attendance_records').delete().eq('id', deleteTarget.id);
    if (error) { toast({ title: 'Delete failed', description: error.message, variant: 'destructive' }); }
    else { toast({ title: 'Record deleted' }); load(); }
    setDeleteTarget(null);
  }

  function shiftMonth(delta: number) {
    const current = parseISO(monthStart);
    const next = new Date(current.getFullYear(), current.getMonth() + delta, 1);
    setMonthStart(format(startOfMonth(next), 'yyyy-MM-dd'));
    setMonthEnd(format(endOfMonth(next), 'yyyy-MM-dd'));
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

  const empName = (id: string) => profiles.find(p => p.id === id)?.full_name ?? '—';

  // Summary counts for the current filtered month
  const counts: Record<string, number> = {};
  for (const r of records) {
    counts[r.status] = (counts[r.status] ?? 0) + 1;
  }
  const totalOvertimeHours = records.reduce((sum, r) => sum + r.overtime_minutes, 0) / 60;

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

      {/* Month navigator */}
      <div className="flex items-center gap-3">
        <Button variant="outline" size="sm" onClick={() => shiftMonth(-1)}>← Prev</Button>
        <span className="font-medium min-w-[120px] text-center">
          {format(parseISO(monthStart), 'MMMM yyyy')}
        </span>
        <Button variant="outline" size="sm" onClick={() => shiftMonth(1)}>Next →</Button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {(['present', 'late', 'absent', 'on_leave'] as AttendanceStatus[]).map(s => {
          const cfg = STATUS_CONFIG[s];
          const Icon = cfg.icon;
          return (
            <Card key={s}>
              <CardContent className="pt-4 pb-4">
                <div className="flex items-center gap-2 text-muted-foreground mb-1">
                  <Icon className="h-4 w-4" /><span className="text-xs">{cfg.label}</span>
                </div>
                <p className="text-2xl font-semibold">{counts[s] ?? 0}</p>
                <p className="text-xs text-muted-foreground">records</p>
              </CardContent>
            </Card>
          );
        })}
      </div>
      {totalOvertimeHours > 0 && (
        <p className="text-sm text-muted-foreground">Total overtime this period: <strong>{totalOvertimeHours.toFixed(1)} hrs</strong></p>
      )}

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
        <p className="text-muted-foreground text-sm">Loading…</p>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Clock className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p>No attendance records for this period.</p>
          <Button className="mt-4 gap-2" onClick={openCreate}><Plus className="h-4 w-4" /> Record Attendance</Button>
        </div>
      ) : (
        <div className="rounded-md border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left px-4 py-3 font-medium">Employee</th>
                <th className="text-left px-4 py-3 font-medium">Date</th>
                <th className="text-left px-4 py-3 font-medium">Status</th>
                <th className="text-left px-4 py-3 font-medium">Clock In</th>
                <th className="text-left px-4 py-3 font-medium">Clock Out</th>
                <th className="text-left px-4 py-3 font-medium">OT (min)</th>
                <th className="text-right px-4 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered.map(r => {
                const cfg = STATUS_CONFIG[r.status];
                return (
                  <tr key={r.id} className="hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-3 font-medium">{empName(r.employee_id)}</td>
                    <td className="px-4 py-3 text-muted-foreground">{format(parseISO(r.work_date), 'EEE, dd MMM')}</td>
                    <td className="px-4 py-3"><Badge variant={cfg.variant}>{cfg.label}</Badge></td>
                    <td className="px-4 py-3 text-muted-foreground">{r.clock_in ?? '—'}</td>
                    <td className="px-4 py-3 text-muted-foreground">{r.clock_out ?? '—'}</td>
                    <td className="px-4 py-3 text-muted-foreground">{r.overtime_minutes > 0 ? r.overtime_minutes : '—'}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="icon" onClick={() => openEdit(r)}><Pencil className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="icon" onClick={() => setDeleteTarget(r)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit Record' : 'Record Attendance'}</DialogTitle>
            <DialogDescription>Log daily attendance for an employee</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1">
              <Label>Employee *</Label>
              <Select value={form.employee_id} onValueChange={v => setForm(f => ({ ...f, employee_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Select employee" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">— Select employee —</SelectItem>
                  {profiles.map(p => <SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Work Date *</Label>
                <Input type="date" value={form.work_date} onChange={e => setForm(f => ({ ...f, work_date: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>Status</Label>
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
              <div className="space-y-1">
                <Label>Clock In</Label>
                <Input type="time" value={form.clock_in} onChange={e => setForm(f => ({ ...f, clock_in: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>Clock Out</Label>
                <Input type="time" value={form.clock_out} onChange={e => setForm(f => ({ ...f, clock_out: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Overtime (minutes)</Label>
              <Input type="number" min="0" value={form.overtime_minutes} onChange={e => setForm(f => ({ ...f, overtime_minutes: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>Notes</Label>
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
