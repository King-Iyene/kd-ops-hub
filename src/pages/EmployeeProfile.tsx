import { useCallback, useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Mail, Phone, CalendarDays, Save, Loader2, Briefcase,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import { logAudit } from '@/lib/audit';
import { roleBadgeClass, roleLabel } from '@/lib/roles';
import { formatDate, formatNaira } from '@/lib/format';
import { displayName, initialsOf } from '@/lib/name';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

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
  const [form, setForm] = useState<Partial<EmployeeData>>({});
  const [expenses, setExpenses] = useState<any[]>([]);
  const [payslips, setPayslips] = useState<any[]>([]);
  const [leaves, setLeaves] = useState<any[]>([]);
  const [tasks, setTasks] = useState<any[]>([]);

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

    const [expRes, payRes, leaveRes, taskRes] = await Promise.all([
      supabase.from('expenses').select('*').eq('submitted_by', id)
        .order('created_at', { ascending: false }).limit(20),
      supabase.from('payslips').select('*').eq('employee_id', id)
        .order('period', { ascending: false }),
      supabase.from('leave_requests').select('*').eq('employee_id', id)
        .order('created_at', { ascending: false }).limit(20),
      supabase.from('tasks').select('*').eq('assigned_to', id)
        .order('created_at', { ascending: false }).limit(20),
    ]);
    setExpenses(expRes.data || []);
    setPayslips(payRes.data || []);
    setLeaves(leaveRes.data || []);
    setTasks(taskRes.data || []);
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

  return (
    <div className="space-y-6 max-w-4xl">
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
      </div>

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
        </TabsList>

        <TabsContent value="overview" className="mt-4 space-y-4">
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
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-1"><Label>Bank</Label><Input value={form.bank_name || ''} onChange={(e) => patch({ bank_name: e.target.value })} /></div>
                <div className="space-y-1"><Label>Account number</Label><Input value={form.bank_account_number || ''} onChange={(e) => patch({ bank_account_number: e.target.value })} /></div>
                <div className="space-y-1"><Label>Account name</Label><Input value={form.bank_account_name || ''} onChange={(e) => patch({ bank_account_name: e.target.value })} /></div>
              </div>
              <div className="space-y-1"><Label>Pension PIN</Label><Input value={form.pension_pin || ''} onChange={(e) => patch({ pension_pin: e.target.value })} /></div>
            </CardContent>
          </Card>
          <div className="flex justify-end">
            <Button onClick={save} disabled={saving}>
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
      </Tabs>
    </div>
  );
};

export default EmployeeProfile;
