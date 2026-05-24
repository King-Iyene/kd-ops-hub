// Referrals → Commissions
//
// Referrers/affiliates ARE contractors. This view derives the commission roster
// automatically: group referrals by the referrer contractor, split by programme
// (referral vs affiliate, chosen per referral). Each contractor's payable count
// is the auto-count of their active referrals, or a typed override (for accounts
// referred before tracking — override replaces auto, never adds). Per programme:
// accounts × USD rate → NGN at the live rate. No roster to maintain, one flow.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  toMinor, toMajor, multiplyMinor, usdMinorToNgnMinor, sumMinor,
  formatUsdMinor, formatNgnMinor,
} from '@/lib/money';
import { Loader2, Save, Info, AlertTriangle } from 'lucide-react';

const SINGLETON_ID = '00000000-0000-0000-0000-000000000001';

interface Row {
  contractorId: string;
  name: string;
  autoCount: number;
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
  const [refs, setRefs] = useState<{ referrer_contractor_id: string | null; is_affiliate: boolean; status: string }[]>([]);
  const [names, setNames] = useState<Map<string, string>>(new Map());
  const [overrides, setOverrides] = useState<Map<string, number>>(new Map()); // key `${cid}:${aff}`
  const [referralRateMinor, setReferralRateMinor] = useState(0);
  const [affiliateRateMinor, setAffiliateRateMinor] = useState(0);
  const [referralInput, setReferralInput] = useState('0');
  const [affiliateInput, setAffiliateInput] = useState('0');
  const [rate, setRate] = useState<number | null>(null);
  const [savingKind, setSavingKind] = useState<'referral' | 'affiliate' | null>(null);
  const [countEdits, setCountEdits] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    const [refRes, conRes, ovRes, settingsRes, rateRes] = await Promise.all([
      supabase.from('referrals').select('referrer_contractor_id, is_affiliate, status').not('referrer_contractor_id', 'is', null).limit(20000),
      supabase.from('contractors').select('id, full_name').neq('status', 'deleted').limit(5000),
      supabase.from('commission_overrides').select('contractor_id, is_affiliate, manual_count').limit(20000),
      supabase.from('company_settings').select('referral_rate_usd_minor, affiliate_rate_usd_minor').eq('id', SINGLETON_ID).maybeSingle(),
      supabase.from('fx_rates').select('rate').eq('base', 'USD').eq('quote', 'NGN').eq('status', 'active').order('valid_from', { ascending: false }).limit(1).maybeSingle(),
    ]);
    setRefs((refRes.data as any[]) || []);
    const nm = new Map<string, string>();
    for (const c of ((conRes.data as any[]) || [])) nm.set(c.id, c.full_name);
    setNames(nm);
    const ov = new Map<string, number>();
    for (const o of ((ovRes.data as any[]) || [])) {
      if (o.manual_count != null) ov.set(`${o.contractor_id}:${o.is_affiliate}`, o.manual_count);
    }
    setOverrides(ov);
    const rr = Number((settingsRes.data as any)?.referral_rate_usd_minor ?? 0);
    const ar = Number((settingsRes.data as any)?.affiliate_rate_usd_minor ?? 0);
    setReferralRateMinor(rr); setReferralInput(String(toMajor(rr)));
    setAffiliateRateMinor(ar); setAffiliateInput(String(toMajor(ar)));
    setRate((rateRes.data as any)?.rate ?? null);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const build = useCallback((affiliate: boolean, rateMinor: number): Row[] => {
    // Auto-count active referrals per contractor for this programme.
    const auto = new Map<string, number>();
    for (const r of refs) {
      if (r.is_affiliate !== affiliate || r.status !== 'active' || !r.referrer_contractor_id) continue;
      auto.set(r.referrer_contractor_id, (auto.get(r.referrer_contractor_id) ?? 0) + 1);
    }
    // Union of contractors that have referrals OR an override for this programme.
    const ids = new Set<string>(auto.keys());
    for (const key of overrides.keys()) {
      const [cid, aff] = key.split(':');
      if ((aff === 'true') === affiliate) ids.add(cid);
    }
    return [...ids].map((cid) => {
      const autoCount = auto.get(cid) ?? 0;
      const override = overrides.get(`${cid}:${affiliate}`) ?? null;
      const effective = override != null ? override : autoCount;
      const usdMinor = multiplyMinor(rateMinor, effective);
      return {
        contractorId: cid,
        name: names.get(cid) ?? '(unknown contractor)',
        autoCount,
        override,
        effective,
        usdMinor,
        ngnMinor: rate != null ? usdMinorToNgnMinor(usdMinor, rate) : null,
      };
    }).filter((r) => r.effective > 0 || r.override != null).sort((a, b) => b.usdMinor - a.usdMinor);
  }, [refs, names, overrides, rate]);

  const referralRows = useMemo(() => build(false, referralRateMinor), [build, referralRateMinor]);
  const affiliateRows = useMemo(() => build(true, affiliateRateMinor), [build, affiliateRateMinor]);

