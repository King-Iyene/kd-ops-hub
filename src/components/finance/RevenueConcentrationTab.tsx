import { useEffect, useMemo, useState } from 'react';
import {
  ResponsiveContainer, PieChart, Pie, Cell, Tooltip as ReTooltip,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
} from 'recharts';
import { ChartGradients, GlassTooltip, chartTheme, axisTick, chartAnim } from '@/components/ChartKit';
import { PieChart as PieChartIcon, AlertTriangle, ShieldCheck, ShieldAlert } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { formatNaira } from '@/lib/format';
import { cn } from '@/lib/utils';
import { MobileCard, MobileCardHeader, MobileCardTitle, MobileCardMeta, MobileCardRow } from '@/components/ui-kit/MobileCard';
import { errorMessage } from '@/lib/db-errors';
import { fetchRevenueConcentration, type ConcentrationResult, type ConcentrationBand } from '@/lib/revenue-concentration';
import { SERIES, fmtCompact } from '@/lib/chart-theme';

const BAND_STYLE: Record<ConcentrationBand, { tone: string; label: string; Icon: typeof ShieldCheck }> = {
  diversified:   { tone: 'bg-success/15 text-success border-success/30',   label: 'Diversified',   Icon: ShieldCheck },
  moderate:      { tone: 'bg-warning/15 text-warning border-warning/30',   label: 'Moderate risk', Icon: AlertTriangle },
  concentrated:  { tone: 'bg-destructive/15 text-destructive border-destructive/30',  label: 'Concentrated',  Icon: ShieldAlert },
};

const PIE_DEEMPHASIS = '#d4d3cd';

