import { useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { errorMessage } from '@/lib/db-errors';
import { useAuthStore } from '@/store/authStore';
import { useToast } from '@/hooks/use-toast';
import { logAudit } from '@/lib/audit';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  CheckCircle2,
  XCircle,
  MinusCircle,
  Loader2,
  ClipboardCheck,
  AlertTriangle,
  Camera,
} from 'lucide-react';

export interface InspectionItem {
  key: string;
  label: string;
  status: 'pass' | 'fail' | 'na';
  note?: string;
}

const DEFAULT_CHECKLIST: Omit<InspectionItem, 'status'>[] = [
  { key: 'tyres', label: 'Tyres — tread depth & pressure' },
  { key: 'brakes', label: 'Brakes — pedal feel & handbrake' },
  { key: 'lights', label: 'Lights — headlamps, indicators, brake lights' },
  { key: 'mirrors', label: 'Mirrors — side & rear view' },
  { key: 'wipers', label: 'Wipers & washer fluid' },
  { key: 'horn', label: 'Horn' },
  { key: 'seatbelts', label: 'Seatbelts' },
  { key: 'fluids', label: 'Engine oil, coolant, brake fluid levels' },
  { key: 'battery', label: 'Battery — terminals & charge' },
  { key: 'body', label: 'Body — dents, scratches, damage' },
  { key: 'fire_ext', label: 'Fire extinguisher — present & in-date' },
  { key: 'first_aid', label: 'First aid kit' },
  { key: 'warning_triangle', label: 'Warning triangle / reflectors' },
  { key: 'spare_tyre', label: 'Spare tyre & jack' },
  { key: 'documents', label: 'Vehicle documents (insurance, papers)' },
];

interface Props {
  vehicleId: string;
  vehicleName: string;
  tripId?: string;
  inspectionType?: 'pre_trip' | 'post_trip' | 'ad_hoc';
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onComplete?: () => void;
}

