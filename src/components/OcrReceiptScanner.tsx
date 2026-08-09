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
  receiptNumber?: string;
  pumpNumber?: string;
  product?: string;
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
//
// Overhauled for Nigerian receipts: red-channel isolation (blue/black ink
// shows up darkest in the red channel while cyan borders vanish), adaptive
// contrast instead of destructive binary thresholding, multi-pass OCR on
// both original and enhanced images, and Nigeria-specific field extraction.
// ---------------------------------------------------------------------------

function extractAmount(text: string): string | undefined {
  const parseCandidate = (raw: string): number | null => {
    const cleaned = raw.replace(/,/g, '').replace(/\.+$/, '');
    const n = parseFloat(cleaned);
    return (!isNaN(n) && n >= 50 && n < 100_000_000) ? n : null;
  };

  // Tier 1: "Grand Total" / "Total" labels — strongest signal
  const grandTotalPat = /(?:grand\s*total|total\s*(?:amount|due|payable|paid))\s*[:\-=\s]*(?:₦|NGN|N|#)?\s*([\d,.]+)/gi;
  const grandTotals: number[] = [];
  for (const m of text.matchAll(grandTotalPat)) {
    const n = parseCandidate(m[1]);
    if (n) grandTotals.push(n);
  }
  if (grandTotals.length > 0) return String(Math.round(grandTotals[grandTotals.length - 1]));

  // Tier 2: "Amount" / "Total" / currency-prefixed
  const labeledPatterns = [
    /(?:amount|amt|total)\s*(?:paid|due|payable)?\s*[:\-=\s]*(?:₦|NGN|N|#)?\s*([\d,.]+)/gi,
    /(?:amount\s*(?:in\s*)?(?:figures?|words?))\s*[:\-=\s]*(?:₦|NGN|N)?\s*([\d,.]+)/gi,
    /₦\s*([\d,.]+)/gi,
    /NGN\s*([\d,.]+)/gi,
  ];
  const labeled: number[] = [];
  for (const re of labeledPatterns) {
    for (const m of text.matchAll(re)) {
      const n = parseCandidate(m[1]);
      if (n) labeled.push(n);
    }
  }
  if (labeled.length > 0) {
    // Prefer the last labeled match (receipts print total last) unless
    // "sub" precedes it — subtotals come before totals.
    const subTotalPat = /sub\s*total\s*[:\-=\s]*(?:₦|NGN|N|#)?\s*([\d,.]+)/gi;
    const subTotals = new Set<number>();
    for (const m of text.matchAll(subTotalPat)) {
      const n = parseCandidate(m[1]);
      if (n) subTotals.add(n);
    }
    const nonSub = labeled.filter((n) => !subTotals.has(n));
    if (nonSub.length > 0) return String(Math.round(nonSub[nonSub.length - 1]));
    return String(Math.round(labeled[labeled.length - 1]));
  }

  // Tier 3: lines containing amount/total keywords
  const lines = text.split('\n');
  const keywordAmounts: number[] = [];
  for (const line of lines) {
    if (/amount|total|price|cost|paid|sum/i.test(line)) {
      const nums = line.match(/[\d,]+(?:\.\d{1,2})?/g);
      if (nums) {
        for (const raw of nums) {
          const n = parseCandidate(raw);
          if (n && n >= 100) keywordAmounts.push(n);
        }
      }
    }
  }
  if (keywordAmounts.length > 0) return String(Math.round(keywordAmounts[keywordAmounts.length - 1]));

  // Tier 4: last large number on the receipt (receipts typically end with total)
  const allNums: number[] = [];
  for (const line of lines) {
    const nums = line.match(/[\d,]+(?:\.\d{1,2})?/g);
    if (nums) {
      for (const raw of nums) {
        const n = parseCandidate(raw);
        if (n && n >= 500) allNums.push(n);
      }
    }
  }
  if (allNums.length > 0) return String(Math.round(allNums[allNums.length - 1]));

  return undefined;
}

function extractUnitPrice(text: string): number | undefined {
  const patterns = [
    /(?:unit\s*price|price\s*per|rate|pump\s*price|p\.?\s*price)\s*[:\-=\s]*(?:₦|NGN|N)?\s*([\d,.]+)/gi,
  ];
  for (const re of patterns) {
    const m = re.exec(text);
    if (m) {
      const n = parseFloat(m[1].replace(/,/g, ''));
      if (!isNaN(n) && n > 0 && n < 50_000) return n;
    }
  }
  return undefined;
}

function extractDate(text: string): string | undefined {
  const monthMap: Record<string, string> = {
    jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
    jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
  };

  const sep = '[/\\-.|lI\\\\]';
  const dateLabel = text.match(
    new RegExp(`(?:date)\\s*[:\\-=\\s]*(\\d{1,2})\\s*${sep}\\s*(\\d{1,2})\\s*${sep}\\s*(\\d{2,4})`, 'i'),
  );
  if (dateLabel) {
    const [, d, m, rawY] = dateLabel;
    const month = parseInt(m);
    const day = parseInt(d);
    const y = rawY.length === 2 ? (parseInt(rawY) > 50 ? `19${rawY}` : `20${rawY}`) : rawY;
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
    }
  }

  const slashMatch = text.match(new RegExp(`\\b(\\d{1,2})\\s*${sep}\\s*(\\d{1,2})\\s*${sep}\\s*(\\d{4})\\b`));
  if (slashMatch) {
    const [, d, m, y] = slashMatch;
    const month = parseInt(m);
    const day = parseInt(d);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
    }
  }

  const shortYearMatch = text.match(new RegExp(`\\b(\\d{1,2})\\s*${sep}\\s*(\\d{1,2})\\s*${sep}\\s*(\\d{2})\\b`));
  if (shortYearMatch) {
    const [, d, m, yy] = shortYearMatch;
    const month = parseInt(m);
    const day = parseInt(d);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      const y = parseInt(yy) > 50 ? `19${yy}` : `20${yy}`;
      return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
    }
  }

  const isoMatch = text.match(new RegExp(`\\b(20\\d{2})\\s*${sep}\\s*(\\d{2})\\s*${sep}\\s*(\\d{2})\\b`));
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
    /(?:liter|litre|ltr)s?\s*[:\-=\s]*(\d{1,4}(?:[.:]\d{1,2})?)/i,
    /(?:litres?|liters?|ltr?s?|volume|qty\s*\(?l\)?)\s*(?:filled|pumped)?\s*[:\-=\s]*(\d{1,4}(?:\.\d{1,2})?)/i,
    /\b(\d{1,4}(?:\.\d{1,2})?)\s*(?:litres?|liters?|ltrs?|ltr)\b/i,
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (m) {
      const cleaned = m[1].replace(':', '.');
      const n = parseFloat(cleaned);
      if (!isNaN(n) && n > 0 && n < 2000) return String(n);
    }
  }
  return undefined;
}

