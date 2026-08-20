import { useState, useEffect } from 'react';
import { Loader2, ShieldCheck, ShieldAlert, Lock, Eye, EyeOff, Save } from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import { logAudit } from '@/lib/audit';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { InfoTip } from '@/components/ui-kit/InfoTip';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';

interface Props {
  settings: {
    mfa_required_for_all_users: boolean;
    approval_step_up_required: boolean;
    session_timeout_minutes: number;
    audit_log_retention_days: number;
    leave_carryover_max_days: number;
    [key: string]: any;
  };
  patch: (p: Record<string, any>) => void;
  approverMfaStatus: { total: number; enrolled: number } | null;
  exportLoading: boolean;
  setExportLoading: (v: boolean) => void;
}

export default function SecurityTab({ settings, patch, approverMfaStatus, exportLoading, setExportLoading }: Props) {
  const { profile } = useAuthStore();
  const { toast } = useToast();

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-emerald-500" />
            Two-factor authentication policy
          </CardTitle>
        </CardHeader>
        <CardContent>
          <label className="flex items-start gap-3 cursor-pointer select-none">
            <Switch
              checked={!!settings.mfa_required_for_all_users}
              onCheckedChange={(v) => patch({ mfa_required_for_all_users: v })}
              className="mt-0.5"
            />
            <div className="space-y-0.5 min-w-0">
              <p className="text-sm font-medium">Require 2FA for all users</p>
              <p className="text-[12px] text-muted-foreground leading-snug">
                When ON, every signed-in user without an enrolled authenticator factor sees a
                non-dismissible banner pointing them to <span className="font-mono">/profile</span> to set up 2FA.
                Users can still navigate the app while they enrol — once they enable an authenticator,
                the banner disappears. Switch OFF to keep 2FA optional.
              </p>
            </div>
          </label>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-emerald-500" />
            Re-verification for approvals
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <label className="flex items-start gap-3 cursor-pointer select-none">
            <Switch
              checked={!!settings.approval_step_up_required}
              onCheckedChange={(v) => patch({ approval_step_up_required: v })}
              className="mt-0.5"
            />
            <div className="space-y-0.5 min-w-0">
              <p className="text-sm font-medium">Require password + 2FA re-verification to approve or reject</p>
              <p className="text-[12px] text-muted-foreground leading-snug">
                When ON, approving/rejecting a payment batch or expense prompts for a fresh
                password and authenticator code immediately before the action — on top of
                normal sign-in. Off by default; a stolen session alone isn't enough to move
                money once this is on.
              </p>
            </div>
          </label>
          {approverMfaStatus && (
            approverMfaStatus.enrolled < approverMfaStatus.total ? (
              <p className="text-[12px] flex items-start gap-1.5 text-amber-600 dark:text-amber-400 bg-amber-500/10 rounded-md px-2.5 py-1.5">
                <ShieldAlert className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                Only {approverMfaStatus.enrolled} of {approverMfaStatus.total} approvers
                (admin/operations/super_admin) have 2FA enrolled. Turning this on blocks the
                rest from approving anything until they set it up in Profile → Security.
              </p>
            ) : (
              <p className="text-[12px] flex items-start gap-1.5 text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 rounded-md px-2.5 py-1.5">
                <ShieldCheck className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                All {approverMfaStatus.total} approvers have 2FA enrolled — safe to turn on.
              </p>
            )
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Session + audit</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="session_timeout_minutes">Session timeout (minutes) <InfoTip text="Users are automatically signed out after this period of inactivity. Default: 120 minutes." /></Label>
              <Input
                id="session_timeout_minutes"
                type="number"
                min="1"
                value={settings.session_timeout_minutes}
                onChange={(e) =>
                  patch({
                    session_timeout_minutes: Number(e.target.value) || 120,
                  })
                }
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="audit_log_retention_days">Audit log retention (days)</Label>
              <Input
                id="audit_log_retention_days"
                type="number"
                min="1"
                value={settings.audit_log_retention_days}
                onChange={(e) =>
                  patch({
                    audit_log_retention_days: Number(e.target.value) || 365,
                  })
                }
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Audit log is append-only at the database layer regardless of this
            retention. Retention controls automatic export + archive.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Leave</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1 max-w-xs">
            <Label htmlFor="leave_carryover_max_days">Carry-over cap (days) <InfoTip text="Maximum unused annual leave days an employee can roll over into the next year. Applied automatically by the monthly leave accrual job each January." /></Label>
            <Input
              id="leave_carryover_max_days"
              type="number"
              min="0"
              value={settings.leave_carryover_max_days}
              onChange={(e) =>
                patch({
                  leave_carryover_max_days: Number(e.target.value) || 0,
                })
              }
            />
          </div>
        </CardContent>
      </Card>

      <LeaveQuotasPanel />

      <FailedLoginPanel />

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Lock className="h-4 w-4 text-primary" />
            Module access by role
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground mb-3">
            Access is enforced at both the route level (UI) and the database layer (RLS policies).
            Roles not listed for a module are blocked on both layers — they cannot see the page
            or read/write any data even via direct API calls.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b">
                  <th className="text-left pb-2 pr-4 font-medium text-muted-foreground w-44">Module</th>
                  {(['super_admin','admin','finance','operations','field_staff / driver'] as const).map(r => (
                    <th key={r} className="text-center pb-2 px-2 font-medium text-muted-foreground capitalize">{r.replace('_',' ')}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {[
                  { module: 'Dashboard',             sa: true,  ad: true,  fi: true,  op: true,  fs: true  },
                  { module: 'Payments (batches)',    sa: true,  ad: true,  fi: true,  op: true,  fs: false },
                  { module: 'Expenses',              sa: true,  ad: true,  fi: true,  op: true,  fs: true  },
                  { module: 'Payroll / Payslips',    sa: true,  ad: true,  fi: true,  op: false, fs: false },
                  { module: 'Budgets',               sa: true,  ad: true,  fi: true,  op: false, fs: false },
                  { module: 'Fleet',                 sa: true,  ad: true,  fi: true,  op: true,  fs: true  },
                  { module: 'Contractors',           sa: true,  ad: true,  fi: true,  op: true,  fs: false },
                  { module: 'Employees (HR)',        sa: true,  ad: true,  fi: false, op: false, fs: false },
                  { module: 'Leave',                 sa: true,  ad: true,  fi: true,  op: true,  fs: false },
                  { module: 'Performance Reviews',   sa: true,  ad: true,  fi: true,  op: true,  fs: false },
                  { module: 'Training Records',      sa: true,  ad: true,  fi: true,  op: true,  fs: false },
                  { module: 'Benefits',              sa: true,  ad: true,  fi: true,  op: true,  fs: false },
                  { module: 'Onboarding',            sa: true,  ad: true,  fi: true,  op: true,  fs: false },
                  { module: 'Recruitment',           sa: true,  ad: true,  fi: true,  op: true,  fs: false },
                  { module: 'Attendance',            sa: true,  ad: true,  fi: true,  op: true,  fs: false },
                  { module: 'Disciplinary',          sa: true,  ad: true,  fi: false, op: false, fs: false },
                  { module: 'Vendors',               sa: true,  ad: true,  fi: true,  op: true,  fs: false },
                  { module: 'Clients / CRM',         sa: true,  ad: true,  fi: true,  op: true,  fs: false },
                  { module: 'Invoices',              sa: true,  ad: true,  fi: true,  op: false, fs: false },
                  { module: 'Assets',                sa: true,  ad: true,  fi: true,  op: false, fs: false },
                  { module: 'Projects',              sa: true,  ad: true,  fi: true,  op: true,  fs: false },
                  { module: 'Tasks',                 sa: true,  ad: true,  fi: true,  op: true,  fs: false },
                  { module: 'Goals',                 sa: true,  ad: true,  fi: true,  op: true,  fs: false },
                  { module: 'Documents',             sa: true,  ad: true,  fi: true,  op: false, fs: false },
                  { module: 'Audit Log',             sa: true,  ad: true,  fi: false, op: false, fs: false },
                  { module: 'Settings',              sa: true,  ad: true,  fi: false, op: false, fs: false },
                ].map(({ module, sa, ad, fi, op, fs }) => (
                  <tr key={module} className="hover:bg-muted/30 transition-colors">
                    <td className="py-1.5 pr-4 font-medium">{module}</td>
                    {[sa, ad, fi, op, fs].map((allowed, i) => (
                      <td key={i} className="py-1.5 px-2 text-center">
                        <span className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold ${allowed ? 'bg-emerald-100 text-emerald-700' : 'bg-red-50 text-red-400'}`}>
                          {allowed ? '✓' : '✕'}
                        </span>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[11px] text-muted-foreground mt-3 border-t pt-2">
            Role changes are applied by editing the employee's profile in the <strong>Employees</strong> page.
            Changes take effect on the employee's next page load (no restart required).
          </p>
          <p className="text-[11px] text-muted-foreground mt-2">
            <strong>Operations scope:</strong> within <em>Payments</em>, <em>Transactions</em> and contractor
            profiles, Operations sees <strong>only contractor batches</strong> (no Quick Pay, no salary runs, no
            advances, no bonuses, no expense pay-outs). Archived batches are hidden for all roles except
            super_admin / admin. These rules are enforced at the database (RLS) — they hold even against
            direct API calls.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Data export</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Export all company data as a CSV archive — useful for backups and
            supplier changeovers.
          </p>
          <Button
            variant="outline"
            disabled={exportLoading}
            onClick={async () => {
              setExportLoading(true);
              await logAudit('report_exported', 'Full company data export requested', profile);
              toast({
                title: 'Export queued',
                description: 'Your export will arrive via email within 15 minutes.',
              });
              setExportLoading(false);
            }}
          >
            Request full CSV export
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Leave Quotas panel
// ---------------------------------------------------------------------------

interface LeavePolicyRow {
  id: string;
  code: string;
  name: string;
  default_days: number;
  accrual_type: string;
  paid: boolean;
  active: boolean;
  is_system: boolean;
}

function LeaveQuotasPanel() {
  const [policies, setPolicies] = useState<LeavePolicyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    supabase
      .from('leave_policies')
      .select('id, code, name, default_days, accrual_type, paid, active, is_system')
      .order('name')
      .then(({ data }) => {
        setPolicies(data ?? []);
        setLoading(false);
      });
  }, []);

  async function updateDays(id: string, days: number) {
    setSaving(id);
    const { error } = await supabase
      .from('leave_policies')
      .update({ default_days: days })
      .eq('id', id);
    setSaving(null);
    if (error) {
      toast({ title: 'Save failed', description: error.message, variant: 'destructive' });
    } else {
      setPolicies((prev) => prev.map((p) => (p.id === id ? { ...p, default_days: days } : p)));
      toast({ title: 'Leave quota updated' });
    }
  }

  async function toggleActive(id: string, active: boolean) {
    const { error } = await supabase
      .from('leave_policies')
      .update({ active })
      .eq('id', id);
    if (error) {
      toast({ title: 'Update failed', description: error.message, variant: 'destructive' });
    } else {
      setPolicies((prev) => prev.map((p) => (p.id === id ? { ...p, active } : p)));
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Leave Quotas</CardTitle>
        <p className="text-xs text-muted-foreground">
          Set the default annual entitlement for each leave type. Changes apply to all employees.
        </p>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : (
          <div className="space-y-3">
            {policies.map((p) => (
              <div
                key={p.id}
                className={cn(
                  'flex items-center gap-3 rounded-lg border px-3 py-2.5',
                  !p.active && 'opacity-50',
                )}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{p.name}</span>
                    {p.paid && (
                      <span className="text-[10px] font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 px-1.5 py-0.5 rounded">Paid</span>
                    )}
                    {!p.paid && p.accrual_type === 'unpaid' && (
                      <span className="text-[10px] font-medium text-slate-500 bg-slate-50 dark:bg-slate-800 px-1.5 py-0.5 rounded">Unpaid</span>
                    )}
                  </div>
                  <span className="text-[11px] text-muted-foreground">{p.code}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    min="0"
                    className="w-20 h-8 text-sm text-center"
                    value={p.default_days}
                    onChange={(e) => {
                      const val = Number(e.target.value) || 0;
                      setPolicies((prev) => prev.map((x) => (x.id === p.id ? { ...x, default_days: val } : x)));
                    }}
                    onBlur={(e) => {
                      const val = Number(e.target.value) || 0;
                      if (val !== p.default_days) updateDays(p.id, val);
                    }}
                    disabled={saving === p.id}
                  />
                  <span className="text-xs text-muted-foreground w-8">days</span>
                  <button
                    type="button"
                    onClick={() => toggleActive(p.id, !p.active)}
                    className={cn(
                      'relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors',
                      p.active ? 'bg-primary' : 'bg-muted',
                    )}
                    title={p.active ? 'Disable this leave type' : 'Enable this leave type'}
                  >
                    <span className={cn(
                      'pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-sm ring-0 transition-transform',
                      p.active ? 'translate-x-4' : 'translate-x-0',
                    )} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Failed Login panel
// ---------------------------------------------------------------------------

interface FailedLogin {
  id: string;
  email: string;
  ip_hash: string | null;
  reason: string | null;
  attempted_at: string;
}

function FailedLoginPanel() {
  const [rows, setRows] = useState<FailedLogin[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [unmasked, setUnmasked] = useState(true);
  const PAGE_SIZE = 10;

  useEffect(() => {
    supabase
      .from('failed_login_attempts')
      .select('id, email, ip_hash, reason, attempted_at')
      .gte('attempted_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
      .order('attempted_at', { ascending: false })
      .limit(200)
      .then(({ data }) => {
        setRows((data as FailedLogin[]) || []);
        setLoading(false);
      });
  }, []);

  const maskEmail = (email: string) => {
    const [local, domain] = email.split('@');
    if (!domain) return email;
    return local.slice(0, 2) + '***@' + domain;
  };

  const relativeTime = (iso: string) => {
    const diffMs = Date.now() - new Date(iso).getTime();
    const diffMins = Math.round(diffMs / 60_000);
    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHrs = Math.round(diffMins / 60);
    if (diffHrs < 24) return `${diffHrs}h ago`;
    return `${Math.round(diffHrs / 24)}d ago`;
  };

  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const slice = rows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="space-y-1 min-w-0">
            <CardTitle className="text-base flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-destructive" />
              Failed login attempts
              <span className="text-xs font-normal text-muted-foreground ml-1">(last 30 days)</span>
            </CardTitle>
            <p className="text-xs text-muted-foreground max-w-xl">
              Every wrong password / unknown email hitting the sign-in screen lands here. Use it to
              spot brute-force attempts (same address hammered repeatedly, same hashed IP across
              many users), enumeration scans (lots of one-off addresses on the same domain), and to
              decide when to enable the temporary IP block on the security settings card below.
            </p>
          </div>
          {rows.length > 0 && (
            <button
              type="button"
              onClick={() => setUnmasked((v) => !v)}
              className="text-[11px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1 kd-transition shrink-0"
              title={unmasked ? 'Hide full email addresses (for screen-share)' : 'Show full email addresses'}
            >
              {unmasked ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
              {unmasked ? 'Mask' : 'Unmask'}
            </button>
          )}
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {loading ? (
          <div className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : rows.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">No failed login attempts in the last 30 days.</p>
        ) : (
          <>
            <div className="px-4 py-2 text-xs text-muted-foreground border-b">
              {rows.length} total — showing {slice.length} on this page.{' '}
              {unmasked
                ? 'Full email addresses visible.'
                : 'Email addresses partially masked for privacy.'}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b bg-muted/30">
                    <th className="text-left py-2 px-4 font-medium text-muted-foreground">Email</th>
                    <th className="text-left py-2 px-4 font-medium text-muted-foreground">Reason</th>
                    <th className="text-left py-2 px-4 font-medium text-muted-foreground">IP (hashed)</th>
                    <th className="text-left py-2 px-4 font-medium text-muted-foreground">When</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40">
                  {slice.map((r) => (
                    <tr key={r.id} className="hover:bg-muted/20 transition-colors">
                      <td className="py-2 px-4 font-mono">{unmasked ? r.email : maskEmail(r.email)}</td>
                      <td className="py-2 px-4 text-muted-foreground">{r.reason || '—'}</td>
                      <td className="py-2 px-4 font-mono text-muted-foreground">
                        {r.ip_hash ? r.ip_hash.slice(0, 8) + '…' : '—'}
                      </td>
                      <td className="py-2 px-4 text-muted-foreground">{relativeTime(r.attempted_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-2 border-t text-[11px] text-muted-foreground">
                <span>Page {page + 1} of {totalPages}</span>
                <div className="flex gap-1">
                  <Button size="sm" variant="outline" onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0} className="h-7 px-2">
                    Previous
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1} className="h-7 px-2">
                    Next
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
