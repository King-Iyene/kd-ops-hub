/**
 * OcrReceiptScanner
 *
 * Drop-in button for receipt forms. When clicked it opens a file picker
 * (camera on mobile, file browser on desktop).
 *
 * Two-tier scanning:
 *   1. PRIMARY — Google Document AI via the extract-receipt edge function.
 *      High accuracy on messy real-world receipts (thermal paper, faded ink,
 *      handwritten amounts). Cost: free tier covers 1,000 pages/month.
 *   2. FALLBACK — Tesseract.js in-browser OCR. Zero cost, no API key,
 *      no server call. Activated only when Document AI is unavailable
 *      (secrets not set, network error, or quota exceeded).
 *
 * Features:
 *   - Receipt type auto-detection (fuel / repair / parts / general)
 *   - Per-field confidence indicators from Document AI
 *   - Image quality pre-check (dimensions, file size)
 *   - Line item extraction for detailed receipts
 *   - Retry on transient failures
 */

import { useRef, useState, useCallback } from 'react';
import { createWorker } from 'tesseract.js';
import { ScanLine, Loader2, CheckCircle2, AlertTriangle, RotateCcw, FileWarning } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface OcrResult {
  amount_ngn?: string;
  date?: string;
  description?: string;
  litres?: string;
  lowConfidence?: boolean;
  receiptType?: 'fuel' | 'repair' | 'parts' | 'general';
  currency?: string;
  lineItems?: Array<{ description: string; amount?: string; quantity?: string }>;
  confidence?: {
    amount?: number;
    date?: number;
    vendor?: number;
    overall?: number;
  };
  rawText?: string;
}

interface Props {
  onExtracted: (result: OcrResult, file: File) => void;
  className?: string;
  extractLitres?: boolean;
}

// ---------------------------------------------------------------------------
// Image quality pre-check
// ---------------------------------------------------------------------------

interface QualityCheck {
  ok: boolean;
  warning?: string;
}

async function checkImageQuality(file: File): Promise<QualityCheck> {
  if (file.size > 10 * 1024 * 1024) {
    return { ok: false, warning: 'Image is too large (max 10 MB). Try a smaller photo.' };
  }
  if (file.size < 10 * 1024) {
    return { ok: true, warning: 'Very small image — text may be hard to read.' };
  }
  try {
    const bitmap = await createImageBitmap(file);
    const minDim = Math.min(bitmap.width, bitmap.height);
    if (minDim < 200) {
      return { ok: true, warning: 'Low resolution — results may be less accurate.' };
    }
  } catch {
    // Can't check dimensions — proceed anyway
  }
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Tier 1: Google Document AI (primary)
// ---------------------------------------------------------------------------

async function callDocumentAi(
  file: File,
): Promise<{ result: OcrResult | null; reason: string; notConfigured?: boolean }> {
  try {
    const buffer = await file.slice(0, 10 * 1024 * 1024).arrayBuffer();
    const bytes = new Uint8Array(buffer);
    let binary = '';
    const chunkSize = 8192;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      const chunk = bytes.subarray(i, i + chunkSize);
      binary += String.fromCharCode(...chunk);
    }
    const image_base64 = btoa(binary);

    const { data, error } = await supabase.functions.invoke('extract-receipt', {
      body: { image_base64, mime_type: file.type || 'image/jpeg' },
    });

    if (error) {
      return { result: null, reason: `Server error: ${error.message || 'unknown'}` };
    }
    if (!data?.ok) {
      return { result: null, reason: data?.error || 'Server returned an error' };
    }
    if (data.dev_skip) {
      return {
        result: null,
        reason: 'Document AI not configured',
        notConfigured: true,
      };
    }

    const parseNum = (v: unknown): string | undefined => {
      if (!v) return undefined;
      const cleaned = String(v).replace(/[^0-9.]/g, '');
      const n = parseFloat(cleaned);
      return !isNaN(n) && n > 0 ? String(Math.round(n)) : undefined;
    };

    const parseLitres = (v: unknown): string | undefined => {
      if (!v) return undefined;
      const cleaned = String(v).replace(/[^0-9.]/g, '');
      const n = parseFloat(cleaned);
      return !isNaN(n) && n > 0 ? String(n) : undefined;
    };

    const amount_ngn = parseNum(data.amount_ngn);
    const litres = parseLitres(data.litres);
    const hasDecisionFields = !!(amount_ngn || litres);

    return {
      result: {
        amount_ngn,
        date: data.date || undefined,
        description: data.vendor || undefined,
        litres,
        lowConfidence: !hasDecisionFields,
        receiptType: data.receipt_type || undefined,
        currency: data.currency || undefined,
        lineItems: data.line_items || undefined,
        confidence: data.confidence || undefined,
        rawText: data.raw_text || undefined,
      },
      reason: 'ok',
    };
  } catch (err: any) {
    return { result: null, reason: err?.message || 'Network error calling receipt scanner' };
  }
}

