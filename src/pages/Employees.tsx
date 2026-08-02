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
  AlertTriangle,
  UserX,
  Info,
  Check,
  Upload,
} from 'lucide-react';
import EmployeeCsvImport from '@/components/hr/EmployeeCsvImport';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { InfoHint } from '@/components/ui-kit/InfoHint';
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
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { PageHeader } from '@/components/ui-kit/PageHeader';
import { TableSkeleton } from '@/components/ui-kit/TableSkeleton';
import { EmptyState } from '@/components/ui-kit/EmptyState';
import { Pagination } from '@/components/ui-kit/Pagination';
import {
  MobileCard,
  MobileCardHeader,
  MobileCardTitle,
  MobileCardRow,
  MobileCardFooter,
} from '@/components/ui-kit/MobileCard';
import { usePagination } from '@/hooks/usePagination';
import { usePageTitle } from '@/hooks/usePageTitle';
import { cn } from '@/lib/utils';
import { deptBadgeStyle, deptDotStyle } from '@/lib/dept-colors';

interface Tag {
  id: string;
  name: string;
  color: string | null;
  module: string | null;
}

type Role = 'super_admin' | 'admin' | 'finance' | 'operations' | 'field_staff';
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
  tags?: string[] | null;
  department_id?: string | null;
  department?: { id: string; name: string } | null;
  photo_url?: string | null;
}

const ROLE_OPTIONS: { value: Role; label: string }[] = [
  { value: 'super_admin', label: 'Super Admin' },
  { value: 'admin', label: 'Admin' },
  { value: 'finance', label: 'Finance' },
  { value: 'operations', label: 'Operations' },
  { value: 'field_staff', label: 'Field Staff' },
  { value: 'driver', label: 'Driver' },
];

const EMPLOYMENT_TYPES: { value: EmploymentType; label: string }[] = [
  { value: 'full_time', label: 'Full Time' },
  { value: 'part_time', label: 'Part Time' },
  { value: 'contract', label: 'Contract' },
  { value: 'intern', label: 'Intern' },
];

// DEPARTMENTS used to be a hardcoded list — now sourced from the
// public.departments table so HR/admin can manage it from
// Settings → Departments and the change reflects everywhere.
interface DeptOption { id: string; name: string }

