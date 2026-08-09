// Referrals → Commissions
//
// Referrers/affiliates ARE contractors. This view derives the commission roster
// automatically: group referrals by the referrer contractor, split by programme.
// The two programmes follow DIFFERENT rules:
//
//   Referral  — ONE-TIME bonus. An account counts only once it has been active
//               for the qualifying window (default 30 days), measured from its
//               account_start_date (falls back to converted_at, then created_at).
//               Payable = referral rate × qualified accounts.
//   Affiliate — RECURRING (monthly), TIERED per affiliate. Base rate per active
//               account; once an affiliate hits the threshold (default 50) the
//               increased rate applies — marginal (only accounts above) or whole.
//
// A typed override replaces the auto-count for accounts referred before tracking
// (override is treated as already-qualified). Per programme: accounts → USD → NGN
// at the live rate.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  toMinor, toMajor, multiplyMinor, tieredCommissionMinor, usdMinorToNgnMinor, sumMinor,
  formatUsdMinor, formatNgnMinor, type TierMode,
} from '@/lib/money';
import { Loader2, Save, Info, AlertTriangle } from 'lucide-react';

const SINGLETON_ID = '00000000-0000-0000-0000-000000000001';
const DAY_MS = 24 * 60 * 60 * 1000;

interface RefRow {
  referrer_contractor_id: string | null;
  is_affiliate: boolean;
  status: string;
  account_start_date: string | null;
  converted_at: string | null;
  created_at: string | null;
}

interface Row {
  contractorId: string;
  name: string;
  autoCount: number;     // affiliate: active accounts; referral: QUALIFIED accounts
  pendingCount: number;  // referral only: active but still inside the qualifying window
  override: number | null;
  effective: number;
  usdMinor: number;
  ngnMinor: number | null;
}

