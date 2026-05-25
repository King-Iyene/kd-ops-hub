import { useEffect, useMemo, useState } from 'react';
import { Activity, AlertTriangle, CheckCircle2, Info } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { daysUntil, formatNaira } from '@/lib/format';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

interface Signals {
  cashOnHand: number;
  cashUpdatedAt: string | null;
  inPlatformMonthlyBurn: number; // avg over the last 90d
  externalMonthlyBurn: number;   // manual estimate from settings
  monthlyRevenue: number;        // optional, from settings
  pendingApprovals: number;
  overdueCompliance: number;
  budgetOverPlan: boolean;
  budgetNearPlan: boolean;
  docsExpiringSoon: number;
  cashStaleDays: number | null;  // null = never set
}

/**
 * Financial Health = runway-driven score with small operational adjustments.
 *
 * Runway base (0–80 points):
 *   • ≥ 6 months runway → 80
 *   • 3–6 months        → 60–80 (linear)
 *   • 1–3 months        → 30–60 (linear)
 *   • < 1 month         → 0–30  (linear)
 *   • cash not set      → 50    (neutral, can't compute)
 *
 * Operational adjustments (max 20 points off):
 *   • -8  any overdue statutory filing
 *   • -5  any approved budget over 100% of plan
 *   • -3  any approved budget between 80–100%
 *   • -3  documents expiring in next 30 days
 *   • -3  cash on hand stale (>7 days since last update)
 *   • -1  per pending approval (capped at -5)
 *
 * Then bumped up to a max of 100. Floor 0.
 */
function computeScore(s: Signals): {
  score: number;
  runwayMonths: number | null;
  reasons: string[];
} {
  const reasons: string[] = [];

  // Net monthly burn = in-platform + external − revenue (floored at 1 to avoid /0)
  const grossBurn = s.inPlatformMonthlyBurn + s.externalMonthlyBurn;
  const netBurn = Math.max(1, grossBurn - s.monthlyRevenue);
  const cashSet = s.cashOnHand > 0;
  const runway = cashSet ? s.cashOnHand / netBurn : null;

  // Runway base
  let base: number;
  if (runway === null) {
    base = 50;
    reasons.push('Set cash-on-hand in Settings to enable runway tracking.');
  } else if (runway >= 6) {
    base = 80;
    reasons.push(`${runway.toFixed(1)} months of runway — healthy.`);
  } else if (runway >= 3) {
    base = 60 + ((runway - 3) / 3) * 20;
    reasons.push(`${runway.toFixed(1)} months of runway.`);
  } else if (runway >= 1) {
    base = 30 + ((runway - 1) / 2) * 30;
    reasons.push(`Only ${runway.toFixed(1)} months of runway — caution.`);
  } else {
    base = runway * 30;
    reasons.push(`Critical: ${runway.toFixed(1)} months of runway. Take action.`);
  }

  // Operational deductions
  let deduction = 0;
  if (s.overdueCompliance > 0) {
    deduction += 8;
    reasons.push(`${s.overdueCompliance} overdue statutory filing(s).`);
  }
  if (s.budgetOverPlan) {
    deduction += 5;
    reasons.push('A budget has exceeded 100% of plan.');
  } else if (s.budgetNearPlan) {
    deduction += 3;
    reasons.push('A budget is above 80% of plan.');
  }
  if (s.docsExpiringSoon > 0) {
    deduction += 3;
    reasons.push(`${s.docsExpiringSoon} document(s) expiring in 30 days.`);
  }
  if (s.cashStaleDays !== null && s.cashStaleDays >= 7) {
    deduction += 3;
    reasons.push(`Cash-on-hand last updated ${s.cashStaleDays} days ago — refresh from your bank app.`);
  }
  if (s.pendingApprovals > 0) {
    deduction += Math.min(5, s.pendingApprovals);
    if (s.pendingApprovals >= 3) {
      reasons.push(`${s.pendingApprovals} approvals waiting.`);
    }
  }

  const score = Math.max(0, Math.min(100, Math.round(base - deduction)));
  return { score, runwayMonths: runway, reasons };
}

