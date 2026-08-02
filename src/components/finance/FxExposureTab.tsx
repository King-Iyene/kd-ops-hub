import { useEffect, useMemo, useState } from 'react';
import {
  ResponsiveContainer, LineChart, Line, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip as ReTooltip, Cell,
} from 'recharts';
import { Coins, Activity, Info } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tooltip as UiTooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@/components/ui/tooltip';
import { useToast } from '@/hooks/use-toast';
import { formatDate } from '@/lib/format';
import { fetchFxExposureBoard, type FxExposureBoard } from '@/lib/fx-exposure';

function formatRate(rate: number | null): string {
  if (rate == null) return '—';
  return `₦${rate.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatNgn(n: number): string {
  return `₦${n.toLocaleString('en-NG', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

export default function FxExposureTab() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [board, setBoard] = useState<FxExposureBoard | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        setBoard(await fetchFxExposureBoard(90));
      } catch (err: any) {
        toast({ title: 'Could not load FX exposure', description: err?.message, variant: 'destructive' });
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const trendData = useMemo(
    () => (board ? board.history.map((h) => ({ label: h.valid_from.slice(0, 10).slice(5), rate: h.rate })) : []),
    [board],
  );

  const sensitivityData = useMemo(
    () => (board ? board.usdExposure.sensitivity.map((s) => ({
      label: s.rate_change_pct === 0 ? 'Current' : `${s.rate_change_pct > 0 ? '+' : ''}${s.rate_change_pct}%`,
      monthly_ngn: Math.round(s.monthly_ngn),
      shock: s.rate_change_pct,
    })) : []),
    [board],
  );

  return (
    <div className="space-y-6">
      {/* ─── FX rate trend & volatility ─────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Activity className="h-4 w-4 text-primary" /> USD/NGN rate — 90 days
          </CardTitle>
          <p className="text-xs text-muted-foreground">From the FX rate ledger (Settings → FX Rates). Superseded rates are included so the trend is continuous.</p>
        </CardHeader>
        <CardContent>
          {trendData.length === 0 && !loading ? (
            <p className="text-sm text-muted-foreground text-center py-10">No FX rate history yet.</p>
          ) : (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
                <div>
                  <p className="text-xs text-muted-foreground">Current rate</p>
                  <p className="text-lg font-semibold">{formatRate(board?.volatility.current_rate ?? null)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">90-day range</p>
                  <p className="text-lg font-semibold">
                    {formatRate(board?.volatility.min_rate ?? null)} – {formatRate(board?.volatility.max_rate ?? null)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    Range volatility
                    <TooltipProvider>
                      <UiTooltip>
                        <TooltipTrigger asChild><Info className="h-3 w-3" /></TooltipTrigger>
                        <TooltipContent className="max-w-[220px]">(max − min) ÷ average over the window — a simple spread indicator, not annualized volatility.</TooltipContent>
                      </UiTooltip>
                    </TooltipProvider>
                  </p>
                  <p className="text-lg font-semibold">
                    {board?.volatility.range_volatility_pct == null ? '—' : `${board.volatility.range_volatility_pct.toFixed(1)}%`}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Largest single move</p>
                  <p className="text-lg font-semibold">
                    {board?.volatility.largest_single_move_pct == null ? '—' : `${board.volatility.largest_single_move_pct.toFixed(1)}%`}
                  </p>
                  <p className="text-[10px] text-muted-foreground">Auto-review threshold: {board?.deviationThresholdPct ?? 5}%</p>
                </div>
              </div>
              <div className="h-[220px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={trendData} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="label" fontSize={11} />
                    <YAxis fontSize={11} domain={['auto', 'auto']} tickFormatter={(v: number) => `₦${v.toFixed(0)}`} />
                    <ReTooltip formatter={(v: number) => formatRate(v)} labelFormatter={(l: string) => `On ${l}`} />
                    <Line type="stepAfter" dataKey="rate" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* ─── USD obligation exposure ─────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Coins className="h-4 w-4 text-primary" /> Partner pay — rate sensitivity
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            {board?.usdExposure.active_partner_count ?? 0} active USD-paid contractors — what a rate swing does to the monthly NGN cost.
          </p>
        </CardHeader>
        <CardContent>
          {(board?.usdExposure.active_partner_count ?? 0) === 0 && !loading ? (
            <p className="text-sm text-muted-foreground text-center py-10">No active USD-denominated contractors — no exposure to model.</p>
          ) : (
            <>
              <p className="text-sm mb-4">
                Current monthly cost: <span className="font-semibold">{formatNgn(board?.usdExposure.monthly_ngn_at_current_rate ?? 0)}</span>
                <span className="text-muted-foreground"> at {formatRate(board?.usdExposure.current_rate ?? null)}</span>
              </p>
              <div className="h-[220px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={sensitivityData} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="label" fontSize={11} />
                    <YAxis fontSize={11} tickFormatter={(v: number) => `₦${(v / 1_000_000).toFixed(1)}M`} />
                    <ReTooltip formatter={(v: number) => formatNgn(v)} />
                    <Bar dataKey="monthly_ngn" radius={[4, 4, 0, 0]}>
                      {sensitivityData.map((d, i) => (
                        <Cell key={i} fill={d.shock === 0 ? 'hsl(var(--primary))' : d.shock > 0 ? '#dc6b1f' : '#3FAE6F'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