export default function RevenueConcentrationTab() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<ConcentrationResult | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        setData(await fetchRevenueConcentration(12));
      } catch (err: unknown) {
        toast({ title: 'Could not load revenue concentration', description: errorMessage(err), variant: 'destructive' });
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pieData = useMemo(() => {
    if (!data || data.clients.length === 0) return [];
    const top = data.clients.slice(0, 6);
    const rest = data.clients.slice(6);
    const result = top.map((c) => ({ name: c.client_name, value: c.total_ngn }));
    if (rest.length > 0) {
      result.push({ name: `${rest.length} others`, value: rest.reduce((s, c) => s + c.total_ngn, 0) });
    }
    return result;
  }, [data]);

  const barData = useMemo(() => {
    if (!data) return [];
    return data.clients.slice(0, 10).map((c) => ({
      name: c.client_name.length > 18 ? c.client_name.slice(0, 16) + '…' : c.client_name,
      revenue: c.total_ngn,
      share: c.share_pct,
    }));
  }, [data]);

  const band = data ? BAND_STYLE[data.band] : null;

  return (
    <div className="space-y-3 sm:space-y-6">
      <p className="text-sm text-muted-foreground">
        Revenue concentration measures how dependent the business is on its top clients. High concentration increases risk — losing one large client could destabilise cash flow.
      </p>

      {!data && !loading ? (
        <p className="text-sm text-muted-foreground text-center py-10">No invoice data available for concentration analysis.</p>
      ) : data && data.client_count === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-10">No invoiced revenue found in the last 12 months.</p>
      ) : data ? (
        <>
          {/* ─── HHI headline ──────────────────────────────────────── */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <Card>
              <CardContent className="pt-4 pb-3">
                <p className="text-xs text-muted-foreground">HHI Score</p>
                <p className="text-2xl font-bold">{data.hhi.toLocaleString()}</p>
                {band && (
                  <Badge variant="outline" className={cn('mt-1', band.tone)}>
                    <band.Icon className="h-3 w-3 mr-1" />
                    {band.label}
                  </Badge>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-3">
                <p className="text-xs text-muted-foreground">Top client share</p>
                <p className="text-2xl font-bold">{data.top_client_pct != null ? `${data.top_client_pct.toFixed(1)}%` : '—'}</p>
                <p className="text-3xs text-muted-foreground">{data.clients[0]?.client_name}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-3">
                <p className="text-xs text-muted-foreground">Top 3 share</p>
                <p className="text-2xl font-bold">{data.top3_pct != null ? `${data.top3_pct.toFixed(1)}%` : '—'}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-3">
                <p className="text-xs text-muted-foreground">Active clients</p>
                <p className="text-2xl font-bold">{data.client_count}</p>
                <p className="text-3xs text-muted-foreground">12-month trailing</p>
              </CardContent>
            </Card>
          </div>

          {/* ─── Charts ────────────────────────────────────────────── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <PieChartIcon className="h-4 w-4 text-primary" /> Revenue share
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-x-4 gap-y-1 mb-2">
                  {pieData.map((d, i) => (
                    <div key={d.name} className="flex items-center gap-1.5 text-2xs text-muted-foreground">
                      <span
                        className="w-2 h-2 rounded-[2px] shrink-0"
                        style={{ background: i < SERIES.length ? SERIES[i] : PIE_DEEMPHASIS }}
                      />
                      {d.name}
                    </div>
                  ))}
                </div>
                <div className="h-[260px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <ChartGradients />
                      <Pie
                        data={pieData}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        innerRadius={52}
                        outerRadius={90}
                        paddingAngle={2}
                        strokeWidth={0}
                        {...chartAnim}
                      >
                        {pieData.map((_, i) => (
                          <Cell key={i} fill={i < SERIES.length ? SERIES[i] : PIE_DEEMPHASIS} />
                        ))}
                      </Pie>
                      <ReTooltip content={<GlassTooltip formatter={(v: number) => formatNaira(v)} />} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Top 10 clients by revenue</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-[310px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={barData} layout="vertical" margin={{ top: 4, right: 16, left: 0, bottom: 0 }} barSize={14}>
                      <ChartGradients />
                      <CartesianGrid stroke={chartTheme.gridLine} strokeDasharray="3 3" horizontal={false} vertical />
                      <XAxis type="number" tick={axisTick} axisLine={false} tickLine={false} tickFormatter={(v: number) => fmtCompact(v)} />
                      <YAxis type="category" dataKey="name" tick={axisTick} axisLine={false} tickLine={false} width={100} />
                      <ReTooltip content={<GlassTooltip formatter={(v: number) => formatNaira(v)} />} cursor={{ fill: 'currentColor', fillOpacity: 0.04 }} />
                      <Bar dataKey="revenue" name="Revenue" fill="url(#kd-grad-primary)" radius={[0, 6, 6, 0]} {...chartAnim} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* ─── Client detail table ───────────────────────────────── */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Client revenue breakdown — last 12 months</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="hidden md:block overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>#</TableHead>
                    <TableHead>Client</TableHead>
                    <TableHead className="text-right">Revenue</TableHead>
                    <TableHead className="text-right">Share</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.clients.slice(0, 15).map((c, i) => (
                    <TableRow key={c.client_id}>
                      <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                      <TableCell className="font-medium">{c.client_name}</TableCell>
                      <TableCell className="text-right currency">{formatNaira(c.total_ngn)}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <div className="w-16 h-1.5 rounded-full bg-muted overflow-hidden">
                            <div className="h-full rounded-full" style={{ width: `${Math.min(100, c.share_pct)}%`, background: SERIES[0] }} />
                          </div>
                          <span className="text-muted-foreground text-xs w-12 text-right tabular-nums">{c.share_pct.toFixed(1)}%</span>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              </div>
              <div className="md:hidden space-y-2">
                {data.clients.slice(0, 15).map((c) => (
                  <MobileCard key={c.client_id}>
                    <MobileCardHeader>
                      <MobileCardTitle>{c.client_name}</MobileCardTitle>
                      <MobileCardMeta>{formatNaira(c.total_ngn)}</MobileCardMeta>
                    </MobileCardHeader>
                    <MobileCardRow label="Share">{c.share_pct.toFixed(1)}%</MobileCardRow>
                  </MobileCard>
                ))}
              </div>
              {data.clients.length > 15 && (
                <p className="text-xs text-muted-foreground text-center mt-2">
                  + {data.clients.length - 15} more clients not shown
                </p>
              )}
            </CardContent>
          </Card>

          {/* ─── HHI interpretation ────────────────────────────────── */}
          <Card>
            <CardContent className="pt-6">
              <div className="text-sm space-y-2">
                <p className="font-semibold">About the Herfindahl-Hirschman Index (HHI)</p>
                <p className="text-muted-foreground">
                  HHI sums the squared market shares of each client. It ranges from near 0 (many clients, each with a tiny share)
                  to 10,000 (one client with 100% of revenue). Regulators and investors use the same scale:
                </p>
                <ul className="space-y-1 text-muted-foreground">
                  <li className="flex items-center gap-2"><Badge variant="outline" className="bg-success/15 text-success border-success/30 text-3xs">{'< 1,500'}</Badge> Diversified — low client risk</li>
                  <li className="flex items-center gap-2"><Badge variant="outline" className="bg-warning/15 text-warning border-warning/30 text-3xs">1,500–2,500</Badge> Moderate concentration</li>
                  <li className="flex items-center gap-2"><Badge variant="outline" className="bg-destructive/15 text-destructive border-destructive/30 text-3xs">{'> 2,500'}</Badge> Highly concentrated — diversify revenue sources</li>
                </ul>
              </div>
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
}
