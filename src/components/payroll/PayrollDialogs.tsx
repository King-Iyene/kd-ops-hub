import React, { useState } from 'react';
import { Loader2, Plus, Send, AlertCircle, AlertTriangle, Trash2, X, Clock, Check, ArrowLeft, Users2, LayoutGrid, ChevronDown } from 'lucide-react';
import { InfoHint } from '@/components/ui-kit/InfoHint';
import type { PayrollSegment } from '@/lib/payroll-segments';
import type { PayrollSegmentFilterRules } from '@/lib/payroll-segments';
import { formatNaira, formatNairaCompact, getTimezone, getBrowserTimezone, utcIsoToOrgWallClock, orgWallClockToLocalDisplay } from '@/lib/format';
import { CompliancePanel } from '@/components/payroll/CompliancePanel';
import type { ComplianceCheck } from '@/lib/payroll-compliance';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ResponsiveDialog } from '@/components/ui-kit/ResponsiveDialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { FieldError } from '@/components/ui-kit/FieldError';
import { PayrollRosterPreview } from '@/components/payroll/PayrollRosterPreview';
import type { PayrollRun, BonusLine } from '@/lib/payroll-run';

// The Draft dialog's guided flow — 3 named steps instead of one dense
// scrollable form. Matches the Gusto/QuickBooks/ADP pattern researched for
// this rebuild: each step asks one question, the last restates every
// number before anything is saved as a submittable run. "Who" and "Period"
// share a step because together they're one decision — which month, for
// which people — not two; splitting them just added a click.
// Titles are the question the step asks, in the words someone running
// payroll for the first time would use. "Pay group & period" named the two
// database fields being filled in, which is only obvious once you already
// know what a pay group is — and step 1 is precisely where a new operator
// gets stuck.
const DRAFT_STEPS = [
  { title: 'Who are you paying?', desc: 'Choose the group of people and the month' },
  { title: 'Anything extra?', desc: 'Bonuses, allowances or one-off deductions' },
  { title: 'Check and submit', desc: 'Confirm the real numbers — PAYE, pension and NHF are already computed' },
] as const;
const LAST_STEP = DRAFT_STEPS.length - 1;

// Mirrors the wording upsert_payroll_draft() uses when it refuses
// (migration 20261221300000), so the warning shown before saving and the
// error shown if someone saves anyway describe the run the same way.
const CONFLICT_STATUS_COPY: Record<string, string> = {
  pending_approval: 'awaiting approval',
  approved: 'already approved',
  processing: 'being disbursed right now',
  paid: 'already paid',
};

const FREQ_SHORT_LABELS: Record<string, string> = {
  weekly: 'Weekly', biweekly: 'Bi-weekly', semimonthly: 'Semi-monthly', monthly: 'Monthly',
  bimonthly: 'Bi-monthly', quarterly: 'Quarterly', triannual: 'Tri-annual', biannual: 'Bi-annual', annual: 'Annual',
};

// Same rotating palette as the Pay Groups admin screen's card icons
// (PayrollSchedules.tsx's PG_ICON_COLOURS) — kept as a local copy rather
// than a cross-file export so a change to one card style can't silently
// reflow the other's colour order.
const PG_CARD_ICON_COLOURS = [
  'bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300',
  'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300',
  'bg-violet-100 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300',
  'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300',
  'bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300',
  'bg-cyan-100 text-cyan-700 dark:bg-cyan-950/40 dark:text-cyan-300',
];

// Standard Nigerian statutory remittance deadlines — shown once, on the
// review step, so approving a run doesn't quietly create a compliance
// deadline nobody wrote down. PAYE: FIRS/State IRS, on/before the 10th of
// the month following deduction (PITA s.81). Pension: PenCom mandates
// remittance within 7 working days of payday. NHF: remittance within 7
// days of the month's end (NHF Act 1992 s.5).
const STATUTORY_DEADLINES = [
  { label: 'PAYE', due: '10th of next month', authority: 'FIRS / State IRS' },
  { label: 'Pension', due: 'Within 7 working days of payday', authority: 'PFA / PenCom' },
  { label: 'NHF', due: 'Within 7 days of month end', authority: 'Federal Mortgage Bank' },
] as const;

const BONUS_TYPES = [
  'Performance Bonus',
  '13th Month',
  'Christmas Bonus',
  'Ramadan Bonus',
  'Annual Leave Allowance',
  'KD Star Prize',
  'Other',
] as const;

interface DraftForm {
  period: string;
  period_type: 'monthly' | 'quarterly' | 'annual';
  bonuses: BonusLine[];
  housing_allowance_pct: number;
  transport_per_emp: number;
  meal_per_emp: number;
  payroll_segment_id: string;
  // Non-statutory per-run controls (advances/deductions/EWA are genuine
  // per-run decisions; statutory deductions are driven by employee profiles)
  include_advances: boolean;
  include_deductions: boolean;
  include_ewa: boolean;
}

export interface DeductionEligibility {
  total: number;
  paye: number;
  pension: number;
  nhf: number;
  nhis: number;
  devLevy: boolean;
  payeNames: string[];
  pensionNames: string[];
  nhfNames: string[];
  nhisNames: string[];
}

interface SegmentFormState {
  name: string;
  description: string;
  exclude_department_ids: string[];
  include_pay_group_ids: string[];
}

interface AdjustFormState {
  employee_id: string;
  kind: string;
  description: string;
  amount: string;
  taxable: boolean;
}

export interface PayrollDialogsProps {
  // Draft dialog
  dialog: boolean;
  setDialog: (v: boolean) => void;
  working: boolean;
  draftRun: () => void;
  editingDraftId: string | null;
  form: DraftForm;
  setForm: React.Dispatch<React.SetStateAction<DraftForm>>;
  segments: PayrollSegment[];
  addBonus: () => void;
  removeBonus: (i: number) => void;
  updateBonus: (i: number, field: string, val: any) => void;
  draftStep: number;
  setDraftStep: (n: number) => void;
  selectPayGroupQuickFilter: (groupId: string) => void;
  computedPreview: {
    empCount: number; totalEmployee: number; bonusTotal: number; totalAllowances: number;
    paye: number; pension: number; employerPension: number; nhf: number; nsitfCharge: number;
    nhisEmployee: number; nhisEmployer: number;
    totalDeductions: number; totalAdvanceRepayments: number; totalContractor: number;
    totalExpenses: number; burn: number; totalNetPay: number;
  } | null;
  deductionEligibility: DeductionEligibility | null;
  bonusEmployees: { id: string; name: string; salary: number }[];
  finishDraftReview: () => void;
  /** Statutory readiness for the roster this run actually covers. */
  complianceChecks?: ComplianceCheck[];
  /** Set when a run already exists for this company + period + pay group and
      has moved past draft, so drafting over it will be refused server-side. */
  existingRunConflict?: { period: string; status: string; id: string } | null;
  submitDraftForApprovalNow: () => void;

