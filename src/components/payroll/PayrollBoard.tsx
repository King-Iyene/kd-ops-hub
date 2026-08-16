import { useMemo } from 'react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { formatNaira } from '@/lib/format';
import {
  FileEdit, Clock, CheckCircle2, Loader2, Banknote,
  Users, ArrowRight,
} from 'lucide-react';

type RunStatus = 'draft' | 'pending_approval' | 'approved' | 'processing' | 'paid';

interface BoardRun {
  id: string;
  period: string;
  status: RunStatus;
  employee_count?: number;
  total_burn_ngn: number;
  created_at: string;
  approved_by: string | null;
}

interface Props {
  runs: BoardRun[];
  onSelect?: (runId: string) => void;
}

const COLUMNS: { status: RunStatus; label: string; icon: typeof FileEdit; accent: string; dotColor: string }[] = [
  { status: 'draft',            label: 'Draft',       icon: FileEdit,    accent: 'border-t-slate-400',   dotColor: 'bg-slate-400' },
  { status: 'pending_approval', label: 'Pending',     icon: Clock,       accent: 'border-t-amber-500',   dotColor: 'bg-amber-500' },
  { status: 'approved',         label: 'Approved',    icon: CheckCircle2, accent: 'border-t-blue-500',    dotColor: 'bg-blue-500' },
  { status: 'processing',       label: 'Processing',  icon: Loader2,     accent: 'border-t-violet-500',  dotColor: 'bg-violet-500' },
  { status: 'paid',             label: 'Paid',        icon: Banknote,    accent: 'border-t-emerald-500', dotColor: 'bg-emerald-500' },
];

function periodLabel(period: string): string {
  if (!/^\d{4}-\d{1,2}$/.test(period)) return period;
  const [y, m] = period.split('-');
  const d = new Date(Number(y), Number(m) - 1, 1);
  return d.toLocaleString('en-GB', { month: 'short', year: 'numeric' });
}

export function PayrollBoard({ runs, onSelect }: Props) {
  const grouped = useMemo(() => {
    const map: Record<RunStatus, BoardRun[]> = {
      draft: [], pending_approval: [], approved: [], processing: [], paid: [],
    };
    for (const r of runs) {
      if (map[r.status]) map[r.status].push(r);
    }
    for (const k of Object.keys(map) as RunStatus[]) {
      map[k].sort((a, b) => b.created_at.localeCompare(a.created_at));
    }
    return map;
  }, [runs]);

  const totalBurn = runs.reduce((s, r) => s + r.total_burn_ngn, 0);
  const totalRuns = runs.length;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4 text-sm text-muted-foreground flex-wrap">
        <span>{totalRuns} payroll run{totalRuns !== 1 ? 's' : ''}</span>
        <span className="hidden sm:inline">·</span>
        <span>Total burn: <strong className="text-foreground">{formatNaira(totalBurn)}</strong></span>
        <ArrowRight className="h-3 w-3 hidden sm:block" />
        <div className="flex gap-3">
          {COLUMNS.map(col => {
            const count = grouped[col.status].length;
            return (
              <span key={col.status} className="flex items-center gap-1">
                <span className={`h-2 w-2 rounded-full ${col.dotColor}`} />
                <span className="tabular-nums">{count}</span>
              </span>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        {COLUMNS.map(col => {
          const Icon = col.icon;
          const items = grouped[col.status];
          return (
            <div key={col.status} className="space-y-2">
              <div className={`flex items-center gap-2 px-2 py-1.5 rounded-md bg-muted/50 border-t-2 ${col.accent}`}>
                <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-xs font-semibold">{col.label}</span>
                <Badge variant="secondary" className="ml-auto text-[10px] h-5 px-1.5">{items.length}</Badge>
              </div>

              <div className="space-y-2 min-h-[80px]">
                {items.length === 0 && (
                  <div className="flex items-center justify-center h-20 text-xs text-muted-foreground/60 border border-dashed rounded-md">
                    No runs
                  </div>
                )}
                {items.map(run => (
                  <Card
                    key={run.id}
                    className="cursor-pointer hover:border-primary/40 transition-colors"
                    onClick={() => onSelect?.(run.id)}
                  >
                    <CardContent className="p-3 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-sm">{periodLabel(run.period)}</span>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Users className="h-3 w-3" />
                        <span>{run.employee_count ?? '—'}</span>
                        <span className="ml-auto tabular-nums font-medium text-foreground">
                          {formatNaira(run.total_burn_ngn)}
                        </span>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
