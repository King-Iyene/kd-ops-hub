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
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
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
  type TransferLimit,
  type TransferAuditRow,
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
  const [overrideNotes, setOverrideNotes] = useState<string>('');
  const [overrideSaving, setOverrideSaving] = useState(false);

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
    const [lRes, aRes, pRes] = await Promise.allSettled([
      listTransferLimits(),
      fetchRecentTransferAudit(50),
      supabase
        .from('profiles')
        .select('id, full_name, email, role')
        .in('role', ['super_admin', 'admin', 'finance'])
        .order('full_name'),
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
      notes: d.notes ?? existing?.notes ?? null,
    };
    try {
      await upsertTransferLimit(next);
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
        notes: overrideNotes || null,
      });
      toast({ title: 'Override saved' });
      setOverrideUserId('');
      setOverrideSingle('');
      setOverrideDaily('');
      setOverrideMonthly('');
      setOverrideNotes('');
      await reloadAll();
    } catch (e: any) {
      toast({ title: 'Save failed', description: e?.message ?? String(e), variant: 'destructive' });
    } finally {
      setOverrideSaving(false);
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
            Leave any cap blank for "no limit". Set to <code>0</code> to fully suspend a user from initiating
            transfers.
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
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[140px]">Role</TableHead>
                  <TableHead>Single transfer</TableHead>
                  <TableHead>Daily (rolling 24h)</TableHead>
                  <TableHead>Monthly</TableHead>
                  <TableHead className="w-[120px] text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ROLES.map((role) => {
                  const row = roleRows[role];
                  const d = draft[role] ?? {};
                  const setField = (k: keyof TransferLimit, v: any) =>
                    setDraft((prev) => ({ ...prev, [role]: { ...(prev[role] ?? {}), [k]: v } }));
                  const valueOf = (k: 'single_txn_limit_ngn' | 'daily_limit_ngn' | 'monthly_limit_ngn'): string => {
                    const v = (d as any)[k] ?? row?.[k];
                    return v === null || v === undefined ? '' : String(v);
                  };
                  return (
                    <TableRow key={role}>
                      <TableCell className="font-medium">{roleLabel[role]}</TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          min={0}
                          placeholder="no cap"
                          value={valueOf('single_txn_limit_ngn')}
                          onChange={(e) =>
                            setField('single_txn_limit_ngn', e.target.value === '' ? null : Number(e.target.value))
                          }
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          min={0}
                          placeholder="no cap"
                          value={valueOf('daily_limit_ngn')}
                          onChange={(e) =>
                            setField('daily_limit_ngn', e.target.value === '' ? null : Number(e.target.value))
                          }
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          min={0}
                          placeholder="no cap"
                          value={valueOf('monthly_limit_ngn')}
                          onChange={(e) =>
                            setField('monthly_limit_ngn', e.target.value === '' ? null : Number(e.target.value))
                          }
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
          )}
        </CardContent>
      </Card>

      {/* Per-user overrides */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Per-user overrides</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr_1fr_1fr_2fr_auto] gap-2 items-end">
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
              <Label className="text-xs">Single</Label>
              <Input
                type="number"
                min={0}
                placeholder="no cap"
                value={overrideSingle}
                onChange={(e) => setOverrideSingle(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Daily</Label>
              <Input
                type="number"
                min={0}
                placeholder="no cap"
                value={overrideDaily}
                onChange={(e) => setOverrideDaily(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Monthly</Label>
              <Input
                type="number"
                min={0}
                placeholder="no cap"
                value={overrideMonthly}
                onChange={(e) => setOverrideMonthly(e.target.value)}
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
