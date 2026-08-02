import { useEffect, useMemo, useState } from 'react';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip as ReTooltip, LineChart, Line,
} from 'recharts';
import { Store, Layers, TrendingUp, AlertCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { formatNaira } from '@/lib/format';
import { fetchVendorSpendBoard, type VendorSpendBoard } from '@/lib/vendor-spend';

function formatCompact(n: number): string {
  if (n >= 1_000_000) return `₦${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `₦${(n / 1_000).toFixed(0)}K`;
  return `₦${n.toFixed(0)}`;
}

const BAR_COLORS = ['hsl(var(--primary))', '#3FAE6F', '#dc6b1f', '#6366f1', '#0ea5e9'];

export default function VendorSpendTab() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<VendorSpendBoard | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        setData(await fetchVendorSpendBoard(12));
      } catch (err: any) {
        toast({ title: 'Could not load vendor spend data', description: err?.message, variant: 'destructive' });
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const barData = useMemo(() => {
    if (!data) return [];
    return data.topVendors.slice(0, 10).map((v) => ({
      name: v.vendor.length > 20 ? v.vendor.slice(0, 18) + '…' : v.vendor,
      total: v.total_ngn,
      source: v.source,
    }));
  }, [data]);

  const trendData = useMemo(() => {
    if (!data || data.trends.length === 0) return [];
    const allMonths = new Set<string>();
    data.trends.forEach((t) => t.months.forEach((m) => allMonths.add(m.month)));
    const months = Array.from(allMonths).sort();
    return months.map((month) => {
      const row: Record<string, any> = { month: month.slice(5) };
      data.trends.slice(0, 5).forEach((t) => {
        const point = t.months.find((m) => m.month === month);
        row[t.vendor] = point?.total_ngn ?? 0;
      });
      return row;
    });
  }, [data]);

  const trendVendors = useMemo(() => data?.trends.slice(0, 5).map((t) => t.vendor) ?? [], [data]);

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        Aggregates all expenses and subscriptions by vendor to surface where money goes, month-over-month trends, and consolidation opportunities.
      </p>

      {!data && !loading ? (
        <p className="text-sm text-muted-foreground text-center py-10">No spend data available.</p>
      ) : data ? (
        <>
          {/* ─── KPI strip ─────────────────────────────────────────── */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <Card>
              <CardContent className="pt-4 pb-3">
                <p className="text-xs text-muted-foreground">Total spend (12mo)</p>
                <p className="text-xl font-bold">{formatCompact(data.total_spend_ngn)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-3">
                <p className="text-xs text-muted-foreground">Unique vendors</p>
                <p className="text-xl font-bold">{data.vendor_count}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-3">
                <p className="text-xs text-muted-foreground">Top vendor share</p>
                <p className="text-xl font-bold">
                  {data.topVendors.length > 0 && data.total_spend_ngn > 0
                    ? `${((data.topVendors[0].total_ngn / data.total_spend_ngn) * 100).toFixed(0)}%`
                    : '—'}
                </p>
                <p className="text-[10px] text-muted-foreground truncate">{data.topVendors[0]?.vendor}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-3">
                <p className="text-xs text-muted-foreground">Consolidation opps</p>
                <p className="text-xl font-bold">{data.consolidation.length}</p>
                <p className="text-[10px] text-muted-foreground">categories with 2+ vendors</p>
              </CardContent>
            </Card>
          </div>

          {/* ─── Top vendors bar chart ──────────────────────────────── */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Store className="h-4 w-4 text-primary" /> Top 10 vendors by spend
              </CardTitle>
            </CardHeader>
            <CardContent>
              {barData.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-10">No vendors found.</p>
              ) : (
                <div className="h-[280px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={barData} layout="vertical" margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis type="number" fontSize={11} tickFormatter={(v: number) => formatCompact(v)} />
                      <YAxis type="category" dataKey="name" fontSize={10} width={120} />
                      <ReTooltip formatter={(v: number) => formatNaira(v)} />
                      <Bar dataKey="total" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardContent>
          </Card>

          {/* ─── Spend trends ───────────────────────────────────────── */}
          {trendData.length > 0 && trendVendors.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-primary" /> Monthly spend trend — top 5 vendors
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-[240px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={trendData} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="month" fontSize={11} />
                      <YAxis fontSize={11} tickFormatter={(v: number) => formatCompact(v)} />
                      <ReTooltip formatter={(v: number) => formatNaira(v)} />
                      {trendVendors.map((vendor, i) => (
                        <Line
                          key={vendor}
                          type="monotone"
                          dataKey={vendor}
                          stroke={BAR_COLORS[i % BAR_COLORS.length]}
                          strokeWidth={2}
                          dot={{ r: 3 }}
                        />
                      ))}
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          )}

          {/* ─── Vendor detail table ────────────────────────────────── */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Layers className="h-4 w-4 text-primary" /> All vendors
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>#</TableHead>
                    <TableHead>Vendor</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead className="text-right">Total (12mo)</TableHead>
                    <TableHead className="text-right">Avg / month</TableHead>
                    <TableHead className="text-right">Txns</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.topVendors.slice(0, 15).map((v, i) => (
                    <TableRow key={v.vendor}>
                      <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                      <TableCell className="font-medium">{v.vendor}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-[10px]">
                          {v.source === 'subscription' ? 'Sub' : 'Expense'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">{formatNaira(v.total_ngn)}</TableCell>
                      <TableCell className="text-right text-muted-foreground">{formatNaira(v.avg_monthly_ngn)}</TableCell>
                      <TableCell className="text-right text-muted-foreground">{v.transaction_count}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* ─── Consolidation opportunities ─────────────────────────── */}
          {data.consolidation.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 text-amber-500" /> Consolidation opportunities
                </CardTitle>
                <p className="text-xs text-muted-foreground">
                  Subscription categories with multiple active vendors — could any be consolidated?
                </p>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {data.consolidation.map((c) => (
                    <div key={c.category} className="rounded-lg border p-3">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-sm font-medium capitalize">{c.category}</span>
                        <span className="text-sm font-semibold">{formatNaira(c.combined_monthly_ngn)}<span className="text-xs text-muted-foreground font-normal"> / mo</span></span>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {c.vendors.map((v) => (
                          <Badge key={v} variant="secondary" className="text-xs">{v}</Badge>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </>
      ) : null}
    </div>
  );
}
