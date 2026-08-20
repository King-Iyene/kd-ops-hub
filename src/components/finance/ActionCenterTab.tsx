import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertOctagon, AlertTriangle, CheckCircle2, ArrowRight, Wallet, TrendingDown, Gauge, ClipboardCheck,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { formatNaira, formatNairaCompact } from '@/lib/format';
import { cn } from '@/lib/utils';
import { errorMessage } from '@/lib/db-errors';
import { fetchActionCenterData, type ActionCenterData, type ActionItem, type ActionSeverity } from '@/lib/action-center';

const SEVERITY_STYLE: Record<ActionSeverity, { icon: typeof AlertOctagon; bg: string; border: string; iconColor: string; label: string }> = {
  critical: { icon: AlertOctagon, bg: 'bg-red-500/[0.06]', border: 'border-red-500/20', iconColor: 'text-red-600 dark:text-red-400', label: 'Critical' },
  warning:  { icon: AlertTriangle, bg: 'bg-amber-500/[0.06]', border: 'border-amber-500/20', iconColor: 'text-amber-600 dark:text-amber-400', label: 'Needs review' },
  info:     { icon: AlertTriangle, bg: 'bg-muted/50', border: 'border-border', iconColor: 'text-muted-foreground', label: 'Info' },
};

const GRADE_TONE: Record<string, string> = {
  A: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30',
  B: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30',
  C: 'bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30',
  D: 'bg-orange-500/15 text-orange-700 dark:text-orange-400 border-orange-500/30',
  F: 'bg-destructive/15 text-destructive border-destructive/30',
};

function ActionRow({ item, onOpen }: { item: ActionItem; onOpen: (href: string) => void }) {
  const style = SEVERITY_STYLE[item.severity];
  const Icon = style.icon;
  return (
    <button
      onClick={() => onOpen(item.href)}
      className={cn(
        'w-full flex items-start gap-3 rounded-lg border p-3 text-left kd-transition hover:brightness-[0.98]',
        style.bg, style.border,
      )}
    >
      <Icon className={cn('h-4 w-4 mt-0.5 shrink-0', style.iconColor)} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium leading-snug">{item.title}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{item.detail}</p>
      </div>
      {item.amount_ngn != null && (
        <span className="text-sm font-semibold tabular-nums whitespace-nowrap">{formatNairaCompact(item.amount_ngn)}</span>
      )}
      <ArrowRight className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
    </button>
  );
}

export default function ActionCenterTab() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<ActionCenterData | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        setData(await fetchActionCenterData());
      } catch (err: unknown) {
        toast({ title: 'Could not load the action center', description: errorMessage(err), variant: 'destructive' });
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const goto = (href: string) => {
    if (href.startsWith('/finance?tab=')) {
      // Same page, different tab — swap the query param instead of a full navigation.
      navigate(href, { replace: false });
      return;
    }
    navigate(href);
  };

  const criticalCount = data?.items.filter((i) => i.severity === 'critical').length ?? 0;

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        What actually needs your decision today — pending approvals, near-term cash risk, overdue filings and unreviewed anomalies, ranked by severity.
      </p>

      {/* ─── Pulse strip ────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Wallet className="h-4 w-4 text-primary" /> Cash on hand
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold currency">{formatNaira(data?.pulse.cash_on_hand_ngn ?? 0)}</p>
            {data?.pulse.cash_is_stale && (
              <p className="text-xs text-amber-600 mt-1">Not updated in over 7 days — figures below may be stale</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <TrendingDown className="h-4 w-4 text-amber-600" /> Runway
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              {data?.pulse.runway_weeks == null ? '—' : `${data.pulse.runway_weeks.toFixed(1)} wks`}
            </p>
            <p className="text-xs text-muted-foreground mt-1">At current net burn</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Gauge className="h-4 w-4 text-primary" /> Financial health
            </CardTitle>
          </CardHeader>
          <CardContent className="flex items-center gap-3">
            <p className="text-2xl font-bold">{data?.health.score ?? '—'}</p>
            {data && (
              <Badge variant="outline" className={cn('text-xs', GRADE_TONE[data.health.grade])}>
                Grade {data.health.grade}
              </Badge>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ─── Action feed ────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <ClipboardCheck className="h-4 w-4 text-primary" /> What needs your attention
            {criticalCount > 0 && (
              <Badge variant="outline" className="text-[10px] border-red-500/30 text-red-600 dark:text-red-400">
                {criticalCount} critical
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-2">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-14 rounded-lg bg-muted animate-pulse" />
              ))}
            </div>
          ) : !data || data.items.length === 0 ? (
            <div className="flex items-center gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/[0.06] p-4">
              <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <span className="text-sm">All clear — no pending approvals, cash risk, overdue filings, or unreviewed anomalies.</span>
            </div>
          ) : (
            <div className="space-y-2">
              {data.items.map((item) => (
                <ActionRow key={item.id} item={item} onOpen={goto} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
