import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import {
  ShieldAlert,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Flag,
  ChevronDown,
  RefreshCw,
  Loader2,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { usePageTitle } from '@/hooks/usePageTitle';
import { PageHeader } from '@/components/ui-kit/PageHeader';
import { TableSkeleton } from '@/components/ui-kit/TableSkeleton';
import { StatCard } from '@/components/ui-kit/StatCard';
import { EmptyState } from '@/components/ui-kit/EmptyState';
import { formatNaira } from '@/lib/format';
import { supabase } from '@/lib/supabase';
import { logAudit } from '@/lib/audit';
import { useAuthStore } from '@/store/authStore';
import { cn } from '@/lib/utils';
import {
  type AnomalyModule,
  type AnomalySeverity,
  type AnomalyStatus,
  type PaymentAnomaly,
  RULE_LABEL,
  fetchAnomalies,
  reviewAnomaly,
} from '@/lib/anomalies';

const SEVERITY_TONE: Record<AnomalySeverity, string> = {
  critical: 'bg-red-500/10 text-red-700 border-red-500/30',
  high: 'bg-orange-500/10 text-orange-700 border-orange-500/30',
  medium: 'bg-amber-500/10 text-amber-700 border-amber-500/30',
  low: 'bg-sky-500/10 text-sky-700 border-sky-500/30',
};

const STATUS_TONE: Record<AnomalyStatus, string> = {
  open: 'bg-rose-500/10 text-rose-700',
  acknowledged: 'bg-emerald-500/10 text-emerald-700',
  dismissed: 'bg-muted text-muted-foreground',
  escalated: 'bg-purple-500/10 text-purple-700',
};

export default function Anomalies() {
  usePageTitle('Anomalies');
  const { profile } = useAuthStore();
  const { toast } = useToast();
  const [rows, setRows] = useState<PaymentAnomaly[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanRunning, setScanRunning] = useState(false);
  const [filterStatus, setFilterStatus] = useState<AnomalyStatus | 'all'>('open');
  const [filterSeverity, setFilterSeverity] = useState<AnomalySeverity | 'all'>('all');
  const [filterModule, setFilterModule] = useState<AnomalyModule | 'all'>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [reviewing, setReviewing] = useState<{
    row: PaymentAnomaly;
    nextStatus: AnomalyStatus;
  } | null>(null);
  const [reviewerNote, setReviewerNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchAnomalies({
        status: filterStatus,
        severity: filterSeverity,
        module: filterModule,
      });
      setRows(data);
    } catch (err: any) {
      toast({ title: 'Could not load anomalies', description: err?.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [filterStatus, filterSeverity, filterModule, toast]);

  useEffect(() => { load(); }, [load]);

  const stats = useMemo(() => {
    const open = rows.filter((r) => r.status === 'open');
    return {
      total: rows.length,
      open: open.length,
      critical: open.filter((r) => r.severity === 'critical').length,
      high: open.filter((r) => r.severity === 'high').length,
    };
  }, [rows]);

  const runScan = async () => {
    setScanRunning(true);
    try {
      const { data, error } = await supabase.rpc('scan_daily_anomalies');
      if (error) throw error;
      toast({
        title: 'Scan complete',
        description: `${Number(data ?? 0)} new anomal${Number(data) === 1 ? 'y' : 'ies'} detected.`,
      });
      load();
    } catch (err: any) {
      toast({ title: 'Scan failed', description: err?.message, variant: 'destructive' });
    } finally {
      setScanRunning(false);
    }
  };

  const openReview = (row: PaymentAnomaly, nextStatus: AnomalyStatus) => {
    setReviewing({ row, nextStatus });
    setReviewerNote('');
  };

  const submitReview = async () => {
    if (!reviewing) return;
    setSubmitting(true);
    try {
      await reviewAnomaly(reviewing.row.id, reviewing.nextStatus, reviewerNote.trim() || undefined);
      await logAudit(
        `anomaly_${reviewing.nextStatus}`,
        `Anomaly ${RULE_LABEL[reviewing.row.rule_code]} ${reviewing.nextStatus}` +
          (reviewerNote.trim() ? ` — ${reviewerNote.trim()}` : ''),
        profile,
      );
      toast({ title: `Marked ${reviewing.nextStatus}` });
      setReviewing(null);
      setReviewerNote('');
      load();
    } catch (err: any) {
      toast({ title: 'Review failed', description: err?.message, variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Anomalies"
        description="Review payroll, payment, and EWA flags surfaced by the detection engine. Dismiss false positives, escalate suspicious activity."
        icon={ShieldAlert}
        actions={
          <Button onClick={runScan} disabled={scanRunning} variant="outline" size="sm">
            {scanRunning ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
            Run scan now
          </Button>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard title="Open" value={stats.open.toString()} icon={Flag} />
        <StatCard title="Critical" value={stats.critical.toString()} icon={ShieldAlert} tone="danger" />
        <StatCard title="High" value={stats.high.toString()} icon={AlertTriangle} tone="warning" />
        <StatCard title="Total" value={stats.total.toString()} icon={CheckCircle2} />
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center gap-3 flex-wrap">
          <CardTitle className="flex-1">Queue</CardTitle>
          <Select value={filterStatus} onValueChange={(v) => setFilterStatus(v as any)}>
            <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="open">Open</SelectItem>
              <SelectItem value="acknowledged">Acknowledged</SelectItem>
              <SelectItem value="escalated">Escalated</SelectItem>
              <SelectItem value="dismissed">Dismissed</SelectItem>
              <SelectItem value="all">All statuses</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filterSeverity} onValueChange={(v) => setFilterSeverity(v as any)}>
            <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All severities</SelectItem>
              <SelectItem value="critical">Critical</SelectItem>
              <SelectItem value="high">High</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="low">Low</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filterModule} onValueChange={(v) => setFilterModule(v as any)}>
            <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All modules</SelectItem>
              <SelectItem value="payroll">Payroll</SelectItem>
              <SelectItem value="payments">Payments</SelectItem>
              <SelectItem value="ewa">EWA</SelectItem>
              <SelectItem value="profile">Profile</SelectItem>
            </SelectContent>
          </Select>
        </CardHeader>
        <CardContent>
          {loading ? (
            <TableSkeleton rows={5} cols={5} />
          ) : rows.length === 0 ? (
            <EmptyState
              icon={CheckCircle2}
              title="No anomalies"
              description="Nothing to review with the current filters."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[120px]">Severity</TableHead>
                  <TableHead>Rule</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="w-[120px]">Status</TableHead>
                  <TableHead className="w-[260px] text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => {
                  const expanded = expandedId === r.id;
                  return (
                    <Fragment key={r.id}>
                      <TableRow className="cursor-pointer hover:bg-muted/40"
                        onClick={() => setExpandedId(expanded ? null : r.id)}>
                        <TableCell>
                          <Badge variant="outline" className={cn(SEVERITY_TONE[r.severity])}>
                            {r.severity}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-medium">{RULE_LABEL[r.rule_code]}</TableCell>
                        <TableCell className="max-w-[420px] truncate text-sm text-muted-foreground">
                          {r.title}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {r.amount_ngn ? formatNaira(r.amount_ngn) : '—'}
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary" className={cn(STATUS_TONE[r.status])}>
                            {r.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                          <div className="inline-flex gap-1">
                            <Button size="sm" variant="ghost"
                              onClick={() => setExpandedId(expanded ? null : r.id)}>
                              <ChevronDown className={cn('h-4 w-4 transition-transform',
                                expanded && 'rotate-180')} />
                            </Button>
                            {r.status === 'open' && (
                              <>
                                <Button size="sm" variant="outline"
                                  onClick={() => openReview(r, 'acknowledged')}>
                                  Ack
                                </Button>
                                <Button size="sm" variant="outline"
                                  className="border-purple-500/40 text-purple-700 hover:bg-purple-50"
                                  onClick={() => openReview(r, 'escalated')}>
                                  Escalate
                                </Button>
                                <Button size="sm" variant="ghost" className="text-muted-foreground"
                                  onClick={() => openReview(r, 'dismissed')}>
                                  <XCircle className="h-4 w-4" />
                                </Button>
                              </>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                      {expanded && (
                        <TableRow className="border-b border-border/50 bg-background/60 backdrop-blur-xl supports-[backdrop-filter]:bg-background/40 hover:bg-background/60">
                          <TableCell colSpan={6} className="py-4">
                            <div className="space-y-2 px-2">
                              <p className="text-sm">{r.description}</p>
                              <details className="text-xs">
                                <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                                  Evidence ({Object.keys(r.evidence_json || {}).length} fields)
                                </summary>
                                <pre className="mt-2 bg-background border rounded p-2 overflow-auto max-h-60">
                                  {JSON.stringify(r.evidence_json, null, 2)}
                                </pre>
                              </details>
                              {r.reviewer_note && (
                                <p className="text-xs text-muted-foreground">
                                  <span className="font-medium">Reviewer note:</span> {r.reviewer_note}
                                </p>
                              )}
                              <p className="text-xs text-muted-foreground">
                                Detected {new Date(r.detected_at).toLocaleString()} ·
                                Fingerprint <code className="text-[10px]">{r.fingerprint}</code>
                              </p>
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </Fragment>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!reviewing} onOpenChange={(o) => !o && setReviewing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Mark as {reviewing?.nextStatus}
            </DialogTitle>
            <DialogDescription>
              {reviewing?.row.title}
            </DialogDescription>
          </DialogHeader>
          <Textarea
            placeholder="Add a note (optional, but recommended for escalations and dismissals)"
            value={reviewerNote}
            onChange={(e) => setReviewerNote(e.target.value)}
            rows={4}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setReviewing(null)} disabled={submitting}>
              Cancel
            </Button>
            <Button onClick={submitReview} disabled={submitting}>
              {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