export default function ReferralCommissions() {
  const { toast } = useToast();
  const { profile } = useAuthStore();
  const canEdit = ['super_admin', 'admin', 'finance'].includes(profile?.role ?? '');

  const [loading, setLoading] = useState(true);
  const [refs, setRefs] = useState<RefRow[]>([]);
  const [names, setNames] = useState<Map<string, string>>(new Map());
  const [overrides, setOverrides] = useState<Map<string, number>>(new Map()); // key `${cid}:${aff}`

  // Saved rule parameters.
  const [referralRateMinor, setReferralRateMinor] = useState(0);
  const [referralDays, setReferralDays] = useState(30);
  const [affiliateRateMinor, setAffiliateRateMinor] = useState(0);     // base
  const [affiliateTier2Minor, setAffiliateTier2Minor] = useState(0);   // increased
  const [affiliateThreshold, setAffiliateThreshold] = useState(50);
  const [affiliateMode, setAffiliateMode] = useState<TierMode>('marginal');

  // Editable inputs (strings while typing).
  const [referralInput, setReferralInput] = useState('0');
  const [referralDaysInput, setReferralDaysInput] = useState('30');
  const [affiliateInput, setAffiliateInput] = useState('0');
  const [affiliateTier2Input, setAffiliateTier2Input] = useState('0');
  const [affiliateThresholdInput, setAffiliateThresholdInput] = useState('50');
  const [affiliateWhole, setAffiliateWhole] = useState(false);

  const [rate, setRate] = useState<number | null>(null);
  const [savingKind, setSavingKind] = useState<'referral' | 'affiliate' | null>(null);
  const [countEdits, setCountEdits] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    const [refRes, conRes, ovRes, settingsRes, rateRes] = await Promise.all([
      supabase.from('referrals').select('referrer_contractor_id, is_affiliate, status, account_start_date, converted_at, created_at').not('referrer_contractor_id', 'is', null).limit(20000),
      supabase.from('contractors').select('id, full_name').neq('status', 'deleted').limit(5000),
      supabase.from('commission_overrides').select('contractor_id, is_affiliate, manual_count').limit(20000),
      supabase.from('company_settings').select('referral_rate_usd_minor, affiliate_rate_usd_minor, referral_qualifying_days, affiliate_rate_tier2_usd_minor, affiliate_tier_threshold, affiliate_tier_mode').eq('id', SINGLETON_ID).maybeSingle(),
      supabase.from('fx_rates').select('rate').eq('base', 'USD').eq('quote', 'NGN').eq('status', 'active').order('valid_from', { ascending: false }).limit(1).maybeSingle(),
    ]);
    setRefs((refRes.data as RefRow[]) || []);
    const nm = new Map<string, string>();
    for (const c of ((conRes.data as any[]) || [])) nm.set(c.id, c.full_name);
    setNames(nm);
    const ov = new Map<string, number>();
    for (const o of ((ovRes.data as any[]) || [])) {
      if (o.manual_count != null) ov.set(`${o.contractor_id}:${o.is_affiliate}`, o.manual_count);
    }
    setOverrides(ov);

    const s = (settingsRes.data as any) ?? {};
    const rr = Number(s.referral_rate_usd_minor ?? 0);
    const ar = Number(s.affiliate_rate_usd_minor ?? 0);
    const t2 = Number(s.affiliate_rate_tier2_usd_minor ?? 0);
    const days = Number(s.referral_qualifying_days ?? 30);
    const thr = Number(s.affiliate_tier_threshold ?? 50);
    const mode: TierMode = s.affiliate_tier_mode === 'whole' ? 'whole' : 'marginal';
    setReferralRateMinor(rr); setReferralInput(String(toMajor(rr)));
    setReferralDays(days); setReferralDaysInput(String(days));
    setAffiliateRateMinor(ar); setAffiliateInput(String(toMajor(ar)));
    setAffiliateTier2Minor(t2); setAffiliateTier2Input(String(toMajor(t2)));
    setAffiliateThreshold(thr); setAffiliateThresholdInput(String(thr));
    setAffiliateMode(mode); setAffiliateWhole(mode === 'whole');

    setRate((rateRes.data as any)?.rate ?? null);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // A referred account has earned its one-time bonus once it has been active for
  // at least `referralDays`, measured from its start date (custom → converted → created).
  const isQualified = useCallback((r: RefRow): boolean => {
    const startStr = r.account_start_date ?? r.converted_at ?? r.created_at;
    if (!startStr) return false;
    const startMs = Date.parse(startStr);
    if (Number.isNaN(startMs)) return false;
    return Date.now() - startMs >= referralDays * DAY_MS;
  }, [referralDays]);

  const build = useCallback((affiliate: boolean): Row[] => {
    // Per-contractor counts for this programme.
    const auto = new Map<string, number>();     // affiliate: active; referral: qualified
    const pending = new Map<string, number>();  // referral: active but not yet qualified
    for (const r of refs) {
      if (r.is_affiliate !== affiliate || r.status !== 'active' || !r.referrer_contractor_id) continue;
      const cid = r.referrer_contractor_id;
      if (affiliate) {
        auto.set(cid, (auto.get(cid) ?? 0) + 1);
      } else if (isQualified(r)) {
        auto.set(cid, (auto.get(cid) ?? 0) + 1);
      } else {
        pending.set(cid, (pending.get(cid) ?? 0) + 1);
      }
    }
    // Union of contractors that have counts OR an override for this programme.
    const ids = new Set<string>([...auto.keys(), ...pending.keys()]);
    for (const key of overrides.keys()) {
      const [cid, aff] = key.split(':');
      if ((aff === 'true') === affiliate) ids.add(cid);
    }

    const tier2 = affiliateTier2Minor > 0 ? affiliateTier2Minor : affiliateRateMinor;

    return [...ids].map((cid) => {
      const autoCount = auto.get(cid) ?? 0;
      const override = overrides.get(`${cid}:${affiliate}`) ?? null;
      const effective = override != null ? override : autoCount;
      const usdMinor = affiliate
        ? tieredCommissionMinor(effective, affiliateRateMinor, tier2, affiliateThreshold, affiliateMode)
        : multiplyMinor(referralRateMinor, effective);
      return {
        contractorId: cid,
        name: names.get(cid) ?? '(unknown contractor)',
        autoCount,
        pendingCount: override != null ? 0 : (pending.get(cid) ?? 0),
        override,
        effective,
        usdMinor,
        ngnMinor: rate != null ? usdMinorToNgnMinor(usdMinor, rate) : null,
      };
    }).filter((r) => r.effective > 0 || r.override != null || r.pendingCount > 0)
      .sort((a, b) => b.usdMinor - a.usdMinor || b.pendingCount - a.pendingCount);
  }, [refs, names, overrides, rate, isQualified, referralRateMinor, affiliateRateMinor, affiliateTier2Minor, affiliateThreshold, affiliateMode]);

  const referralRows = useMemo(() => build(false), [build]);
  const affiliateRows = useMemo(() => build(true), [build]);

  const saveReferral = async () => {
    const major = parseFloat(referralInput.replace(/,/g, ''));
    const days = Math.floor(Number(referralDaysInput));
    if (!(major >= 0)) { toast({ title: 'Enter a valid rate', variant: 'destructive' }); return; }
    if (!Number.isFinite(days) || days < 0) { toast({ title: 'Enter valid qualifying days', variant: 'destructive' }); return; }
    setSavingKind('referral');
    try {
      const minor = toMinor(major);
      const { error } = await supabase.from('company_settings')
        .update({ referral_rate_usd_minor: minor, referral_qualifying_days: days } as never)
        .eq('id', SINGLETON_ID);
      if (error) throw error;
      setReferralRateMinor(minor); setReferralDays(days);
      toast({ title: 'Referral rule saved', description: `${formatUsdMinor(minor)} once an account stays active ${days} days.` });
    } catch (err: any) {
      toast({ title: 'Could not save', description: err?.message ?? '', variant: 'destructive' });
    } finally { setSavingKind(null); }
  };

  const saveAffiliate = async () => {
    const base = parseFloat(affiliateInput.replace(/,/g, ''));
    const tier2 = parseFloat(affiliateTier2Input.replace(/,/g, ''));
    const threshold = Math.floor(Number(affiliateThresholdInput));
    if (!(base >= 0) || !(tier2 >= 0)) { toast({ title: 'Enter valid rates', variant: 'destructive' }); return; }
    if (!Number.isFinite(threshold) || threshold < 0) { toast({ title: 'Enter a valid tier threshold', variant: 'destructive' }); return; }
    const mode: TierMode = affiliateWhole ? 'whole' : 'marginal';
    setSavingKind('affiliate');
    try {
      const baseMinor = toMinor(base);
      const tier2Minor = toMinor(tier2);
      const { error } = await supabase.from('company_settings')
        .update({
          affiliate_rate_usd_minor: baseMinor,
          affiliate_rate_tier2_usd_minor: tier2Minor,
          affiliate_tier_threshold: threshold,
          affiliate_tier_mode: mode,
        } as never)
        .eq('id', SINGLETON_ID);
      if (error) throw error;
      setAffiliateRateMinor(baseMinor); setAffiliateTier2Minor(tier2Minor);
      setAffiliateThreshold(threshold); setAffiliateMode(mode);
      toast({ title: 'Affiliate rule saved', description: `${formatUsdMinor(baseMinor)}/mo base, ${formatUsdMinor(tier2Minor)}/mo from ${threshold}+ (${mode}).` });
    } catch (err: any) {
      toast({ title: 'Could not save', description: err?.message ?? '', variant: 'destructive' });
    } finally { setSavingKind(null); }
  };

  const commitOverride = async (contractorId: string, affiliate: boolean) => {
    const key = `${contractorId}:${affiliate}`;
    const raw = countEdits[key];
    if (raw === undefined) return;
    const trimmed = raw.trim();
    const value = trimmed === '' ? null : Math.max(0, Math.floor(Number(trimmed)));
    if (trimmed !== '' && !Number.isFinite(value as number)) { toast({ title: 'Enter a whole number', variant: 'destructive' }); return; }
    try {
      const { error } = await supabase.from('commission_overrides').upsert({
        contractor_id: contractorId, is_affiliate: affiliate, manual_count: value, updated_by: profile?.id ?? null,
      } as never, { onConflict: 'contractor_id,is_affiliate' });
      if (error) throw error;
      setOverrides((m) => {
        const n = new Map(m);
        if (value == null) n.delete(key); else n.set(key, value);
        return n;
      });
      setCountEdits((m) => { const n = { ...m }; delete n[key]; return n; });
    } catch (err: any) {
      toast({ title: 'Could not update count', description: err?.message ?? '', variant: 'destructive' });
    }
  };

  if (loading) {
    return <div className="flex items-center gap-2 text-muted-foreground py-8"><Loader2 className="h-4 w-4 animate-spin" /> Loading commissions…</div>;
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground max-w-2xl">
        Referrers and affiliates are your contractors — log who referred whom with <b>Add referral</b> above. Accounts are
        <b> auto-counted</b>; type an <b>Override</b> only for accounts referred before tracking (it replaces the auto-count).
      </p>
      {rate == null && (
        <div className="flex items-start gap-2 text-sm text-amber-700 bg-amber-500/5 border border-amber-500/30 rounded-lg p-3">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>No active exchange rate — set one in <b>Settings → Exchange rate</b> to see Naira amounts.</span>
        </div>
      )}

      <ProgrammeSection
        title="Referral programme"
        rule={`One-time bonus, paid once an account stays active ${referralDays} days.`}
        rows={referralRows} rate={rate} affiliate={false} totalSuffix=""
        canEdit={canEdit} countEdits={countEdits} setCountEdits={setCountEdits} commitOverride={commitOverride}
        settings={(
          <>
            <div className="space-y-1.5">
              <Label>One-time pay per account (USD)</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                <Input inputMode="decimal" value={referralInput} onChange={(e) => setReferralInput(e.target.value)} className="pl-7 tabular-nums" disabled={!canEdit} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Qualifying days</Label>
              <Input inputMode="numeric" value={referralDaysInput} onChange={(e) => setReferralDaysInput(e.target.value)} className="tabular-nums" disabled={!canEdit} />
            </div>
            {canEdit && (
              <div className="flex items-end">
                <Button onClick={saveReferral} disabled={savingKind === 'referral'} className="w-full sm:w-auto">
                  {savingKind === 'referral' ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Save className="h-4 w-4 mr-2" /> Save</>}
                </Button>
              </div>
            )}
          </>
        )}
      />

      <ProgrammeSection
        title="Affiliate programme"
        rule={`Recurring monthly per active account. Base up to ${affiliateThreshold}, increased rate at ${affiliateThreshold}+ (${affiliateMode}).`}
        rows={affiliateRows} rate={rate} affiliate totalSuffix=" / month"
        canEdit={canEdit} countEdits={countEdits} setCountEdits={setCountEdits} commitOverride={commitOverride}
        settings={(
          <>
            <div className="space-y-1.5">
              <Label>Base / account / mo (USD)</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                <Input inputMode="decimal" value={affiliateInput} onChange={(e) => setAffiliateInput(e.target.value)} className="pl-7 tabular-nums" disabled={!canEdit} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Increased / account / mo (USD)</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                <Input inputMode="decimal" value={affiliateTier2Input} onChange={(e) => setAffiliateTier2Input(e.target.value)} className="pl-7 tabular-nums" disabled={!canEdit} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Tier threshold (accounts)</Label>
              <Input inputMode="numeric" value={affiliateThresholdInput} onChange={(e) => setAffiliateThresholdInput(e.target.value)} className="tabular-nums" disabled={!canEdit} />
            </div>
            <div className="space-y-1.5">
              <Label className="flex items-center gap-2">Increased rate applies to</Label>
              <div className="flex items-center gap-2 h-10">
                <Switch checked={affiliateWhole} onCheckedChange={setAffiliateWhole} disabled={!canEdit} />
                <span className="text-sm text-muted-foreground">{affiliateWhole ? 'all accounts (whole-tier)' : 'accounts above threshold (marginal)'}</span>
              </div>
            </div>
            {canEdit && (
              <div className="flex items-end sm:col-span-2 lg:col-span-1">
                <Button onClick={saveAffiliate} disabled={savingKind === 'affiliate'} className="w-full sm:w-auto">
                  {savingKind === 'affiliate' ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Save className="h-4 w-4 mr-2" /> Save</>}
                </Button>
              </div>
            )}
          </>
        )}
      />

      <p className="text-[11px] text-muted-foreground flex items-center gap-1">
        <Info className="h-3 w-3" /> Generating commission payouts (approval batch) is the next step.
      </p>
    </div>
  );
}

