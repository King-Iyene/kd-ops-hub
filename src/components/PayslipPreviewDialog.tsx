import { X, Download } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { downloadStoredPayslipHtml } from '@/lib/payslip';

export interface PayslipPreviewState {
  title: string;
  html: string;
  filename?: string;
}

/**
 * Renders an already-fetched payslip HTML document inline via an iframe,
 * instead of window.open()'ing it into a new tab. window.open() depends on
 * the browser's popup permission for this origin — even opened synchronously
 * inside the click handler, a user whose browser/site setting blocks pop-ups
 * gets nothing (or, after the fix that added an explicit check, a "pop-up
 * blocked, allow pop-ups" toast that still requires them to go change a
 * browser setting just to see a payslip). An in-page dialog has no such
 * dependency — it always renders, for every viewer, with no permission to
 * grant.
 */
export function PayslipPreviewDialog({
  slip,
  onClose,
}: {
  slip: PayslipPreviewState | null;
  onClose: () => void;
}) {
  return (
    <Dialog open={!!slip} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent hideClose className="max-w-3xl w-[95vw] h-[88vh] p-0 flex flex-col gap-0 overflow-hidden">
        <div className="flex items-center justify-between gap-2 border-b border-border/60 px-4 py-2.5 shrink-0">
          <DialogTitle className="text-sm font-medium truncate">{slip?.title}</DialogTitle>
          <div className="flex items-center gap-1.5 shrink-0">
            {slip && (
              <Button
                size="sm"
                variant="outline"
                className="h-7 gap-1.5 text-xs"
                onClick={() => downloadStoredPayslipHtml(slip.html, slip.filename || slip.title)}
              >
                <Download className="h-3.5 w-3.5" /> Download
              </Button>
            )}
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={onClose}>
              <X className="h-4 w-4" />
              <span className="sr-only">Close</span>
            </Button>
          </div>
        </div>
        <div className="flex-1 min-h-0">
          {slip && (
            <iframe title={slip.title} srcDoc={slip.html} className="w-full h-full border-0 bg-white" />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
