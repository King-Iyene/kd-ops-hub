// Settings → Transfer Authorization
//
// Super-admin-only panel that controls:
//   1. The high-value threshold (visual flag, doesn't block).
//   2. Per-role default caps + per-user overrides (single / daily / monthly).
//   3. A live view of the last 50 transfer-audit rows for forensics.
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
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
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
  upsertTransferLimit,
  deleteTransferLimit,
  fetchRecentTransferAudit,
  listApproverPools,
  updateApproverPool,
  APPROVAL_ROLE_OPTIONS,
  SETTINGS_SINGLETON_ID,
  type TransferLimit,
  type TransferAuditRow,
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

export default function TransferAuthSettings() {
  const { toast } = useToast();

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
  const [overrideCo, setOverrideCo] = useState<string>('');
  const [overrideNotes, setOverrideNotes] = useState<string>('');
  const [overrideSaving, setOverrideSaving] = useState(false);

  // Approver pools editor.
  const [pools, setPools] = useState<ApproverPool[]>([]);
  const [poolDraft, setPoolDraft] = useState<Record<string, string[]>>({});
  const [poolSaving, setPoolSaving] = useState<string | null>(null);

  // Quick Pay master switch.
  const [quickPayEnabled, setQuickPayEnabled] = useState<boolean | null>(null);
  const [quickPaySaving, setQuickPaySaving] = useState(false);

  // ── Audit ────────────────────────────────────────────────────────────
  const [audit, setAudit] = useState<TransferAuditRow[]>([]);
  const [auditLoading, setAuditLoading] = useState(true);
  const [auditError, setAuditError] = useState<string | null>(null);
  const [limitsError, setLimitsError] = useState<string | null>(null);
  const [migrationMissing, setMigrationMissing] = useState(false);

  const reloadAll = async () => {
    setLimitsLoading(true);
    setAuditLoading(true);
    setAuditError(null);
    setLimitsError(null);
    setMigrationMissing(false);

    // Run independently so a missing table only breaks its own section.
    const [lRes, aRes, pRes, poolsRes, csRes] = await Promise.allSettled([
      listTransferLimits(),
      fetchRecentTransferAudit(50),
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
    if (aRes.status === 'fulfilled') {
      setAudit(aRes.value);
    } else {
      const msg = (aRes.reason as any)?.message ?? String(aRes.reason);
      setAuditError(msg);
      if (/transfer_audit/i.test(msg)) setMigrationMissing(true);
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
    setAuditLoading(false);
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
    const next: Partial<TransferLimit> = {
      id: existing?.id,
      role,
      user_id: null,
      single_txn_limit_ngn: d.single_txn_limit_ngn ?? existing?.single_txn_limit_ngn ?? null,
      daily_limit_ngn: d.daily_limit_ngn ?? existing?.daily_limit_ngn ?? null,
      monthly_limit_ngn: d.monthly_limit_ngn ?? existing?.monthly_limit_ngn ?? null,
      co_approval_threshold_ngn: d.co_approval_threshold_ngn ?? existing?.co_approval_threshold_ngn ?? null,
      notes: d.notes ?? existing?.notes ?? null,
    };
    try {
      await upsertTransferLimit(next);
      // Audit so a super-admin can't quietly widen a co-approval threshold.
      // The DB-level audit_logs trigger doesn't fire here (we go via the
      // transfer_limits row, not approver_pools), so log explicitly.
      await supabase.from('audit_logs').insert({
        action_type: 'transfer_limit_changed',
        description: `${roleLabel[role]} caps updated — single=${next.single_txn_limit_ngn ?? '∅'}, daily=${next.daily_limit_ngn ?? '∅'}, monthly=${next.monthly_limit_ngn ?? '∅'}, co_threshold=${next.co_approval_threshold_ngn ?? '∅'}`,
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
    setOverrideSaving(true);
    try {
      await upsertTransferLimit({
        user_id: overrideUserId,
        role: null,
        single_txn_limit_ngn: overrideSingle ? Number(overrideSingle) : null,
        daily_limit_ngn: overrideDaily ? Number(overrideDaily) : null,
        monthly_limit_ngn: overrideMonthly ? Number(overrideMonthly) : null,
        co_approval_threshold_ngn: overrideCo ? Number(overrideCo) : null,
        notes: overrideNotes || null,
      });
      await supabase.from('audit_logs').insert({
        action_type: 'transfer_limit_override_added',
        description: `Per-user transfer-limit override added for ${overrideUserId}`,
      });
      toast({ title: 'Override saved' });
      setOverrideUserId('');
      setOverrideSingle('');
      setOverrideDaily('');
      setOverrideMonthly('');
      setOverrideCo('');
      setOverrideNotes('');
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

  const fmtAmt = (v: number | null | undefined): string => {
    if (v === null || v === undefined) return '';
    return Number(v).toLocaleString('en-NG');
  };
  const parseAmt = (s: string): number | null => {
    const raw = s.replace(/[^0-9]/g, '');
    return raw === '' ? null : Number(raw);
  };

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
            <Table className="min-w-[780px]">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[130px]">Role</TableHead>
                  <TableHead className="min-w-[170px]">Single transfer (₦)</TableHead>
                  <TableHead className="min-w-[170px]">Daily rolling 24h (₦)</TableHead>
                  <TableHead className="min-w-[170px]">Monthly (₦)</TableHead>
                  <TableHead className="min-w-[170px]">Co-approval above (₦)</TableHead>
                  <TableHead className="w-[100px] text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ROLES.map((role) => {
                  const row = roleRows[role];
                  const d = draft[role] ?? {};
                  const setField = (k: keyof TransferLimit, v: any) =>
                    setDraft((prev) => ({ ...prev, [role]: { ...(prev[role] ?? {}), [k]: v } }));
                  const valueOf = (k: 'single_txn_limit_ngn' | 'daily_limit_ngn' | 'monthly_limit_ngn' | 'co_approval_threshold_ngn'): string => {
                    const v = (d as any)[k] ?? row?.[k];
                    return fmtAmt(v);
                  };
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
                          className="w-full"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="text"
                          inputMode="numeric"
                          placeholder="no cap (empty)"
                          value={valueOf('daily_limit_ngn')}
                          onChange={(e) => setField('daily_limit_ngn', parseAmt(e.target.value))}
                          className="w-full"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="text"
                          inputMode="numeric"
                          placeholder="no cap (empty)"
                          value={valueOf('monthly_limit_ngn')}
                          onChange={(e) => setField('monthly_limit_ngn', parseAmt(e.target.value))}
                          className="w-full"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="text"
                          inputMode="numeric"
                          placeholder="never (empty)"
                          value={valueOf('co_approval_threshold_ngn')}
                          onChange={(e) => setField('co_approval_threshold_ngn', parseAmt(e.target.value))}
                          title="Above this ₦ amount a second approver is required. Leave empty = never."
                          className="w-full"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          min={0}
                          placeholder="never"
                          value={valueOf('co_approval_threshold_ngn')}
                          onChange={(e) =>
                            setField('co_approval_threshold_ngn', e.target.value === '' ? null : Number(e.target.value))
                          }
                          title="Above this NGN amount, a second approver is required. Empty = never."
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" onClick={() => void handleSaveRoleLimit(role)}>
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
          <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr_1fr_1fr_1fr_2fr_auto] gap-2 items-end">
            <div className="space-y-1">
              <Label className="text-xs">User</Label>
              <Select value={overrideUserId} onValueChange={setOverrideUserId}>
                <SelectTrigger>
                  <SelectValue placeholder="Pick approver…" />
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
            <div className="space-y-1">
              <Label className="text-xs">Single (₦)</Label>
              <Input
                type="text"
                inputMode="numeric"
                placeholder="no cap (empty)"
                value={overrideSingle}
                onChange={(e) => setOverrideSingle(e.target.value.replace(/[^0-9]/g, ''))}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Daily (₦)</Label>
              <Input
                type="text"
                inputMode="numeric"
                placeholder="no cap (empty)"
                value={overrideDaily}
                onChange={(e) => setOverrideDaily(e.target.value.replace(/[^0-9]/g, ''))}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Monthly (₦)</Label>
              <Input
                type="text"
                inputMode="numeric"
                placeholder="no cap (empty)"
                value={overrideMonthly}
                onChange={(e) => setOverrideMonthly(e.target.value.replace(/[^0-9]/g, ''))}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Co-approval above (₦)</Label>
              <Input
                type="text"
                inputMode="numeric"
                placeholder="never (empty)"
                value={overrideCo}
                onChange={(e) => setOverrideCo(e.target.value.replace(/[^0-9]/g, ''))}
                title="Above this ₦ amount this user's transfer needs a second approver."
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Co-approval above</Label>
              <Input
                type="number"
                min={0}
                placeholder="never"
                value={overrideCo}
                onChange={(e) => setOverrideCo(e.target.value)}
                title="Above this amount, this user's transfer needs a second approver."
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Notes</Label>
              <Input
                placeholder="optional"
                value={overrideNotes}
                onChange={(e) => setOverrideNotes(e.target.value)}
              />
            </div>
            <Button onClick={handleAddOverride} disabled={overrideSaving || !overrideUserId}>
              {overrideSaving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />}
              Add
            </Button>
          </div>

          {userOverrides.length === 0 ? (
            <p className="text-xs text-muted-foreground italic">No per-user overrides yet — everyone is on their role default.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Single</TableHead>
                  <TableHead>Daily</TableHead>
                  <TableHead>Monthly</TableHead>
                  <TableHead>Co-approval above</TableHead>
                  <TableHead>Notes</TableHead>
                  <TableHead className="w-[60px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {userOverrides.map((o) => {
                  const p = o.user_id ? profilesById.get(o.user_id) : null;
                  return (
                    <TableRow key={o.id}>
                      <TableCell className="font-medium">
                        {p?.full_name || p?.email || o.user_id}
                        {p?.role && (
                          <span className="ml-2 text-xs text-muted-foreground">({p.role})</span>
                        )}
                      </TableCell>
                      <TableCell>{fmtCap(o.single_txn_limit_ngn)}</TableCell>
                      <TableCell>{fmtCap(o.daily_limit_ngn)}</TableCell>
                      <TableCell>{fmtCap(o.monthly_limit_ngn)}</TableCell>
                      <TableCell>
                        {o.co_approval_threshold_ngn === null || o.co_approval_threshold_ngn === undefined
                          ? <span className="text-xs text-muted-foreground italic">never</span>
                          : formatNaira(o.co_approval_threshold_ngn)}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{o.notes ?? ''}</TableCell>
                      <TableCell>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => void handleDeleteOverride(o.id)}
                          aria-label="Remove override"
                        >
                          <Trash2 className="h-3 w-3 text-rose-500" />
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

      {/* Audit log */}
      <Card>
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <Activity className="h-4 w-4" /> Recent transfer audit (last 50)
          </CardTitle>
          <Button size="sm" variant="ghost" onClick={() => void reloadAll()}>
            <RefreshCw className="h-3 w-3 mr-1" /> Refresh
          </Button>
        </CardHeader>
        <CardContent>
          {auditLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading audit…
            </div>
          ) : auditError && !migrationMissing ? (
            <p className="text-sm text-rose-600">{auditError}</p>
          ) : audit.length === 0 ? (
            <p className="text-xs text-muted-foreground italic">No transfer activity yet.</p>
          ) : (
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
                  {audit.map((row) => {
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
                          {row.ip_hash ? row.ip_hash.slice(0, 10) + '…' : '—'}
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
          )}
        </CardContent>
      </Card>
    </div>
  );
}
