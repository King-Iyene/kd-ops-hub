// Referrals → Commission earnings (preview)
//
// Two DISTINCT programmes — Referral and Affiliate — each with its own USD rate
// per qualifying account. We count qualifying accounts (status = 'active') from
// the referrals table, split by is_affiliate, so nobody hand-counts. Per person:
//   accounts × programme USD rate → USD owed → × live FX rate → NGN owed.
//
// Phase 2a: rate config + preview only (read-only on money). The commission
// ledger + payout generation is Phase 2b.

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
import { Loader2, Save, Info, Users, AlertTriangle } from 'lucide-react';

const SINGLETON_ID = '00000000-0000-0000-0000-000000000001';

interface EarnRow { referrerId: string; name: string; accounts: number; usdMinor: number; ngnMinor: number | null; }

// Top-level (stable identity) so the rate <Input> never remounts mid-typing.
function ProgrammeSection({ kind, rows, input, setInput, canEdit, saving, onSave, rate }: {
  kind: 'referral' | 'affiliate';
  rows: EarnRow[];
  input: string;
  setInput: (s: string) => void;
  canEdit: boolean;
  saving: boolean;
  onSave: () => void;
  rate: number | null;
}) {
  const totalUsd = sumMinor(rows.map((r) => r.usdMinor));
  const totalNgn = rate != null ? usdMinorToNgnMinor(totalUsd, rate) : null;
  const totalAccounts = rows.reduce((a, r) => a + r.accounts, 0);
  const title = kind === 'referral' ? 'Referral programme' : 'Affiliate programme';
  const who = kind === 'referral' ? 'referrers' : 'affiliates';

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0">
        <CardTitle className="text-base">{title}</CardTitle>
        <span className="text-xs text-muted-foreground tabular-nums">{rows.length} {who} · {totalAccounts} accounts</span>
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
                <Button onClick={onSave} disabled={saving}>
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
                <TableHead>{kind === 'referral' ? 'Referrer' : 'Affiliate'}</TableHead>
                <TableHead className="text-right">Accounts</TableHead>
                <TableHead className="text-right">USD</TableHead>
                <TableHead className="text-right">NGN</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-6">No qualifying accounts yet.</TableCell></TableRow>
              ) : rows.map((r) => (
                <TableRow key={r.referrerId}>
                  <TableCell className="font-medium">{r.name}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.accounts}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatUsdMinor(r.usdMinor)}</TableCell>
                  <TableCell className="text-right tabular-nums font-medium">{r.ngnMinor == null ? '—' : formatNgnMinor(r.ngnMinor)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

export default function ReferralAffiliateEarnings() {
  const { toast } = useToast();
  const { profile } = useAuthStore();
  const canEdit = ['super_admin', 'admin', 'finance'].includes(profile?.role ?? '');

  const [loading, setLoading] = useState(true);
  const [referrals, setReferrals] = useState<{ referrer_id: string | null; status: string; is_affiliate: boolean }[]>([]);
  const [names, setNames] = useState<Map<string, string>>(new Map());
  const [referralRateMinor, setReferralRateMinor] = useState(0);
  const [affiliateRateMinor, setAffiliateRateMinor] = useState(0);
  const [referralInput, setReferralInput] = useState('0');
  const [affiliateInput, setAffiliateInput] = useState('0');
  const [rate, setRate] = useState<number | null>(null);
  const [savingKind, setSavingKind] = useState<'referral' | 'affiliate' | null>(null);

  const load = useCallback(async () => {
    const [refRes, profRes, settingsRes, rateRes] = await Promise.all([
      supabase.from('referrals').select('referrer_id, status, is_affiliate').limit(10000),
      supabase.from('profiles').select('id, full_name').limit(5000),
      supabase.from('company_settings').select('referral_rate_usd_minor, affiliate_rate_usd_minor').eq('id', SINGLETON_ID).maybeSingle(),
      supabase.from('fx_rates').select('rate').eq('base', 'USD').eq('quote', 'NGN').eq('status', 'active').order('valid_from', { ascending: false }).limit(1).maybeSingle(),
    ]);
    setReferrals((refRes.data as any[]) || []);
    const m = new Map<string, string>();
    for (const p of (profRes.data as any[]) || []) m.set(p.id, p.full_name);
    setNames(m);
    const rr = Number((settingsRes.data as any)?.referral_rate_usd_minor ?? 0);
    const ar = Number((settingsRes.data as any)?.affiliate_rate_usd_minor ?? 0);
    setReferralRateMinor(rr); setReferralInput(String(toMajor(rr)));
    setAffiliateRateMinor(ar); setAffiliateInput(String(toMajor(ar)));
    setRate((rateRes.data as any)?.rate ?? null);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // Count qualifying (status active) accounts per referrer, split by programme.
  const build = useCallback((affiliate: boolean, rateMinor: number): EarnRow[] => {
    const counts = new Map<string, number>();
    for (const r of referrals) {
      if (r.is_affiliate !== affiliate) continue;
      if (r.status !== 'active') continue;
      if (!r.referrer_id) continue;
      counts.set(r.referrer_id, (counts.get(r.referrer_id) ?? 0) + 1);
    }
    return [...counts.entries()]
      .map(([referrerId, accounts]) => {
        const usdMinor = multiplyMinor(rateMinor, accounts);
        return {
          referrerId,
          name: names.get(referrerId) ?? '(unknown)',
          accounts,
          usdMinor,
          ngnMinor: rate != null ? usdMinorToNgnMinor(usdMinor, rate) : null,
        };
      })
      .sort((a, b) => b.usdMinor - a.usdMinor);
  }, [referrals, names, rate]);

  const referralRows = useMemo(() => build(false, referralRateMinor), [build, referralRateMinor]);
  const affiliateRows = useMemo(() => build(true, affiliateRateMinor), [build, affiliateRateMinor]);

  const saveRate = async (kind: 'referral' | 'affiliate') => {
    const major = parseFloat((kind === 'referral' ? referralInput : affiliateInput).replace(/,/g, ''));
    if (!(major >= 0)) {
      toast({ title: 'Enter a valid amount', description: 'USD amount must be zero or more.', variant: 'destructive' });
      return;
    }
    const minor = toMinor(major);
    const col = kind === 'referral' ? 'referral_rate_usd_minor' : 'affiliate_rate_usd_minor';
    setSavingKind(kind);
    try {
      const { error } = await supabase.from('company_settings').update({ [col]: minor } as never).eq('id', SINGLETON_ID);
      if (error) throw error;
      if (kind === 'referral') setReferralRateMinor(minor); else setAffiliateRateMinor(minor);
      toast({ title: 'Rate saved', description: `${kind === 'referral' ? 'Referral' : 'Affiliate'} rate set to ${formatUsdMinor(minor)} per account.` });
    } catch (err: any) {
      toast({ title: 'Could not save', description: err?.message ?? '', variant: 'destructive' });
    } finally {
      setSavingKind(null);
    }
  };

  if (loading) {
    return <div className="flex items-center gap-2 text-muted-foreground py-8"><Loader2 className="h-4 w-4 animate-spin" /> Loading commission earnings…</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Users className="h-4 w-4" /> Counts qualifying (active) accounts from the referrals list. Referral and affiliate are separate programmes with separate rates.
      </div>
      {rate == null && (
        <div className="flex items-start gap-2 text-sm text-amber-700 bg-amber-500/5 border border-amber-500/30 rounded-lg p-3">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>No active exchange rate — set one in <b>Settings → Exchange rate</b> to see Naira amounts. USD figures are final.</span>
        </div>
      )}
      <ProgrammeSection
        kind="referral" rows={referralRows} input={referralInput} setInput={setReferralInput}
        canEdit={canEdit} saving={savingKind === 'referral'} onSave={() => saveRate('referral')} rate={rate}
      />
      <ProgrammeSection
        kind="affiliate" rows={affiliateRows} input={affiliateInput} setInput={setAffiliateInput}
        canEdit={canEdit} saving={savingKind === 'affiliate'} onSave={() => saveRate('affiliate')} rate={rate}
      />
      <p className="text-[11px] text-muted-foreground flex items-center gap-1">
        <Info className="h-3 w-3" /> Generating commission payouts (ledger + approval batch) is the next step — Phase 2b.
      </p>
    </div>
  );
}
