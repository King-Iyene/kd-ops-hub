/**
 * My Profile — self-service profile + activity hub.
 *
 * Centred two-column hero (photo + identity), then tabbed content:
 *   • Account   — name / phone / email / password
 *   • Requests  — every expense, leave, fuel and repair the user has
 *                 raised, regardless of status
 *   • Payslips  — list with download
 *   • Security  — MFA, push notifications, privacy
 *
 * Avatar upload is self-edit only. Admins changing other employees'
 * photos do it from /employees/{id} (EmployeeProfile.tsx). The avatars
 * bucket policy enforces that — first folder must equal auth.uid()
 * unless the caller has admin / super_admin role.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Loader2, Save, KeyRound, Mail, Phone, CalendarDays, Download,
  FileText, Camera, Receipt, Truck, ChevronRight, Inbox,
  CheckCircle2, Clock, XCircle, ExternalLink, UserCog, Ban,
} from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import { logAudit } from '@/lib/audit';
import { roleBadgeClass, roleLabel } from '@/lib/roles';
import { formatDate, formatNaira, formatDateTime, toIsoDate } from '@/lib/format';
import { computePayslip } from '@/lib/tax';
import { compressImage } from '@/lib/image-compression';
import { openPayslipPrintWindow, downloadPayslipPdfFromHtml, openStoredPayslipHtml, downloadStoredPayslipHtml } from '@/lib/payslip';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { notifyRoles } from '@/lib/notify';
import MfaSettings from '@/components/settings/MfaSettings';
import PrivacyPanel from '@/components/PrivacyPanel';
import { StickyActionBar } from '@/components/ui-kit/StickyActionBar';
import { EmptyState } from '@/components/ui-kit/EmptyState';
import { PushNotificationsToggle } from '@/components/profile/PushNotificationsToggle';

// ── Types ────────────────────────────────────────────────────────

interface Payslip {
  id: string;
  period: string;
  gross_ngn: number;
  paye_ngn: number;
  pension_ngn: number;
  nhf_ngn: number;
  net_ngn: number;
  storage_path: string | null;
  created_at: string;
}

interface EmploymentRow {
  job_title: string | null;
  employee_number: string | null;
  employment_type: string | null;
  start_date: string | null;
  annual_leave_days: number | null;
  salary_ngn: number | null;
  department: { name: string } | null;
  tax_id: string | null;
  tin: string | null;
  nin: string | null;
  pension_pin: string | null;
  pension_enabled: boolean | null;
  nhf_number: string | null;
  nhf_enabled: boolean | null;
  nhis_number: string | null;
  nhis_enabled: boolean | null;
  paye_enabled: boolean | null;
  bank_name: string | null;
  bank_account_number: string | null;
  bank_account_name: string | null;
  date_of_birth: string | null;
  gender: string | null;
  marital_status: string | null;
  address: string | null;
  next_of_kin_name: string | null;
  next_of_kin_relationship: string | null;
  next_of_kin_phone: string | null;
  next_of_kin_email: string | null;
}

interface DelegationRow {
  id: string;
  delegate_id: string;
  delegate_name: string;
  start_date: string;
  end_date: string;
  reason: string | null;
  is_active: boolean;
  approval_types: string[];
}

const APPROVAL_TYPE_OPTIONS: Array<{ value: 'leave' | 'expense' | 'advance'; label: string }> = [
  { value: 'leave', label: 'Leave' },
  { value: 'expense', label: 'Expense' },
  { value: 'advance', label: 'Salary advance' },
];

interface RequestRow {
  id: string;
  kind: 'expense' | 'leave' | 'fuel';
  title: string;
  subtitle: string;
  amountNgn: number | null;
  status: string;
  createdAt: string;
  href: string;
}

// ── Helpers ──────────────────────────────────────────────────────

const initialsOf = (name?: string | null, email?: string | null): string => {
  const source = (name || email || '').trim();
  if (!source) return 'U';
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return source.charAt(0).toUpperCase();
  const first = parts[0]?.charAt(0) ?? '';
  const last  = parts.length > 1 ? parts[parts.length - 1].charAt(0) : '';
  return (first + last).toUpperCase() || 'U';
};

const monthLabel = (period: string) => {
  const [y, m] = period.split('-');
  return new Date(parseInt(y, 10), parseInt(m, 10) - 1, 1).toLocaleString(
    'en-GB',
    { month: 'long', year: 'numeric' },
  );
};

const REQUEST_META: Record<RequestRow['kind'], { label: string; icon: typeof Receipt; bg: string; fg: string }> = {
  expense: { label: 'Expense', icon: Receipt,      bg: 'bg-emerald-500/10', fg: 'text-emerald-600 dark:text-emerald-400' },
  leave:   { label: 'Leave',   icon: CalendarDays, bg: 'bg-violet-500/10',  fg: 'text-violet-600 dark:text-violet-400' },
  fuel:    { label: 'Fuel',    icon: Truck,        bg: 'bg-amber-500/10',   fg: 'text-amber-600 dark:text-amber-400' },
};

const STATUS_TONE: Record<string, { Icon: typeof CheckCircle2; bg: string; fg: string; label: string }> = {
  approved:  { Icon: CheckCircle2, bg: 'bg-emerald-500/15', fg: 'text-emerald-700 dark:text-emerald-400', label: 'Approved' },
  paid:      { Icon: CheckCircle2, bg: 'bg-emerald-500/15', fg: 'text-emerald-700 dark:text-emerald-400', label: 'Paid' },
  completed: { Icon: CheckCircle2, bg: 'bg-emerald-500/15', fg: 'text-emerald-700 dark:text-emerald-400', label: 'Completed' },
  pending:   { Icon: Clock,        bg: 'bg-amber-500/15',   fg: 'text-amber-700 dark:text-amber-400',     label: 'Pending' },
  rejected:  { Icon: XCircle,      bg: 'bg-red-500/15',     fg: 'text-red-700 dark:text-red-400',         label: 'Rejected' },
  failed:    { Icon: XCircle,      bg: 'bg-red-500/15',     fg: 'text-red-700 dark:text-red-400',         label: 'Failed' },
  draft:     { Icon: Clock,        bg: 'bg-muted',          fg: 'text-muted-foreground',                  label: 'Draft' },
};

function tone(status: string) {
  const key = (status || '').toLowerCase();
  return STATUS_TONE[key] ?? { Icon: Clock, bg: 'bg-muted', fg: 'text-muted-foreground', label: status || '—' };
}

/** Show only the last 4 digits of an account number; never the full PAN. */
const maskAccount = (acct: string | null): string => {
  if (!acct) return '—';
  const digits = acct.replace(/\s+/g, '');
  if (digits.length <= 4) return digits;
  return `•••• ${digits.slice(-4)}`;
};

// Read-only label/value pair used across the Employment tab.
const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="min-w-0">
    <p className="text-xs text-muted-foreground">{label}</p>
    <div className="text-sm font-medium break-words">{children}</div>
  </div>
);

// Enrolled / Not enrolled pill for statutory toggles.
const EnrolBadge = ({ on }: { on: boolean }) => (
  <Badge
    variant="outline"
    className={cn(
      'font-medium',
      on
        ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30'
        : 'bg-muted text-muted-foreground border-border',
    )}
  >
    {on ? 'Enrolled' : 'Not enrolled'}
  </Badge>
);

// ── Component ────────────────────────────────────────────────────

