import { useEffect, useMemo, useState } from 'react';
import { Plus, X, TrendingUp, TrendingDown, Sparkles, RotateCcw, PiggyBank } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  MobileCard,
  MobileCardHeader,
  MobileCardTitle,
  MobileCardMeta,
  MobileCardRow,
} from '@/components/ui-kit/MobileCard';
import { useToast } from '@/hooks/use-toast';
import { formatNaira, formatDate } from '@/lib/format';
import { cn } from '@/lib/utils';
import {
  fetchSalaryChangeHistory,
  fetchScenarioBaseline,
  computeHeadcountScenario,
  fetchPayrollBudgetVsActual,
  type SalaryChangeImpact,
  type ScenarioAction,
  type ScenarioResult,
  type PayrollBudgetRow,
} from '@/lib/cost-intelligence';
import type { CostableEmployee } from '@/lib/cfo-dashboard';

type DraftType = 'hire' | 'raise' | 'remove';

const ALL_DEPARTMENTS = '__all__';

export default function CostIntelligenceTab() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [changes, setChanges] = useState<SalaryChangeImpact[]>([]);
  const [budgetRows, setBudgetRows] = useState<PayrollBudgetRow[]>([]);
  const [baseline, setBaseline] = useState<{
    employees: CostableEmployee[];
    departments: { id: string; name: string }[];
    includeNsitf: boolean;
  } | null>(null);
  const [actions, setActions] = useState<ScenarioAction[]>([]);

  const [draftType, setDraftType] = useState<DraftType>('hire');
  const [draftDept, setDraftDept] = useState<string>(ALL_DEPARTMENTS);
  const [draftCount, setDraftCount] = useState('1');
  const [draftSalary, setDraftSalary] = useState('300000');
  const [draftPct, setDraftPct] = useState('10');

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const [changesRes, budgetRes, baselineRes] = await Promise.all([
          fetchSalaryChangeHistory(12),
          fetchPayrollBudgetVsActual(12),
          fetchScenarioBaseline(),
        ]);
        setChanges(changesRes);
        setBudgetRows(budgetRes);
        setBaseline(baselineRes);
      } catch (err: any) {
        toast({ title: 'Could not load cost intelligence', description: err?.message, variant: 'destructive' });
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const scenario: ScenarioResult | null = useMemo(() => {
    if (!baseline) return null;
    return computeHeadcountScenario(baseline.employees, baseline.departments, actions, baseline.includeNsitf);
  }, [baseline, actions]);

  const deptName = (id: string) => baseline?.departments.find((d) => d.id === id)?.name ?? 'All departments';

  const addAction = () => {
    const dept = draftDept === ALL_DEPARTMENTS ? null : draftDept;
    if (draftType === 'hire') {
      const count = Math.max(1, parseInt(draftCount, 10) || 0);
      const salary = Math.max(0, parseInt(draftSalary, 10) || 0);
      setActions((a) => [...a, {
        type: 'hire', department_id: dept, count, avg_salary_ngn: salary,
        label: `Hire ${count} in ${deptName(dept ?? ALL_DEPARTMENTS)} @ ${formatNaira(salary)}/mo`,
      }]);
    } else if (draftType === 'raise') {
      const pct = parseFloat(draftPct) || 0;
      setActions((a) => [...a, {
        type: 'raise', department_id: dept, pct_increase: pct,
        label: `${pct >= 0 ? '+' : ''}${pct}% — ${deptName(dept ?? ALL_DEPARTMENTS)}`,
      }]);
    } else {
      const count = Math.max(1, parseInt(draftCount, 10) || 0);
      setActions((a) => [...a, {
        type: 'remove', department_id: dept, count,
        label: `Remove ${count} from ${deptName(dept ?? ALL_DEPARTMENTS)}`,
      }]);
    }
  };

  const removeAction = (idx: number) => setActions((a) => a.filter((_, i) => i !== idx));

  return (
    <div className="space-y-6">
      {/* ─── What-if headcount planner ────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" /> What-if headcount planner
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Model a hire, a raise, or a headcount cut before it happens. Uses the same cost math as
            the dashboard above, so the preview matches what would actually land on payroll.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 items-end">
            <div className="space-y-1.5">
              <Label className="text-xs">Action</Label>
              <Select value={draftType} onValueChange={(v) => setDraftType(v as DraftType)}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="hire">Hire</SelectItem>
                  <SelectItem value="raise">Raise</SelectItem>
                  <SelectItem value="remove">Remove</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Department</Label>
              <Select value={draftDept} onValueChange={setDraftDept}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_DEPARTMENTS}>All departments</SelectItem>
                  {baseline?.departments.map((d) => (
                    <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {draftType === 'hire' && (
              <>
                <div className="space-y-1.5">
                  <Label className="text-xs">Headcount</Label>
                  <Input className="h-9" type="number" min={1} value={draftCount} onChange={(e) => setDraftCount(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Avg. monthly salary (₦)</Label>
                  <Input className="h-9" type="number" min={0} value={draftSalary} onChange={(e) => setDraftSalary(e.target.value)} />
                </div>
              </>
            )}
            {draftType === 'raise' && (
              <div className="space-y-1.5 col-span-2">
                <Label className="text-xs">Increase (%)</Label>
                <Input className="h-9" type="number" value={draftPct} onChange={(e) => setDraftPct(e.target.value)} />
              </div>
            )}
            {draftType === 'remove' && (
              <div className="space-y-1.5 col-span-2">
                <Label className="text-xs">Headcount to remove</Label>
                <Input className="h-9" type="number" min={1} value={draftCount} onChange={(e) => setDraftCount(e.target.value)} />
              </div>
            )}
            <Button size="sm" onClick={addAction} className="h-9">
              <Plus className="h-4 w-4 mr-1" /> Add to scenario
            </Button>
          </div>

          {actions.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {actions.map((a, idx) => (
                <Badge key={idx} variant="outline" className="pl-2.5 pr-1 py-1 gap-1.5 text-xs font-normal">
                  {a.label}
                  <button
                    type="button"
                    onClick={() => removeAction(idx)}
                    className="hover:bg-muted rounded-full p-0.5"
                    aria-label="Remove action"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
              <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={() => setActions([])}>
                <RotateCcw className="h-3 w-3 mr-1" /> Clear all
              </Button>
            </div>
          )}

          {scenario && actions.length > 0 && (
            <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div>
                  <p className="text-xs text-muted-foreground">Headcount</p>
                  <p className="text-lg font-semibold">
                    {scenario.baseline_headcount} → {scenario.scenario_headcount}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Current CTC / mo</p>
                  <p className="text-lg font-semibold currency">{formatNaira(scenario.baseline_ctc_ngn)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Scenario CTC / mo</p>
                  <p className="text-lg font-semibold currency">{formatNaira(scenario.scenario_ctc_ngn)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Monthly impact</p>
                  <p className={cn(
                    'text-lg font-semibold flex items-center gap-1 currency',
                    scenario.delta_ctc_ngn >= 0 ? 'text-destructive' : 'text-emerald-600',
                  )}>
                    {scenario.delta_ctc_ngn >= 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
                    {scenario.delta_ctc_ngn >= 0 ? '+' : ''}{formatNaira(scenario.delta_ctc_ngn)}
                    {scenario.delta_pct != null && (
                      <span className="text-xs font-normal text-muted-foreground">
                        ({scenario.delta_pct >= 0 ? '+' : ''}{scenario.delta_pct.toFixed(1)}%)
                      </span>
                    )}
                  </p>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Annualized impact: <span className="font-medium text-foreground currency">
                  {scenario.delta_ctc_ngn >= 0 ? '+' : ''}{formatNaira(scenario.delta_ctc_ngn * 12)}/yr
                </span>
              </p>
              <div className="hidden md:block overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Department</TableHead>
                      <TableHead className="text-right">Current</TableHead>
                      <TableHead className="text-right">Scenario</TableHead>
                      <TableHead className="text-right">Change</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {scenario.by_department.filter((d) => d.baseline_ctc_ngn !== 0 || d.scenario_ctc_ngn !== 0).map((d) => (
                      <TableRow key={d.department_id ?? 'none'}>
                        <TableCell className="font-medium">{d.department_name}</TableCell>
                        <TableCell className="text-right currency">{formatNaira(d.baseline_ctc_ngn)}</TableCell>
                        <TableCell className="text-right currency">{formatNaira(d.scenario_ctc_ngn)}</TableCell>
                        <TableCell className={cn(
                          'text-right font-medium currency',
                          d.delta_ctc_ngn > 0 ? 'text-destructive' : d.delta_ctc_ngn < 0 ? 'text-emerald-600' : '',
                        )}>
                          {d.delta_ctc_ngn === 0 ? '—' : `${d.delta_ctc_ngn > 0 ? '+' : ''}${formatNaira(d.delta_ctc_ngn)}`}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Mobile card list — same data, thumb-friendly */}
              <div className="md:hidden space-y-2">
                {scenario.by_department.filter((d) => d.baseline_ctc_ngn !== 0 || d.scenario_ctc_ngn !== 0).map((d) => (
                  <MobileCard key={d.department_id ?? 'none'}>
                    <MobileCardHeader>
                      <MobileCardTitle>{d.department_name}</MobileCardTitle>
                      <MobileCardMeta
                        className={cn(
                          'currency',
                          d.delta_ctc_ngn > 0 ? 'text-destructive' : d.delta_ctc_ngn < 0 ? 'text-emerald-600' : '',
                        )}
                      >
                        {d.delta_ctc_ngn === 0 ? '—' : `${d.delta_ctc_ngn > 0 ? '+' : ''}${formatNaira(d.delta_ctc_ngn)}`}
                      </MobileCardMeta>
                    </MobileCardHeader>
                    <MobileCardRow label="Current">{formatNaira(d.baseline_ctc_ngn)}</MobileCardRow>
                    <MobileCardRow label="Scenario">{formatNaira(d.scenario_ctc_ngn)}</MobileCardRow>
                  </MobileCard>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ─── Salary change audit trail ──────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Salary change audit trail</CardTitle>
          <p className="text-xs text-muted-foreground">Last 12 months — every raise or cut, with its fully-loaded cost impact.</p>
        </CardHeader>
        <CardContent>
          {changes.length === 0 && !loading ? (
            <p className="text-sm text-muted-foreground text-center py-10">No salary changes recorded in the last 12 months.</p>
          ) : (
            <>
            <div className="hidden md:block overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Employee</TableHead>
                    <TableHead>Department</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead className="text-right">Old → New</TableHead>
                    <TableHead className="text-right">Monthly Δ</TableHead>
                    <TableHead className="text-right">Fully-loaded annual Δ</TableHead>
                    <TableHead>Reason</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {changes.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className="font-medium">{c.employee_name}</TableCell>
                      <TableCell className="text-muted-foreground">{c.department_name}</TableCell>
                      <TableCell className="text-muted-foreground">{formatDate(c.effective_date)}</TableCell>
                      <TableCell className="text-right text-xs currency">
                        {formatNaira(c.old_salary_ngn)} → {formatNaira(c.new_salary_ngn)}
                      </TableCell>
                      <TableCell className={cn(
                        'text-right font-medium currency',
                        c.direction === 'increase' ? 'text-destructive' : c.direction === 'decrease' ? 'text-emerald-600' : '',
                      )}>
                        {c.direction === 'unchanged' ? '—' : `${c.monthly_delta_ngn > 0 ? '+' : ''}${formatNaira(c.monthly_delta_ngn)}`}
                        {c.pct_change != null && c.direction !== 'unchanged' && (
                          <span className="text-xs text-muted-foreground ml-1">
                            ({c.pct_change >= 0 ? '+' : ''}{c.pct_change.toFixed(1)}%)
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-right currency">
                        {c.direction === 'unchanged' ? '—' : `${c.fully_loaded_annual_delta_ngn > 0 ? '+' : ''}${formatNaira(c.fully_loaded_annual_delta_ngn)}`}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-xs max-w-[200px] truncate">{c.reason ?? '—'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* Mobile card list — same data, thumb-friendly */}
            <div className="md:hidden space-y-2">
              {changes.map((c) => (
                <MobileCard key={c.id}>
                  <MobileCardHeader>
                    <MobileCardTitle>{c.employee_name}</MobileCardTitle>
                    <MobileCardMeta
                      className={cn(
                        'currency',
                        c.direction === 'increase' ? 'text-destructive' : c.direction === 'decrease' ? 'text-emerald-600' : '',
                      )}
                    >
                      {c.direction === 'unchanged' ? '—' : `${c.monthly_delta_ngn > 0 ? '+' : ''}${formatNaira(c.monthly_delta_ngn)}`}
                    </MobileCardMeta>
                  </MobileCardHeader>
                  <MobileCardRow label="Department">{c.department_name}</MobileCardRow>
                  <MobileCardRow label="Date">{formatDate(c.effective_date)}</MobileCardRow>
                  <MobileCardRow label="Old → New">
                    {formatNaira(c.old_salary_ngn)} → {formatNaira(c.new_salary_ngn)}
                  </MobileCardRow>
                  <MobileCardRow label="Fully-loaded annual Δ">
                    {c.direction === 'unchanged' ? '—' : `${c.fully_loaded_annual_delta_ngn > 0 ? '+' : ''}${formatNaira(c.fully_loaded_annual_delta_ngn)}`}
                  </MobileCardRow>
                  <MobileCardRow label="Reason">{c.reason ?? '—'}</MobileCardRow>
                </MobileCard>
              ))}
            </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* ─── Payroll budget vs actual ───────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <PiggyBank className="h-4 w-4 text-primary" /> Payroll budget vs actual
          </CardTitle>
          <p className="text-xs text-muted-foreground">Budgets with a payroll/salary line item, compared to real payroll run totals for the same period.</p>
        </CardHeader>
        <CardContent className="space-y-3">
          {budgetRows.length === 0 && !loading ? (
            <p className="text-sm text-muted-foreground text-center py-10">No budgets with a payroll line item found.</p>
          ) : (
            budgetRows.map((b) => (
              <div key={b.budget_id} className="space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium">{b.name}</span>
                  <span className="text-muted-foreground currency">
                    {formatNaira(b.actual_ngn)} / {formatNaira(b.planned_ngn)}
                    {b.utilization_pct != null && ` (${b.utilization_pct.toFixed(0)}%)`}
                  </span>
                </div>
                <div className="h-2 rounded-full bg-muted overflow-hidden">
                  <div
                    className={cn('h-full rounded-full kd-transition', (b.utilization_pct ?? 0) > 100 ? 'bg-destructive' : 'bg-primary')}
                    style={{ width: `${Math.min(100, b.utilization_pct ?? 0)}%` }}
                  />
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
