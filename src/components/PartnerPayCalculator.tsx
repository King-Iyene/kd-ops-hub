// Contractors → Partner Pay
//
// Computes what a partner-payment run will cost, the safe way: partners are
// priced in USD; the calculator multiplies the per-partner USD amount by the
// count of ACTIVE partners and converts to NGN at the live FX rate (Phase 0).
// Everything is derived — the NGN figure is never hand-typed — and only ACTIVE
// partners are counted, with everyone excluded shown with a reason.
//
// Phase 1a: preview + config only (read-only on money). The "Generate draft
// batch" bridge into the approval/Paystack pipeline lands in Phase 1b.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { formatDateTime } from '@/lib/format';
import {
  toMinor, toMajor, usdMinorToNgnMinor, sumMinor,
  formatUsdMinor, formatNgnMinor,
} from '@/lib/money';
import { Loader2, Save, Users, ArrowRightLeft, AlertTriangle, Info, FileText } from 'lucide-react';

const SINGLETON_ID = '00000000-0000-0000-0000-000000000001';

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

export default function PartnerPayCalculator() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const { profile } = useAuthStore();
  const canEdit = ['super_admin', 'admin', 'finance'].includes(profile?.role ?? '');

  const [loading, setLoading] = useState(true);
  const [partners, setPartners] = useState<PartnerRow[]>([]);
  const [globalUsdMinor, setGlobalUsdMinor] = useState(0);
  const [globalInput, setGlobalInput] = useState('0');
  const [rate, setRate] = useState<number | null>(null);
  const [rateAt, setRateAt] = useState<string | null>(null);
  const [savingGlobal, setSavingGlobal] = useState(false);
  const [generating, setGenerating] = useState(false);

  const load = useCallback(async () => {
    const [contractorsRes, settingsRes, rateRes] = await Promise.all([
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
    ]);
    setPartners((contractorsRes.data as PartnerRow[]) || []);
    const g = Number((settingsRes.data as any)?.partner_pay_usd_minor ?? 0);
    setGlobalUsdMinor(g);
    setGlobalInput(String(toMajor(g)));
    setRate((rateRes.data as any)?.rate ?? null);
    setRateAt((rateRes.data as any)?.valid_from ?? null);
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

  // Totals reflect what a batch would actually PAY (payable partners), so the
  // headline NGN equals the batch total.
  const totals = useMemo(() => {
    const totalUsdMinor = sumMinor(payable.map(perPartnerMinor));
    const overrides = payable.filter((p) => p.pay_amount_usd_minor != null).length;
    const totalNgnMinor = rate != null ? usdMinorToNgnMinor(totalUsdMinor, rate) : null;
    const flat = overrides === 0;
    return { totalUsdMinor, totalNgnMinor, overrides, flat };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payable, globalUsdMinor, rate]);

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

  // Create a DRAFT payment batch from the payable partners. The NGN is computed
  // per partner at the locked rate (snapshotted on the batch + each line). It
  // enters the normal Payments approval flow — nothing is paid until approved.
  const generateBatch = async () => {
    if (rate == null) {
      toast({ title: 'No exchange rate', description: 'Set an active rate in Settings → Exchange rate first.', variant: 'destructive' });
      return;
    }
    if (payable.length === 0) {
      toast({ title: 'No payable partners', description: 'No active partners have valid bank details.', variant: 'destructive' });
      return;
    }
    setGenerating(true);
    try {
      const now = new Date();
      const monthLong = now.toLocaleString('en-GB', { month: 'long', year: 'numeric' });
      const lines = payable.map((p) => {
        const usdMinor = perPartnerMinor(p);
        return { p, usdMinor, ngnMinor: usdMinorToNgnMinor(usdMinor, rate) };
      });
      const totalNgnMinor = sumMinor(lines.map((l) => l.ngnMinor));

      const { data: batch, error } = await supabase
        .from('payment_batches')
        .insert({
          name: `Partner Pay — ${monthLong}`,
          payment_date: now.toISOString().slice(0, 10),
          period: monthLong,
          total_amount: toMajor(totalNgnMinor),
          beneficiary_count: lines.length,
          batch_type: 'contractor',
          status: 'draft',
          created_by: profile?.id,
          fx_rate_used: rate,
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
        reference: `Partner Pay — ${l.p.full_name} — ${monthLong}`,
        source_usd_minor: l.usdMinor,
        status: 'pending',
      }));
      const { error: itemsErr } = await supabase.from('batch_items').insert(items as never);
      if (itemsErr) throw itemsErr;

      toast({
        title: 'Draft batch created',
        description: `${lines.length} partners · ${formatNgnMinor(totalNgnMinor)}. Review and approve it next.`,
      });
      navigate(`/payments/${(batch as any).id}`);
    } catch (err: any) {
      toast({ title: 'Could not create batch', description: err?.message ?? '', variant: 'destructive' });
    } finally {
      setGenerating(false);
    }
  };

  if (loading) {
    return <div className="flex items-center gap-2 text-muted-foreground py-8"><Loader2 className="h-4 w-4 animate-spin" /> Loading pay calculator…</div>;
  }

  const noRate = rate == null;

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
              <Label>Exchange rate (live)</Label>
              <div className="h-10 flex items-center px-3 rounded-md border bg-muted/30 tabular-nums">
                {noRate ? <span className="text-amber-600 text-sm">No active rate — set one in Settings → Exchange rate</span>
                        : <>1 USD = ₦{rate!.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}</>}
              </div>
              <p className="text-[11px] text-muted-foreground">{rateAt ? `Locked from the rate effective ${formatDateTime(rateAt)}` : 'Set in Settings → Exchange rate.'}</p>
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
                {!noRate && <>{' '}× <span className="text-foreground font-medium">₦{rate!.toLocaleString('en-US', { maximumFractionDigits: 2 })}</span> ={' '}
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
              <span>Set an active exchange rate in <b>Settings → Exchange rate</b> to see the Naira total. The USD figures above are already final.</span>
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

          {canEdit && (
            <div className="flex items-center gap-3 flex-wrap pt-1">
              <Button onClick={generateBatch} disabled={generating || noRate || payable.length === 0}>
                {generating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileText className="mr-2 h-4 w-4" />}
                Generate draft batch ({payable.length})
              </Button>
              <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                <Info className="h-3 w-3" /> Creates a draft in Payments for review &amp; approval — nothing is paid until you approve it.
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
