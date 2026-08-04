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
import { supabase } from '@/integrations/supabase/client';

export interface OcrResult {
  amount_ngn?: string;   // numeric string e.g. "12500"
  date?: string;         // ISO date string e.g. "2026-05-05"
  description?: string;  // merchant name / first meaningful line
  litres?: string;       // numeric string e.g. "42.5" — fuel receipts only
  /** True when the scan ran but found none of the decision-critical fields
   *  (amount, litres). Vendor-line matching alone is too weak a signal to
   *  trust — almost any document's first text line passes it, which is
   *  exactly how an ID card photo can "succeed" a scan with nothing useful
   *  extracted. Callers should treat this as "verify manually", not a hard
   *  failure. */
  lowConfidence?: boolean;
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
  const patterns = [
    /₦\s*([\d,]+(?:\.\d{1,2})?)/i,
    /NGN\s*([\d,]+(?:\.\d{1,2})?)/i,
    /(?:total|amount|grand\s*total|sub\s*total|amt)\s*[:\-=]?\s*(?:₦|NGN|N)?\s*([\d,]+(?:\.\d{1,2})?)/i,
    /(?:amount\s*(?:in\s*)?(?:figures?|words?))\s*[:\-=]?\s*(?:₦|NGN|N)?\s*([\d,]+(?:\.\d{1,2})?)/i,
  ];
  const candidates: number[] = [];
  for (const re of patterns) {
    const m = text.match(re);
    if (m) {
      const cleaned = m[1].replace(/,/g, '');
      const n = parseFloat(cleaned);
      if (!isNaN(n) && n > 0 && n < 100_000_000) candidates.push(n);
    }
  }
  if (candidates.length > 0) return String(Math.round(Math.max(...candidates)));

  // Fallback: find the largest number on any line containing money-related words
  const lines = text.split('\n');
  for (const line of lines) {
    if (/amount|total|price|cost|paid|sum/i.test(line)) {
      const nums = line.match(/[\d,]+(?:\.\d{1,2})?/g);
      if (nums) {
        for (const raw of nums) {
          const n = parseFloat(raw.replace(/,/g, ''));
          if (!isNaN(n) && n >= 100 && n < 100_000_000) candidates.push(n);
        }
      }
    }
  }
  if (candidates.length > 0) return String(Math.round(Math.max(...candidates)));
  return undefined;
}

function extractDate(text: string): string | undefined {
  const monthMap: Record<string, string> = {
    jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
    jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
  };

  // dd/mm/yyyy or dd-mm-yyyy (4-digit year)
  const slashMatch = text.match(/\b(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})\b/);
  if (slashMatch) {
    const [, d, m, y] = slashMatch;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }

  // dd/mm/yy (2-digit year, common on Nigerian handwritten receipts)
  const shortYearMatch = text.match(/\b(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2})\b/);
  if (shortYearMatch) {
    const [, d, m, yy] = shortYearMatch;
    const y = parseInt(yy) > 50 ? `19${yy}` : `20${yy}`;
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
  const patterns = [
    /(?:litres?|liters?|ltr?s?|volume|qty\s*\(?l\)?)\s*(?:filled|pumped)?\s*[:\-=]?\s*(\d{1,4}(?:\.\d{1,2})?)/i,
    /\b(\d{1,4}(?:\.\d{1,2})?)\s*(?:litres?|liters?|ltrs?|ltr)\b/i,
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (m) {
      const n = parseFloat(m[1]);
      if (!isNaN(n) && n > 0 && n < 1000) return String(n);
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
// Image preprocessing — improves Tesseract accuracy on photos of paper
// ---------------------------------------------------------------------------

async function preprocessForOcr(file: File): Promise<File> {
  if (!file.type.startsWith('image/')) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0);

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const d = imageData.data;

    // Grayscale + contrast stretch
    let min = 255, max = 0;
    for (let i = 0; i < d.length; i += 4) {
      const gray = Math.round(d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114);
      d[i] = d[i + 1] = d[i + 2] = gray;
      if (gray < min) min = gray;
      if (gray > max) max = gray;
    }
    const range = max - min || 1;
    for (let i = 0; i < d.length; i += 4) {
      const stretched = Math.round(((d[i] - min) / range) * 255);
      d[i] = d[i + 1] = d[i + 2] = stretched > 140 ? 255 : 0;
    }

    ctx.putImageData(imageData, 0, 0);
    const blob: Blob | null = await new Promise(r => canvas.toBlob(r, 'image/png'));
    if (!blob) return file;
    return new File([blob], file.name, { type: 'image/png' });
  } catch {
    return file;
  }
}

// ---------------------------------------------------------------------------
// Server-side fallback — Google Document AI for handwritten/messy receipts
// ---------------------------------------------------------------------------

async function tryServerOcr(file: File): Promise<OcrResult | null> {
  try {
    const buffer = await file.slice(0, 4 * 1024 * 1024).arrayBuffer();
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    const image_base64 = btoa(binary);

    const { data, error } = await supabase.functions.invoke('extract-receipt', {
      body: { image_base64, mime_type: file.type || 'image/jpeg' },
    });
    if (error || !data?.ok || data.dev_skip) return null;

    const amount_ngn = data.amount_ngn ? String(Math.round(parseFloat(String(data.amount_ngn).replace(/[^0-9.]/g, '')))) : undefined;
    const litres = data.litres ? String(parseFloat(String(data.litres).replace(/[^0-9.]/g, ''))) : undefined;
    return {
      amount_ngn: amount_ngn && amount_ngn !== 'NaN' ? amount_ngn : undefined,
      date: data.date || undefined,
      description: data.vendor || undefined,
      litres: litres && litres !== 'NaN' ? litres : undefined,
      lowConfidence: false,
    };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

type ScanState = 'idle' | 'loading' | 'done' | 'warning' | 'error';

// Tesseract.js v7's createWorker() swallows load failures internally
// (worker/createWorker.js ends its init chain with `.catch(() => {})`), so a
// blocked or failed CDN fetch for the core/language files leaves the
// returned promise pending forever — no resolve, no reject. Without an
// external timeout the UI is stuck at "Scanning… 0%" indefinitely.
function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    promise.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); },
    );
  });
}

