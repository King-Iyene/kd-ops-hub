import { Loader2, Briefcase, TrendingUp, AlertTriangle, Plus, FileText, ExternalLink, Download, History, CheckCircle2, XCircle } from 'lucide-react';
import type { EmployeeData, EditSection } from './types';
import { formatDate, formatNaira } from '@/lib/format';
import { roleBadgeClass, roleLabel } from '@/lib/roles';
import { deptBadgeStyle, deptDotStyle } from '@/lib/dept-colors';
import { MaskedAccountNumber } from '@/components/ui-kit/MaskedAccountNumber';
import { BankAccountField, type BankAccountValue } from '@/components/BankAccountField';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';

interface CompensationBreakdown {
  hasSalary: boolean;
  salary: number;
  payeMonthly: number;
  pensionOn: boolean;
  pensionEmployeeMonthly: number;
  avcMonthly: number;
  nhfOn: boolean;
  nhfMonthly: number;
  nhisOn: boolean;
  nhisMonthly: number;
  totalDeductMonthly: number;
  netMonthly: number;
  employerContribMonthly: number;
}

interface Props {
  employee: EmployeeData;
  form: Partial<EmployeeData>;
  patch: (p: Partial<EmployeeData>) => void;
  editingSection: EditSection | null;
  sectionSaving: boolean;
  startEdit: (s: EditSection) => void;
  cancelEdit: () => void;
  saveSection: (label: string, fields: Record<string, any>) => void;
  canManage: boolean;
  comp: CompensationBreakdown;
  onOpenIncrementDialog: () => void;
  // Employment details dropdowns
  departments: Array<{ id: string; name: string }>;
  payGroups: Array<{ id: string; name: string }>;
  managers: Array<{ id: string; full_name: string | null; email: string }>;
  canEditRole: boolean;
  isSelf: boolean;
  assignableRoles: string[];
  // Bank account
  bankEditMode: boolean;
  setBankEditMode: (v: boolean) => void;
  bankDetails: BankAccountValue;
  setBankDetails: (v: BankAccountValue) => void;
  activeProvider: 'paystack' | 'flutterwave';
  bankSaving: boolean;
  saveBank: () => void;
  openBankHistory: () => void;
  bankRequests: any[];
  showBankRequestForm: boolean;
  setShowBankRequestForm: (v: boolean) => void;
  bankRequestDetails: BankAccountValue;
  setBankRequestDetails: (v: BankAccountValue) => void;
  bankRequestReason: string;
  setBankRequestReason: (v: string) => void;
  submittingBankRequest: boolean;
  submitBankChangeRequest: () => void;
  handleApproveBankRequest: (reqId: string) => void;
  setRejectingBankRequest: (id: string) => void;
  setBankRejectReason: (v: string) => void;
  // Payslips
  payslips: any[];
  selectedPayslipId: string;
  setSelectedPayslipId: (v: string) => void;
  previewPayslip: (slip: any) => void;
  downloadPayslip: (slip: any) => void;
  humanPeriod: (period: string | null) => string;
  setActiveTab: (tab: string) => void;
}