const ProfilePage = () => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const profile = useAuthStore((s) => s.profile);
  const setProfile = useAuthStore((s) => s.setProfile);

  // Tab is URL-driven so links (e.g. the "My Pay" nav item) can deep-link
  // straight to a section like ?tab=payslips.
  const TAB_KEYS = ['account', 'employment', 'requests', 'delegation', 'payslips', 'security'] as const;
  const tabParam = searchParams.get('tab');
  const activeTab = (TAB_KEYS as readonly string[]).includes(tabParam || '')
    ? (tabParam as string)
    : 'account';
  const setActiveTab = (v: string) => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (v === 'account') next.delete('tab');
        else next.set('tab', v);
        return next;
      },
      { replace: true },
    );
  };

  // Photo upload
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  // Account form
  const [fullName, setFullName] = useState(profile?.full_name || '');
  const [phone, setPhone] = useState(profile?.phone || '');
  const [savingProfile, setSavingProfile] = useState(false);
  const [newEmail, setNewEmail] = useState(profile?.email || '');
  const [updatingEmail, setUpdatingEmail] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);

  // ESS depth: own documents, leave balance, personal-info edit, bank-change request
  const [documents, setDocuments] = useState<any[]>([]);
  const [leaveBalance, setLeaveBalance] = useState<any | null>(null);
  const [bankPending, setBankPending] = useState<any | null>(null);
  const [editPersonal, setEditPersonal] = useState(false);
  const [savingPersonal, setSavingPersonal] = useState(false);
  const [personalForm, setPersonalForm] = useState({
    date_of_birth: '', gender: '', marital_status: '', address: '',
    next_of_kin_name: '', next_of_kin_relationship: '', next_of_kin_phone: '', next_of_kin_email: '',
  });
  const [showBankForm, setShowBankForm] = useState(false);
  const [submittingBank, setSubmittingBank] = useState(false);
  const [bankForm, setBankForm] = useState({ bank_name: '', account_number: '', account_name: '', reason: '' });

  // Data
  const [payslips, setPayslips] = useState<Payslip[]>([]);
  const [requests, setRequests] = useState<RequestRow[]>([]);
  const [employment, setEmployment] = useState<EmploymentRow | null>(null);
  const [advanceReqs, setAdvanceReqs] = useState<any[]>([]);
  const [showAdvanceForm, setShowAdvanceForm] = useState(false);
  const [advanceForm, setAdvanceForm] = useState({ amount: '', months: '3', reason: '' });
  const [submittingAdvance, setSubmittingAdvance] = useState(false);
  const [loadingActivity, setLoadingActivity] = useState(true);

  // Approval delegation ("cover me while I'm out")
  const [directoryOptions, setDirectoryOptions] = useState<Array<{ id: string; full_name: string | null; email: string }>>([]);
  const [delegations, setDelegations] = useState<DelegationRow[]>([]);
  const [loadingDelegations, setLoadingDelegations] = useState(true);
  const [delegateId, setDelegateId] = useState('');
  const [delegationStart, setDelegationStart] = useState(toIsoDate(new Date()));
  const [delegationEnd, setDelegationEnd] = useState(toIsoDate(new Date()));
  const [delegationTypes, setDelegationTypes] = useState<string[]>(['leave', 'expense', 'advance']);
  const [delegationReason, setDelegationReason] = useState('');
  const [savingDelegation, setSavingDelegation] = useState(false);
  const [cancellingDelegationId, setCancellingDelegationId] = useState<string | null>(null);

  const loadAll = useCallback(async () => {
    if (!profile?.id) return;
    setLoadingActivity(true);

    // Pull each request type in parallel. Each query is best-effort —
    // if a table is missing on a tenant or RLS blocks a column the
    // others still render. Column names match the canonical schemas
    // shipped in supabase/migrations:
    //   • expenses        → submitted_by, category, amount_ngn, date,
    //                       description, status, created_at
    //   • leave_requests  → employee_id, leave_type, days_requested,
    //                       start_date, end_date, reason, status
    //   • fuel_requests   → driver_id, vehicle_id, amount_ngn,
    //                       station_name, reason, status
    //   • vehicle_maintenance is a service-schedule table, not a
    //     user-raised request, so it isn't pulled here.
    const [psRes, exRes, lvRes, flRes, empRes, advRes, docsRes, balRes, bankPendRes] = await Promise.all([
      supabase.from('payslips')
        .select('*').eq('employee_id', profile.id).order('period', { ascending: false }),
      supabase.from('expenses')
        .select('id, category, amount_ngn, status, date, created_at, description')
        .eq('submitted_by', profile.id).is('deleted_at', null).order('created_at', { ascending: false }).limit(50),
      supabase.from('leave_requests')
        .select('id, leave_type, days_requested, status, start_date, end_date, created_at, reason')
        .eq('employee_id', profile.id).is('deleted_at', null).order('created_at', { ascending: false }).limit(50),
      supabase.from('fuel_requests')
        .select('id, vehicle_id, amount_ngn, status, created_at, station_name, reason')
        .eq('driver_id', profile.id).is('deleted_at', null).order('created_at', { ascending: false }).limit(50),
      // The signed-in user's own employment / statutory / compensation record.
      // RLS already restricts a profiles row to its owner, so this returns only
      // the caller's data. Read-only here — changes go through HR.
      supabase.from('profiles')
        .select(`
          job_title, employee_number, employment_type, start_date, annual_leave_days,
          salary_ngn, tax_id, tin, nin, pension_pin, pension_enabled,
          nhf_number, nhf_enabled, nhis_number, nhis_enabled, paye_enabled,
          bank_name, bank_account_number, bank_account_name,
          date_of_birth, gender, marital_status, address,
          next_of_kin_name, next_of_kin_relationship, next_of_kin_phone, next_of_kin_email,
          department:departments!department_id(name)
        `)
        .eq('id', profile.id)
        .maybeSingle(),
      (supabase as any).from('advance_requests')
        .select('id, amount_ngn, repayment_months, reason, status, rejection_reason, created_at')
        .eq('employee_id', profile.id).order('created_at', { ascending: false }).limit(50),
      supabase.from('documents')
        .select('id, title, category, storage_path, expires_at, created_at')
        .eq('employee_id', profile.id).is('deleted_at', null)
        .order('created_at', { ascending: false }).limit(50),
      supabase.from('leave_balances')
        .select('annual_quota, annual_used, sick_used, unpaid_used, year')
        .eq('employee_id', profile.id).eq('year', new Date().getFullYear()).maybeSingle(),
      (supabase as any).from('bank_account_change_requests')
        .select('id, status, new_bank_name, new_account_number, created_at')
        .eq('employee_id', profile.id).eq('status', 'pending')
        .order('created_at', { ascending: false }).limit(1),
    ]);

    setPayslips((psRes.data as Payslip[]) || []);
    setEmployment((empRes.data as unknown as EmploymentRow) || null);
    setAdvanceReqs((advRes?.data as any[]) || []);
    setDocuments((docsRes?.data as any[]) || []);
    setLeaveBalance((balRes?.data as any) || null);
    setBankPending(((bankPendRes?.data as any[]) || [])[0] || null);

    const all: RequestRow[] = [];
    for (const e of (exRes.data ?? []) as any[]) {
      all.push({
        id: `ex-${e.id}`, kind: 'expense',
        title: (e.category || 'Expense').replace(/_/g, ' '),
        subtitle: e.description || formatDate(e.date),
        amountNgn: Number(e.amount_ngn || 0), status: e.status || 'pending',
        createdAt: e.created_at, href: `/expenses?id=${e.id}`,
      });
    }
    for (const l of (lvRes.data ?? []) as any[]) {
      const days = Number(l.days_requested || 0);
      all.push({
        id: `lv-${l.id}`, kind: 'leave',
        title: `${(l.leave_type || 'Leave').replace(/_/g, ' ')} · ${days} day${days === 1 ? '' : 's'}`,
        subtitle: l.reason || `${formatDate(l.start_date)} → ${formatDate(l.end_date)}`,
        amountNgn: null, status: l.status || 'pending',
        createdAt: l.created_at, href: '/leave',
      });
    }
    for (const f of (flRes.data ?? []) as any[]) {
      all.push({
        id: `fl-${f.id}`, kind: 'fuel',
        title: `Fuel${f.station_name ? ` · ${f.station_name}` : ''}`,
        subtitle: f.reason || `Vehicle: ${f.vehicle_id ?? '—'}`,
        amountNgn: Number(f.amount_ngn || 0), status: f.status || 'pending',
        createdAt: f.created_at, href: '/fleet',
      });
    }
    all.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    setRequests(all);
    setLoadingActivity(false);
  }, [profile?.id]);

  useEffect(() => { loadAll(); }, [loadAll]);

  const loadDelegations = useCallback(async () => {
    if (!profile?.id) return;
    setLoadingDelegations(true);
    const [dirRes, delRes] = await Promise.all([
      supabase.from('profiles_directory')
        .select('id, full_name, email')
        .eq('status', 'active')
        .neq('id', profile.id)
        .order('full_name'),
      (supabase as any).from('approval_delegations')
        .select('id, delegate_id, start_date, end_date, reason, is_active, approval_types')
        .eq('delegator_id', profile.id)
        .order('start_date', { ascending: false }),
    ]);
    const dir = (dirRes.data as Array<{ id: string; full_name: string | null; email: string }>) || [];
    setDirectoryOptions(dir);
    const nameOf = (id: string) => dir.find((d) => d.id === id)?.full_name || dir.find((d) => d.id === id)?.email || 'Unknown';
    const rows: DelegationRow[] = ((delRes?.data as any[]) || []).map((d) => ({
      id: d.id,
      delegate_id: d.delegate_id,
      delegate_name: nameOf(d.delegate_id),
      start_date: d.start_date,
      end_date: d.end_date,
      reason: d.reason,
      is_active: !!d.is_active,
      approval_types: d.approval_types || [],
    }));
    setDelegations(rows);
    setLoadingDelegations(false);
  }, [profile?.id]);

  useEffect(() => { loadDelegations(); }, [loadDelegations]);

  const toggleDelegationType = (type: string) => {
    setDelegationTypes((prev) => (prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]));
  };

  const createDelegation = async () => {
    if (!profile?.id) return;
    if (!delegateId) {
      toast({ title: 'Choose a delegate', variant: 'destructive' });
      return;
    }
    if (delegationEnd < delegationStart) {
      toast({ title: 'End date must be on or after the start date', variant: 'destructive' });
      return;
    }
    if (delegationTypes.length === 0) {
      toast({ title: 'Choose at least one approval type', variant: 'destructive' });
      return;
    }
    setSavingDelegation(true);
    try {
      const { error } = await (supabase as any).from('approval_delegations').insert({
        delegator_id: profile.id,
        delegate_id: delegateId,
        start_date: delegationStart,
        end_date: delegationEnd,
        reason: delegationReason || null,
        approval_types: delegationTypes,
      });
      if (error) throw error;
      await logAudit(
        'approval_delegation_created',
        `Delegated ${delegationTypes.join(', ')} approvals to a backup approver: ${formatDate(delegationStart)} → ${formatDate(delegationEnd)}`,
        profile,
      );
      toast({ title: 'Delegation set' });
      setDelegateId('');
      setDelegationReason('');
      setDelegationTypes(['leave', 'expense', 'advance']);
      loadDelegations();
    } catch (err: any) {
      toast({ title: 'Could not set delegation', description: err?.message, variant: 'destructive' });
    } finally {
      setSavingDelegation(false);
    }
  };

  const cancelDelegation = async (row: DelegationRow) => {
    setCancellingDelegationId(row.id);
    try {
      const { error } = await (supabase as any)
        .from('approval_delegations')
        .update({ is_active: false })
        .eq('id', row.id);
      if (error) throw error;
      await logAudit('approval_delegation_cancelled', `Cancelled approval delegation to ${row.delegate_name}`, profile);
      toast({ title: 'Delegation cancelled' });
      loadDelegations();
    } catch (err: any) {
      toast({ title: 'Could not cancel delegation', description: err?.message, variant: 'destructive' });
    } finally {
      setCancellingDelegationId(null);
    }
  };

  // Seed the personal-info edit form from the loaded employment record.
  useEffect(() => {
    if (!employment) return;
    setPersonalForm({
      date_of_birth: employment.date_of_birth || '',
      gender: employment.gender || '',
      marital_status: employment.marital_status || '',
      address: employment.address || '',
      next_of_kin_name: employment.next_of_kin_name || '',
      next_of_kin_relationship: employment.next_of_kin_relationship || '',
      next_of_kin_phone: employment.next_of_kin_phone || '',
      next_of_kin_email: employment.next_of_kin_email || '',
    });
  }, [employment]);

  const [downloadingSlip, setDownloadingSlip] = useState<string | null>(null);
  const [previewingSlip, setPreviewingSlip] = useState<string | null>(null);

  const stats = useMemo(() => {
    const pending = requests.filter((r) => /pending|draft/i.test(r.status)).length;
    return { pending, total: requests.length, payslips: payslips.length };
  }, [requests, payslips]);

  // Indicative monthly compensation breakdown from the employee's own gross
  // and statutory toggles. The issued payslip is authoritative — this mirrors
  // the same vetted computePayslip() used by payroll.
  const comp = useMemo(() => {
    const gross = Number(employment?.salary_ngn || 0);
    if (gross <= 0) return null;
    return computePayslip({
      grossMonthlyNgn: gross,
      payeEnabled: employment?.paye_enabled !== false,
      pensionEnabled: employment?.pension_enabled !== false,
      nhfEnabled: employment?.nhf_enabled === true,
      nhisEnabled: employment?.nhis_enabled === true,
    });
  }, [employment]);

  // Year-to-date totals across this calendar year's payslips.
  const ytd = useMemo(() => {
    const year = String(new Date().getFullYear());
    return payslips
      .filter((p) => p.period?.startsWith(year))
      .reduce(
        (acc, p) => ({
          gross: acc.gross + (p.gross_ngn || 0),
          paye: acc.paye + (p.paye_ngn || 0),
          pension: acc.pension + (p.pension_ngn || 0),
          net: acc.net + (p.net_ngn || 0),
          count: acc.count + 1,
        }),
        { gross: 0, paye: 0, pension: 0, net: 0, count: 0 },
      );
  }, [payslips]);

  if (!profile) {
    return (
      <div className="min-h-[40vh] flex items-center justify-center text-sm text-muted-foreground" role="status" aria-live="polite">
        <Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading profile…
      </div>
    );
  }

  const initials = initialsOf(profile.full_name, profile.email);
  const dirtyAccount = fullName !== (profile.full_name || '') || (phone || '') !== (profile.phone || '');

  // ── Handlers ───────────────────────────────────────────────────

  const uploadPhoto = async (file: File) => {
    if (!profile?.id) return;
    setUploading(true);
    try {
      const compressed = await compressImage(file);
      const ext = compressed.name.split('.').pop() || 'jpg';
      // Path's first folder is auth.uid() so the bucket's per-user RLS
      // accepts the upload.
      const path = `${profile.id}/${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from('avatars')
        .upload(path, compressed, { upsert: true, cacheControl: '3600' });
      if (upErr) throw upErr;
      const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(path);
      const { error: saveErr } = await supabase
        .from('profiles')
        .update({ photo_url: publicUrl })
        .eq('id', profile.id);
      if (saveErr) throw saveErr;
      setProfile({ ...profile, photo_url: publicUrl });
      toast({ title: 'Profile photo updated' });
      await logAudit('profile_updated', 'Profile photo updated', profile);
    } catch (err: any) {
      toast({ title: 'Upload failed', description: err?.message ?? String(err), variant: 'destructive' });
    } finally {
      setUploading(false);
    }
  };

  const saveProfile = async () => {
    if (!fullName.trim()) {
      toast({ title: 'Full name is required', variant: 'destructive' });
      return;
    }
    setSavingProfile(true);
    try {
      const { data, error } = await supabase
        .from('profiles')
        .update({ full_name: fullName.trim(), phone: phone.trim() || null })
        .eq('id', profile.id).select('*').single();
      if (error) throw error;
      if (data) setProfile({ ...profile, ...data });
      toast({ title: 'Profile updated' });
      await logAudit('profile_updated', `Profile updated`, profile);
    } catch (err: any) {
      toast({ title: 'Update failed', description: err?.message ?? '', variant: 'destructive' });
    } finally {
      setSavingProfile(false);
    }
  };

  const updateEmail = async () => {
    const trimmed = newEmail.trim();
    if (!trimmed || trimmed === profile.email) return;
    setUpdatingEmail(true);
    try {
      const { error } = await supabase.auth.updateUser({ email: trimmed });
      if (error) throw error;
      toast({
        title: 'Verification email sent',
        description: `Click the link sent to ${trimmed} to confirm.`,
      });
    } catch (err: any) {
      toast({ title: 'Email update failed', description: err?.message ?? '', variant: 'destructive' });
    } finally {
      setUpdatingEmail(false);
    }
  };

  const changePassword = async () => {
    if (newPassword.length < 6) {
      toast({ title: 'Password must be at least 6 characters', variant: 'destructive' });
      return;
    }
    if (newPassword !== confirmPassword) {
      toast({ title: 'Passwords do not match', variant: 'destructive' });
      return;
    }
    setChangingPassword(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      await logAudit('profile_password_changed', 'Password changed', profile);
      toast({ title: 'Password updated' });
      setNewPassword(''); setConfirmPassword('');
    } catch (err: any) {
      toast({ title: 'Password update failed', description: err?.message ?? '', variant: 'destructive' });
    } finally {
      setChangingPassword(false);
    }
  };

  const submitAdvance = async () => {
    const amt = Number(advanceForm.amount);
    const months = Number(advanceForm.months);
    if (!(amt > 0)) { toast({ title: 'Enter an amount greater than ₦0', variant: 'destructive' }); return; }
    if (!(months >= 1 && months <= 24)) { toast({ title: 'Repayment must be 1–24 months', variant: 'destructive' }); return; }
    setSubmittingAdvance(true);
    const reasonText = advanceForm.reason.trim() || null;
    const { error } = await (supabase as any).from('advance_requests').insert({
      employee_id: profile?.id,
      amount_ngn: amt,
      repayment_months: months,
      reason: reasonText,
    });
    setSubmittingAdvance(false);
    if (error) { toast({ title: 'Request failed', description: error.message, variant: 'destructive' }); return; }
    toast({ title: 'Advance request submitted', description: 'Your manager will review it.' });
    setShowAdvanceForm(false);
    setAdvanceForm({ amount: '', months: '3', reason: '' });
    // Fire-and-forget — page the approvers so they don't miss the request.
    // Failure here is silent: the request is already saved and visible in their
    // queue; the toast already confirmed it to the employee.
    void notifyRoles({
      roles: ['super_admin', 'admin', 'finance'],
      type: 'advance_request_submitted',
      module: 'payroll',
      priority: 'normal',
      title: 'Salary advance request',
      body: `${profile?.full_name || profile?.email || 'An employee'} requested ${formatNaira(amt)} over ${months} month${months === 1 ? '' : 's'}${reasonText ? ` — ${reasonText}` : ''}`,
    });
    loadAll();
  };

  // "Resubmit" a cancelled / rejected request: pre-fill the form with the
  // previous amount / months / reason so the employee can tweak and re-send
  // (the underlying record stays in its terminal state — this is just a
  // shortcut to creating a fresh request, which the RPCs don't allow against
  // the old row).
  const resubmitAdvance = (a: any) => {
    setAdvanceForm({
      amount: String(Number(a.amount_ngn) || ''),
      months: String(Number(a.repayment_months) || 3),
      reason: a.reason || '',
    });
    setShowAdvanceForm(true);
  };

  const cancelAdvance = async (id: string) => {
    const { error } = await (supabase as any).rpc('cancel_advance_request', { p_request_id: id });
    if (error) { toast({ title: 'Could not cancel', description: error.message, variant: 'destructive' }); return; }
    toast({ title: 'Request cancelled' });
    loadAll();
  };

  const savePersonal = async () => {
    if (!profile?.id) return;
    setSavingPersonal(true);
    // Only personal columns — the DB guard blocks salary/statutory/employment/bank
    // for non-admins, so this is safe even though it's a direct profiles update.
    const { error } = await supabase.from('profiles').update({
      date_of_birth: personalForm.date_of_birth || null,
      gender: personalForm.gender || null,
      marital_status: personalForm.marital_status || null,
      address: personalForm.address || null,
      next_of_kin_name: personalForm.next_of_kin_name || null,
      next_of_kin_relationship: personalForm.next_of_kin_relationship || null,
      next_of_kin_phone: personalForm.next_of_kin_phone || null,
      next_of_kin_email: personalForm.next_of_kin_email || null,
    } as any).eq('id', profile.id);
    setSavingPersonal(false);
    if (error) { toast({ title: 'Could not save', description: error.message, variant: 'destructive' }); return; }
    toast({ title: 'Personal details updated' });
    setEditPersonal(false);
    loadAll();
  };

  const submitBankRequest = async () => {
    if (!bankForm.bank_name.trim() || !bankForm.account_number.trim() || !bankForm.account_name.trim()) {
      toast({ title: 'Bank, account number and account name are required', variant: 'destructive' });
      return;
    }
    setSubmittingBank(true);
    const { error } = await (supabase as any).from('bank_account_change_requests').insert({
      employee_id: profile?.id,
      new_bank_name: bankForm.bank_name.trim(),
      new_account_number: bankForm.account_number.trim(),
      new_account_name: bankForm.account_name.trim(),
      reason: bankForm.reason.trim() || null,
    });
    setSubmittingBank(false);
    if (error) { toast({ title: 'Request failed', description: error.message, variant: 'destructive' }); return; }
    toast({ title: 'Bank change requested', description: 'An admin will review it before it takes effect.' });
    setShowBankForm(false);
    setBankForm({ bank_name: '', account_number: '', account_name: '', reason: '' });
    loadAll();
  };

  const downloadDocument = async (d: any) => {
    if (!d.storage_path) { toast({ title: 'No file attached', variant: 'destructive' }); return; }
    const { data, error } = await supabase.storage.from('documents').createSignedUrl(d.storage_path, 60);
    if (error || !data?.signedUrl) { toast({ title: 'Could not open document', variant: 'destructive' }); return; }
    window.open(data.signedUrl, '_blank', 'noopener');
  };

  const fallbackPayslipData = (p: Payslip) => ({
    company_name: 'KD Squares Ltd',
    employee_name: profile.full_name || profile.email,
    employee_email: profile.email,
    employee_role: profile.role,
    period: p.period,
    gross_ngn: p.gross_ngn,
    paye_ngn: p.paye_ngn,
    pension_ngn: p.pension_ngn,
    nhf_ngn: p.nhf_ngn,
    net_ngn: p.net_ngn,
    generated_by: profile.full_name || profile.email,
  });

  const previewPayslip = async (p: Payslip) => {
    setPreviewingSlip(p.id);
    try {
      // Preferred: open the exact stored HTML document, not a re-render.
      if (p.storage_path) {
        const { data } = await supabase.storage.from('payslips').createSignedUrl(p.storage_path, 60);
        if (data?.signedUrl) {
          const res = await fetch(data.signedUrl);
          if (res.ok) {
            const html = await res.text();
            openStoredPayslipHtml(html);
            return;
          }
        }
      }
      // Fallback: rebuild from stored figures and open the printable version.
      openPayslipPrintWindow(fallbackPayslipData(p), { autoPrint: false });
    } catch {
      toast({ title: 'Could not open payslip', description: 'Showing the printable version instead.', variant: 'destructive' });
      openPayslipPrintWindow(fallbackPayslipData(p), { autoPrint: false });
    } finally {
      setPreviewingSlip(null);
    }
  };

  const downloadPayslip = async (p: Payslip) => {
    setDownloadingSlip(p.id);
    try {
      // Preferred: fetch the stored payslip HTML exactly as generated and
      // download that document — not a re-render from raw figures, which
      // matters because a plain HTML string handed to openPayslipPrintWindow
      // would silently produce a blank/default payslip instead of erroring.
      if (p.storage_path) {
        const { data } = await supabase.storage.from('payslips').createSignedUrl(p.storage_path, 60);
        if (data?.signedUrl) {
          const res = await fetch(data.signedUrl);
          if (res.ok) {
            const html = await res.text();
            downloadStoredPayslipHtml(html, `payslip-${p.period}`);
            return;
          }
        }
      }
      // Fallback: rebuild from stored figures and open the printable version.
      openPayslipPrintWindow(fallbackPayslipData(p));
    } catch {
      toast({ title: 'Could not build the PDF', description: 'Opening the printable version instead.', variant: 'destructive' });
      openPayslipPrintWindow(fallbackPayslipData(p));
    } finally {
      setDownloadingSlip(null);
    }
  };

  // ── Render ─────────────────────────────────────────────────────

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-12">
      {/* Hero — centred identity card */}
      <div className="relative overflow-hidden rounded-3xl border border-border bg-card">
        {/* Brand accent strip — same teal gradient family the rest of
            the platform uses, so the My Profile hero feels like part
            of the same product instead of a one-off design. */}
        <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-emerald-400/60 via-primary to-cyan-400/60" />
        <div className="absolute -top-16 -right-16 h-48 w-48 rounded-full bg-primary/10 blur-3xl" />
        <div className="absolute -bottom-12 -left-12 h-40 w-40 rounded-full bg-emerald-400/10 blur-3xl" />

        <div className="relative p-8 sm:p-10 flex flex-col items-center text-center gap-5">
          {/* Photo + upload */}
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="relative h-28 w-28 sm:h-32 sm:w-32 rounded-full ring-4 ring-background shadow-xl group focus:outline-none focus-visible:ring-primary"
            title="Click to change profile photo"
            aria-label={profile.photo_url ? 'Change profile photo' : 'Upload profile photo'}
          >
            {profile.photo_url ? (
              <img src={profile.photo_url} alt={profile.full_name || ''} className="h-full w-full rounded-full object-cover" />
            ) : (
              <div className="h-full w-full rounded-full kd-gradient-brand flex items-center justify-center">
                <span className="text-3xl sm:text-4xl font-bold text-white">{initials}</span>
              </div>
            )}
            <span className="absolute -bottom-1 -right-1 flex h-9 w-9 items-center justify-center rounded-full bg-primary text-primary-foreground ring-4 ring-background shadow-md kd-transition group-hover:scale-110">
              {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
            </span>
            <span className="absolute inset-0 rounded-full bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
              <span className="text-xs font-semibold uppercase tracking-wider text-white">
                {profile.photo_url ? 'Change photo' : 'Upload photo'}
              </span>
            </span>
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            aria-label="Upload profile photo"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadPhoto(f); e.target.value = ''; }}
          />

          {/* Identity */}
          <div className="space-y-1">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
              {profile.full_name || '—'}
            </h1>
            <p className="text-sm text-muted-foreground inline-flex items-center gap-1.5">
              <Mail className="h-3.5 w-3.5" /> {profile.email}
            </p>
            {profile.phone && (
              <p className="text-sm text-muted-foreground inline-flex items-center gap-1.5">
                <Phone className="h-3.5 w-3.5" /> {profile.phone}
              </p>
            )}
          </div>

          <div className="flex items-center gap-2 flex-wrap justify-center">
            <Badge variant="outline" className={cn('font-medium', roleBadgeClass(profile.role))}>
              {roleLabel(profile.role)}
            </Badge>
            <Badge variant="outline" className="font-normal text-muted-foreground border-border/60">
              <CalendarDays className="h-3 w-3 mr-1" /> Joined {formatDate(profile.created_at)}
            </Badge>
          </div>

          {/* Stats strip — quick glance at activity */}
          <div className="grid grid-cols-3 gap-2 sm:gap-4 w-full max-w-md mt-2">
            <HeroStat label="Total requests"   value={stats.total} />
            <HeroStat label="Pending"          value={stats.pending} tone="warning" />
            <HeroStat label="Payslips on file" value={stats.payslips} />
          </div>
        </div>
      </div>

      {/* Tabs */}
      {/* Screen-reader announcement for async content loads. */}
      <div className="sr-only" role="status" aria-live="polite">
        {loadingActivity ? 'Loading your information' : ''}
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="w-full grid grid-cols-3 sm:grid-cols-6 sm:max-w-3xl sm:mx-auto">
          <TabsTrigger value="account">Account</TabsTrigger>
          <TabsTrigger value="employment">Employment</TabsTrigger>
          <TabsTrigger value="requests">
            Requests
            {stats.pending > 0 && (
              <span className="ml-1.5 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-amber-500/20 text-amber-700 dark:text-amber-400 text-[9px] font-bold px-1">
                {stats.pending}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="delegation">Delegation</TabsTrigger>
          <TabsTrigger value="payslips">Payslips</TabsTrigger>
          <TabsTrigger value="security">Security</TabsTrigger>
        </TabsList>

        {/* ── Account tab ──────────────────────────────────────── */}
        <TabsContent value="account" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Account details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label htmlFor="fullName">Full name</Label>
                  <Input id="fullName" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Your full name" />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="phone">Phone number</Label>
                  <Input id="phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+234..." />
                </div>
                <div className="space-y-1 sm:col-span-2">
                  <Label htmlFor="newEmail">Email</Label>
                  <div className="flex gap-2 flex-wrap">
                    <Input id="newEmail" type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder="you@example.com" className="flex-1 min-w-[200px]" />
                    <Button variant="outline" onClick={updateEmail} disabled={updatingEmail || !newEmail.trim() || newEmail.trim() === profile.email}>
                      {updatingEmail ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Mail className="mr-2 h-4 w-4" />}
                      Update email
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">A confirmation link will be sent to the new address.</p>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="profileRole">Role</Label>
                  <Input id="profileRole" value={roleLabel(profile.role)} disabled />
                </div>
              </div>
              {/* StickyActionBar pins Save to the bottom of the
                  viewport on mobile while keeping its in-flow
                  position on desktop. The Account form is long
                  enough on phones that the original justify-end
                  flex row scrolled the Save button out of reach. */}
              <StickyActionBar
                status={dirtyAccount ? 'Unsaved changes' : undefined}
              >
                <Button
                  onClick={saveProfile}
                  disabled={savingProfile || !dirtyAccount || !fullName.trim()}
                  className="flex-1 md:flex-none h-11 md:h-9"
                >
                  {savingProfile ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                  Save changes
                </Button>
              </StickyActionBar>
            </CardContent>
          </Card>

          {/* Personal details — employee-editable */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">Personal details</CardTitle>
              {!editPersonal ? (
                <Button size="sm" variant="outline" onClick={() => setEditPersonal(true)}>Edit</Button>
              ) : (
                <div className="flex gap-2">
                  <Button size="sm" variant="ghost" onClick={() => { setEditPersonal(false); }}>Cancel</Button>
                  <Button size="sm" onClick={savePersonal} disabled={savingPersonal}>
                    {savingPersonal ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : null} Save
                  </Button>
                </div>
              )}
            </CardHeader>
            <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
              {!editPersonal ? (
                <>
                  <Field label="Date of birth">{employment?.date_of_birth ? formatDate(employment.date_of_birth) : '—'}</Field>
                  <Field label="Gender">{employment?.gender || '—'}</Field>
                  <Field label="Marital status">{employment?.marital_status || '—'}</Field>
                  <Field label="Home address">{employment?.address || '—'}</Field>
                  <Field label="Next of kin">{employment?.next_of_kin_name || '—'}</Field>
                  <Field label="Next of kin relationship">{employment?.next_of_kin_relationship || '—'}</Field>
                  <Field label="Next of kin phone">{employment?.next_of_kin_phone || '—'}</Field>
                  <Field label="Next of kin email">{employment?.next_of_kin_email || '—'}</Field>
                </>
              ) : (
                <>
                  <div className="space-y-1"><Label htmlFor="personalDateOfBirth">Date of birth</Label><Input id="personalDateOfBirth" type="date" value={personalForm.date_of_birth} onChange={(e) => setPersonalForm((f) => ({ ...f, date_of_birth: e.target.value }))} /></div>
                  <div className="space-y-1"><Label htmlFor="personalGender">Gender</Label><Input id="personalGender" value={personalForm.gender} onChange={(e) => setPersonalForm((f) => ({ ...f, gender: e.target.value }))} placeholder="e.g. Female" /></div>
                  <div className="space-y-1"><Label htmlFor="personalMaritalStatus">Marital status</Label><Input id="personalMaritalStatus" value={personalForm.marital_status} onChange={(e) => setPersonalForm((f) => ({ ...f, marital_status: e.target.value }))} placeholder="e.g. Single" /></div>
                  <div className="space-y-1"><Label htmlFor="personalAddress">Home address</Label><Input id="personalAddress" value={personalForm.address} onChange={(e) => setPersonalForm((f) => ({ ...f, address: e.target.value }))} /></div>
                  <div className="space-y-1"><Label htmlFor="personalNextOfKinName">Next of kin name</Label><Input id="personalNextOfKinName" value={personalForm.next_of_kin_name} onChange={(e) => setPersonalForm((f) => ({ ...f, next_of_kin_name: e.target.value }))} /></div>
                  <div className="space-y-1"><Label htmlFor="personalNextOfKinRelationship">Relationship</Label><Input id="personalNextOfKinRelationship" value={personalForm.next_of_kin_relationship} onChange={(e) => setPersonalForm((f) => ({ ...f, next_of_kin_relationship: e.target.value }))} /></div>
                  <div className="space-y-1"><Label htmlFor="personalNextOfKinPhone">Next of kin phone</Label><Input id="personalNextOfKinPhone" value={personalForm.next_of_kin_phone} onChange={(e) => setPersonalForm((f) => ({ ...f, next_of_kin_phone: e.target.value }))} /></div>
                  <div className="space-y-1"><Label htmlFor="personalNextOfKinEmail">Next of kin email</Label><Input id="personalNextOfKinEmail" type="email" value={personalForm.next_of_kin_email} onChange={(e) => setPersonalForm((f) => ({ ...f, next_of_kin_email: e.target.value }))} /></div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Employment tab ───────────────────────────────────── */}
        <TabsContent value="employment" className="space-y-4">
          {loadingActivity ? (
            <div className="py-8 flex items-center justify-center">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          ) : !employment ? (
            <Card>
              <CardContent className="py-6 text-sm text-muted-foreground">
                Your employment record isn't available yet. Contact HR if this looks wrong.
              </CardContent>
            </Card>
          ) : (
            <>
              {/* Employment details */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Employment</CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-4 pt-2">
                  <Field label="Role">{roleLabel(profile.role)}</Field>
                  <Field label="Job title">{employment.job_title || '—'}</Field>
                  <Field label="Department">{employment.department?.name || '—'}</Field>
                  <Field label="Employee no.">{employment.employee_number || '—'}</Field>
                  <Field label="Employment type">{employment.employment_type ? employment.employment_type.replace(/_/g, ' ') : '—'}</Field>
                  <Field label="Start date">{employment.start_date ? formatDate(employment.start_date) : '—'}</Field>
                  <Field label="Annual leave">{employment.annual_leave_days != null ? `${employment.annual_leave_days} days` : '—'}</Field>
                </CardContent>
              </Card>

              {/* Compensation breakdown */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Compensation (monthly)</CardTitle>
                </CardHeader>
                <CardContent className="pt-2">
                  {!comp ? (
                    <p className="text-sm text-muted-foreground">
                      Your salary isn't configured yet. Contact HR.
                    </p>
                  ) : (
                    <div className="space-y-1.5 text-sm">
                      <div className="flex justify-between py-1">
                        <span className="text-muted-foreground">Gross</span>
                        <span className="font-semibold currency tabular-nums">{formatNaira(comp.grossMonthlyNgn)}</span>
                      </div>
                      {comp.payeMonthlyNgn > 0 && (
                        <div className="flex justify-between py-1">
                          <span className="text-muted-foreground">PAYE tax</span>
                          <span className="tabular-nums text-destructive">−{formatNaira(comp.payeMonthlyNgn)}</span>
                        </div>
                      )}
                      {comp.pensionEmployeeMonthlyNgn > 0 && (
                        <div className="flex justify-between py-1">
                          <span className="text-muted-foreground">Pension (8%)</span>
                          <span className="tabular-nums text-destructive">−{formatNaira(comp.pensionEmployeeMonthlyNgn)}</span>
                        </div>
                      )}
                      {comp.nhfMonthlyNgn > 0 && (
                        <div className="flex justify-between py-1">
                          <span className="text-muted-foreground">NHF (2.5%)</span>
                          <span className="tabular-nums text-destructive">−{formatNaira(comp.nhfMonthlyNgn)}</span>
                        </div>
                      )}
                      {comp.nhisEmployeeMonthlyNgn > 0 && (
                        <div className="flex justify-between py-1">
                          <span className="text-muted-foreground">NHIS (5%)</span>
                          <span className="tabular-nums text-destructive">−{formatNaira(comp.nhisEmployeeMonthlyNgn)}</span>
                        </div>
                      )}
                      <Separator className="my-1" />
                      <div className="flex justify-between py-1">
                        <span className="font-medium">Net pay (indicative)</span>
                        <span className="font-bold currency tabular-nums text-success">{formatNaira(comp.netMonthlyNgn)}</span>
                      </div>
                      <p className="text-[11px] text-muted-foreground pt-1">
                        Indicative — your monthly payslip is authoritative and may include bonuses, advances or other adjustments.
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Statutory enrolment */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Statutory & tax</CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-4 pt-2">
                  <Field label="Tax ID (TIN)">{employment.tin || employment.tax_id || '—'}</Field>
                  <Field label="NIN">{employment.nin || '—'}</Field>
                  <Field label="PAYE">
                    <EnrolBadge on={employment.paye_enabled !== false} />
                  </Field>
                  <Field label="Pension RSA PIN">{employment.pension_pin || '—'}</Field>
                  <Field label="Pension">
                    <EnrolBadge on={employment.pension_enabled !== false} />
                  </Field>
                  <div />
                  <Field label="NHF number">{employment.nhf_number || '—'}</Field>
                  <Field label="NHF">
                    <EnrolBadge on={employment.nhf_enabled === true} />
                  </Field>
                  <div />
                  <Field label="NHIS number">{employment.nhis_number || '—'}</Field>
                  <Field label="NHIS">
                    <EnrolBadge on={employment.nhis_enabled === true} />
                  </Field>
                </CardContent>
              </Card>

              {/* Bank (masked) + change request */}
              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle className="text-base">Bank account</CardTitle>
                  {bankPending ? (
                    <Badge variant="outline" className="bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30">Change pending review</Badge>
                  ) : !showBankForm ? (
                    <Button size="sm" variant="outline" onClick={() => setShowBankForm(true)}>Request change</Button>
                  ) : null}
                </CardHeader>
                <CardContent className="space-y-4 pt-2">
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-4">
                    <Field label="Bank">{employment.bank_name || '—'}</Field>
                    <Field label="Account name">{employment.bank_account_name || '—'}</Field>
                    <Field label="Account number">{maskAccount(employment.bank_account_number)}</Field>
                  </div>
                  {showBankForm && !bankPending && (
                    <div className="rounded-lg border p-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-1"><Label htmlFor="bankChangeBankName">New bank</Label><Input id="bankChangeBankName" value={bankForm.bank_name} onChange={(e) => setBankForm((f) => ({ ...f, bank_name: e.target.value }))} placeholder="e.g. GTBank" /></div>
                      <div className="space-y-1"><Label htmlFor="bankChangeAccountNumber">Account number</Label><Input id="bankChangeAccountNumber" inputMode="numeric" value={bankForm.account_number} onChange={(e) => setBankForm((f) => ({ ...f, account_number: e.target.value }))} /></div>
                      <div className="space-y-1 sm:col-span-2"><Label htmlFor="bankChangeAccountName">Account name</Label><Input id="bankChangeAccountName" value={bankForm.account_name} onChange={(e) => setBankForm((f) => ({ ...f, account_name: e.target.value }))} /></div>
                      <div className="space-y-1 sm:col-span-2"><Label htmlFor="bankChangeReason">Reason (optional)</Label><Input id="bankChangeReason" value={bankForm.reason} onChange={(e) => setBankForm((f) => ({ ...f, reason: e.target.value }))} /></div>
                      <div className="sm:col-span-2 flex justify-end gap-2">
                        <Button size="sm" variant="ghost" onClick={() => setShowBankForm(false)}>Cancel</Button>
                        <Button size="sm" onClick={submitBankRequest} disabled={submittingBank}>
                          {submittingBank ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : null} Submit request
                        </Button>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* My documents */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">My documents</CardTitle>
                </CardHeader>
                <CardContent className="pt-2">
                  {documents.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No documents on file. HR uploads contracts, IDs and certificates here.</p>
                  ) : (
                    <div className="space-y-2">
                      {documents.map((d) => (
                        <div key={d.id} className="flex items-center justify-between gap-2 border rounded-lg p-2.5 text-sm">
                          <div className="min-w-0">
                            <p className="font-medium truncate">{d.title}</p>
                            <p className="text-xs text-muted-foreground">
                              {(d.category || 'document').replace(/_/g, ' ')} · {formatDate(d.created_at)}
                              {d.expires_at ? ` · expires ${formatDate(d.expires_at)}` : ''}
                            </p>
                          </div>
                          <Button size="sm" variant="outline" onClick={() => downloadDocument(d)}>
                            <Download className="mr-1 h-3.5 w-3.5" /> Open
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              <p className="text-xs text-muted-foreground px-1">
                Salary, statutory and employment fields are managed by HR. Bank changes go through
                an approval workflow before they take effect.
              </p>
            </>
          )}
        </TabsContent>

        {/* ── Requests tab ─────────────────────────────────────── */}
        <TabsContent value="requests" className="space-y-4">
          {/* Leave balance */}
          {leaveBalance && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Leave balance · {leaveBalance.year}</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-2">
                <div>
                  <p className="text-xs text-muted-foreground">Annual remaining</p>
                  <p className="font-semibold tabular-nums">{Math.max(0, (leaveBalance.annual_quota || 0) - (leaveBalance.annual_used || 0))} days</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Annual used</p>
                  <p className="font-semibold tabular-nums">{leaveBalance.annual_used || 0} of {leaveBalance.annual_quota || 0}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Sick taken</p>
                  <p className="font-semibold tabular-nums">{leaveBalance.sick_used || 0} days</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Unpaid taken</p>
                  <p className="font-semibold tabular-nums">{leaveBalance.unpaid_used || 0} days</p>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Salary advances */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">Salary advances</CardTitle>
              {!showAdvanceForm && (
                <Button size="sm" variant="outline" onClick={() => setShowAdvanceForm(true)}>
                  Request advance
                </Button>
              )}
            </CardHeader>
            <CardContent className="space-y-3 pt-0">
              {showAdvanceForm && (
                <div className="rounded-lg border p-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label htmlFor="advanceAmount">Amount (₦)</Label>
                    <Input id="advanceAmount" type="number" min="0" inputMode="numeric" value={advanceForm.amount}
                      onChange={(e) => setAdvanceForm((f) => ({ ...f, amount: e.target.value }))} placeholder="0" />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="advanceMonths">Repay over (months)</Label>
                    <Input id="advanceMonths" type="number" min="1" max="24" value={advanceForm.months}
                      onChange={(e) => setAdvanceForm((f) => ({ ...f, months: e.target.value }))} />
                  </div>
                  <div className="space-y-1 sm:col-span-2">
                    <Label htmlFor="advanceReason">Reason (optional)</Label>
                    <Input id="advanceReason" value={advanceForm.reason}
                      onChange={(e) => setAdvanceForm((f) => ({ ...f, reason: e.target.value }))} placeholder="e.g. medical, rent" />
                  </div>
                  <div className="sm:col-span-2 flex justify-end gap-2">
                    <Button size="sm" variant="ghost" onClick={() => { setShowAdvanceForm(false); setAdvanceForm({ amount: '', months: '3', reason: '' }); }}>Cancel</Button>
                    <Button size="sm" onClick={submitAdvance} disabled={submittingAdvance}>
                      {submittingAdvance ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : null} Submit request
                    </Button>
                  </div>
                </div>
              )}
              {advanceReqs.length === 0 ? (
                <p className="text-sm text-muted-foreground py-1">No advance requests yet. Repayments are deducted from your payslips.</p>
              ) : (
                <div className="space-y-2">
                  {advanceReqs.map((a) => (
                    <div key={a.id} className="flex items-center justify-between gap-2 border rounded-lg p-2.5 text-sm flex-wrap">
                      <div className="min-w-0">
                        <p className="font-semibold currency tabular-nums">{formatNaira(Number(a.amount_ngn))}</p>
                        <p className="text-xs text-muted-foreground">
                          Over {a.repayment_months} month{a.repayment_months === 1 ? '' : 's'} · {formatDate(a.created_at)}
                          {a.reason ? ` · ${a.reason}` : ''}
                          {a.status === 'rejected' && a.rejection_reason ? ` · ${a.rejection_reason}` : ''}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className={cn('font-medium', tone(a.status).fg, tone(a.status).bg)}>
                          {tone(a.status).label}
                        </Badge>
                        {(a.status === 'pending' || a.status === 'approved') && (
                          <Button size="sm" variant="ghost" onClick={() => cancelAdvance(a.id)}>Cancel</Button>
                        )}
                        {(a.status === 'cancelled' || a.status === 'rejected') && (
                          <Button size="sm" variant="outline" onClick={() => resubmitAdvance(a)}>
                            Resubmit
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Inbox className="h-4 w-4 text-primary" /> My requests
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {loadingActivity ? (
                <div className="p-6 flex items-center justify-center">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                </div>
              ) : requests.length === 0 ? (
                <div className="p-10 text-center">
                  <div className="h-12 w-12 rounded-full bg-muted/40 mx-auto flex items-center justify-center mb-3">
                    <Inbox className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <p className="text-sm font-medium">Nothing raised yet</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Expenses, leave and fuel requests you submit will land here.
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {requests.map((r) => {
                    const meta = REQUEST_META[r.kind];
                    const t = tone(r.status);
                    return (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() => navigate(r.href)}
                        className="group w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/40 kd-transition"
                      >
                        <div className={cn('h-9 w-9 rounded-lg flex items-center justify-center shrink-0', meta.bg)}>
                          <meta.icon className={cn('h-4 w-4', meta.fg)} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-sm font-medium truncate">{r.title}</p>
                            <span className={cn('inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider shrink-0', t.bg, t.fg)}>
                              <t.Icon className="h-2.5 w-2.5" /> {t.label}
                            </span>
                          </div>
                          <div className="flex items-center justify-between gap-2 mt-0.5">
                            <p className="text-xs text-muted-foreground truncate">{r.subtitle}</p>
                            <div className="flex items-center gap-2 shrink-0">
                              {r.amountNgn !== null && (
                                <span className="text-xs font-semibold tabular-nums">{formatNaira(r.amountNgn)}</span>
                              )}
                              <span className="text-[10px] text-muted-foreground/70 tabular-nums">{formatDateTime(r.createdAt)}</span>
                              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/40 group-hover:text-foreground kd-transition" />
                            </div>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Payslips tab ─────────────────────────────────────── */}
        {/* ── Delegation tab ───────────────────────────────────── */}
        <TabsContent value="delegation" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <UserCog className="h-4 w-4 text-primary" /> Delegate my approvals
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                While you're on leave or unavailable, route leave, expense and
                salary advance approvals that would normally come to you to a
                backup approver for a set date range.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label>Delegate to</Label>
                  <Select value={delegateId} onValueChange={setDelegateId}>
                    <SelectTrigger><SelectValue placeholder="Choose a backup approver" /></SelectTrigger>
                    <SelectContent>
                      {directoryOptions.map((d) => (
                        <SelectItem key={d.id} value={d.id}>{d.full_name || d.email}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Approval types</Label>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pt-2">
                    {APPROVAL_TYPE_OPTIONS.map((opt) => (
                      <label key={opt.value} className="flex items-center gap-1.5 text-sm cursor-pointer">
                        <Checkbox
                          checked={delegationTypes.includes(opt.value)}
                          onCheckedChange={() => toggleDelegationType(opt.value)}
                        />
                        {opt.label}
                      </label>
                    ))}
                  </div>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="delegationStart">Start date</Label>
                  <Input id="delegationStart" type="date" value={delegationStart} onChange={(e) => setDelegationStart(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="delegationEnd">End date</Label>
                  <Input id="delegationEnd" type="date" value={delegationEnd} min={delegationStart} onChange={(e) => setDelegationEnd(e.target.value)} />
                </div>
                <div className="space-y-1 sm:col-span-2">
                  <Label htmlFor="delegationReason">Reason (optional)</Label>
                  <Textarea
                    id="delegationReason"
                    value={delegationReason}
                    onChange={(e) => setDelegationReason(e.target.value)}
                    placeholder="e.g. Annual leave, out of office"
                    rows={2}
                  />
                </div>
              </div>
              <Separator />
              <div className="flex justify-end">
                <Button onClick={createDelegation} disabled={savingDelegation}>
                  {savingDelegation ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UserCog className="mr-2 h-4 w-4" />}
                  Set delegation
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">My delegations</CardTitle>
            </CardHeader>
            <CardContent className="pt-2">
              {loadingDelegations ? (
                <div className="py-4 flex items-center justify-center">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                </div>
              ) : delegations.length === 0 ? (
                <EmptyState
                  icon={UserCog}
                  title="No delegations set"
                  description="Set a backup approver above before you go on leave so approvals don't stall."
                  compact
                />
              ) : (
                <div className="space-y-2">
                  {delegations.map((d) => {
                    const today = toIsoDate(new Date());
                    const expired = d.end_date < today;
                    const live = d.is_active && !expired && d.start_date <= today;
                    return (
                      <div key={d.id} className="flex items-center justify-between border rounded-lg p-3 flex-wrap gap-2">
                        <div className="min-w-0">
                          <p className="font-medium flex items-center gap-2">
                            {d.delegate_name}
                            <Badge
                              variant="outline"
                              className={cn(
                                'font-medium text-[10px]',
                                live
                                  ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30'
                                  : 'bg-muted text-muted-foreground border-border',
                              )}
                            >
                              {d.is_active ? (expired ? 'Ended' : live ? 'Active' : 'Upcoming') : 'Cancelled'}
                            </Badge>
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {formatDate(d.start_date)} → {formatDate(d.end_date)} · {d.approval_types.join(', ') || '—'}
                          </p>
                          {d.reason && <p className="text-xs text-muted-foreground mt-0.5">{d.reason}</p>}
                        </div>
                        {d.is_active && !expired && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => cancelDelegation(d)}
                            disabled={cancellingDelegationId === d.id}
                          >
                            {cancellingDelegationId === d.id
                              ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              : <Ban className="mr-2 h-4 w-4" />} Cancel
                          </Button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="payslips" className="space-y-4">
          {ytd.count > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">
                  {new Date().getFullYear()} year to date
                </CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-2">
                <div>
                  <p className="text-xs text-muted-foreground">Gross</p>
                  <p className="font-semibold currency tabular-nums">{formatNaira(ytd.gross)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">PAYE</p>
                  <p className="font-semibold currency tabular-nums">{formatNaira(ytd.paye)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Pension</p>
                  <p className="font-semibold currency tabular-nums">{formatNaira(ytd.pension)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Net pay</p>
                  <p className="font-semibold currency tabular-nums">{formatNaira(ytd.net)}</p>
                </div>
              </CardContent>
            </Card>
          )}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <FileText className="h-4 w-4 text-primary" /> My payslips
              </CardTitle>
              {payslips.length > 0 && (
                <span className="text-xs text-muted-foreground">
                  {payslips.length} on file
                </span>
              )}
            </CardHeader>
            <CardContent className="pt-2">
              {loadingActivity ? (
                <div className="py-4 flex items-center justify-center">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                </div>
              ) : payslips.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4">
                  No payslips generated yet. Finance produces them at the end of each month.
                </p>
              ) : (
                <div className="space-y-2">
                  {payslips.map((p) => (
                    <div key={p.id} className="flex items-center justify-between border rounded-lg p-3 kd-transition hover:bg-muted/40 flex-wrap gap-2">
                      <div className="min-w-0">
                        <p className="font-medium">{monthLabel(p.period)}</p>
                        <p className="text-xs text-muted-foreground">
                          Gross {formatNaira(p.gross_ngn)} · PAYE {formatNaira(p.paye_ngn)} · Pension {formatNaira(p.pension_ngn)}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          <p className="text-xs text-muted-foreground">Net pay</p>
                          <p className="font-semibold currency tabular-nums">{formatNaira(p.net_ngn)}</p>
                        </div>
                        <Button size="sm" variant="ghost" onClick={() => previewPayslip(p)} disabled={previewingSlip === p.id}>
                          {previewingSlip === p.id
                            ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            : <ExternalLink className="mr-2 h-4 w-4" />} Preview
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => downloadPayslip(p)} disabled={downloadingSlip === p.id}>
                          {downloadingSlip === p.id
                            ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            : <Download className="mr-2 h-4 w-4" />} Download
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Security tab ─────────────────────────────────────── */}
        <TabsContent value="security" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Change password</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label htmlFor="newPassword">New password</Label>
                  <Input id="newPassword" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="At least 6 characters" autoComplete="new-password" />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="confirmPassword">Confirm password</Label>
                  <Input id="confirmPassword" type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Retype new password" autoComplete="new-password" />
                </div>
              </div>
              <Separator />
              <div className="flex justify-end">
                <Button variant="outline" onClick={changePassword} disabled={changingPassword || newPassword.length < 6 || newPassword !== confirmPassword}>
                  {changingPassword ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <KeyRound className="mr-2 h-4 w-4" />}
                  Update password
                </Button>
              </div>
            </CardContent>
          </Card>

          <MfaSettings />
          <PushNotificationsToggle />
          <PrivacyPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
};

// ── Sub-components ───────────────────────────────────────────────

function HeroStat({
  label, value, tone: toneVariant,
}: { label: string; value: number; tone?: 'warning' }) {
  return (
    <div className={cn(
      'rounded-xl border bg-background/50 backdrop-blur-sm p-3 text-center',
      toneVariant === 'warning' && value > 0 && 'border-amber-500/30 bg-amber-500/5',
    )}>
      <p className={cn(
        'text-2xl font-bold tabular-nums',
        toneVariant === 'warning' && value > 0 && 'text-amber-600 dark:text-amber-400',
      )}>
        {value}
      </p>
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground mt-0.5">
        {label}
      </p>
    </div>
  );
}

export default ProfilePage;