// createWorker's logger only reports granular progress for 'recognizing
// text' — the core WASM download and language traineddata download (which
// dominate a first-time or slow-connection scan) fire once at progress 0
// and once at progress 1 with no steps between, so without this mapping
// the bar sits at 0% through the entire download.
const OCR_PHASE_RANGES: Record<string, [number, number]> = {
  'loading tesseract core': [0, 10],
  'loading language traineddata': [10, 30],
  'initializing tesseract': [30, 35],
  'recognizing text': [35, 100],
};

const OCR_LOAD_TIMEOUT_MS = 45_000;
const OCR_RECOGNIZE_TIMEOUT_MS = 30_000;

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
      // Step 1: Preprocess image (grayscale + threshold) for better OCR
      const processed = await preprocessForOcr(file);

      const worker = await withTimeout(
        createWorker('eng', 1, {
          logger: (m: any) => {
            const range = OCR_PHASE_RANGES[m.status];
            if (range) {
              const [start, end] = range;
              setProgress(Math.round(start + (m.progress || 0) * (end - start)));
            }
          },
        }),
        OCR_LOAD_TIMEOUT_MS,
        'OCR engine took too long to load. Check your connection and try again.',
      );

      const { data: { text } } = await withTimeout(
        worker.recognize(processed),
        OCR_RECOGNIZE_TIMEOUT_MS,
        'Scan took too long. Try a clearer or smaller photo.',
      );
      await worker.terminate();

      let amount_ngn = extractAmount(text);
      let litres = shouldExtractLitres ? extractLitres(text) : undefined;
      let date = extractDate(text);
      let description = extractVendor(text);
      let lowConfidence = !amount_ngn && !litres;

      // Step 2: If local OCR failed, try server-side AI (Google Document AI)
      if (lowConfidence) {
        setProgress(95);
        const serverResult = await tryServerOcr(file);
        if (serverResult && (serverResult.amount_ngn || serverResult.litres)) {
          amount_ngn = serverResult.amount_ngn || amount_ngn;
          litres = serverResult.litres || litres;
          date = serverResult.date || date;
          description = serverResult.description || description;
          lowConfidence = false;
        }
      }

      const result: OcrResult = { amount_ngn, date, description, litres, lowConfidence };

      if (lowConfidence) {
        setErrorMsg("Couldn't read this receipt automatically — fill in the fields manually below.");
        setScanState('warning');
        setTimeout(() => setScanState('idle'), 6000);
      } else {
        setScanState('done');
        setTimeout(() => setScanState('idle'), 2500);
      }
      onExtracted(result, file);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Scan failed — try a clearer photo.');
      setScanState('error');
      setTimeout(() => setScanState('idle'), 4000);
    }
  };

  const label = {
    idle:    'Scan receipt',
    loading: `Scanning… ${progress}%`,
    done:    'Scanned!',
    warning: 'Check photo',
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
          state === 'done'    && 'border-emerald-500 text-emerald-600 bg-emerald-50',
          state === 'warning' && 'border-amber-500 text-amber-700 bg-amber-50',
          state === 'error'   && 'border-destructive text-destructive bg-destructive/5',
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
        ) : state === 'warning' || state === 'error' ? (
          <AlertTriangle className="h-3.5 w-3.5 relative z-10" />
        ) : (
          <ScanLine className="h-3.5 w-3.5 relative z-10" />
        )}
        <span className="relative z-10 text-xs">{label}</span>
      </Button>

      {state === 'warning' && (
        <p className="text-[10px] text-amber-700 leading-tight">{errorMsg}</p>
      )}

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
