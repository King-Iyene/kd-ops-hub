import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, Download } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/hooks/use-toast';
import { logAudit } from '@/lib/audit';
import { formatNaira, formatDate } from '@/lib/format';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';

type EmployeeLite = {
  id: string;
  full_name?: string | null;
  salary_ngn?: number | null;
  status?: string | null;
  start_date?: string | null;
  notice_period_days?: number | null;
};

const TYPE_OPTIONS = [
  { value: 'resignation', label: 'Resignation' },
  { value: 'dismissal', label: 'Dismissal' },
  { value: 'redundancy', label: 'Redundancy' },
  { value: 'retirement', label: 'Retirement' },
  { value: 'end_of_contract', label: 'End of contract' },
  { value: 'other', label: 'Other' },
];

const prettyType = (t: string) =>
  TYPE_OPTIONS.find((o) => o.value === t)?.label || t.replace(/_/g, ' ');

const STATUS_TONE: Record<string, string> = {
  initiated: 'bg-info/10 text-info border-info/30',
  in_progress: 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30',
  completed: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30',
  cancelled: 'bg-muted text-muted-foreground border-border',
};

/**
 * Admin offboarding workspace for one employee: start an exit record, see a
 * final-settlement estimate, capture exit-interview notes, track assigned
 * assets to return, and complete offboarding (which deactivates the profile).
 * Self-contained so it doesn't bloat the large EmployeeProfile page.
 */
