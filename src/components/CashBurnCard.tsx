import { useEffect, useState } from 'react';
import { Flame, TrendingDown } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { formatNaira } from '@/lib/format';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

/**
 * Rolling 30-day cash burn based on approved expenses and processed
 * payment batches. The card also surfaces a runway estimate if the user
 * sets `cash_on_hand` in localStorage (KDOps doesn't have a bank balance
 * feed yet — this is a lightweight, opt-in placeholder).
 */
export function CashBurnCard() {
  const [burn30, setBurn30] = useState<number | null>(null);

  useEffect(() => {
    const load = async () => {
      const since = new Date();
      since.setDate(since.getDate() - 30);
      const iso = since.toISOString();
      const [expensesRes, batchesRes] = await Promise.all([
        supabase
          .from('expenses')
          .select('amount_ngn, date, status')
          .eq('status', 'approved')
          .is('deleted_at', null)
          .gte('date', iso.slice(0, 10)),
        supabase
          .from('payment_batches')
          .select('total_amount, payment_date, status')
          .in('status', ['processed', 'funded'])
          .is('deleted_at', null)
          .gte('payment_date', iso.slice(0, 10)),
      ]);
      const e = ((expensesRes.data as any[]) || []).reduce(
        (s, r) => s + Number(r.amount_ngn || 0),
        0,
      );
      const b = ((batchesRes.data as any[]) || []).reduce(
        (s, r) => s + Number(r.total_amount || 0),
        0,
      );
      setBurn30(e + b);
    };
    load();
  }, []);

  const cashOnHand = (() => {
    if (typeof window === 'undefined') return null;
    const raw = window.localStorage.getItem('kdops:cash_on_hand');
    const n = raw ? Number(raw) : NaN;
    return Number.isFinite(n) && n > 0 ? n : null;
  })();
  const runwayMonths =
    cashOnHand && burn30 && burn30 > 0 ? cashOnHand / burn30 : null;

  return (
    <Card>
      <CardHeader className="pb-2 flex flex-row items-center justify-between">
        <CardTitle className="text-base flex items-center gap-2">
          <Flame className="h-4 w-4 text-destructive" /> 30-Day Cash Burn
        </CardTitle>
        <TrendingDown className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <p className="text-3xl font-bold currency">
          {burn30 !== null ? formatNaira(burn30) : '—'}
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          Approved expenses + processed payment batches in the last 30 days.
        </p>
        {runwayMonths !== null ? (
          <div className="mt-3 rounded-md border border-dashed border-accent/40 bg-accent/5 p-2">
            <p className="text-xs text-muted-foreground">Estimated runway</p>
            <p className="font-semibold">
              {runwayMonths.toFixed(1)} months at this burn rate
            </p>
          </div>
        ) : (
          <p className="text-[11px] text-muted-foreground/80 mt-3">
            Tip: set <code>kdops:cash_on_hand</code> in localStorage to see a
            runway estimate here.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
