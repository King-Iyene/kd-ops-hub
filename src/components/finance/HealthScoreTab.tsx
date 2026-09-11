import { useEffect, useState } from 'react';
import { Activity, TrendingUp, ShieldCheck, AlertTriangle, XCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import {
  fetchHealthScoreInput,
  computeHealthScore,
  type HealthScoreResult,
  type HealthDimension,
  type HealthGrade,
} from '@/lib/financial-health';
import { errorMessage } from '@/lib/db-errors';

const GRADE_STYLE: Record<HealthGrade, { bg: string; text: string; ring: string }> = {
  A: { bg: 'bg-success',     text: 'text-white', ring: 'ring-success/30' },
  B: { bg: 'bg-primary',     text: 'text-white', ring: 'ring-primary/30' },
  C: { bg: 'bg-warning',     text: 'text-white', ring: 'ring-warning/30' },
  D: { bg: 'bg-warning',     text: 'text-white', ring: 'ring-warning/30' },
  F: { bg: 'bg-destructive', text: 'text-white', ring: 'ring-destructive/30' },
};

const STATUS_STYLE: Record<HealthDimension['status'], { color: string; Icon: typeof ShieldCheck }> = {
  excellent: { color: 'text-success', Icon: ShieldCheck },
  good:      { color: 'text-primary',      Icon: TrendingUp },
  fair:      { color: 'text-warning',    Icon: AlertTriangle },
  poor:      { color: 'text-destructive',        Icon: XCircle },
};

function GaugeRing({ score, grade }: { score: number; grade: HealthGrade }) {
  const circumference = 2 * Math.PI * 54;
  const progress = (score / 100) * circumference;
  const gs = GRADE_STYLE[grade];

  const strokeColor =
    score >= 90 ? '#10b981' :
    score >= 75 ? '#3b82f6' :
    score >= 60 ? '#f59e0b' :
    score >= 40 ? '#f97316' :
    '#ef4444';

  return (
    <div className="relative w-[140px] h-[140px] mx-auto">
      <svg viewBox="0 0 120 120" className="w-full h-full -rotate-90">
        <circle cx="60" cy="60" r="54" fill="none" stroke="currentColor" strokeWidth="8"
          className="text-muted/30" />
        <circle cx="60" cy="60" r="54" fill="none" stroke={strokeColor} strokeWidth="8"
          strokeDasharray={`${progress} ${circumference}`}
          strokeLinecap="round"
          className="transition-all duration-1000 ease-out" />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-3xl font-bold tracking-tight">{score}</span>
        <span className={cn(
          'text-xs font-bold px-2 py-0.5 rounded-full mt-0.5 ring-2',
          gs.bg, gs.text, gs.ring,
        )}>{grade}</span>
      </div>
    </div>
  );
}

function DimensionCard({ dim }: { dim: HealthDimension }) {
  const { color, Icon } = STATUS_STYLE[dim.status];
  const barWidth = `${Math.max(2, dim.score)}%`;

  return (
    <div className="rounded-lg border p-3 space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon className={cn('h-4 w-4', color)} />
          <span className="text-sm font-medium">{dim.label}</span>
        </div>
        <span className="text-sm font-bold">{dim.score}</span>
      </div>
      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
        <div
          className={cn(
            'h-full rounded-full transition-all duration-700',
            dim.score >= 80 ? 'bg-success' :
            dim.score >= 60 ? 'bg-primary' :
            dim.score >= 40 ? 'bg-warning' :
            'bg-destructive',
          )}
          style={{ width: barWidth }}
        />
      </div>
      <p className="text-2xs text-muted-foreground leading-snug">{dim.detail}</p>
      <p className="text-3xs text-muted-foreground">Weight: {(dim.weight * 100).toFixed(0)}%</p>
    </div>
  );
}

export default function HealthScoreTab() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [result, setResult] = useState<HealthScoreResult | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const input = await fetchHealthScoreInput();
        setResult(computeHealthScore(input));
      } catch (err: unknown) {
        toast({ title: 'Could not compute health score', description: errorMessage(err), variant: 'destructive' });
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-3 sm:space-y-6">
      <p className="text-sm text-muted-foreground">
        A composite financial health rating that synthesises runway, compliance, cash efficiency, revenue diversity, and cost structure into a single score.
      </p>

      {!result && !loading ? (
        <p className="text-sm text-muted-foreground text-center py-10">Could not compute health score.</p>
      ) : result ? (
        <>
          {/* ─── Gauge + summary ─────────────────────────────────── */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Activity className="h-4 w-4 text-primary" /> Financial Health Score
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col sm:flex-row items-center gap-6 py-4">
                <GaugeRing score={result.score} grade={result.grade} />
                <div className="flex-1 space-y-2 text-center sm:text-left">
                  <p className="text-lg font-semibold">
                    {result.score >= 90 ? 'Excellent financial health' :
                     result.score >= 75 ? 'Good financial health' :
                     result.score >= 60 ? 'Adequate — some areas need attention' :
                     result.score >= 40 ? 'Below average — multiple areas at risk' :
                     'Critical — immediate action required'}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Scored across {result.dimensions.length} dimensions. The lowest-scoring areas
                    should be your priority focus.
                  </p>
                  {result.dimensions.filter((d) => d.status === 'poor').length > 0 && (
                    <div className="flex flex-wrap gap-1.5 justify-center sm:justify-start">
                      {result.dimensions.filter((d) => d.status === 'poor').map((d) => (
                        <Badge key={d.key} variant="outline" className="bg-destructive/10 text-destructive border-destructive/30 text-xs">
                          {d.label}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* ─── Dimension breakdown ─────────────────────────────── */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {result.dimensions.map((dim) => (
              <DimensionCard key={dim.key} dim={dim} />
            ))}
          </div>

          {/* ─── Scoring methodology ──────────────────────────────── */}
          <Card>
            <CardContent className="pt-6">
              <div className="text-sm space-y-2">
                <p className="font-semibold">How the score is computed</p>
                <p className="text-muted-foreground">
                  Each dimension is scored 0–100 independently, then weighted by its impact on a Nigerian SME's financial stability.
                  Cash runway carries the highest weight (30%) because it's existential — everything else is secondary if you can't make payroll.
                  Compliance (20%) reflects the regulatory reality of operating in Nigeria.
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-2">
                  {[
                    { label: 'A (90–100)', desc: 'Excellent', color: 'bg-success' },
                    { label: 'B (75–89)', desc: 'Good', color: 'bg-primary' },
                    { label: 'C (60–74)', desc: 'Adequate', color: 'bg-warning' },
                    { label: 'D (40–59)', desc: 'Below avg', color: 'bg-warning' },
                    { label: 'F (0–39)', desc: 'Critical', color: 'bg-destructive' },
                  ].map((g) => (
                    <div key={g.label} className="flex items-center gap-2 text-xs text-muted-foreground">
                      <div className={cn('w-2.5 h-2.5 rounded-full', g.color)} />
                      <span>{g.label} — {g.desc}</span>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
}
