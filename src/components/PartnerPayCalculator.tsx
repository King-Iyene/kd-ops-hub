// Contractors → Partner Pay
//
// Computes what a partner-payment run will cost, the safe way: partners are
// priced in USD; the calculator multiplies the per-partner USD amount by the
// count of ACTIVE partners and converts to NGN at the live FX rate.
// Everything is derived — the NGN figure is never hand-typed — and only ACTIVE
// partners are counted, with everyone excluded shown with a reason.
//
// Batches are built in a review step (max 100 partners — Paystack's bulk-transfer
// limit) so a human confirms who is paid and how much before a draft is created.
// Partners already in a non-rejected batch for the current period are excluded so
// nobody is double-paid. Per-row amount edits apply to the batch only; the
// contractor's stored default is never changed as a side effect.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Dialog, DialogContent, DialogHeader, DialogFooter, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { logAudit } from '@/lib/audit';
import { formatDateTime } from '@/lib/format';
import {
  toMinor, toMajor, usdMinorToNgnMinor, sumMinor,
  formatUsdMinor, formatNgnMinor,
} from '@/lib/money';
import { Loader2, Save, Users, ArrowRightLeft, AlertTriangle, Info, FileText } from 'lucide-react';

const SINGLETON_ID = '00000000-0000-0000-0000-000000000001';
// Paystack bulk transfers accept at most 100 transfers per call, so a batch
// never exceeds this. Building in groups of ≤100 also keeps each batch reviewable.
const MAX_BATCH = 100;

interface PartnerRow {
  id: string;
  full_name: string;
  status: string;
  heyreach_status: string | null;
  pay_amount_usd_minor: number | null;
  bank_name: string | null;
  account_number: string | null;
}

const hasBank = (p: PartnerRow) =>
  /^\d{10}$/.test(p.account_number || '') && !!(p.bank_name && p.bank_name.trim());

// The pay period label used for the batch + the "already batched" exclusion.
function periodLabel(d = new Date()) {
  return d.toLocaleString('en-GB', { month: 'long', year: 'numeric' });
}

