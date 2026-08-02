import { useEffect, useMemo, useState } from 'react';
import {
  ResponsiveContainer, AreaChart, Area, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip as ReTooltip, Cell,
} from 'recharts';
import { SERIES, GRID, AXIS_TICK, fmtMillions, ChartTooltip } from '@/lib/chart-theme';
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
                  <AreaChart data={trendData} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="fxGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={SERIES[0]} stopOpacity={0.12} />
                        <stop offset="100%" stopColor={SERIES[0]} stopOpacity={0.01} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid {...GRID} />
                    <XAxis dataKey="label" {...AXIS_TICK} />
                    <YAxis {...AXIS_TICK} domain={['auto', 'auto']} tickFormatter={(v: number) => `₦${v.toFixed(0)}`} />
                    <ReTooltip content={<ChartTooltip valueFormatter={(v) => formatRate(v)} />} />
                    <Area type="stepAfter" dataKey="rate" name="USD/NGN rate" stroke={SERIES[0]} strokeWidth={2} fill="url(#fxGrad)" dot={false} />
                  </AreaChart>
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
            <Coins className="h-4 w-4 text-primary" /> Total USD exposure — rate sensitivity
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            All USD-denominated obligations (contractors + subscriptions) — what a rate swing does to the monthly NGN cost.
          </p>
        </CardHeader>
        <CardContent>
          {(board?.usdExposure.monthly_usd_minor ?? 0) === 0 && !loading ? (
            <p className="text-sm text-muted-foreground text-center py-10">No active USD-denominated obligations — no exposure to model.</p>
          ) : (
            <>
              <p className="text-sm mb-4">
                Current monthly cost: <span className="font-semibold">{formatNgn(board?.usdExposure.monthly_ngn_at_current_rate ?? 0)}</span>
                <span className="text-muted-foreground"> at {formatRate(board?.usdExposure.current_rate ?? null)}</span>
              </p>

              {(board?.usdExposure.sources?.length ?? 0) > 1 && (
                <div className="grid grid-cols-2 gap-3 mb-4">
                  {board!.usdExposure.sources.map((src) => (
                    <div key={src.label} className="rounded-md border p-2.5">
                      <p className="text-xs text-muted-foreground">{src.label}</p>
                      <p className="text-sm font-semibold">{formatNgn(src.monthly_ngn)}</p>
                      <p className="text-[10px] text-muted-foreground">{src.count} active</p>
                    </div>
                  ))}
                </div>
              )}

              <div className="h-[220px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={sensitivityData} margin={{ top: 4, right: 16, left: 0, bottom: 0 }} barSize={20}>
                    <CartesianGrid {...GRID} />
                    <XAxis dataKey="label" {...AXIS_TICK} />
                    <YAxis {...AXIS_TICK} tickFormatter={fmtMillions} />
                    <ReTooltip content={<ChartTooltip valueFormatter={formatNgn} />} cursor={{ fill: 'currentColor', fillOpacity: 0.04 }} />
                    <Bar dataKey="monthly_ngn" name="Monthly cost" radius={[4, 4, 0, 0]}>
                      {sensitivityData.map((d, i) => (
                        <Cell key={i} fill={d.shock === 0 ? SERIES[0] : d.shock > 0 ? SERIES[1] : SERIES[2]} />
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
