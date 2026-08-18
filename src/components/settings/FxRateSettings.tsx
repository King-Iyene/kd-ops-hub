// Settings → Exchange rate
//
// Bank-grade panel over the authoritative fx_rates ledger. Shows the live
// USD→NGN rate, lets finance set a manual rate or trigger an auto-fetch, and
// surfaces any auto-fetched rate that breached the deviation guard for
// approve/reject (maker-checker). All money math + guarding is server-side
// (record_fetched_fx_rate / set_manual_fx_rate / review_fx_rate); this UI is a
// thin, careful editor.

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Pagination } from '@/components/ui-kit/Pagination';
import { usePagination } from '@/hooks/usePagination';
import { formatDateTime } from '@/lib/format';
import { cn } from '@/lib/utils';
import {
  Loader2, RefreshCw, ArrowRightLeft, ShieldAlert, CheckCircle2, XCircle, Save, Info,
} from 'lucide-react';

const SINGLETON_ID = '00000000-0000-0000-0000-000000000001';
const BASE = 'USD';
const QUOTE = 'NGN';

interface FxRate {
  id: string;
  base: string;
  quote: string;
  rate: number;
  source: string;
  status: string;
  prev_rate: number | null;
  deviation_pct: number | null;
  note: string | null;
  fetched_at: string;
  valid_from: string;
  reviewed_at: string | null;
}

const fmtRate = (n: number | null | undefined) =>
  n == null ? '—' : n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 });

const STATUS_STYLE: Record<string, string> = {
  active: 'bg-success/10 text-success',
  pending_review: 'bg-amber-500/10 text-amber-600',
  superseded: 'bg-muted text-muted-foreground',
  rejected: 'bg-destructive/10 text-destructive',
};

