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
import { Checkbox } from '@/components/ui/checkbox';
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
import { MobileFilterBar } from '@/components/ui-kit/MobileFilterBar';
import { AuroraHero } from '@/components/AuroraHero';
import { TableSkeleton } from '@/components/ui-kit/TableSkeleton';
import { StatCard } from '@/components/ui-kit/StatCard';
import { EmptyState } from '@/components/ui-kit/EmptyState';
import { formatNaira } from '@/lib/format';
import { supabase } from '@/lib/supabase';
import { logAudit } from '@/lib/audit';
import { useAuthStore } from '@/store/authStore';
import { cn } from '@/lib/utils';
import {
  MobileCard,
  MobileCardHeader,
  MobileCardTitle,
  MobileCardMeta,
  MobileCardRow,
  MobileCardFooter,
} from '@/components/ui-kit/MobileCard';
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
  critical: 'bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/30',
  high: 'bg-orange-500/10 text-orange-700 dark:text-orange-400 border-orange-500/30',
  medium: 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30',
  low: 'bg-sky-500/10 text-sky-700 dark:text-sky-400 border-sky-500/30',
};

const STATUS_TONE: Record<AnomalyStatus, string> = {
  open: 'bg-rose-500/10 text-rose-700 dark:text-rose-400',
  acknowledged: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
  dismissed: 'bg-muted text-muted-foreground',
  escalated: 'bg-purple-500/10 text-purple-700 dark:text-purple-400',
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
  // Bulk-action state. Selected rows must all be 'open' — the
  // bulk bar only acts on actionable items, mirroring the row-
  // level buttons. selectedIds is a Set so toggling is O(1) and
  // the rendered checkbox state stays cheap.
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkAction, setBulkAction] = useState<{ nextStatus: AnomalyStatus; count: number } | null>(null);
  const [reviewerNote, setReviewerNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const toggleSelected = (id: string) =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const clearSelection = () => setSelectedIds(new Set());

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

  // Bulk submit: process selected open rows in parallel, then
  // refresh. Limited to selectedIds that are still 'open' so
  // we don't accidentally re-action already-handled rows when
  // the operator's selection lags behind a refresh.
  const submitBulkReview = async () => {
    if (!bulkAction) return;
    const targets = rows.filter((r) => selectedIds.has(r.id) && r.status === 'open');
    if (targets.length === 0) {
      toast({ title: 'No open rows selected' });
      setBulkAction(null);
      return;
    }
    setSubmitting(true);
    const note = reviewerNote.trim() || undefined;
    let success = 0;
    let failed = 0;
    await Promise.all(
      targets.map(async (r) => {
        try {
          await reviewAnomaly(r.id, bulkAction.nextStatus, note);
          await logAudit(
            `anomaly_${bulkAction.nextStatus}`,
            `Anomaly ${RULE_LABEL[r.rule_code]} ${bulkAction.nextStatus}` +
              (note ? ` — ${note}` : '') + ' (bulk)',
            profile,
          );
          success++;
        } catch {
          failed++;
        }
      }),
    );
    if (failed > 0) {
      toast({
        title: `Bulk ${bulkAction.nextStatus} partial`,
        description: `${success} succeeded, ${failed} failed`,
        variant: 'destructive',
      });
    } else {
      toast({ title: `${success} marked ${bulkAction.nextStatus}` });
    }
    setBulkAction(null);
    setReviewerNote('');
    clearSelection();
    setSubmitting(false);
    load();
  };

  return (
    <div className="space-y-6">
      <AuroraHero className="p-5 sm:p-6" scanLine={stats.open > 0} pattern="pulse">
        <PageHeader
          className="mb-0"
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
      </AuroraHero>

      <div className="kd-stat-grid">
        <StatCard title="Open" value={stats.open.toString()} icon={Flag} />
        <StatCard title="Critical" value={stats.critical.toString()} icon={ShieldAlert} tone="danger" />
        <StatCard title="High" value={stats.high.toString()} icon={AlertTriangle} tone="warning" />
        <StatCard title="Total" value={stats.total.toString()} icon={CheckCircle2} />
      </div>

      <Card className="rounded-xl">
        <CardHeader className="flex flex-row items-center gap-3 flex-wrap">
          <CardTitle className="kd-section-title flex-1">Queue</CardTitle>
          <MobileFilterBar
            activeCount={[filterStatus !== 'open', filterSeverity !== 'all', filterModule !== 'all'].filter(Boolean).length}
            onClear={() => { setFilterStatus('open'); setFilterSeverity('all'); setFilterModule('all'); }}
            filters={
              <>
                <Select value={filterStatus} onValueChange={(v) => setFilterStatus(v as any)}>
                  <SelectTrigger className="w-[140px]" data-mobile-filter-row><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="open">Open</SelectItem>
                    <SelectItem value="acknowledged">Acknowledged</SelectItem>
                    <SelectItem value="escalated">Escalated</SelectItem>
                    <SelectItem value="dismissed">Dismissed</SelectItem>
                    <SelectItem value="all">All statuses</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={filterSeverity} onValueChange={(v) => setFilterSeverity(v as any)}>
                  <SelectTrigger className="w-[140px]" data-mobile-filter-row><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All severities</SelectItem>
                    <SelectItem value="critical">Critical</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="low">Low</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={filterModule} onValueChange={(v) => setFilterModule(v as any)}>
                  <SelectTrigger className="w-[140px]" data-mobile-filter-row><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All modules</SelectItem>
                    <SelectItem value="payroll">Payroll</SelectItem>
                    <SelectItem value="payments">Payments</SelectItem>
                    <SelectItem value="ewa">EWA</SelectItem>
                    <SelectItem value="profile">Profile</SelectItem>
                    <SelectItem value="expenses">Expenses</SelectItem>
                  </SelectContent>
                </Select>
              </>
            }
          />
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
            <>
            {/* Bulk action bar — appears only when at least one row
                is selected. Sticky at the top of the table area so
                the operator can scan the list and act without
                scrolling back. Counter on the left is the truth;
                buttons on the right kick off the same review flow
                as per-row actions but for every selected row. */}
            {selectedIds.size > 0 && (
              <div className="sticky top-0 z-10 mb-3 flex items-center justify-between gap-3 rounded-lg border border-primary/30 bg-primary/[0.03] backdrop-blur px-3 py-2">
                <div className="flex items-center gap-2 text-sm">
                  <span className="font-semibold tabular-nums">{selectedIds.size}</span>
                  <span className="text-muted-foreground">selected</span>
                  <Button variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground" onClick={clearSelection}>
                    Clear
                  </Button>
                </div>
                <div className="flex items-center gap-1.5">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setBulkAction({ nextStatus: 'acknowledged', count: selectedIds.size })}
                    disabled={submitting}
                  >
                    <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Ack {selectedIds.size}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-purple-500/40 text-purple-700 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-500/10"
                    onClick={() => setBulkAction({ nextStatus: 'escalated', count: selectedIds.size })}
                    disabled={submitting}
                  >
                    <Flag className="h-3.5 w-3.5 mr-1" /> Escalate {selectedIds.size}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-muted-foreground"
                    onClick={() => setBulkAction({ nextStatus: 'dismissed', count: selectedIds.size })}
                    disabled={submitting}
                  >
                    <XCircle className="h-3.5 w-3.5 mr-1" /> Dismiss {selectedIds.size}
                  </Button>
                </div>
              </div>
            )}
            <div className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  {/* Select-all toggles every visible 'open' row. Only
                      open rows are selectable because bulk actions
                      only apply to actionable items. */}
                  <TableHead className="w-10">
                    {(() => {
                      const openIds = rows.filter((r) => r.status === 'open').map((r) => r.id);
                      const selectedOpen = openIds.filter((id) => selectedIds.has(id));
                      const allSelected = openIds.length > 0 && selectedOpen.length === openIds.length;
                      const someSelected = selectedOpen.length > 0 && !allSelected;
                      return (
                        <Checkbox
                          checked={allSelected ? true : someSelected ? 'indeterminate' : false}
                          onCheckedChange={(v) => {
                            if (v) setSelectedIds(new Set(openIds));
                            else clearSelection();
                          }}
                          aria-label="Select all open anomalies"
                        />
                      );
                    })()}
                  </TableHead>
                  <TableHead className="w-[120px]">Severity</TableHead>
                  <TableHead>Rule</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="w-[110px]">Date</TableHead>
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
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          {/* Only open rows can be bulk-actioned. Acked /
                              escalated / dismissed rows show a disabled
                              checkbox so the column stays visually aligned. */}
                          <Checkbox
                            checked={selectedIds.has(r.id)}
                            onCheckedChange={() => r.status === 'open' && toggleSelected(r.id)}
                            disabled={r.status !== 'open'}
                            aria-label={`Select ${RULE_LABEL[r.rule_code]} anomaly`}
                          />
                        </TableCell>
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
                        <TableCell className="text-sm text-muted-foreground tabular-nums whitespace-nowrap">
                          {new Date(r.detected_at).toLocaleDateString()}
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary" className={cn(STATUS_TONE[r.status])}>
                            {r.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                          <div className="inline-flex gap-1">
                            <Button size="sm" variant="ghost"
                              aria-label={expanded ? 'Collapse details' : 'Expand details'}
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
                                  className="border-purple-500/40 text-purple-700 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-500/10"
                                  onClick={() => openReview(r, 'escalated')}>
                                  Escalate
                                </Button>
                                <Button size="sm" variant="ghost" className="text-muted-foreground"
                                  aria-label={`Dismiss ${RULE_LABEL[r.rule_code]} anomaly`}
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
                          <TableCell colSpan={8} className="py-4">
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
            </div>
            {/* Mobile card view */}
            <div className="md:hidden space-y-2 p-1">
              {/* Mobile select-all */}
              {(() => {
                const openIds = rows.filter((r) => r.status === 'open').map((r) => r.id);
                if (openIds.length === 0) return null;
                const selectedOpen = openIds.filter((id) => selectedIds.has(id));
                const allSelected = selectedOpen.length === openIds.length;
                const someSelected = selectedOpen.length > 0 && !allSelected;
                return (
                  <div className="flex items-center gap-2 px-1 py-1.5">
                    <Checkbox
                      checked={allSelected ? true : someSelected ? 'indeterminate' : false}
                      onCheckedChange={(v) => {
                        if (v) setSelectedIds(new Set(openIds));
                        else clearSelection();
                      }}
                      aria-label="Select all open anomalies"
                    />
                    <span className="text-xs text-muted-foreground">Select all open ({openIds.length})</span>
                  </div>
                );
              })()}
              {rows.map((r) => (
                <MobileCard key={r.id} onClick={() => setExpandedId(expandedId === r.id ? null : r.id)}>
                  <MobileCardHeader>
                    <MobileCardTitle>
                      <span className="flex items-center gap-1.5">
                        {r.status === 'open' && (
                          <span onClick={(e) => e.stopPropagation()}>
                            <Checkbox
                              checked={selectedIds.has(r.id)}
                              onCheckedChange={() => toggleSelected(r.id)}
                              aria-label={`Select ${RULE_LABEL[r.rule_code]} anomaly`}
                            />
                          </span>
                        )}
                        <Badge variant="outline" className={cn(SEVERITY_TONE[r.severity], 'mr-1.5')}>
                          {r.severity}
                        </Badge>
                        {RULE_LABEL[r.rule_code]}
                      </span>
                    </MobileCardTitle>
                    <MobileCardMeta className="currency">
                      {r.amount_ngn ? formatNaira(r.amount_ngn) : '—'}
                    </MobileCardMeta>
                  </MobileCardHeader>
                  <MobileCardRow label="Description">
                    <span className="truncate max-w-[180px]">{r.title}</span>
                  </MobileCardRow>
                  <MobileCardRow label="Date">
                    <span className="tabular-nums">{new Date(r.detected_at).toLocaleDateString()}</span>
                  </MobileCardRow>
                  <MobileCardRow label="Status">
                    <Badge variant="secondary" className={cn(STATUS_TONE[r.status])}>
                      {r.status}
                    </Badge>
                  </MobileCardRow>
                  {expandedId === r.id && (
                    <div className="pt-2 mt-1 border-t border-border/40 space-y-2 text-xs">
                      <p className="text-sm">{r.description}</p>
                      {r.reviewer_note && (
                        <p className="text-muted-foreground">
                          <span className="font-medium">Note:</span> {r.reviewer_note}
                        </p>
                      )}
                      <p className="text-muted-foreground">
                        Detected {new Date(r.detected_at).toLocaleString()}
                      </p>
                    </div>
                  )}
                  {r.status === 'open' && (
                    <MobileCardFooter>
                      <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); openReview(r, 'acknowledged'); }}>
                        Ack
                      </Button>
                      <Button size="sm" variant="outline"
                        className="border-purple-500/40 text-purple-700 dark:text-purple-400"
                        onClick={(e) => { e.stopPropagation(); openReview(r, 'escalated'); }}>
                        Escalate
                      </Button>
                      <Button size="sm" variant="ghost" className="text-muted-foreground"
                        onClick={(e) => { e.stopPropagation(); openReview(r, 'dismissed'); }}>
                        <XCircle className="h-4 w-4" />
                      </Button>
                    </MobileCardFooter>
                  )}
                </MobileCard>
              ))}
            </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Bulk-action confirmation dialog. Shares the reviewerNote
          state with the single-row dialog — only one of the two
          dialogs is open at a time, so reusing the textarea avoids
          a parallel state. */}
      <Dialog open={!!bulkAction} onOpenChange={(o) => { if (!o) { setBulkAction(null); setReviewerNote(''); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {bulkAction?.nextStatus === 'acknowledged' && `Acknowledge ${bulkAction?.count} anomalies`}
              {bulkAction?.nextStatus === 'escalated' && `Escalate ${bulkAction?.count} anomalies`}
              {bulkAction?.nextStatus === 'dismissed' && `Dismiss ${bulkAction?.count} anomalies`}
            </DialogTitle>
            <DialogDescription>
              {bulkAction?.nextStatus === 'acknowledged' &&
                'Mark all selected anomalies as reviewed and acknowledged. Adds the same note to each.'}
              {bulkAction?.nextStatus === 'escalated' &&
                'Flag all selected anomalies for further investigation. Adds the same note to each. This is a strong signal — escalations stay visible to admins.'}
              {bulkAction?.nextStatus === 'dismissed' &&
                'Mark all selected anomalies as false positives. Adds the same note to each.'}
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={reviewerNote}
            onChange={(e) => setReviewerNote(e.target.value)}
            placeholder={
              bulkAction?.nextStatus === 'escalated'
                ? 'Why are these being escalated? (visible in audit log)'
                : 'Optional note — added to every selected row'
            }
            className="min-h-[80px]"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => { setBulkAction(null); setReviewerNote(''); }} disabled={submitting}>
              Cancel
            </Button>
            <Button
              onClick={submitBulkReview}
              disabled={submitting || (bulkAction?.nextStatus === 'escalated' && !reviewerNote.trim())}
              variant={bulkAction?.nextStatus === 'dismissed' ? 'secondary' : 'default'}
            >
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Confirm {bulkAction?.nextStatus === 'acknowledged' ? 'Ack' : bulkAction?.nextStatus === 'escalated' ? 'Escalate' : 'Dismiss'} {bulkAction?.count}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
