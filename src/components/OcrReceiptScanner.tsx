/**
 * OcrReceiptScanner
 *
 * Drop-in button for the expense form. When clicked it opens a file picker
 * (camera on mobile, file browser on desktop). After the user picks an image
 * Tesseract.js runs OCR in-browser — no API key, no server call — and tries
 * to extract:
 *   • Amount   (looks for ₦ / NGN / "total" / "amount" patterns)
 *   • Date     (dd/mm/yyyy, yyyy-mm-dd, "5 May 2026", etc.)
 *   • Vendor   (first non-blank line at the top of the receipt)
 *
 * The caller receives an `onExtracted` callback with whatever was found. The
 * button stays self-contained: loading state, progress bar, error handling.
 */

import { useRef, useState } from 'react';
import { createWorker } from 'tesseract.js';
import { ScanLine, Loader2, CheckCircle2, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface OcrResult {
  amount_ngn?: string;   // numeric string e.g. "12500"
  date?: string;         // ISO date string e.g. "2026-05-05"
  description?: string;  // merchant name / first meaningful line
  litres?: string;       // numeric string e.g. "42.5" — fuel receipts only
}

interface Props {
  onExtracted: (result: OcrResult, file: File) => void;
  className?: string;
  /** Also try to pull a litres reading off the receipt (fuel stations print it). */
  extractLitres?: boolean;
}

// ---------------------------------------------------------------------------
// Extraction helpers
// ---------------------------------------------------------------------------

function extractAmount(text: string): string | undefined {
  // Patterns: ₦12,500.00  |  NGN 12500  |  Total: 12,500  |  Amount: 12500.00
  const patterns = [
    /₦\s*([\d,]+(?:\.\d{1,2})?)/i,
    /NGN\s*([\d,]+(?:\.\d{1,2})?)/i,
    /(?:total|amount|grand\s*total|sub\s*total)\s*[:\-]?\s*(?:₦|NGN)?\s*([\d,]+(?:\.\d{1,2})?)/i,
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (m) {
      const cleaned = m[1].replace(/,/g, '');
      const n = parseFloat(cleaned);
      if (!isNaN(n) && n > 0 && n < 100_000_000) return String(Math.round(n));
    }
  }
  return undefined;
}

function extractDate(text: string): string | undefined {
  const monthMap: Record<string, string> = {
    jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
    jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
  };

  // dd/mm/yyyy or dd-mm-yyyy
  const slashMatch = text.match(/\b(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})\b/);
  if (slashMatch) {
    const [, d, m, y] = slashMatch;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }

  // yyyy-mm-dd
  const isoMatch = text.match(/\b(20\d{2})[\/\-](\d{2})[\/\-](\d{2})\b/);
  if (isoMatch) {
    const [, y, m, d] = isoMatch;
    return `${y}-${m}-${d}`;
  }

  // "5 May 2026" or "May 5, 2026"
  const wordMatch = text.match(
    /\b(\d{1,2})\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(20\d{2})\b/i,
  ) || text.match(
    /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2}),?\s+(20\d{2})\b/i,
  );
  if (wordMatch) {
    const isMonthFirst = isNaN(Number(wordMatch[1]));
    const day = isMonthFirst ? wordMatch[2] : wordMatch[1];
    const month = isMonthFirst ? wordMatch[1] : wordMatch[2];
    const year = wordMatch[3];
    const mm = monthMap[month.slice(0, 3).toLowerCase()];
    if (mm) return `${year}-${mm}-${day.padStart(2, '0')}`;
  }

  return undefined;
}

function extractLitres(text: string): string | undefined {
  // Patterns: "42.5 L", "Litres: 42.5", "Qty(L) 42.50", "Volume 42.5L"
  const patterns = [
    /(?:litres?|liters?|volume|qty\s*\(?l\)?)\s*[:\-]?\s*(\d{1,3}(?:\.\d{1,2})?)\s*l?\b/i,
    /\b(\d{1,3}(?:\.\d{1,2})?)\s*(?:litres?|liters?|ltrs?|l)\b/i,
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (m) {
      const n = parseFloat(m[1]);
      if (!isNaN(n) && n > 0 && n < 500) return String(n);
    }
  }
  return undefined;
}

function extractVendor(text: string): string | undefined {
  // Take the first non-empty, non-numeric, non-very-short line as vendor name.
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  for (const line of lines.slice(0, 6)) {
    if (line.length < 3) continue;
    if (/^[\d\s\W]+$/.test(line)) continue;           // pure numbers / symbols
    if (/receipt|invoice|tax\s*invoice/i.test(line)) continue;
    if (line.length > 60) continue;                    // probably a paragraph
    return line;
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

type ScanState = 'idle' | 'loading' | 'done' | 'error';

export function OcrReceiptScanner({ onExtracted, className, extractLitres: shouldExtractLitres }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [state, setScanState] = useState<ScanState>('idle');
  const [progress, setProgress] = useState(0);
  const [errorMsg, setErrorMsg] = useState('');

  const handleFile = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      setErrorMsg('Pick a JPEG or PNG image to scan.');
      setScanState('error');
      return;
    }

    setScanState('loading');
    setProgress(0);
    setErrorMsg('');

    try {
      const worker = await createWorker('eng', 1, {
        logger: (m: any) => {
          if (m.status === 'recognizing text') {
            setProgress(Math.round((m.progress || 0) * 100));
          }
        },
      });

      const { data: { text } } = await worker.recognize(file);
      await worker.terminate();

      const result: OcrResult = {
        amount_ngn: extractAmount(text),
        date:       extractDate(text),
        description: extractVendor(text),
        litres:     shouldExtractLitres ? extractLitres(text) : undefined,
      };

      setScanState('done');
      onExtracted(result, file);

      // Reset back to idle after a brief success flash.
      setTimeout(() => setScanState('idle'), 2500);
    } catch (err: any) {
      setErrorMsg('Scan failed — try a clearer photo.');
      setScanState('error');
      setTimeout(() => setScanState('idle'), 3000);
    }
  };

  const label = {
    idle:    'Scan receipt',
    loading: `Scanning… ${progress}%`,
    done:    'Scanned!',
    error:   errorMsg || 'Scan failed',
  }[state];

  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className={cn(
          'gap-2 relative overflow-hidden',
          state === 'done'  && 'border-emerald-500 text-emerald-600 bg-emerald-50',
          state === 'error' && 'border-destructive text-destructive bg-destructive/5',
        )}
        disabled={state === 'loading'}
        onClick={() => {
          setScanState('idle');
          inputRef.current?.click();
        }}
      >
        {/* Progress bar underlayer */}
        {state === 'loading' && (
          <span
            className="absolute inset-y-0 left-0 bg-primary/10 transition-all duration-200"
            style={{ width: `${progress}%` }}
          />
        )}

        {state === 'loading' ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin relative z-10" />
        ) : state === 'done' ? (
          <CheckCircle2 className="h-3.5 w-3.5 relative z-10" />
        ) : state === 'error' ? (
          <AlertTriangle className="h-3.5 w-3.5 relative z-10" />
        ) : (
          <ScanLine className="h-3.5 w-3.5 relative z-10" />
        )}
        <span className="relative z-10 text-xs">{label}</span>
      </Button>

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
          e.target.value = '';
        }}
      />

      {state === 'idle' && (
        <p className="text-[10px] text-muted-foreground leading-tight">
          Take a photo of a paper receipt to auto-fill the form.
        </p>
      )}
    </div>
  );
}
