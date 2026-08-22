import React from 'react';
import { Loader2, Plus, Send, AlertCircle, Trash2, X, Clock, Check, ArrowLeft } from 'lucide-react';
import { InfoHint } from '@/components/ui-kit/InfoHint';
import type { PayrollSegment } from '@/lib/payroll-segments';
import type { PayrollSegmentFilterRules } from '@/lib/payroll-segments';
import { formatNaira } from '@/lib/format';
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
import { cn } from '@/lib/utils';
import { PayrollRosterPreview } from '@/components/payroll/PayrollRosterPreview';

interface BonusLine {
  type: string;
  amount: number;
}

interface PayrollRun {
  id: string;
  period: string;
  period_type?: 'monthly' | 'quarterly' | 'annual';
  employee_count?: number;
  total_contractor_ngn: number;
  total_employee_ngn: number;
  total_expenses_ngn: number;
  paye_ngn: number;
  pension_ngn: number;
  nhf_ngn: number;
  total_burn_ngn: number;
  employer_pension_ngn?: number | null;
  bonuses_json?: BonusLine[] | null;
  allowances_json?: { housing_pct: number; transport_per_emp: number; meal_per_emp: number; total: number } | null;
  status: 'draft' | 'pending_approval' | 'approved' | 'processing' | 'paid';
  created_at: string;
  created_by: string | null;
  approved_by: string | null;
  payroll_segment_id?: string | null;
  scheduled_disburse_at?: string | null;
  is_auto_generated?: boolean;
}