  const saveRate = async (kind: 'referral' | 'affiliate') => {
    const major = parseFloat((kind === 'referral' ? referralInput : affiliateInput).replace(/,/g, ''));
    if (!(major >= 0)) { toast({ title: 'Enter a valid amount', variant: 'destructive' }); return; }
    const minor = toMinor(major);
    const col = kind === 'referral' ? 'referral_rate_usd_minor' : 'affiliate_rate_usd_minor';
    setSavingKind(kind);
    try {
      const { error } = await supabase.from('company_settings').update({ [col]: minor } as never).eq('id', SINGLETON_ID);
      if (error) throw error;
      if (kind === 'referral') setReferralRateMinor(minor); else setAffiliateRateMinor(minor);
      toast({ title: 'Rate saved', description: `${kind} rate set to ${formatUsdMinor(minor)} per account.` });
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
        Referrers and affiliates are your contractors — log who referred whom with <b>Add referral</b> above and pick the
        referrer from the dropdown. Accounts are <b>auto-counted</b>; type an <b>Override</b> only for accounts referred
        before tracking (it replaces the auto-count).
      </p>
      {rate == null && (
        <div className="flex items-start gap-2 text-sm text-amber-700 bg-amber-500/5 border border-amber-500/30 rounded-lg p-3">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>No active exchange rate — set one in <b>Settings → Exchange rate</b> to see Naira amounts.</span>
        </div>
      )}
      <ProgrammeSection
        kind="referral" rows={referralRows} input={referralInput} setInput={setReferralInput}
        canEdit={canEdit} saving={savingKind === 'referral'} onSaveRate={() => saveRate('referral')}
        rate={rate} affiliate={false} countEdits={countEdits} setCountEdits={setCountEdits} commitOverride={commitOverride}
      />
      <ProgrammeSection
        kind="affiliate" rows={affiliateRows} input={affiliateInput} setInput={setAffiliateInput}
        canEdit={canEdit} saving={savingKind === 'affiliate'} onSaveRate={() => saveRate('affiliate')}
        rate={rate} affiliate countEdits={countEdits} setCountEdits={setCountEdits} commitOverride={commitOverride}
      />
      <p className="text-[11px] text-muted-foreground flex items-center gap-1">
        <Info className="h-3 w-3" /> Generating commission payouts (approval batch) is the next step.
      </p>
    </div>
  );
}

function ProgrammeSection({
  kind, rows, input, setInput, canEdit, saving, onSaveRate, rate, affiliate, countEdits, setCountEdits, commitOverride,
}: {
  kind: 'referral' | 'affiliate';
  rows: Row[];
  input: string;
  setInput: (s: string) => void;
  canEdit: boolean;
  saving: boolean;
  onSaveRate: () => void;
  rate: number | null;
  affiliate: boolean;
  countEdits: Record<string, string>;
  setCountEdits: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  commitOverride: (contractorId: string, affiliate: boolean) => void;
}) {
  const totalUsd = sumMinor(rows.map((r) => r.usdMinor));
  const totalNgn = rate != null ? usdMinorToNgnMinor(totalUsd, rate) : null;
  const totalAccounts = rows.reduce((a, r) => a + r.effective, 0);
  const title = kind === 'referral' ? 'Referral programme' : 'Affiliate programme';

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0">
        <CardTitle className="text-base">{title}</CardTitle>
        <span className="text-xs text-muted-foreground tabular-nums">{rows.length} contractors · {totalAccounts} accounts</span>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="space-y-1.5">
            <Label>Pay per account (USD)</Label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                <Input inputMode="decimal" value={input} onChange={(e) => setInput(e.target.value)} className="pl-7 tabular-nums" disabled={!canEdit} />
              </div>
              {canEdit && (
                <Button onClick={onSaveRate} disabled={saving}>
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                </Button>
              )}
            </div>
          </div>
          <div className="rounded-lg border border-border/70 p-3">
            <div className="text-xs text-muted-foreground">Total owed (USD)</div>
            <div className="mt-1 text-xl font-medium tabular-nums">{formatUsdMinor(totalUsd)}</div>
          </div>
          <div className="rounded-lg border border-primary/30 bg-primary/5 p-3">
            <div className="text-xs text-muted-foreground">Total owed (NGN)</div>
            <div className="mt-1 text-xl font-semibold tabular-nums">{totalNgn == null ? '—' : formatNgnMinor(totalNgn)}</div>
          </div>
        </div>

        <div className="rounded-lg border border-border/70 overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Contractor</TableHead>
                <TableHead className="text-right">Auto</TableHead>
                <TableHead className="text-right w-[120px]">Override</TableHead>
                <TableHead className="text-right">Accounts</TableHead>
                <TableHead className="text-right">USD</TableHead>
                <TableHead className="text-right">NGN</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-6">No {kind} commissions yet — log referrals with “Add referral”.</TableCell></TableRow>
              ) : rows.map((r) => {
                const key = `${r.contractorId}:${affiliate}`;
                return (
                  <TableRow key={r.contractorId}>
                    <TableCell className="font-medium">{r.name}</TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">{r.autoCount}</TableCell>
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