// ---------------------------------------------------------------------------
// Tier 2: Tesseract.js in-browser fallback (free, zero API cost)
// ---------------------------------------------------------------------------

function extractAmount(text: string): string | undefined {
  const patterns = [
    /₦\s*([\d,]+(?:\.\d{1,2})?)/gi,
    /NGN\s*([\d,]+(?:\.\d{1,2})?)/gi,
    /(?:total|amount|grand\s*total|sub\s*total|amt)\s*[:\-=]?\s*(?:₦|NGN|N)?\s*([\d,]+(?:\.\d{1,2})?)/gi,
    /(?:amount\s*(?:in\s*)?(?:figures?|words?))\s*[:\-=]?\s*(?:₦|NGN|N)?\s*([\d,]+(?:\.\d{1,2})?)/gi,
  ];
  const candidates: number[] = [];
  for (const re of patterns) {
    for (const m of text.matchAll(re)) {
      const cleaned = m[1].replace(/,/g, '');
      const n = parseFloat(cleaned);
      if (!isNaN(n) && n > 0 && n < 100_000_000) candidates.push(n);
    }
  }
  if (candidates.length > 0) return String(Math.round(Math.max(...candidates)));

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

  const slashMatch = text.match(/\b(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})\b/);
  if (slashMatch) {
    const [, d, m, y] = slashMatch;
    const month = parseInt(m);
    const day = parseInt(d);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
    }
  }

  const shortYearMatch = text.match(/\b(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2})\b/);
  if (shortYearMatch) {
    const [, d, m, yy] = shortYearMatch;
    const month = parseInt(m);
    const day = parseInt(d);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      const y = parseInt(yy) > 50 ? `19${yy}` : `20${yy}`;
      return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
    }
  }

  const isoMatch = text.match(/\b(20\d{2})[\/\-](\d{2})[\/\-](\d{2})\b/);
  if (isoMatch) {
    const [, y, m, d] = isoMatch;
    return `${y}-${m}-${d}`;
  }

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

function extractLitresFromText(text: string): string | undefined {
  const patterns = [
    /(?:litres?|liters?|ltr?s?|volume|qty\s*\(?l\)?)\s*(?:filled|pumped)?\s*[:\-=]?\s*(\d{1,4}(?:\.\d{1,2})?)/i,
    /\b(\d{1,4}(?:\.\d{1,2})?)\s*(?:litres?|liters?|ltrs?|ltr)\b/i,
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (m) {
      const n = parseFloat(m[1]);
      if (!isNaN(n) && n > 0 && n < 2000) return String(n);
    }
  }
  return undefined;
}

function extractVendor(text: string): string | undefined {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  for (const line of lines.slice(0, 6)) {
    if (line.length < 3) continue;
    if (/^[\d\s\W]+$/.test(line)) continue;
    if (/receipt|invoice|tax\s*invoice/i.test(line)) continue;
    if (line.length > 60) continue;
    return line;
  }
  return undefined;
}

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

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    promise.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); },
    );
  });
}

