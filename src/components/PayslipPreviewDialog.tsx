import { useRef } from 'react';
import { X, Download, Printer } from 'lucide-react';
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
  const frameRef = useRef<HTMLIFrameElement>(null);

  /**
   * Print the payslip already rendered in the frame, which is how anyone
   * actually gets a PDF of it: every browser's print dialog offers "Save as
   * PDF", and the payslip carries its own `@page { size: A4; margin: 12mm }`
   * plus print-color-adjust, so the result is a true A4 vector document with
   * selectable text rather than a screenshot.
   *
   * Printing the frame rather than opening a print window keeps the promise
   * this component was built on (see above): no pop-up, so nothing to allow
   * in a browser setting first. Falls back to the browser's own print if the
   * frame is not reachable for any reason.
   */
  const printSlip = () => {
    const frame = frameRef.current;
    const win = frame?.contentWindow;
    if (win) {
      win.focus();
      win.print();
    } else {
      window.print();
    }
  };

  return (
    <Dialog open={!!slip} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent hideClose className="max-w-3xl w-[95vw] h-[88vh] p-0 flex flex-col gap-0 overflow-hidden">
        <div className="flex items-center justify-between gap-2 border-b border-border/60 px-4 py-2.5 shrink-0">
          <DialogTitle className="text-sm font-medium truncate">{slip?.title}</DialogTitle>
          <div className="flex items-center gap-1.5 shrink-0">
            {slip && (
              <>
                <Button
                  size="sm"
                  className="h-7 gap-1.5 text-xs"
                  onClick={printSlip}
                >
                  <Printer className="h-3.5 w-3.5" /> Save as PDF
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 gap-1.5 text-xs"
                  onClick={() => downloadStoredPayslipHtml(slip.html, slip.filename || slip.title)}
                >
                  <Download className="h-3.5 w-3.5" /> Download file
                </Button>
              </>
            )}
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={onClose}>
              <X className="h-4 w-4" />
              <span className="sr-only">Close</span>
            </Button>
          </div>
        </div>
        <div className="flex-1 min-h-0">
          {slip && (
            <iframe ref={frameRef} title={slip.title} srcDoc={slip.html} className="w-full h-full border-0 bg-white" />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
