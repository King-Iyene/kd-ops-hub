import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as ChartTooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { ChartGradients, GlassTooltip, axisTick, chartAnim, chartTheme } from '@/components/ChartKit';
import { formatNaira, formatNairaCompact } from '@/lib/format';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

interface AnnualSummaryTabProps {
  summaryYear: number;
  setSummaryYear: (y: number) => void;
  availableYears: number[];
  annualSummary: {
    byMonth: {
      label: string;
      gross: number;
      paye: number;
      pension: number;
      nhf: number;
      contractors: number;
      burn: number;
      headcount: number;
      status: string;
    }[];
    totals: {
      gross: number;
      paye: number;
      pension: number;
      nhf: number;
      contractors: number;
      burn: number;
    };
  };
}

export const AnnualSummaryTab = ({ summaryYear, setSummaryYear, availableYears, annualSummary }: AnnualSummaryTabProps) => {
  return (
    <>
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <h2 className="text-lg font-semibold">Payroll Summary — {summaryYear}</h2>
            <div className="flex gap-2">
              {availableYears.map((y) => (
                <Button
                  key={y}
                  size="sm"
                  variant={y === summaryYear ? 'default' : 'outline'}
                  onClick={() => setSummaryYear(y)}
                >
                  {y}
                </Button>
              ))}
            </div>
          </div>

          {annualSummary.totals.burn > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Month-by-month breakdown</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={annualSummary.byMonth} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                    <ChartGradients />
                    <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.gridLine} vertical={false} />
                    <XAxis dataKey="label" tick={axisTick} axisLine={false} tickLine={false} />
                    <YAxis tickFormatter={(v) => formatNairaCompact(v)} tick={axisTick} axisLine={false} tickLine={false} />
                    <ChartTooltip
                      content={<GlassTooltip />}
                      formatter={(v: number) => formatNaira(v)}
                      cursor={{ fill: chartTheme.primary, fillOpacity: 0.06 }}
                    />
                    <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                    <Bar dataKey="gross" fill="url(#kd-grad-primary)" name="Gross salary" stackId="a" radius={[0, 0, 0, 0]} {...chartAnim} />
                    <Bar dataKey="contractors" fill={chartTheme.secondary} name="Contractors" stackId="a" radius={[4, 4, 0, 0]} {...chartAnim} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardContent className="pt-6">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Month</TableHead>
                      <TableHead className="text-right">Headcount</TableHead>
                      <TableHead className="text-right">Gross salary</TableHead>
                      <TableHead className="text-right">PAYE</TableHead>
                      <TableHead className="text-right">Pension</TableHead>
                      <TableHead className="text-right">NHF</TableHead>
                      <TableHead className="text-right">Contractors</TableHead>
                      <TableHead className="text-right">Total burn</TableHead>
                      <TableHead className="text-center">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {annualSummary.byMonth.map((m) => (
                      <TableRow key={m.label} className={m.status === 'none' ? 'opacity-40' : ''}>
                        <TableCell className="font-medium">{m.label}</TableCell>
                        <TableCell className="text-right tabular-nums">{m.headcount || '—'}</TableCell>
                        <TableCell className="text-right tabular-nums currency">{m.gross > 0 ? formatNaira(m.gross) : '—'}</TableCell>
                        <TableCell className="text-right tabular-nums currency">{m.paye > 0 ? formatNaira(m.paye) : '—'}</TableCell>
                        <TableCell className="text-right tabular-nums currency">{m.pension > 0 ? formatNaira(m.pension) : '—'}</TableCell>
                        <TableCell className="text-right tabular-nums currency">{m.nhf > 0 ? formatNaira(m.nhf) : '—'}</TableCell>
                        <TableCell className="text-right tabular-nums currency">{m.contractors > 0 ? formatNaira(m.contractors) : '—'}</TableCell>
                        <TableCell className="text-right tabular-nums currency font-semibold">{m.burn > 0 ? formatNaira(m.burn) : '—'}</TableCell>
                        <TableCell className="text-center">
                          {m.status === 'paid' && <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100 text-[10px]">Paid</Badge>}
                          {m.status === 'pending' && <Badge variant="outline" className="text-[10px]">Pending</Badge>}
                        </TableCell>
                      </TableRow>
                    ))}
                    <TableRow className="font-bold border-t-2 bg-muted/30">
                      <TableCell>Total ({summaryYear})</TableCell>
                      <TableCell className="text-right">—</TableCell>
                      <TableCell className="text-right tabular-nums currency">{formatNaira(annualSummary.totals.gross)}</TableCell>
                      <TableCell className="text-right tabular-nums currency">{formatNaira(annualSummary.totals.paye)}</TableCell>
                      <TableCell className="text-right tabular-nums currency">{formatNaira(annualSummary.totals.pension)}</TableCell>
                      <TableCell className="text-right tabular-nums currency">{formatNaira(annualSummary.totals.nhf)}</TableCell>
                      <TableCell className="text-right tabular-nums currency">{formatNaira(annualSummary.totals.contractors)}</TableCell>
                      <TableCell className="text-right tabular-nums currency">{formatNaira(annualSummary.totals.burn)}</TableCell>
                      <TableCell />
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
    </>
  );
};
