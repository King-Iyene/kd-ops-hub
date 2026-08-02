/**
 * Financial Autopilot — Phase 7 of the CFO Finance Module.
 *
 * Two capabilities:
 *   1. Compliance penalty exposure — models the cost of staying overdue on a
 *      filing. Nigerian statutory penalty rates vary by regulator, change
 *      over time, and aren't tracked anywhere in this codebase, so this
 *      does NOT ship with hardcoded ₦ figures presented as fact. Rates are
 *      user-entered per filing kind (persisted locally) and default to
 *      zero/unconfigured — the calculator is honest about "not set" vs
 *      "confirmed zero penalty".
 *   2. Smart payment scheduling — maps pending payment batches onto the
 *      cash-timing forecast (see cash-timing.ts) so a scheduled payment
 *      that lands in a "critical" week gets flagged before release, not
 *      after the account goes negative.
 *
 * Expense anomaly detection (the third Phase 7 capability) lives in SQL —
 * see supabase/migrations/20261002001800_expense_anomaly_detection.sql —
 * and surfaces through the existing Anomalies queue (src/lib/anomalies.ts),
 * not this module.
 */

import { supabase } from '@/lib/supabase';
import { fetchOverdueCompliance, type ComplianceAlert } from '@/lib/cfo-dashboard';
import { fetchForecast } from '@/lib/cashflow';
import { computePaymentTimingRecommendations, type PaymentTimingWeek, type TimingRisk } from '@/lib/cash-timing';

// ─── Compliance penalty exposure ───────────────────────────────────────────

export interface PenaltyRule {
  /** One-time penalty for filing late at all, in NGN. */
  flat_filing_penalty_ngn: number;
  /** Ongoing penalty as a percentage of the amount owed, per month overdue. */
  pct_per_month: number;
}

export const ZERO_PENALTY_RULE: PenaltyRule = { flat_filing_penalty_ngn: 0, pct_per_month: 0 };

export interface ComplianceExposureRow extends ComplianceAlert {
  days_overdue: number;
  months_overdue: number;
  rule: PenaltyRule;
  /** True when no rule has been configured for this kind — the ngn figures below are 0 by default, not a confirmed "no penalty". */
  rule_configured: boolean;
  estimated_penalty_ngn: number;
}

/**
 * Models penalty exposure for overdue filings using user-supplied rules.
 * `rules` maps filing `kind` → PenaltyRule; a kind with no entry is treated
 * as unconfigured (₦0 shown, but flagged via `rule_configured: false` so the
 * UI can visibly distinguish "no penalty" from "not entered yet").
 */
export function computeComplianceExposure(
  filings: ComplianceAlert[],
  rules: Record<string, PenaltyRule>,
  asOf: Date = new Date(),
): ComplianceExposureRow[] {
  return filings.map((f) => {
    const due = new Date(f.due_date).getTime();
    const days_overdue = Math.max(0, Math.floor((asOf.getTime() - due) / 86_400_000));
    const months_overdue = days_overdue / 30.44;
    const rule = rules[f.kind] ?? ZERO_PENALTY_RULE;
    const rule_configured = f.kind in rules;
    const amount = Math.max(0, f.amount_ngn || 0);
    const estimated_penalty_ngn = days_overdue > 0
      ? rule.flat_filing_penalty_ngn + amount * (rule.pct_per_month / 100) * months_overdue
      : 0;
    return { ...f, days_overdue, months_overdue, rule, rule_configured, estimated_penalty_ngn };
  }).sort((a, b) => b.estimated_penalty_ngn - a.estimated_penalty_ngn);
}

const PENALTY_RULES_STORAGE_KEY = 'kdops.compliance-penalty-rules.v1';

/** Reads user-entered penalty rules from local storage. Empty object if never configured. */
export function loadPenaltyRules(): Record<string, PenaltyRule> {
  try {
    const raw = localStorage.getItem(PENALTY_RULES_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function savePenaltyRules(rules: Record<string, PenaltyRule>): void {
  localStorage.setItem(PENALTY_RULES_STORAGE_KEY, JSON.stringify(rules));
}

export async function fetchComplianceExposure(rules: Record<string, PenaltyRule>): Promise<ComplianceExposureRow[]> {
  const filings = await fetchOverdueCompliance();
  return computeComplianceExposure(filings, rules);
}

// ─── Smart payment scheduling ───────────────────────────────────────────────

export type ScheduleAction = 'release' | 'review' | 'hold';

export interface ScheduledPayment {
  id: string;
  label: string;
  amount_ngn: number;
  scheduled_date: string; // ISO date (YYYY-MM-DD)
}

export interface PaymentScheduleRecommendation extends ScheduledPayment {
  week_start: string | null;
  risk: TimingRisk | 'unknown';
  action: ScheduleAction;
  note: string;
}

/**
 * Maps each scheduled payment onto the week of the cash-timing forecast it
 * falls in, and turns that week's risk signal into a release/review/hold
 * call. A payment scheduled outside the forecast horizon is flagged for
 * manual review rather than silently assumed safe.
 */
export function computeSmartPaymentSchedule(
  payments: ScheduledPayment[],
  timingWeeks: PaymentTimingWeek[],
): PaymentScheduleRecommendation[] {
  const sortedWeeks = [...timingWeeks].sort((a, b) => a.week_start.localeCompare(b.week_start));

  return payments.map((p) => {
    const paymentTime = new Date(p.scheduled_date).getTime();
    const week = sortedWeeks.find((w) => {
      const weekStart = new Date(w.week_start).getTime();
      const weekEnd = weekStart + 7 * 86_400_000;
      return paymentTime >= weekStart && paymentTime < weekEnd;
    });

    if (!week) {
      return {
        ...p,
        week_start: null,
        risk: 'unknown',
        action: 'review',
        note: 'Outside the current forecast horizon — check cash position closer to the date.',
      };
    }

    const action: ScheduleAction = week.risk === 'safe' ? 'release' : week.risk === 'tight' ? 'review' : 'hold';
    const note = week.risk === 'safe'
      ? 'Falls in a healthy week — safe to release as scheduled.'
      : week.risk === 'tight'
        ? 'Falls in a tight week — confirm funds are available before releasing.'
        : 'Falls in a week where the projected balance goes negative — hold or find funding first.';

    return { ...p, week_start: week.week_start, risk: week.risk, action, note };
  }).sort((a, b) => a.scheduled_date.localeCompare(b.scheduled_date));
}

const PENDING_BATCH_STATUSES = ['pending_approval', 'approved', 'funded'];

export async function fetchSmartPaymentSchedule(weeks = 13): Promise<PaymentScheduleRecommendation[]> {
  const [batchesRes, forecastWeeks] = await Promise.all([
    supabase
      .from('payment_batches')
      .select('id, name, total_amount, payment_date')
      .in('status', PENDING_BATCH_STATUSES)
      .is('deleted_at', null),
    fetchForecast(weeks),
  ]);
  if (batchesRes.error) throw batchesRes.error;

  const payments: ScheduledPayment[] = ((batchesRes.data || []) as any[]).map((b) => ({
    id: b.id,
    label: b.name,
    amount_ngn: Number(b.total_amount || 0),
    scheduled_date: b.payment_date,
  }));

  return computeSmartPaymentSchedule(payments, computePaymentTimingRecommendations(forecastWeeks));
}
