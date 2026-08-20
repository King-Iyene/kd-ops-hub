import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import { logAudit } from '@/lib/audit';
import { useToast } from '@/hooks/use-toast';
import { formatNaira, formatDate } from '@/lib/format';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
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
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui-kit/EmptyState';
import { LocationCell } from '@/components/fleet/TripMapModal';
import { Loader2, AlertTriangle, Fuel, MapPin, Trash2, RotateCcw } from 'lucide-react';
import {
  type FuelRequest,
  type TripLog,
  type VehicleSummary,
  type FieldStaff,
} from '@/lib/fleet-utils';

// ---------------------------------------------------------------------------
// AnomaliesTab
// ---------------------------------------------------------------------------

export interface AnomaliesTabProps {
  anomalousTrips: TripLog[];
  anomalousFuelReqs: FuelRequest[];
  vehicles: VehicleSummary[];
  staff: FieldStaff[];
  onRefresh: () => void;
}

export function AnomaliesTab({
  anomalousTrips,
  anomalousFuelReqs,
  vehicles,
  staff,
  onRefresh,
}: AnomaliesTabProps) {
  const { profile } = useAuthStore();
  const { toast } = useToast();

  // Anomaly review state
  const [reviewingAnomaly, setReviewingAnomaly] = useState<{ type: 'trip' | 'fuel'; id: string; label: string } | null>(null);
  const [anomalyReviewDecision, setAnomalyReviewDecision] = useState<'valid' | 'fraudulent' | ''>('');
  const [anomalyReviewNote, setAnomalyReviewNote] = useState('');
  const [submittingAnomalyReview, setSubmittingAnomalyReview] = useState(false);

  const handleAnomalyReview = async () => {
    if (!reviewingAnomaly || !anomalyReviewDecision || !anomalyReviewNote.trim()) return;
    setSubmittingAnomalyReview(true);
    const reviewedAt = new Date().toISOString();
    const reviewPayload = {
      anomaly_reviewed_by: profile?.id,
      anomaly_reviewed_at: reviewedAt,
      anomaly_review_note: `${anomalyReviewDecision === 'valid' ? 'Reviewed — Valid' : 'Fraudulent / Error'}: ${anomalyReviewNote.trim()}`,
    };
    const table = reviewingAnomaly.type === 'trip' ? 'trip_logs' : 'fuel_requests';
    const { error } = await supabase.from(table).update(reviewPayload).eq('id', reviewingAnomaly.id);
    setSubmittingAnomalyReview(false);
    if (error) {
      toast({ title: 'Review failed', description: error.message, variant: 'destructive' });
      return;
    }
    await logAudit(
      'anomaly_reviewed',
      `Anomaly on ${reviewingAnomaly.type} "${reviewingAnomaly.label}" marked as ${anomalyReviewDecision === 'valid' ? 'Valid' : 'Fraudulent/Error'}: ${anomalyReviewNote.trim()}`,
      profile,
    );
    toast({ title: 'Anomaly review saved' });
    setReviewingAnomaly(null);
    setAnomalyReviewDecision('');
    setAnomalyReviewNote('');
    onRefresh();
  };

  const revertAnomalyReview = async (type: 'trip' | 'fuel', id: string, label: string) => {
    const table = type === 'trip' ? 'trip_logs' : 'fuel_requests';
    const { error } = await supabase.from(table).update({
      anomaly_reviewed_by: null,
      anomaly_reviewed_at: null,
      anomaly_review_note: null,
    }).eq('id', id);
    if (error) { toast({ title: 'Revert failed', description: error.message, variant: 'destructive' }); return; }
    await logAudit('anomaly_review_reverted', `Anomaly review reverted for ${type} "${label}"`, profile);
    toast({ title: 'Review reverted — item marked unreviewed again' });
    onRefresh();
  };

  const deleteAnomalyRecord = async (type: 'trip' | 'fuel', id: string, label: string) => {
    const table = type === 'trip' ? 'trip_logs' : 'fuel_requests';
    const { error } = await supabase.from(table).delete().eq('id', id);
    if (error) { toast({ title: 'Delete failed', description: error.message, variant: 'destructive' }); return; }
    await logAudit('anomaly_record_deleted', `${type} "${label}" deleted from anomalies`, profile);
    toast({ title: 'Record deleted' });
    onRefresh();
  };

  return (
    <div className="space-y-6">
      {/* Flagged Trip Logs */}
      <div>
        <h2 className="text-base font-semibold mb-3 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-red-500" /> Flagged Trip Logs
          <span className="text-xs text-muted-foreground font-normal">({anomalousTrips.length})</span>
        </h2>
        {anomalousTrips.length === 0 ? (
          <Card><CardContent className="p-0"><EmptyState illustration="radar" title="No anomalous trips" description="All trip logs look normal. Anything unusual will surface here." /></CardContent></Card>
        ) : (
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Employee</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Route</TableHead>
                      <TableHead>Flags</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Reviewed</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {anomalousTrips.map((t) => (
                      <TableRow key={t.id} className="bg-red-50/40 dark:bg-red-950/10">
                        <TableCell className="font-medium text-sm">{t.employee_name}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{formatDate(t.date)}</TableCell>
                        <TableCell className="text-xs max-w-[200px]">
                          <div className="space-y-0.5">
                            <LocationCell location={t.start_location} lat={t.start_lat} lng={t.start_lng} showCoords />
                            <span className="text-muted-foreground/60">↓</span>
                            <LocationCell location={t.end_location} lat={t.end_lat} lng={t.end_lng} showCoords />
                          </div>
                        </TableCell>
                        <TableCell className="text-xs">
                          <div className="flex flex-col gap-0.5">
                            {t.is_anomaly && (
                              <span className="text-red-600 flex items-center gap-1">
                                <AlertTriangle className="h-3 w-3" /> {t.anomaly_reason}
                              </span>
                            )}
                            {t.is_out_of_area && (
                              <span className="text-orange-600 flex items-center gap-1">
                                <MapPin className="h-3 w-3" /> Out-of-area end location
                              </span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          {t.anomaly_reviewed_at ? (
                            <span className="text-xs text-muted-foreground">{t.anomaly_review_note?.split(':')[0]}</span>
                          ) : (
                            <Badge variant="outline" className="border-red-300 text-red-700 text-xs">Unreviewed</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {t.anomaly_reviewed_at ? formatDate(t.anomaly_reviewed_at.slice(0, 10)) : '—'}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1.5">
                            {!t.anomaly_reviewed_at ? (
                              <Button size="sm" variant="outline" className="text-xs h-7"
                                onClick={() => setReviewingAnomaly({ type: 'trip', id: t.id, label: `${t.start_location} → ${t.end_location}` })}>
                                Review
                              </Button>
                            ) : (
                              <Button size="sm" variant="ghost" className="text-xs h-7 text-amber-600 hover:text-amber-700 hover:bg-amber-50"
                                onClick={() => revertAnomalyReview('trip', t.id, `${t.start_location} → ${t.end_location}`)}>
                                <RotateCcw className="h-3 w-3 mr-1" /> Revert
                              </Button>
                            )}
                            <Button size="sm" variant="ghost" className="text-xs h-7 text-red-500 hover:text-red-700 hover:bg-red-50"
                              onClick={() => deleteAnomalyRecord('trip', t.id, `${t.start_location} → ${t.end_location}`)}>
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Flagged Fuel Requests */}
      <div>
        <h2 className="text-base font-semibold mb-3 flex items-center gap-2">
          <Fuel className="h-4 w-4 text-red-500" /> Flagged Fuel Requests
          <span className="text-xs text-muted-foreground font-normal">({anomalousFuelReqs.length})</span>
        </h2>
        {anomalousFuelReqs.length === 0 ? (
          <Card><CardContent className="p-0"><EmptyState illustration="radar" title="No anomalous fuel requests" description="All fuel requests look normal." /></CardContent></Card>
        ) : (
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Employee</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Station</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Reviewed</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {anomalousFuelReqs.map((r) => (
                      <TableRow key={r.id} className="bg-red-50/40 dark:bg-red-950/10">
                        <TableCell className="font-medium text-sm">{r.employee_name}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{formatDate(r.created_at.slice(0, 10))}</TableCell>
                        <TableCell className="text-sm">{r.station_name || '—'}</TableCell>
                        <TableCell className="text-sm tabular-nums">{formatNaira(r.amount_ngn || 0)}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="border-orange-300 text-orange-700 text-xs">
                            {r.anomaly_type === 'efficiency_anomaly' ? 'Efficiency' : r.anomaly_type || 'Anomaly'}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {r.anomaly_reviewed_at ? (
                            <span className="text-xs text-muted-foreground">{r.anomaly_review_note?.split(':')[0]}</span>
                          ) : (
                            <Badge variant="outline" className="border-red-300 text-red-700 text-xs">Unreviewed</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {r.anomaly_reviewed_at ? formatDate(r.anomaly_reviewed_at.slice(0, 10)) : '—'}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1.5">
                            {!r.anomaly_reviewed_at ? (
                              <Button size="sm" variant="outline" className="text-xs h-7"
                                onClick={() => setReviewingAnomaly({ type: 'fuel', id: r.id, label: `${r.station_name} — ${r.employee_name}` })}>
                                Review
                              </Button>
                            ) : (
                              <Button size="sm" variant="ghost" className="text-xs h-7 text-amber-600 hover:text-amber-700 hover:bg-amber-50"
                                onClick={() => revertAnomalyReview('fuel', r.id, `${r.station_name} — ${r.employee_name}`)}>
                                <RotateCcw className="h-3 w-3 mr-1" /> Revert
                              </Button>
                            )}
                            <Button size="sm" variant="ghost" className="text-xs h-7 text-red-500 hover:text-red-700 hover:bg-red-50"
                              onClick={() => deleteAnomalyRecord('fuel', r.id, `${r.station_name} — ${r.employee_name}`)}>
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* ANOMALY REVIEW DIALOG */}
      <Dialog open={!!reviewingAnomaly} onOpenChange={(v) => { if (!v) { setReviewingAnomaly(null); setAnomalyReviewDecision(''); setAnomalyReviewNote(''); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Review anomaly</DialogTitle>
            <DialogDescription className="text-xs break-words">
              {reviewingAnomaly?.label}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Decision <span className="text-destructive">*</span></Label>
              <Select value={anomalyReviewDecision || undefined} onValueChange={(v) => setAnomalyReviewDecision(v as any)}>
                <SelectTrigger><SelectValue placeholder="Select outcome..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="valid">Reviewed — Valid</SelectItem>
                  <SelectItem value="fraudulent">Fraudulent / Error</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Reason / notes <span className="text-destructive">*</span></Label>
              <Textarea
                value={anomalyReviewNote}
                onChange={(e) => setAnomalyReviewNote(e.target.value)}
                placeholder="Explain why this anomaly is valid or fraudulent..."
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setReviewingAnomaly(null); setAnomalyReviewDecision(''); setAnomalyReviewNote(''); }}>
              Cancel
            </Button>
            <Button
              onClick={handleAnomalyReview}
              disabled={submittingAnomalyReview || !anomalyReviewDecision || !anomalyReviewNote.trim()}
            >
              {submittingAnomalyReview && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save review
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
