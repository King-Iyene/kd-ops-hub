import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis,
  CartesianGrid, Tooltip as ReTooltip, Legend,
} from 'recharts';
import { SERIES, GRID, AXIS_TICK, fmtMillions, ChartTooltip } from '@/lib/chart-theme';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { formatNaira, formatNairaCompact } from '@/lib/format';
import { cn } from '@/lib/utils';
import { supabase } from '@/lib/supabase';
import {
  Beaker, Plus, Trash2, TrendingUp, TrendingDown, Users,
  DollarSign, Building2, AlertTriangle,
} from 'lucide-react';

interface ForecastWeek {
  week: string;
  base: number;
  scenario: number;
}

interface Adjustment {
  id: string;
  type: 'hire' | 'terminate' | 'revenue_change' | 'one_time_cost' | 'subscription' | 'salary_raise';
  label: string;
  monthlyImpact: number;
  startWeek: number;
  durationWeeks: number;
}

const ADJUSTMENT_TYPES = [
  { value: 'hire',           label: 'New hire',           icon: Users,        sign: -1 },
  { value: 'terminate',      label: 'Terminate role',     icon: Users,        sign: 1  },
  { value: 'revenue_change', label: 'Revenue change',     icon: TrendingUp,   sign: 1  },
  { value: 'one_time_cost',  label: 'One-time cost',      icon: DollarSign,   sign: -1 },
  { value: 'subscription',   label: 'New subscription',   icon: Building2,    sign: -1 },
  { value: 'salary_raise',   label: 'Salary raise',       icon: TrendingUp,   sign: -1 },
] as const;

type AdjustmentType = typeof ADJUSTMENT_TYPES[number]['value'];

const defaultAdj = (): Adjustment => ({
  id: crypto.randomUUID(),
  type: 'hire',
  label: '',
  monthlyImpact: 0,
  startWeek: 1,
  durationWeeks: 52,
});