export default function JobPayTab({
  employee, form, patch, editingSection, sectionSaving,
  startEdit, cancelEdit, saveSection, canManage, comp,
  onOpenIncrementDialog,
  departments, payGroups, managers, canEditRole, isSelf, assignableRoles,
  bankEditMode, setBankEditMode, bankDetails, setBankDetails,
  activeProvider, bankSaving, saveBank, openBankHistory,
  bankRequests, showBankRequestForm, setShowBankRequestForm,
  bankRequestDetails, setBankRequestDetails,
  bankRequestReason, setBankRequestReason,
  submittingBankRequest, submitBankChangeRequest,
  handleApproveBankRequest, setRejectingBankRequest, setBankRejectReason,
  payslips, selectedPayslipId, setSelectedPayslipId,
  previewPayslip, downloadPayslip, humanPeriod, setActiveTab,
}: Props) {
  const {
    hasSalary, salary, payeMonthly, pensionOn, pensionEmployeeMonthly,
    avcMonthly, nhfOn, nhfMonthly, nhisOn, nhisMonthly,
    totalDeductMonthly, netMonthly, employerContribMonthly,
  } = comp;

  return (
    <div className="mt-4 grid grid-cols-1 lg:grid-cols-5 gap-4">

      {/* ── LEFT column (60%) ─────────────────────────────────────────── */}
      <div className="lg:col-span-3 space-y-4">

        {/* Card 1 — Compensation Breakdown */}
        <Card>
          <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
              Compensation Breakdown
            </CardTitle>
            <div className="flex items-center gap-2">
              {canManage && editingSection !== 'compensation' && (
                <Button size="sm" variant="outline" onClick={() => startEdit('compensation')}>
                  Edit Salary
                </Button>
              )}
              {editingSection === 'compensation' && (
                <>
                  <Button size="sm" variant="ghost" onClick={cancelEdit}>Cancel</Button>
                  <Button
                    size="sm"
                    onClick={() => {
                      const useComps = !!form.use_salary_components;
                      const computedGross = useComps
                        ? (Number(form.basic_ngn || 0)
                          + Number(form.housing_ngn || 0)
                          + Number(form.transport_ngn || 0)
                          + Number(form.other_allowances_ngn || 0))
                        : Number(form.salary_ngn) || 0;
                      saveSection('Compensation', {
                        salary_ngn: computedGross,
                        use_salary_components: useComps,
                        basic_ngn: useComps ? (Number(form.basic_ngn || 0) || null) : null,
                        housing_ngn: useComps ? (Number(form.housing_ngn || 0) || null) : null,
                        transport_ngn: useComps ? (Number(form.transport_ngn || 0) || null) : null,
                        other_allowances_ngn: useComps ? (Number(form.other_allowances_ngn || 0) || null) : null,
                      });
                    }}
                    disabled={sectionSaving}
                  >
                    {sectionSaving && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
                    Save
                  </Button>
                </>
              )}
              {canManage && (
                <Button size="sm" variant="ghost" onClick={onOpenIncrementDialog} title="Log salary change">
                  <Plus className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          </CardHeader>
          {editingSection === 'compensation' && (
            <div className="px-4 pb-4 pt-1 space-y-3">
              <div className="flex items-start gap-3 rounded-lg border bg-muted/30 p-3">
                <Switch
                  checked={!!form.use_salary_components}
                  onCheckedChange={(v) => patch({ use_salary_components: v })}
                />
                <div className="flex-1">
                  <Label className="text-xs font-semibold">Use salary components (Nigerian compliance)</Label>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    When ON, pension (8% / 10%) is calculated on Basic + Housing + Transport (PRA 2014),
                    and NHF (2.5%) on Basic only — instead of full gross. This is the legally correct base.
                    OFF preserves the current flat-gross behavior.
                  </p>
                </div>
              </div>

              {!form.use_salary_components ? (
                <div className="space-y-1.5 max-w-xs">
                  <Label htmlFor="salary_ngn" className="text-xs">Monthly gross salary (₦)</Label>
                  <Input
                    id="salary_ngn"
                    type="number"
                    min={0}
                    value={form.salary_ngn ?? ''}
                    onChange={(e) => patch({ salary_ngn: e.target.value === '' ? 0 : Number(e.target.value) })}
                  />
                  <p className="text-xs text-muted-foreground">
                    Use the + button to log this as a formal salary increment with history.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3 max-w-md">
                  <div className="space-y-1">
                    <Label htmlFor="basic_ngn" className="text-xs">Basic (₦)</Label>
                    <Input
                      id="basic_ngn"
                      type="number" min={0}
                      value={form.basic_ngn ?? ''}
                      onChange={(e) => patch({ basic_ngn: e.target.value === '' ? 0 : Number(e.target.value) })}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="housing_ngn" className="text-xs">Housing (₦)</Label>
                    <Input
                      id="housing_ngn"
                      type="number" min={0}
                      value={form.housing_ngn ?? ''}
                      onChange={(e) => patch({ housing_ngn: e.target.value === '' ? 0 : Number(e.target.value) })}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="transport_ngn" className="text-xs">Transport (₦)</Label>
                    <Input
                      id="transport_ngn"
                      type="number" min={0}
                      value={form.transport_ngn ?? ''}
                      onChange={(e) => patch({ transport_ngn: e.target.value === '' ? 0 : Number(e.target.value) })}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="other_allowances_ngn" className="text-xs">Other Allowances (₦)</Label>
                    <Input
                      id="other_allowances_ngn"
                      type="number" min={0}
                      value={form.other_allowances_ngn ?? ''}
                      onChange={(e) => patch({ other_allowances_ngn: e.target.value === '' ? 0 : Number(e.target.value) })}
                    />
                  </div>
                  <div className="col-span-2 text-[11px] text-muted-foreground border-t pt-2">
                    Computed gross: <span className="font-semibold currency">
                      {formatNaira(
                        (Number(form.basic_ngn || 0) +
                          Number(form.housing_ngn || 0) +
                          Number(form.transport_ngn || 0) +
                          Number(form.other_allowances_ngn || 0))
                      )}
                    </span>
                    {' · Pension base: '}
                    <span className="font-medium currency">
                      {formatNaira(
                        (Number(form.basic_ngn || 0) +
                          Number(form.housing_ngn || 0) +
                          Number(form.transport_ngn || 0))
                      )}
                    </span>
                    {' · NHF base: '}
                    <span className="font-medium currency">{formatNaira(Number(form.basic_ngn || 0))}</span>
                  </div>
                </div>
              )}
            </div>
          )}
          <CardContent className="p-0">
            {!hasSalary ? (
              <div className="mx-4 my-3 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-700">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                No salary set — use Edit Profile to add salary
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40">
                    <TableHead className="pl-4">Title</TableHead>
                    <TableHead className="text-right">Annually</TableHead>
                    <TableHead className="text-right pr-4">Monthly</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow className="font-medium">
                    <TableCell className="pl-4">Gross Pay</TableCell>
                    <TableCell className="text-right currency">{formatNaira(salary * 12)}</TableCell>
                    <TableCell className="text-right pr-4 currency">{formatNaira(salary)}</TableCell>
                  </TableRow>
                  <TableRow className="text-muted-foreground">
                    <TableCell className="pl-4">PAYE Tax</TableCell>
                    <TableCell className="text-right currency">{formatNaira(payeMonthly * 12)}</TableCell>
                    <TableCell className="text-right pr-4 currency">{formatNaira(payeMonthly)}</TableCell>
                  </TableRow>
                  {pensionOn && (
                    <TableRow className="text-muted-foreground">
                      <TableCell className="pl-4">Pension (employee) 8%</TableCell>
                      <TableCell className="text-right currency">{formatNaira(pensionEmployeeMonthly * 12)}</TableCell>
                      <TableCell className="text-right pr-4 currency">{formatNaira(pensionEmployeeMonthly)}</TableCell>
                    </TableRow>
                  )}
                  {avcMonthly > 0 && (
                    <TableRow className="text-muted-foreground">
                      <TableCell className="pl-4">AVC (voluntary pension)</TableCell>
                      <TableCell className="text-right currency">{formatNaira(avcMonthly * 12)}</TableCell>
                      <TableCell className="text-right pr-4 currency">{formatNaira(avcMonthly)}</TableCell>
                    </TableRow>
                  )}
                  {nhfOn && (
                    <TableRow className="text-muted-foreground">
                      <TableCell className="pl-4">NHF 2.5%</TableCell>
                      <TableCell className="text-right currency">{formatNaira(nhfMonthly * 12)}</TableCell>
                      <TableCell className="text-right pr-4 currency">{formatNaira(nhfMonthly)}</TableCell>
                    </TableRow>
                  )}
                  {nhisOn && (
                    <TableRow className="text-muted-foreground">
                      <TableCell className="pl-4">NHIS (5%)</TableCell>
                      <TableCell className="text-right currency">{formatNaira(nhisMonthly * 12)}</TableCell>
                      <TableCell className="text-right pr-4 currency">{formatNaira(nhisMonthly)}</TableCell>
                    </TableRow>
                  )}
                  <TableRow className="text-muted-foreground border-t-2">
                    <TableCell className="pl-4">Total Deductions</TableCell>
                    <TableCell className="text-right currency">{formatNaira(totalDeductMonthly * 12)}</TableCell>
                    <TableCell className="text-right pr-4 currency">{formatNaira(totalDeductMonthly)}</TableCell>
                  </TableRow>
                  <TableRow className="font-bold bg-emerald-50/60">
                    <TableCell className="pl-4 text-base">Net Pay</TableCell>
                    <TableCell className="text-right text-base currency">{formatNaira(netMonthly * 12)}</TableCell>
                    <TableCell className="text-right pr-4 text-base currency">{formatNaira(netMonthly)}</TableCell>
                  </TableRow>
                  {pensionOn && (
                    <TableRow className="text-xs text-muted-foreground bg-muted/10 border-t">
                      <TableCell className="pl-4">Employer Contribution — Pension 10%</TableCell>
                      <TableCell className="text-right currency">{formatNaira(employerContribMonthly * 12)}</TableCell>
                      <TableCell className="text-right pr-4 currency">{formatNaira(employerContribMonthly)}</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Card 2 — Employment Details */}
        <Card>
          <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base flex items-center gap-2">
              <Briefcase className="h-4 w-4 text-muted-foreground" />
              Employment Details
            </CardTitle>
            {canManage && editingSection !== 'employment' && (
              <Button size="sm" variant="outline" onClick={() => startEdit('employment')}>
                Edit
              </Button>
            )}
            {editingSection === 'employment' && (
              <div className="flex gap-2">
                <Button size="sm" variant="ghost" onClick={cancelEdit}>Cancel</Button>
                <Button
                  size="sm"
                  onClick={() => saveSection('Employment details', {
                    department_id: form.department_id || null,
                    role: form.role,
                    job_title: form.job_title || null,
                    employee_number: form.employee_number || null,
                    employment_type: form.employment_type || null,
                    employee_category: form.employee_category || null,
                    pay_group_id: form.pay_group_id || null,
                    start_date: form.start_date || null,
                    annual_leave_days: Math.max(6, form.annual_leave_days ?? 20),
                    notice_period_days: form.notice_period_days ?? 30,
                    status: form.status,
                    reporting_manager_id: form.reporting_manager_id || null,
                    contract_end_date: form.contract_end_date || null,
                    pfa_name: form.pfa_name || null,
                    pfa_code: form.pfa_code || null,
                    state_of_residence: form.state_of_residence || null,
                  })}
                  disabled={sectionSaving}
                >
                  {sectionSaving && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
                  Save
                </Button>
              </div>
            )}
          </CardHeader>
          <CardContent>
            {editingSection === 'employment' ? (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="department_id" className="text-xs">Department</Label>
                    <Select
                      value={form.department_id || ''}
                      onValueChange={(v) => patch({ department_id: v || null })}
                    >
                      <SelectTrigger id="department_id"><SelectValue placeholder="Select…" /></SelectTrigger>
                      <SelectContent>
                        {departments.map((d) => (
                          <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="role" className="text-xs">
                      Role
                      {!canEditRole && (
                        <span className="ml-1 text-muted-foreground font-normal">
                          {isSelf ? '(cannot change your own role)' : '(read-only)'}
                        </span>
                      )}
                    </Label>
                    <Select
                      value={form.role || ''}
                      onValueChange={(v) => patch({ role: v })}
                      disabled={!canEditRole}
                    >
                      <SelectTrigger id="role"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {assignableRoles.map((r) => (
                          <SelectItem key={r} value={r}>
                            {roleLabel(r)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="job_title" className="text-xs">Job title</Label>
                  <Input id="job_title" value={form.job_title || ''} onChange={(e) => patch({ job_title: e.target.value })} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="employee_number" className="text-xs">Employee number</Label>
                    <Input id="employee_number" value={form.employee_number || ''} onChange={(e) => patch({ employee_number: e.target.value || null })} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="employment_type" className="text-xs">Employment type</Label>
                    <Select value={form.employment_type || undefined} onValueChange={(v) => patch({ employment_type: v || null })}>
                      <SelectTrigger id="employment_type"><SelectValue placeholder="Select…" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Full-time">Full-time</SelectItem>
                        <SelectItem value="Part-time">Part-time</SelectItem>
                        <SelectItem value="Contract">Contract</SelectItem>
                        <SelectItem value="Intern">Intern</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="employee_category" className="text-xs">Payroll category</Label>
                    <Select value={form.employee_category || undefined} onValueChange={(v) => patch({ employee_category: v || null })}>
                      <SelectTrigger id="employee_category"><SelectValue placeholder="Uncategorized" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="administrative">Administrative</SelectItem>
                        <SelectItem value="executive">Executive / Director</SelectItem>
                        <SelectItem value="domestic">Domestic staff</SelectItem>
                        <SelectItem value="security">Security</SelectItem>
                        <SelectItem value="contractor">Contractor</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-[11px] text-muted-foreground">Used by payroll segments.</p>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="pay_group_id" className="text-xs">Pay group</Label>
                    <Select
                      value={form.pay_group_id || '__none__'}
                      onValueChange={(v) => patch({ pay_group_id: v === '__none__' ? null : v })}
                    >
                      <SelectTrigger id="pay_group_id"><SelectValue placeholder="No group" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">— No group —</SelectItem>
                        {payGroups.map((g) => (
                          <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-[11px] text-muted-foreground">Pay schedule group (Payroll module).</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="start_date" className="text-xs">Start date</Label>
                    <Input id="start_date" type="date" value={form.start_date || ''} onChange={(e) => patch({ start_date: e.target.value || null })} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="annual_leave_days" className="text-xs">Annual leave days</Label>
                    <Input
                      id="annual_leave_days"
                      type="number"
                      min={6}
                      value={form.annual_leave_days ?? ''}
                      onChange={(e) => {
                        const v = Number(e.target.value);
                        patch({ annual_leave_days: v });
                      }}
                    />
                    {form.annual_leave_days != null && form.annual_leave_days < 6 && (
                      <p className="text-[11px] text-destructive">Labour Act s.18 minimum is 6 working days</p>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="notice_period_days" className="text-xs">Notice period (days)</Label>
                    <Input
                      id="notice_period_days"
                      type="number"
                      min={1}
                      value={form.notice_period_days ?? 30}
                      onChange={(e) => patch({ notice_period_days: Number(e.target.value) || 30 })}
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="status" className="text-xs">Status</Label>
                  <Select value={form.status || undefined} onValueChange={(v) => patch({ status: v })}>
                    <SelectTrigger id="status"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="inactive">Inactive</SelectItem>
                      <SelectItem value="on_leave">On leave</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="reporting_manager_id" className="text-xs">Reports to (manager)</Label>
                    <Select
                      value={form.reporting_manager_id || '__none__'}
                      onValueChange={(v) => patch({ reporting_manager_id: v === '__none__' ? null : v })}
                    >
                      <SelectTrigger id="reporting_manager_id"><SelectValue placeholder="No manager assigned" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">— No manager —</SelectItem>
                        {managers.map((m) => (
                          <SelectItem key={m.id} value={m.id}>
                            {m.full_name || m.email}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="contract_end_date" className="text-xs">Contract end date</Label>
                    <Input
                      id="contract_end_date"
                      type="date"
                      value={form.contract_end_date || ''}
                      onChange={(e) => patch({ contract_end_date: e.target.value || null })}
                      placeholder="dd/mm/yyyy"
                    />
                    <p className="text-[10px] text-muted-foreground">
                      For Contract / Intern roles. Leave blank for permanent staff.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="pfa_name" className="text-xs">Pension Fund Administrator (PFA)</Label>
                    <Input
                      id="pfa_name"
                      value={form.pfa_name || ''}
                      onChange={(e) => patch({ pfa_name: e.target.value || null })}
                      placeholder="e.g. ARM Pension, Stanbic IBTC"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="pfa_code" className="text-xs">PFA code</Label>
                    <Input
                      id="pfa_code"
                      value={form.pfa_code || ''}
                      onChange={(e) => patch({ pfa_code: e.target.value || null })}
                      placeholder="e.g. PENCOM-issued PSSP code"
                    />
                    <p className="text-[10px] text-muted-foreground">
                      Required on the PenCom PSSP schedule export.
                    </p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="state_of_residence" className="text-xs">State of residence</Label>
                    <Select
                      value={form.state_of_residence || '__none__'}
                      onValueChange={(v) => patch({ state_of_residence: v === '__none__' ? null : v })}
                    >
                      <SelectTrigger id="state_of_residence"><SelectValue placeholder="Select state…" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">— Not set —</SelectItem>
                        {[
                          'Abia','Adamawa','Akwa Ibom','Anambra','Bauchi','Bayelsa','Benue','Borno',
                          'Cross River','Delta','Ebonyi','Edo','Ekiti','Enugu','FCT - Abuja','Gombe',
                          'Imo','Jigawa','Kaduna','Kano','Katsina','Kebbi','Kogi','Kwara','Lagos',
                          'Nasarawa','Niger','Ogun','Ondo','Osun','Oyo','Plateau','Rivers','Sokoto',
                          'Taraba','Yobe','Zamfara',
                        ].map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <p className="text-[10px] text-muted-foreground">
                      PAYE is remitted to the State IRS of residence.
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <dl className="space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <dt className="text-muted-foreground">Department</dt>
                  <dd className="font-medium">
                    {(() => {
                      const name =
                        employee.departments?.name
                        ?? departments.find((d) => d.id === employee.department_id)?.name
                        ?? null;
                      if (!name) return '—';
                      return (
                        <span
                          className="inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[11px] font-semibold"
                          style={deptBadgeStyle(name)}
                        >
                          <span
                            className="h-1.5 w-1.5 rounded-full"
                            style={deptDotStyle(name)}
                          />
                          {name}
                        </span>
                      );
                    })()}
                  </dd>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <dt className="text-muted-foreground">Role</dt>
                  <dd><Badge variant="secondary" className={roleBadgeClass(employee.role)}>{roleLabel(employee.role)}</Badge></dd>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <dt className="text-muted-foreground">Job title</dt>
                  <dd className="font-medium">{employee.job_title ?? '—'}</dd>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <dt className="text-muted-foreground">Employee number</dt>
                  <dd className="font-medium font-mono">{employee.employee_number || '—'}</dd>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <dt className="text-muted-foreground">Employment type</dt>
                  <dd>
                    {employee.employment_type ? (
                      <Badge className={cn(
                        'text-xs',
                        employee.employment_type === 'Full-time'
                          ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-100'
                          : employee.employment_type === 'Part-time'
                            ? 'bg-blue-100 text-blue-700 hover:bg-blue-100'
                            : 'bg-amber-100 text-amber-700 hover:bg-amber-100',
                      )}>
                        {employee.employment_type}
                      </Badge>
                    ) : <span className="font-medium">—</span>}
                  </dd>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <dt className="text-muted-foreground">Pay group</dt>
                  <dd className="font-medium">
                    {employee.pay_group_id
                      ? payGroups.find((g) => g.id === employee.pay_group_id)?.name ?? '—'
                      : '—'}
                  </dd>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <dt className="text-muted-foreground">Start date</dt>
                  <dd className="font-medium">{employee.start_date ? formatDate(employee.start_date) : '—'}</dd>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <dt className="text-muted-foreground">Annual leave</dt>
                  <dd className="font-medium">{employee.annual_leave_days ?? 20} days/yr</dd>
                </div>

                <div className="flex items-center justify-between text-sm">
                  <dt className="text-muted-foreground">Reports to</dt>
                  <dd className="font-medium">
                    {(() => {
                      if (!employee.reporting_manager_id) return '—';
                      const m = managers.find((x) => x.id === employee.reporting_manager_id);
                      return m ? (m.full_name || m.email) : '—';
                    })()}
                  </dd>
                </div>
                {employee.contract_end_date && (() => {
                  const daysUntil = Math.ceil((new Date(employee.contract_end_date).getTime() - Date.now()) / 86400000);
                  return (
                    <div className="flex items-center justify-between text-sm">
                      <dt className="text-muted-foreground">Contract ends</dt>
                      <dd className="flex items-center gap-2">
                        <span className="font-medium">{formatDate(employee.contract_end_date)}</span>
                        {daysUntil <= 0 && <Badge variant="destructive" className="text-[10px]">Expired</Badge>}
                        {daysUntil > 0 && daysUntil <= 30 && <Badge className="bg-warning/15 text-warning border-warning/30 text-[10px]">{daysUntil}d left</Badge>}
                      </dd>
                    </div>
                  );
                })()}
                <div className="flex items-center justify-between text-sm">
                  <dt className="text-muted-foreground">PFA</dt>
                  <dd className="font-medium">{employee.pfa_name || '—'}</dd>
                </div>
                {employee.pfa_code && (
                  <div className="flex items-center justify-between text-sm">
                    <dt className="text-muted-foreground">PFA code</dt>
                    <dd className="font-mono text-xs">{employee.pfa_code}</dd>
                  </div>
                )}
                <div className="flex items-center justify-between text-sm">
                  <dt className="text-muted-foreground">State of residence</dt>
                  <dd className="font-medium">{employee.state_of_residence || '—'}</dd>
                </div>
              </dl>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── RIGHT column (40%) ────────────────────────────────────────── */}
      <div className="lg:col-span-2 space-y-4">

        {/* Card 3 — Payment Method */}
        <Card>
          <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base">Payment Method</CardTitle>
            <div className="flex gap-1.5">
              {canManage && !bankEditMode && (
                <Button size="sm" variant="ghost" onClick={openBankHistory} title="View change history">
                  <History className="h-3.5 w-3.5 mr-1" /> History
                </Button>
              )}
              {canManage && !bankEditMode && (
                <Button size="sm" variant="outline" onClick={() => setBankEditMode(true)}>
                  Edit
                </Button>
              )}
              {bankEditMode && (
                <Button size="sm" variant="ghost" onClick={() => setBankEditMode(false)}>
                  Cancel
                </Button>
              )}
              {isSelf && !canManage && !showBankRequestForm && !bankRequests.some(r => r.status === 'pending') && (
                <Button size="sm" variant="outline" onClick={() => setShowBankRequestForm(true)}>
                  Request change
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Admin direct-edit mode */}
            {bankEditMode && (
              <div className="space-y-4">
                <BankAccountField value={bankDetails} onChange={setBankDetails} provider={activeProvider} />
                <div className="flex justify-end">
                  <Button size="sm" onClick={saveBank} disabled={!bankDetails.verified || bankSaving}>
                    {bankSaving && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
                    Save Bank Details
                  </Button>
                </div>
              </div>
            )}

            {/* Current bank details */}
            {!bankEditMode && (employee.bank_name && employee.bank_account_number ? (
              <>
                <dl className="space-y-3">
                  <div className="flex items-center justify-between text-sm">
                    <dt className="text-muted-foreground">Bank name</dt>
                    <dd className="font-medium">{employee.bank_name}</dd>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <dt className="text-muted-foreground">Account number</dt>
                    <dd className="font-medium">
                      <MaskedAccountNumber value={employee.bank_account_number} />
                    </dd>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <dt className="text-muted-foreground">Account name</dt>
                    <dd className="font-medium">{employee.bank_account_name || '—'}</dd>
                  </div>
                </dl>
                <p className="text-xs text-muted-foreground pt-3 border-t">
                  Payouts will be made to this account
                </p>
              </>
            ) : (
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">No payment method on file.</p>
                {canManage && (
                  <button className="text-xs text-primary hover:underline" onClick={() => setBankEditMode(true)}>
                    Add bank account
                  </button>
                )}
              </div>
            ))}

            {/* Pending change requests (visible to admins reviewing this profile) */}
            {canManage && bankRequests.filter(r => r.status === 'pending').length > 0 && (
              <div className="rounded-md border border-amber-200 bg-amber-50 p-3 space-y-3">
                <p className="text-xs font-semibold text-amber-800 uppercase tracking-wide">Pending bank change request</p>
                {bankRequests.filter(r => r.status === 'pending').map((req) => (
                  <div key={req.id} className="space-y-2">
                    <div className="text-sm space-y-1">
                      <div className="flex justify-between"><span className="text-muted-foreground">Bank</span><span className="font-medium">{req.new_bank_name}</span></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">Account</span><MaskedAccountNumber value={req.new_account_number} className="text-xs" /></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">Name</span><span className="font-medium">{req.new_account_name}</span></div>
                      {req.reason && <div className="flex justify-between"><span className="text-muted-foreground">Reason</span><span className="italic text-xs max-w-[60%] text-right">{req.reason}</span></div>}
                    </div>
                    <div className="flex gap-2 pt-1">
                      <Button size="sm" variant="outline" className="flex-1 text-destructive border-destructive/40 hover:bg-destructive/5" onClick={() => { setRejectingBankRequest(req.id); setBankRejectReason(''); }}>
                        <XCircle className="h-3.5 w-3.5 mr-1" /> Reject
                      </Button>
                      <Button size="sm" className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => handleApproveBankRequest(req.id)}>
                        <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Approve
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Employee's own request-change form */}
            {isSelf && !canManage && showBankRequestForm && (
              <div className="rounded-md border p-3 space-y-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Request account change</p>
                <BankAccountField value={bankRequestDetails} onChange={setBankRequestDetails} provider={activeProvider} />
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">Reason (optional)</label>
                  <textarea
                    className="w-full text-xs rounded-md border bg-background px-3 py-2 min-h-[60px] resize-none focus:outline-none focus:ring-1 focus:ring-ring"
                    placeholder="Why are you changing your bank account?"
                    value={bankRequestReason}
                    onChange={(e) => setBankRequestReason(e.target.value)}
                  />
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="ghost" onClick={() => setShowBankRequestForm(false)} className="flex-1">Cancel</Button>
                  <Button size="sm" className="flex-1" onClick={submitBankChangeRequest} disabled={!bankRequestDetails.verified || submittingBankRequest}>
                    {submittingBankRequest && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}
                    Submit request
                  </Button>
                </div>
                <p className="text-[11px] text-muted-foreground">An admin will review and apply this change. Your current account stays active until then.</p>
              </div>
            )}

            {/* Pending badge for self */}
            {isSelf && !canManage && bankRequests.some(r => r.status === 'pending') && (
              <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                Your bank account change request is <strong>pending admin review</strong>.
              </div>
            )}
          </CardContent>
        </Card>

        {/* Card 4 — Payslips quick access */}
        <Card>
          <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base flex items-center gap-2">
              <FileText className="h-4 w-4 text-muted-foreground" />
              Payslips
            </CardTitle>
            <button
              onClick={() => setActiveTab('payroll')}
              className="text-xs text-primary hover:underline"
            >
              View all
            </button>
          </CardHeader>
          <CardContent>
            {payslips.length === 0 ? (
              <p className="text-sm text-muted-foreground">No payslips yet.</p>
            ) : (
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="select_payslip" className="text-xs">Select payslip</Label>
                  <Select
                    value={selectedPayslipId || payslips[0]?.id}
                    onValueChange={setSelectedPayslipId}
                  >
                    <SelectTrigger id="select_payslip"><SelectValue placeholder="Choose period" /></SelectTrigger>
                    <SelectContent>
                      {payslips.map((p: any) => (
                        <SelectItem key={p.id} value={p.id}>{humanPeriod(p.period) || formatDate(p.created_at)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="flex-1 gap-1.5"
                    onClick={() => {
                      const slip = payslips.find((p: any) => p.id === (selectedPayslipId || payslips[0]?.id));
                      if (slip) previewPayslip(slip);
                    }}
                  >
                    <ExternalLink className="h-3.5 w-3.5" /> Preview
                  </Button>
                  <Button
                    size="sm"
                    className="flex-1 gap-1.5"
                    onClick={() => {
                      const slip = payslips.find((p: any) => p.id === (selectedPayslipId || payslips[0]?.id));
                      if (slip) downloadPayslip(slip);
                    }}
                  >
                    <Download className="h-3.5 w-3.5" /> Download
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