async function runTesseractFallback(
  file: File,
  shouldExtractLitres: boolean,
): Promise<OcrResult> {
  const processed = await preprocessForOcr(file);

  const worker = await withTimeout(
    createWorker('eng', 1),
    45_000,
    'OCR engine took too long to load.',
  );

  const { data: { text } } = await withTimeout(
    worker.recognize(processed),
    30_000,
    'Scan took too long. Try a clearer photo.',
  );
  await worker.terminate();

  const amount_ngn = extractAmount(text);
  const litres = shouldExtractLitres ? extractLitresFromText(text) : undefined;
  const date = extractDate(text);
  const description = extractVendor(text);
  const lowConfidence = !amount_ngn && !litres;

  return { amount_ngn, date, description, litres, lowConfidence };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

type ScanState = 'idle' | 'checking' | 'scanning' | 'fallback' | 'done' | 'warning' | 'error';

export function OcrReceiptScanner({ onExtracted, className, extractLitres: shouldExtractLitres }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [state, setScanState] = useState<ScanState>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [qualityWarning, setQualityWarning] = useState('');
  const [lastFile, setLastFile] = useState<File | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  const handleFile = useCallback(async (file: File, isRetry = false) => {
    if (!file.type.startsWith('image/')) {
      setErrorMsg('Pick a JPEG or PNG image to scan.');
      setScanState('error');
      return;
    }

    setLastFile(file);
    setErrorMsg('');
    setQualityWarning('');
    setScanState('checking');

    const quality = await checkImageQuality(file);
    if (!quality.ok) {
      setErrorMsg(quality.warning || 'Image quality too low.');
      setScanState('error');
      return;
    }
    if (quality.warning) {
      setQualityWarning(quality.warning);
    }

    setScanState('scanning');

    // Tier 1: Google Document AI
    const { result: aiResult, reason, notConfigured } = await callDocumentAi(file);

    if (aiResult && !aiResult.lowConfidence) {
      if (!shouldExtractLitres) delete aiResult.litres;
      setScanState('done');
      setTimeout(() => setScanState('idle'), 3000);
      onExtracted(aiResult, file);
      return;
    }

    // Tier 2: Free in-browser fallback (Tesseract.js) when Document AI
    // can't extract decision-critical fields or isn't available
    setScanState('fallback');
    try {
      const fallbackResult = await runTesseractFallback(file, !!shouldExtractLitres);

      // Merge: prefer AI results for fields it found, fill gaps from Tesseract
      const merged: OcrResult = {
        amount_ngn: aiResult?.amount_ngn || fallbackResult.amount_ngn,
        date: aiResult?.date || fallbackResult.date,
        description: aiResult?.description || fallbackResult.description,
        litres: shouldExtractLitres
          ? (aiResult?.litres || fallbackResult.litres)
          : undefined,
        lowConfidence: !(aiResult?.amount_ngn || fallbackResult.amount_ngn) &&
                       !(aiResult?.litres || fallbackResult.litres),
        receiptType: aiResult?.receiptType,
        currency: aiResult?.currency,
        lineItems: aiResult?.lineItems,
        confidence: aiResult?.confidence,
        rawText: aiResult?.rawText,
      };

      if (merged.lowConfidence) {
        const msg = notConfigured
          ? "Scanner not fully configured — fill in the fields manually."
          : "Couldn't read this receipt clearly — fill in the fields manually below.";
        setErrorMsg(msg);
        setScanState('warning');
        setTimeout(() => setScanState('idle'), 8000);
      } else {
        setScanState('done');
        setTimeout(() => setScanState('idle'), 3000);
      }
      onExtracted(merged, file);
    } catch (err: any) {
      // Tesseract also failed — return whatever AI got, or lowConfidence
      if (aiResult) {
        if (!shouldExtractLitres) delete aiResult.litres;
        setErrorMsg("Couldn't read this receipt clearly — fill in the fields manually below.");
        setScanState('warning');
        setTimeout(() => setScanState('idle'), 8000);
        onExtracted(aiResult, file);
      } else {
        setErrorMsg(reason || err?.message || 'Scan failed — try a clearer photo.');
        setScanState('error');
        if (!isRetry) setRetryCount(0);
      }
    }
  }, [onExtracted, shouldExtractLitres]);

  const handleRetry = useCallback(() => {
    if (lastFile && retryCount < 2) {
      setRetryCount((c) => c + 1);
      handleFile(lastFile, true);
    }
  }, [lastFile, retryCount, handleFile]);

  const label = {
    idle: 'Scan receipt',
    checking: 'Checking image…',
    scanning: 'Reading receipt…',
    fallback: 'Trying backup scanner…',
    done: 'Scanned!',
    warning: 'Partially read',
    error: errorMsg || 'Scan failed',
  }[state];

  const canRetry = state === 'error' && lastFile && retryCount < 2;

  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <div className="flex items-center gap-1.5">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={cn(
            'gap-2 relative overflow-hidden',
            state === 'done' && 'border-emerald-500 text-emerald-600 bg-emerald-50',
            state === 'warning' && 'border-amber-500 text-amber-700 bg-amber-50',
            state === 'error' && 'border-destructive text-destructive bg-destructive/5',
          )}
          disabled={state === 'checking' || state === 'scanning' || state === 'fallback'}
          onClick={() => {
            setScanState('idle');
            setQualityWarning('');
            inputRef.current?.click();
          }}
        >
          {state === 'checking' || state === 'scanning' || state === 'fallback' ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : state === 'done' ? (
            <CheckCircle2 className="h-3.5 w-3.5" />
          ) : state === 'warning' ? (
            <FileWarning className="h-3.5 w-3.5" />
          ) : state === 'error' ? (
            <AlertTriangle className="h-3.5 w-3.5" />
          ) : (
            <ScanLine className="h-3.5 w-3.5" />
          )}
          <span className="text-xs">{label}</span>
        </Button>

        {canRetry && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="gap-1.5 text-xs h-8 px-2"
            onClick={handleRetry}
          >
            <RotateCcw className="h-3 w-3" />
            Retry
          </Button>
        )}
      </div>

      {state === 'warning' && (
        <p className="text-[10px] text-amber-700 leading-tight">{errorMsg}</p>
      )}

      {qualityWarning && (state === 'scanning' || state === 'fallback' || state === 'done' || state === 'warning') && (
        <p className="text-[10px] text-muted-foreground leading-tight">{qualityWarning}</p>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) {
            setRetryCount(0);
            handleFile(f);
          }
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