export default function ScenarioPlannerTab() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [baseForecast, setBaseForecast] = useState<{ week: string; balance: number }[]>([]);
  const [cashOnHand, setCashOnHand] = useState(0);
  const [netBurn, setNetBurn] = useState(0);
  const [adjustments, setAdjustments] = useState<Adjustment[]>([]);
  const [horizonWeeks, setHorizonWeeks] = useState(26);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const [snapRes, forecastRes, settingsRes] = await Promise.all([
          supabase
            .from('cash_balance_snapshots' as any)
            .select('balance_ngn')
            .order('snapshot_date', { ascending: false })
            .limit(1)
            .maybeSingle(),
          supabase.rpc('forecast_cashflow', { p_weeks: 52 } as any),
          supabase
            .from('company_settings')
            .select('monthly_revenue_estimate_ngn')
            .eq('id', '00000000-0000-0000-0000-000000000001')
            .maybeSingle(),
        ]);

        const balance = (snapRes.data as any)?.balance_ngn ?? 0;
        setCashOnHand(balance);

        const forecast = ((forecastRes.data ?? []) as any[]).map((row: any) => ({
          week: row.week_label ?? row.week_start,
          balance: Number(row.projected_balance ?? 0),
        }));
        setBaseForecast(forecast);

        const monthlyRev = (settingsRes.data as any)?.monthly_revenue_estimate_ngn ?? 0;
        const weeklyBurn = forecast.length >= 2
          ? (forecast[0].balance - forecast[forecast.length - 1].balance) / forecast.length
          : 0;
        setNetBurn(weeklyBurn > 0 ? weeklyBurn : monthlyRev / 4.33);
      } catch (err: any) {
        toast({ title: 'Could not load forecast data', description: err?.message, variant: 'destructive' });
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const addAdjustment = useCallback(() => {
    setAdjustments(prev => [...prev, defaultAdj()]);
  }, []);

  const removeAdjustment = useCallback((id: string) => {
    setAdjustments(prev => prev.filter(a => a.id !== id));
  }, []);

  const updateAdjustment = useCallback((id: string, patch: Partial<Adjustment>) => {
    setAdjustments(prev => prev.map(a => a.id === id ? { ...a, ...patch } : a));
  }, []);

  const chartData = useMemo((): ForecastWeek[] => {
    const weeks = baseForecast.slice(0, horizonWeeks);
    if (weeks.length === 0) return [];

    return weeks.map((w, i) => {
      let scenarioDelta = 0;
      for (const adj of adjustments) {
        if (i >= adj.startWeek - 1 && i < adj.startWeek - 1 + adj.durationWeeks) {
          const typeDef = ADJUSTMENT_TYPES.find(t => t.value === adj.type);
          const weeklyAmount = adj.monthlyImpact / 4.33;
          scenarioDelta += weeklyAmount * (typeDef?.sign ?? -1) * (i - adj.startWeek + 2);
        }
      }
      return {
        week: w.week,
        base: w.balance,
        scenario: w.balance + scenarioDelta,
      };
    });
  }, [baseForecast, adjustments, horizonWeeks]);

  const scenarioRunway = useMemo(() => {
    if (chartData.length === 0) return null;
    const zeroWeek = chartData.findIndex(d => d.scenario <= 0);
    return zeroWeek === -1 ? null : zeroWeek;
  }, [chartData]);

  const baseRunway = useMemo(() => {
    if (chartData.length === 0) return null;
    const zeroWeek = chartData.findIndex(d => d.base <= 0);
    return zeroWeek === -1 ? null : zeroWeek;
  }, [chartData]);

  const totalMonthlyImpact = useMemo(() => {
    return adjustments.reduce((sum, adj) => {
      const typeDef = ADJUSTMENT_TYPES.find(t => t.value === adj.type);
      return sum + adj.monthlyImpact * (typeDef?.sign ?? -1);
    }, 0);
  }, [adjustments]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-sm text-muted-foreground">
        Loading scenario planner…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* KPI strip */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground">Cash on Hand</p>
            <p className="text-lg font-bold">{formatNairaCompact(cashOnHand)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground">Base Runway</p>
            <p className="text-lg font-bold">
              {baseRunway !== null ? `${baseRunway} weeks` : `${horizonWeeks}+ weeks`}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground">Scenario Runway</p>
            <p className={cn('text-lg font-bold', scenarioRunway !== null && 'text-destructive')}>
              {adjustments.length === 0
                ? '—'
                : scenarioRunway !== null
                  ? `${scenarioRunway} weeks`
                  : `${horizonWeeks}+ weeks`}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground">Monthly Impact</p>
            <p className={cn('text-lg font-bold', totalMonthlyImpact < 0 ? 'text-destructive' : 'text-emerald-600')}>
              {totalMonthlyImpact >= 0 ? '+' : ''}{formatNairaCompact(totalMonthlyImpact)}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Adjustments builder */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm flex items-center gap-2">
              <Beaker className="h-4 w-4 text-primary" />
              What-If Adjustments
            </CardTitle>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-2">
                <Label className="text-xs text-muted-foreground whitespace-nowrap">Horizon</Label>
                <Select value={String(horizonWeeks)} onValueChange={v => setHorizonWeeks(Number(v))}>
                  <SelectTrigger className="w-24 h-8"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="12">12 weeks</SelectItem>
                    <SelectItem value="26">26 weeks</SelectItem>
                    <SelectItem value="39">39 weeks</SelectItem>
                    <SelectItem value="52">52 weeks</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button size="sm" onClick={addAdjustment}>
                <Plus className="h-3.5 w-3.5 mr-1" /> Add
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {adjustments.length === 0 ? (
            <div className="text-center py-8 text-sm text-muted-foreground">
              <Beaker className="h-8 w-8 mx-auto mb-2 opacity-40" />
              <p>Add adjustments to model scenarios.</p>
              <p className="text-xs mt-1">Try "What if we hire 3 engineers?" or "What if we lose a key client?"</p>
            </div>
          ) : (
            <div className="space-y-3">
              {adjustments.map(adj => {
                const typeDef = ADJUSTMENT_TYPES.find(t => t.value === adj.type);
                const Icon = typeDef?.icon ?? DollarSign;
                return (
                  <div key={adj.id} className="flex flex-wrap items-end gap-2 p-3 rounded-lg border bg-muted/30">
                    <div className="space-y-1 min-w-[140px]">
                      <Label className="text-[11px]">Type</Label>
                      <Select
                        value={adj.type}
                        onValueChange={(v) => updateAdjustment(adj.id, { type: v as AdjustmentType })}
                      >
                        <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {ADJUSTMENT_TYPES.map(t => (
                            <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1 flex-1 min-w-[140px]">
                      <Label className="text-[11px]">Description</Label>
                      <Input
                        className="h-8"
                        placeholder="e.g. Senior engineer"
                        value={adj.label}
                        onChange={e => updateAdjustment(adj.id, { label: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1 w-[130px]">
                      <Label className="text-[11px]">Monthly amount (₦)</Label>
                      <Input
                        className="h-8"
                        type="number"
                        value={adj.monthlyImpact || ''}
                        onChange={e => updateAdjustment(adj.id, { monthlyImpact: Number(e.target.value) })}
                      />
                    </div>
                    <div className="space-y-1 w-[90px]">
                      <Label className="text-[11px]">Start week</Label>
                      <Input
                        className="h-8"
                        type="number"
                        min={1}
                        max={horizonWeeks}
                        value={adj.startWeek}
                        onChange={e => updateAdjustment(adj.id, { startWeek: Number(e.target.value) })}
                      />
                    </div>
                    <div className="space-y-1 w-[90px]">
                      <Label className="text-[11px]">Duration</Label>
                      <Input
                        className="h-8"
                        type="number"
                        min={1}
                        max={52}
                        value={adj.durationWeeks}
                        onChange={e => updateAdjustment(adj.id, { durationWeeks: Number(e.target.value) })}
                      />
                    </div>
                    <Button size="icon" variant="ghost" className="h-8 w-8" aria-label="Remove adjustment" onClick={() => removeAdjustment(adj.id)}>
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Chart */}
      {chartData.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-primary" />
              Cash Projection — Base vs. Scenario
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[320px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="baseGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={SERIES[0]} stopOpacity={0.15} />
                      <stop offset="100%" stopColor={SERIES[0]} stopOpacity={0.02} />
                    </linearGradient>
                    <linearGradient id="scenarioGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={SERIES[3]} stopOpacity={0.2} />
                      <stop offset="100%" stopColor={SERIES[3]} stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid {...GRID} />
                  <XAxis dataKey="week" {...AXIS_TICK} interval="preserveStartEnd" />
                  <YAxis {...AXIS_TICK} tickFormatter={fmtMillions} />
                  <ReTooltip content={<ChartTooltip formatter={(v: number) => formatNaira(v)} />} />
                  <Legend />
                  <Area
                    name="Base forecast"
                    type="monotone"
                    dataKey="base"
                    stroke={SERIES[0]}
                    strokeWidth={2}
                    fill="url(#baseGrad)"
                  />
                  {adjustments.length > 0 && (
                    <Area
                      name="Scenario"
                      type="monotone"
                      dataKey="scenario"
                      stroke={SERIES[3]}
                      strokeWidth={2}
                      strokeDasharray="6 3"
                      fill="url(#scenarioGrad)"
                    />
                  )}
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Impact summary */}
      {adjustments.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              Scenario Impact Summary
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Adjustment</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Monthly</TableHead>
                  <TableHead className="text-right">Annual</TableHead>
                  <TableHead>Timing</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {adjustments.map(adj => {
                  const typeDef = ADJUSTMENT_TYPES.find(t => t.value === adj.type);
                  const signed = adj.monthlyImpact * (typeDef?.sign ?? -1);
                  return (
                    <TableRow key={adj.id}>
                      <TableCell className="font-medium">{adj.label || 'Untitled'}</TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="text-[10px]">{typeDef?.label}</Badge>
                      </TableCell>
                      <TableCell className={cn('text-right font-medium', signed < 0 ? 'text-destructive' : 'text-emerald-600')}>
                        {signed >= 0 ? '+' : ''}{formatNairaCompact(signed)}
                      </TableCell>
                      <TableCell className={cn('text-right', signed < 0 ? 'text-destructive' : 'text-emerald-600')}>
                        {signed >= 0 ? '+' : ''}{formatNairaCompact(signed * 12)}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        Week {adj.startWeek} → {adj.startWeek + adj.durationWeeks - 1}
                      </TableCell>
                    </TableRow>
                  );
                })}
                <TableRow className="font-bold">
                  <TableCell colSpan={2}>Total</TableCell>
                  <TableCell className={cn('text-right', totalMonthlyImpact < 0 ? 'text-destructive' : 'text-emerald-600')}>
                    {totalMonthlyImpact >= 0 ? '+' : ''}{formatNairaCompact(totalMonthlyImpact)}
                  </TableCell>
                  <TableCell className={cn('text-right', totalMonthlyImpact < 0 ? 'text-destructive' : 'text-emerald-600')}>
                    {totalMonthlyImpact >= 0 ? '+' : ''}{formatNairaCompact(totalMonthlyImpact * 12)}
                  </TableCell>
                  <TableCell />
                </TableRow>
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