export default function FxRateSettings() {
  const { toast } = useToast();
  const { profile } = useAuthStore();
  const canEdit = ['super_admin', 'admin', 'finance'].includes(profile?.role ?? '');

  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState<FxRate | null>(null);
  const [pending, setPending] = useState<FxRate | null>(null);
  const [history, setHistory] = useState<FxRate[]>([]);
  const [threshold, setThreshold] = useState<number>(5);
  const [thresholdInput, setThresholdInput] = useState<string>('5');
  const [manualRate, setManualRate] = useState('');
  const [fetching, setFetching] = useState(false);
  const [savingManual, setSavingManual] = useState(false);
  const [savingThreshold, setSavingThreshold] = useState(false);
  const [reviewing, setReviewing] = useState(false);

  const load = useCallback(async () => {
    const [ratesRes, settingsRes] = await Promise.all([
      supabase
        .from('fx_rates')
        .select('id, rate, source, status, prev_rate, deviation_pct, valid_from')
        .eq('base', BASE).eq('quote', QUOTE)
        .order('valid_from', { ascending: false })
        .limit(100),
      supabase
        .from('company_settings')
        .select('fx_deviation_threshold_pct')
        .eq('id', SINGLETON_ID)
        .maybeSingle(),
    ]);
    const rows = (ratesRes.data as FxRate[]) || [];
    setActive(rows.find((r) => r.status === 'active') ?? null);
    setPending(rows.find((r) => r.status === 'pending_review') ?? null);
    setHistory(rows);
    const t = Number((settingsRes.data as any)?.fx_deviation_threshold_pct ?? 5);
    setThreshold(t);
    setThresholdInput(String(t));
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // Auto-refresh the live rate every 60 seconds
  useEffect(() => {
    const interval = setInterval(async () => {
      const { data } = await supabase
        .from('fx_rates')
        .select('id, rate, source, status, prev_rate, deviation_pct, valid_from')
        .eq('base', BASE).eq('quote', QUOTE).eq('status', 'active')
        .order('valid_from', { ascending: false })
        .limit(1);
      if (data?.[0]) setActive(data[0] as FxRate);
    }, 60_000);
    return () => clearInterval(interval);
  }, []);

  // Paginate history so the table stays compact as entries accrue daily.
  const histPage = usePagination(history, 6);

  const fetchNow = async () => {
    setFetching(true);
    try {
      const { data, error } = await supabase.functions.invoke('fx-rate-sync', {
        body: { triggered_by: 'manual' },
      });
      if (error) throw error;
      if (!data?.ok) {
        toast({ title: 'Fetch failed', description: data?.error || 'No rate recorded.', variant: 'destructive' });
      } else if (data.held_for_review) {
        toast({
          title: 'Rate held for review',
          description: `Fetched ${BASE}/${QUOTE} = ${fmtRate(data.rate)} but it moved ${data.deviation_pct}% — approve it below before it goes live.`,
        });
      } else {
        toast({ title: 'Rate updated', description: `${BASE}/${QUOTE} = ${fmtRate(data.rate)} is now live.` });
      }
      await load();
    } catch (err: any) {
      toast({ title: 'Fetch failed', description: err?.message ?? 'Could not reach the rate service.', variant: 'destructive' });
    } finally {
      setFetching(false);
    }
  };

  const saveManual = async () => {
    const rate = parseFloat(manualRate.replace(/,/g, ''));
    if (!(rate > 0)) {
      toast({ title: 'Enter a valid rate', description: 'Rate must be a positive number.', variant: 'destructive' });
      return;
    }
    setSavingManual(true);
    try {
      const { error } = await supabase.rpc('set_manual_fx_rate', {
        p_base: BASE, p_quote: QUOTE, p_rate: rate, p_note: 'Set manually in Settings',
      });
      if (error) throw error;
      toast({ title: 'Manual rate set', description: `${BASE}/${QUOTE} = ${fmtRate(rate)} is now live.` });
      setManualRate('');
      await load();
    } catch (err: any) {
      toast({ title: 'Could not set rate', description: err?.message ?? '', variant: 'destructive' });
    } finally {
      setSavingManual(false);
    }
  };

  const review = async (approve: boolean) => {
    if (!pending) return;
    setReviewing(true);
    try {
      const { error } = await supabase.rpc('review_fx_rate', {
        p_id: pending.id, p_approve: approve,
        p_note: approve ? 'Approved in Settings' : 'Rejected in Settings',
      });
      if (error) throw error;
      toast({
        title: approve ? 'Rate approved' : 'Rate rejected',
        description: approve ? `${BASE}/${QUOTE} = ${fmtRate(pending.rate)} is now live.` : 'The held rate was discarded.',
      });
      await load();
    } catch (err: any) {
      toast({ title: 'Review failed', description: err?.message ?? '', variant: 'destructive' });
    } finally {
      setReviewing(false);
    }
  };

  const saveThreshold = async () => {
    const t = parseFloat(thresholdInput);
    if (!(t >= 0)) {
      toast({ title: 'Invalid threshold', description: 'Enter a non-negative percentage.', variant: 'destructive' });
      return;
    }
    setSavingThreshold(true);
    try {
      const { error } = await supabase
        .from('company_settings')
        .update({ fx_deviation_threshold_pct: t } as never)
        .eq('id', SINGLETON_ID);
      if (error) throw error;
      setThreshold(t);
      toast({ title: 'Threshold saved', description: `Auto rates moving more than ${t}% are held for review.` });
    } catch (err: any) {
      toast({ title: 'Could not save', description: err?.message ?? '', variant: 'destructive' });
    } finally {
      setSavingThreshold(false);
    }
  };

  if (loading) {
    return <div className="flex items-center gap-2 text-muted-foreground py-8"><Loader2 className="h-4 w-4 animate-spin" /> Loading exchange rate…</div>;
  }

  return (
    <div className="space-y-4">
      {/* Current rate hero */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0">
          <CardTitle className="text-base flex items-center gap-2">
            <ArrowRightLeft className="h-4 w-4 text-muted-foreground" /> Exchange rate · {BASE} → {QUOTE}
          </CardTitle>
          {canEdit && (
            <Button variant="outline" size="sm" onClick={fetchNow} disabled={fetching}>
              {fetching ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
              Fetch latest
            </Button>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-end gap-3 flex-wrap">
            <div className="text-3xl font-semibold tracking-tight tabular-nums">
              1 {BASE} = ₦{fmtRate(active?.rate)}
            </div>
            {active ? (
              <Badge variant="secondary" className={cn('mb-1', STATUS_STYLE.active)}>Live</Badge>
            ) : (
              <Badge variant="secondary" className="mb-1 bg-muted text-muted-foreground">No rate set</Badge>
            )}
          </div>
          <div className="text-xs text-muted-foreground">
            {active
              ? <>Source: <span className="font-medium">{active.source}</span> · effective {formatDateTime(active.valid_from)}</>
              : <>Set a rate manually or fetch the latest to start converting USD amounts to Naira.</>}
          </div>
        </CardContent>
      </Card>

      {/* Pending-review (deviation guard tripped) */}
      {pending && (
        <Card className="border-amber-500/40">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2 text-amber-700">
              <ShieldAlert className="h-4 w-4" /> Rate held for your approval
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              A fetched rate of <span className="font-semibold text-foreground">₦{fmtRate(pending.rate)}</span> moved{' '}
              <span className="font-semibold text-amber-700">{pending.deviation_pct}%</span> from the live rate
              (₦{fmtRate(pending.prev_rate)}), beyond the {threshold}% guard. It is <b>not</b> in use until you approve it.
            </p>
            {canEdit && (
              <div className="flex gap-2">
                <Button size="sm" onClick={() => review(true)} disabled={reviewing}>
                  {reviewing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
                  Approve &amp; make live
                </Button>
                <Button size="sm" variant="outline" onClick={() => review(false)} disabled={reviewing}>
                  <XCircle className="mr-2 h-4 w-4" /> Reject
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Manual rate + guard threshold */}
      {canEdit && (
        <Card>
          <CardHeader><CardTitle className="text-base">Controls</CardTitle></CardHeader>
          <CardContent className="space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Set rate manually (₦ per $1)</Label>
                <div className="flex gap-2">
                  <Input
                    inputMode="decimal"
                    placeholder="e.g. 1650.00"
                    value={manualRate}
                    onChange={(e) => setManualRate(e.target.value)}
                    className="tabular-nums"
                  />
                  <Button onClick={saveManual} disabled={savingManual}>
                    {savingManual ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  </Button>
                </div>
                <p className="text-[11px] text-muted-foreground">Goes live immediately and supersedes the current rate.</p>
              </div>
              <div className="space-y-1.5">
                <Label>Auto-rate deviation guard (%)</Label>
                <div className="flex gap-2">
                  <Input
                    inputMode="decimal"
                    value={thresholdInput}
                    onChange={(e) => setThresholdInput(e.target.value)}
                    className="tabular-nums"
                  />
                  <Button variant="outline" onClick={saveThreshold} disabled={savingThreshold}>
                    {savingThreshold ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  </Button>
                </div>
                <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                  <Info className="h-3 w-3" /> Auto-fetched rates moving more than this are held for approval.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* History */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0">
          <CardTitle className="text-base">Rate history</CardTitle>
          {history.length > 0 && (
            <span className="text-xs text-muted-foreground tabular-nums">{history.length} change{history.length === 1 ? '' : 's'}</span>
          )}
        </CardHeader>
        <CardContent>
          <div className="rounded-lg border border-border/70 overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="text-right">Rate (₦/$)</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead className="text-right">Change</TableHead>
                  <TableHead className="text-right">Effective</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {history.length === 0 ? (
                  <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">No rates recorded yet.</TableCell></TableRow>
                ) : histPage.items.map((r) => {
                  const up = r.prev_rate != null && r.rate > r.prev_rate;
                  const down = r.prev_rate != null && r.rate < r.prev_rate;
                  return (
                    <TableRow key={r.id}>
                      <TableCell className="text-right font-mono tabular-nums font-medium">{fmtRate(r.rate)}</TableCell>
                      <TableCell>
                        <span className={cn('inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium capitalize',
                          STATUS_STYLE[r.status] ?? 'bg-muted text-muted-foreground')}>
                          {r.status.replace('_', ' ')}
                        </span>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {r.source === 'manual' ? 'Manual' : 'Auto'}
                      </TableCell>
                      <TableCell className={cn('text-right text-xs tabular-nums',
                        up ? 'text-amber-600' : down ? 'text-success' : 'text-muted-foreground')}>
                        {r.deviation_pct == null ? '—' : `${up ? '▲' : down ? '▼' : ''} ${r.deviation_pct}%`}
                      </TableCell>
                      <TableCell className="text-right text-xs text-muted-foreground whitespace-nowrap">{formatDateTime(r.valid_from)}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            {histPage.totalPages > 1 && (
              <Pagination
                page={histPage.page}
                totalPages={histPage.totalPages}
                totalItems={histPage.totalItems}
                pageSize={histPage.pageSize}
                onPrev={histPage.prev}
                onNext={histPage.next}
                hasPrev={histPage.hasPrev}
                hasNext={histPage.hasNext}
              />
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