function ProgrammeSection({
  title, rule, rows, rate, affiliate, totalSuffix, canEdit, countEdits, setCountEdits, commitOverride, settings,
}: {
  title: string;
  rule: string;
  rows: Row[];
  rate: number | null;
  affiliate: boolean;
  totalSuffix: string;
  canEdit: boolean;
  countEdits: Record<string, string>;
  setCountEdits: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  commitOverride: (contractorId: string, affiliate: boolean) => void;
  settings: React.ReactNode;
}) {
  const totalUsd = sumMinor(rows.map((r) => r.usdMinor));
  const totalNgn = rate != null ? usdMinorToNgnMinor(totalUsd, rate) : null;
  const totalAccounts = rows.reduce((a, r) => a + r.effective, 0);
  const totalPending = rows.reduce((a, r) => a + r.pendingCount, 0);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0">
        <div>
          <CardTitle className="text-base">{title}</CardTitle>
          <p className="text-xs text-muted-foreground mt-1">{rule}</p>
        </div>
        <span className="text-xs text-muted-foreground tabular-nums text-right shrink-0">
          {rows.length} contractors · {totalAccounts} accounts
          {!affiliate && totalPending > 0 && <><br />{totalPending} in qualifying window</>}
        </span>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {settings}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="rounded-lg border border-border/70 p-3">
            <div className="text-xs text-muted-foreground">Total owed (USD){totalSuffix}</div>
            <div className="mt-1 text-xl font-medium tabular-nums">{formatUsdMinor(totalUsd)}</div>
          </div>
          <div className="rounded-lg border border-primary/30 bg-primary/5 p-3">
            <div className="text-xs text-muted-foreground">Total owed (NGN){totalSuffix}</div>
            <div className="mt-1 text-xl font-semibold tabular-nums">{totalNgn == null ? '—' : formatNgnMinor(totalNgn)}</div>
          </div>
        </div>

        <div className="rounded-lg border border-border/70 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Contractor</TableHead>
                <TableHead className="text-right">{affiliate ? 'Active' : 'Qualified'}</TableHead>
                {!affiliate && <TableHead className="text-right">Pending</TableHead>}
                <TableHead className="text-right w-[120px]">Override</TableHead>
                <TableHead className="text-right">Accounts</TableHead>
                <TableHead className="text-right">USD</TableHead>
                <TableHead className="text-right">NGN</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow><TableCell colSpan={affiliate ? 6 : 7} className="text-center text-muted-foreground py-6">No commissions yet — log referrals with “Add referral”.</TableCell></TableRow>
              ) : rows.map((r) => {
                const key = `${r.contractorId}:${affiliate}`;
                return (
                  <TableRow key={r.contractorId}>
                    <TableCell className="font-medium">{r.name}</TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">{r.autoCount}</TableCell>
                    {!affiliate && (
                      <TableCell className="text-right tabular-nums text-muted-foreground" title="Active but not yet past the qualifying window">
                        {r.pendingCount > 0 ? r.pendingCount : '—'}
                      </TableCell>
                    )}
                    <TableCell className="text-right">
                      <Input
                        inputMode="numeric"
                        className="h-8 text-right tabular-nums"
                        placeholder="—"
                        disabled={!canEdit}
                        value={countEdits[key] ?? (r.override != null ? String(r.override) : '')}
                        onChange={(e) => setCountEdits((m) => ({ ...m, [key]: e.target.value }))}
                        onBlur={() => commitOverride(r.contractorId, affiliate)}
                        onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                      />
                    </TableCell>
                    <TableCell className="text-right tabular-nums font-medium">{r.effective}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatUsdMinor(r.usdMinor)}</TableCell>
                    <TableCell className="text-right tabular-nums font-medium">{r.ngnMinor == null ? '—' : formatNgnMinor(r.ngnMinor)}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
