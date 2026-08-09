// Settings → Transfer Authorization
//
// Super-admin-only panel that controls:
//   1. The high-value threshold (visual flag, doesn't block).
//   2. Per-role default caps + per-user overrides (single / daily / monthly /
//      co-approval / batch).
//   3. A paginated, filterable audit panel for forensics.
//
// All money math is handled server-side via `check_transfer_caps`; this UI is
// just a thin editor over the underlying tables. Changes take effect on the
// next transfer attempt — no redeploy required.

import { useEffect, useMemo, useState } from 'react';
import {
  ShieldCheck,
  Loader2,
  Save,
  Trash2,
  Plus,
  Activity,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Users,
  Zap,
  Calendar,
  Download,
  Filter,
  Clock,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { formatNaira } from '@/lib/format';
import { supabase } from '@/lib/supabase';
import {
  listTransferLimits,
  setTransferLimit,
  deleteTransferLimit,
  fetchTransferAuditPaginated,
  listApproverPools,
  updateApproverPool,
  APPROVAL_ROLE_OPTIONS,
  SETTINGS_SINGLETON_ID,
  type TransferLimit,
  type TransferAuditRow,
  type TransferAuditFilters,
  type ApproverPool,
  type ApprovalRole,
} from '@/lib/transfer-safety';

type Role = 'super_admin' | 'admin' | 'finance';
const ROLES: Role[] = ['super_admin', 'admin', 'finance'];
const roleLabel: Record<Role, string> = {
  super_admin: 'Super Admin',
  admin: 'Admin',
  finance: 'Finance',
};

interface ProfileLite {
  id: string;
  full_name: string | null;
  email: string | null;
  role: string | null;
}

const fmtCap = (v: number | null) =>
  v === null || v === undefined ? '— (no cap)' : formatNaira(v);

const outcomeBadge = (outcome: string) => {
  switch (outcome) {
    case 'ok':
      return (
        <Badge variant="outline" className="border-emerald-500/40 text-emerald-700 dark:text-emerald-400 bg-emerald-500/5">
          <CheckCircle2 className="h-3 w-3 mr-1" /> ok
        </Badge>
      );
    case 'denied':
      return (
        <Badge variant="outline" className="border-amber-500/40 text-amber-700 dark:text-amber-400 bg-amber-500/5">
          <XCircle className="h-3 w-3 mr-1" /> denied
        </Badge>
      );
    case 'error':
      return (
        <Badge variant="outline" className="border-rose-500/40 text-rose-700 dark:text-rose-400 bg-rose-500/5">
          <AlertTriangle className="h-3 w-3 mr-1" /> error
        </Badge>
      );
    default:
      return <Badge variant="outline">{outcome}</Badge>;
  }
};

/** Returns a colored expiry badge for per-user override rows. */
const expiryBadge = (expiresAt: string | null) => {
  if (expiresAt === null) {
    return <span className="text-xs text-muted-foreground italic">never</span>;
  }
  const now = Date.now();
  const expMs = new Date(expiresAt).getTime();
  const diffDays = Math.ceil((expMs - now) / (1000 * 60 * 60 * 24));

  if (diffDays <= 0) {
    return (
      <Badge variant="outline" className="border-rose-500/40 text-rose-700 dark:text-rose-400 bg-rose-500/5 text-xs">
        expired
      </Badge>
    );
  }
  if (diffDays === 1) {
    return (
      <Badge variant="outline" className="border-rose-500/40 text-rose-700 dark:text-rose-400 bg-rose-500/5 text-xs">
        today
      </Badge>
    );
  }
  if (diffDays <= 7) {
    return (
      <Badge variant="outline" className="border-amber-500/40 text-amber-700 dark:text-amber-400 bg-amber-500/5 text-xs">
        in {diffDays} days
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="border-emerald-500/40 text-emerald-700 dark:text-emerald-400 bg-emerald-500/5 text-xs">
      in {diffDays} days
    </Badge>
  );
};

/** ISO date string for today + N days, in YYYY-MM-DD format. */
const isoDatePlusDays = (days: number): string => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
};

export default function TransferAuthSettings() {
  const { toast } = useToast();

  // ── Current user context ──────────────────────────────────────────────
  const [currentUserId, setCurrentUserId] = useState<string>('');
  const [currentUserRole, setCurrentUserRole] = useState<string>('');

  // ── Caps ─────────────────────────────────────────────────────────────
  const [limits, setLimits] = useState<TransferLimit[]>([]);
  const [limitsLoading, setLimitsLoading] = useState(true);
  const [draft, setDraft] = useState<Record<string, Partial<TransferLimit>>>({});

  // Per-user overrides editor.
  const [profiles, setProfiles] = useState<ProfileLite[]>([]);
  const [overrideUserId, setOverrideUserId] = useState<string>('');
  const [overrideSingle, setOverrideSingle] = useState<string>('');
  const [overrideDaily, setOverrideDaily] = useState<string>('');
  const [overrideMonthly, setOverrideMonthly] = useState<string>('');
  // Co-approval feature removed — threshold is always written as null on
  // save so no new batches enter the second-approval flow. The DB column
  // stays so historical batches keep their audit trail.
  const [overrideBatch, setOverrideBatch] = useState<string>('');
  const [overrideExpires, setOverrideExpires] = useState<string>(isoDatePlusDays(30));
  const [overrideReason, setOverrideReason] = useState<string>('');
  const [overrideSaving, setOverrideSaving] = useState(false);

  // Approver pools editor.
  const [pools, setPools] = useState<ApproverPool[]>([]);
  const [poolDraft, setPoolDraft] = useState<Record<string, string[]>>({});
  const [poolSaving, setPoolSaving] = useState<string | null>(null);

  // Quick Pay master switch.
  const [quickPayEnabled, setQuickPayEnabled] = useState<boolean | null>(null);
  const [quickPaySaving, setQuickPaySaving] = useState(false);

  // ── Audit ────────────────────────────────────────────────────────────
  const [auditRows, setAuditRows] = useState<TransferAuditRow[]>([]);
  const [auditTotal, setAuditTotal] = useState<number>(0);
  const [auditOffset, setAuditOffset] = useState<number>(0);
  const [auditLoading, setAuditLoading] = useState(true);
  const [auditError, setAuditError] = useState<string | null>(null);
  const [auditFilterStart, setAuditFilterStart] = useState<string>('');
  const [auditFilterEnd, setAuditFilterEnd] = useState<string>('');
  const [auditFilterAction, setAuditFilterAction] = useState<TransferAuditFilters['actionType']>('all');
  const [csvExporting, setCsvExporting] = useState(false);

  const [limitsError, setLimitsError] = useState<string | null>(null);
  const [migrationMissing, setMigrationMissing] = useState(false);

  const loadAudit = async (reset?: boolean) => {
    setAuditLoading(true);
    setAuditError(null);
    const offset = reset ? 0 : auditOffset;
    try {
      const { rows, total } = await fetchTransferAuditPaginated({
        startDate: auditFilterStart || undefined,
        endDate: auditFilterEnd || undefined,
        actionType: auditFilterAction,
        limit: 50,
        offset,
      });
      if (reset) {
        setAuditRows(rows);
      } else {
        setAuditRows((prev) => [...prev, ...rows]);
      }
      setAuditTotal(total);
      setAuditOffset(reset ? 50 : offset + 50);
    } catch (e: any) {
      const msg = e?.message ?? String(e);
      setAuditError(msg);
      if (/transfer_audit/i.test(msg)) setMigrationMissing(true);
    } finally {
      setAuditLoading(false);
    }
  };

  const reloadAll = async () => {
    setLimitsLoading(true);
    setAuditLoading(true);
    setAuditError(null);
    setLimitsError(null);
    setMigrationMissing(false);

    // Load current user id + role.
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      setCurrentUserId(user.id);
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .maybeSingle();
      if (profile?.role) setCurrentUserRole(profile.role);
    }

    // Run independently so a missing table only breaks its own section.
    const [lRes, pRes, poolsRes, csRes] = await Promise.allSettled([
      listTransferLimits(),
      supabase
        .from('profiles')
        .select('id, full_name, email, role')
        .in('role', ['super_admin', 'admin', 'finance'])
        .order('full_name'),
      listApproverPools(),
      supabase
        .from('company_settings')
        .select('quick_pay_enabled')
        .eq('id', SETTINGS_SINGLETON_ID)
        .maybeSingle(),
    ]);

    if (lRes.status === 'fulfilled') {
      setLimits(lRes.value);
    } else {
      const msg = (lRes.reason as any)?.message ?? String(lRes.reason);
      setLimitsError(msg);
      if (/transfer_limits/i.test(msg)) setMigrationMissing(true);
    }
    if (pRes.status === 'fulfilled') {
      setProfiles(((pRes.value as any).data ?? []) as ProfileLite[]);
    }
    if (poolsRes.status === 'fulfilled') {
      setPools(poolsRes.value);
    }
    if (csRes.status === 'fulfilled') {
      setQuickPayEnabled(!!((csRes.value as any).data?.quick_pay_enabled));
    }

    setLimitsLoading(false);

    // Load audit separately (has its own reset logic).
    await loadAudit(true);
  };

  useEffect(() => {
    void reloadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Map: role → role-default limit row (for editor table).
  const roleRows = useMemo(() => {
    const byRole: Partial<Record<Role, TransferLimit>> = {};
    for (const l of limits) {
      if (l.user_id === null && l.role) {
        byRole[l.role as Role] = l;
      }
    }
    return byRole;
  }, [limits]);

  const userOverrides = useMemo(
    () => limits.filter((l) => l.user_id !== null),
    [limits],
  );

  const profilesById = useMemo(() => {
    const m = new Map<string, ProfileLite>();
    for (const p of profiles) m.set(p.id, p);
    return m;
  }, [profiles]);

  const handleSaveRoleLimit = async (role: Role) => {
    const existing = roleRows[role];
    const d = draft[role] ?? {};
    try {
      await setTransferLimit({
        id: existing?.id,
        role,
        user_id: null,
        single_txn_limit_ngn: d.single_txn_limit_ngn ?? existing?.single_txn_limit_ngn ?? null,
        daily_limit_ngn: d.daily_limit_ngn ?? existing?.daily_limit_ngn ?? null,
        monthly_limit_ngn: d.monthly_limit_ngn ?? existing?.monthly_limit_ngn ?? null,
        co_approval_threshold_ngn: null,
        single_batch_limit_ngn: d.single_batch_limit_ngn ?? existing?.single_batch_limit_ngn ?? null,
      });
      toast({ title: `${roleLabel[role]} caps saved` });
      setDraft((prev) => {
        const c = { ...prev };
        delete c[role];
        return c;
      });
      await reloadAll();
    } catch (e: any) {
      toast({ title: 'Save failed', description: e?.message ?? String(e), variant: 'destructive' });
    }
  };

  const handleAddOverride = async () => {
    if (!overrideUserId) {
      toast({ title: 'Pick a user first', variant: 'destructive' });
      return;
    }
    if (!overrideReason || overrideReason.length < 5) {
      toast({ title: 'Reason required', description: 'Reason must be at least 5 characters.', variant: 'destructive' });
      return;
    }
    setOverrideSaving(true);
    try {
      await setTransferLimit({
        user_id: overrideUserId,
        role: null,
        single_txn_limit_ngn: overrideSingle ? Number(overrideSingle) : null,
        daily_limit_ngn: overrideDaily ? Number(overrideDaily) : null,
        monthly_limit_ngn: overrideMonthly ? Number(overrideMonthly) : null,
        co_approval_threshold_ngn: null,
        single_batch_limit_ngn: overrideBatch ? Number(overrideBatch) : null,
        expires_at: overrideExpires || null,
        granted_reason: overrideReason,
      });
      toast({ title: 'Override saved' });
      setOverrideUserId('');
      setOverrideSingle('');
      setOverrideDaily('');
      setOverrideMonthly('');
      setOverrideBatch('');
      setOverrideExpires(isoDatePlusDays(30));
      setOverrideReason('');
      await reloadAll();
    } catch (e: any) {
      toast({ title: 'Save failed', description: e?.message ?? String(e), variant: 'destructive' });
    } finally {
      setOverrideSaving(false);
    }
  };

  const togglePoolRole = (poolId: string, role: ApprovalRole, on: boolean) => {
    setPoolDraft((prev) => {
      const current = prev[poolId] ?? pools.find((p) => p.id === poolId)?.eligible_roles ?? [];
      const next = on
        ? Array.from(new Set([...current, role]))
        : current.filter((r) => r !== role);
      return { ...prev, [poolId]: next };
    });
  };

  const handleSavePool = async (poolId: string) => {
    const draftRoles = poolDraft[poolId];
    if (!draftRoles) return;
    if (draftRoles.length === 0) {
      toast({
        title: 'At least one role required',
        description: 'A pool with no eligible roles would lock approvals — add at least one.',
        variant: 'destructive',
      });
      return;
    }
    setPoolSaving(poolId);
    try {
      await updateApproverPool(poolId, draftRoles);
      toast({ title: 'Approver pool saved' });
      setPoolDraft((prev) => {
        const c = { ...prev };
        delete c[poolId];
        return c;
      });
      await reloadAll();
    } catch (e: any) {
      toast({
        title: 'Save failed',
        description: e?.message ?? String(e),
        variant: 'destructive',
      });
    } finally {
      setPoolSaving(null);
    }
  };

  const handleToggleQuickPay = async (next: boolean) => {
    setQuickPaySaving(true);
    try {
      const { error } = await supabase
        .from('company_settings')
        .update({ quick_pay_enabled: next })
        .eq('id', SETTINGS_SINGLETON_ID);
      if (error) throw error;
      await supabase.from('audit_logs').insert({
        action_type: 'quick_pay_toggled',
        description: `Quick Pay ${next ? 'enabled' : 'disabled'} via Transfer Authorization settings`,
      });
      setQuickPayEnabled(next);
      toast({ title: next ? 'Quick Pay enabled' : 'Quick Pay disabled' });
    } catch (e: any) {
      toast({ title: 'Save failed', description: e?.message ?? String(e), variant: 'destructive' });
    } finally {
      setQuickPaySaving(false);
    }
  };

  const handleDeleteOverride = async (id: string) => {
    if (!confirm('Remove this user override? They will revert to their role default.')) return;
    try {
      await deleteTransferLimit(id);
      toast({ title: 'Override removed' });
      await reloadAll();
    } catch (e: any) {
      toast({ title: 'Delete failed', description: e?.message ?? String(e), variant: 'destructive' });
    }
  };

  const handleExportCsv = async () => {
    setCsvExporting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('No active session');
      const params = new URLSearchParams();
      if (auditFilterStart) params.set('startDate', auditFilterStart);
      if (auditFilterEnd) params.set('endDate', auditFilterEnd);
      if (auditFilterAction && auditFilterAction !== 'all') params.set('actionType', auditFilterAction);
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/export-transfer-audit?${params.toString()}`;
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!response.ok) throw new Error(`Export failed: ${response.statusText}`);
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = objectUrl;
      anchor.download = `transfer-audit-${new Date().toISOString().slice(0, 10)}.csv`;
      anchor.click();
      URL.revokeObjectURL(objectUrl);
    } catch (e: any) {
      toast({ title: 'Export failed', description: e?.message ?? String(e), variant: 'destructive' });
    } finally {
      setCsvExporting(false);
    }
  };

  const fmtAmt = (v: number | null | undefined): string => {
    if (v === null || v === undefined) return '';
    return Number(v).toLocaleString('en-NG');
  };
  const parseAmt = (s: string): number | null => {
    const raw = s.replace(/[^0-9]/g, '');
    return raw === '' ? null : Number(raw);
  };

  const tomorrow = isoDatePlusDays(1);
  const maxExpiry = isoDatePlusDays(90);
  const addOverrideDisabled =
    overrideSaving ||
    !overrideUserId ||
    !overrideReason ||
    overrideReason.length < 5;

  return (
    <div className="space-y-6">
      {migrationMissing && (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-sm text-amber-800 dark:text-amber-300 flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          <div className="space-y-1">
            <p className="font-medium">Migration not yet applied</p>
            <p className="text-xs">
              The <code>transfer_limits</code> / <code>transfer_audit</code> tables don't exist in this database yet.
              Apply migration <code>20260807000000_transfer_safety.sql</code> via Supabase Dashboard → Database →
              Migrations (or <code>supabase db push</code> in CI). Threshold + role list will work once the migration runs.
            </p>
          </div>
        </div>
      )}

      {/* Intro */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-primary" />
            Transfer Authorization
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>
            Per-role / per-user <strong>caps</strong> are enforced server-side on every transfer attempt and on
            the bulk-transfer total. User-level overrides win over role defaults.
          </p>
          <p className="text-xs">
            Leave any cap blank (empty) for no limit. Amounts are in plain Naira — commas are added automatically.
          </p>
        </CardContent>
      </Card>

      {/* Role defaults */}
      <Card>
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <CardTitle className="text-sm">Role default caps</CardTitle>
          <Button size="sm" variant="ghost" onClick={() => void reloadAll()}>
            <RefreshCw className="h-3 w-3 mr-1" /> Refresh
          </Button>
        </CardHeader>
        <CardContent>
          {limitsLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading caps…
            </div>
          ) : limitsError && !migrationMissing ? (
            <p className="text-sm text-rose-600">{limitsError}</p>
          ) : (
            <div className="overflow-x-auto">
              <Table className="min-w-[960px]">
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[130px]">Role</TableHead>
                    <TableHead className="min-w-[160px]">Single transfer (₦)</TableHead>
                    <TableHead className="min-w-[160px]">Daily rolling 24h (₦)</TableHead>
                    <TableHead className="min-w-[160px]">Monthly (₦)</TableHead>
                    <TableHead className="min-w-[160px]">Max batch total (₦)</TableHead>
                    <TableHead className="w-[100px] text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ROLES.map((role) => {
                    const row = roleRows[role];
                    const d = draft[role] ?? {};
                    const setField = (k: keyof TransferLimit, v: any) =>
                      setDraft((prev) => ({ ...prev, [role]: { ...(prev[role] ?? {}), [k]: v } }));
                    const valueOf = (
                      k: 'single_txn_limit_ngn' | 'daily_limit_ngn' | 'monthly_limit_ngn' | 'single_batch_limit_ngn'
                    ): string => {
                      const v = (d as any)[k] ?? row?.[k];
                      return fmtAmt(v);
                    };
                    const isSelfRole = role === currentUserRole;
                    // The "can't edit your own role's caps" guard exists to
                    // stop a finance/admin user lifting their own ceiling
                    // without a higher-up signing off. But super_admin sits
                    // at the top of the role chain — there is no "higher up"
                    // to sign off, so the guard would lock the cap-editor
                    // entirely whenever the only person logged in is a
                    // super_admin (i.e. the founder / org owner). Skip the
                    // guard for super_admin only.
                    const lockSelf = isSelfRole && role !== 'super_admin';
                    return (
                      <TableRow key={role}>
                        <TableCell className="font-medium">{roleLabel[role]}</TableCell>
                        <TableCell>
                          <Input
                            type="text"
                            inputMode="numeric"
                            placeholder="no cap (empty)"
                            value={valueOf('single_txn_limit_ngn')}
                            onChange={(e) => setField('single_txn_limit_ngn', parseAmt(e.target.value))}
                            className="w-full text-right tabular-nums font-mono"
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            type="text"
                            inputMode="numeric"
                            placeholder="no cap (empty)"
                            value={valueOf('daily_limit_ngn')}
                            onChange={(e) => setField('daily_limit_ngn', parseAmt(e.target.value))}
                            className="w-full text-right tabular-nums font-mono"
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            type="text"
                            inputMode="numeric"
                            placeholder="no cap (empty)"
                            value={valueOf('monthly_limit_ngn')}
                            onChange={(e) => setField('monthly_limit_ngn', parseAmt(e.target.value))}
                            className="w-full text-right tabular-nums font-mono"
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            type="text"
                            inputMode="numeric"
                            placeholder="no cap (empty)"
                            value={valueOf('single_batch_limit_ngn')}
                            onChange={(e) => setField('single_batch_limit_ngn', parseAmt(e.target.value))}
                            title="Maximum total amount for a single payment batch. Leave empty = no cap."
                            className="w-full text-right tabular-nums font-mono"
                          />
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            size="sm"
                            onClick={() => void handleSaveRoleLimit(role)}
                            disabled={lockSelf}
                            title={lockSelf ? 'Cannot edit your own role\'s caps — ask a higher-tier admin to update them' : undefined}
                          >
                            <Save className="h-3 w-3 mr-1" /> Save
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Per-user overrides */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Per-user overrides</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Add override form */}
          {/* User select gets a comfortable column on its own; the four
              numeric inputs share the rest of the row evenly. tabular-nums +
              right-align + monospace makes long ₦ amounts readable at a
              glance, and the comma-formatting on display avoids the
              "5000000" vs "50000000" ambiguity the unformatted inputs had. */}
          <div className="grid grid-cols-1 lg:grid-cols-[minmax(220px,2fr)_repeat(4,minmax(140px,1fr))_auto] gap-2">
            <div className="space-y-1">
              <Label className="text-xs">User</Label>
              <Select value={overrideUserId || undefined} onValueChange={setOverrideUserId}>
                <SelectTrigger>
                  <SelectValue placeholder="Pick user…" />
                </SelectTrigger>
                <SelectContent>
                  {profiles
                    .filter((p) => !userOverrides.some((o) => o.user_id === p.id))
                    .map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.full_name || p.email} <span className="text-muted-foreground">· {p.role}</span>
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <CommaInput label="Single (₦)"     value={overrideSingle}   setValue={setOverrideSingle}   placeholder="no cap" />
            <CommaInput label="Daily (₦)"      value={overrideDaily}    setValue={setOverrideDaily}    placeholder="no cap" />
            <CommaInput label="Monthly (₦)"    value={overrideMonthly}  setValue={setOverrideMonthly}  placeholder="no cap" />
            <CommaInput label="Max batch (₦)"  value={overrideBatch}    setValue={setOverrideBatch}    placeholder="no cap" />
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_2fr_auto] gap-2 items-end">
            <div className="space-y-1">
              <Label className="text-xs flex items-center gap-1">
                <Calendar className="h-3 w-3" /> Expires at
              </Label>
              <Input
                type="date"
                value={overrideExpires}
                min={tomorrow}
                max={maxExpiry}
                onChange={(e) => setOverrideExpires(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs flex items-center gap-1">
                Reason <span className="text-rose-500">*</span>
                <span className="ml-auto text-muted-foreground font-normal">{overrideReason.length} chars</span>
              </Label>
              <Textarea
                placeholder="Required — min 5 characters. Explain why this user needs a custom cap."
                value={overrideReason}
                onChange={(e) => setOverrideReason(e.target.value)}
                className="resize-none h-[38px] min-h-0 py-1.5"
              />
            </div>
            <Button
              onClick={handleAddOverride}
              disabled={addOverrideDisabled}
              className="self-end"
            >
              {overrideSaving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />}
              Add
            </Button>
          </div>

          {userOverrides.length === 0 ? (
            <p className="text-xs text-muted-foreground italic">No per-user overrides yet — everyone is on their role default.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table className="min-w-[900px]">
                <TableHeader>
                  <TableRow>
                    <TableHead>User</TableHead>
                    <TableHead className="text-right">Single</TableHead>
                    <TableHead className="text-right">Daily</TableHead>
                    <TableHead className="text-right">Monthly</TableHead>
                    <TableHead className="text-right">Max batch</TableHead>
                    <TableHead>Expires</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead className="w-[60px]" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {userOverrides.map((o) => {
                    const p = o.user_id ? profilesById.get(o.user_id) : null;
                    const isSelf = o.user_id === currentUserId;
                    return (
                      <TableRow key={o.id}>
                        <TableCell className="font-medium">
                          {p?.full_name || p?.email || o.user_id}
                          {p?.role && (
                            <span className="ml-2 text-xs text-muted-foreground">({p.role})</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{fmtCap(o.single_txn_limit_ngn)}</TableCell>
                        <TableCell className="text-right tabular-nums">{fmtCap(o.daily_limit_ngn)}</TableCell>
                        <TableCell className="text-right tabular-nums">{fmtCap(o.monthly_limit_ngn)}</TableCell>
                        <TableCell className="text-right tabular-nums">{fmtCap(o.single_batch_limit_ngn)}</TableCell>
                        <TableCell>{expiryBadge(o.expires_at)}</TableCell>
                        <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate" title={o.granted_reason ?? ''}>
                          {o.granted_reason ?? ''}
                        </TableCell>
                        <TableCell>
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => void handleDeleteOverride(o.id)}
                            aria-label="Remove override"
                            disabled={isSelf}
                            title={isSelf ? 'Cannot remove your own override' : undefined}
                          >
                            <Trash2 className={`h-3 w-3 ${isSelf ? 'text-muted-foreground' : 'text-rose-500'}`} />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Quick Pay toggle */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Zap className="h-4 w-4 text-accent" /> Quick Pay
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="space-y-1 max-w-2xl">
              <p className="text-sm">
                Master switch for the one-off Quick Pay flow. While disabled, every operator who opens Quick Pay sees a notice and the dialog won't dispatch a transfer.
              </p>
              <p className="text-xs text-muted-foreground">
                Above an operator's co-approval threshold, Quick Pay routes through the standard pending-approval flow rather than auto-funding — even when this switch is on.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={!!quickPayEnabled}
                disabled={quickPaySaving || quickPayEnabled === null}
                onCheckedChange={(v) => void handleToggleQuickPay(!!v)}
                aria-label="Toggle Quick Pay"
              />
              <span className="text-sm font-medium">{quickPayEnabled ? 'Enabled' : 'Disabled'}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Approver pools */}
      <Card>
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <Users className="h-4 w-4" /> Approver pools
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground max-w-2xl">
            Which roles can act as first or second approver for each action type. When a batch / Quick Pay / expense payment is created by an admin or super admin, the first-approver pool is automatically narrowed to <strong>super_admin only</strong> — the listed roles still apply for everyone else.
          </p>
          {pools.length === 0 ? (
            <p className="text-xs text-muted-foreground italic">No pools loaded yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[160px]">Action</TableHead>
                  <TableHead className="w-[100px]">Tier</TableHead>
                  <TableHead>Eligible roles</TableHead>
                  <TableHead className="w-[120px] text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pools.map((pool) => {
                  const draftRoles = poolDraft[pool.id] ?? pool.eligible_roles;
                  const dirty = poolDraft[pool.id] !== undefined;
                  return (
                    <TableRow key={pool.id}>
                      <TableCell className="font-medium">
                        {pool.action_type === 'payment_batch' ? 'Payment Batch'
                          : pool.action_type === 'quick_pay' ? 'Quick Pay'
                          : 'Expense Payment'}
                      </TableCell>
                      <TableCell className="capitalize">{pool.tier}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {APPROVAL_ROLE_OPTIONS.map((role) => {
                            const on = draftRoles.includes(role);
                            return (
                              <button
                                key={role}
                                type="button"
                                onClick={() => togglePoolRole(pool.id, role, !on)}
                                className={`text-xs px-2 py-0.5 rounded-full border kd-transition ${
                                  on
                                    ? 'border-primary/50 bg-primary/10 text-primary'
                                    : 'border-border bg-muted/30 text-muted-foreground hover:bg-muted'
                                }`}
                              >
                                {role.replace(/_/g, ' ')}
                              </button>
                            );
                          })}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          disabled={!dirty || poolSaving === pool.id}
                          onClick={() => void handleSavePool(pool.id)}
                        >
                          {poolSaving === pool.id ? (
                            <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                          ) : (
                            <Save className="h-3 w-3 mr-1" />
                          )}
                          Save
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Audit log — paginated */}
      <Card>
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <Activity className="h-4 w-4" /> Transfer audit
          </CardTitle>
          <Button size="sm" variant="ghost" onClick={() => void reloadAll()}>
            <RefreshCw className="h-3 w-3 mr-1" /> Refresh
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Filters row */}
          <div className="flex flex-wrap items-end gap-2">
            <div className="space-y-1">
              <Label className="text-xs flex items-center gap-1">
                <Calendar className="h-3 w-3" /> Date from
              </Label>
              <Input
                type="date"
                value={auditFilterStart}
                onChange={(e) => setAuditFilterStart(e.target.value)}
                className="w-[160px]"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs flex items-center gap-1">
                <Calendar className="h-3 w-3" /> Date to
              </Label>
              <Input
                type="date"
                value={auditFilterEnd}
                onChange={(e) => setAuditFilterEnd(e.target.value)}
                className="w-[160px]"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Action type</Label>
              <Select
                value={auditFilterAction ?? 'all'}
                onValueChange={(v) => setAuditFilterAction(v as TransferAuditFilters['actionType'])}
              >
                <SelectTrigger className="w-[180px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="transfers">Transfers only</SelectItem>
                  <SelectItem value="cap_changes">Cap changes</SelectItem>
                  <SelectItem value="denials">Denials &amp; errors</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button size="sm" variant="outline" onClick={() => void loadAudit(true)}>
              <Filter className="h-3 w-3 mr-1" /> Apply
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => void handleExportCsv()}
              disabled={csvExporting}
            >
              {csvExporting
                ? <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                : <Download className="h-3 w-3 mr-1" />}
              Export CSV
            </Button>
          </div>

          {auditLoading && auditRows.length === 0 ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading audit…
            </div>
          ) : auditError && !migrationMissing ? (
            <p className="text-sm text-rose-600">{auditError}</p>
          ) : auditRows.length === 0 ? (
            <p className="text-xs text-muted-foreground italic">No transfer activity yet.</p>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="whitespace-nowrap">When</TableHead>
                      <TableHead>Actor</TableHead>
                      <TableHead>Action</TableHead>
                      <TableHead>Outcome</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead>IP hash</TableHead>
                      <TableHead>Reason / Reference</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {auditRows.map((row) => {
                      const p = row.actor_id ? profilesById.get(row.actor_id) : null;
                      return (
                        <TableRow key={row.id}>
                          <TableCell className="whitespace-nowrap text-xs">
                            {new Date(row.created_at).toLocaleString()}
                          </TableCell>
                          <TableCell className="text-xs">
                            {p?.full_name || p?.email || row.actor_id?.slice(0, 8) || '—'}
                            {row.actor_role && (
                              <span className="ml-1 text-muted-foreground">({row.actor_role})</span>
                            )}
                          </TableCell>
                          <TableCell className="text-xs font-mono">{row.action}</TableCell>
                          <TableCell>{outcomeBadge(row.outcome)}</TableCell>
                          <TableCell className="text-right text-xs whitespace-nowrap">
                            {row.amount_ngn ? formatNaira(row.amount_ngn) : '—'}
                          </TableCell>
                          <TableCell className="text-xs font-mono text-muted-foreground">
                            {row.ip_hash ? row.ip_hash.slice(-6) : '—'}
                          </TableCell>
                          <TableCell className="text-xs max-w-[280px] truncate" title={row.reason || row.reference || ''}>
                            {row.reason || row.reference || ''}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>

              <div className="flex items-center justify-between pt-1">
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  Showing {auditRows.length} of {auditTotal}
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={auditRows.length >= auditTotal || auditLoading}
                  onClick={() => void loadAudit(false)}
                >
                  {auditLoading ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : null}
                  Load more
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// Numeric override input that *displays* a comma-grouped figure (50,000,000)
// while still storing/setting the raw digit string ("50000000"). Comma
// formatting matches what every cell in the table renders, so what the
// operator types and what they read back are visually consistent.
function CommaInput({
  label, value, setValue, placeholder,
}: {
  label: string;
  value: string;
  setValue: (v: string) => void;
  placeholder?: string;
}) {
  const display = value ? Number(value).toLocaleString('en-NG') : '';
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <Input
        type="text"
        inputMode="numeric"
        placeholder={placeholder}
        value={display}
        onChange={(e) => setValue(e.target.value.replace(/[^0-9]/g, ''))}
        className="text-right tabular-nums font-mono"
      />
    </div>
  );
}
