// Referrals → Commission partners (roster + earnings)
//
// A roster of the people we pay referral/affiliate commissions to. Each
// referred account (referrals.referral_partner_id) links to a partner, so a
// partner's payable count is AUTO-COUNTED from active linked referrals — or
// overridden by a manual count the team types (verified, not guessed; manual
// wins when set, so no double-counting). Referral and affiliate are distinct
// programmes, each with its own USD-per-account rate; NGN derives from the live
// rate. Read-only on money — payout generation is the next step.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  toMinor, toMajor, multiplyMinor, usdMinorToNgnMinor, sumMinor,
  formatUsdMinor, formatNgnMinor,
} from '@/lib/money';
import { Loader2, Save, Info, AlertTriangle, Plus } from 'lucide-react';

const SINGLETON_ID = '00000000-0000-0000-0000-000000000001';

interface Partner {
  id: string;
  full_name: string;
  type: 'referral' | 'affiliate';
  email: string | null;
  status: string;
  manual_account_count: number | null;
}

interface Computed extends Partner {
  autoCount: number;
  effective: number;
  usdMinor: number;
  ngnMinor: number | null;
}

export default function ReferralPartners() {
  const { toast } = useToast();
  const { profile } = useAuthStore();
  const canEdit = ['super_admin', 'admin', 'finance'].includes(profile?.role ?? '');

  const [loading, setLoading] = useState(true);
  const [partners, setPartners] = useState<Partner[]>([]);
  const [autoCounts, setAutoCounts] = useState<Map<string, number>>(new Map());
  const [referralRateMinor, setReferralRateMinor] = useState(0);
  const [affiliateRateMinor, setAffiliateRateMinor] = useState(0);
  const [referralInput, setReferralInput] = useState('0');
  const [affiliateInput, setAffiliateInput] = useState('0');
  const [rate, setRate] = useState<number | null>(null);
  const [savingKind, setSavingKind] = useState<'referral' | 'affiliate' | null>(null);

  // add-partner dialog
  const [addOpen, setAddOpen] = useState(false);
  const [addForm, setAddForm] = useState({ full_name: '', type: 'referral' as 'referral' | 'affiliate', email: '' });
  const [adding, setAdding] = useState(false);

  // inline manual-count edits keyed by partner id
  const [countEdits, setCountEdits] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    const [partnersRes, refRes, settingsRes, rateRes] = await Promise.all([
      supabase.from('referral_partners').select('id, full_name, type, email, status, manual_account_count').order('full_name').limit(5000),
      supabase.from('referrals').select('referral_partner_id, status').not('referral_partner_id', 'is', null).limit(20000),
      supabase.from('company_settings').select('referral_rate_usd_minor, affiliate_rate_usd_minor').eq('id', SINGLETON_ID).maybeSingle(),
      supabase.from('fx_rates').select('rate').eq('base', 'USD').eq('quote', 'NGN').eq('status', 'active').order('valid_from', { ascending: false }).limit(1).maybeSingle(),
    ]);
    setPartners((partnersRes.data as Partner[]) || []);
    const counts = new Map<string, number>();
    for (const r of ((refRes.data as any[]) || [])) {
      if (r.status !== 'active' || !r.referral_partner_id) continue;
      counts.set(r.referral_partner_id, (counts.get(r.referral_partner_id) ?? 0) + 1);
    }
    setAutoCounts(counts);
    const rr = Number((settingsRes.data as any)?.referral_rate_usd_minor ?? 0);
    const ar = Number((settingsRes.data as any)?.affiliate_rate_usd_minor ?? 0);
    setReferralRateMinor(rr); setReferralInput(String(toMajor(rr)));
    setAffiliateRateMinor(ar); setAffiliateInput(String(toMajor(ar)));
    setRate((rateRes.data as any)?.rate ?? null);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const compute = useCallback((type: 'referral' | 'affiliate', rateMinor: number): Computed[] => {
    return partners
      .filter((p) => p.type === type)
      .map((p) => {
        const autoCount = autoCounts.get(p.id) ?? 0;
        const effective = p.manual_account_count != null ? p.manual_account_count : autoCount;
        const usdMinor = multiplyMinor(rateMinor, effective);
        return {
          ...p,
          autoCount,
          effective,
          usdMinor,
          ngnMinor: rate != null ? usdMinorToNgnMinor(usdMinor, rate) : null,
        };
      })
      .sort((a, b) => b.usdMinor - a.usdMinor);
  }, [partners, autoCounts, rate]);

  const referralRows = useMemo(() => compute('referral', referralRateMinor), [compute, referralRateMinor]);
  const affiliateRows = useMemo(() => compute('affiliate', affiliateRateMinor), [compute, affiliateRateMinor]);

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

  const addPartner = async () => {
    if (!addForm.full_name.trim()) { toast({ title: 'Enter a name', variant: 'destructive' }); return; }
    setAdding(true);
    try {
      const { error } = await supabase.from('referral_partners').insert({
        full_name: addForm.full_name.trim(),
        type: addForm.type,
        email: addForm.email.trim() || null,
        created_by: profile?.id ?? null,
      } as never);
      if (error) throw error;
      toast({ title: 'Partner added' });
      setAddOpen(false);
      setAddForm({ full_name: '', type: 'referral', email: '' });
      load();
    } catch (err: any) {
      toast({ title: 'Could not add', description: err?.message ?? '', variant: 'destructive' });
    } finally { setAdding(false); }
  };

  // Commit a manual count override (blank clears it → back to auto-count).
  const commitCount = async (p: Partner) => {
    const raw = countEdits[p.id];
    if (raw === undefined) return;
    const trimmed = raw.trim();
    const value = trimmed === '' ? null : Math.max(0, Math.floor(Number(trimmed)));
    if (trimmed !== '' && !Number.isFinite(value as number)) {
      toast({ title: 'Enter a whole number', variant: 'destructive' });
      return;
    }
    if ((p.manual_account_count ?? null) === (value ?? null)) {
      setCountEdits((m) => { const n = { ...m }; delete n[p.id]; return n; });
      return;
    }
    try {
      const { error } = await supabase.from('referral_partners').update({ manual_account_count: value } as never).eq('id', p.id);
      if (error) throw error;
      setPartners((prev) => prev.map((x) => (x.id === p.id ? { ...x, manual_account_count: value } : x)));
      setCountEdits((m) => { const n = { ...m }; delete n[p.id]; return n; });
    } catch (err: any) {
      toast({ title: 'Could not update count', description: err?.message ?? '', variant: 'destructive' });
    }
  };

  if (loading) {
    return <div className="flex items-center gap-2 text-muted-foreground py-8"><Loader2 className="h-4 w-4 animate-spin" /> Loading commission partners…</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-sm text-muted-foreground max-w-2xl">
          Commission partners are the people you pay. Accounts are <b>auto-counted</b> from referrals
          linked to each partner; type a number to override (e.g. for accounts referred before tracking).
          Referral and affiliate are separate programmes with separate rates.
        </p>
        {canEdit && (
          <Button onClick={() => setAddOpen(true)}><Plus className="mr-2 h-4 w-4" /> Add partner</Button>
        )}
      </div>

      {rate == null && (
        <div className="flex items-start gap-2 text-sm text-amber-700 bg-amber-500/5 border border-amber-500/30 rounded-lg p-3">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>No active exchange rate — set one in <b>Settings → Exchange rate</b> to see Naira amounts.</span>
        </div>
      )}

      <ProgrammeSection
        kind="referral" rows={referralRows} input={referralInput} setInput={setReferralInput}
        canEdit={canEdit} saving={savingKind === 'referral'} onSaveRate={() => saveRate('referral')}
        rate={rate} countEdits={countEdits} setCountEdits={setCountEdits} commitCount={commitCount}
      />
      <ProgrammeSection
        kind="affiliate" rows={affiliateRows} input={affiliateInput} setInput={setAffiliateInput}
        canEdit={canEdit} saving={savingKind === 'affiliate'} onSaveRate={() => saveRate('affiliate')}
        rate={rate} countEdits={countEdits} setCountEdits={setCountEdits} commitCount={commitCount}
      />

      <p className="text-[11px] text-muted-foreground flex items-center gap-1">
        <Info className="h-3 w-3" /> Generating commission payouts (ledger + approval batch) is the next step.
      </p>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add commission partner</DialogTitle>
            <DialogDescription>Someone you pay referral or affiliate commissions to.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input value={addForm.full_name} onChange={(e) => setAddForm((f) => ({ ...f, full_name: e.target.value }))} placeholder="Full name" />
            </div>
            <div className="space-y-1.5">
              <Label>Programme</Label>
              <div className="flex items-center gap-3">
                <span className={addForm.type === 'referral' ? 'text-foreground font-medium' : 'text-muted-foreground'}>Referral</span>
                <Switch checked={addForm.type === 'affiliate'} onCheckedChange={(v) => setAddForm((f) => ({ ...f, type: v ? 'affiliate' : 'referral' }))} />
                <span className={addForm.type === 'affiliate' ? 'text-foreground font-medium' : 'text-muted-foreground'}>Affiliate</span>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Email (optional)</Label>
              <Input type="email" value={addForm.email} onChange={(e) => setAddForm((f) => ({ ...f, email: e.target.value }))} placeholder="person@example.com" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button onClick={addPartner} disabled={adding}>
              {adding ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />} Add partner
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ProgrammeSection({
  kind, rows, input, setInput, canEdit, saving, onSaveRate, rate, countEdits, setCountEdits, commitCount,
}: {
  kind: 'referral' | 'affiliate';
  rows: Computed[];
  input: string;
  setInput: (s: string) => void;
  canEdit: boolean;
  saving: boolean;
  onSaveRate: () => void;
  rate: number | null;
  countEdits: Record<string, string>;
  setCountEdits: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  commitCount: (p: Computed) => void;
}) {
  const totalUsd = sumMinor(rows.map((r) => r.usdMinor));
  const totalNgn = rate != null ? usdMinorToNgnMinor(totalUsd, rate) : null;
  const totalAccounts = rows.reduce((a, r) => a + r.effective, 0);
  const title = kind === 'referral' ? 'Referral programme' : 'Affiliate programme';

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0">
        <CardTitle className="text-base">{title}</CardTitle>
        <span className="text-xs text-muted-foreground tabular-nums">{rows.length} partners · {totalAccounts} accounts</span>
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
                <TableHead>Partner</TableHead>
                <TableHead className="text-right">Auto</TableHead>
                <TableHead className="text-right w-[120px]">Override</TableHead>
                <TableHead className="text-right">Accounts</TableHead>
                <TableHead className="text-right">USD</TableHead>
                <TableHead className="text-right">NGN</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-6">No partners yet — add one above.</TableCell></TableRow>
              ) : rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">
                    {r.full_name}
                    {r.status !== 'active' && <Badge variant="secondary" className="ml-2 bg-muted text-muted-foreground">inactive</Badge>}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">{r.autoCount}</TableCell>
                  <TableCell className="text-right">
                    <Input
                      inputMode="numeric"
                      className="h-8 text-right tabular-nums"
                      placeholder="—"
                      disabled={!canEdit}
                      value={countEdits[r.id] ?? (r.manual_account_count != null ? String(r.manual_account_count) : '')}
                      onChange={(e) => setCountEdits((m) => ({ ...m, [r.id]: e.target.value }))}
                      onBlur={() => commitCount(r)}
                      onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                    />
                  </TableCell>
                  <TableCell className="text-right tabular-nums font-medium">{r.effective}</TableCell>
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