function extractVendor(text: string): string | undefined {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);

  for (const line of lines.slice(0, 8)) {
    const lower = line.toLowerCase();
    if (
      lower.includes('energy') || lower.includes('petroleum') ||
      lower.includes('filling') || lower.includes('station') ||
      lower.includes('oil') || lower.includes('fuel') ||
      lower.includes('gas') || lower.includes('petrol') ||
      lower.includes('nnpc') || lower.includes('mobil') ||
      lower.includes('total') || lower.includes('oando') ||
      lower.includes('ardova') || lower.includes('conoil') ||
      lower.includes('mrs') || lower.includes('rainoil') ||
      lower.includes('forte') || lower.includes('eterna') ||
      lower.includes('chipet') || lower.includes('african petroleum') ||
      lower.includes('a.p.') || lower.includes('a p ') ||
      lower.includes('nipco') || lower.includes('heyden') ||
      lower.includes('shema') || lower.includes('seplat') ||
      lower.includes('services') || lower.includes('limited') ||
      lower.includes('nig') || lower.includes('ltd')
    ) {
      const cleaned = line.replace(/[\[\]{}|]/g, '').trim();
      if (cleaned.length >= 3 && cleaned.length <= 80) return cleaned;
    }
  }

  for (const line of lines.slice(0, 6)) {
    if (line.length < 3 || line.length > 60) continue;
    if (/^[\d\s\W]+$/.test(line)) continue;
    if (/receipt|invoice|tax\s*invoice|sales\s*receipt|no[.:]/i.test(line)) continue;
    if (/tel[.:]/i.test(line)) continue;
    if (/\b(?:no|tel|phone|address)\s*[.:]/i.test(line)) continue;
    return line;
  }
  return undefined;
}

