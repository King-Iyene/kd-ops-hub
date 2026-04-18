import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { displayName } from '@/lib/name';
import {
  Loader2,
  Plus,
  Search,
  Pencil,
  Mail,
  UserPlus,
  CheckCircle2,
  AlertTriangle,
  UserX,
  // kept here for brevity — lucide exports only what's referenced above.
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import { logAudit } from '@/lib/audit';
import { formatDate } from '@/lib/format';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { PageHeader } from '@/components/ui-kit/PageHeader';
import { TableSkeleton } from '@/components/ui-kit/TableSkeleton';
import { EmptyState } from '@/components/ui-kit/EmptyState';
import { Pagination } from '@/components/ui-kit/Pagination';
import { usePagination } from '@/hooks/usePagination';

type Role = 'admin' | 'finance' | 'operations' | 'field_staff';
type EmploymentType = 'full_time' | 'part_time' | 'contract' | 'intern';

interface Employee {
  id: string;
  full_name: string;
  first_name: string | null;
  last_name: string | null;
  email: string;
  phone: string | null;
  role: string;
  status: 'active' | 'inactive' | 'invited' | string;
  created_at?: string;
}

const ROLE_OPTIONS: { value: Role; label: string }[] = [
  { value: 'admin', label: 'Admin' },
  { value: 'finance', label: 'Finance' },
  { value: 'operations', label: 'Operations' },
  { value: 'field_staff', label: 'Field Staff' },
];

const EMPLOYMENT_TYPES: { value: EmploymentType; label: string }[] = [
  { value: 'full_time', label: 'Full Time' },
  { value: 'part_time', label: 'Part Time' },
  { value: 'contract', label: 'Contract' },
  { value: 'intern', label: 'Intern' },
];

const DEPARTMENTS = [
  'Finance',
  'Operations',
  'Engineering',
  'People',
  'Sales',
];

const roleLabel = (role: string) =>
  ROLE_OPTIONS.find((r) => r.value === role)?.label ?? role;

const STATUS_BADGE: Record<string, string> = {
  active: 'bg-success/10 text-success',
  inactive: 'bg-muted text-muted-foreground',
  invited: 'bg-accent/15 text-accent-foreground border border-accent/40',
};

const Employees = () => {
  const { toast } = useToast();
  const { profile } = useAuthStore();
  const navigate = useNavigate();

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<'all' | Role>('all');

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Employee | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    first_name: '',
    last_name: '',
    email: '',
    phone: '',
    role: 'field_staff' as Role,
    department: 'Operations',
    employment_type: 'full_time' as EmploymentType,
    start_date: new Date().toISOString().slice(0, 10),
  });

  const isSuperAdmin = profile?.role === 'super_admin';
  const isAdmin = profile?.role === 'admin' || profile?.role === 'super_admin';

  const fetchEmployees = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('profiles')
      .select('id, full_name, email, phone, role, status, created_at')
      .order('created_at', { ascending: false });
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    }
    setEmployees((data as Employee[]) || []);
    setLoading(false);
  }, [toast]);

  useEffect(() => {
    fetchEmployees();
  }, [fetchEmployees]);

  const resetForm = () =>
    setForm({
      first_name: '',
      last_name: '',
      email: '',
      phone: '',
      role: 'field_staff',
      department: 'Operations',
      employment_type: 'full_time',
      start_date: new Date().toISOString().slice(0, 10),
    });

  const openEdit = (e: Employee) => {
    setEditing(e);
    setForm({
      first_name: e.first_name || (e.full_name || '').split(' ')[0] || '',
      last_name: e.last_name || (e.full_name || '').split(' ').slice(1).join(' ') || '',
      email: e.email,
      phone: e.phone || '',
      role: (e.role as Role) || 'field_staff',
      department: 'Operations',
      employment_type: 'full_time',
      start_date: new Date().toISOString().slice(0, 10),
    });
    setShowForm(true);
  };

  // Invite flow:
  //   1. Write a pending_invites row with pre-assigned role / phone / name.
  //   2. Seed a placeholder profile row with status='invited' so the new
  //      employee is visible in the roster immediately.
  //   3. Send a Supabase OTP magic-link to their email — creates the auth
  //      user when they click, and the handle_new_user_invite trigger applies
  //      the role and flips status to 'active'.
  //
  // No service-role key, no self-registration.
  const inviteEmployee = async () => {
    const fullName = `${form.first_name} ${form.last_name}`.trim();
    if (!fullName || !form.email.trim()) {
      toast({ title: 'Name and email are required', variant: 'destructive' });
      return;
    }
    if (form.role === ('super_admin' as any)) {
      toast({ title: 'Super Admin role cannot be assigned here', variant: 'destructive' });
      return;
    }
    setSubmitting(true);
    try {
      // Step 1 — record the invite (idempotent upsert by email).
      const { error: inviteErr } = await supabase.from('pending_invites').upsert(
        {
          email: form.email.trim().toLowerCase(),
          full_name: fullName,
          role: form.role,
          phone: form.phone || null,
          invited_by: profile?.id || null,
        },
        { onConflict: 'email' },
      );
      if (inviteErr) throw inviteErr;

      // Step 2 — pre-seed the invited profile so the employee shows up with
      // status='invited' before accepting.
      await supabase.rpc('seed_invited_profile', {
        p_email: form.email.trim().toLowerCase(),
        p_full_name: fullName,
        p_phone: form.phone || null,
        p_role: form.role,
      });

      // Step 3 — send the OTP magic-link invite email. Supabase auto-creates
      // the auth user on click and the DB trigger handles role assignment.
      const redirect = `${window.location.origin}/profile`;
      const { error: otpErr } = await supabase.auth.signInWithOtp({
        email: form.email.trim().toLowerCase(),
        options: {
          shouldCreateUser: true,
          emailRedirectTo: redirect,
          data: {
            full_name: fullName,
          },
        },
      });
      if (otpErr) {
        // Don't block the invite record — surface the email error but keep the
        // invited profile visible so Admin can "Resend invite" later.
        toast({
          title: 'Invite recorded, email failed',
          description:
            otpErr.message + ' — click Resend invite to try again.',
          variant: 'destructive',
        });
      } else {
        toast({
          title: 'Invite sent',
          description: `${form.email.trim()} will appear as "Invited" until they set their password.`,
        });
      }

      await logAudit(
        'employee_added',
        `Invited ${fullName} (${form.email}) as ${roleLabel(form.role)}`,
        profile,
      );
      setShowForm(false);
      resetForm();
      fetchEmployees();
    } catch (err: any) {
      toast({
        title: 'Invite failed',
        description: err?.message,
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const resendInvite = async (e: Employee) => {
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: e.email,
        options: {
          shouldCreateUser: true,
          emailRedirectTo: `${window.location.origin}/profile`,
          data: { full_name: e.full_name },
        },
      });
      if (error) throw error;
      await logAudit(
        'employee_invite_resent',
        `Invite resent to ${e.email}`,
        profile,
      );
      toast({ title: 'Invite email resent' });
    } catch (err: any) {
      toast({
        title: 'Could not resend invite',
        description: err?.message,
        variant: 'destructive',
      });
    }
  };

  const saveEdit = async () => {
    if (!editing) return;
    const editFullName = `${form.first_name} ${form.last_name}`.trim();
    if (!editFullName) return;
    setSubmitting(true);
    try {
      const roleChanged = form.role !== editing.role;
      const { error } = await supabase
        .from('profiles')
        .update({
          first_name: form.first_name,
          last_name: form.last_name,
          full_name: editFullName,
          phone: form.phone || null,
          role: form.role,
        })
        .eq('id', editing.id);
      if (error) throw error;
      if (roleChanged) {
        await logAudit(
          'role_changed',
          `Employee ${editing.full_name}: ${roleLabel(editing.role)} → ${roleLabel(form.role)}`,
          profile,
        );
      } else {
        await logAudit(
          'employee_edited',
          `Employee "${editFullName}" updated`,
          profile,
        );
      }
      toast({ title: 'Employee updated' });
      setShowForm(false);
      setEditing(null);
      resetForm();
      fetchEmployees();
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  const toggleStatus = async (e: Employee) => {
    if (e.status === 'invited') return;
    const next = e.status === 'active' ? 'inactive' : 'active';
    const { error } = await supabase
      .from('profiles')
      .update({ status: next })
      .eq('id', e.id);
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
      return;
    }
    await logAudit(
      next === 'inactive' ? 'employee_deactivated' : 'employee_edited',
      `Employee "${e.full_name}" ${next === 'inactive' ? 'deactivated' : 'reactivated'}`,
      profile,
    );
    toast({ title: `Employee ${next}` });
    fetchEmployees();
  };

  const filtered = employees.filter((e) => {
    const q = search.trim().toLowerCase();
    if (roleFilter !== 'all' && e.role !== roleFilter) return false;
    if (!q) return true;
    return (
      displayName(e.first_name, e.last_name, e.full_name).toLowerCase().includes(q) ||
      e.email.toLowerCase().includes(q) ||
      (e.phone || '').toLowerCase().includes(q) ||
      roleLabel(e.role).toLowerCase().includes(q)
    );
  });

  const pagination = usePagination(filtered, 20);

  const inviteCount = employees.filter((e) => e.status === 'invited').length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Employees"
        description={`${employees.length} team members${inviteCount > 0 ? ` · ${inviteCount} invited` : ''}`}
        actions={
          isAdmin && (
            <Button
              onClick={() => {
                resetForm();
                setEditing(null);
                setShowForm(true);
              }}
            >
              <Plus className="mr-2 h-4 w-4" /> Add Employee
            </Button>
          )
        }
      />

      <Card>
        <div className="p-4 border-b flex items-center gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by name, email, role..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                pagination.reset();
              }}
              className="pl-9"
            />
          </div>
          <Select value={roleFilter} onValueChange={(v) => setRoleFilter(v as any)}>
            <SelectTrigger className="w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All roles</SelectItem>
              {ROLE_OPTIONS.map((r) => (
                <SelectItem key={r.value} value={r.value}>
                  {r.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <CardContent className="p-0">
          {loading ? (
            <TableSkeleton rows={6} cols={6} />
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={UserPlus}
              title="No employees match"
              description="Invite a teammate to get started."
              action={
                isAdmin ? (
                  <Button
                    onClick={() => {
                      resetForm();
                      setEditing(null);
                      setShowForm(true);
                    }}
                  >
                    <Plus className="mr-2 h-4 w-4" /> Invite employee
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead>Joined</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pagination.slice.map((e) => (
                    <TableRow key={e.id} className="kd-transition cursor-pointer" onClick={() => e.status !== 'invited' && navigate(`/employees/${e.id}`)}>
                      <TableCell className="font-medium">
                        {displayName(e.first_name, e.last_name, e.full_name)}
                      </TableCell>
                      <TableCell className="capitalize">{roleLabel(e.role)}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {e.email}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {e.phone || '—'}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {e.created_at ? formatDate(e.created_at) : '—'}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="secondary"
                          className={STATUS_BADGE[e.status] || STATUS_BADGE.inactive}
                        >
                          {e.status === 'invited' && <Mail className="h-3 w-3 mr-1" />}
                          {e.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          {e.status === 'invited' && isAdmin && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => resendInvite(e)}
                              title="Resend invite"
                            >
                              <Mail className="h-4 w-4" />
                            </Button>
                          )}
                          {isAdmin && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => openEdit(e)}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                          )}
                          {isAdmin && e.status !== 'invited' && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => toggleStatus(e)}
                              title={e.status === 'active' ? 'Deactivate' : 'Reactivate'}
                            >
                              {e.status === 'active' ? (
                                <UserX className="h-4 w-4 text-destructive" />
                              ) : (
                                <CheckCircle2 className="h-4 w-4 text-success" />
                              )}
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <Pagination
                page={pagination.page}
                totalPages={pagination.totalPages}
                totalItems={pagination.totalItems}
                pageSize={pagination.pageSize}
                onPrev={pagination.prev}
                onNext={pagination.next}
                hasPrev={pagination.hasPrev}
                hasNext={pagination.hasNext}
              />
            </>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={showForm}
        onOpenChange={(v) => {
          setShowForm(v);
          if (!v) {
            setEditing(null);
            resetForm();
          }
        }}
      >
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>
              {editing ? 'Edit Employee' : 'Invite New Employee'}
            </DialogTitle>
            <DialogDescription>
              {editing
                ? 'Update their role, name or phone. Email stays read-only.'
                : 'We will email them a secure one-time link to set their password and join KDOps.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>First Name</Label>
                <Input
                  value={form.first_name}
                  onChange={(e) => setForm({ ...form, first_name: e.target.value })}
                  placeholder="e.g. Ada"
                />
              </div>
              <div className="space-y-1">
                <Label>Last Name</Label>
                <Input
                  value={form.last_name}
                  onChange={(e) => setForm({ ...form, last_name: e.target.value })}
                  placeholder="e.g. Okonkwo"
                />
              </div>
              <div className="space-y-1 col-span-2 sm:col-span-1">
                <Label>Email</Label>
                <Input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  placeholder="teammate@kdsquares.com"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Phone</Label>
                <Input
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  placeholder="+234..."
                />
              </div>
              <div className="space-y-1">
                <Label>Role</Label>
                <Select
                  value={form.role}
                  onValueChange={(v) => setForm({ ...form, role: v as Role })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ROLE_OPTIONS.map((r) => (
                      <SelectItem key={r.value} value={r.value}>
                        {r.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {!editing && (
                <>
                  <div className="space-y-1">
                    <Label>Department</Label>
                    <Select
                      value={form.department}
                      onValueChange={(v) => setForm({ ...form, department: v })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {DEPARTMENTS.map((d) => (
                          <SelectItem key={d} value={d}>
                            {d}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label>Employment Type</Label>
                    <Select
                      value={form.employment_type}
                      onValueChange={(v) =>
                        setForm({ ...form, employment_type: v as EmploymentType })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {EMPLOYMENT_TYPES.map((t) => (
                          <SelectItem key={t.value} value={t.value}>
                            {t.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1 col-span-2 sm:col-span-1">
                    <Label>Start Date</Label>
                    <Input
                      type="date"
                      value={form.start_date}
                      onChange={(e) => setForm({ ...form, start_date: e.target.value })}
                    />
                  </div>
                </>
              )}
            </div>
            {!editing && !isSuperAdmin && (
              <div className="flex items-start gap-2 rounded-md border border-accent/40 bg-accent/5 p-2 text-xs">
                <AlertTriangle className="h-4 w-4 text-accent mt-0.5 shrink-0" />
                <span>
                  Only Super Admin can invite employees. Admin can edit existing ones.
                </span>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowForm(false);
                setEditing(null);
                resetForm();
              }}
            >
              Cancel
            </Button>
            {editing ? (
              <Button
                onClick={saveEdit}
                disabled={submitting || !form.first_name.trim()}
              >
                {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save changes
              </Button>
            ) : (
              <Button
                onClick={inviteEmployee}
                disabled={
                  submitting ||
                  !form.first_name.trim() ||
                  !form.email.trim() ||
                  !isSuperAdmin
                }
              >
                {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                <Mail className="mr-2 h-4 w-4" /> Send invite
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Employees;
