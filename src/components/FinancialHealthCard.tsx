import { useEffect, useMemo, useState } from 'react';
import { Activity, AlertTriangle, CheckCircle2, Info } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { daysUntil } from '@/lib/format';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

interface Signals {
  pendingApprovals: number;
  overdueCompliance: number;
  budgetUtil: number; // 0-1
  docsExpiringSoon: number;
}

/**
 * A tiny operational-health heuristic used on the Dashboard.
 *
 *   • Starts at 100.
 *   • -15 if any compliance filing is overdue.
 *   • -5 per pending approval (capped at -25).
 *   • -10 if ANY approved budget is above 100% utilisation; -5 if above 80%.
 *   • -5 if any document is expiring in the next 30 days.
 *
 * Returns an integer 0-100 plus a tone + key contributing reasons so the UI
 * can render an explanation.
 */
const scoreFor = (s: Signals): { score: number; reasons: string[] } => {
  let score = 100;
  const reasons: string[] = [];
  if (s.overdueCompliance > 0) {
    score -= 15;
    reasons.push(`${s.overdueCompliance} overdue statutory filing(s)`);
  }
  if (s.pendingApprovals > 0) {
    const deduct = Math.min(25, s.pendingApprovals * 5);
    score -= deduct;
    if (s.pendingApprovals >= 3) reasons.push(`${s.pendingApprovals} approvals waiting`);
  }
  if (s.budgetUtil >= 1) {
    score -= 10;
    reasons.push('A budget has exceeded 100% of plan');
  } else if (s.budgetUtil >= 0.8) {
    score -= 5;
    reasons.push('A budget is above 80% of plan');
  }
  if (s.docsExpiringSoon > 0) {
    score -= 5;
    reasons.push(`${s.docsExpiringSoon} document(s) expiring soon`);
  }
  if (reasons.length === 0) reasons.push('Everything is on track.');
  return { score: Math.max(0, Math.min(100, score)), reasons };
};

export function FinancialHealthCard() {
  const [signals, setSignals] = useState<Signals | null>(null);

  useEffect(() => {
    const load = async () => {
      const today = new Date().toISOString();
      const [approvalsRes, complianceRes, budgetsRes, expensesRes, batchesRes, docsRes] =
        await Promise.all([
          supabase
            .from('payment_batches')
            .select('id', { count: 'exact', head: true })
            .eq('status', 'pending_approval'),
          supabase
            .from('compliance_filings')
            .select('id', { count: 'exact', head: true })
            .is('filed_at', null)
            .lt('due_date', today.slice(0, 10)),
          supabase
            .from('budgets')
            .select('id, total_amount_ngn, period_start, period_end, status')
            .eq('status', 'approved'),
          supabase.from('expenses').select('amount_ngn, date, status').eq('status', 'approved'),
          supabase
            .from('payment_batches')
            .select('total_amount, payment_date, status')
            .in('status', ['processed', 'funded']),
          supabase
            .from('documents')
            .select('id, expires_at')
            .not('expires_at', 'is', null),
        ]);

      const budgets = (budgetsRes.data as any[]) || [];
      const expenses = (expensesRes.data as any[]) || [];
      const batches = (batchesRes.data as any[]) || [];
      let maxUtil = 0;
      for (const b of budgets) {
        const s = new Date(b.period_start).getTime();
        const e = new Date(b.period_end).getTime() + 24 * 60 * 60 * 1000 - 1;
        let actual = 0;
        for (const ex of expenses) {
          const t = new Date(ex.date).getTime();
          if (t >= s && t <= e) actual += Number(ex.amount_ngn || 0);
        }
        for (const bx of batches) {
          const t = new Date(bx.payment_date).getTime();
          if (t >= s && t <= e) actual += Number(bx.total_amount || 0);
        }
        const total = Number(b.total_amount_ngn || 0);
        if (total > 0) maxUtil = Math.max(maxUtil, actual / total);
      }

      const expiringDocs = ((docsRes.data as any[]) || []).filter((d) => {
        const du = daysUntil(d.expires_at);
        return du !== null && du <= 30 && du >= 0;
      }).length;

      setSignals({
        pendingApprovals: approvalsRes.count || 0,
        overdueCompliance: complianceRes.count || 0,
        budgetUtil: maxUtil,
        docsExpiringSoon: expiringDocs,
      });
    };
    load();
  }, []);

  const { score, reasons } = useMemo(
    () => scoreFor(signals || { pendingApprovals: 0, overdueCompliance: 0, budgetUtil: 0, docsExpiringSoon: 0 }),
    [signals],
  );

  const tone = score >= 85 ? 'success' : score >= 60 ? 'warning' : 'danger';
  const Icon = score >= 85 ? CheckCircle2 : AlertTriangle;

  return (
    <Card>
      <CardHeader className="pb-2 flex flex-row items-center justify-between">
        <CardTitle className="text-base flex items-center gap-2">
          <Activity className="h-4 w-4 text-primary" /> Financial Health
          <Tooltip>
            <TooltipTrigger asChild>
              <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
            </TooltipTrigger>
            <TooltipContent className="max-w-xs">
              Calculated as: available cash ÷ average monthly burn. Above 3 = Healthy. 1–3 = Caution. Below 1 = Critical.
            </TooltipContent>
          </Tooltip>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-end gap-3">
          <p
            className={cn(
              'text-4xl font-bold tracking-tight',
              tone === 'success' && 'text-success',
              tone === 'warning' && 'text-warning',
              tone === 'danger' && 'text-destructive',
            )}
          >
            {signals ? score : '—'}
          </p>
          <p className="text-xs text-muted-foreground pb-1">out of 100</p>
        </div>
        <div className="h-2 rounded-full bg-muted overflow-hidden">
          <div
            className={cn(
              'h-full kd-transition',
              tone === 'success' && 'bg-success',
              tone === 'warning' && 'bg-warning',
              tone === 'danger' && 'bg-destructive',
            )}
            style={{ width: `${signals ? score : 0}%` }}
          />
        </div>
        <div className="space-y-1">
          {reasons.map((r, i) => (
            <p
              key={i}
              className="text-xs text-muted-foreground flex items-start gap-2"
            >
              <Icon
                className={cn(
                  'h-3.5 w-3.5 mt-0.5 shrink-0',
                  tone === 'success' && 'text-success',
                  tone === 'warning' && 'text-warning',
                  tone === 'danger' && 'text-destructive',
                )}
              />
              {r}
            </p>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