export function FinancialHealthCard() {
  const [signals, setSignals] = useState<Signals | null>(null);

  useEffect(() => {
    const load = async () => {
      const today = new Date();
      const ninetyDaysAgo = new Date(today.getTime() - 90 * 86400000).toISOString().slice(0, 10);
      const todayStr = today.toISOString();

      const [
        settingsRes,
        approvalsRes,
        complianceRes,
        budgetsRes,
        expensesAllRes,
        expensesBurnRes,
        batchesAllRes,
        batchesBurnRes,
        docsRes,
      ] = await Promise.all([
        supabase
          .from('company_settings')
          .select('cash_on_hand_ngn, external_monthly_burn_ngn, monthly_revenue_estimate_ngn, cash_updated_at')
          .eq('id', '00000000-0000-0000-0000-000000000001')
          .maybeSingle(),
        supabase
          .from('payment_batches')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'pending_approval')
          .is('deleted_at', null),
        supabase
          .from('compliance_filings')
          .select('id', { count: 'exact', head: true })
          .is('filed_at', null)
          .lt('due_date', todayStr.slice(0, 10)),
        supabase
          .from('budgets')
          .select('id, total_amount_ngn, period_start, period_end, status')
          .eq('status', 'approved'),
        supabase
          .from('expenses')
          .select('amount_ngn, date, status')
          .eq('status', 'approved'),
        supabase
          .from('expenses')
          .select('amount_ngn, date')
          .eq('status', 'approved')
          .gte('date', ninetyDaysAgo),
        supabase
          .from('payment_batches')
          .select('id, total_amount, payment_date, status')
          .in('status', ['processed', 'partially_processed']),
        supabase
          .from('payment_batches')
          .select('id, total_amount, payment_date, status')
          .in('status', ['processed', 'partially_processed'])
          .gte('payment_date', ninetyDaysAgo),
        supabase
          .from('documents')
          .select('id, expires_at')
          .not('expires_at', 'is', null),
      ]);

      const settings = settingsRes.data as any;
      const cashOnHand = Number(settings?.cash_on_hand_ngn || 0);
      const externalMonthlyBurn = Number(settings?.external_monthly_burn_ngn || 0);
      const monthlyRevenue = Number(settings?.monthly_revenue_estimate_ngn || 0);
      const cashUpdatedAt = settings?.cash_updated_at || null;

      // For partially_processed batches we'd want to net out failed items.
      // For the burn estimate we accept the small gross-vs-net error to keep
      // the dashboard load fast; the precise number lives in the Reports page.
      const burn90 =
        ((expensesBurnRes.data as any[]) || []).reduce((s, r) => s + Number(r.amount_ngn || 0), 0) +
        ((batchesBurnRes.data as any[]) || []).reduce((s, r) => s + Number(r.total_amount || 0), 0);
      const inPlatformMonthlyBurn = burn90 / 3;

      // Budget signals
      const budgets = (budgetsRes.data as any[]) || [];
      const expensesAll = (expensesAllRes.data as any[]) || [];
      const batchesAll = (batchesAllRes.data as any[]) || [];
      let maxUtil = 0;
      for (const b of budgets) {
        const s = new Date(b.period_start).getTime();
        const e = new Date(b.period_end).getTime() + 86400000 - 1;
        let actual = 0;
        for (const ex of expensesAll) {
          const t = new Date(ex.date).getTime();
          if (t >= s && t <= e) actual += Number(ex.amount_ngn || 0);
        }
        for (const bx of batchesAll) {
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

      const cashStaleDays = cashUpdatedAt
        ? Math.floor((Date.now() - new Date(cashUpdatedAt).getTime()) / 86400000)
        : null;

      setSignals({
        cashOnHand,
        cashUpdatedAt,
        inPlatformMonthlyBurn,
        externalMonthlyBurn,
        monthlyRevenue,
        pendingApprovals: approvalsRes.count || 0,
        overdueCompliance: complianceRes.count || 0,
        budgetOverPlan: maxUtil >= 1,
        budgetNearPlan: maxUtil >= 0.8 && maxUtil < 1,
        docsExpiringSoon: expiringDocs,
        cashStaleDays,
      });
    };
    load();
  }, []);

  const { score, runwayMonths, reasons } = useMemo(
    () =>
      computeScore(
        signals || {
          cashOnHand: 0,
          cashUpdatedAt: null,
          inPlatformMonthlyBurn: 0,
          externalMonthlyBurn: 0,
          monthlyRevenue: 0,
          pendingApprovals: 0,
          overdueCompliance: 0,
          budgetOverPlan: false,
          budgetNearPlan: false,
          docsExpiringSoon: 0,
          cashStaleDays: null,
        },
      ),
    [signals],
  );

  const tone = score >= 80 ? 'success' : score >= 50 ? 'warning' : 'danger';
  const Icon = score >= 80 ? CheckCircle2 : AlertTriangle;
  const grossBurn = (signals?.inPlatformMonthlyBurn ?? 0) + (signals?.externalMonthlyBurn ?? 0);
  const netBurn = Math.max(0, grossBurn - (signals?.monthlyRevenue ?? 0));

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
              <p className="font-semibold mb-1">How this is calculated</p>
              <p className="mb-2">
                Runway (cash ÷ monthly net burn) gives the base score (0–80).
                Operational issues — overdue compliance, budget overruns,
                expiring documents, stale cash data, pending approvals —
                deduct up to 20 points.
              </p>
              <p className="text-[11px] opacity-80">
                Set cash-on-hand and external monthly burn in Settings →
                Company so this number stays accurate. Update weekly.
              </p>
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
        {signals && runwayMonths !== null && (
          <p className="text-xs text-muted-foreground">
            Cash {formatNaira(signals.cashOnHand)} ÷ net burn {formatNaira(netBurn)}/mo ={' '}
            <span className="font-semibold">{runwayMonths.toFixed(1)} months</span>
          </p>
        )}
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
