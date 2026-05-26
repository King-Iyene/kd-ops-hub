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
  CheckCircle2, Clock, XCircle,
} from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import { logAudit } from '@/lib/audit';
import { roleBadgeClass, roleLabel } from '@/lib/roles';
import { formatDate, formatNaira, formatDateTime } from '@/lib/format';
import { computePayslip } from '@/lib/tax';
import { compressImage } from '@/lib/image-compression';
import { openPayslipPrintWindow } from '@/lib/payslip';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import MfaSettings from '@/components/settings/MfaSettings';
import PrivacyPanel from '@/components/PrivacyPanel';
import { StickyActionBar } from '@/components/ui-kit/StickyActionBar';
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
  const TAB_KEYS = ['account', 'employment', 'requests', 'payslips', 'security'] as const;
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

  // Data
  const [payslips, setPayslips] = useState<Payslip[]>([]);
  const [requests, setRequests] = useState<RequestRow[]>([]);
  const [employment, setEmployment] = useState<EmploymentRow | null>(null);
  const [loadingActivity, setLoadingActivity] = useState(true);

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
    const [psRes, exRes, lvRes, flRes, empRes] = await Promise.all([
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
    ]);

    setPayslips((psRes.data as Payslip[]) || []);
    setEmployment((empRes.data as unknown as EmploymentRow) || null);

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

  if (!profile) {
    return (
      <div className="min-h-[40vh] flex items-center justify-center text-sm text-muted-foreground">
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

  const downloadPayslip = async (p: Payslip) => {
    if (p.storage_path) {
      const { data, error } = await supabase.storage
        .from('payslips').createSignedUrl(p.storage_path, 60);
      if (!error && data?.signedUrl) {
        window.open(data.signedUrl, '_blank', 'noopener');
        return;
      }
    }
    openPayslipPrintWindow({
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
  };

  // ── Stats for the hero strip ───────────────────────────────────

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
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="w-full grid grid-cols-3 sm:grid-cols-5 sm:max-w-2xl sm:mx-auto">
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
                  <Label>Role</Label>
                  <Input value={roleLabel(profile.role)} disabled />
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

              {/* Bank (masked) */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Bank account</CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-4 pt-2">
                  <Field label="Bank">{employment.bank_name || '—'}</Field>
                  <Field label="Account name">{employment.bank_account_name || '—'}</Field>
                  <Field label="Account number">{maskAccount(employment.bank_account_number)}</Field>
                </CardContent>
              </Card>

              <p className="text-xs text-muted-foreground px-1">
                These details are managed by HR. To request a change, contact your HR administrator
                (bank-account changes go through an approval workflow).
              </p>
            </>
          )}
        </TabsContent>

        {/* ── Requests tab ─────────────────────────────────────── */}
        <TabsContent value="requests" className="space-y-4">
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
                        <Button size="sm" variant="outline" onClick={() => downloadPayslip(p)}>
                          <Download className="mr-2 h-4 w-4" /> Download
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