export default function OffboardingTab({
  employee,
  onChanged,
}: {
  employee: EmployeeLite;
  onChanged?: () => void;
}) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [term, setTerm] = useState<any | null>(null);
  const [assets, setAssets] = useState<any[]>([]);
  const [advancesOutstanding, setAdvancesOutstanding] = useState(0);
  const [unusedLeaveDays, setUnusedLeaveDays] = useState(0);
  const [busy, setBusy] = useState(false);

  // Sprint D — company-level F&F policy. Defaults preserve the legacy
  // behavior (gratuity off, pro-rated salary on).
  const [policy, setPolicy] = useState<{
    gratuity_months_per_year: number;
    last_month_prorated: boolean;
  }>({ gratuity_months_per_year: 0, last_month_prorated: true });

  // Start form
  const [form, setForm] = useState({
    termination_type: 'resignation',
    reason: '',
    notice_date: '',
    last_working_day: '',
    rehire_eligible: true,
  });

  // Editable fields on an existing record
  const [exitNotes, setExitNotes] = useState('');
  const [settlement, setSettlement] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: t }, { data: ass }, { data: adv }, { data: bal }, { data: settings }] = await Promise.all([
      (supabase as any).from('terminations').select('*').eq('employee_id', employee.id)
        .order('created_at', { ascending: false }).limit(1),
      supabase.from('assets').select('id, asset_number, name, status').eq('assigned_to', employee.id).is('deleted_at', null),
      supabase.from('employee_advances').select('outstanding_ngn').eq('employee_id', employee.id).eq('status', 'active'),
      supabase.from('leave_balances').select('annual_quota, annual_used').eq('employee_id', employee.id).eq('year', new Date().getFullYear()).maybeSingle(),
      // F&F policy. New columns are nullable; safely fall back to legacy
      // defaults if the Sprint D migration hasn't been applied yet.
      (supabase as any).from('company_settings')
        .select('gratuity_months_per_year, last_month_prorated')
        .eq('id', '00000000-0000-0000-0000-000000000001').maybeSingle(),
    ]);
    const rec = ((t as any[]) || [])[0] || null;
    setTerm(rec);
    setExitNotes(rec?.exit_interview_notes || '');
    setSettlement(rec?.final_settlement_ngn != null ? String(rec.final_settlement_ngn) : '');
    setAssets((ass as any[]) || []);
    setAdvancesOutstanding(((adv as any[]) || []).reduce((s, a) => s + Number(a.outstanding_ngn || 0), 0));
    const q = Number((bal as any)?.annual_quota || 0);
    const u = Number((bal as any)?.annual_used || 0);
    setUnusedLeaveDays(Math.max(0, q - u));
    setPolicy({
      gratuity_months_per_year: Number((settings as any)?.gratuity_months_per_year || 0),
      last_month_prorated: (settings as any)?.last_month_prorated !== false,
    });
    setLoading(false);
  }, [employee.id]);

  useEffect(() => { load(); }, [load]);

  // Final-settlement estimate (Sprint D — extended):
  //   + Pro-rated final-month salary (days worked between 1st of month
  //     and last_working_day) — only when policy.last_month_prorated.
  //   + Gratuity: months_per_year × completed years of service × monthly salary
  //   + Accrued unused-leave payout — daily rate × unused days
  //   − Outstanding advances
  //
  // Daily rate uses 22 working days as a stable indicative divisor; the
  // helper text below the panel always reminds the operator it's an
  // estimate and the agreed figure must be confirmed.
  const estimate = useMemo(() => {
    const salary = Number(employee.salary_ngn || 0);
    const dailyRate = salary > 0 ? salary / 22 : 0;

    // Pro-rated final-month salary
    let proratedSalary = 0;
    const lwd = term?.last_working_day as string | undefined;
    if (policy.last_month_prorated && salary > 0 && lwd) {
      const d = new Date(`${lwd}T00:00:00Z`);
      if (!Number.isNaN(d.getTime())) {
        // Count working days (Mon–Fri) from the 1st of the last_working_day's
        // month through last_working_day inclusive. Holidays are ignored at
        // this estimate stage — operator can override the agreed figure.
        let count = 0;
        const cur = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
        while (cur.getTime() <= d.getTime()) {
          const dow = cur.getUTCDay();
          if (dow !== 0 && dow !== 6) count += 1;
          cur.setUTCDate(cur.getUTCDate() + 1);
        }
        proratedSalary = Math.round(dailyRate * count);
      }
    }

    // Gratuity: completed years of service × months_per_year × monthly salary
    let gratuity = 0;
    let yearsOfService = 0;
    if (policy.gratuity_months_per_year > 0 && salary > 0 && employee.start_date && lwd) {
      const start = new Date(`${employee.start_date}T00:00:00Z`);
      const end = new Date(`${lwd}T00:00:00Z`);
      if (!Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime()) && end.getTime() >= start.getTime()) {
        const ms = end.getTime() - start.getTime();
        const years = ms / (365.25 * 24 * 3600 * 1000);
        yearsOfService = Math.floor(years); // only completed years
        gratuity = Math.round(yearsOfService * policy.gratuity_months_per_year * salary);
      }
    }

    const leavePayout = Math.round(dailyRate * unusedLeaveDays);
    const gross = proratedSalary + gratuity + leavePayout;
    const net = gross - advancesOutstanding;
    return {
      dailyRate, proratedSalary, gratuity, yearsOfService,
      leavePayout, advancesOutstanding, gross, net,
    };
  }, [
    employee.salary_ngn, employee.start_date,
    unusedLeaveDays, advancesOutstanding,
    term?.last_working_day,
    policy.gratuity_months_per_year, policy.last_month_prorated,
  ]);

  const startOffboarding = async () => {
    if (!form.last_working_day) { toast({ title: 'Last working day is required', variant: 'destructive' }); return; }
    setBusy(true);
    const { error } = await (supabase as any).from('terminations').insert({
      employee_id: employee.id,
      termination_type: form.termination_type,
      reason: form.reason.trim() || null,
      notice_date: form.notice_date || null,
      last_working_day: form.last_working_day,
      rehire_eligible: form.rehire_eligible,
    });
    setBusy(false);
    if (error) { toast({ title: 'Could not start offboarding', description: error.message, variant: 'destructive' }); return; }
    void logAudit('employee_offboarding_started' as never, `Offboarding started for ${employee.full_name || employee.id}`, null as never);
    toast({ title: 'Offboarding started' });
    load();
  };

  const saveRecord = async () => {
    if (!term) return;
    setBusy(true);
    const { error } = await (supabase as any).from('terminations').update({
      exit_interview_notes: exitNotes.trim() || null,
      final_settlement_ngn: settlement !== '' ? Number(settlement) : null,
      status: term.status === 'initiated' ? 'in_progress' : term.status,
      updated_at: new Date().toISOString(),
    }).eq('id', term.id);
    setBusy(false);
    if (error) { toast({ title: 'Could not save', description: error.message, variant: 'destructive' }); return; }
    toast({ title: 'Offboarding updated' });
    load();
  };

  const markAssetReturned = async (assetId: string) => {
    const { error } = await supabase.from('assets').update({ assigned_to: null } as any).eq('id', assetId);
    if (error) { toast({ title: 'Could not update asset', description: error.message, variant: 'destructive' }); return; }
    toast({ title: 'Asset marked returned' });
    load();
  };

  const completeOffboarding = async () => {
    if (!term) return;
    setBusy(true);
    const { error } = await (supabase as any).rpc('complete_offboarding', { p_termination_id: term.id });
    setBusy(false);
    if (error) { toast({ title: 'Could not complete', description: error.message, variant: 'destructive' }); return; }
    toast({ title: 'Offboarding completed', description: 'The employee has been deactivated.' });
    load();
    onChanged?.();
  };

  if (loading) {
    return <div className="py-10 flex items-center justify-center" role="status" aria-live="polite"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  }

  // ── No exit record yet → start form ──────────────────────────────────────
  if (!term) {
    return (
      <Card>
        <CardHeader><CardTitle className="text-base">Start offboarding</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1">
            <Label>Type</Label>
            <Select value={form.termination_type} onValueChange={(v) => setForm((f) => ({ ...f, termination_type: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {TYPE_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Notice date</Label>
            <Input type="date" value={form.notice_date} onChange={(e) => setForm((f) => ({ ...f, notice_date: e.target.value }))} />
          </div>
          <div className="space-y-1">
            <Label>Last working day</Label>
            <Input type="date" value={form.last_working_day} onChange={(e) => setForm((f) => ({ ...f, last_working_day: e.target.value }))} />
          </div>
          <label className="flex items-center gap-2 text-sm self-end pb-2">
            <input type="checkbox" checked={form.rehire_eligible} onChange={(e) => setForm((f) => ({ ...f, rehire_eligible: e.target.checked }))} />
            Eligible for rehire
          </label>
          <div className="space-y-1 sm:col-span-2">
            <Label>Reason / notes</Label>
            <Textarea value={form.reason} onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))} rows={3} />
          </div>
          {/* Notice period validation */}
          {(() => {
            const noticeDays = employee.notice_period_days ?? 30;
            if (form.notice_date && form.last_working_day) {
              const notice = new Date(form.notice_date);
              const lwd = new Date(form.last_working_day);
              const gap = Math.round((lwd.getTime() - notice.getTime()) / 86400000);
              if (gap < noticeDays) {
                return (
                  <div className="sm:col-span-2 rounded-lg border border-amber-300 dark:border-amber-500/40 bg-amber-50 dark:bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-300">
                    Notice period is {gap} day{gap === 1 ? '' : 's'} but the employee's contractual notice is {noticeDays} days (Labour Act s.11). This may expose the company to a claim for payment in lieu of notice.
                  </div>
                );
              }
            }
            return null;
          })()}
          <div className="sm:col-span-2 flex justify-end">
            <Button onClick={startOffboarding} disabled={busy}>
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null} Start offboarding
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  // ── Existing record ──────────────────────────────────────────────────────
  const isComplete = term.status === 'completed';
  return (
    <div className="space-y-4">
      {/* Summary */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Offboarding · {prettyType(term.termination_type)}</CardTitle>
          <Badge variant="outline" className={STATUS_TONE[term.status] || ''}>{term.status.replace('_', ' ')}</Badge>
        </CardHeader>
        <CardContent className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div><p className="text-xs text-muted-foreground">Notice date</p><p className="font-medium">{term.notice_date ? formatDate(term.notice_date) : '—'}</p></div>
          <div><p className="text-xs text-muted-foreground">Last working day</p><p className="font-medium">{term.last_working_day ? formatDate(term.last_working_day) : '—'}</p></div>
          <div><p className="text-xs text-muted-foreground">Rehire eligible</p><p className="font-medium">{term.rehire_eligible ? 'Yes' : 'No'}</p></div>
          <div><p className="text-xs text-muted-foreground">Completed</p><p className="font-medium">{term.completed_at ? formatDate(term.completed_at) : '—'}</p></div>
          {term.reason && <div className="col-span-2 sm:col-span-4"><p className="text-xs text-muted-foreground">Reason</p><p className="text-sm">{term.reason}</p></div>}
        </CardContent>
      </Card>

      {/* Final settlement estimate */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Final settlement</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1.5 text-sm">
            {estimate.proratedSalary > 0 && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Pro-rated final-month salary</span>
                <span className="tabular-nums">{formatNaira(estimate.proratedSalary)}</span>
              </div>
            )}
            {estimate.gratuity > 0 && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">
                  Gratuity ({estimate.yearsOfService} year{estimate.yearsOfService === 1 ? '' : 's'} × {policy.gratuity_months_per_year} month{policy.gratuity_months_per_year === 1 ? '' : 's'}/yr)
                </span>
                <span className="tabular-nums">{formatNaira(estimate.gratuity)}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-muted-foreground">Accrued unused leave ({unusedLeaveDays} day{unusedLeaveDays === 1 ? '' : 's'})</span>
              <span className="tabular-nums">{formatNaira(estimate.leavePayout)}</span>
            </div>
            {(estimate.proratedSalary > 0 || estimate.gratuity > 0) && (
              <div className="flex justify-between font-medium pt-1.5">
                <span>Gross settlement</span>
                <span className="tabular-nums">{formatNaira(estimate.gross)}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-muted-foreground">Less: outstanding advances</span>
              <span className="tabular-nums text-destructive">−{formatNaira(estimate.advancesOutstanding)}</span>
            </div>
            <div className="flex justify-between border-t pt-1.5 font-semibold">
              <span>Estimated net settlement</span>
              <span className="tabular-nums">{formatNaira(estimate.net)}</span>
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Estimate only (leave payout at salary ÷ 22 working days; gratuity at {policy.gratuity_months_per_year || 0} month/yr; pro-rate {policy.last_month_prorated ? 'on' : 'off'}).
            Statutory PAYE and pension adjustments are excluded — confirm the agreed figure before paying.
          </p>
          {!isComplete && (
            <div className="flex items-end gap-2">
              <div className="space-y-1 flex-1 max-w-xs">
                <Label>Agreed settlement (₦)</Label>
                <Input type="number" min="0" value={settlement} onChange={(e) => setSettlement(e.target.value)} placeholder={String(Math.max(0, estimate.net))} />
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Assets to return */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Assets to return ({assets.length})</CardTitle></CardHeader>
        <CardContent>
          {assets.length === 0 ? (
            <p className="text-sm text-muted-foreground">No company assets are assigned to this employee.</p>
          ) : (
            <div className="space-y-2">
              {assets.map((a) => (
                <div key={a.id} className="flex items-center justify-between gap-2 border rounded-lg p-2.5 text-sm">
                  <div className="min-w-0"><p className="font-medium truncate">{a.name}</p><p className="text-xs text-muted-foreground">{a.asset_number}</p></div>
                  {!isComplete && <Button size="sm" variant="outline" onClick={() => markAssetReturned(a.id)}>Mark returned</Button>}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Exit interview */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Exit interview</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <Textarea value={exitNotes} onChange={(e) => setExitNotes(e.target.value)} rows={4} disabled={isComplete} placeholder="Feedback, handover notes, reason for leaving…" />
          {!isComplete && (
            <div className="flex justify-between items-center">
              <a href="/onboarding" className="text-xs text-primary inline-flex items-center gap-1"><Download className="h-3 w-3" /> Offboarding checklist</a>
              <div className="flex gap-2">
                <Button variant="outline" onClick={saveRecord} disabled={busy}>{busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null} Save</Button>
                <Button onClick={completeOffboarding} disabled={busy}>Complete offboarding</Button>
              </div>
            </div>
          )}
          {isComplete && <p className="text-sm text-muted-foreground">This offboarding is complete and the employee has been deactivated.</p>}
        </CardContent>
      </Card>
    </div>
  );
}