function extractReceiptNumber(text: string): string | undefined {
  const patterns = [
    /(?:receipt|rcpt|inv(?:oice)?|transaction|trans|txn|ref)\s*(?:no|num|number|#|id)?\s*[.:\-=\s]*([A-Z0-9][\w\-/]{3,20})/i,
    /(?:no|num|number)\s*[.:\-=\s]*([A-Z0-9][\w\-/]{3,20})/i,
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (m) {
      const val = m[1].trim();
      if (/\d/.test(val)) return val;
    }
  }
  return undefined;
}

function extractPumpNumber(text: string): string | undefined {
  const patterns = [
    /(?:pump|nozzle|dispenser)\s*(?:no|num|number|#)?\s*[.:\-=\s]*(\d{1,3})/i,
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (m) return m[1];
  }
  return undefined;
}

function extractProduct(text: string): string | undefined {
  const m = text.match(/(?:product|fuel\s*type|type)\s*[:\-=\s]*([a-zA-Z.]{2,20})/i);
  if (m) return m[1].trim();
  const lower = text.toLowerCase();
  if (/\bp\.?\s*m\.?\s*s\b/.test(lower)) return 'PMS';
  if (/\ba\.?\s*g\.?\s*o\b/.test(lower)) return 'AGO';
  if (/\bd\.?\s*p\.?\s*k\b/.test(lower)) return 'DPK';
  return undefined;
}

// ---------------------------------------------------------------------------
// Image preprocessing — red-channel isolation + adaptive contrast
//
// Nigerian fuel receipts: blue/black handwritten ink on white paper with
// cyan/teal printed borders. The red channel makes dark ink stand out
// while cyan borders nearly vanish — much better than naive grayscale.
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
    const w = canvas.width;
    const h = canvas.height;

    const gray = new Uint8Array(w * h);
    for (let i = 0; i < d.length; i += 4) {
      const r = d[i], g = d[i + 1], b = d[i + 2];
      const isCyan = (b > 150 && g > 130 && r < b - 50 && g > r);
      gray[i >> 2] = isCyan ? 255 : Math.round(0.299 * r + 0.587 * g + 0.114 * b);
    }

    const tileW = Math.max(16, w >> 4);
    const tileH = Math.max(16, h >> 4);

    for (let ty = 0; ty < h; ty += tileH) {
      for (let tx = 0; tx < w; tx += tileW) {
        const endX = Math.min(tx + tileW, w);
        const endY = Math.min(ty + tileH, h);
        let tMin = 255, tMax = 0;
        for (let y = ty; y < endY; y++) {
          for (let x = tx; x < endX; x++) {
            const v = gray[y * w + x];
            if (v < tMin) tMin = v;
            if (v > tMax) tMax = v;
          }
        }
        const tRange = tMax - tMin || 1;
        for (let y = ty; y < endY; y++) {
          for (let x = tx; x < endX; x++) {
            const idx = y * w + x;
            gray[idx] = Math.round(((gray[idx] - tMin) / tRange) * 255);
          }
        }
      }
    }

    for (let i = 0; i < gray.length; i++) {
      const pi = i << 2;
      d[pi] = d[pi + 1] = d[pi + 2] = gray[i];
    }

    ctx.putImageData(imageData, 0, 0);
    const blob: Blob | null = await new Promise(r => canvas.toBlob(r, 'image/png'));
    if (!blob) return file;
    return new File([blob], file.name, { type: 'image/png' });
  } catch {
    return file;
  }
}

async function preprocessGrayscaleOnly(file: File): Promise<File> {
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
      const r = d[i], g = d[i + 1], b = d[i + 2];
      const isCyan = (b > 150 && g > 130 && r < b - 50 && g > r);
      const v = isCyan ? 255 : Math.round(0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]);
      d[i] = d[i + 1] = d[i + 2] = v;
      if (v < min) min = v;
      if (v > max) max = v;
    }
    const range = max - min || 1;
    for (let i = 0; i < d.length; i += 4) {
      const stretched = Math.min(255, Math.max(0,
        Math.round(((d[i] - min) / range) * 255),
      ));
      d[i] = d[i + 1] = d[i + 2] = stretched;
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
// Multi-pass OCR: run Tesseract on multiple preprocessed versions and merge
// ---------------------------------------------------------------------------

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    promise.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); },
    );
  });
}

function pickBest(a: string | undefined, b: string | undefined): string | undefined {
  if (a && !b) return a;
  if (b && !a) return b;
  if (!a && !b) return undefined;
  const na = parseFloat(a!.replace(/,/g, ''));
  const nb = parseFloat(b!.replace(/,/g, ''));
  if (!isNaN(na) && !isNaN(nb)) {
    if (na === nb) return a;
    // If both agree within 15%, prefer the larger (likely the total, not
    // a subtotal or unit price). If they diverge wildly, prefer the value
    // that looks like a plausible total (not suspiciously round, within
    // a reasonable fuel receipt range).
    const ratio = Math.max(na, nb) / Math.min(na, nb);
    if (ratio < 1.15) return na >= nb ? a : b;
    const aRound = /^[1-9]\d*0{2,}$/.test(String(Math.round(na)));
    const bRound = /^[1-9]\d*0{2,}$/.test(String(Math.round(nb)));
    if (aRound !== bRound) return aRound ? b : a;
    return na >= nb ? a : b;
  }
  return (a!.length >= b!.length) ? a : b;
}

