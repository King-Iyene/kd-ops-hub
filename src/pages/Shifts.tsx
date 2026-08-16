import { useEffect, useState, useCallback, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import { format, parseISO, startOfWeek, endOfWeek, addDays, addWeeks, subWeeks } from 'date-fns';
import { usePageTitle } from '@/hooks/usePageTitle';
import { PageHeader } from '@/components/ui-kit/PageHeader';
import { StatCard } from '@/components/ui-kit/StatCard';
import { EmptyState } from '@/components/ui-kit/EmptyState';
import { TableSkeleton } from '@/components/ui-kit/TableSkeleton';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import {
  Plus, ChevronLeft, ChevronRight, CalendarDays, Clock,
  Users, AlertTriangle, XCircle, Pencil, Trash2,
} from 'lucide-react';

type ShiftStatus = 'scheduled' | 'confirmed' | 'swap_requested' | 'swapped' | 'cancelled';

interface ShiftDefinition {
  id: string;
  name: string;
  start_time: string;
  end_time: string;
  break_minutes: number;
  color: string;
  is_active: boolean;
  created_at: string;
}

interface ShiftAssignment {
  id: string;
  employee_id: string;
  shift_id: string;
  work_date: string;
  status: ShiftStatus;
  swap_with_id: string | null;
  notes: string | null;
  created_at: string;
}

interface Profile {
  id: string;
  full_name: string;
}

const STATUS_VARIANT: Record<ShiftStatus, 'secondary' | 'default' | 'outline' | 'destructive'> = {
  scheduled: 'secondary',
  confirmed: 'default',
  swap_requested: 'outline',
  swapped: 'outline',
  cancelled: 'destructive',
};

const STATUS_LABEL: Record<ShiftStatus, string> = {
  scheduled: 'Scheduled',
  confirmed: 'Confirmed',
  swap_requested: 'Swap Requested',
  swapped: 'Swapped',
  cancelled: 'Cancelled',
};

const TAB_TRIGGER_CLASS =
  'text-[12.5px] px-3 h-9 rounded-none border-b-2 border-transparent text-muted-foreground data-[state=active]:border-foreground data-[state=active]:text-foreground data-[state=active]:font-semibold data-[state=active]:bg-transparent data-[state=active]:shadow-none';

const EMPTY_ASSIGNMENT_FORM = {
  employee_id: '__none__',
  shift_id: '__none__',
  work_date: format(new Date(), 'yyyy-MM-dd'),
  status: 'scheduled' as ShiftStatus,
  notes: '',
};

const EMPTY_SHIFT_FORM = {
  name: '',
  start_time: '08:00',
  end_time: '17:00',
  break_minutes: '60',
  color: '#3b82f6',
};

export default function Shifts() {
  usePageTitle('Shifts');
  const { user } = useAuthStore();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [shiftDefs, setShiftDefs] = useState<ShiftDefinition[]>([]);
  const [assignments, setAssignments] = useState<ShiftAssignment[]>([]);
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));

  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [editingAssignment, setEditingAssignment] = useState<ShiftAssignment | null>(null);
  const [assignForm, setAssignForm] = useState({ ...EMPTY_ASSIGNMENT_FORM });
  const [savingAssignment, setSavingAssignment] = useState(false);

  const [shiftDialogOpen, setShiftDialogOpen] = useState(false);
  const [editingShift, setEditingShift] = useState<ShiftDefinition | null>(null);
  const [shiftForm, setShiftForm] = useState({ ...EMPTY_SHIFT_FORM });
  const [savingShift, setSavingShift] = useState(false);

  const weekEnd = useMemo(() => endOfWeek(weekStart, { weekStartsOn: 1 }), [weekStart]);
  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);

  const shiftMap = useMemo(() => {
    const m = new Map<string, ShiftDefinition>();
    for (const s of shiftDefs) m.set(s.id, s);
    return m;
  }, [shiftDefs]);

  const assignmentGrid = useMemo(() => {
    const grid = new Map<string, ShiftAssignment>();
    for (const a of assignments) {
      grid.set(`${a.employee_id}::${a.work_date}`, a);
    }
    return grid;
  }, [assignments]);

  const stats = useMemo(() => {
    const activeTypes = shiftDefs.filter(s => s.is_active).length;
    const thisWeek = assignments.length;
    const swapRequests = assignments.filter(a => a.status === 'swap_requested').length;
    const cancelled = assignments.filter(a => a.status === 'cancelled').length;
    return { activeTypes, thisWeek, swapRequests, cancelled };
  }, [shiftDefs, assignments]);

  const loadData = useCallback(async () => {
    setLoading(true);
    const ws = format(weekStart, 'yyyy-MM-dd');
    const we = format(weekEnd, 'yyyy-MM-dd');
    const [{ data: defs }, { data: assigns }, { data: profs }] = await Promise.all([
      supabase.from('shift_definitions').select('*').order('name'),
      supabase.from('shift_assignments').select('*').gte('work_date', ws).lte('work_date', we).order('work_date'),
      supabase.from('profiles').select('id, full_name').neq('is_anonymised', true).order('full_name'),
    ]);
    setShiftDefs(defs ?? []);
    setAssignments(assigns ?? []);
    setProfiles(profs ?? []);
    setLoading(false);
  }, [weekStart, weekEnd]);

  useEffect(() => { loadData(); }, [loadData]);

  const openAssignDialog = (employeeId?: string, date?: Date) => {
    setEditingAssignment(null);
    setAssignForm({
      ...EMPTY_ASSIGNMENT_FORM,
      employee_id: employeeId ?? '__none__',
      work_date: date ? format(date, 'yyyy-MM-dd') : format(new Date(), 'yyyy-MM-dd'),
    });
    setAssignDialogOpen(true);
  };

  const openEditAssignment = (a: ShiftAssignment) => {
    setEditingAssignment(a);
    setAssignForm({
      employee_id: a.employee_id,
      shift_id: a.shift_id,
      work_date: a.work_date,
      status: a.status,
      notes: a.notes ?? '',
    });
    setAssignDialogOpen(true);
  };

  const saveAssignment = async () => {
    if (assignForm.employee_id === '__none__' || assignForm.shift_id === '__none__') {
      toast({ title: 'Missing fields', description: 'Please select an employee and shift type.', variant: 'destructive' });
      return;
    }
    setSavingAssignment(true);
    const payload = {
      employee_id: assignForm.employee_id,
      shift_id: assignForm.shift_id,
      work_date: assignForm.work_date,
      status: assignForm.status,
      notes: assignForm.notes || null,
    };

    const { error } = editingAssignment
      ? await supabase.from('shift_assignments').update(payload).eq('id', editingAssignment.id)
      : await supabase.from('shift_assignments').insert(payload);

    setSavingAssignment(false);
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: editingAssignment ? 'Assignment updated' : 'Shift assigned' });
    setAssignDialogOpen(false);
    loadData();
  };

  const deleteAssignment = async (id: string) => {
    const { error } = await supabase.from('shift_assignments').delete().eq('id', id);
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: 'Assignment removed' });
    loadData();
  };

  const openShiftDialog = (shift?: ShiftDefinition) => {
    if (shift) {
      setEditingShift(shift);
      setShiftForm({
        name: shift.name,
        start_time: shift.start_time.slice(0, 5),
        end_time: shift.end_time.slice(0, 5),
        break_minutes: String(shift.break_minutes),
        color: shift.color,
      });
    } else {
      setEditingShift(null);
      setShiftForm({ ...EMPTY_SHIFT_FORM });
    }
    setShiftDialogOpen(true);
  };

  const saveShiftDef = async () => {
    if (!shiftForm.name.trim()) {
      toast({ title: 'Name required', variant: 'destructive' });
      return;
    }
    setSavingShift(true);
    const payload = {
      name: shiftForm.name.trim(),
      start_time: shiftForm.start_time,
      end_time: shiftForm.end_time,
      break_minutes: parseInt(shiftForm.break_minutes, 10) || 0,
      color: shiftForm.color,
    };

    const { error } = editingShift
      ? await supabase.from('shift_definitions').update(payload).eq('id', editingShift.id)
      : await supabase.from('shift_definitions').insert(payload);

    setSavingShift(false);
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: editingShift ? 'Shift type updated' : 'Shift type created' });
    setShiftDialogOpen(false);
    loadData();
  };

  const toggleShiftActive = async (shift: ShiftDefinition) => {
    const { error } = await supabase
      .from('shift_definitions')
      .update({ is_active: !shift.is_active })
      .eq('id', shift.id);
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: `${shift.name} ${shift.is_active ? 'deactivated' : 'activated'}` });
    loadData();
  };

  const statusBadge = (status: ShiftStatus) => {
    const className =
      status === 'swap_requested' ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 border-amber-200 dark:border-amber-800' :
      status === 'swapped' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300 border-blue-200 dark:border-blue-800' :
      undefined;

    return (
      <Badge variant={STATUS_VARIANT[status]} className={className}>
        {STATUS_LABEL[status]}
      </Badge>
    );
  };

  const profileName = (id: string) => profiles.find(p => p.id === id)?.full_name ?? 'Unknown';

  return (
    <div className="space-y-6 p-6">
      <PageHeader title="Shifts" description="Manage shift definitions and weekly roster assignments" icon={Clock} />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Active Shift Types" value={stats.activeTypes} icon={Clock} tone="primary" />
        <StatCard title="Assignments This Week" value={stats.thisWeek} icon={Users} tone="default" />
        <StatCard title="Swap Requests" value={stats.swapRequests} icon={AlertTriangle} tone="warning" />
        <StatCard title="Cancelled" value={stats.cancelled} icon={XCircle} tone="danger" />
      </div>

      <Tabs defaultValue="roster" className="space-y-4">
        <TabsList className="bg-transparent border-b w-full justify-start rounded-none p-0">
          <TabsTrigger value="roster" className={TAB_TRIGGER_CLASS}>Roster</TabsTrigger>
          <TabsTrigger value="shift-types" className={TAB_TRIGGER_CLASS}>Shift Types</TabsTrigger>
        </TabsList>

        <TabsContent value="roster" className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Button variant="outline" size="icon" onClick={() => setWeekStart(prev => subWeeks(prev, 1))}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm font-medium min-w-[200px] text-center">
                {format(weekStart, 'dd MMM yyyy')} &ndash; {format(weekEnd, 'dd MMM yyyy')}
              </span>
              <Button variant="outline" size="icon" onClick={() => setWeekStart(prev => addWeeks(prev, 1))}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
            <Button size="sm" onClick={() => openAssignDialog()}>
              <Plus className="h-4 w-4 mr-1" /> Assign Shift
            </Button>
          </div>

          {loading ? (
            <TableSkeleton columns={8} rows={5} />
          ) : profiles.length === 0 ? (
            <EmptyState title="No employees found" description="Add employees to start scheduling shifts." icon={Users} />
          ) : (
            <Card>
              <CardContent className="p-0 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left p-3 font-medium text-muted-foreground sticky left-0 bg-card min-w-[160px]">Employee</th>
                      {weekDays.map(day => (
                        <th key={day.toISOString()} className="text-center p-3 font-medium text-muted-foreground min-w-[120px]">
                          <div>{format(day, 'EEE')}</div>
                          <div className="text-xs">{format(day, 'dd MMM')}</div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {profiles.map(emp => (
                      <tr key={emp.id} className="border-b last:border-b-0 hover:bg-muted/30">
                        <td className="p-3 font-medium sticky left-0 bg-card">{emp.full_name}</td>
                        {weekDays.map(day => {
                          const dateStr = format(day, 'yyyy-MM-dd');
                          const assignment = assignmentGrid.get(`${emp.id}::${dateStr}`);
                          const shift = assignment ? shiftMap.get(assignment.shift_id) : null;
                          return (
                            <td
                              key={dateStr}
                              className="p-2 text-center cursor-pointer hover:bg-muted/50 transition-colors"
                              onClick={() => assignment ? openEditAssignment(assignment) : openAssignDialog(emp.id, day)}
                            >
                              {assignment && shift ? (
                                <div
                                  className="rounded-md px-2 py-1.5 text-xs font-medium text-white"
                                  style={{ backgroundColor: shift.color }}
                                >
                                  <div>{shift.name}</div>
                                  <div className="opacity-80">{shift.start_time.slice(0, 5)}&ndash;{shift.end_time.slice(0, 5)}</div>
                                  <div className="mt-1">{statusBadge(assignment.status)}</div>
                                </div>
                              ) : (
                                <div className="text-muted-foreground/40 text-xs py-2">+</div>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="shift-types" className="space-y-4">
          <div className="flex justify-end">
            <Button size="sm" onClick={() => openShiftDialog()}>
              <Plus className="h-4 w-4 mr-1" /> New Shift Type
            </Button>
          </div>

          {loading ? (
            <TableSkeleton columns={6} rows={4} />
          ) : shiftDefs.length === 0 ? (
            <EmptyState
              title="No shift types defined"
              description="Create shift types to start building rosters."
              icon={Clock}
              action={<Button size="sm" onClick={() => openShiftDialog()}><Plus className="h-4 w-4 mr-1" /> Create Shift Type</Button>}
            />
          ) : (
            <Card>
              <CardContent className="p-0 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left p-3 font-medium text-muted-foreground">Name</th>
                      <th className="text-left p-3 font-medium text-muted-foreground">Start Time</th>
                      <th className="text-left p-3 font-medium text-muted-foreground">End Time</th>
                      <th className="text-left p-3 font-medium text-muted-foreground">Break (min)</th>
                      <th className="text-left p-3 font-medium text-muted-foreground">Color</th>
                      <th className="text-left p-3 font-medium text-muted-foreground">Active</th>
                      <th className="text-right p-3 font-medium text-muted-foreground">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shiftDefs.map(shift => (
                      <tr key={shift.id} className="border-b last:border-b-0 hover:bg-muted/30">
                        <td className="p-3 font-medium">{shift.name}</td>
                        <td className="p-3">{shift.start_time.slice(0, 5)}</td>
                        <td className="p-3">{shift.end_time.slice(0, 5)}</td>
                        <td className="p-3">{shift.break_minutes}</td>
                        <td className="p-3">
                          <div className="flex items-center gap-2">
                            <div className="w-6 h-6 rounded border" style={{ backgroundColor: shift.color }} />
                            <span className="text-xs text-muted-foreground">{shift.color}</span>
                          </div>
                        </td>
                        <td className="p-3">
                          <Badge
                            variant={shift.is_active ? 'default' : 'secondary'}
                            className="cursor-pointer"
                            onClick={() => toggleShiftActive(shift)}
                          >
                            {shift.is_active ? 'Active' : 'Inactive'}
                          </Badge>
                        </td>
                        <td className="p-3 text-right">
                          <Button variant="ghost" size="icon" onClick={() => openShiftDialog(shift)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={assignDialogOpen} onOpenChange={setAssignDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingAssignment ? 'Edit Shift Assignment' : 'Assign Shift'}</DialogTitle>
            <DialogDescription>
              {editingAssignment ? 'Update this shift assignment.' : 'Assign an employee to a shift for a specific date.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Employee</Label>
              <Select value={assignForm.employee_id} onValueChange={v => setAssignForm(f => ({ ...f, employee_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Select employee" /></SelectTrigger>
                <SelectContent>
                  {profiles.map(p => (
                    <SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Shift Type</Label>
              <Select value={assignForm.shift_id} onValueChange={v => setAssignForm(f => ({ ...f, shift_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Select shift" /></SelectTrigger>
                <SelectContent>
                  {shiftDefs.filter(s => s.is_active).map(s => (
                    <SelectItem key={s.id} value={s.id}>
                      <span className="flex items-center gap-2">
                        <span className="w-3 h-3 rounded-full inline-block" style={{ backgroundColor: s.color }} />
                        {s.name} ({s.start_time.slice(0, 5)}&ndash;{s.end_time.slice(0, 5)})
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Date</Label>
              <Input type="date" value={assignForm.work_date} onChange={e => setAssignForm(f => ({ ...f, work_date: e.target.value }))} />
            </div>
            {editingAssignment && (
              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={assignForm.status} onValueChange={v => setAssignForm(f => ({ ...f, status: v as ShiftStatus }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(Object.keys(STATUS_LABEL) as ShiftStatus[]).map(s => (
                      <SelectItem key={s} value={s}>{STATUS_LABEL[s]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-2">
              <Label>Notes</Label>
              <Input value={assignForm.notes} onChange={e => setAssignForm(f => ({ ...f, notes: e.target.value }))} placeholder="Optional notes" />
            </div>
          </div>
          <DialogFooter className="gap-2">
            {editingAssignment && (
              <Button
                variant="destructive"
                size="sm"
                onClick={() => { deleteAssignment(editingAssignment.id); setAssignDialogOpen(false); }}
              >
                <Trash2 className="h-4 w-4 mr-1" /> Remove
              </Button>
            )}
            <Button onClick={saveAssignment} disabled={savingAssignment}>
              {savingAssignment ? 'Saving...' : editingAssignment ? 'Update' : 'Assign'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={shiftDialogOpen} onOpenChange={setShiftDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingShift ? 'Edit Shift Type' : 'New Shift Type'}</DialogTitle>
            <DialogDescription>
              {editingShift ? 'Update this shift definition.' : 'Define a new shift type for your roster.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input value={shiftForm.name} onChange={e => setShiftForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Morning Shift" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Start Time</Label>
                <Input type="time" value={shiftForm.start_time} onChange={e => setShiftForm(f => ({ ...f, start_time: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>End Time</Label>
                <Input type="time" value={shiftForm.end_time} onChange={e => setShiftForm(f => ({ ...f, end_time: e.target.value }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Break (minutes)</Label>
                <Input type="number" min="0" value={shiftForm.break_minutes} onChange={e => setShiftForm(f => ({ ...f, break_minutes: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Color</Label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={shiftForm.color}
                    onChange={e => setShiftForm(f => ({ ...f, color: e.target.value }))}
                    className="w-10 h-10 rounded border cursor-pointer"
                  />
                  <Input value={shiftForm.color} onChange={e => setShiftForm(f => ({ ...f, color: e.target.value }))} className="flex-1" />
                </div>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={saveShiftDef} disabled={savingShift}>
              {savingShift ? 'Saving...' : editingShift ? 'Update' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
