import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Mail, Phone, CalendarDays, Save, Loader2, Briefcase,
  FileText, Shield, Trash2, TrendingUp, TrendingDown, Plus, Download,
  ChevronDown, AlertTriangle,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import { logAudit } from '@/lib/audit';
import { roleBadgeClass, roleLabel } from '@/lib/roles';
import { formatDate, formatDateTime, formatNaira } from '@/lib/format';
import { displayName, initialsOf } from '@/lib/name';
import { calculatePAYE } from '@/lib/tax';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { PermissionsEditor, type PermissionsMap } from '@/components/PermissionsEditor';
import { BankAccountField, type BankAccountValue } from '@/components/BankAccountField';

interface EmployeeData {
  id: string;
  full_name: string;
  first_name: string | null;
  last_name: string | null;
  email: string;
  phone: string | null;
  role: string;
  status: string;
  job_title: string | null;
  salary_ngn: number;
  created_at: string;
  next_of_kin_name: string | null;
  next_of_kin_phone: string | null;
  next_of_kin_relationship: string | null;
  bank_name: string | null;
  bank_account_number: string | null;
  bank_account_name: string | null;
  pension_pin: string | null;
  annual_leave_days: number;
  department_id: string | null;
  tags: string[] | null;
}

const EmployeeProfile = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { profile: currentUser } = useAuthStore();

  const [employee, setEmployee] = useState<EmployeeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [confirmDeactivate, setConfirmDeactivate] = useState(false);
  const [confirmAnonymise, setConfirmAnonymise] = useState(false);
  const [anonymiseInput, setAnonymiseInput] = useState('');
  const [actioning, setActioning] = useState(false);
  const [form, setForm] = useState<Partial<EmployeeData>>({});
  const [bankDetails, setBankDetails] = useState<BankAccountValue>({
    bank_name: '', account_number: '', account_name: '', verified: false,
  });
  const [expenses, setExpenses] = useState<any[]>([]);
  const [payslips, setPayslips] = useState<any[]>([]);
  const [leaves, setLeaves] = useState<any[]>([]);
  const [tasks, setTasks] = useState<any[]>([]);
  const [documents, setDocuments] = useState<any[]>([]);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [permissions, setPermissions] = useState<PermissionsMap>({});
  const [savingPermissions, setSavingPermissions] = useState(false);
  const [increments, setIncrements] = useState<any[]>([]);
  const [showIncrementDialog, setShowIncrementDialog] = useState(false);
  const [savingIncrement, setSavingIncrement] = useState(false);
  const [incrementForm, setIncrementForm] = useState({
    new_salary: 0,
    reason: '',
    effective_date: new Date().toISOString().slice(0, 10),
  });
  const [showEditDialog, setShowEditDialog] = useState(false);

  const downloadPayslip = async (fileUrl: string) => {
    const { data, error } = await supabase.storage
      .from('payslips')
      .download(fileUrl);
    if (data) {
      const url = URL.createObjectURL(data);
      const a = document.createElement('a');
      a.href = url;
      a.download = `payslip-${fileUrl.split('/').pop()}`;
      a.click();
      URL.revokeObjectURL(url);
    }
  };

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', id)
      .single();
    if (error || !data) {
      toast({ title: 'Employee not found', variant: 'destructive' });
      navigate('/employees');
      return;
    }
    const emp = data as EmployeeData;
    setEmployee(emp);
    setForm(emp);
    setBankDetails({
      bank_name: emp.bank_name || '',
      account_number: emp.bank_account_number || '',
      account_name: emp.bank_account_name || '',
      verified: !!(emp.bank_name && emp.bank_account_number && emp.bank_account_name),
    });
    setPermissions((data as any).permissions || {});

    const [expRes, payRes, leaveRes, taskRes, docRes, auditRes, incrRes] = await Promise.all([
      supabase.from('expenses').select('*').eq('submitted_by', id)
        .order('created_at', { ascending: false }).limit(20),
      supabase.from('payslips').select('*').eq('employee_id', id)
        .order('period', { ascending: false }),
      supabase.from('leave_requests').select('*').eq('employee_id', id)
        .order('created_at', { ascending: false }).limit(20),
      supabase.from('tasks').select('*').eq('assigned_to', id)
        .order('created_at', { ascending: false }).limit(20),
      supabase.from('documents').select('*').eq('uploaded_by', id)
        .order('created_at', { ascending: false }).limit(30),
      supabase.from('audit_logs').select('*').eq('actor_id', id)
        .order('created_at', { ascending: false }).limit(50),
      supabase.from('salary_increments').select('*').eq('employee_id', id)
        .order('effective_date', { ascending: false }),
    ]);
    setExpenses(expRes.data || []);
    setPayslips(payRes.data || []);
    setLeaves(leaveRes.data || []);
    setTasks(taskRes.data || []);
    setDocuments(docRes.data || []);
    setAuditLogs(auditRes.data || []);
    setIncrements(incrRes.data || []);
    setLoading(false);
  }, [id, navigate, toast]);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    if (!id || !form) return;
    setSaving(true);
    const fullName = displayName(form.first_name, form.last_name, form.full_name);
    const { error } = await supabase.from('profiles').update({
      first_name: form.first_name,
      last_name: form.last_name,
      full_name: fullName,
      phone: form.phone,
      job_title: form.job_title,
      salary_ngn: form.salary_ngn,
      next_of_kin_name: form.next_of_kin_name,
      next_of_kin_phone: form.next_of_kin_phone,
      next_of_kin_relationship: form.next_of_kin_relationship,
      bank_name: form.bank_name,
      bank_account_number: form.bank_account_number,
      bank_account_name: form.bank_account_name,
      pension_pin: form.pension_pin,
      annual_leave_days: form.annual_leave_days,
    }).eq('id', id);
    if (error) {
      toast({ title: 'Save failed', description: error.message, variant: 'destructive' });
    } else {
      await logAudit('employee_edited', `Employee profile "${fullName}" updated`, currentUser);
      toast({ title: 'Employee profile saved' });
      load();
    }
    setSaving(false);
  };

  const handleDeactivate = async () => {
    if (!id || !employee) return;
    setActioning(true);
    const next = employee.status === 'active' ? 'inactive' : 'active';
    const { error } = await supabase.from('profiles').update({ status: next }).eq('id', id);
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
      setActioning(false);
      return;
    }
    await logAudit(
      next === 'inactive' ? 'employee_deactivated' : 'employee_edited',
      `Employee "${employee.full_name}" ${next === 'inactive' ? 'deactivated' : 'reactivated'}`,
      currentUser,
    );
    toast({ title: `Employee ${next === 'inactive' ? 'deactivated' : 'reactivated'}` });
    setConfirmDeactivate(false);
    setActioning(false);
    load();
  };

  const handleAnonymise = async () => {
    if (!id || !employee) return;
    setActioning(true);
    const { error } = await supabase.rpc('soft_delete_employee', { p_user_id: id });
    if (error) {
      toast({ title: 'Delete failed', description: error.message, variant: 'destructive' });
      setActioning(false);
      return;
    }
    await logAudit('employee_deleted', `Employee "${employee.full_name}" permanently anonymised`, currentUser);
    navigate('/employees', { replace: true });
  };

  const savePermissions = async () => {
    if (!id) return;
    setSavingPermissions(true);
    const { error } = await supabase
      .from('profiles')
      .update({ permissions })
      .eq('id', id);
    if (error) {
      toast({ title: 'Save failed', description: error.message, variant: 'destructive' });
    } else {
      await logAudit('permissions_updated', `Permissions updated for "${employee?.full_name || id}"`, currentUser);
      toast({ title: 'Permissions saved' });
    }
    setSavingPermissions(false);
  };

  const recordIncrement = async () => {
    if (!id || !employee) return;
    if (incrementForm.new_salary <= 0) {
      toast({ title: 'New salary must be greater than zero', variant: 'destructive' });
      return;
    }
    setSavingIncrement(true);
    try {
      const { error: incrErr } = await supabase.from('salary_increments').insert({
        employee_id: id,
        old_salary_ngn: employee.salary_ngn,
        new_salary_ngn: incrementForm.new_salary,
        effective_date: incrementForm.effective_date,
        reason: incrementForm.reason || null,
        approved_by: currentUser?.id || null,
      });
      if (incrErr) throw incrErr;
      const { error: profileErr } = await supabase
        .from('profiles')
        .update({ salary_ngn: incrementForm.new_salary })
        .eq('id', id);
      if (profileErr) throw profileErr;
      await logAudit(
        'salary_increment',
        `Salary updated for "${employee.full_name}": ${formatNaira(employee.salary_ngn)} → ${formatNaira(incrementForm.new_salary)}`,
        currentUser,
      );
      toast({ title: 'Salary increment recorded' });
      setShowIncrementDialog(false);
      setIncrementForm({ new_salary: 0, reason: '', effective_date: new Date().toISOString().slice(0, 10) });
      load();
    } catch (err: any) {
      toast({ title: 'Failed to record increment', description: err?.message, variant: 'destructive' });
    } finally {
      setSavingIncrement(false);
    }
  };

  const yoyGrowth = useMemo(() => {
    if (increments.length === 0 || !employee?.salary_ngn) return null;
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
    const past = increments.find((i) => new Date(i.effective_date) <= oneYearAgo);
    if (!past) return null;
    return ((employee.salary_ngn - past.new_salary_ngn) / past.new_salary_ngn) * 100;
  }, [increments, employee]);

  if (loading || !employee) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  const patch = (p: Partial<EmployeeData>) => setForm((prev) => ({ ...prev, ...p }));
  const empName = displayName(employee.first_name, employee.last_name, employee.full_name);
  const leaveTaken = leaves.filter((l: any) => l.status === 'approved').reduce((sum: number, l: any) => sum + (l.days || 0), 0);

  const salary             = employee.salary_ngn || 0;
  const payeMonthly        = salary ? calculatePAYE(salary)          : 0;
  const pensionMonthly     = Math.round(salary * 0.08);
  const nhfMonthly         = Math.round(salary * 0.025);
  const totalDeductMonthly = payeMonthly + pensionMonthly + nhfMonthly;
  const netMonthly         = salary - totalDeductMonthly;

  return (
    <div className="space-y-6 max-w-4xl">
      <nav className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <button onClick={() => navigate('/employees')} className="hover:text-foreground transition-colors">Employees</button>
        <span>/</span>
        <span className="text-foreground">{empName}</span>
      </nav>
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate('/employees')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">{empName}</h1>
          <p className="text-muted-foreground text-sm">
            {employee.job_title || roleLabel(employee.role)} · {employee.email}
          </p>
        </div>
        <Badge variant="outline" className={cn('font-medium', roleBadgeClass(employee.role))}>
          {roleLabel(employee.role)}
        </Badge>
        <Badge variant="secondary" className={employee.status === 'active' ? 'bg-success/10 text-success' : 'bg-muted text-muted-foreground'}>
          {employee.status}
        </Badge>
        {(currentUser?.role === 'super_admin' || currentUser?.role === 'admin') && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                Manage <ChevronDown className="ml-2 h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setShowEditDialog(true)}>Edit Profile</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setConfirmDeactivate(true)}>
                {employee.status === 'active' ? 'Deactivate' : 'Reactivate'}
              </DropdownMenuItem>
              {currentUser?.role === 'super_admin' && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="text-destructive focus:text-destructive"
                    onClick={() => { setAnonymiseInput(''); setConfirmAnonymise(true); }}
                  >
                    Delete &amp; Anonymise
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {/* Edit Profile dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Profile — {empName}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>First name</Label>
                <Input value={form.first_name || ''} onChange={(e) => patch({ first_name: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label>Last name</Label>
                <Input value={form.last_name || ''} onChange={(e) => patch({ last_name: e.target.value })} />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Phone</Label>
              <Input value={form.phone || ''} onChange={(e) => patch({ phone: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label>Role</Label>
              <Select value={form.role || employee.role} onValueChange={(v) => patch({ role: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="finance">Finance</SelectItem>
                  <SelectItem value="operations">Operations</SelectItem>
                  <SelectItem value="field_staff">Field Staff</SelectItem>
                  <SelectItem value="driver">Driver</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Monthly gross salary (₦)</Label>
              <Input
                type="number"
                value={form.salary_ngn || ''}
                onChange={(e) => patch({ salary_ngn: Number(e.target.value) || 0 })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditDialog(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={() => { save(); setShowEditDialog(false); }} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              <Save className="mr-2 h-4 w-4" /> Save changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Deactivate / reactivate dialog */}
      <Dialog open={confirmDeactivate} onOpenChange={setConfirmDeactivate}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {employee.status === 'active' ? 'Deactivate' : 'Reactivate'} {empName}?
            </DialogTitle>
            <DialogDescription>
              {employee.status === 'active'
                ? `${empName} will lose platform access immediately. Their records remain visible and this can be reversed.`
                : `${empName} will regain platform access. Their account will be restored.`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDeactivate(false)} disabled={actioning}>
              Cancel
            </Button>
            <Button
              variant={employee.status === 'active' ? 'destructive' : 'default'}
              onClick={handleDeactivate}
              disabled={actioning}
            >
              {actioning && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {employee.status === 'active' ? 'Deactivate' : 'Reactivate'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete & anonymise dialog (super_admin only) */}
      <Dialog open={confirmAnonymise} onOpenChange={(o) => { if (!o) { setConfirmAnonymise(false); setAnonymiseInput(''); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" /> Permanently delete {empName}?
            </DialogTitle>
            <DialogDescription asChild>
              <ul className="mt-2 space-y-1 text-sm text-muted-foreground list-none">
                <li>• Their account will be permanently closed</li>
                <li>• Their name and contact details will be erased</li>
                <li>• Their payment records and task history will show as &ldquo;Former Employee&rdquo; to preserve reports</li>
                <li className="font-semibold text-destructive">• This CANNOT be undone.</li>
              </ul>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Type <strong>DELETE</strong> to confirm</Label>
            <Input
              value={anonymiseInput}
              onChange={(e) => setAnonymiseInput(e.target.value)}
              placeholder="DELETE"
              className={anonymiseInput === 'DELETE' ? 'border-destructive' : ''}
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => { setConfirmAnonymise(false); setAnonymiseInput(''); }}
              disabled={actioning}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleAnonymise}
              disabled={anonymiseInput !== 'DELETE' || actioning}
            >
              {actioning && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              <Trash2 className="mr-2 h-4 w-4" /> Delete permanently
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Card>
        <CardContent className="pt-6">
          <div className="flex items-start gap-5 flex-wrap">
            <div className="h-20 w-20 rounded-full bg-primary flex items-center justify-center shrink-0 ring-4 ring-primary/10">
              <span className="text-2xl font-bold text-primary-foreground">
                {initialsOf(employee.first_name, employee.last_name, employee.full_name)}
              </span>
            </div>
            <div className="flex-1 min-w-0 space-y-1">
              <p className="text-sm flex items-center gap-2 text-muted-foreground"><Mail className="h-3.5 w-3.5" /> {employee.email}</p>
              {employee.phone && <p className="text-sm flex items-center gap-2 text-muted-foreground"><Phone className="h-3.5 w-3.5" /> {employee.phone}</p>}
              <p className="text-sm flex items-center gap-2 text-muted-foreground"><CalendarDays className="h-3.5 w-3.5" /> Joined {formatDate(employee.created_at)}</p>
              {employee.job_title && <p className="text-sm flex items-center gap-2 text-muted-foreground"><Briefcase className="h-3.5 w-3.5" /> {employee.job_title}</p>}
            </div>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="overview">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="payroll">Payroll</TabsTrigger>
          <TabsTrigger value="leave">Leave ({leaves.length})</TabsTrigger>
          <TabsTrigger value="expenses">Expenses ({expenses.length})</TabsTrigger>
          <TabsTrigger value="tasks">Tasks ({tasks.length})</TabsTrigger>
          <TabsTrigger value="documents">Documents ({documents.length})</TabsTrigger>
          <TabsTrigger value="increments">Increments ({increments.length})</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
          {currentUser?.role === 'super_admin' && (
            <TabsTrigger value="permissions">Permissions</TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="overview" className="mt-4 space-y-4">
          {!salary ? (
            <div className="flex items-center gap-3 rounded-lg border border-yellow-200 bg-yellow-50 px-4 py-3 text-sm text-yellow-800">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              Salary not set for this employee
            </div>
          ) : (
            <Card>
              <CardHeader><CardTitle className="text-base">Compensation Breakdown</CardTitle></CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/40">
                      <TableHead className="pl-4">Title</TableHead>
                      <TableHead className="text-right">Annually</TableHead>
                      <TableHead className="text-right pr-4">Monthly</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <TableRow>
                      <TableCell className="pl-4">Gross Pay</TableCell>
                      <TableCell className="text-right">{formatNaira(salary * 12)}</TableCell>
                      <TableCell className="text-right pr-4">{formatNaira(salary)}</TableCell>
                    </TableRow>
                    <TableRow className="text-muted-foreground">
                      <TableCell className="pl-4">PAYE Tax</TableCell>
                      <TableCell className="text-right">{formatNaira(payeMonthly * 12)}</TableCell>
                      <TableCell className="text-right pr-4">{formatNaira(payeMonthly)}</TableCell>
                    </TableRow>
                    <TableRow className="text-muted-foreground">
                      <TableCell className="pl-4">Pension (8%)</TableCell>
                      <TableCell className="text-right">{formatNaira(pensionMonthly * 12)}</TableCell>
                      <TableCell className="text-right pr-4">{formatNaira(pensionMonthly)}</TableCell>
                    </TableRow>
                    <TableRow className="text-muted-foreground">
                      <TableCell className="pl-4">NHF (2.5%)</TableCell>
                      <TableCell className="text-right">{formatNaira(nhfMonthly * 12)}</TableCell>
                      <TableCell className="text-right pr-4">{formatNaira(nhfMonthly)}</TableCell>
                    </TableRow>
                    <TableRow className="text-muted-foreground border-t-2">
                      <TableCell className="pl-4">Total Deductions</TableCell>
                      <TableCell className="text-right">{formatNaira(totalDeductMonthly * 12)}</TableCell>
                      <TableCell className="text-right pr-4">{formatNaira(totalDeductMonthly)}</TableCell>
                    </TableRow>
                    <TableRow className="font-bold bg-muted/30">
                      <TableCell className="pl-4">Net Pay</TableCell>
                      <TableCell className="text-right">{formatNaira(netMonthly * 12)}</TableCell>
                      <TableCell className="text-right pr-4">{formatNaira(netMonthly)}</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
          <Card>
            <CardHeader><CardTitle className="text-base">Personal details</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1"><Label>First name</Label><Input value={form.first_name || ''} onChange={(e) => patch({ first_name: e.target.value })} /></div>
                <div className="space-y-1"><Label>Last name</Label><Input value={form.last_name || ''} onChange={(e) => patch({ last_name: e.target.value })} /></div>
                <div className="space-y-1"><Label>Phone</Label><Input value={form.phone || ''} onChange={(e) => patch({ phone: e.target.value })} /></div>
                <div className="space-y-1"><Label>Job title</Label><Input value={form.job_title || ''} onChange={(e) => patch({ job_title: e.target.value })} placeholder="e.g. Head of Operations" /></div>
                <div className="space-y-1"><Label>Annual leave days</Label><Input type="number" value={form.annual_leave_days || 20} onChange={(e) => patch({ annual_leave_days: Number(e.target.value) || 20 })} /></div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-base">Next of kin</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-1"><Label>Name</Label><Input value={form.next_of_kin_name || ''} onChange={(e) => patch({ next_of_kin_name: e.target.value })} /></div>
                <div className="space-y-1"><Label>Phone</Label><Input value={form.next_of_kin_phone || ''} onChange={(e) => patch({ next_of_kin_phone: e.target.value })} /></div>
                <div className="space-y-1"><Label>Relationship</Label><Input value={form.next_of_kin_relationship || ''} onChange={(e) => patch({ next_of_kin_relationship: e.target.value })} placeholder="e.g. Spouse" /></div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-base">Bank details</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <BankAccountField
                value={bankDetails}
                onChange={(v) => {
                  setBankDetails(v);
                  patch({
                    bank_name: v.bank_name,
                    bank_account_number: v.account_number,
                    bank_account_name: v.account_name,
                  });
                }}
              />
              <div className="space-y-1"><Label>Pension PIN</Label><Input value={form.pension_pin || ''} onChange={(e) => patch({ pension_pin: e.target.value })} /></div>
            </CardContent>
          </Card>
          <div className="flex justify-end gap-2 items-center">
            {bankDetails.account_number.length > 0 && !bankDetails.verified && (
              <p className="text-xs text-destructive">Verify bank account before saving.</p>
            )}
            <Button
              onClick={save}
              disabled={saving || (bankDetails.account_number.length > 0 && !bankDetails.verified)}
            >
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Save changes
            </Button>
          </div>
        </TabsContent>

        <TabsContent value="payroll" className="mt-4 space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Salary</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1">
                <Label>Monthly gross salary (₦)</Label>
                <Input type="number" value={form.salary_ngn || 0} onChange={(e) => patch({ salary_ngn: Number(e.target.value) || 0 })} />
                <p className="text-xs text-muted-foreground">PAYE: {formatNaira((form.salary_ngn || 0) * 0.075)} · Pension: {formatNaira((form.salary_ngn || 0) * 0.08)} · NHF: {formatNaira((form.salary_ngn || 0) * 0.025)}</p>
              </div>
              <Button onClick={save} disabled={saving} size="sm">{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Save salary</Button>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-base">Payslips</CardTitle></CardHeader>
            <CardContent>
              {payslips.length === 0 ? <p className="text-sm text-muted-foreground">No payslips generated yet.</p> : (
                <div className="space-y-2">{payslips.map((p: any) => (
                  <div key={p.id} className="flex items-center justify-between border rounded-lg p-3">
                    <div><p className="font-medium">{p.period}</p><p className="text-xs text-muted-foreground">Gross {formatNaira(p.gross_ngn)} · Net {formatNaira(p.net_ngn)}</p></div>
                    {p.file_url && (
                      <Button size="sm" variant="outline" onClick={() => downloadPayslip(p.file_url)}>
                        <Download className="h-4 w-4 mr-1" /> Download
                      </Button>
                    )}
                  </div>
                ))}</div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="leave" className="mt-4 space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Leave balance</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-4 text-center">
                <div><p className="text-2xl font-bold">{employee.annual_leave_days || 20}</p><p className="text-xs text-muted-foreground">Annual entitlement</p></div>
                <div><p className="text-2xl font-bold">{leaveTaken}</p><p className="text-xs text-muted-foreground">Days taken</p></div>
                <div><p className="text-2xl font-bold text-primary">{(employee.annual_leave_days || 20) - leaveTaken}</p><p className="text-xs text-muted-foreground">Remaining</p></div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-base">Leave history</CardTitle></CardHeader>
            <CardContent>
              {leaves.length === 0 ? <p className="text-sm text-muted-foreground">No leave requests.</p> : (
                <div className="space-y-2">{leaves.map((l: any) => (
                  <div key={l.id} className="flex items-center justify-between border rounded-lg p-3">
                    <div><p className="font-medium capitalize">{(l.leave_type || l.type || 'annual').replace(/_/g, ' ')}</p><p className="text-xs text-muted-foreground">{formatDate(l.start_date)} — {formatDate(l.end_date)} · {l.days || '—'} days</p></div>
                    <Badge variant="secondary" className={l.status === 'approved' ? 'bg-success/10 text-success' : l.status === 'rejected' ? 'bg-destructive/10 text-destructive' : 'bg-warning/10 text-warning'}>{l.status}</Badge>
                  </div>
                ))}</div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="expenses" className="mt-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Recent expenses</CardTitle></CardHeader>
            <CardContent>
              {expenses.length === 0 ? <p className="text-sm text-muted-foreground">No expenses submitted.</p> : (
                <div className="space-y-2">{expenses.map((e: any) => (
                  <div key={e.id} className="flex items-center justify-between border rounded-lg p-3">
                    <div><p className="font-medium capitalize">{e.category?.replace(/_/g, ' ')}</p><p className="text-xs text-muted-foreground">{formatDate(e.date)}</p></div>
                    <div className="text-right"><p className="font-medium currency">{formatNaira(e.amount_ngn)}</p>
                      <Badge variant="secondary" className={e.status === 'approved' ? 'bg-success/10 text-success' : e.status === 'rejected' ? 'bg-destructive/10 text-destructive' : 'bg-warning/10 text-warning'}>{e.status}</Badge>
                    </div>
                  </div>
                ))}</div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="tasks" className="mt-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Assigned tasks</CardTitle></CardHeader>
            <CardContent>
              {tasks.length === 0 ? <p className="text-sm text-muted-foreground">No tasks assigned.</p> : (
                <div className="space-y-2">{tasks.map((t: any) => (
                  <div key={t.id} className="flex items-center justify-between border rounded-lg p-3">
                    <div><p className="font-medium">{t.title}</p><p className="text-xs text-muted-foreground">{formatDate(t.created_at)} · {t.priority || 'normal'}</p></div>
                    <Badge variant="secondary" className={t.status === 'completed' ? 'bg-success/10 text-success' : t.status === 'blocked' ? 'bg-destructive/10 text-destructive' : 'bg-warning/10 text-warning'}>{t.status}</Badge>
                  </div>
                ))}</div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="documents" className="mt-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Documents</CardTitle></CardHeader>
            <CardContent>
              {documents.length === 0 ? (
                <p className="text-sm text-muted-foreground">No documents uploaded.</p>
              ) : (
                <div className="space-y-2">
                  {documents.map((d: any) => (
                    <div key={d.id} className="flex items-center justify-between border rounded-lg p-3">
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                        <div>
                          <p className="font-medium">{d.name || d.file_name || 'Untitled'}</p>
                          <p className="text-xs text-muted-foreground">
                            {d.document_type?.replace(/_/g, ' ') || 'Document'} · {formatDate(d.created_at)}
                          </p>
                        </div>
                      </div>
                      {d.file_url && (
                        <Button variant="ghost" size="sm" asChild>
                          <a href={d.file_url} target="_blank" rel="noopener noreferrer">View</a>
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="increments" className="mt-4 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Salary increment history</p>
              {yoyGrowth !== null && (
                <p className={`text-xs flex items-center gap-1 mt-0.5 ${yoyGrowth >= 0 ? 'text-success' : 'text-destructive'}`}>
                  {yoyGrowth >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                  {Math.abs(yoyGrowth).toFixed(1)}% year-over-year salary growth
                </p>
              )}
            </div>
            {(currentUser?.role === 'admin' || currentUser?.role === 'super_admin' || currentUser?.role === 'finance') && (
              <Button
                size="sm"
                onClick={() => {
                  setIncrementForm({ new_salary: employee?.salary_ngn || 0, reason: '', effective_date: new Date().toISOString().slice(0, 10) });
                  setShowIncrementDialog(true);
                }}
              >
                <Plus className="mr-2 h-3.5 w-3.5" /> Record increment
              </Button>
            )}
          </div>
          <Card>
            <CardContent className="p-0">
              {increments.length === 0 ? (
                <p className="text-sm text-muted-foreground p-4">No salary increments recorded yet.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Effective date</TableHead>
                      <TableHead className="text-right">Previous salary</TableHead>
                      <TableHead className="text-right">New salary</TableHead>
                      <TableHead className="text-right">Increase</TableHead>
                      <TableHead>Reason</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {increments.map((inc: any) => {
                      const pct = inc.old_salary_ngn > 0
                        ? ((inc.new_salary_ngn - inc.old_salary_ngn) / inc.old_salary_ngn) * 100
                        : null;
                      return (
                        <TableRow key={inc.id}>
                          <TableCell>{formatDate(inc.effective_date)}</TableCell>
                          <TableCell className="text-right currency">{formatNaira(inc.old_salary_ngn)}</TableCell>
                          <TableCell className="text-right currency font-medium">{formatNaira(inc.new_salary_ngn)}</TableCell>
                          <TableCell className="text-right">
                            {pct !== null && (
                              <span className={`text-xs font-medium ${pct >= 0 ? 'text-success' : 'text-destructive'}`}>
                                {pct >= 0 ? '+' : ''}{pct.toFixed(1)}%
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="text-muted-foreground text-sm">{inc.reason || '—'}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <Dialog open={showIncrementDialog} onOpenChange={setShowIncrementDialog}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Record salary increment</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <div className="space-y-1">
                  <Label>Current salary</Label>
                  <p className="text-sm font-medium currency">{formatNaira(employee?.salary_ngn || 0)}</p>
                </div>
                <div className="space-y-1">
                  <Label>New monthly gross salary (₦)</Label>
                  <Input
                    type="number"
                    value={incrementForm.new_salary || ''}
                    onChange={(e) => setIncrementForm({ ...incrementForm, new_salary: Number(e.target.value) || 0 })}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Effective date</Label>
                  <Input
                    type="date"
                    value={incrementForm.effective_date}
                    onChange={(e) => setIncrementForm({ ...incrementForm, effective_date: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Reason</Label>
                  <Textarea
                    placeholder="e.g. Annual review, promotion, market adjustment…"
                    value={incrementForm.reason}
                    onChange={(e) => setIncrementForm({ ...incrementForm, reason: e.target.value })}
                  />
                </div>
                {incrementForm.new_salary > 0 && employee?.salary_ngn && (
                  <p className="text-xs text-muted-foreground">
                    Change: {formatNaira(employee.salary_ngn)} → {formatNaira(incrementForm.new_salary)}
                    {' '}({((incrementForm.new_salary - employee.salary_ngn) / employee.salary_ngn * 100).toFixed(1)}%)
                  </p>
                )}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setShowIncrementDialog(false)}>Cancel</Button>
                <Button onClick={recordIncrement} disabled={savingIncrement}>
                  {savingIncrement && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Save increment
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </TabsContent>

        <TabsContent value="activity" className="mt-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Activity log</CardTitle></CardHeader>
            <CardContent>
              {auditLogs.length === 0 ? (
                <p className="text-sm text-muted-foreground">No activity recorded.</p>
              ) : (
                <div className="space-y-2">
                  {auditLogs.map((log: any) => (
                    <div key={log.id} className="flex items-start gap-3 border rounded-lg p-3">
                      <Shield className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm">{log.description}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {formatDateTime(log.created_at)}
                          {log.action_type && (
                            <Badge variant="outline" className="ml-2 text-[10px] px-1.5 py-0">
                              {log.action_type.replace(/_/g, ' ')}
                            </Badge>
                          )}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {currentUser?.role === 'super_admin' && (
          <TabsContent value="permissions" className="mt-4 space-y-4">
            <p className="text-sm text-muted-foreground">
              Override what {empName} can access. Permissions that are toggled off
              will be denied even if the user's role would normally allow them.
            </p>
            <PermissionsEditor
              value={permissions}
              onChange={setPermissions}
            />
            <div className="flex justify-end">
              <Button onClick={savePermissions} disabled={savingPermissions}>
                {savingPermissions ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                Save permissions
              </Button>
            </div>
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
};

export default EmployeeProfile;
