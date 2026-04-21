import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Mail, Phone, CalendarDays, Save, Loader2, Briefcase,
  FileText, Shield, Trash2, TrendingUp, TrendingDown, Plus, Download,
  ChevronDown, AlertTriangle, ExternalLink, Camera,
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
  photo_url: string | null;
  departments: { name: string } | null;
  date_of_birth: string | null;
  gender: string | null;
  marital_status: string | null;
  address: string | null;
  next_of_kin_email: string | null;
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
  const [activeTab, setActiveTab] = useState<'job_pay'|'personal'|'documents'|'tasks'|'logs'|'leave'|'expenses'|'payroll'|'increments'>('job_pay');
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showPersonalEditDialog, setShowPersonalEditDialog] = useState(false);
  const [showKinEditDialog, setShowKinEditDialog] = useState(false);
  const [showAddressEditDialog, setShowAddressEditDialog] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const avatarFileRef = useRef<HTMLInputElement>(null);

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
      .select('*, departments(name)')
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
      supabase.from('audit_logs')
        .select('id, action_type, description, created_at, performed_by, performed_by_name')
        .or(`entity_id.eq.${id},performed_by.eq.${id}`)
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

  const save = async (): Promise<boolean> => {
    if (!id || !form) return false;
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
      date_of_birth: form.date_of_birth,
      gender: form.gender,
      marital_status: form.marital_status,
      address: form.address,
      next_of_kin_email: form.next_of_kin_email,
    }).eq('id', id);
    if (error) {
      toast({ title: 'Save failed', description: error.message, variant: 'destructive' });
      setSaving(false);
      return false;
    }
    await logAudit('employee_edited', `Employee profile "${fullName}" updated`, currentUser);
    toast({ title: 'Employee profile saved' });
    load();
    setSaving(false);
    return true;
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
    const { error } = await supabase.rpc('soft_delete_employee', { user_id: id });
    if (error) {
      toast({ title: 'Delete failed', description: error.message, variant: 'destructive' });
      setActioning(false);
      return;
    }
    await logAudit('employee_deleted', `Employee "${employee.full_name}" permanently anonymised`, currentUser);
    navigate('/employees', { replace: true });
  };

  const uploadPhoto = async (file: File) => {
    if (!id) return;
    setUploadingPhoto(true);
    const ext = file.name.split('.').pop() || 'jpg';
    const path = `employees/${id}.${ext}`;
    const { error: upErr } = await supabase.storage
      .from('avatars')
      .upload(path, file, { upsert: true });
    if (upErr) {
      toast({ title: 'Upload failed', description: upErr.message, variant: 'destructive' });
      setUploadingPhoto(false);
      return;
    }
    const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(path);
    const { error: saveErr } = await supabase
      .from('profiles')
      .update({ photo_url: publicUrl })
      .eq('id', id);
    if (saveErr) {
      toast({ title: 'Failed to save photo', description: saveErr.message, variant: 'destructive' });
    } else {
      toast({ title: 'Photo updated' });
      load();
    }
    setUploadingPhoto(false);
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

  // ── Compensation (derived from monthly gross) ────────────────────────────
  const hasSalary = !!employee.salary_ngn;
  const salary    = employee.salary_ngn || 0;
  const payeMonthly     = hasSalary ? calculatePAYE(salary)               : 0;
  const pensionMonthly  = hasSalary ? Math.round(salary * 0.08)           : 0;
  const nhfMonthly      = hasSalary ? Math.round(salary * 0.025)          : 0;
  const totalDeductMonthly = payeMonthly + pensionMonthly + nhfMonthly;
  const netMonthly      = hasSalary ? salary - totalDeductMonthly         : 0;

  const canManage    = currentUser?.role === 'admin' || currentUser?.role === 'super_admin';
  const isSuperAdmin = currentUser?.role === 'super_admin';

  return (
    <div className="max-w-5xl">
      <button
        onClick={() => navigate('/employees')}
        className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-3"
      >
        ← Back
      </button>

      {/* ── Profile header card ── */}
      <div className="bg-card border rounded-xl px-6 py-4">
        <div className="flex items-center gap-4">

          {/* Avatar — click to upload */}
          <button
            type="button"
            onClick={() => avatarFileRef.current?.click()}
            disabled={uploadingPhoto}
            className="relative h-16 w-16 rounded-full shrink-0 group focus:outline-none"
          >
            {employee.photo_url ? (
              <img
                src={employee.photo_url}
                alt={empName}
                className="h-16 w-16 rounded-full object-cover ring-2 ring-background shadow"
              />
            ) : (
              <div className="h-16 w-16 rounded-full bg-primary flex items-center justify-center ring-2 ring-background shadow">
                <span className="text-xl font-bold text-primary-foreground">
                  {initialsOf(employee.first_name, employee.last_name, employee.full_name)}
                </span>
              </div>
            )}
            <div className="absolute inset-0 rounded-full bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
              {uploadingPhoto
                ? <Loader2 className="h-5 w-5 text-white animate-spin" />
                : <Camera className="h-5 w-5 text-white" />}
            </div>
          </button>
          <input
            ref={avatarFileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadPhoto(f); e.target.value = ''; }}
          />

          {/* Name / role / email */}
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold leading-tight">{empName}</h1>
              <Badge
                className={
                  employee.status === 'active'
                    ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-100'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-100'
                }
              >
                {employee.status === 'active' ? 'Active' : 'Inactive'}
              </Badge>
            </div>
            <p className="text-muted-foreground text-sm mt-0.5 truncate">
              {employee.job_title || roleLabel(employee.role)} &middot; {employee.email}
            </p>
          </div>

          {/* Manage dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="shrink-0">
                Manage <ChevronDown className="ml-2 h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setShowEditDialog(true)}>
                Edit Profile
              </DropdownMenuItem>
              {canManage && currentUser?.id !== id && (
                <DropdownMenuItem onClick={() => setConfirmDeactivate(true)}>
                  Deactivate
                </DropdownMenuItem>
              )}
              {isSuperAdmin && currentUser?.id !== id && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="text-red-600"
                    onClick={() => setConfirmAnonymise(true)}
                  >
                    Delete &amp; Anonymise
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>

        </div>
      </div>

      {/* ── Tab navigation ── */}
      <div className="flex border-b mt-6 overflow-x-auto">
        {([
          { key: 'job_pay',   label: 'Job & Pay'                        },
          { key: 'personal',  label: 'Personal'                         },
          { key: 'documents', label: 'Documents'                        },
          { key: 'tasks',     label: 'Tasks'                            },
          { key: 'logs',      label: 'Logs'                             },
          { key: 'leave',     label: `Leave (${leaves.length})`         },
          { key: 'expenses',  label: `Expenses (${expenses.length})`    },
          { key: 'payroll',   label: 'Payroll'                          },
        ] as const).map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={cn(
              'px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap',
              activeTab === key
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {label}
          </button>
        ))}
        {increments.length > 0 && (
          <button
            onClick={() => setActiveTab('increments')}
            className={cn(
              'px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap',
              activeTab === 'increments'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {`Increments (${increments.length})`}
          </button>
        )}
      </div>

      {/* ── Tab content ── */}
      {activeTab === 'job_pay' && (
        <div className="mt-4 grid grid-cols-1 lg:grid-cols-5 gap-4">

          {/* ── LEFT column (60%) ─────────────────────────────────────────── */}
          <div className="lg:col-span-3 space-y-4">

            {/* Card 1 — Compensation Breakdown */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Compensation Breakdown</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {!hasSalary ? (
                  <div className="mx-4 my-3 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-700">
                    <AlertTriangle className="h-4 w-4 shrink-0" />
                    No salary set — use Edit Profile to add salary
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/40">
                        <TableHead className="pl-4">Title</TableHead>
                        <TableHead className="text-right">Annually</TableHead>
                        <TableHead className="text-right pr-4">Monthly</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      <TableRow className="font-medium">
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
                        <TableCell className="pl-4">Pension Employee 8%</TableCell>
                        <TableCell className="text-right">{formatNaira(pensionMonthly * 12)}</TableCell>
                        <TableCell className="text-right pr-4">{formatNaira(pensionMonthly)}</TableCell>
                      </TableRow>
                      <TableRow className="text-muted-foreground">
                        <TableCell className="pl-4">NHF 2.5%</TableCell>
                        <TableCell className="text-right">{formatNaira(nhfMonthly * 12)}</TableCell>
                        <TableCell className="text-right pr-4">{formatNaira(nhfMonthly)}</TableCell>
                      </TableRow>
                      <TableRow className="text-muted-foreground border-t-2">
                        <TableCell className="pl-4">Total Deductions</TableCell>
                        <TableCell className="text-right">{formatNaira(totalDeductMonthly * 12)}</TableCell>
                        <TableCell className="text-right pr-4">{formatNaira(totalDeductMonthly)}</TableCell>
                      </TableRow>
                      <TableRow className="font-bold bg-muted/30">
                        <TableCell className="pl-4 text-base">Net Pay</TableCell>
                        <TableCell className="text-right text-base">{formatNaira(netMonthly * 12)}</TableCell>
                        <TableCell className="text-right pr-4 text-base">{formatNaira(netMonthly)}</TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>

            {/* Card 2 — Employment Details */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Employment Details</CardTitle>
              </CardHeader>
              <CardContent>
                <dl className="space-y-3">
                  {([
                    ['Department',      employee.departments?.name ?? '—'],
                    ['Role',            roleLabel(employee.role)],
                    ['Start Date',      formatDate(employee.created_at)],
                    ['Employee Number', '—'],
                  ] as [string, string][]).map(([label, val]) => (
                    <div key={label} className="flex items-center justify-between text-sm">
                      <dt className="text-muted-foreground">{label}</dt>
                      <dd className="font-medium">{val}</dd>
                    </div>
                  ))}
                </dl>
              </CardContent>
            </Card>
          </div>

          {/* ── RIGHT column (40%) ────────────────────────────────────────── */}
          <div className="lg:col-span-2 space-y-4">

            {/* Card 3 — Payment Method */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Payment Method</CardTitle>
              </CardHeader>
              <CardContent>
                {employee.bank_name && employee.bank_account_number ? (
                  <>
                    <dl className="space-y-3">
                      <div className="flex items-center justify-between text-sm">
                        <dt className="text-muted-foreground">Bank name</dt>
                        <dd className="font-medium">{employee.bank_name}</dd>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <dt className="text-muted-foreground">Account number</dt>
                        <dd className="font-medium font-mono">{employee.bank_account_number}</dd>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <dt className="text-muted-foreground">Account name</dt>
                        <dd className="font-medium">{employee.bank_account_name || '—'}</dd>
                      </div>
                    </dl>
                    <p className="text-xs text-muted-foreground mt-3 pt-3 border-t">
                      Payouts will be made to this account
                    </p>
                  </>
                ) : (
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">No payment method on file.</p>
                    <p className="text-xs text-muted-foreground">Update via Edit Profile</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Card 4 — Employment Status */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Employment Status</CardTitle>
              </CardHeader>
              <CardContent>
                <dl className="space-y-3">
                  <div className="flex items-center justify-between text-sm">
                    <dt className="text-muted-foreground">Employment type</dt>
                    <dd className="font-medium">Full-time</dd>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <dt className="text-muted-foreground">Status</dt>
                    <dd>
                      <Badge
                        className={
                          employee.status === 'active'
                            ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-100'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-100'
                        }
                      >
                        {employee.status === 'active' ? 'Active' : 'Inactive'}
                      </Badge>
                    </dd>
                  </div>
                </dl>
              </CardContent>
            </Card>
          </div>
        </div>
      )}
      {activeTab === 'personal' && (
        <div className="mt-4 space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Basic Details */}
            <Card>
              <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
                <CardTitle className="text-base">Basic Details</CardTitle>
                {canManage && (
                  <Button size="sm" variant="outline" onClick={() => setShowPersonalEditDialog(true)}>
                    Edit
                  </Button>
                )}
              </CardHeader>
              <CardContent>
                <dl className="space-y-3 text-sm">
                  {([
                    ['Full name',      empName],
                    ['Date of birth',  employee.date_of_birth ? formatDate(employee.date_of_birth) : '—'],
                    ['Gender',         employee.gender || '—'],
                    ['Email',          employee.email],
                    ['Phone',          employee.phone || '—'],
                    ['Marital status', employee.marital_status || '—'],
                  ] as [string, string][]).map(([label, val]) => (
                    <div key={label} className="flex items-start justify-between gap-4">
                      <dt className="text-muted-foreground shrink-0">{label}</dt>
                      <dd className="font-medium text-right">{val}</dd>
                    </div>
                  ))}
                </dl>
              </CardContent>
            </Card>

            {/* Next of Kin */}
            <Card>
              <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
                <CardTitle className="text-base">Next of Kin</CardTitle>
                {canManage && (
                  <Button size="sm" variant="outline" onClick={() => setShowKinEditDialog(true)}>
                    Edit
                  </Button>
                )}
              </CardHeader>
              <CardContent>
                {employee.next_of_kin_name ? (
                  <dl className="space-y-3 text-sm">
                    {([
                      ['Name',         employee.next_of_kin_name],
                      ['Relationship', employee.next_of_kin_relationship || '—'],
                      ['Phone',        employee.next_of_kin_phone || '—'],
                      ['Email',        employee.next_of_kin_email || '—'],
                    ] as [string, string][]).map(([label, val]) => (
                      <div key={label} className="flex items-start justify-between gap-4">
                        <dt className="text-muted-foreground shrink-0">{label}</dt>
                        <dd className="font-medium text-right">{val}</dd>
                      </div>
                    ))}
                  </dl>
                ) : (
                  <p className="text-sm text-muted-foreground">No next of kin recorded.</p>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Home Address */}
          <Card>
            <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base">Home Address</CardTitle>
              {canManage && (
                <Button size="sm" variant="outline" onClick={() => setShowAddressEditDialog(true)}>
                  Edit
                </Button>
              )}
            </CardHeader>
            <CardContent>
              {employee.address ? (
                <p className="text-sm">{employee.address}</p>
              ) : (
                <p className="text-sm text-muted-foreground">No address recorded.</p>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {activeTab === 'documents' && (
        <div className="mt-4">
          <Card>
            <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base">Documents</CardTitle>
              {(currentUser?.role === 'admin' || currentUser?.role === 'super_admin') && (
                <Button size="sm" variant="outline" className="gap-1.5">
                  <Plus className="h-4 w-4" /> Upload
                </Button>
              )}
            </CardHeader>
            <CardContent className="p-0">
              {documents.length === 0 ? (
                <p className="px-4 py-6 text-sm text-muted-foreground">No documents uploaded yet.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/40">
                      <TableHead className="pl-4">File name</TableHead>
                      <TableHead>Upload date</TableHead>
                      <TableHead className="pr-4">Uploaded by</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {documents.map((doc: any) => (
                      <TableRow key={doc.id}>
                        <TableCell className="pl-4 font-medium">
                          {doc.name || doc.file_name || doc.title || '—'}
                        </TableCell>
                        <TableCell>{formatDate(doc.created_at)}</TableCell>
                        <TableCell className="pr-4">{doc.uploaded_by_name || empName}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {activeTab === 'tasks' && (
        <div className="mt-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Assigned Tasks</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {tasks.length === 0 ? (
                <p className="px-4 py-6 text-sm text-muted-foreground">No tasks assigned to this employee.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/40">
                      <TableHead className="pl-4">Title</TableHead>
                      <TableHead>Due date</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="pr-4 w-10" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {tasks.map((task: any) => (
                      <TableRow key={task.id}>
                        <TableCell className="pl-4 font-medium">{task.title}</TableCell>
                        <TableCell>{task.due_date ? formatDate(task.due_date) : '—'}</TableCell>
                        <TableCell>
                          <Badge
                            className={
                              task.status === 'completed' || task.status === 'done'
                                ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-100'
                                : task.status === 'in_progress'
                                  ? 'bg-blue-100 text-blue-700 hover:bg-blue-100'
                                  : 'bg-amber-100 text-amber-700 hover:bg-amber-100'
                            }
                          >
                            {task.status || 'pending'}
                          </Badge>
                        </TableCell>
                        <TableCell className="pr-4">
                          <button
                            onClick={() => navigate('/tasks')}
                            className="text-muted-foreground hover:text-foreground"
                            aria-label="Go to tasks"
                          >
                            <ExternalLink className="h-4 w-4" />
                          </button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {activeTab === 'logs' && (
        <div className="mt-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Audit Logs</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {auditLogs.length === 0 ? (
                <p className="px-4 py-6 text-sm text-muted-foreground">No activity recorded.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/40">
                      <TableHead className="pl-4">Action</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead className="pr-4 whitespace-nowrap">Date</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {auditLogs.map((log: any) => (
                      <TableRow key={log.id}>
                        <TableCell className="pl-4 font-mono text-xs whitespace-nowrap">
                          {log.action_type || '—'}
                        </TableCell>
                        <TableCell className="text-sm">{log.description || '—'}</TableCell>
                        <TableCell className="pr-4 text-muted-foreground text-xs whitespace-nowrap">
                          {formatDateTime(log.created_at)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {activeTab === 'leave' && (
        <div className="mt-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Leave Requests</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {leaves.length === 0 ? (
                <p className="px-4 py-6 text-sm text-muted-foreground">No leave requests found.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/40">
                      <TableHead className="pl-4">Type</TableHead>
                      <TableHead>Start Date</TableHead>
                      <TableHead>End Date</TableHead>
                      <TableHead>Days</TableHead>
                      <TableHead className="pr-4">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {leaves.map((leave: any) => (
                      <TableRow key={leave.id}>
                        <TableCell className="pl-4 font-medium">{leave.leave_type || leave.type || '—'}</TableCell>
                        <TableCell>{leave.start_date ? formatDate(leave.start_date) : '—'}</TableCell>
                        <TableCell>{leave.end_date ? formatDate(leave.end_date) : '—'}</TableCell>
                        <TableCell>{leave.days ?? '—'}</TableCell>
                        <TableCell className="pr-4">
                          <Badge
                            className={
                              leave.status === 'approved'
                                ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-100'
                                : leave.status === 'rejected' || leave.status === 'denied'
                                  ? 'bg-red-100 text-red-700 hover:bg-red-100'
                                  : 'bg-amber-100 text-amber-700 hover:bg-amber-100'
                            }
                          >
                            {leave.status || 'pending'}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {activeTab === 'expenses' && (
        <div className="mt-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Expenses</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {expenses.length === 0 ? (
                <p className="px-4 py-6 text-sm text-muted-foreground">No expenses found.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/40">
                      <TableHead className="pl-4">Date</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead className="pr-4">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {expenses.map((expense: any) => (
                      <TableRow key={expense.id}>
                        <TableCell className="pl-4">{formatDate(expense.created_at)}</TableCell>
                        <TableCell className="font-medium">{expense.description || '—'}</TableCell>
                        <TableCell>{expense.category || '—'}</TableCell>
                        <TableCell className="text-right">{formatNaira(expense.amount || 0)}</TableCell>
                        <TableCell className="pr-4">
                          <Badge
                            className={
                              expense.status === 'approved'
                                ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-100'
                                : expense.status === 'rejected' || expense.status === 'denied'
                                  ? 'bg-red-100 text-red-700 hover:bg-red-100'
                                  : 'bg-amber-100 text-amber-700 hover:bg-amber-100'
                            }
                          >
                            {expense.status || 'pending'}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {activeTab === 'payroll' && (
        <div className="mt-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Payroll</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {payslips.length === 0 ? (
                <p className="px-4 py-6 text-sm text-muted-foreground">No payslips generated yet.</p>
              ) : (
                <div className="divide-y">
                  {payslips.map((slip: any) => (
                    <div key={slip.id} className="flex items-center justify-between px-4 py-3">
                      <span className="text-sm font-medium">{slip.period || '—'}</span>
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1.5"
                        onClick={() => downloadPayslip(slip.file_url || slip.id)}
                      >
                        <Download className="h-4 w-4" /> Download
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {activeTab === 'increments' && (
        <div className="mt-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Salary Increments</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {increments.length === 0 ? (
                <p className="px-4 py-6 text-sm text-muted-foreground">No salary increments recorded.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/40">
                      <TableHead className="pl-4">Date</TableHead>
                      <TableHead className="text-right">Previous Salary</TableHead>
                      <TableHead className="text-right">New Salary</TableHead>
                      <TableHead className="text-right">Change</TableHead>
                      <TableHead className="pr-4">Reason</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {increments.map((inc: any) => {
                      const diff = (inc.new_salary_ngn || 0) - (inc.old_salary_ngn || 0);
                      return (
                        <TableRow key={inc.id}>
                          <TableCell className="pl-4">{formatDate(inc.effective_date)}</TableCell>
                          <TableCell className="text-right">{formatNaira(inc.old_salary_ngn || 0)}</TableCell>
                          <TableCell className="text-right">{formatNaira(inc.new_salary_ngn || 0)}</TableCell>
                          <TableCell className="text-right">
                            <span className={diff >= 0 ? 'text-emerald-600' : 'text-red-600'}>
                              {diff >= 0 ? '+' : ''}{formatNaira(diff)}
                            </span>
                          </TableCell>
                          <TableCell className="pr-4 text-muted-foreground">{inc.reason || '—'}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>
      )}
      {/* ── Edit Profile dialog ── */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Profile</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-1">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>First name</Label>
                <Input value={form.first_name || ''} onChange={(e) => patch({ first_name: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Last name</Label>
                <Input value={form.last_name || ''} onChange={(e) => patch({ last_name: e.target.value })} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Phone</Label>
              <Input value={form.phone || ''} onChange={(e) => patch({ phone: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Job title</Label>
              <Input value={form.job_title || ''} onChange={(e) => patch({ job_title: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Role</Label>
              <Select value={form.role || ''} onValueChange={(v) => patch({ role: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="super_admin">Super Admin</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="finance">Finance</SelectItem>
                  <SelectItem value="operations">Operations</SelectItem>
                  <SelectItem value="field_staff">Field Staff</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Monthly salary (₦)</Label>
              <Input
                type="number"
                min={0}
                value={form.salary_ngn ?? ''}
                onChange={(e) => patch({ salary_ngn: e.target.value === '' ? 0 : Number(e.target.value) })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditDialog(false)}>Cancel</Button>
            <Button
              onClick={async () => { const ok = await save(); if (ok) setShowEditDialog(false); }}
              disabled={saving}
            >
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Deactivate dialog ── */}
      <Dialog open={confirmDeactivate} onOpenChange={setConfirmDeactivate}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Deactivate {employee?.first_name}?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            They will lose platform access immediately.
            Their records remain visible and this can
            be reversed by an admin.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDeactivate(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDeactivate} disabled={actioning}>
              {actioning && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Deactivate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete & Anonymise dialog ── */}
      <Dialog open={confirmAnonymise} onOpenChange={(o) => { if (!o) { setConfirmAnonymise(false); setAnonymiseInput(''); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-red-600">
              Permanently delete {employee?.first_name}?
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
              <li>Their account will be permanently closed</li>
              <li>Their name and contact details will be erased</li>
              <li>Payment records will show as "Former Employee"</li>
              <li className="text-red-600 font-medium">This CANNOT be undone.</li>
            </ul>
            <p className="text-sm font-medium">Type DELETE to confirm:</p>
            <Input
              value={anonymiseInput}
              onChange={(e) => setAnonymiseInput(e.target.value)}
              placeholder="Type DELETE"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setConfirmAnonymise(false); setAnonymiseInput(''); }}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={anonymiseInput !== 'DELETE' || actioning}
              onClick={handleAnonymise}
            >
              {actioning && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Delete permanently
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Edit Basic Details dialog ── */}
      <Dialog open={showPersonalEditDialog} onOpenChange={setShowPersonalEditDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Edit Basic Details</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-1">
            <div className="space-y-1.5">
              <Label>Date of birth</Label>
              <Input
                type="date"
                value={form.date_of_birth || ''}
                onChange={(e) => patch({ date_of_birth: e.target.value || null })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Gender</Label>
              <Select value={form.gender || ''} onValueChange={(v) => patch({ gender: v || null })}>
                <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="male">Male</SelectItem>
                  <SelectItem value="female">Female</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                  <SelectItem value="prefer_not_to_say">Prefer not to say</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Marital status</Label>
              <Select value={form.marital_status || ''} onValueChange={(v) => patch({ marital_status: v || null })}>
                <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="single">Single</SelectItem>
                  <SelectItem value="married">Married</SelectItem>
                  <SelectItem value="divorced">Divorced</SelectItem>
                  <SelectItem value="widowed">Widowed</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPersonalEditDialog(false)}>Cancel</Button>
            <Button
              onClick={async () => { const ok = await save(); if (ok) setShowPersonalEditDialog(false); }}
              disabled={saving}
            >
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Edit Next of Kin dialog ── */}
      <Dialog open={showKinEditDialog} onOpenChange={setShowKinEditDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Edit Next of Kin</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-1">
            <div className="space-y-1.5">
              <Label>Full name</Label>
              <Input value={form.next_of_kin_name || ''} onChange={(e) => patch({ next_of_kin_name: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Relationship</Label>
              <Input value={form.next_of_kin_relationship || ''} onChange={(e) => patch({ next_of_kin_relationship: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Phone</Label>
              <Input value={form.next_of_kin_phone || ''} onChange={(e) => patch({ next_of_kin_phone: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Email</Label>
              <Input type="email" value={form.next_of_kin_email || ''} onChange={(e) => patch({ next_of_kin_email: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowKinEditDialog(false)}>Cancel</Button>
            <Button
              onClick={async () => { const ok = await save(); if (ok) setShowKinEditDialog(false); }}
              disabled={saving}
            >
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Edit Address dialog ── */}
      <Dialog open={showAddressEditDialog} onOpenChange={setShowAddressEditDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Edit Home Address</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-1">
            <div className="space-y-1.5">
              <Label>Address</Label>
              <Textarea
                rows={3}
                value={form.address || ''}
                onChange={(e) => patch({ address: e.target.value })}
                placeholder="Enter full address…"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddressEditDialog(false)}>Cancel</Button>
            <Button
              onClick={async () => { const ok = await save(); if (ok) setShowAddressEditDialog(false); }}
              disabled={saving}
            >
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
};

export default EmployeeProfile;