  // Segment dialog
  segmentDialog: boolean;
  setSegmentDialog: (v: boolean) => void;
  segmentForm: SegmentFormState;
  setSegmentForm: React.Dispatch<React.SetStateAction<SegmentFormState>>;
  segmentSaving: boolean;
  segmentDepartments: { id: string; name: string }[];
  segmentPayGroups: { id: string; name: string; company_id: string; frequency: string | null; memberCount: number; payableCount: number; monthlyGrossNgn: number }[];
  selectedCompanyId?: string;
  selectedCompanyName?: string;
  selectedCompanyColor?: string;
  segmentLiveRules: PayrollSegmentFilterRules;
  saveSegment: () => void;
  deleteSegment: (segmentId: string, name: string) => void;
  toggleSegmentDepartment: (deptId: string) => void;
  toggleSegmentPayGroup: (groupId: string) => void;

  // Adjustments dialog
  adjustRun: PayrollRun | null;
  setAdjustRun: (run: PayrollRun | null) => void;
  adjustList: any[];
  adjustEmployees: { id: string; name: string }[];
  adjustLoading: boolean;
  adjustSaving: boolean;
  adjustForm: AdjustFormState;
  setAdjustForm: React.Dispatch<React.SetStateAction<AdjustFormState>>;
  addAdjustment: () => void;
  removeAdjustment: (id: string) => void;
  adjustErrors: Partial<Record<'employee_id' | 'description' | 'amount', string>>;
  clearAdjustError: (field: 'employee_id' | 'description' | 'amount') => void;
  clearAdjustErrors: () => void;

  // Disburse dialog
  disburseTarget: { run: PayrollRun; payslips: any[] } | null;
  setDisburseTarget: (v: { run: PayrollRun; payslips: any[] } | null) => void;
  disbursing: boolean;
  disburseErrors: string[];
  setDisburseErrors: (v: string[]) => void;
  doDisburse: () => void;
  scheduleMode: boolean;
  setScheduleMode: (v: boolean) => void;
  scheduleAt: string;
  setScheduleAt: (v: string) => void;
  scheduling: boolean;
  doSchedule: () => void;

  // Confirm paid dialog
  confirmPaidRun: PayrollRun | null;
  setConfirmPaidRun: (run: PayrollRun | null) => void;
  markPaid: () => void;

  // Confirm approve dialog — restates the total before an irreversible
  // action (ADP RUN pattern), instead of approving on a single click.
  confirmApproveRun: PayrollRun | null;
  setConfirmApproveRun: (run: PayrollRun | null) => void;
  confirmApprove: () => void;

  // Pre-flight checklist — flags missing/duplicate bank details before
  // Submit (Deel/Rippling pattern), so problems surface days earlier than
  // at disbursement.
  preflightRun: PayrollRun | null;
  preflightIssues: { kind: string; message: string; names: string[] }[];
  setPreflightRun: (run: PayrollRun | null) => void;
  submitAnyway: () => void;

  monthLabel: (period: string, periodType?: string) => string;
}

