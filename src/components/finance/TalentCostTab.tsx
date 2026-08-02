import { useEffect, useMemo, useState } from 'react';
import {
  ResponsiveContainer, ComposedChart, Bar, Scatter, XAxis, YAxis,
  CartesianGrid, Tooltip as ReTooltip,
} from 'recharts';
import { Users2, UserMinus, Rows3, Info } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Tooltip as UiTooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@/components/ui/tooltip';
import { useToast } from '@/hooks/use-toast';
import { formatNaira, formatNairaCompact, formatDate } from '@/lib/format';
import { cn } from '@/lib/utils';
import {
  fetchTerminationRecords,
  computeAttritionCost,
  fetchCostComparison,
  fetchCompensationBands,
  type TerminationRecord,
  type CostComparisonResult,
  type CompensationBand,
} from '@/lib/talent-cost';

const TERMINATION_TYPE_LABEL: Record<string, string> = {
  resignation: 'Resignation', dismissal: 'Dismissal', redundancy: 'Redundancy',
  retirement: 'Retirement', end_of_contract: 'End of contract', other: 'Other',
};

export default function TalentCostTab() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [terminations, setTerminations] = useState<TerminationRecord[]>([]);
  const [comparison, setComparison] = useState<CostComparisonResult | null>(null);
  const [bands, setBands] = useState<CompensationBand[]>([]);
  const [replacementMonths, setReplacementMonths] = useState([3]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const [termsRes, cmpRes, bandsRes] = await Promise.all([
          fetchTerminationRecords(12),
          fetchCostComparison(),
          fetchCompensationBands(),
        ]);
        setTerminations(termsRes);
        setComparison(cmpRes);
        setBands(bandsRes);
      } catch (err: any) {
        toast({ title: 'Could not load talent cost data', description: err?.message, variant: 'destructive' });
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const attrition = useMemo(
    () => terminations.map((t) => computeAttritionCost(t, replacementMonths[0])),
    [terminations, replacementMonths],
  );
  const totalAttritionCost = attrition.reduce((s, a) => s + a.total_cost_ngn, 0);

  const bandChartData = useMemo(
    () => bands.map((b) => ({
      name: b.department_name,
      base: b.min_ngn,
      range: b.max_ngn - b.min_ngn,
      median: b.median_ngn,
      min: b.min_ngn,
      max: b.max_ngn,
      headcount: b.headcount,
    })),
    [bands],
  );

  return (
    <div className="space-y-6">
      {/* ─── Contractor vs employee cost comparison ────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Users2 className="h-4 w-4 text-primary" /> Contractor vs employee cost
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Employee cost is fully loaded (gross + employer pension 10% + NSITF 1%). Contractor cost is
            raw pay — contractors carry no statutory employer cost.
          </p>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="rounded-lg border p-4">
              <p className="text-xs text-muted-foreground">Avg. employee cost / mo</p>
              <p className="text-xl font-bold mt-1">{formatNaira(comparison?.employee_avg_monthly_cost_ngn ?? 0)}</p>
              <p className="text-xs text-muted-foreground mt-1">{comparison?.employee_count ?? 0} active employees</p>
            </div>
            <div className="rounded-lg border p-4">
              <p className="text-xs text-muted-foreground">Avg. contractor cost / mo</p>
              <p className="text-xl font-bold mt-1">{formatNaira(comparison?.contractor_avg_monthly_cost_ngn ?? 0)}</p>
              <p className="text-xs text-muted-foreground mt-1">{comparison?.contractor_count ?? 0} active contractors</p>
            </div>
            <div className="rounded-lg border p-4">
              <p className="text-xs text-muted-foreground">Employee : contractor ratio</p>
              <p className="text-xl font-bold mt-1">
                {comparison?.employee_to_contractor_ratio == null ? '—' : `${comparison.employee_to_contractor_ratio.toFixed(2)}×`}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {comparison?.employee_to_contractor_ratio == null
                  ? 'Need both employees and contractors to compare'
                  : comparison.employee_to_contractor_ratio > 1
                    ? 'An employee costs more than a contractor, on average'
                    : 'A contractor costs more than an employee, on average'}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ─── Compensation bands ─────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Rows3 className="h-4 w-4 text-primary" /> Compensation bands by department
          </CardTitle>
          <p className="text-xs text-muted-foreground">Min → max monthly salary range, with the median marked.</p>
        </CardHeader>
        <CardContent>
          {bandChartData.length === 0 && !loading ? (
            <p className="text-sm text-muted-foreground text-center py-10">No salaried employees found yet.</p>
          ) : (
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={bandChartData} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" fontSize={11} />
                  <YAxis fontSize={11} tickFormatter={(v: number) => `₦${(v / 1_000_000).toFixed(1)}M`} />
                  <ReTooltip
                    formatter={(value: number, name: string, props: any) => {
                      if (name === 'range') return [formatNaira(props.payload.min) + ' – ' + formatNaira(props.payload.max), 'Range'];
                      if (name === 'median') return [formatNaira(value), 'Median'];
                      return [formatNaira(value), name];
                    }}
                  />
                  <Bar dataKey="base" stackId="band" fill="transparent" />
                  <Bar dataKey="range" stackId="band" fill="hsl(var(--primary) / 0.35)" radius={[4, 4, 4, 4]} />
                  <Scatter dataKey="median" fill="hsl(var(--primary))" />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          )}
          {bands.length > 0 && (
            <div className="overflow-x-auto mt-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Department</TableHead>
                    <TableHead className="text-right">Headcount</TableHead>
                    <TableHead className="text-right">Min</TableHead>
                    <TableHead className="text-right">Median</TableHead>
                    <TableHead className="text-right">Max</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {bands.map((b) => (
                    <TableRow key={b.department_id ?? 'none'}>
                      <TableCell className="font-medium">{b.department_name}</TableCell>
                      <TableCell className="text-right">{b.headcount}</TableCell>
                      <TableCell className="text-right">{formatNaira(b.min_ngn)}</TableCell>
                      <TableCell className="text-right font-medium">{formatNaira(b.median_ngn)}</TableCell>
                      <TableCell className="text-right">{formatNaira(b.max_ngn)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ─── Attrition cost calculator ──────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <UserMinus className="h-4 w-4 text-destructive" /> Attrition cost — last 12 months
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Recorded final settlement + a modeled backfill cost. KDOps doesn't track real
            recruiting spend yet, so the backfill figure is an assumption you control below.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4 max-w-md">
            <Label className="text-xs whitespace-nowrap flex items-center gap-1">
              Backfill assumption
              <TooltipProvider>
                <UiTooltip>
                  <TooltipTrigger asChild><Info className="h-3.5 w-3.5 text-muted-foreground" /></TooltipTrigger>
                  <TooltipContent className="max-w-[240px]">
                    Months of the departed employee's gross salary used to model vacancy + hiring
                    cost. Adjust to match your real backfill experience.
                  </TooltipContent>
                </UiTooltip>
              </TooltipProvider>
            </Label>
            <Slider min={0} max={12} step={1} value={replacementMonths} onValueChange={setReplacementMonths} className="flex-1" />
            <span className="text-sm font-medium w-16 text-right">{replacementMonths[0]} mo</span>
          </div>

          <p className="text-sm">
            Total modeled cost of attrition: <span className="font-semibold">{formatNaira(totalAttritionCost)}</span>
            {attrition.length > 0 && (
              <span className="text-muted-foreground"> across {attrition.length} exit{attrition.length === 1 ? '' : 's'}</span>
            )}
          </p>

          {attrition.length === 0 && !loading ? (
            <p className="text-sm text-muted-foreground text-center py-10">No completed exits in the last 12 months.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Employee</TableHead>
                    <TableHead>Department</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Last day</TableHead>
                    <TableHead className="text-right">Tenure</TableHead>
                    <TableHead className="text-right">Settlement</TableHead>
                    <TableHead className="text-right">Est. backfill</TableHead>
                    <TableHead className="text-right">Total cost</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {attrition.map((a) => (
                    <TableRow key={a.id}>
                      <TableCell className="font-medium">{a.employee_name}</TableCell>
                      <TableCell className="text-muted-foreground">{a.department_name}</TableCell>
                      <TableCell><Badge variant="outline">{TERMINATION_TYPE_LABEL[a.termination_type] ?? a.termination_type}</Badge></TableCell>
                      <TableCell className="text-muted-foreground">{a.last_working_day ? formatDate(a.last_working_day) : '—'}</TableCell>
                      <TableCell className="text-right">{a.tenure_months == null ? '—' : `${(a.tenure_months / 12).toFixed(1)}y`}</TableCell>
                      <TableCell className="text-right">{formatNaira(a.final_settlement_ngn)}</TableCell>
                      <TableCell className="text-right text-muted-foreground">{formatNairaCompact(a.estimated_backfill_cost_ngn)}</TableCell>
                      <TableCell className="text-right font-medium">{formatNaira(a.total_cost_ngn)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
