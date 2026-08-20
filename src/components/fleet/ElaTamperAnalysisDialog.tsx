import { useState } from 'react';
import { Loader2, AlertTriangle } from 'lucide-react';
import { generateElaHeatmap } from '@/lib/receiptForensics';
import { errorMessage } from '@/lib/db-errors';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface ElaTamperAnalysisDialogProps {
  target: { id: string; url: string } | null;
  onClose: () => void;
}

export function ElaTamperAnalysisDialog({ target, onClose }: ElaTamperAnalysisDialogProps) {
  const [result, setResult] = useState<{ heatmapDataUrl: string; avgBrightness: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const runAnalysis = async (url: string) => {
    setResult(null);
    setError('');
    setLoading(true);
    try {
      const r = await generateElaHeatmap(url);
      setResult({ heatmapDataUrl: r.heatmapDataUrl, avgBrightness: r.avgBrightness });
    } catch (err: unknown) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const handleOpenChange = (v: boolean) => {
    if (!v) {
      onClose();
      setResult(null);
      setError('');
    }
  };

  // Trigger analysis when target changes
  if (target && !loading && !result && !error) {
    void runAnalysis(target.url);
  }

  return (
    <Dialog open={!!target} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Tamper Analysis</DialogTitle>
          <DialogDescription>
            Compares the receipt image against its own re-compressed version to detect edits. This is a visual aid, not proof of tampering.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {loading && (
            <div className="flex items-center justify-center py-10 text-sm text-muted-foreground gap-2">
              <Loader2 className="h-4 w-4 animate-spin" /> Generating analysis…
            </div>
          )}
          {error && (
            <div className="flex items-start gap-1.5 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}
          {result && target && (() => {
            const avg = result.avgBrightness;
            const verdict = avg < 15
              ? { label: 'No signs of tampering', color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/30', icon: '✓' }
              : avg < 40
              ? { label: 'Low concern — likely normal compression artifacts', color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-500/10 border-amber-500/30', icon: '~' }
              : { label: 'Review recommended — possible editing detected', color: 'text-red-600 dark:text-red-400', bg: 'bg-red-500/10 border-red-500/30', icon: '!' };
            return (
              <>
                <div className={`flex items-center gap-2 rounded-md border px-3 py-2.5 ${verdict.bg}`}>
                  <span className={`text-lg font-bold ${verdict.color}`}>{verdict.icon}</span>
                  <div>
                    <p className={`text-sm font-semibold ${verdict.color}`}>{verdict.label}</p>
                    <p className="text-[11px] text-muted-foreground">Confidence score: {Math.round(avg)}/255 (higher = more variation detected)</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-1">Original Receipt</p>
                    <img src={target.url} alt="Original receipt" className="w-full rounded-md border" />
                  </div>
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-1">Error Level Analysis</p>
                    <img src={result.heatmapDataUrl} alt="Error-level analysis heatmap" className="w-full rounded-md border" />
                  </div>
                </div>

                <div className="rounded-md border bg-muted/50 px-3 py-2 text-xs text-muted-foreground space-y-2">
                  <p className="font-medium text-foreground">What the colors mean:</p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <div className="flex items-start gap-2">
                      <span className="mt-0.5 h-3 w-3 shrink-0 rounded-sm" style={{ background: '#111' }} />
                      <div>
                        <p className="font-medium text-foreground">Dark / black</p>
                        <p>Consistent compression — this area hasn't been altered.</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-2">
                      <span className="mt-0.5 h-3 w-3 shrink-0 rounded-sm" style={{ background: 'rgb(220, 120, 50)' }} />
                      <div>
                        <p className="font-medium text-foreground">Bright / colored</p>
                        <p>Different compression history — could be an edit, or WhatsApp forwarding.</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-2">
                      <span className="mt-0.5 h-3 w-3 shrink-0 rounded-sm" style={{ background: 'rgb(180, 180, 200)' }} />
                      <div>
                        <p className="font-medium text-foreground">Bright edges</p>
                        <p>Normal on sharp text or lines — not suspicious by itself.</p>
                      </div>
                    </div>
                  </div>
                </div>

                <p className="text-[11px] text-muted-foreground italic">
                  This is an automated visual aid, not definitive proof. WhatsApp-forwarded images, screenshots, and re-saved photos can produce bright areas without any tampering. Always verify with the original source before taking action.
                </p>
              </>
            );
          })()}
        </div>
      </DialogContent>
    </Dialog>
  );
}
