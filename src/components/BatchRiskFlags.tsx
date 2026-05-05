import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { AlertTriangle, ShieldCheck, Loader2 } from 'lucide-react';

export interface BatchRiskFlag {
  flag_type: string;
  severity: 'low' | 'medium' | 'high';
  message: string;
  details: Record<string, unknown> | null;
}

interface Props {
  batchId: string;
  /** Called when the operator's acknowledgement status flips. Parents that
   *  want to gate an approve button on flag review should track this. */
  onAcknowledgedChange?: (acknowledged: boolean) => void;
  /** Hide the acknowledgement checkbox — useful for read-only views. */
  readOnly?: boolean;
}

const SEVERITY_LABEL: Record<BatchRiskFlag['severity'], string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
};

const SEVERITY_CLASSES: Record<BatchRiskFlag['severity'], string> = {
  low:    'border-blue-500/40   bg-blue-500/5',
  medium: 'border-amber-500/50  bg-amber-500/5',
  high:   'border-red-500/50    bg-red-500/5',
};

/**
 * Surfaces automated risk flags for a payment batch (total/headcount drift,
 * duplicate accounts, recently changed bank accounts, new employees, abnormally
 * high single payments). Soft warnings only — never blocks. The parent should
 * gate the approve button on `acknowledged === true` if any flag is present.
 */
export function BatchRiskFlags({ batchId, onAcknowledgedChange, readOnly }: Props) {
  const [flags, setFlags] = useState<BatchRiskFlag[]>([]);
  const [loading, setLoading] = useState(true);
  const [acknowledged, setAcknowledged] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    supabase
      .rpc('get_batch_velocity_flags', { p_batch_id: batchId })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (!error && Array.isArray(data)) {
          setFlags(data as BatchRiskFlag[]);
        } else {
          setFlags([]);
        }
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [batchId]);

  // No flags = no acknowledgement required — auto-true so the parent's gate clears.
  useEffect(() => {
    if (!loading && flags.length === 0) {
      setAcknowledged(true);
      onAcknowledgedChange?.(true);
    }
  }, [loading, flags.length, onAcknowledgedChange]);

  const handleToggle = (next: boolean) => {
    setAcknowledged(next);
    onAcknowledgedChange?.(next);
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
        <Loader2 className="h-4 w-4 animate-spin" /> Checking for risk indicators...
      </div>
    );
  }

  if (flags.length === 0) {
    return (
      <Alert className="border-emerald-500/40 bg-emerald-500/5">
        <ShieldCheck className="h-4 w-4 text-emerald-600" />
        <AlertDescription className="text-sm">
          No risk indicators detected for this batch.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-600" />
          Risk indicators ({flags.length})
        </span>
      </div>
      {flags.map((f, i) => (
        <Alert key={`${f.flag_type}-${i}`} className={SEVERITY_CLASSES[f.severity]}>
          <AlertTriangle
            className={
              f.severity === 'high'
                ? 'h-4 w-4 text-red-600'
                : f.severity === 'medium'
                ? 'h-4 w-4 text-amber-600'
                : 'h-4 w-4 text-blue-600'
            }
          />
          <AlertDescription className="text-sm">
            <span className="font-medium uppercase mr-2">[{SEVERITY_LABEL[f.severity]}]</span>
            {f.message}
          </AlertDescription>
        </Alert>
      ))}
      {!readOnly && (
        <div className="flex items-center gap-2 pt-2">
          <Checkbox
            id={`ack-flags-${batchId}`}
            checked={acknowledged}
            onCheckedChange={(checked) => handleToggle(checked === true)}
          />
          <Label htmlFor={`ack-flags-${batchId}`} className="text-sm cursor-pointer">
            I have reviewed the risk indicators above
          </Label>
        </div>
      )}
    </div>
  );
}
