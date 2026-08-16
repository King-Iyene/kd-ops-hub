import { useEffect, useMemo, useState } from 'react';
import {
  ResponsiveContainer, AreaChart, Area, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip as ReTooltip, ReferenceLine, Cell,
} from 'recharts';
import { SERIES, GRID, AXIS_TICK, fmtMillions, ChartTooltip } from '@/lib/chart-theme';
import { CalendarRange, AlertOctagon, Receipt, PhoneCall } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Tooltip as UiTooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@/components/ui/tooltip';
import { MobileCard, MobileCardHeader, MobileCardTitle, MobileCardMeta, MobileCardRow } from '@/components/ui-kit/MobileCard';
import { useToast } from '@/hooks/use-toast';
import { formatNaira, formatNairaCompact, formatDate } from '@/lib/format';
import { cn } from '@/lib/utils';
import {
  fetchCashTimingBoard,
  topCollectionTargets,
  AGING_BUCKET_LABEL,
  type CashTimingBoard,
} from '@/lib/cash-timing';

const RISK_TONE: Record<string, { tone: string; label: string; dot: string }> = {
  safe:     { tone: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30', label: 'Safe',     dot: '#3FAE6F' },
  tight:    { tone: 'bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30',          label: 'Tight',    dot: '#D6AC50' },
  critical: { tone: 'bg-destructive/15 text-destructive border-destructive/30',                        label: 'Critical', dot: '#dc2626' },
};

const BUCKET_COLOR: Record<string, string> = {
  not_due: '#94a3b8',
  '1-30': '#D6AC50',
  '31-60': '#e08e2f',
  '61-90': '#dc6b1f',
  '90+': '#dc2626',
};

export default function CashTimingTab() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [board, setBoard] = useState<CashTimingBoard | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        setBoard(await fetchCashTimingBoard(13));
      } catch (err: any) {
        toast({ title: 'Could not load cash timing', description: err?.message, variant: 'destructive' });
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const chartData = useMemo(() => {
    if (!board) return [];
    return board.timing.map((t) => ({
      label: t.week_start.slice(5),
      balance: Math.round(t.projected_balance_ngn),
      risk: t.risk,
      advice: t.advice,
    }));
  }, [board]);

  const flaggedWeeks = useMemo(
    () => (board ? board.timing.filter((t) => t.risk !== 'safe') : []),
    [board],
  );

  const agingChartData = useMemo(
    () => (board ? board.aging.buckets.map((b) => ({ bucket: AGING_BUCKET_LABEL[b.bucket], key: b.bucket, total: b.total_ngn, count: b.count })) : []),
    [board],
  );

  const collectionTargets = useMemo(
    () => (board ? topCollectionTargets(board.aging.rows, 8) : []),
    [board],
  );

  const overdue90Plus = board?.aging.buckets.find((b) => b.bucket === '90+');

  return (
    <div className="space-y-6">
      {/* ─── 13-week cash position ─────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <CalendarRange className="h-4 w-4 text-primary" /> 13-week cash position
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Projected balance with a pay/hold signal per week — same forecast engine as Cash Flow, read as a payment-timing decision.
          </p>
        </CardHeader>
        <CardContent>
          {chartData.length === 0 && !loading ? (
            <p className="text-sm text-muted-foreground text-center py-12">
              No forecast data yet. Set cash on hand in Settings → Company and try again.
            </p>
          ) : (
            <>
              <div className="h-[240px] mb-3">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="balGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={SERIES[0]} stopOpacity={0.12} />
                        <stop offset="100%" stopColor={SERIES[0]} stopOpacity={0.01} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid {...GRID} />
                    <XAxis dataKey="label" {...AXIS_TICK} />
                    <YAxis {...AXIS_TICK} tickFormatter={fmtMillions} />
                    <ReTooltip content={<ChartTooltip valueFormatter={formatNaira} />} />
                    <ReferenceLine y={0} stroke="#e34948" strokeOpacity={0.5} />
                    <Area type="monotone" dataKey="balance" name="Projected balance" stroke={SERIES[0]} strokeWidth={2} fill="url(#balGrad)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
              <TooltipProvider>
                <div className="flex flex-wrap gap-1.5">
                  {chartData.map((w, i) => (
                    <UiTooltip key={i}>
                      <TooltipTrigger asChild>
                        <div
                          className="h-2.5 flex-1 min-w-[16px] rounded-full cursor-default"
                          style={{ backgroundColor: RISK_TONE[w.risk].dot }}
                        />
                      </TooltipTrigger>
                      <TooltipContent className="max-w-[260px]">
                        <p className="text-xs font-medium">Week of {w.label}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{w.advice}</p>
                      </TooltipContent>
                    </UiTooltip>
                  ))}
                </div>
              </TooltipProvider>
            </>
          )}
        </CardContent>
      </Card>

      {/* ─── Payment timing signal ──────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <AlertOctagon className="h-4 w-4 text-amber-600" /> Payment timing signal
          </CardTitle>
          <p className="text-xs text-muted-foreground">Weeks that need a decision before releasing discretionary payments.</p>
        </CardHeader>
        <CardContent>
          {flaggedWeeks.length === 0 && !loading ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              All {board?.timing.length ?? 0} forecast weeks are safe — no timing adjustments needed.
            </p>
          ) : (
            <div className="space-y-2">
              {flaggedWeeks.map((w) => (
                <div key={w.week_start} className="flex items-start justify-between gap-3 rounded-md border px-3 py-2.5">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">Week of {w.week_start}</span>
                      <Badge variant="outline" className={cn('text-[10px]', RISK_TONE[w.risk].tone)}>{RISK_TONE[w.risk].label}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">{w.advice}</p>
                  </div>
                  <p className="text-sm font-medium whitespace-nowrap">{formatNairaCompact(w.projected_balance_ngn)}</p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ─── Invoice aging ───────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Receipt className="h-4 w-4 text-primary" /> Invoice aging
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            {formatNaira(board?.aging.total_outstanding_ngn ?? 0)} outstanding across {board?.aging.rows.length ?? 0} invoices
            {overdue90Plus && overdue90Plus.count > 0 && (
              <span className="text-destructive font-medium"> · {overdue90Plus.count} over 90 days</span>
            )}
          </p>
        </CardHeader>
        <CardContent>
          {(board?.aging.rows.length ?? 0) === 0 && !loading ? (
            <p className="text-sm text-muted-foreground text-center py-10">No outstanding invoices — collections are current.</p>
          ) : (
            <>
              <div className="h-[180px] mb-4">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={agingChartData} margin={{ top: 4, right: 16, left: 0, bottom: 0 }} barSize={20}>
                    <CartesianGrid {...GRID} />
                    <XAxis dataKey="bucket" {...AXIS_TICK} />
                    <YAxis {...AXIS_TICK} tickFormatter={fmtMillions} />
                    <ReTooltip content={<ChartTooltip valueFormatter={formatNaira} />} cursor={{ fill: 'currentColor', fillOpacity: 0.04 }} />
                    <Bar dataKey="total" name="Outstanding" radius={[4, 4, 0, 0]}>
                      {agingChartData.map((d, i) => <Cell key={i} fill={BUCKET_COLOR[d.key]} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {collectionTargets.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1.5">
                    <PhoneCall className="h-3.5 w-3.5" /> Top collection targets
                  </p>
                  <div className="hidden md:block overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Invoice</TableHead>
                          <TableHead>Client</TableHead>
                          <TableHead>Due</TableHead>
                          <TableHead>Aging</TableHead>
                          <TableHead className="text-right">Amount</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {collectionTargets.map((r) => (
                          <TableRow key={r.id}>
                            <TableCell className="font-medium">{r.invoice_number}</TableCell>
                            <TableCell className="text-muted-foreground">{r.client_name}</TableCell>
                            <TableCell className="text-muted-foreground">{formatDate(r.due_date)}</TableCell>
                            <TableCell>
                              <Badge variant="outline" style={{ color: BUCKET_COLOR[r.bucket], borderColor: BUCKET_COLOR[r.bucket] + '55' }}>
                                {r.days_overdue}d overdue
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right font-medium currency">{formatNaira(r.total_ngn)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>

                  {/* Mobile card list — same data, thumb-friendly */}
                  <div className="md:hidden space-y-2">
                    {collectionTargets.map((r) => (
                      <MobileCard key={r.id}>
                        <MobileCardHeader>
                          <MobileCardTitle>{r.invoice_number}</MobileCardTitle>
                          <MobileCardMeta className="currency">{formatNaira(r.total_ngn)}</MobileCardMeta>
                        </MobileCardHeader>
                        <MobileCardRow label="Client">{r.client_name}</MobileCardRow>
                        <MobileCardRow label="Due">{formatDate(r.due_date)}</MobileCardRow>
                        <MobileCardRow label="Aging">
                          <Badge variant="outline" style={{ color: BUCKET_COLOR[r.bucket], borderColor: BUCKET_COLOR[r.bucket] + '55' }}>
                            {r.days_overdue}d overdue
                          </Badge>
                        </MobileCardRow>
                      </MobileCard>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