async function runTesseractOnImage(
  image: File,
  shouldExtractLitres: boolean,
): Promise<{ result: OcrResult; rawText: string }> {
  const worker = await withTimeout(
    createWorker('eng', 1),
    45_000,
    'OCR engine took too long to load.',
  );

  try {
    await worker.setParameters({
      tessedit_pageseg_mode: '3' as any,
      preserve_interword_spaces: '1',
    });
  } catch {
    // parameter setting is best-effort
  }

  const { data: { text } } = await withTimeout(
    worker.recognize(image),
    30_000,
    'Scan took too long. Try a clearer photo.',
  );
  await worker.terminate();

  const amount_ngn = extractAmount(text);
  const litres = shouldExtractLitres ? extractLitresFromText(text) : undefined;
  const date = extractDate(text);
  const description = extractVendor(text);
  const unitPrice = extractUnitPrice(text);
  const product = extractProduct(text);
  const receiptNumber = extractReceiptNumber(text);
  const pumpNumber = extractPumpNumber(text);

  let crossValidatedAmount = amount_ngn;
  if (!crossValidatedAmount && litres && unitPrice) {
    const computed = parseFloat(litres) * unitPrice;
    if (computed >= 50 && computed < 100_000_000) {
      crossValidatedAmount = String(Math.round(computed));
    }
  }
  let crossValidatedLitres = litres;
  if (!crossValidatedLitres && crossValidatedAmount && unitPrice && unitPrice > 0) {
    const computed = parseFloat(crossValidatedAmount) / unitPrice;
    if (computed > 0 && computed < 2000) {
      crossValidatedLitres = String(Math.round(computed * 100) / 100);
    }
  }

  const lowConfidence = !crossValidatedAmount && !crossValidatedLitres;

  return {
    result: {
      amount_ngn: crossValidatedAmount,
      date,
      description,
      litres: shouldExtractLitres ? crossValidatedLitres : undefined,
      lowConfidence,
      receiptNumber,
      pumpNumber,
      product,
    },
    rawText: text,
  };
}

async function runTesseractFallback(
  file: File,
  shouldExtractLitres: boolean,
): Promise<OcrResult> {
  const [enhanced, grayscale] = await Promise.all([
    preprocessForOcr(file),
    preprocessGrayscaleOnly(file),
  ]);

  const [passA, passB, passC] = await Promise.all([
    runTesseractOnImage(enhanced, shouldExtractLitres).catch(() => null),
    runTesseractOnImage(grayscale, shouldExtractLitres).catch(() => null),
    runTesseractOnImage(file, shouldExtractLitres).catch(() => null),
  ]);

  const passes = [passA, passB, passC].filter(Boolean);
  if (passes.length === 0) {
    throw new Error('All OCR passes failed.');
  }

  const results = passes.map(p => p!.result);
  const texts = passes.map(p => p!.rawText);

  let bestAmount: string | undefined;
  let bestDate: string | undefined;
  let bestDesc: string | undefined;
  let bestLitres: string | undefined;
  let bestReceiptNum: string | undefined;
  let bestPumpNum: string | undefined;
  let bestProduct: string | undefined;
  for (const r of results) {
    bestAmount = pickBest(bestAmount, r.amount_ngn);
    bestDate = bestDate || r.date;
    bestDesc = pickBest(bestDesc, r.description);
    if (shouldExtractLitres) bestLitres = pickBest(bestLitres, r.litres);
    bestReceiptNum = bestReceiptNum || r.receiptNumber;
    bestPumpNum = bestPumpNum || r.pumpNumber;
    bestProduct = bestProduct || r.product;
  }

  const merged: OcrResult = {
    amount_ngn: bestAmount,
    date: bestDate,
    description: bestDesc,
    litres: shouldExtractLitres ? bestLitres : undefined,
    lowConfidence: false,
    rawText: texts.filter(Boolean).join('\n---\n'),
    receiptNumber: bestReceiptNum,
    pumpNumber: bestPumpNum,
    product: bestProduct,
  };
  merged.lowConfidence = !merged.amount_ngn && !merged.litres;

  return merged;
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
    // can't extract decision-critical fields or isn't available.
    // Runs two OCR passes (binarized + grayscale) and merges results.
    setScanState('fallback');
    try {
      const fallbackResult = await runTesseractFallback(file, !!shouldExtractLitres);

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
        rawText: aiResult?.rawText || fallbackResult.rawText,
      };

      if (merged.lowConfidence) {
        const msg = notConfigured
          ? "Scan couldn't read amount or litres — fill them in manually below."
          : "Scan couldn't read amount or litres — fill them in manually below.";
        setErrorMsg(msg);
        setScanState('warning');
        setTimeout(() => setScanState('idle'), 8000);
      } else {
        setScanState('done');
        setTimeout(() => setScanState('idle'), 3000);
      }
      onExtracted(merged, file);
    } catch (err: any) {
      if (aiResult) {
        if (!shouldExtractLitres) delete aiResult.litres;
        setErrorMsg("Scan couldn't read amount or litres — fill them in manually below.");
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