export function VehicleInspectionForm({
  vehicleId,
  vehicleName,
  tripId,
  inspectionType = 'pre_trip',
  open,
  onOpenChange,
  onComplete,
}: Props) {
  const { profile } = useAuthStore();
  const { toast } = useToast();
  const [items, setItems] = useState<InspectionItem[]>(
    DEFAULT_CHECKLIST.map((c) => ({ ...c, status: 'pass' as const })),
  );
  const [defectNotes, setDefectNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [expandedItem, setExpandedItem] = useState<string | null>(null);

  const hasDefects = items.some((i) => i.status === 'fail');
  const allChecked = items.every((i) => i.status !== 'pass' || i.status === 'pass');

  const setItemStatus = useCallback((key: string, status: 'pass' | 'fail' | 'na') => {
    setItems((prev) => prev.map((i) => (i.key === key ? { ...i, status } : i)));
  }, []);

  const setItemNote = useCallback((key: string, note: string) => {
    setItems((prev) => prev.map((i) => (i.key === key ? { ...i, note } : i)));
  }, []);

  const handleSubmit = async () => {
    if (!profile) return;
    setSubmitting(true);
    try {
      const overallStatus = hasDefects ? 'fail' : 'pass';
      const { error } = await supabase.from('vehicle_inspections').insert({
        vehicle_id: vehicleId,
        inspector_id: profile.id,
        trip_id: tripId || null,
        inspection_type: inspectionType,
        checklist: { items },
        has_defects: hasDefects,
        defect_notes: defectNotes.trim() || null,
        overall_status: overallStatus,
      });
      if (error) throw error;

      await logAudit(
        'vehicle_inspection_completed',
        `${inspectionType.replace('_', '-')} inspection for ${vehicleName}: ${overallStatus}${hasDefects ? ` — ${items.filter((i) => i.status === 'fail').map((i) => i.label).join(', ')}` : ''}`,
        profile,
      );

      toast({
        title: overallStatus === 'pass' ? 'Inspection passed' : 'Inspection submitted with defects',
        description: hasDefects
          ? `${items.filter((i) => i.status === 'fail').length} defect(s) flagged for admin review`
          : 'All items passed',
      });

      onOpenChange(false);
      onComplete?.();

      setItems(DEFAULT_CHECKLIST.map((c) => ({ ...c, status: 'pass' as const })));
      setDefectNotes('');
    } catch (err: unknown) {
      toast({ title: 'Error', description: errorMessage(err), variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  const typeLabel = inspectionType === 'pre_trip'
    ? 'Pre-Trip'
    : inspectionType === 'post_trip'
    ? 'Post-Trip'
    : 'Ad-Hoc';

  const failCount = items.filter((i) => i.status === 'fail').length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] flex flex-col gap-0 p-0">
        <DialogHeader className="shrink-0 px-6 pt-5 pb-4 border-b">
          <DialogTitle className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-900/30">
              <ClipboardCheck className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <span>{typeLabel} Inspection</span>
              <p className="text-xs text-muted-foreground font-normal mt-0.5">
                {vehicleName}
              </p>
            </div>
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-1 min-h-0">
          {hasDefects && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 mb-3">
              <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
              <span className="text-sm text-amber-700 dark:text-amber-400">
                {failCount} defect{failCount > 1 ? 's' : ''} found — vehicle may not be roadworthy
              </span>
            </div>
          )}

          {items.map((item) => (
            <div
              key={item.key}
              className={cn(
                'rounded-lg border px-3 py-2.5 transition-colors',
                item.status === 'fail' && 'border-red-200 bg-red-50/50 dark:bg-red-950/10 dark:border-red-800',
                item.status === 'pass' && 'border-green-200/60 bg-green-50/30 dark:bg-green-950/5 dark:border-green-900/40',
                item.status === 'na' && 'border-muted bg-muted/30',
              )}
            >
              <div className="flex items-center gap-2">
                <span className="text-sm flex-1">{item.label}</span>
                <div className="flex gap-1 shrink-0">
                  {(['pass', 'fail', 'na'] as const).map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => {
                        setItemStatus(item.key, s);
                        if (s === 'fail') setExpandedItem(item.key);
                        else if (expandedItem === item.key) setExpandedItem(null);
                      }}
                      className={cn(
                        'h-7 w-7 rounded-md flex items-center justify-center transition-colors',
                        item.status === s
                          ? s === 'pass'
                            ? 'bg-green-500 text-white'
                            : s === 'fail'
                            ? 'bg-red-500 text-white'
                            : 'bg-gray-400 text-white'
                          : 'bg-muted/60 text-muted-foreground hover:bg-muted',
                      )}
                      title={s === 'pass' ? 'Pass' : s === 'fail' ? 'Fail' : 'N/A'}
                    >
                      {s === 'pass' ? (
                        <CheckCircle2 className="h-3.5 w-3.5" />
                      ) : s === 'fail' ? (
                        <XCircle className="h-3.5 w-3.5" />
                      ) : (
                        <MinusCircle className="h-3.5 w-3.5" />
                      )}
                    </button>
                  ))}
                </div>
              </div>
              {(item.status === 'fail' || expandedItem === item.key) && (
                <div className="mt-2">
                  <input
                    type="text"
                    className="w-full text-xs px-2 py-1.5 rounded border bg-background"
                    placeholder="Describe the defect..."
                    value={item.note || ''}
                    onChange={(e) => setItemNote(item.key, e.target.value)}
                  />
                </div>
              )}
            </div>
          ))}

          {hasDefects && (
            <div className="space-y-1.5 pt-3">
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Additional notes on defects
              </Label>
              <Textarea
                value={defectNotes}
                onChange={(e) => setDefectNotes(e.target.value)}
                placeholder="Overall condition notes, recommended actions..."
                rows={2}
                className="resize-none text-sm"
              />
            </div>
          )}
        </div>

        <div className="shrink-0 px-6 pb-5 pt-3 border-t bg-background flex items-center justify-between gap-3">
          <div className="text-xs text-muted-foreground">
            <span className="text-green-600 font-medium">{items.filter((i) => i.status === 'pass').length}</span> pass
            {failCount > 0 && (
              <> · <span className="text-red-600 font-medium">{failCount}</span> fail</>
            )}
            {items.filter((i) => i.status === 'na').length > 0 && (
              <> · <span className="text-gray-500">{items.filter((i) => i.status === 'na').length}</span> N/A</>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button
              onClick={handleSubmit}
              disabled={submitting}
              className={cn(hasDefects && 'bg-amber-600 hover:bg-amber-700')}
            >
              {submitting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : hasDefects ? (
                <AlertTriangle className="mr-2 h-4 w-4" />
              ) : (
                <CheckCircle2 className="mr-2 h-4 w-4" />
              )}
              {hasDefects ? 'Submit with Defects' : 'All Good'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