const FALLBACK_DEPARTMENTS = [
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
  usePageTitle('Employees');
  const { toast } = useToast();
  const { profile } = useAuthStore();
  const navigate = useNavigate();

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<'all' | Role>('all');
  // 'all' = every employee, 'none' = those with no department set,
  // otherwise the selected department id.
  const [deptFilter, setDeptFilter] = useState<'all' | 'none' | string>('all');

  const [showForm, setShowForm] = useState(false);
  const [showCsvImport, setShowCsvImport] = useState(false);
  const [editing, setEditing] = useState<Employee | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    first_name: '',
    last_name: '',
    email: '',
    phone: '',
    role: 'field_staff' as Role,
    department_id: '',
    employment_type: 'full_time' as EmploymentType,
    start_date: new Date().toISOString().slice(0, 10),
  });

  const [showInactive, setShowInactive] = useState(false);
  const [confirmReactivate, setConfirmReactivate] = useState<Employee | null>(null);
  const [availableTags, setAvailableTags] = useState<Tag[]>([]);
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [departments, setDepartments] = useState<DeptOption[]>([]);

  const isSuperAdmin = profile?.role === 'super_admin';
  const isAdmin = profile?.role === 'admin' || isSuperAdmin;
  const canEditRole = isAdmin;

  const assignableRoles = ROLE_OPTIONS.filter((r) => {
    if (r.value === 'super_admin') return isSuperAdmin;
    return true;
  });

  const fetchEmployees = useCallback(async () => {
    setLoading(true);
    let query = supabase
      .from('profiles')
      .select('id, full_name, first_name, last_name, email, phone, role, status, created_at, tags, photo_url, department_id, department:departments!department_id(id, name)')
      .neq('is_anonymised', true)
      .order('created_at', { ascending: false })
      .limit(500);
    if (!showInactive) {
      query = query.eq('status', 'active');
    }
    const [employeesRes, tagsRes, deptsRes] = await Promise.all([
      query,
      supabase.from('tags').select('*').or('module.eq.all,module.eq.employee').order('name'),
      supabase.from('departments').select('id, name').order('name'),
    ]);
    if (employeesRes.error) {
      toast({ title: 'Error', description: employeesRes.error.message, variant: 'destructive' });
    }
    setEmployees((employeesRes.data as Employee[]) || []);
    setAvailableTags((tagsRes.data as Tag[]) || []);
    setDepartments((deptsRes.data as DeptOption[]) || []);
    setLoading(false);
  }, [showInactive, toast]);

  useEffect(() => {
    fetchEmployees();
  }, [fetchEmployees]);

  const resetForm = () => {
    setSelectedTagIds([]);
    setForm({
      first_name: '',
      last_name: '',
      email: '',
      phone: '',
      role: 'field_staff',
      department_id: '',
      employment_type: 'full_time',
      start_date: new Date().toISOString().slice(0, 10),
    });
  };

  const openEdit = (e: Employee) => {
    setEditing(e);
    setSelectedTagIds(e.tags || []);
    setForm({
      first_name: e.first_name || (e.full_name || '').split(' ')[0] || '',
      last_name: e.last_name || (e.full_name || '').split(' ').slice(1).join(' ') || '',
      email: e.email,
      phone: e.phone || '',
      role: (e.role as Role) || 'field_staff',
      department_id: e.department_id || '',
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
    if (form.role === 'super_admin' && !isSuperAdmin) {
      toast({ title: 'Only a Super Admin can assign the Super Admin role', variant: 'destructive' });
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
      const redirect = `${window.location.origin}/reset-password`;
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
    // signInWithOtp doubles as both "resend invite" (for status='invited'
    // users who never accepted the original link) and "send sign-in link"
    // (for status='active' users who never actually logged in, or who
    // are locked out). Either way Supabase emails them a magic link
    // that lands on /reset-password.
    const isFirstTime = e.status === 'invited';
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: e.email,
        options: {
          shouldCreateUser: true,
          emailRedirectTo: `${window.location.origin}/reset-password`,
          data: { full_name: e.full_name },
        },
      });
      if (error) throw error;
      await logAudit(
        'employee_invite_resent',
        isFirstTime
          ? `Invite resent to ${e.email}`
          : `Sign-in link sent to ${e.email}`,
        profile,
      );
      toast({
        title: isFirstTime ? 'Invite email resent' : 'Sign-in link sent',
        description: `Sent to ${e.email}`,
      });
    } catch (err: any) {
      toast({
        title: isFirstTime ? 'Could not resend invite' : 'Could not send link',
        description: err?.message,
        variant: 'destructive',
      });
    }
  };

  const saveEdit = async () => {
    if (!editing) return;
    const editFullName = `${form.first_name} ${form.last_name}`.trim();
    if (!editFullName) return;
    if (form.role === 'super_admin' && !isSuperAdmin) {
      toast({ title: 'Only a Super Admin can assign the Super Admin role', variant: 'destructive' });
      return;
    }
    setSubmitting(true);
    try {
      const roleChanged = form.role !== editing.role;
      const { data: updated, error } = await supabase
        .from('profiles')
        .update({
          first_name: form.first_name,
          last_name: form.last_name,
          full_name: editFullName,
          phone: form.phone || null,
          role: form.role,
          tags: selectedTagIds,
          department_id: form.department_id || null,
        })
        .eq('id', editing.id)
        .select('id, role');
      if (error) throw error;
      if (!updated || updated.length === 0) {
        toast({ title: 'Update blocked', description: 'Your account does not have permission to edit this employee. Check your role — only admin and super_admin can edit profiles.', variant: 'destructive' });
        setSubmitting(false);
        return;
      }
      if (roleChanged && updated[0]?.role !== form.role) {
        toast({ title: 'Role change blocked', description: `The database rejected the role change. Your role may not have permission to assign "${roleLabel(form.role)}".`, variant: 'destructive' });
        setSubmitting(false);
        return;
      }
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
      toast({ title: roleChanged ? `Role changed to ${roleLabel(form.role)}` : 'Employee updated' });
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

  const reactivateEmployee = async (e: Employee) => {
    const { error } = await supabase.from('profiles').update({ status: 'active' }).eq('id', e.id);
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
      return;
    }
    await logAudit('employee_edited', `Employee "${e.full_name}" reactivated`, profile);
    toast({ title: 'Employee reactivated' });
    setConfirmReactivate(null);
    fetchEmployees();
  };

  const filtered = employees.filter((e) => {
    const q = search.trim().toLowerCase();
    if (roleFilter !== 'all' && e.role !== roleFilter) return false;
    if (deptFilter === 'none' && e.department_id) return false;
    if (deptFilter !== 'all' && deptFilter !== 'none' && e.department_id !== deptFilter) return false;
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
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight">Employees</h1>
            <InfoHint>Your full staff directory. Manage roles, salaries, leave balances and increment history. Invite new employees and control access levels.</InfoHint>
          </div>
          <p className="text-muted-foreground text-sm mt-1">{`${employees.length} team members${inviteCount > 0 ? ` · ${inviteCount} invited` : ''}`}</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {isAdmin && (
            <Button variant="outline" onClick={() => setShowCsvImport(true)}>
              <Upload className="mr-2 h-4 w-4" /> Import CSV
            </Button>
          )}
          {isAdmin && (
            <Button
              onClick={() => {
                resetForm();
                setEditing(null);
                setShowForm(true);
              }}
            >
              <Plus className="mr-2 h-4 w-4" /> Add Employee
            </Button>
          )}
        </div>
      </div>

      <EmployeeCsvImport
        open={showCsvImport}
        onOpenChange={setShowCsvImport}
        departments={departments}
        onComplete={fetchEmployees}
      />

      {/* Mercury-style list wrapper: hairline-bordered surface, sticky
          filter strip, no card chrome. Replaces shadcn Card so the
          page reads as one ledger-grade list. */}
      <div className="rounded-lg border border-border/70 bg-card overflow-hidden">
        <div className="px-3 py-2.5 border-b border-border/70 bg-background/60 backdrop-blur-xl supports-[backdrop-filter]:bg-background/40 sticky top-0 z-10 flex items-center gap-2 flex-wrap print:hidden">
          <div className="relative w-full sm:flex-1 sm:min-w-[200px]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Search by name, email, role…"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                pagination.reset();
              }}
              className="pl-8 h-8 text-[13px] bg-transparent border-border/60"
            />
          </div>
          <Select value={roleFilter} onValueChange={(v) => setRoleFilter(v as any)}>
            <SelectTrigger className="w-[140px] h-8 text-[12px] bg-transparent border-border/60">
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
          <Select value={deptFilter} onValueChange={(v) => setDeptFilter(v as any)}>
            <SelectTrigger className="w-[170px] h-8 text-[12px] bg-transparent border-border/60">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All departments</SelectItem>
              <SelectItem value="none">No department</SelectItem>
              {departments.map((d) => (
                <SelectItem key={d.id} value={d.id}>
                  {d.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <label className="flex items-center gap-2 cursor-pointer select-none text-[12px] text-muted-foreground">
            <Switch
              checked={showInactive}
              onCheckedChange={(v) => { setShowInactive(v); pagination.reset(); }}
            />
            Show inactive
          </label>
        </div>
        <div className="p-0">
          {loading ? (
            <TableSkeleton rows={6} cols={6} />
          ) : filtered.length === 0 ? (
            <EmptyState
              illustration="ghost"
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
              <div className="hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Department</TableHead>
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
                      {/* Avatar + name in a single cell — gives a face to
                          the row at a glance without blowing up the
                          table width with a separate photo column. The
                          photo falls back to initials on the brand
                          gradient when an employee hasn't uploaded one
                          (or for invited rows that haven't accepted). */}
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-3 min-w-0">
                          <EmployeeAvatar
                            photoUrl={e.photo_url ?? null}
                            name={displayName(e.first_name, e.last_name, e.full_name)}
                          />
                          <div className="min-w-0">
                            <div className="truncate">{displayName(e.first_name, e.last_name, e.full_name)}</div>
                            {e.tags && e.tags.length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-1">
                                {e.tags.map((tid) => {
                                  const tag = availableTags.find((t) => t.id === tid);
                                  if (!tag) return null;
                                  return (
                                    <span
                                      key={tid}
                                      className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium"
                                      style={tag.color ? { backgroundColor: `${tag.color}25`, color: tag.color } : undefined}
                                    >
                                      {tag.name}
                                    </span>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="capitalize">{roleLabel(e.role)}</TableCell>
                      <TableCell>
                        {(() => {
                          const name =
                            e.department?.name
                            ?? departments.find((d) => d.id === e.department_id)?.name
                            ?? null;
                          if (!name) return <span className="text-muted-foreground/60">—</span>;
                          return (
                            <span
                              className="inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap"
                              style={deptBadgeStyle(name)}
                            >
                              <span
                                className="h-1.5 w-1.5 rounded-full"
                                style={deptDotStyle(name)}
                              />
                              {name}
                            </span>
                          );
                        })()}
                      </TableCell>
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
                          {/* Resend invite is available on every active /
                              invited employee row — not just `status='invited'`.
                              The original gate hid this from admins who needed
                              to re-invite a "lead" who never signed in for the
                              first time even though their status had been
                              flipped to active by an unrelated edit. The
                              underlying call is supabase.auth.signInWithOtp,
                              which sends a magic link whether the user has
                              signed in before or not — so admins can use this
                              as both first-time invite resend and as a
                              "you're locked out, here's a fresh link" tool. */}
                          {isAdmin && e.status !== 'inactive' && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={(evt) => { evt.stopPropagation(); resendInvite(e); }}
                              title={e.status === 'invited' ? 'Resend invite' : 'Send sign-in link to this user'}
                            >
                              <Mail className="h-4 w-4" />
                            </Button>
                          )}
                          {isAdmin && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={(evt) => { evt.stopPropagation(); openEdit(e); }}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                          )}
                          {isAdmin && e.status === 'active' && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={(evt) => { evt.stopPropagation(); toggleStatus(e); }}
                              title="Deactivate"
                            >
                              <UserX className="h-4 w-4 text-destructive" />
                            </Button>
                          )}
                          {isAdmin && e.status === 'inactive' && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={(evt) => { evt.stopPropagation(); setConfirmReactivate(e); }}
                            >
                              Reactivate
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              </div>

              {/* Mobile employees list */}
              <div className="md:hidden p-3 space-y-2">
                {pagination.slice.map((e) => {
                  const accent =
                    e.status === 'active' ? 'bg-emerald-500'
                    : e.status === 'invited' ? 'bg-amber-500'
                    : 'bg-muted-foreground';
                  return (
                    <MobileCard
                      key={e.id}
                      onClick={() => e.status !== 'invited' && navigate(`/employees/${e.id}`)}
                      accentClassName={accent}
                    >
                      <MobileCardHeader>
                        <EmployeeAvatar
                          photoUrl={e.photo_url ?? null}
                          name={displayName(e.first_name, e.last_name, e.full_name)}
                          size={40}
                        />
                        <div className="min-w-0 flex-1">
                          <MobileCardTitle>{displayName(e.first_name, e.last_name, e.full_name)}</MobileCardTitle>
                          <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                            <p className="text-[11px] text-muted-foreground capitalize">{roleLabel(e.role)}</p>
                            {(() => {
                              const name =
                                e.department?.name
                                ?? departments.find((d) => d.id === e.department_id)?.name
                                ?? null;
                              if (!name) return null;
                              return (
                                <>
                                  <span className="text-muted-foreground/40 text-[10px]">·</span>
                                  <span
                                    className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-semibold"
                                    style={deptBadgeStyle(name)}
                                  >
                                    <span className="h-1 w-1 rounded-full" style={deptDotStyle(name)} />
                                    {name}
                                  </span>
                                </>
                              );
                            })()}
                          </div>
                          {e.tags && e.tags.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-1.5">
                              {e.tags.map((tid) => {
                                const tag = availableTags.find((t) => t.id === tid);
                                if (!tag) return null;
                                return (
                                  <span
                                    key={tid}
                                    className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[9px] font-medium"
                                    style={tag.color ? { backgroundColor: `${tag.color}25`, color: tag.color } : undefined}
                                  >
                                    {tag.name}
                                  </span>
                                );
                              })}
                            </div>
                          )}
                        </div>
                        <Badge variant="secondary" className={cn('shrink-0 h-5 px-2 text-[10px]', STATUS_BADGE[e.status] || STATUS_BADGE.inactive)}>
                          {e.status === 'invited' && <Mail className="h-2.5 w-2.5 mr-1" />}
                          {e.status}
                        </Badge>
                      </MobileCardHeader>

                      <MobileCardRow label="Email">
                        <span className="truncate">{e.email}</span>
                      </MobileCardRow>
                      {e.phone && <MobileCardRow label="Phone">{e.phone}</MobileCardRow>}
                      {e.created_at && <MobileCardRow label="Joined">{formatDate(e.created_at)}</MobileCardRow>}

                      {isAdmin && (
                        <MobileCardFooter>
                          {e.status === 'invited' && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="flex-1 h-9"
                              onClick={(evt) => { evt.stopPropagation(); resendInvite(e); }}
                            >
                              <Mail className="h-4 w-4 mr-1.5" /> Resend invite
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="outline"
                            className="flex-1 h-9"
                            onClick={(evt) => { evt.stopPropagation(); openEdit(e); }}
                          >
                            <Pencil className="h-4 w-4 mr-1.5" /> Edit
                          </Button>
                          {e.status === 'active' && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-9 px-3 text-destructive"
                              onClick={(evt) => { evt.stopPropagation(); toggleStatus(e); }}
                            >
                              <UserX className="h-4 w-4" />
                            </Button>
                          )}
                          {e.status === 'inactive' && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="flex-1 h-9"
                              onClick={(evt) => { evt.stopPropagation(); setConfirmReactivate(e); }}
                            >
                              Reactivate
                            </Button>
                          )}
                        </MobileCardFooter>
                      )}
                    </MobileCard>
                  );
                })}
              </div>

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
        </div>
      </div>

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
                  disabled={!canEditRole}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {assignableRoles.map((r) => (
                      <SelectItem key={r.value} value={r.value}>
                        {r.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {!canEditRole && (
                  <p className="text-xs text-muted-foreground">Only admins can change roles.</p>
                )}
              </div>
              {/* Department + Employment type were create-only — now also
                  shown on edit so HR can re-assign without leaving the
                  employee row. Departments come from the live table so
                  Settings → Departments controls the list everywhere. */}
              <div className="space-y-1">
                <Label>Department</Label>
                <Select
                  value={form.department_id || 'none'}
                  onValueChange={(v) => setForm({ ...form, department_id: v === 'none' ? '' : v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select department…" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— Unassigned —</SelectItem>
                    {departments.length === 0
                      ? FALLBACK_DEPARTMENTS.map((d) => (
                          <SelectItem key={d} value={d} disabled>
                            {d} (add via Settings)
                          </SelectItem>
                        ))
                      : departments.map((d) => (
                          <SelectItem key={d.id} value={d.id}>
                            {d.name}
                          </SelectItem>
                        ))}
                  </SelectContent>
                </Select>
              </div>
              {!editing && (
                <>
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
            {!editing && !isAdmin && (
              <div className="flex items-start gap-2 rounded-md border border-accent/40 bg-accent/5 p-2 text-xs">
                <AlertTriangle className="h-4 w-4 text-accent mt-0.5 shrink-0" />
                <span>
                  Only Admins can invite employees. Ask your administrator to send the invite.
                </span>
              </div>
            )}
            {editing && availableTags.length > 0 && (
              <div className="space-y-1">
                <Label>Tags</Label>
                <div className="flex flex-wrap gap-1.5">
                  {availableTags.map((tag) => {
                    const selected = selectedTagIds.includes(tag.id);
                    return (
                      <button
                        key={tag.id}
                        type="button"
                        onClick={() =>
                          setSelectedTagIds((prev) =>
                            selected ? prev.filter((id) => id !== tag.id) : [...prev, tag.id],
                          )
                        }
                        className={cn(
                          'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium border transition-all',
                          selected ? 'opacity-100' : 'opacity-40 hover:opacity-75',
                        )}
                        style={
                          tag.color
                            ? {
                                backgroundColor: `${tag.color}25`,
                                color: tag.color,
                                borderColor: `${tag.color}50`,
                                outline: selected ? `2px solid ${tag.color}` : undefined,
                                outlineOffset: '1px',
                              }
                            : undefined
                        }
                      >
                        {selected && <Check className="mr-1 h-3 w-3" />}
                        {tag.name}
                      </button>
                    );
                  })}
                </div>
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
                  !isAdmin
                }
              >
                {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                <Mail className="mr-2 h-4 w-4" /> Send invite
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!confirmReactivate} onOpenChange={(v) => { if (!v) setConfirmReactivate(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reactivate {confirmReactivate?.first_name || confirmReactivate?.full_name}?</DialogTitle>
            <DialogDescription>
              They will regain platform access immediately.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmReactivate(null)}>Cancel</Button>
            <Button onClick={() => confirmReactivate && reactivateEmployee(confirmReactivate)}>
              Reactivate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Employees;

// Compact avatar bubble for the roster — shows the uploaded photo
// when available, otherwise initials on the brand gradient. Same
// rendering recipe as ProfileDropdown's AvatarBubble so the platform
// presents one consistent face per user across the sidebar, comments,
// and the employees table. onError falls back to the initials variant
// if the storage object 403s or 404s.
function EmployeeAvatar({
  photoUrl, name, size = 36,
}: {
  photoUrl: string | null;
  name: string;
  size?: number;
}) {
  const initials = (name || '')
    .split(/\s+/).filter(Boolean).slice(0, 2)
    .map((w) => w[0].toUpperCase()).join('') || 'U';
  const fontSize = Math.max(11, Math.round(size * 0.36));
  if (photoUrl) {
    return (
      <img
        src={photoUrl}
        alt=""
        width={size}
        height={size}
        className="rounded-full object-cover ring-2 ring-background shadow-sm shrink-0"
        style={{ height: size, width: size }}
        onError={(e) => {
          const t = e.currentTarget as HTMLImageElement;
          t.replaceWith(makeInitialsBubble(initials, size, fontSize));
        }}
      />
    );
  }
  return (
    <div
      className="rounded-full kd-gradient-brand flex items-center justify-center ring-2 ring-background shadow-sm shrink-0"
      style={{ height: size, width: size }}
    >
      <span className="font-bold text-white" style={{ fontSize }}>{initials}</span>
    </div>
  );
}

// Imperative fallback used by the onError handler — replaces a broken
// <img> with the initials bubble inline so the row never shows a
// broken-image glyph.
function makeInitialsBubble(initials: string, size: number, fontSize: number): HTMLElement {
  const div = document.createElement('div');
  div.className = 'rounded-full flex items-center justify-center ring-2 ring-background shadow-sm shrink-0';
  div.style.height = `${size}px`;
  div.style.width = `${size}px`;
  div.style.background = 'linear-gradient(135deg, #006994 0%, #0481ad 100%)';
  div.innerHTML = `<span style="font-size:${fontSize}px;font-weight:700;color:#fff;">${initials.replace(/[<>"&]/g, '')}</span>`;
  return div;
}