export const PayrollDialogs = ({
  dialog,
  setDialog,
  working,
  draftRun,
  editingDraftId,
  form,
  setForm,
  segments,
  addBonus,
  removeBonus,
  updateBonus,
  draftStep,
  setDraftStep,
  selectPayGroupQuickFilter,
  computedPreview,
  deductionEligibility,
  bonusEmployees,
  finishDraftReview,
  complianceChecks,
  existingRunConflict,
  submitDraftForApprovalNow,
  segmentDialog,
  setSegmentDialog,
  segmentForm,
  setSegmentForm,
  segmentSaving,
  segmentDepartments,
  segmentPayGroups,
  selectedCompanyId,
  selectedCompanyName,
  selectedCompanyColor,
  segmentLiveRules,
  saveSegment,
  deleteSegment,
  toggleSegmentDepartment,
  toggleSegmentPayGroup,
  adjustRun,
  setAdjustRun,
  adjustList,
  adjustEmployees,
  adjustLoading,
  adjustSaving,
  adjustForm,
  setAdjustForm,
  addAdjustment,
  removeAdjustment,
  adjustErrors,
  clearAdjustError,
  clearAdjustErrors,
  disburseTarget,
  setDisburseTarget,
  disbursing,
  disburseErrors,
  setDisburseErrors,
  doDisburse,
  scheduleMode,
  setScheduleMode,
  scheduleAt,
  setScheduleAt,
  scheduling,
  doSchedule,
  confirmPaidRun,
  setConfirmPaidRun,
  markPaid,
  confirmApproveRun,
  setConfirmApproveRun,
  confirmApprove,
  preflightRun,
  preflightIssues,
  setPreflightRun,
  submitAnyway,
  monthLabel,
}: PayrollDialogsProps) => {
  // Closed by default — picking a Pay Group card already sets this same
  // payroll_segment_id under the hood, so showing the full Custom segment
  // control at all times made it look redundant. Opens itself when the
  // current segment is something a Pay Group card alone couldn't have set
  // (a real custom filter), so it's never hiding an active selection.
  const [advancedSegmentOpen, setAdvancedSegmentOpen] = useState(false);

  return (
    <>
      <ResponsiveDialog
        open={dialog}
        onOpenChange={setDialog}
        preventOutsideClose
        size="xl"
        header={
          <div>
            <div className="text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
              {editingDraftId ? 'Edit draft' : 'New payroll run'} · Step {draftStep + 1} of {DRAFT_STEPS.length}
            </div>
            <div className="kd-display text-lg leading-tight font-semibold mt-0.5">{DRAFT_STEPS[draftStep].title}</div>
          </div>
        }
        footer={
          draftStep < LAST_STEP ? (
            <>
              {draftStep > 0 && (
                <Button variant="ghost" onClick={() => setDraftStep(draftStep - 1)} className="gap-1.5 mr-auto">
                  <ArrowLeft className="h-3.5 w-3.5" /> Back
                </Button>
              )}
              <Button variant="outline" onClick={() => setDialog(false)}>
                Cancel
              </Button>
              {draftStep === LAST_STEP - 1 ? (
                <Button onClick={draftRun} disabled={working}>
                  {working && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Continue to review
                </Button>
              ) : (
                <Button onClick={() => setDraftStep(draftStep + 1)} disabled={draftStep === 0 && !form.period}>
                  Continue
                </Button>
              )}
            </>
          ) : (
            <>
              <Button variant="ghost" onClick={() => setDraftStep(LAST_STEP - 1)} className="gap-1.5 mr-auto">
                <ArrowLeft className="h-3.5 w-3.5" /> Back to adjustments
              </Button>
              <Button variant="outline" onClick={finishDraftReview}>
                Save as draft
              </Button>
              <Button onClick={submitDraftForApprovalNow} className="gap-1.5">
                Submit for approval
                <Send className="h-3.5 w-3.5" />
              </Button>
            </>
          )
        }
      >
          {/* Step rail — a horizontal stepper works in both the desktop
              dialog and the mobile bottom sheet, unlike a side rail. */}
          <div className="flex items-center gap-0 mb-5 -mt-1">
            {DRAFT_STEPS.map((s, i) => (
              <div key={s.title} className="flex items-center flex-1 last:flex-none">
                <div
                  className={cn(
                    'h-6 w-6 rounded-full flex items-center justify-center text-2xs font-bold shrink-0',
                    i < draftStep ? 'bg-success text-success-foreground' :
                    i === draftStep ? 'bg-primary text-primary-foreground' :
                    'bg-muted text-muted-foreground',
                  )}
                  title={s.title}
                >
                  {i < draftStep ? <Check className="h-3 w-3" /> : i + 1}
                </div>
                {i < DRAFT_STEPS.length - 1 && (
                  <div className={cn('h-px flex-1 mx-1.5', i < draftStep ? 'bg-success/50' : 'bg-border')} />
                )}
              </div>
            ))}
          </div>

          <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">

            {draftStep === 0 && (() => {
              // Reflects the Pay Group control's own value when the selected
              // segment was created (or auto-created) as a pure single-pay-group
              // filter — so picking a pay group and looking at the "Payroll
              // segment" dropdown agree on what's selected, instead of Pay
              // Groups being invisible once turned into a segment under the hood.
              const currentSegment = segments.find((s) => s.id === form.payroll_segment_id);
              const currentRules = currentSegment?.filter_rules;
              const currentPayGroupId = currentRules?.include_pay_group_ids?.length === 1
                && !currentRules.exclude_department_ids?.length
                ? currentRules.include_pay_group_ids[0]
                : '';
              return (
                <>
                  {selectedCompanyName && (
                    <div className="flex items-center gap-2 rounded-lg border bg-muted/30 px-3 py-2 text-sm">
                      <span
                        className="h-2 w-2 rounded-full shrink-0"
                        style={{ backgroundColor: selectedCompanyColor || '#2D7FF9' }}
                        aria-hidden
                      />
                      Drafting payroll for <strong>{selectedCompanyName}</strong>
                      <span className="text-muted-foreground text-xs ml-auto">Switch company from the Payroll page header</span>
                    </div>
                  )}
                  {existingRunConflict && (
                    <div className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2.5">
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden />
                      <div className="text-xs">
                        <p className="font-semibold text-foreground">
                          A payroll run for this period and pay group already exists
                        </p>
                        <p className="mt-0.5 text-muted-foreground">
                          It is {CONFLICT_STATUS_COPY[existingRunConflict.status] ?? existingRunConflict.status}.
                          Open it from the Runs tab instead — or recall it to draft first if the
                          figures need to change. Saving here will be refused rather than
                          overwriting it.
                        </p>
                      </div>
                    </div>
                  )}

                  <Label className="flex items-center gap-1.5">
                    Pay group
                    <InfoHint>Everyone in the picked Pay Group is included by default. Set up Pay Groups in Payroll → Setup → Pay Groups.</InfoHint>
                  </Label>

                  {segmentPayGroups.length > 0 && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <button
                        type="button"
                        onClick={() => selectPayGroupQuickFilter('')}
                        className={cn(
                          'flex items-start gap-3.5 rounded-xl border-2 px-4 py-4 text-left kd-transition',
                          !currentPayGroupId ? 'border-primary bg-primary/5' : 'border-border/60 hover:border-primary/40 hover:bg-muted/30',
                        )}
                      >
                        <span className={cn('flex h-9 w-9 items-center justify-center rounded-lg shrink-0', !currentPayGroupId ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground')}>
                          <LayoutGrid className="h-4 w-4" />
                        </span>
                        <div className="min-w-0">
                          <span className="block text-sm font-semibold leading-snug">All Pay Groups</span>
                          <span className="block text-2xs text-muted-foreground mt-0.5">Everyone active</span>
                        </div>
                      </button>
                      {segmentPayGroups.map((g, i) => {
                        const selected = currentPayGroupId === g.id;
                        const freq = g.frequency ? FREQ_SHORT_LABELS[g.frequency] ?? g.frequency : null;
                        return (
                          <button
                            key={g.id}
                            type="button"
                            onClick={() => selectPayGroupQuickFilter(g.id)}
                            className={cn(
                              'flex items-start gap-3.5 rounded-xl border-2 px-4 py-4 text-left kd-transition',
                              selected ? 'border-primary bg-primary/5' : 'border-border/60 hover:border-primary/40 hover:bg-muted/30',
                            )}
                          >
                            <span className={cn(
                              'flex h-9 w-9 items-center justify-center rounded-lg shrink-0',
                              selected ? 'bg-primary text-primary-foreground' : PG_CARD_ICON_COLOURS[i % PG_CARD_ICON_COLOURS.length],
                            )}>
                              <Users2 className="h-4 w-4" />
                            </span>
                            <div className="min-w-0">
                              <span className="block text-sm font-semibold leading-snug">{g.name}</span>
                              <span className="block text-2xs text-muted-foreground mt-0.5">
                                {[freq, `${g.memberCount} ${g.memberCount === 1 ? 'person' : 'people'}`].filter(Boolean).join(' · ')}
                              </span>
                              {g.monthlyGrossNgn > 0 && (
                                <span className="block text-2xs font-semibold tabular-nums text-foreground/70 mt-0.5">
                                  ~{formatNairaCompact(g.monthlyGrossNgn)}/mo gross
                                </span>
                              )}
                              {g.payableCount < g.memberCount && (
                                <span className="block text-3xs text-warning mt-0.5">
                                  only {g.payableCount} of {g.memberCount} have a salary set
                                </span>
                              )}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label>Period</Label>
                      <Input
                        type="month"
                        value={form.period}
                        onChange={(e) => setForm({ ...form, period: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label>Period type</Label>
                      <Select
                        value={form.period_type}
                        onValueChange={(v) => setForm({ ...form, period_type: v as any })}
                      >
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="monthly">Monthly</SelectItem>
                          <SelectItem value="quarterly">Quarterly</SelectItem>
                          <SelectItem value="annual">Annual</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {/* Custom segment UI removed — pay group cards handle employee
                      filtering directly; segments are created behind the scenes. */}

                  <div className="space-y-1">
                    <Label>Who gets paid <span className="font-normal text-muted-foreground">— everyone matching is included by default</span></Label>
                    {/* Collapsed by default — a real pay group can run into the
                        dozens, and this step is meant to be a quick "does this
                        look right" glance, not a full roster review before
                        you've even picked a period. The summary bar (count,
                        total, excluded, missing-bank-details) still shows
                        without expanding; the full name-by-name lists are one
                        click away for anyone who wants them. */}
                    <PayrollRosterPreview payrollSegmentId={form.payroll_segment_id} companyId={selectedCompanyId} />
                  </div>
                </>
              );
            })()}

            {draftStep === 1 && (
              <>
                <p className="text-xs text-muted-foreground -mt-2">Anything on top of base salary this run — bonuses, or blanket allowances.</p>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>Bonuses &amp; Extras</Label>
                  </div>
                  {form.bonuses.map((b, i) => {
                    const isPct = b.mode === 'pct';
                    const hasSelection = b.employee_ids && b.employee_ids.length > 0;
                    return (
                      <div key={i} className="rounded-lg border border-border/60 bg-muted/20 p-2.5 space-y-2">
                        <div className="flex gap-2 items-center">
                          <Select value={b.type} onValueChange={(v) => updateBonus(i, 'type', v)}>
                            <SelectTrigger className="flex-1"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {BONUS_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                            </SelectContent>
                          </Select>
                          <Button size="icon" variant="ghost" aria-label="Remove bonus" onClick={() => removeBonus(i)}>
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                        <div className="flex gap-2 items-center">
                          <div className="flex items-center rounded-md border border-border/60 overflow-hidden text-2xs">
                            <button type="button" className={cn('px-2 py-1', !isPct && 'bg-primary text-primary-foreground')} onClick={() => updateBonus(i, 'mode', 'flat')}>₦ Flat</button>
                            <button type="button" className={cn('px-2 py-1', isPct && 'bg-primary text-primary-foreground')} onClick={() => updateBonus(i, 'mode', 'pct')}>% Salary</button>
                          </div>
                          <Input
                            type="number"
                            className="w-32"
                            min={0}
                            max={isPct ? 100 : undefined}
                            placeholder={isPct ? '% of salary' : '₦ per person'}
                            value={b.amount || ''}
                            onChange={(e) => updateBonus(i, 'amount', Math.max(0, Number(e.target.value) || 0))}
                          />
                        </div>
                        <div className="space-y-1.5">
                          <div className="flex items-center gap-2 text-2xs">
                            <button type="button" className={cn('font-medium', !hasSelection && 'text-primary underline')} onClick={() => updateBonus(i, 'employee_ids', undefined)}>Everyone</button>
                            <span className="text-muted-foreground">|</span>
                            <button type="button" className={cn('font-medium', hasSelection && 'text-primary underline')} onClick={() => { if (!hasSelection) updateBonus(i, 'employee_ids', []); }}>Select employees</button>
                          </div>
                          {hasSelection !== undefined && b.employee_ids !== undefined && (
                            <div className="flex flex-wrap gap-1 max-h-28 overflow-y-auto">
                              {bonusEmployees.map((emp) => {
                                const selected = b.employee_ids?.includes(emp.id);
                                return (
                                  <button
                                    key={emp.id}
                                    type="button"
                                    className={cn('px-2 py-0.5 rounded-full text-2xs border transition-colors',
                                      selected ? 'bg-primary/10 border-primary text-primary' : 'border-border/60 text-muted-foreground hover:border-primary/40')}
                                    onClick={() => {
                                      const ids = b.employee_ids || [];
                                      updateBonus(i, 'employee_ids', selected ? ids.filter((id: string) => id !== emp.id) : [...ids, emp.id]);
                                    }}
                                  >
                                    {emp.name}
                                  </button>
                                );
                              })}
                            </div>
                          )}
                          {hasSelection && (
                            <p className="text-2xs text-muted-foreground">{b.employee_ids!.length} of {bonusEmployees.length} selected</p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  <Button size="sm" variant="outline" onClick={addBonus}>
                    <Plus className="mr-1 h-3.5 w-3.5" /> Add bonus
                  </Button>
                </div>

                {/* Allowances are configured per-employee in their profile / pay group — not per run */}

                {/* ── Deduction eligibility (read-only) ─────────────── */}
                <div className="space-y-2 pt-1">
                  <Label>Deductions that will apply this run</Label>
                  <p className="text-2xs text-muted-foreground -mt-1.5">
                    Statutory deductions are driven by each employee's profile — no blanket toggle needed. To skip a deduction for one person this run, use per-employee Adjustments after drafting.
                  </p>
                  {deductionEligibility ? (
                    <div className="rounded-lg border border-border/60 bg-muted/20 divide-y divide-border/40 text-xs">
                      {[
                        { label: 'PAYE (Income Tax)', count: deductionEligibility.paye, note: 'have TIN on file', names: deductionEligibility.payeNames },
                        { label: 'Pension (8% + 10%)', count: deductionEligibility.pension, note: 'enrolled', names: deductionEligibility.pensionNames },
                        { label: 'NHF (2.5%)', count: deductionEligibility.nhf, note: 'opted in', names: deductionEligibility.nhfNames },
                        { label: 'NHIS (5% + 10%)', count: deductionEligibility.nhis, note: 'opted in', names: deductionEligibility.nhisNames },
                      ].map(({ label, count, note, names }) => (
                        <details key={label} className="group">
                          <summary className="flex items-center justify-between px-3 py-2 cursor-pointer list-none [&::-webkit-details-marker]:hidden">
                            <span className="text-foreground">{label}</span>
                            <span className={cn('tabular-nums', count > 0 ? 'font-semibold text-foreground' : 'text-muted-foreground')}>
                              {count} of {deductionEligibility.total} {note}
                            </span>
                          </summary>
                          {names.length > 0 ? (
                            <ul className="px-3 pb-2 pt-0.5 flex flex-wrap gap-1">
                              {names.map((n) => (
                                <li key={n} className="rounded-full bg-muted px-2 py-0.5 text-2xs text-muted-foreground">{n}</li>
                              ))}
                            </ul>
                          ) : (
                            <p className="px-3 pb-2 pt-0.5 text-2xs text-muted-foreground">No employees {note} in this run.</p>
                          )}
                        </details>
                      ))}
                      <div className="flex items-center justify-between px-3 py-2">
                        <span className="text-foreground">Development Levy</span>
                        <span className={cn(deductionEligibility.devLevy ? 'text-foreground' : 'text-muted-foreground')}>
                          {deductionEligibility.devLevy ? 'Enabled (company setting)' : 'Disabled'}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">Loading employee eligibility…</p>
                  )}
                </div>

                {/* ── Non-statutory per-run controls ───────────────── */}
                <div className="space-y-2 pt-1">
                  <Label>Optional repayments this run</Label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-2.5 gap-x-4">
                    {([
                      { key: 'include_advances' as const, label: 'Salary Advance Repayments' },
                      { key: 'include_deductions' as const, label: 'Recurring Deductions' },
                      { key: 'include_ewa' as const, label: 'Earned Wage Access (EWA)' },
                    ] as const).map(({ key, label }) => (
                      <label key={key} className="flex items-center gap-2 cursor-pointer">
                        <Switch
                          checked={form[key]}
                          onCheckedChange={(v) => setForm({ ...form, [key]: v })}
                        />
                        <span className={cn('text-xs', !form[key] && 'text-muted-foreground line-through')}>{label}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <p className="text-xs text-muted-foreground">
                  KDOps will compute PAYE / Pension / NHF based on each employee's
                  statutory profile. Bonuses and allowances are added on top.
                </p>
              </>
            )}

            {draftStep === 2 && computedPreview && (
              <>
                <p className="text-xs text-muted-foreground -mt-2">
                  This is what's saved. Submitting sends these exact numbers to an approver — to change anything after that, the run has to be recalled first.
                </p>
                <div className="rounded-lg border border-border overflow-hidden">
                  <div className="px-4 py-2.5 bg-muted/40 border-b border-border">
                    <div className="text-sm font-semibold">{form.period} · {computedPreview.empCount} employees</div>
                  </div>
                  <div className="divide-y divide-border/60">
                    {[
                      { label: 'Gross salaries', value: computedPreview.totalEmployee },
                      ...(computedPreview.bonusTotal > 0 ? [{ label: 'Bonuses', value: computedPreview.bonusTotal }] : []),
                      ...(computedPreview.totalAllowances > 0 ? [{ label: 'Allowances', value: computedPreview.totalAllowances }] : []),
                      { label: 'PAYE tax', value: computedPreview.paye, muted: true, sub: 'deducted from employee' },
                      { label: 'Pension — employee (8%)', value: computedPreview.pension, muted: true, sub: 'deducted from employee' },
                      { label: 'NHF', value: computedPreview.nhf, muted: true, sub: 'deducted from employee' },
                      ...(computedPreview.nhisEmployee > 0 ? [{ label: 'NHIS — employee (5%)', value: computedPreview.nhisEmployee, muted: true, sub: 'deducted from employee' }] : []),
                      ...(computedPreview.totalDeductions > 0 ? [{ label: 'Recurring deductions', value: -computedPreview.totalDeductions, muted: true }] : []),
                      ...(computedPreview.totalAdvanceRepayments > 0 ? [{ label: 'Advance repayments', value: -computedPreview.totalAdvanceRepayments, muted: true }] : []),
                    ].map((line) => (
                      <div key={line.label} className="flex items-center justify-between px-4 py-2">
                        <div className="flex flex-col">
                          <span className={cn('text-xs', line.muted ? 'text-muted-foreground' : 'text-foreground')}>{line.label}</span>
                          {line.sub && <span className="text-2xs text-muted-foreground/60">{line.sub}</span>}
                        </div>
                        <span className={cn('text-xs font-medium currency tabular-nums', line.muted && 'text-muted-foreground')}>{formatNaira(line.value)}</span>
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center justify-between px-4 py-2.5 bg-emerald-500/10 border-t border-border/60">
                    <span className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">Net pay to employees</span>
                    <span className="text-base font-bold currency tabular-nums text-emerald-700 dark:text-emerald-400">{formatNaira(computedPreview.totalNetPay)}</span>
                  </div>
                  {(computedPreview.employerPension > 0 || computedPreview.nsitfCharge > 0 || computedPreview.nhisEmployer > 0) && (
                    <div className="border-t border-border/60">
                      <div className="px-4 py-1.5 text-2xs text-muted-foreground/60 uppercase tracking-wider font-semibold">
                        Employer-side costs (for your records — not deducted from employees)
                      </div>
                      {[
                        ...(computedPreview.employerPension > 0 ? [{ label: 'Pension — employer (10%)', value: computedPreview.employerPension }] : []),
                        ...(computedPreview.nsitfCharge > 0 ? [{ label: 'NSITF (1%)', value: computedPreview.nsitfCharge }] : []),
                        ...(computedPreview.nhisEmployer > 0 ? [{ label: 'NHIS — employer (10%)', value: computedPreview.nhisEmployer }] : []),
                      ].map((line) => (
                        <div key={line.label} className="flex items-center justify-between px-4 py-1.5">
                          <span className="text-xs text-muted-foreground">{line.label}</span>
                          <span className="text-xs font-medium currency tabular-nums text-muted-foreground">{formatNaira(line.value)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="flex items-center justify-between px-4 py-2.5 bg-primary/10">
                    <div className="flex flex-col">
                      <span className="text-sm font-semibold">Total company cost</span>
                      <span className="text-2xs text-muted-foreground">Net pay + employer pension</span>
                    </div>
                    <span className="text-base font-bold currency tabular-nums text-primary">{formatNaira(computedPreview.burn)}</span>
                  </div>
                </div>

                {complianceChecks && complianceChecks.length > 0 && (
                  <CompliancePanel checks={complianceChecks} />
                )}

                {/* Statutory remittance deadlines — approving a run creates
                    real compliance obligations; naming the dates here means
                    HR isn't the one who has to remember them from memory. */}
                <div className="rounded-lg border border-border/60 bg-muted/20 px-3.5 py-3">
                  <p className="text-2xs font-bold uppercase tracking-wide text-muted-foreground mb-2">
                    Statutory deadlines once this is paid
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    {STATUTORY_DEADLINES.map((d) => (
                      <div key={d.label} className="text-xs">
                        <p className="font-semibold text-foreground">{d.label}</p>
                        <p className="text-muted-foreground">{d.due}</p>
                        <p className="text-muted-foreground/70">{d.authority}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}

          </div>
      </ResponsiveDialog>

      {/* Manage payroll segments — reusable run filters (by category, department, or Pay Group) */}
      <ResponsiveDialog
        open={segmentDialog}
        onOpenChange={setSegmentDialog}
        preventOutsideClose
        size="lg"
        title="Manage payroll segments"
        footer={<Button variant="outline" onClick={() => setSegmentDialog(false)}>Done</Button>}
      >
          <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
            {segments.length > 0 && (
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Existing segments</Label>
                {segments.map((s) => (
                  <div key={s.id} className="flex items-center justify-between gap-2 rounded-md border px-3 py-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{s.name}</p>
                      {s.description && <p className="text-xs text-muted-foreground truncate">{s.description}</p>}
                    </div>
                    {s.name !== 'All Staff' && (
                      <Button size="icon-sm" variant="ghost" className="shrink-0" onClick={() => deleteSegment(s.id, s.name)} aria-label={`Remove ${s.name}`}>
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            )}

            <div className="space-y-3 border-t pt-4">
              <Label className="text-xs text-muted-foreground">New segment</Label>
              <div className="space-y-1">
                <Label className="text-xs">Name</Label>
                <Input
                  placeholder="e.g. Staff (excl. Directors)"
                  value={segmentForm.name}
                  onChange={(e) => setSegmentForm({ ...segmentForm, name: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Description (optional)</Label>
                <Input
                  placeholder="Shown as a hint when this segment is selected"
                  value={segmentForm.description}
                  onChange={(e) => setSegmentForm({ ...segmentForm, description: e.target.value })}
                />
              </div>
              {segmentPayGroups.length > 0 && (
                <div className="space-y-1.5">
                  <Label className="text-xs">Only include these Pay Groups</Label>
                  <div className="flex flex-wrap gap-1.5">
                    {segmentPayGroups.map((g) => (
                      <Badge
                        key={g.id}
                        variant={segmentForm.include_pay_group_ids.includes(g.id) ? 'default' : 'outline'}
                        className="cursor-pointer kd-transition"
                        onClick={() => toggleSegmentPayGroup(g.id)}
                      >
                        {g.name}
                      </Badge>
                    ))}
                  </div>
                  <p className="text-2xs text-muted-foreground">
                    Leave empty to not filter by Pay Group. Pick one or more to run payroll for just those groups — assign employees to a Pay Group from Payroll → Schedules → Pay Groups.
                  </p>
                </div>
              )}
              {segmentDepartments.length > 0 && (
                <div className="space-y-1.5">
                  <Label className="text-xs">Exclude departments</Label>
                  <div className="flex flex-wrap gap-1.5">
                    {segmentDepartments.map((d) => (
                      <Badge
                        key={d.id}
                        variant={segmentForm.exclude_department_ids.includes(d.id) ? 'default' : 'outline'}
                        className="cursor-pointer kd-transition"
                        onClick={() => toggleSegmentDepartment(d.id)}
                      >
                        {d.name}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              <div className="space-y-1">
                <Label className="text-xs">Who this matches right now</Label>
                <PayrollRosterPreview rulesOverride={segmentLiveRules} companyId={selectedCompanyId} defaultExpanded />
              </div>

              <Button size="sm" onClick={saveSegment} disabled={segmentSaving || !segmentForm.name.trim()}>
                {segmentSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                <Plus className="mr-1 h-3.5 w-3.5" /> Create segment
              </Button>
            </div>
          </div>
      </ResponsiveDialog>

      {/* Per-employee payslip adjustments for a run */}
      <ResponsiveDialog
        open={!!adjustRun}
        onOpenChange={(open) => { if (!open) { clearAdjustErrors(); setAdjustRun(null); } }}
        preventOutsideClose
        size="2xl"
        title={`Payslip adjustments${adjustRun ? ` · ${monthLabel(adjustRun.period)}` : ''}`}
        footer={<Button variant="outline" onClick={() => setAdjustRun(null)}>Done</Button>}
      >
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Add a one-off bonus, overtime, allowance or deduction for a specific employee, or
              exclude someone from this run only. Earnings increase pay (taxable ones also raise
              PAYE); deductions reduce it; an exclusion removes them from this run's payslips
              without touching their pay group, salary, or any other run.
              <span className="font-medium text-foreground"> Re-generate payslips for this run after editing</span> to apply changes.
            </p>

            {/* Add form */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 rounded-lg border p-3">
              <div className="space-y-1 sm:col-span-2">
                <Label>Employee</Label>
                <Select value={adjustForm.employee_id || undefined} onValueChange={(v) => { clearAdjustError('employee_id'); setAdjustForm((f) => ({ ...f, employee_id: v })); }}>
                  <SelectTrigger aria-invalid={!!adjustErrors.employee_id}><SelectValue placeholder="Select an employee" /></SelectTrigger>
                  <SelectContent>
                    {adjustEmployees.map((e) => (
                      <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FieldError message={adjustErrors.employee_id} />
              </div>
              <div className="space-y-1">
                <Label>Type</Label>
                <Select value={adjustForm.kind} onValueChange={(v) => setAdjustForm((f) => ({ ...f, kind: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="bonus">Bonus</SelectItem>
                    <SelectItem value="overtime">Overtime</SelectItem>
                    <SelectItem value="allowance">Allowance</SelectItem>
                    <SelectItem value="deduction">Deduction</SelectItem>
                    <SelectItem value="exclude">Exclude from this run</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {adjustForm.kind !== 'exclude' && (
                <div className="space-y-1">
                  <Label>Amount (₦)</Label>
                  <Input
                    type="number" min="0" inputMode="numeric"
                    value={adjustForm.amount}
                    onChange={(e) => { clearAdjustError('amount'); setAdjustForm((f) => ({ ...f, amount: e.target.value })); }}
                    placeholder="0"
                    aria-invalid={!!adjustErrors.amount}
                  />
                  <FieldError message={adjustErrors.amount} />
                </div>
              )}
              <div className={cn('space-y-1', adjustForm.kind !== 'exclude' && 'sm:col-span-2')}>
                <Label>{adjustForm.kind === 'exclude' ? 'Reason (optional)' : 'Description'}</Label>
                <Input
                  value={adjustForm.description}
                  onChange={(e) => { clearAdjustError('description'); setAdjustForm((f) => ({ ...f, description: e.target.value })); }}
                  placeholder={adjustForm.kind === 'exclude' ? 'e.g. On unpaid leave all month' : 'e.g. Performance bonus, Q2'}
                  aria-invalid={!!adjustErrors.description}
                />
                <FieldError message={adjustErrors.description} />
              </div>
              {adjustForm.kind === 'exclude' && (
                <p className="sm:col-span-2 text-xs text-muted-foreground">
                  No payslip will be generated for this employee in this run only — their pay group,
                  salary, and every other run are unaffected.
                </p>
              )}
              {adjustForm.kind !== 'deduction' && adjustForm.kind !== 'exclude' && (
                <label className="sm:col-span-2 flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
                  <Switch
                    checked={adjustForm.taxable}
                    onCheckedChange={(v) => setAdjustForm((f) => ({ ...f, taxable: v }))}
                  />
                  Taxable (adds to PAYE base)
                </label>
              )}
              <div className="sm:col-span-2 flex justify-end">
                <Button size="sm" onClick={addAdjustment} disabled={adjustSaving}>
                  {adjustSaving ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <Plus className="mr-1 h-3.5 w-3.5" />}
                  Add adjustment
                </Button>
              </div>
            </div>

            {/* Existing list */}
            {adjustLoading ? (
              <div className="py-6 flex items-center justify-center">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            ) : adjustList.length === 0 ? (
              <p className="text-sm text-muted-foreground py-2">No adjustments for this run yet.</p>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {adjustList.map((a) => (
                  <div key={a.id} className="flex items-center justify-between gap-2 border rounded-lg p-2.5 text-sm">
                    <div className="min-w-0">
                      <p className="font-medium truncate">
                        {adjustEmployees.find((e) => e.id === a.employee_id)?.name || a.employee_id}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {a.kind === 'exclude' ? (
                          <>Excluded from this run{a.description ? ` · ${a.description}` : ''}</>
                        ) : (
                          <>
                            <span className="capitalize">{a.kind}</span>
                            {a.kind !== 'deduction' && !a.taxable ? ' · non-taxable' : ''} · {a.description}
                          </>
                        )}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {a.kind === 'exclude' ? (
                        <span className="text-xs font-semibold text-destructive uppercase tracking-wide">Excluded</span>
                      ) : (
                        <span className={cn('tabular-nums font-semibold', a.kind === 'deduction' ? 'text-destructive' : 'text-success')}>
                          {a.kind === 'deduction' ? '−' : '+'}{formatNaira(Number(a.amount_ngn))}
                        </span>
                      )}
                      <Button size="icon-sm" variant="ghost" onClick={() => removeAdjustment(a.id)} aria-label="Remove adjustment">
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
      </ResponsiveDialog>

      <ResponsiveDialog
        open={!!disburseTarget}
        onOpenChange={(open) => { if (!open && !disbursing && !scheduling) { setDisburseTarget(null); setDisburseErrors([]); setScheduleMode(false); setScheduleAt(''); } }}
        preventOutsideClose
        title="Confirm salary disbursement"
        footer={
          <>
            <Button
              variant="outline"
              onClick={() => { setDisburseTarget(null); setDisburseErrors([]); setScheduleMode(false); setScheduleAt(''); }}
              disabled={disbursing || scheduling}
            >
              Cancel
            </Button>
            {scheduleMode ? (
              <Button onClick={doSchedule} disabled={scheduling || !scheduleAt}>
                {scheduling
                  ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  : <Clock className="mr-2 h-4 w-4" />}
                Schedule
              </Button>
            ) : (
              <Button onClick={doDisburse} disabled={disbursing}>
                {disbursing
                  ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  : <Send className="mr-2 h-4 w-4" />}
                Disburse Now
              </Button>
            )}
          </>
        }
      >
          {disburseTarget && (() => {
            const activeSlips = disburseTarget.payslips.filter((p: any) => !p.excluded);
            const excludedCount = disburseTarget.payslips.length - activeSlips.length;
            const activeTotal = activeSlips.reduce((s: number, p: any) => s + Number(p.net_ngn || 0), 0);
            return (
            <div className="space-y-4">
              <div className="rounded-lg border p-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Period</span>
                  <span className="font-medium">{monthLabel(disburseTarget.run.period)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Employees to pay</span>
                  <span className="font-medium">{activeSlips.length}</span>
                </div>
                {excludedCount > 0 && (
                  <div className="flex justify-between text-sm text-amber-600 dark:text-amber-400">
                    <span>Excluded</span>
                    <span className="font-medium">{excludedCount} employee{excludedCount !== 1 ? 's' : ''} skipped</span>
                  </div>
                )}
                <div className="flex justify-between text-sm font-semibold">
                  <span>Total disbursement</span>
                  <span className="currency text-success tabular-nums">
                    {formatNaira(activeTotal)}
                  </span>
                </div>
              </div>

              <div className="flex rounded-lg border p-1 gap-1">
                <button
                  type="button"
                  className={cn(
                    'flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                    !scheduleMode ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground',
                  )}
                  onClick={() => setScheduleMode(false)}
                  disabled={disbursing || scheduling}
                >
                  Disburse now
                </button>
                <button
                  type="button"
                  className={cn(
                    'flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                    scheduleMode ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground',
                  )}
                  onClick={() => setScheduleMode(true)}
                  disabled={disbursing || scheduling}
                >
                  Schedule for later
                </button>
              </div>

              {scheduleMode ? (
                <div className="space-y-2">
                  <Label htmlFor="payroll-schedule-at">Disburse at ({getTimezone()} time)</Label>
                  <Input
                    id="payroll-schedule-at"
                    type="datetime-local"
                    value={scheduleAt}
                    min={utcIsoToOrgWallClock(new Date(Date.now() + 5 * 60 * 1000).toISOString())}
                    onChange={(e) => setScheduleAt(e.target.value)}
                  />
                  {scheduleAt && (() => {
                    const localDisplay = orgWallClockToLocalDisplay(scheduleAt);
                    if (!localDisplay) return null;
                    return (
                      <p className="text-xs font-medium text-amber-500 dark:text-amber-400 flex items-center gap-1">
                        <Clock className="h-3 w-3 flex-shrink-0" />
                        That's {localDisplay} your time ({getBrowserTimezone().replace(/_/g, ' ')})
                      </p>
                    );
                  })()}
                  <p className="text-xs text-muted-foreground">
                    Pick the time in your company's timezone ({getTimezone()}).{' '}
                    KDOps will automatically dispatch transfers for every employee's net salary
                    at this time — no one needs to be online. Approvers can cancel the schedule
                    any time before it fires, from this run's row on the Runs tab.
                  </p>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  KDOps will create a transfer for each employee's net salary right now, using the
                  bank details on their profile. Status updates arrive via the payment provider's webhook.
                </p>
              )}

              {disburseErrors.length > 0 && (
                <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 space-y-1">
                  <p className="text-xs font-semibold text-destructive flex items-center gap-1">
                    <AlertCircle className="h-3.5 w-3.5" /> {disburseErrors.length} issue{disburseErrors.length === 1 ? '' : 's'}
                  </p>
                  <ul className="list-disc pl-4 space-y-0.5">
                    {disburseErrors.map((e, i) => (
                      <li key={i} className="text-xs text-destructive">{e}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
            );
          })()}
      </ResponsiveDialog>

      <ResponsiveDialog
        open={!!confirmPaidRun}
        onOpenChange={(open) => { if (!open) setConfirmPaidRun(null); }}
        title="Confirm manual payment record"
        footer={
          <>
            <Button variant="outline" onClick={() => setConfirmPaidRun(null)}>Cancel</Button>
            <Button onClick={markPaid}>Confirm — Record as Paid</Button>
          </>
        }
      >
          {confirmPaidRun && (
            <div className="rounded-lg border border-border/60 bg-muted/30 px-3.5 py-2.5 mb-3 text-sm tabular-nums">
              <div className="flex justify-between"><span className="text-muted-foreground">Period</span><span className="font-semibold">{monthLabel(confirmPaidRun.period)}</span></div>
              <div className="flex justify-between mt-1"><span className="text-muted-foreground">Employees</span><span className="font-semibold">{confirmPaidRun.employee_count ?? '—'}</span></div>
              <div className="flex justify-between mt-1"><span className="text-muted-foreground">Net to disburse</span><span className="font-semibold">{formatNaira(confirmPaidRun.total_employee_ngn - confirmPaidRun.paye_ngn - confirmPaidRun.pension_ngn - confirmPaidRun.nhf_ngn)}</span></div>
            </div>
          )}
          <p className="text-sm text-muted-foreground leading-relaxed">
            This records that salaries were paid via your bank or another method. No automatic transfer will be made by KDOps. Only confirm if you have already transferred salaries manually.
          </p>
      </ResponsiveDialog>

      <ResponsiveDialog
        open={!!confirmApproveRun}
        onOpenChange={(open) => { if (!open) setConfirmApproveRun(null); }}
        title="Confirm approval"
        description="Approving locks this run in and generates payslips. Review the numbers before you continue."
        footer={
          <>
            <Button variant="outline" onClick={() => setConfirmApproveRun(null)}>Cancel</Button>
            <Button onClick={confirmApprove}>Approve {confirmApproveRun ? monthLabel(confirmApproveRun.period) : ''}</Button>
          </>
        }
      >
        {confirmApproveRun && (
          <div className="space-y-3">
            <div className="rounded-lg border border-border/60 divide-y divide-border/60 overflow-hidden">
              <div className="flex items-center justify-between px-3.5 py-2.5">
                <span className="text-sm text-muted-foreground">Employees paid</span>
                <span className="text-sm font-semibold tabular-nums">{confirmApproveRun.employee_count ?? '—'}</span>
              </div>
              <div className="flex items-center justify-between px-3.5 py-2.5">
                <span className="text-sm text-muted-foreground">Gross pay</span>
                <span className="text-sm font-semibold currency tabular-nums">{formatNaira(confirmApproveRun.total_employee_ngn)}</span>
              </div>
              <div className="flex items-center justify-between px-3.5 py-2">
                <span className="text-xs text-muted-foreground">PAYE tax</span>
                <span className="text-xs currency tabular-nums text-muted-foreground">− {formatNaira(confirmApproveRun.paye_ngn)}</span>
              </div>
              <div className="flex items-center justify-between px-3.5 py-2">
                <span className="text-xs text-muted-foreground">Pension (employee)</span>
                <span className="text-xs currency tabular-nums text-muted-foreground">− {formatNaira(confirmApproveRun.pension_ngn)}</span>
              </div>
              {confirmApproveRun.nhf_ngn > 0 && (
                <div className="flex items-center justify-between px-3.5 py-2">
                  <span className="text-xs text-muted-foreground">NHF</span>
                  <span className="text-xs currency tabular-nums text-muted-foreground">− {formatNaira(confirmApproveRun.nhf_ngn)}</span>
                </div>
              )}
              <div className="flex items-center justify-between px-3.5 py-3 bg-emerald-500/10">
                <span className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">Net pay</span>
                <span className="text-base font-bold currency tabular-nums text-emerald-700 dark:text-emerald-400">{formatNaira(confirmApproveRun.total_employee_ngn - confirmApproveRun.paye_ngn - confirmApproveRun.pension_ngn - confirmApproveRun.nhf_ngn)}</span>
              </div>
              <div className="flex items-center justify-between px-3.5 py-2">
                <span className="text-2xs text-muted-foreground">Total company cost</span>
                <span className="text-xs currency tabular-nums text-muted-foreground">{formatNaira(confirmApproveRun.total_burn_ngn)}</span>
              </div>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Once approved, payslips are generated automatically and the run is ready to disburse. To change anything after this, recall the run to draft first.
            </p>
          </div>
        )}
      </ResponsiveDialog>

      <ResponsiveDialog
        open={!!preflightRun}
        onOpenChange={(open) => { if (!open) setPreflightRun(null); }}
        title="Before you submit"
        description="A few things about this run's data are worth fixing first — none of these block submission, but they will block disbursement later."
        footer={
          <>
            <Button variant="outline" onClick={() => setPreflightRun(null)}>Go fix these first</Button>
            <Button onClick={submitAnyway}>Submit anyway</Button>
          </>
        }
      >
        {preflightRun && (
          <div className="space-y-3">
            {preflightIssues.map((issue, i) => (
              <div key={i} className="flex items-start gap-3 rounded-lg border border-warning/40 bg-warning/10 px-3.5 py-3">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-warning" />
                <div className="min-w-0">
                  <p className="text-sm font-medium leading-snug">{issue.message}</p>
                  <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{issue.names.join(', ')}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </ResponsiveDialog>
    </>
  );
};