export default function PartnerPayCalculator() {
  const { toast } = useToast();
  const { profile } = useAuthStore();
  const canEdit = ['super_admin', 'admin', 'finance'].includes(profile?.role ?? '');
  // Generating a draft batch from here is a super-admin-only action.
  const isSuperAdmin = (profile?.role ?? '') === 'super_admin';

  const [loading, setLoading] = useState(true);
  const [partners, setPartners] = useState<PartnerRow[]>([]);
  const [globalUsdMinor, setGlobalUsdMinor] = useState(0);
  const [globalInput, setGlobalInput] = useState('0');
  const [rate, setRate] = useState<number | null>(null);
  const [rateAt, setRateAt] = useState<string | null>(null);
  // Per-run exchange rate: use the live settings rate, or a manually-typed one.
  // The manual rate is NOT saved (resets on reload) and never touches fx_rates —
  // it only affects this calculation and the draft batch it generates.
  const [rateSource, setRateSource] = useState<'settings' | 'manual'>('settings');
  const [manualRateInput, setManualRateInput] = useState('');
  const [savingGlobal, setSavingGlobal] = useState(false);
  const [generating, setGenerating] = useState(false);
  // Duplicate-batch override: set when selected partners already have a batch
  // this period, so the operator can confirm a deliberate repeat with a reason.
  const [dupeOverride, setDupeOverride] = useState<{ count: number } | null>(null);
  const [dupeReason, setDupeReason] = useState('');
  // Contractor ids already in a non-rejected batch for this period (don't re-pay).
  const [alreadyBatched, setAlreadyBatched] = useState<Set<string>>(new Set());

  // Batch builder (review step) state.
  const [buildOpen, setBuildOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [amountEdits, setAmountEdits] = useState<Record<string, string>>({});
  const [bulkInput, setBulkInput] = useState('');

  const period = periodLabel();

  const load = useCallback(async () => {
    const thisPeriod = periodLabel();
    const [contractorsRes, settingsRes, rateRes, batchedRes] = await Promise.all([
      supabase
        .from('contractors')
        .select('id, full_name, status, heyreach_status, pay_amount_usd_minor, bank_name, account_number')
        .neq('status', 'deleted')
        .neq('is_anonymised', true)
        .order('full_name')
        .limit(5000),
      supabase.from('company_settings').select('partner_pay_usd_minor').eq('id', SINGLETON_ID).maybeSingle(),
      supabase
        .from('fx_rates')
        .select('rate, valid_from')
        .eq('base', 'USD').eq('quote', 'NGN').eq('status', 'active')
        .order('valid_from', { ascending: false })
        .limit(1)
        .maybeSingle(),
      // Who is already in a contractor batch for this period that isn't rejected
      // or deleted — these partners are excluded so they can't be batched twice.
      supabase
        .from('batch_items')
        .select('contractor_id, payment_batches!inner(period, status, deleted_at, batch_type)')
        .not('contractor_id', 'is', null)
        .eq('payment_batches.batch_type', 'contractor')
        .eq('payment_batches.period', thisPeriod)
        .neq('payment_batches.status', 'rejected')
        .is('payment_batches.deleted_at', null)
        .limit(20000),
    ]);
    setPartners((contractorsRes.data as PartnerRow[]) || []);
    const g = Number((settingsRes.data as any)?.partner_pay_usd_minor ?? 0);
    setGlobalUsdMinor(g);
    setGlobalInput(String(toMajor(g)));
    setRate((rateRes.data as any)?.rate ?? null);
    setRateAt((rateRes.data as any)?.valid_from ?? null);
    const batched = new Set<string>();
    for (const r of ((batchedRes.data as any[]) || [])) {
      if (r.contractor_id) batched.add(r.contractor_id);
    }
    setAlreadyBatched(batched);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // An "active partner" = manually active AND connected on HeyReach. Everyone
  // else is excluded from the pay run with a plain reason (no silent payments).
  const { active, excluded } = useMemo(() => {
    const active: PartnerRow[] = [];
    const excluded: { p: PartnerRow; reason: string }[] = [];
    for (const p of partners) {
      if (p.status === 'inactive') { excluded.push({ p, reason: 'Inactive (deactivated by team)' }); continue; }
      if (p.heyreach_status === 'disconnected') { excluded.push({ p, reason: 'Disconnected from HeyReach' }); continue; }
      if (p.heyreach_status === 'active') { active.push(p); continue; }
      excluded.push({ p, reason: 'Pending — not verified on HeyReach yet' });
    }
    return { active, excluded };
  }, [partners]);

  // Per-partner USD = override when set, else the global default.
  const perPartnerMinor = (p: PartnerRow) =>
    p.pay_amount_usd_minor != null ? p.pay_amount_usd_minor : globalUsdMinor;

  // Of the active partners, only those with valid bank details can be paid;
  // the rest are flagged so a human adds their account (never silently dropped).
  const payable = useMemo(() => active.filter(hasBank), [active]);
  const needsBank = useMemo(() => active.filter((p) => !hasBank(p)), [active]);
  // Payable partners not yet in a batch this period — the pool a new batch draws
  // from. (Order matches the alphabetical load, so "first 100" is stable.)
  const eligible = useMemo(() => payable.filter((p) => !alreadyBatched.has(p.id)), [payable, alreadyBatched]);
  const alreadyCount = payable.length - eligible.length;

  // A valid manual rate (> 0), or null while empty/invalid.
  const manualRate = useMemo(() => {
    const n = parseFloat(manualRateInput.replace(/,/g, ''));
    return Number.isFinite(n) && n > 0 ? n : null;
  }, [manualRateInput]);
  const usingManual = rateSource === 'manual';
  // The rate every calc + the generated batch actually uses.
  const effectiveRate = usingManual ? manualRate : rate;

  // Totals reflect what a batch would actually PAY (payable partners), so the
  // headline NGN equals the batch total.
  const totals = useMemo(() => {
    const totalUsdMinor = sumMinor(payable.map(perPartnerMinor));
    const overrides = payable.filter((p) => p.pay_amount_usd_minor != null).length;
    const totalNgnMinor = effectiveRate != null ? usdMinorToNgnMinor(totalUsdMinor, effectiveRate) : null;
    const flat = overrides === 0;
    return { totalUsdMinor, totalNgnMinor, overrides, flat };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payable, globalUsdMinor, effectiveRate]);

  const saveGlobal = async () => {
    const major = parseFloat(globalInput.replace(/,/g, ''));
    if (!(major >= 0)) {
      toast({ title: 'Enter a valid amount', description: 'USD amount must be zero or more.', variant: 'destructive' });
      return;
    }
    const minor = toMinor(major);
    setSavingGlobal(true);
    try {
      const { error } = await supabase
        .from('company_settings')
        .update({ partner_pay_usd_minor: minor } as never)
        .eq('id', SINGLETON_ID);
      if (error) throw error;
      setGlobalUsdMinor(minor);
      toast({ title: 'Saved', description: `Default per-partner pay set to ${formatUsdMinor(minor)}.` });
    } catch (err: any) {
      toast({ title: 'Could not save', description: err?.message ?? '', variant: 'destructive' });
    } finally {
      setSavingGlobal(false);
    }
  };

  // Open the review step, pre-selecting the first ≤100 eligible partners and
  // resetting any per-row amount edits to the default.
  const openBuilder = () => {
    setSelected(new Set(eligible.slice(0, MAX_BATCH).map((p) => p.id)));
    setAmountEdits({});
    setBulkInput(String(toMajor(globalUsdMinor)));
    setBuildOpen(true);
  };

  const toggleSelected = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) { next.delete(id); return next; }
      if (next.size >= MAX_BATCH) return prev; // hard cap — ignore extra picks
      next.add(id);
      return next;
    });
  };

  // The USD (minor units) for a row: a valid per-row edit wins, else the default.
  // Returns null when the row has been edited to something invalid.
  const rowUsdMinor = (p: PartnerRow): number | null => {
    const edit = amountEdits[p.id];
    if (edit !== undefined && edit.trim() !== '') {
      const n = parseFloat(edit.replace(/,/g, ''));
      return Number.isFinite(n) && n >= 0 ? toMinor(n) : null;
    }
    return perPartnerMinor(p);
  };

  // Apply one amount to every row in the builder (the "same amount for all" path).
  const applyBulkAmount = () => {
    const next: Record<string, string> = {};
    for (const p of eligible) next[p.id] = bulkInput;
    setAmountEdits(next);
  };

  const selectedRows = useMemo(() => eligible.filter((p) => selected.has(p.id)), [eligible, selected]);
  const builderHasInvalid = selectedRows.some((p) => rowUsdMinor(p) == null);
  const builderTotalUsdMinor = sumMinor(selectedRows.map((p) => rowUsdMinor(p) ?? 0));
  const builderTotalNgnMinor = effectiveRate != null ? usdMinorToNgnMinor(builderTotalUsdMinor, effectiveRate) : null;

  // Create a DRAFT batch from the SELECTED partners, using each row's amount. The
  // NGN is computed per line at the effective rate (snapshotted on the batch +
  // each line) and enters the normal approval flow — nothing is paid until approved.
  const generateSelectedBatch = async () => {
    if (effectiveRate == null) {
      toast({
        title: 'No exchange rate',
        description: usingManual ? 'Enter a valid manual rate first.' : 'Set an active rate in Settings → Exchange rate, or switch to a manual rate.',
        variant: 'destructive',
      });
      return;
    }
    if (selectedRows.length === 0) {
      toast({ title: 'No partners selected', description: 'Select at least one partner for this batch.', variant: 'destructive' });
      return;
    }
    if (builderHasInvalid) {
      toast({ title: 'Fix the amounts', description: 'Every selected partner needs a valid USD amount (zero or more).', variant: 'destructive' });
      return;
    }
    // Race-safe dup guard: `alreadyBatched` is computed at page load, so another
    // tab/teammate could have batched some of these partners since then. Re-check
    // FRESH. Keyed on contractor_id + period — a partner's second account is a
    // SEPARATE contractor record (different id), so it is NEVER blocked here;
    // only the SAME contractor record being batched twice triggers the confirm.
    setGenerating(true);
    const selIds = selectedRows.map((p) => p.id);
    const { data: freshDupes } = await supabase
      .from('batch_items')
      .select('contractor_id, payment_batches!inner(period, status, deleted_at, batch_type)')
      .in('contractor_id', selIds)
      .eq('payment_batches.batch_type', 'contractor')
      .eq('payment_batches.period', period)
      .neq('payment_batches.status', 'rejected')
      .is('payment_batches.deleted_at', null)
      .limit(20000);
    setGenerating(false);
    const dupeIds = new Set(((freshDupes as any[]) || []).map((d) => d.contractor_id).filter(Boolean));
    if (dupeIds.size > 0) {
      // Don't dead-end a legitimate repeat (e.g. a partner with a second account
      // who's already in this period's batch). Open a confirm that REQUIRES a
      // reason, then force the batch through (logged to the audit trail).
      setDupeReason('');
      setDupeOverride({ count: dupeIds.size });
      return;
    }
    await createBatch();
  };

  // Performs the actual draft-batch insert. `overrideReason` is set only when the
  // operator chose "Pay anyway" past the duplicate guard, and is audit-logged.
  async function createBatch(overrideReason?: string) {
    setGenerating(true);
    try {
      const now = new Date();
      const lines = selectedRows.map((p) => {
        const usdMinor = rowUsdMinor(p) as number;
        return { p, usdMinor, ngnMinor: usdMinorToNgnMinor(usdMinor, effectiveRate) };
      });
      const totalNgnMinor = sumMinor(lines.map((l) => l.ngnMinor));

      const { data: batch, error } = await supabase
        .from('payment_batches')
        .insert({
          name: `Partner Pay — ${period}`,
          payment_date: now.toISOString().slice(0, 10),
          period,
          total_amount: toMajor(totalNgnMinor),
          beneficiary_count: lines.length,
          batch_type: 'contractor',
          status: 'draft',
          created_by: profile?.id,
          fx_rate_used: effectiveRate,
          fx_base: 'USD',
          fx_quote: 'NGN',
        } as never)
        .select()
        .single();
      if (error) throw error;

      const items = lines.map((l) => ({
        batch_id: (batch as any).id,
        contractor_id: l.p.id,
        item_type: 'contractor',
        full_name: l.p.full_name,
        bank_name: l.p.bank_name,
        account_number: l.p.account_number,
        account_name: l.p.full_name,
        amount_ngn: toMajor(l.ngnMinor),
        reference: `Partner Pay — ${l.p.full_name} — ${period}`,
        source_usd_minor: l.usdMinor,
        status: 'pending',
      }));
      const { error: itemsErr } = await supabase.from('batch_items').insert(items as never);
      if (itemsErr) throw itemsErr;

      if (overrideReason) {
        await logAudit(
          'partner_pay_duplicate_override' as never,
          `Partner Pay batch (${period}) created including partner(s) already batched this period — reason: ${overrideReason}`,
          profile,
        );
      }

      const remaining = eligible.length - lines.length;
      toast({
        title: 'Draft batch created',
        description: `${lines.length} partners · ${formatNgnMinor(totalNgnMinor)}. ${remaining > 0 ? `${remaining} still to batch this period — build the next one.` : 'Everyone is now batched for this period.'} Review & approve in Payments.`,
      });
      setBuildOpen(false);
      await load(); // refresh so the just-batched partners drop out of "eligible"
    } catch (err: any) {
      toast({ title: 'Could not create batch', description: err?.message ?? '', variant: 'destructive' });
    } finally {
      setGenerating(false);
    }
  };

  if (loading) {
    return <div className="flex items-center gap-2 text-muted-foreground py-8"><Loader2 className="h-4 w-4 animate-spin" /> Loading pay calculator…</div>;
  }

  const noRate = effectiveRate == null;

  return (
    <div className="space-y-4">
      {/* Config */}
      <Card>
        <CardHeader><CardTitle className="text-base">Per-partner pay</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Default pay per partner (USD)</Label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                  <Input
                    inputMode="decimal"
                    value={globalInput}
                    onChange={(e) => setGlobalInput(e.target.value)}
                    className="pl-7 tabular-nums"
                    disabled={!canEdit}
                  />
                </div>
                {canEdit && (
                  <Button onClick={saveGlobal} disabled={savingGlobal}>
                    {savingGlobal ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  </Button>
                )}
              </div>
              <p className="text-[11px] text-muted-foreground">Applied to every active partner without a personal override.</p>
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <Label>Exchange rate {usingManual ? '(manual)' : '(live)'}</Label>
                {canEdit && (
                  <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground cursor-pointer">
                    Enter manually
                    <Switch
                      checked={usingManual}
                      onCheckedChange={(v) => {
                        // Prefill the manual field with the live rate for convenience.
                        if (v && !manualRateInput && rate != null) setManualRateInput(String(rate));
                        setRateSource(v ? 'manual' : 'settings');
                      }}
                    />
                  </label>
                )}
              </div>
              {usingManual ? (
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">₦</span>
                  <Input
                    inputMode="decimal"
                    value={manualRateInput}
                    onChange={(e) => setManualRateInput(e.target.value)}
                    placeholder="1370.15"
                    className="pl-7 tabular-nums"
                  />
                </div>
              ) : (
                <div className="h-10 flex items-center px-3 rounded-md border bg-muted/30 tabular-nums">
                  {rate == null ? <span className="text-amber-600 text-sm">No active rate — set one in Settings, or switch to manual</span>
                          : <>1 USD = ₦{rate.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}</>}
                </div>
              )}
              <p className="text-[11px] text-muted-foreground">
                {usingManual
                  ? 'Used for this run only — not saved, and the draft batch records the rate you used.'
                  : (rateAt ? `Locked from the rate effective ${formatDateTime(rateAt)}` : 'Set in Settings → Exchange rate.')}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* The computation */}
      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><ArrowRightLeft className="h-4 w-4 text-muted-foreground" /> This run</CardTitle></CardHeader>
        <CardContent className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Stat label="Active partners" value={String(active.length)} icon={<Users className="h-4 w-4" />} />
            <Stat label="Total (USD)" value={formatUsdMinor(totals.totalUsdMinor)} />
            <Stat
              label="Total to pay (NGN)"
              value={totals.totalNgnMinor == null ? '—' : formatNgnMinor(totals.totalNgnMinor)}
              emphasis
            />
          </div>

          {/* Plain-language working so a human can verify the math at a glance. */}
          <div className="rounded-lg border border-border/70 bg-muted/20 p-3 text-sm text-muted-foreground">
            {totals.flat ? (
              <>
                <span className="text-foreground font-medium">{payable.length}</span> payable partner{payable.length === 1 ? '' : 's'} ×{' '}
                <span className="text-foreground font-medium">{formatUsdMinor(globalUsdMinor)}</span> ={' '}
                <span className="text-foreground font-medium">{formatUsdMinor(totals.totalUsdMinor)}</span>
                {!noRate && <>{' '}× <span className="text-foreground font-medium">₦{effectiveRate!.toLocaleString('en-US', { maximumFractionDigits: 2 })}</span> ={' '}
                  <span className="text-foreground font-semibold">{formatNgnMinor(totals.totalNgnMinor!)}</span></>}
              </>
            ) : (
              <>Sum of <span className="text-foreground font-medium">{payable.length}</span> payable partners
                ({totals.overrides} with a personal amount) ={' '}
                <span className="text-foreground font-medium">{formatUsdMinor(totals.totalUsdMinor)}</span>
                {!noRate && <>{' '}→ <span className="text-foreground font-semibold">{formatNgnMinor(totals.totalNgnMinor!)}</span> at the live rate</>}
              </>
            )}
          </div>

          {noRate && (
            <div className="flex items-start gap-2 text-sm text-amber-700 bg-amber-500/5 border border-amber-500/30 rounded-lg p-3">
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
              <span>{usingManual ? <>Enter a valid <b>manual rate</b> above to see the Naira total. The USD figures are already final.</> : <>Set an active exchange rate in <b>Settings → Exchange rate</b> (or switch to a manual rate) to see the Naira total. The USD figures above are already final.</>}</span>
            </div>
          )}

          {needsBank.length > 0 && (
            <div className="flex items-start gap-2 text-sm text-amber-700 bg-amber-500/5 border border-amber-500/30 rounded-lg p-3">
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
              <span>
                <b>{needsBank.length}</b> active partner{needsBank.length === 1 ? '' : 's'}{' '}
                {needsBank.length === 1 ? 'has' : 'have'} no valid bank details and {needsBank.length === 1 ? 'is' : 'are'}{' '}
                <b>excluded</b> from the batch. Add their bank account to include them.
              </span>
            </div>
          )}

          {alreadyCount > 0 && (
            <div className="flex items-start gap-2 text-sm text-muted-foreground bg-muted/30 border border-border/70 rounded-lg p-3">
              <Info className="h-4 w-4 mt-0.5 shrink-0" />
              <span><b>{alreadyCount}</b> payable partner{alreadyCount === 1 ? '' : 's'} {alreadyCount === 1 ? 'is' : 'are'} already in a batch for {period} and {alreadyCount === 1 ? 'is' : 'are'} excluded here. <b>{eligible.length}</b> still to batch.</span>
            </div>
          )}

          {canEdit && (
            <div className="flex items-center gap-3 flex-wrap pt-1">
              <Button onClick={openBuilder} disabled={!isSuperAdmin || noRate || eligible.length === 0}>
                <FileText className="mr-2 h-4 w-4" />
                Build draft batch{eligible.length > 0 ? ` (${Math.min(eligible.length, MAX_BATCH)} of ${eligible.length})` : ''}
              </Button>
              <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                <Info className="h-3 w-3" />
                {isSuperAdmin
                  ? <>Review up to {MAX_BATCH} partners &amp; their amounts, then create a draft for approval — nothing is paid until you approve it.</>
                  : <>Only a <b>super admin</b> can build a draft batch from here. Ask one to enable it.</>}
              </span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Excluded partners — transparency on who is NOT being paid and why */}
      {excluded.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Excluded from this run ({excluded.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col divide-y divide-border/60">
              {excluded.slice(0, 50).map(({ p, reason }) => (
                <div key={p.id} className="flex items-center justify-between py-2 text-sm">
                  <span className="font-medium">{p.full_name}</span>
                  <Badge variant="secondary" className="bg-muted text-muted-foreground font-normal">{reason}</Badge>
                </div>
              ))}
              {excluded.length > 50 && (
                <p className="text-xs text-muted-foreground py-2">+ {excluded.length - 50} more</p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Review step: pick ≤100 partners and confirm amounts before creating a draft. */}
      <Dialog open={buildOpen} onOpenChange={setBuildOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Build draft batch — {period}</DialogTitle>
            <DialogDescription>
              Confirm who is paid and how much, then create a draft for approval. Up to {MAX_BATCH} partners per batch
              (Paystack's limit){alreadyCount > 0 ? ` — ${alreadyCount} already batched this period are not shown` : ''}.
            </DialogDescription>
          </DialogHeader>

          {/* Same-amount-for-all control. */}
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Set all to (USD)</Label>
              <div className="relative w-40">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                <Input inputMode="decimal" value={bulkInput} onChange={(e) => setBulkInput(e.target.value)} className="pl-7 tabular-nums" />
              </div>
            </div>
            <Button type="button" variant="outline" onClick={applyBulkAmount}>Apply to all</Button>
            <span className="text-[11px] text-muted-foreground pb-2">Or edit any row below for a different amount. Amounts apply to this batch only.</span>
          </div>

          <div className="flex items-center justify-between text-sm">
            <span className={selected.size >= MAX_BATCH ? 'text-amber-600' : 'text-muted-foreground'}>
              <b>{selected.size}</b> / {MAX_BATCH} selected{selected.size >= MAX_BATCH ? ' (max reached)' : ''}
            </span>
            <span className="text-muted-foreground">{eligible.length} eligible</span>
          </div>

          <ScrollArea className="h-[46vh] rounded-lg border border-border/70">
            <Table>
              <TableHeader className="sticky top-0 bg-background z-10">
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-10"></TableHead>
                  <TableHead>Partner</TableHead>
                  <TableHead className="text-right w-[140px]">USD</TableHead>
                  <TableHead className="text-right w-[150px]">NGN</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {eligible.map((p) => {
                  const isSel = selected.has(p.id);
                  const m = rowUsdMinor(p);
                  const ngn = m != null && effectiveRate != null ? usdMinorToNgnMinor(m, effectiveRate) : null;
                  return (
                    <TableRow key={p.id} className={isSel ? '' : 'opacity-60'}>
                      <TableCell>
                        <Checkbox
                          checked={isSel}
                          disabled={!isSel && selected.size >= MAX_BATCH}
                          onCheckedChange={() => toggleSelected(p.id)}
                        />
                      </TableCell>
                      <TableCell className="font-medium">{p.full_name}</TableCell>
                      <TableCell className="text-right">
                        <div className="relative">
                          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground text-xs">$</span>
                          <Input
                            inputMode="decimal"
                            className={`h-8 pl-5 text-right tabular-nums ${m == null ? 'border-destructive' : ''}`}
                            value={amountEdits[p.id] ?? String(toMajor(perPartnerMinor(p)))}
                            onChange={(e) => setAmountEdits((prev) => ({ ...prev, [p.id]: e.target.value }))}
                            disabled={!isSel}
                          />
                        </div>
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {m == null ? <span className="text-destructive">invalid</span> : ngn == null ? '—' : formatNgnMinor(ngn)}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </ScrollArea>

          <DialogFooter className="sm:justify-between gap-3 items-center">
            <div className="text-sm tabular-nums">
              <span className="text-muted-foreground">{selectedRows.length} selected · </span>
              <span className="font-medium">{formatUsdMinor(builderTotalUsdMinor)}</span>
              {builderTotalNgnMinor != null && <span className="font-semibold"> · {formatNgnMinor(builderTotalNgnMinor)}</span>}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setBuildOpen(false)} disabled={generating}>Cancel</Button>
              <Button onClick={generateSelectedBatch} disabled={generating || noRate || selectedRows.length === 0 || builderHasInvalid}>
                {generating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileText className="mr-2 h-4 w-4" />}
                Create draft ({selectedRows.length})
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Duplicate-batch override: pay already-batched partners again, with a reason. */}
      <Dialog open={!!dupeOverride} onOpenChange={(v) => { if (!v) { setDupeOverride(null); setDupeReason(''); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-warning" />
              Some partners already have a {period} batch
            </DialogTitle>
            <DialogDescription>
              {dupeOverride?.count} of the selected partner{dupeOverride?.count === 1 ? '' : 's'} already
              {dupeOverride?.count === 1 ? ' has' : ' have'} a batch this period. This is usually an
              accidental duplicate. If they genuinely need a second payment (e.g. a partner with two
              accounts), enter why and pay anyway — it'll be recorded in the audit log.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1">
            <Label>Reason for the repeat payment</Label>
            <Textarea
              value={dupeReason}
              onChange={(e) => setDupeReason(e.target.value)}
              placeholder="e.g. This partner has two accounts and is paid on both."
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setDupeOverride(null); setDupeReason(''); load(); }} disabled={generating}>
              Cancel &amp; refresh
            </Button>
            <Button
              variant="destructive"
              disabled={generating || dupeReason.trim().length < 5}
              onClick={() => { const r = dupeReason.trim(); setDupeOverride(null); setDupeReason(''); createBatch(r); }}
            >
              {generating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Pay anyway
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Stat({ label, value, icon, emphasis }: { label: string; value: string; icon?: React.ReactNode; emphasis?: boolean }) {
  return (
    <div className={`rounded-lg border p-4 ${emphasis ? 'border-primary/30 bg-primary/5' : 'border-border/70'}`}>
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">{icon}{label}</div>
      <div className={`mt-1 tabular-nums ${emphasis ? 'text-2xl font-semibold' : 'text-xl font-medium'}`}>{value}</div>
    </div>
  );
}