// The Draft dialog's guided flow — 4 named steps instead of one dense
// scrollable form. Matches the Gusto/QuickBooks/ADP pattern researched for
// this rebuild: each step asks one question, the last restates every
// number before anything is saved as a submittable run.
const DRAFT_STEPS = [
  { title: 'Who gets paid', desc: 'Everyone, or a specific segment' },
  { title: 'Period & schedule', desc: 'Which month, what cadence' },
  { title: 'Bonuses & adjustments', desc: 'Anything extra this run' },
  { title: 'Review & submit', desc: 'Confirm the real numbers' },
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

const PAYROLL_CATEGORY_LABELS: Record<string, string> = {
  administrative: 'Administrative',
  executive: 'Executive / Director',
  domestic: 'Domestic staff',
  security: 'Security',
  contractor: 'Contractor',
};

interface DraftForm {
  period: string;
  period_type: 'monthly' | 'quarterly' | 'annual';
  bonuses: BonusLine[];
  housing_allowance_pct: number;
  transport_per_emp: number;
  meal_per_emp: number;
  payroll_segment_id: string;
}

interface SegmentFormState {
  name: string;
  description: string;
  exclude_employee_categories: string[];
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
  updateBonus: (i: number, field: 'type' | 'amount', val: any) => void;
  draftStep: number;
  setDraftStep: (n: number) => void;
  selectPayGroupQuickFilter: (groupId: string) => void;
  computedPreview: {
    empCount: number; totalEmployee: number; bonusTotal: number; totalAllowances: number;
    paye: number; pension: number; employerPension: number; nhf: number; nsitfCharge: number;
    totalDeductions: number; totalAdvanceRepayments: number; totalContractor: number;
    totalExpenses: number; burn: number;
  } | null;
  finishDraftReview: () => void;
  submitDraftForApprovalNow: () => void;

  // Segment dialog
  segmentDialog: boolean;
  setSegmentDialog: (v: boolean) => void;
  segmentForm: SegmentFormState;
  setSegmentForm: React.Dispatch<React.SetStateAction<SegmentFormState>>;
  segmentSaving: boolean;
  segmentDepartments: { id: string; name: string }[];
  segmentPayGroups: { id: string; name: string }[];
  segmentLiveRules: PayrollSegmentFilterRules;
  saveSegment: () => void;
  deleteSegment: (segmentId: string, name: string) => void;
  toggleSegmentCategory: (cat: string) => void;
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
  finishDraftReview,
  submitDraftForApprovalNow,
  segmentDialog,
  setSegmentDialog,
  segmentForm,
  setSegmentForm,
  segmentSaving,
  segmentDepartments,
  segmentPayGroups,
  segmentLiveRules,
  saveSegment,
  deleteSegment,
  toggleSegmentCategory,
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
  return (
    <>
      <ResponsiveDialog
        open={dialog}
        onOpenChange={setDialog}
        preventOutsideClose
        size="xl"
        header={
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              {editingDraftId ? 'Edit draft' : 'New payroll run'} · Step {draftStep + 1} of {DRAFT_STEPS.length}
            </div>
            <div className="kd-display text-lg leading-tight font-semibold mt-0.5">{DRAFT_STEPS[draftStep].title}</div>
          </div>
        }
        footer={
          draftStep < 3 ? (
            <>
              {draftStep > 0 && (
                <Button variant="ghost" onClick={() => setDraftStep(draftStep - 1)} className="gap-1.5 mr-auto">
                  <ArrowLeft className="h-3.5 w-3.5" /> Back
                </Button>
              )}
              <Button variant="outline" onClick={() => setDialog(false)}>
                Cancel
              </Button>
              {draftStep < 2 ? (
                <Button onClick={() => setDraftStep(draftStep + 1)} disabled={draftStep === 1 && !form.period}>
                  Continue
                </Button>
              ) : (
                <Button onClick={draftRun} disabled={working}>
                  {working && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Continue to review
                </Button>
              )}
            </>
          ) : (
            <>
              <Button variant="ghost" onClick={() => setDraftStep(2)} className="gap-1.5 mr-auto">
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
                    'h-6 w-6 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0',
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
                && !currentRules.exclude_employee_categories?.length
                && !currentRules.exclude_department_ids?.length
                ? currentRules.include_pay_group_ids[0]
                : '';
              return (
                <>
                  <p className="text-xs text-muted-foreground -mt-2">Choose who this run pays — everyone active, one Pay Group, or a custom segment.</p>

                  {segmentPayGroups.length > 0 && (
                    <div className="space-y-1">
                      <Label className="flex items-center gap-1.5">
                        Pay group
                        <InfoHint>Run payroll for just one Pay Group — e.g. Field Staff paid weekly, separate from Office Staff paid monthly. Set up Pay Groups in Payroll → Setup → Pay Groups.</InfoHint>
                      </Label>
                      <Select
                        value={currentPayGroupId || '__all__'}
                        onValueChange={(v) => selectPayGroupQuickFilter(v === '__all__' ? '' : v)}
                      >
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__all__">All Pay Groups</SelectItem>
                          {segmentPayGroups.map((g) => (
                            <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <Label className="flex items-center gap-1.5">
                        Custom segment
                        <InfoHint>For filters a single Pay Group can't express — e.g. exclude directors, or combine a department with a category. Leave as "All employees" for the default, unfiltered run.</InfoHint>
                      </Label>
                      <Button type="button" size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={() => setSegmentDialog(true)}>
                        Manage
                      </Button>
                    </div>
                    <Select
                      value={form.payroll_segment_id || '__all__'}
                      onValueChange={(v) => setForm({ ...form, payroll_segment_id: v === '__all__' ? '' : v })}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__all__">All employees (no filter)</SelectItem>
                        {segments.map((s) => (
                          <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {form.payroll_segment_id && (
                      <p className="text-xs text-muted-foreground">
                        {currentSegment?.description || 'Only employees matching this segment will be included.'}
                      </p>
                    )}
                  </div>

                  <PayrollRosterPreview payrollSegmentId={form.payroll_segment_id} defaultExpanded />
                </>
              );
            })()}

            {draftStep === 1 && (
              <>
                <p className="text-xs text-muted-foreground -mt-2">Which month this run covers, and its cadence.</p>
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
              </>
            )}

            {draftStep === 2 && (
              <>
                <p className="text-xs text-muted-foreground -mt-2">Anything on top of base salary this run — bonuses, or blanket allowances.</p>
                <div className="space-y-2">
                  <Label>Bonuses &amp; Extras</Label>
                  {form.bonuses.map((b, i) => (
                    <div key={i} className="flex gap-2 items-center">
                      <Select value={b.type} onValueChange={(v) => updateBonus(i, 'type', v)}>
                        <SelectTrigger className="flex-1"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {BONUS_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <Input
                        type="number"
                        className="w-36"
                        min={0}
                        placeholder="₦ Amount"
                        value={b.amount || ''}
                        onChange={(e) => updateBonus(i, 'amount', Math.max(0, Number(e.target.value) || 0))}
                      />
                      <Button size="icon" variant="ghost" aria-label="Remove bonus" onClick={() => removeBonus(i)}>
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                  <Button size="sm" variant="outline" onClick={addBonus}>
                    <Plus className="mr-1 h-3.5 w-3.5" /> Add bonus
                  </Button>
                </div>

                <div className="space-y-2">
                  <Label>Allowances</Label>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Housing (% of basic)</Label>
                      <Input
                        type="number"
                        min={0}
                        max={100}
                        placeholder="0"
                        value={form.housing_allowance_pct || ''}
                        onChange={(e) => setForm({ ...form, housing_allowance_pct: Number(e.target.value) || 0 })}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Transport / employee (₦)</Label>
                      <Input
                        type="number"
                        min={0}
                        placeholder="0"
                        value={form.transport_per_emp || ''}
                        onChange={(e) => setForm({ ...form, transport_per_emp: Number(e.target.value) || 0 })}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Meal subsidy / employee (₦)</Label>
                      <Input
                        type="number"
                        min={0}
                        placeholder="0"
                        value={form.meal_per_emp || ''}
                        onChange={(e) => setForm({ ...form, meal_per_emp: Number(e.target.value) || 0 })}
                      />
                    </div>
                  </div>
                </div>

                <p className="text-xs text-muted-foreground">
                  KDOps will pull approved expenses and processed payment batches for
                  this period and estimate PAYE / Pension / NHF. Bonuses and allowances
                  are added on top and included in the total burn.
                </p>
              </>
            )}

            {draftStep === 3 && computedPreview && (
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
                      ...(computedPreview.totalContractor > 0 ? [{ label: 'Contractor payouts', value: computedPreview.totalContractor }] : []),
                      ...(computedPreview.totalExpenses > 0 ? [{ label: 'Approved expenses', value: computedPreview.totalExpenses }] : []),
                      { label: 'PAYE tax', value: computedPreview.paye, muted: true },
                      { label: 'Pension — employee', value: computedPreview.pension, muted: true },
                      { label: 'Pension — employer', value: computedPreview.employerPension, muted: true },
                      { label: 'NHF', value: computedPreview.nhf, muted: true },
                      { label: 'NSITF', value: computedPreview.nsitfCharge, muted: true },
                      ...(computedPreview.totalDeductions > 0 ? [{ label: 'Deductions (offsets burn)', value: -computedPreview.totalDeductions, muted: true }] : []),
                      ...(computedPreview.totalAdvanceRepayments > 0 ? [{ label: 'Advance repayments (offsets burn)', value: -computedPreview.totalAdvanceRepayments, muted: true }] : []),
                    ].map((line) => (
                      <div key={line.label} className="flex items-center justify-between px-4 py-2">
                        <span className={cn('text-xs', line.muted ? 'text-muted-foreground' : 'text-foreground')}>{line.label}</span>
                        <span className={cn('text-xs font-medium currency tabular-nums', line.muted && 'text-muted-foreground')}>{formatNaira(line.value)}</span>
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center justify-between px-4 py-3 bg-primary/10">
                    <span className="text-sm font-semibold">Total burn this run</span>
                    <span className="text-base font-bold currency tabular-nums text-primary">{formatNaira(computedPreview.burn)}</span>
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
                      <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0" onClick={() => deleteSegment(s.id, s.name)} aria-label={`Remove ${s.name}`}>
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
                  <p className="text-[11px] text-muted-foreground">
                    Leave empty to not filter by Pay Group. Pick one or more to run payroll for just those groups — assign employees to a Pay Group from Payroll → Schedules → Pay Groups.
                  </p>
                </div>
              )}
              <div className="space-y-1.5">
                <Label className="text-xs">Exclude payroll categories</Label>
                <div className="flex flex-wrap gap-1.5">
                  {Object.entries(PAYROLL_CATEGORY_LABELS).map(([value, label]) => (
                    <Badge
                      key={value}
                      variant={segmentForm.exclude_employee_categories.includes(value) ? 'default' : 'outline'}
                      className="cursor-pointer kd-transition"
                      onClick={() => toggleSegmentCategory(value)}
                    >
                      {label}
                    </Badge>
                  ))}
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Employees are tagged with a payroll category on their profile page. Uncategorized employees are never excluded by this filter.
                </p>
              </div>
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
                <PayrollRosterPreview rulesOverride={segmentLiveRules} defaultExpanded />
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
        onOpenChange={(open) => { if (!open) setAdjustRun(null); }}
        preventOutsideClose
        size="2xl"
        title={`Payslip adjustments${adjustRun ? ` · ${monthLabel(adjustRun.period)}` : ''}`}
        footer={<Button variant="outline" onClick={() => setAdjustRun(null)}>Done</Button>}
      >
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Add a one-off bonus, overtime, allowance or deduction for a specific employee.
              Earnings increase pay (taxable ones also raise PAYE); deductions reduce it.
              <span className="font-medium text-foreground"> Re-generate payslips for this run after editing</span> to apply changes.
            </p>

            {/* Add form */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 rounded-lg border p-3">
              <div className="space-y-1 sm:col-span-2">
                <Label>Employee</Label>
                <Select value={adjustForm.employee_id || undefined} onValueChange={(v) => setAdjustForm((f) => ({ ...f, employee_id: v }))}>
                  <SelectTrigger><SelectValue placeholder="Select an employee" /></SelectTrigger>
                  <SelectContent>
                    {adjustEmployees.map((e) => (
                      <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Amount (₦)</Label>
                <Input
                  type="number" min="0" inputMode="numeric"
                  value={adjustForm.amount}
                  onChange={(e) => setAdjustForm((f) => ({ ...f, amount: e.target.value }))}
                  placeholder="0"
                />
              </div>
              <div className="space-y-1 sm:col-span-2">
                <Label>Description</Label>
                <Input
                  value={adjustForm.description}
                  onChange={(e) => setAdjustForm((f) => ({ ...f, description: e.target.value }))}
                  placeholder="e.g. Performance bonus, Q2"
                />
              </div>
              {adjustForm.kind !== 'deduction' && (
                <label className="sm:col-span-2 flex items-center gap-2 text-sm text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={adjustForm.taxable}
                    onChange={(e) => setAdjustForm((f) => ({ ...f, taxable: e.target.checked }))}
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
                        <span className="capitalize">{a.kind}</span>
                        {a.kind !== 'deduction' && !a.taxable ? ' · non-taxable' : ''} · {a.description}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className={cn('tabular-nums font-semibold', a.kind === 'deduction' ? 'text-destructive' : 'text-success')}>
                        {a.kind === 'deduction' ? '−' : '+'}{formatNaira(Number(a.amount_ngn))}
                      </span>
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => removeAdjustment(a.id)} aria-label="Remove adjustment">
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
          {disburseTarget && (
            <div className="space-y-4">
              <div className="rounded-lg border p-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Period</span>
                  <span className="font-medium">{monthLabel(disburseTarget.run.period)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Employees</span>
                  <span className="font-medium">{disburseTarget.payslips.length}</span>
                </div>
                <div className="flex justify-between text-sm font-semibold">
                  <span>Total disbursement</span>
                  <span className="currency text-success">
                    {formatNaira(disburseTarget.payslips.reduce((s, p) => s + Number(p.net_ngn || 0), 0))}
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
                  <Label htmlFor="payroll-schedule-at">Disburse at</Label>
                  <Input
                    id="payroll-schedule-at"
                    type="datetime-local"
                    value={scheduleAt}
                    min={new Date(Date.now() + 5 * 60 * 1000).toISOString().slice(0, 16)}
                    onChange={(e) => setScheduleAt(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
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
          )}
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
          <p className="text-sm text-muted-foreground leading-relaxed">
            ⚠️ This records that salaries for {confirmPaidRun ? monthLabel(confirmPaidRun.period) : ''} were paid via your bank or another method. No automatic transfer will be made by KDOps. Only confirm if you have already transferred salaries manually.
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
                <span className="text-sm text-muted-foreground">PAYE tax</span>
                <span className="text-sm font-semibold currency tabular-nums">{formatNaira(confirmApproveRun.paye_ngn)}</span>
              </div>
              <div className="flex items-center justify-between px-3.5 py-2.5">
                <span className="text-sm text-muted-foreground">Pension (employee)</span>
                <span className="text-sm font-semibold currency tabular-nums">{formatNaira(confirmApproveRun.pension_ngn)}</span>
              </div>
              <div className="flex items-center justify-between px-3.5 py-3 bg-muted/40">
                <span className="text-sm font-semibold">Total burn this run</span>
                <span className="text-base font-bold currency tabular-nums">{formatNaira(confirmApproveRun.total_burn_ngn)}</span>
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
              <div key={i} className="flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30 px-3.5 py-3">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
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
