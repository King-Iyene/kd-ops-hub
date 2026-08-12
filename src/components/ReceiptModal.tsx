/**
 * ReceiptModal
 *
 * In-app receipt for a batch_item. Replaces the previous flow that opened
 * a brand-new browser window — that meant the URL bar showed `blob:`,
 * print/download/share were attached to the receipt's own JS context, and
 * mobile browsers blocked the popup. Rendering inside KD Ops removes all
 * of those problems.
 *
 * Three actions:
 *   - Print:    window.print() with @media print rules that hide the rest
 *               of the app, leaving just the .kd-receipt block on paper.
 *   - Download: html2canvas → PNG → triggers a download in this same tab.
 *   - Share:    Web Share API with the rendered PNG attached. Falls back
 *               to copying the cert ID on browsers without share support.
 *
 * The receipt itself sits on a solid brand-blue field with a faded
 * status watermark behind the white card (SUCCESSFUL / FAILED / PENDING /
 * REVERSED) so the outcome is unmissable even if the small status pill is
 * overlooked.
 */
import { useEffect, useRef, useState } from 'react';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Download, Printer, Share2, X, FileImage, FileText, ChevronDown,
} from 'lucide-react';
import { formatReceiptDateTime } from '@/lib/format';
import { stampDutyFor } from '@/lib/paystack';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/hooks/use-toast';
import {
  providerOf,
  providerLabel,
  itemReference,
  itemFeeNgn,
  itemFeeSource,
  friendlyProviderError,
  verifyItem,
} from '@/lib/payments/item-facade';
import { receiptTheme, hexToRgba } from '@/lib/receipt-theme';

interface Props {
  open: boolean;
  onClose: () => void;
  item: any;
  batch: any;
  companyName?: string;
  logoUrl?: string | null;
  /** Override the brand accent (header bar, status bar, section labels).
   *  Used by Principal Disbursements to give its receipts a distinct
   *  identity from a regular payroll/vendor receipt — pass both ends of
   *  the backdrop gradient together or not at all. */
  brand?: string;
  brandDark?: string;
  /** Swap the colored backdrop for a plain neutral panel — the brand
   *  identity still shows on the white card itself (dot texture, logo
   *  watermark, accent bar), it just isn't repeated as a big solid block
   *  behind it too. Default false keeps the existing payroll receipt. */
  neutralBackdrop?: boolean;
  /** Heavier brand presence on the card itself — thicker top accent bar
   *  plus a solid brand-colored left edge — for a receipt that should read
   *  as a step up from the standard payroll receipt without changing hue. */
  bold?: boolean;
}

const fmtNgn = (n: number) => `₦${n.toLocaleString('en-NG', { minimumFractionDigits: 2 })}`;

// Same palette as the print receipts (BatchDetail.tsx / Payroll.tsx) so a
// batch's PDF summary and its individual item receipts read as one document
// family instead of drifting to separate, unrelated color sets.
function statusInfo(status: string) {
  if (status === 'succeeded' || status === 'processed' || status === 'completed') {
    return { label: 'SUCCESSFUL', dot: receiptTheme.success, tone: 'success' as const };
  }
  if (status === 'failed' || status === 'rejected') {
    return { label: 'FAILED', dot: receiptTheme.failed, tone: 'failed' as const };
  }
  if (status === 'reversed' || status === 'refunded') {
    return { label: 'REVERSED', dot: receiptTheme.muted, tone: 'reversed' as const };
  }
  return { label: 'PENDING', dot: receiptTheme.pending, tone: 'pending' as const };
}

export function ReceiptModal({ open, onClose, item, batch, companyName, logoUrl, brand, brandDark, neutralBackdrop, bold }: Props) {
  const cardRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();
  const [busy, setBusy] = useState<'download' | 'share' | null>(null);
  const BRAND = brand || receiptTheme.brand;
  const BRAND_DARK = brandDark || '#00547a';
  const backdropBg = neutralBackdrop
    ? `linear-gradient(180deg, #f4f2f7 0%, #e9e6ef 100%)`
    : `linear-gradient(180deg, ${BRAND} 0%, ${BRAND_DARK} 100%)`;
  const backdropWatermarkColor = neutralBackdrop ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.10)';
  const closeBtnStyle = neutralBackdrop
    ? { border: '1px solid rgba(0,0,0,0.12)', background: 'rgba(0,0,0,0.05)', color: '#333' }
    : { border: '1px solid rgba(255,255,255,0.25)', background: 'rgba(255,255,255,0.10)', color: '#fff' };

  // The webhook normally writes the fee column (paystack_fee_ngn or
  // flutterwave_fee_ngn) when the transfer succeeds, and the reconcile job
  // backfills any rows that miss the webhook. This is the third safety net:
  // when the receipt is opened for a succeeded transfer that still has no
  // fee on file, fetch it straight from the CORRECT provider via
  // verifyItem() (routes to paystack-transfer or flutterwave-transfer based
  // on item.provider) and persist the result back to the row. Previously
  // this always called paystack-transfer regardless of provider — for a
  // Flutterwave item that meant verifying against the wrong API with a
  // NULL reference, so the fee row silently never backfilled.
  const [feeOverride, setFeeOverride] = useState<number | null>(null);
  useEffect(() => {
    if (!open || !item) return;
    const isSucceeded = item.status === 'succeeded' || item.status === 'processed';
    const hasFee = itemFeeSource(item) === 'actual';
    const hasRef = !!itemReference(item);
    if (!isSucceeded || hasFee || !hasRef) return;
    let cancelled = false;
    (async () => {
      try {
        const result = await verifyItem(item);
        if (cancelled || !result.ok) return;
        const fee = Number(result.fee_ngn || 0);
        if (fee > 0) {
          setFeeOverride(fee);
          // Persist back so subsequent opens are instant and the
          // ledger / Transactions table also see the real value.
          // Branched (not a computed key) because a dynamic property name
          // widens to a generic `{ [x: string]: number }` index signature,
          // which supabase-js's Update<'batch_items'> type can't verify
          // against its known columns — TS2345 on every build.
          if (providerOf(item) === 'flutterwave') {
            await supabase.from('batch_items').update({ flutterwave_fee_ngn: fee }).eq('id', item.id);
          } else {
            await supabase.from('batch_items').update({ paystack_fee_ngn: fee }).eq('id', item.id);
          }
        }
      } catch (e) {
        // Silent — receipt still renders, just without the fee row
        // populated. Operators can hit Reconcile from Payments instead.
        console.warn('[receipt] fee backfill failed:', e);
      }
    })();
    return () => { cancelled = true; };
  }, [open, item?.id, item?.status, item?.paystack_reference, item?.flutterwave_reference, item?.paystack_fee_ngn, item?.flutterwave_fee_ngn]);

  if (!item) return null;

  const s = statusInfo(item.status);
  const isSucceeded = item.status === 'succeeded' || item.status === 'processed';

  const txnDateStr = item.processed_at || item.created_at
    ? formatReceiptDateTime(item.processed_at || item.created_at)
    : '—';
  // Priority: per-item override → the exact string the worker sent to Paystack
  // (payment_narration_at_dispatch) → legacy description/notes → last-resort
  // brand + batch name. Reading the snapshot column is critical because
  // that's what the recipient's bank statement actually says — showing
  // batch.name here (as we used to) let the receipt disagree with reality.
  const narration =
    item.narration
    || batch?.payment_narration_at_dispatch
    || batch?.description
    || batch?.notes
    || `${companyName || 'KDOps'} · ${batch?.name || 'batch'}`;

  const amount = Number(item.amount_ngn) || 0;
  // Transfer fee resolution — provider-aware via the facade, so a
  // Flutterwave item reads flutterwave_fee_ngn / flutterwave_raw.fee
  // instead of always falling through to the Paystack columns (which are
  // NULL/0 for Flutterwave items, previously making the receipt show a
  // wrong or missing fee for anything not paid via Paystack).
  const psFee = feeOverride ?? itemFeeNgn(item);
  const duty = stampDutyFor(amount);
  const total = amount + psFee + duty;
  const paidVia = providerLabel(providerOf(item));
  const internalRef = item.id ? String(item.id).toLowerCase().replace(/-/g, '') : '—';
  const certId = `kdops_${internalRef}`;
  const shortName = (companyName || 'KD Squares').replace(/\s*Ltd\.?$/i, '').trim();
  const fileSafe = (str: string) => str.replace(/[^a-z0-9_-]+/gi, '_').slice(0, 40) || 'receipt';
  const filename = `kdops_receipt_${fileSafe(item.full_name || certId)}.png`;

  // Render the receipt card to a high-DPI canvas. Used by both the
  // PNG and PDF paths so the visual is identical between the two
  // formats — the PDF is just the same image dropped onto an A4
  // page so it prints correctly on Nigerian printer defaults.
  const renderToCanvas = async (): Promise<HTMLCanvasElement | null> => {
    const node = cardRef.current;
    if (!node) return null;
    return html2canvas(node, {
      backgroundColor: '#ffffff',
      scale: 2,
      useCORS: true,
      logging: false,
    });
  };

  const renderToBlob = async (): Promise<Blob | null> => {
    const canvas = await renderToCanvas();
    if (!canvas) return null;
    return new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), 'image/png', 0.96),
    );
  };

  // Generate a single-page A4 PDF with the receipt PNG centred and
  // scaled to fit the page width with reasonable margins. jsPDF takes
  // dimensions in mm; A4 is 210x297. 16mm margin on each side leaves
  // 178mm for the receipt — comfortable for both screen viewing and
  // a printed copy.
  const renderToPdfBlob = async (): Promise<Blob | null> => {
    const canvas = await renderToCanvas();
    if (!canvas) return null;
    const dataUrl = canvas.toDataURL('image/png', 0.96);
    const pdf = new jsPDF({
      unit: 'mm',
      format: 'a4',
      orientation: 'portrait',
      compress: true,
    });
    const pageW = 210;
    const pageH = 297;
    const margin = 16;
    const maxW = pageW - margin * 2;
    const ratio = canvas.width / canvas.height;
    let imgW = maxW;
    let imgH = imgW / ratio;
    // Cap height too — receipts are tall but should still fit on one
    // page if at all possible.
    const maxH = pageH - margin * 2;
    if (imgH > maxH) {
      imgH = maxH;
      imgW = imgH * ratio;
    }
    const x = (pageW - imgW) / 2;
    const y = (pageH - imgH) / 2;
    pdf.addImage(dataUrl, 'PNG', x, y, imgW, imgH, undefined, 'FAST');
    return pdf.output('blob');
  };

  const filenameFor = (kind: 'png' | 'pdf') =>
    filename.replace(/\.png$/i, kind === 'pdf' ? '.pdf' : '.png');

  const handlePrint = () => {
    // Clone the receipt card into a body-level container BEFORE we hide
    // everything else, because Radix's Dialog portal sits at a different
    // place in the DOM and our @media print rules can't easily target it.
    const source = cardRef.current;
    if (!source) {
      window.print();
      return;
    }

    const target = document.createElement('div');
    target.id = 'kd-print-target';
    target.appendChild(source.cloneNode(true));
    document.body.appendChild(target);
    document.body.classList.add('kd-receipt-printing');

    const restore = () => {
      document.body.classList.remove('kd-receipt-printing');
      target.remove();
      window.removeEventListener('afterprint', restore);
    };
    window.addEventListener('afterprint', restore);
    // Slight delay so the layout settles before the print dialog opens.
    setTimeout(() => window.print(), 60);
  };

  const handleDownload = async (kind: 'png' | 'pdf') => {
    setBusy('download');
    try {
      const blob = kind === 'pdf' ? await renderToPdfBlob() : await renderToBlob();
      if (!blob) throw new Error('Could not render receipt');
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filenameFor(kind);
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      toast({ title: kind === 'pdf' ? 'Receipt PDF downloaded' : 'Receipt image downloaded' });
    } catch (err: any) {
      toast({ title: 'Download failed', description: err?.message || 'Try Print instead.', variant: 'destructive' });
    } finally {
      setBusy(null);
    }
  };

  const handleShare = async (kind: 'png' | 'pdf') => {
    setBusy('share');
    try {
      const blob = kind === 'pdf' ? await renderToPdfBlob() : await renderToBlob();
      const mime = kind === 'pdf' ? 'application/pdf' : 'image/png';
      const file = blob ? new File([blob], filenameFor(kind), { type: mime }) : null;
      if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          title: `KDOps Receipt — ${item.full_name || ''}`,
          text: `Payment receipt for ${item.full_name || ''} — ${fmtNgn(amount)}`,
          files: [file],
        });
      } else if (navigator.share) {
        await navigator.share({
          title: `KDOps Receipt — ${item.full_name || ''}`,
          text: `Payment receipt for ${item.full_name || ''} — ${fmtNgn(amount)} (${certId})`,
        });
      } else if (blob) {
        // Desktop browser without Web Share — fall back to download
        // so the operator still gets the file. Better than copying a
        // bare reference ID with no context.
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filenameFor(kind);
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 5000);
        toast({
          title: 'Share unavailable on this browser',
          description: `Saved as ${kind.toUpperCase()} — attach it to your email / chat manually.`,
        });
      } else {
        await navigator.clipboard.writeText(certId);
        toast({ title: 'Receipt ID copied', description: 'On mobile a share sheet would open.' });
      }
    } catch {
      // user cancelled or share failed silently — no toast.
    } finally {
      setBusy(null);
    }
  };

  // Inline styles keep print rules contained — Tailwind classes get
  // stripped/changed in print, but inline styles survive intact.
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent
        className="kd-receipt-dialog max-w-[640px] p-0 border-0 bg-transparent shadow-none max-h-[92vh] overflow-y-auto"
      >
        {/* Backdrop = solid brand blue (no glass), with faint status watermark */}
        <div
          className="kd-receipt-backdrop"
          style={{
            position: 'relative',
            background: backdropBg,
            padding: '24px 18px',
            borderRadius: '16px',
            overflow: 'hidden',
          }}
        >
          {/* Status watermark — large, faded diagonal stamp behind the card */}
          <div
            aria-hidden
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              pointerEvents: 'none',
              transform: 'rotate(-18deg)',
              fontFamily: 'Inter, system-ui, sans-serif',
              fontWeight: 900,
              fontSize: 'clamp(80px, 14vw, 120px)',
              letterSpacing: '0.04em',
              color: backdropWatermarkColor,
              whiteSpace: 'nowrap',
            }}
          >
            {s.label}
          </div>

          {/* Close button — top-right of the dialog backdrop */}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close receipt"
            className="kd-receipt-close"
            style={{
              position: 'absolute',
              top: '12px',
              right: '12px',
              height: '32px',
              width: '32px',
              borderRadius: '8px',
              ...closeBtnStyle,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              zIndex: 5,
            }}
          >
            <X size={16} />
          </button>

          {/* The receipt card itself — captured for download / share */}
          <div
            ref={cardRef}
            id="kd-receipt-card"
            style={{
              position: 'relative',
              maxWidth: '560px',
              margin: '0 auto',
              // Subtle brand-tinted dot pattern on the white card —
              // "engineered paper" feel without overpowering content.
              // Only tinted/varied when `bold` (Principal Disbursements) —
              // the default (regular payroll/vendor receipt) keeps the
              // exact original hardcoded value, unchanged.
              background: bold
                ? `radial-gradient(circle, ${hexToRgba(BRAND, 0.05)} 1px, transparent 1.4px) 0 0/14px 14px, #ffffff`
                : `radial-gradient(circle, rgba(0,105,148,0.045) 1px, transparent 1.4px) 0 0/14px 14px, #ffffff`,
              borderRadius: '12px',
              overflow: 'hidden',
              boxShadow: '0 1px 3px rgba(0,0,0,0.08), 0 18px 40px -12px rgba(0,0,0,0.45)',
              fontFamily: 'Inter, system-ui, sans-serif',
              color: '#18181b',
              zIndex: 1,
            }}
          >
            {/* In-card status watermark — faded "SUCCESSFUL" / "FAILED" /
                "REVERSED" / "PENDING" stamp diagonally across the card body.
                Sits behind the content (z-index 0) so the receipt rows still
                read crisply on top. Coloured by the outcome so a glance
                tells you whether this transfer worked or not. */}
            <div
              aria-hidden
              style={{
                position: 'absolute',
                inset: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                pointerEvents: 'none',
                transform: 'rotate(-18deg)',
                fontFamily: 'Inter, system-ui, sans-serif',
                fontWeight: 900,
                fontSize: 'clamp(64px, 11vw, 100px)',
                letterSpacing: '0.05em',
                color: s.dot,
                opacity: 0.07,
                whiteSpace: 'nowrap',
                zIndex: 0,
                filter: 'blur(0.5px)',
              }}
            >
              {s.label}
            </div>

            {/* Faint brand-mark watermark, bottom-right of the card — ONLY
                on the bold (Principal Disbursements) variant. The regular
                payroll/vendor receipt must render exactly as it did before
                today's changes. */}
            {bold && (
              <img
                src={logoUrl || '/icon-192.png'}
                alt=""
                aria-hidden
                crossOrigin="anonymous"
                style={{
                  position: 'absolute', right: '-18px', bottom: '-18px', height: '128px', width: '128px',
                  objectFit: 'contain', opacity: 0.05, transform: 'rotate(-8deg)', zIndex: 0, pointerEvents: 'none',
                }}
              />
            )}

            {/* Top accent bar — skipped when bold, since the header band below
                already carries the brand color much more visibly. */}
            {!bold && (
              <div style={{ height: '4px', background: `linear-gradient(90deg, ${BRAND} 0%, ${s.dot} 50%, ${BRAND} 100%)`, position: 'relative', zIndex: 1 }} />
            )}

            {/* Header — a solid brand-colored band when bold (the actual
                "designed receipt" look), plain white/black otherwise. */}
            <div style={{
              padding: '24px 28px 18px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
              gap: '16px',
              position: 'relative',
              zIndex: 1,
              ...(bold
                ? { background: `linear-gradient(135deg, ${BRAND} 0%, ${BRAND_DARK} 100%)` }
                : { borderBottom: '1px solid #f0f0f0' }),
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                {/* Always render the brand emblem — never initials.
                    The "KS" text fallback was the source of cross-role
                    inconsistency (one user saw the proper logo, another
                    saw "KS"). When company_settings.logo_url is empty
                    or unreadable for the current role, the bundled PWA
                    icon stands in as a deterministic emblem. White pad
                    behind it when bold so a transparent/dark logo still
                    reads clearly on the colored band. */}
                {bold ? (
                  <div style={{ background: '#fff', borderRadius: '9px', padding: '3px', display: 'flex', boxShadow: '0 1px 2px rgba(0,0,0,0.15)' }}>
                    <img
                      src={logoUrl || '/icon-192.png'}
                      alt=""
                      style={{ height: '34px', width: '34px', objectFit: 'contain', borderRadius: '8px' }}
                      crossOrigin="anonymous"
                    />
                  </div>
                ) : (
                  <img
                    src={logoUrl || '/icon-192.png'}
                    alt=""
                    style={{ height: '34px', width: '34px', objectFit: 'contain', borderRadius: '8px' }}
                    crossOrigin="anonymous"
                  />
                )}
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: '13px', fontWeight: 700, color: bold ? '#fff' : '#111' }}>{shortName}</div>
                  <div style={{ fontSize: '11px', color: bold ? 'rgba(255,255,255,0.75)' : '#888', marginTop: '1px' }}>
                    {s.tone === 'failed' ? 'Payment Failed' : s.tone === 'reversed' ? 'Payment Reversed' : s.tone === 'pending' ? 'Payment Pending' : 'Payment Confirmation'}
                  </div>
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '26px', fontWeight: 800, color: bold ? '#fff' : '#111', letterSpacing: '-0.02em', lineHeight: 1 }}>{fmtNgn(amount)}</div>
                <div style={{ fontSize: '10px', color: bold ? 'rgba(255,255,255,0.7)' : '#aaa', marginTop: '4px', letterSpacing: '0.04em', textTransform: 'uppercase' }}>Settlement amount</div>
              </div>
            </div>

            {/* Transfer details */}
            <Section brand={BRAND} title="Transfer Details">
              <Row k="Status" v={
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontWeight: 700, color: s.dot, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: s.dot, display: 'inline-block' }} />
                  {s.label}
                </span>
              } />
              <Row k="Date" v={txnDateStr} />
              <Row k="Sent to" v={item.account_name || item.full_name || '—'} />
              <Row k="Paid via" v={paidVia} />
            </Section>

            {/* Beneficiary */}
            <Section brand={BRAND} title="Beneficiary">
              <Row k="Bank" v={item.bank_name || '—'} />
              <Row k="Account number" v={<span style={{ fontFamily: 'ui-monospace, Consolas, monospace', fontSize: '12px', letterSpacing: '0.04em' }}>{item.account_number || '—'}</span>} />
            </Section>

            {/* Reference */}
            <Section brand={BRAND} title="Reference">
              <Row k="Narration" v={narration} />
              {itemReference(item) && (
                <Row k="Provider reference" v={<span style={{ fontFamily: 'ui-monospace, Consolas, monospace', fontSize: '12px', letterSpacing: '0.04em' }}>{itemReference(item)}</span>} />
              )}
            </Section>


            {/* Failure details — only on failed transfers */}
            {item.status === 'failed' && (() => {
              const f = friendlyProviderError(item, item.failure_reason);
              const bankPerspective = bankPerspectiveFor(item.failure_reason);
              const recipientCanFix = recipientCanFixThis(item.failure_reason);
              return (
                <Section brand={BRAND} title="Why this transfer failed">
                  <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '12px 14px', marginBottom: '8px' }}>
                    <p style={{ fontSize: '13px', fontWeight: 700, color: '#991b1b', margin: 0 }}>{f.title}</p>
                  </div>
                  <Row k="Bank's response" v={item.failure_reason || '—'} />
                  {bankPerspective && <Row k="What this means" v={bankPerspective} />}
                  {recipientCanFix && <Row k="Recipient action" v={recipientCanFix} />}
                  <Row k="Beneficiary" v={item.account_name || item.full_name || '—'} />
                  <Row k="Beneficiary bank" v={item.bank_name || '—'} />
                  <Row k="Beneficiary account" v={<span style={{ fontFamily: 'ui-monospace, Consolas, monospace', fontSize: '12px', letterSpacing: '0.04em' }}>{item.account_number || '—'}</span>} />
                </Section>
              );
            })()}

            {/* Cost breakdown — only on succeeded */}
            {isSucceeded && (
              <Section brand={BRAND} title="Debit Breakdown">
                {/* "Transfer amount" matches CBN bank-statement terminology
                    — the principal sum being moved. "Principal" was the
                    word a developer would use; "Transfer amount" is what
                    every Nigerian bank prints on a real statement. */}
                <Row k="Transfer amount" v={fmtNgn(amount)} />
                {duty > 0 && <Row k="Stamp duty" v={fmtNgn(duty)} />}
                <Row k="Transfer fee" v={fmtNgn(psFee)} />
                <div style={{ borderTop: '1px solid #e4e4e7', paddingTop: '10px', marginTop: '4px', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', fontSize: '15px' }}>
                  <span style={{ fontWeight: 600, color: '#111' }}>Total debit</span>
                  <span style={{ fontWeight: 700, color: '#111' }}>{fmtNgn(total)}</span>
                </div>
              </Section>
            )}

            {/* Footer cert ID */}
            <div style={{ padding: '14px 28px 22px', borderTop: '1px solid #f0f0f0', position: 'relative', zIndex: 1 }}>
              <span style={{ fontFamily: 'ui-monospace, Consolas, monospace', fontSize: '10px', color: '#c4c4c7', letterSpacing: '0.02em', wordBreak: 'break-all' }}>
                {certId}
              </span>
            </div>
          </div>
        </div>

        {/* Action buttons — pinned to the bottom of the (scrollable) modal so
            Share / Download / Print stay reachable on short mobile screens,
            where the centred receipt used to push them below the fold. */}
        <div className="kd-receipt-actions sticky bottom-0 z-10 flex flex-wrap items-center justify-center sm:justify-end gap-2 px-4 py-3 bg-card/95 backdrop-blur-sm border-t border-border/40 rounded-b-2xl">
          {/* Share — dropdown lets the operator pick PNG (the default
              for chat apps + WhatsApp where image previews render) or
              PDF (better for email attachments + finance archives). */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" disabled={busy !== null} className="flex-1 sm:flex-initial h-10 sm:h-9">
                <Share2 className="h-4 w-4 mr-1.5" />
                {busy === 'share' ? 'Preparing…' : 'Share'}
                <ChevronDown className="h-3 w-3 ml-1 opacity-60" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuItem onClick={() => void handleShare('png')}>
                <FileImage className="h-4 w-4 mr-2" /> Share as image
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => void handleShare('pdf')}>
                <FileText className="h-4 w-4 mr-2" /> Share as PDF
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Download — same two formats. */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" disabled={busy !== null} className="flex-1 sm:flex-initial h-10 sm:h-9">
                <Download className="h-4 w-4 mr-1.5" />
                {busy === 'download' ? 'Saving…' : 'Download'}
                <ChevronDown className="h-3 w-3 ml-1 opacity-60" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuItem onClick={() => void handleDownload('png')}>
                <FileImage className="h-4 w-4 mr-2" /> Image (PNG)
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => void handleDownload('pdf')}>
                <FileText className="h-4 w-4 mr-2" /> PDF
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <Button size="sm" onClick={handlePrint} disabled={busy !== null} className="flex-1 sm:flex-initial h-10 sm:h-9">
            <Printer className="h-4 w-4 mr-1.5" />
            Print
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Failure-reason helpers ───────────────────────────────────────────────────

function bankPerspectiveFor(raw?: string | null): string | null {
  if (!raw) return null;
  const r = raw.toLowerCase();
  if (/beneficiary account does not exist|account does not exist|nuban not valid/.test(r)) return 'Account does not exist at this bank';
  if (/account number invalid|invalid account/.test(r)) return 'Account number is invalid';
  if (/name mismatch|name does not match/.test(r)) return 'Account name does not match bank records';
  if (/transaction not permitted|account.*restricted|account is dormant|frozen/.test(r)) return 'Account is restricted or dormant';
  if (/cannot resolve account|could not resolve account|unable to resolve|account resolution failed|resolve.*timeout/.test(r)) return 'Account could not be verified';
  if (/balance is not enough|insufficient funds/.test(r)) return 'Sender wallet had insufficient balance';
  return null;
}

function recipientCanFixThis(raw?: string | null): string | null {
  if (!raw) return null;
  const r = raw.toLowerCase();
  if (/beneficiary account does not exist|account does not exist|nuban not valid|account number invalid|invalid account/.test(r))
    return 'Confirm account number and bank with the beneficiary';
  if (/name mismatch|name does not match/.test(r))
    return 'Ask beneficiary to confirm exact account name with their bank';
  if (/transaction not permitted|account.*restricted|account is dormant|frozen/.test(r))
    return 'Beneficiary should contact their bank to unblock the account';
  return null;
}

// ── Sub-components ───────────────────────────────────────────────────────────

function Section({ title, children, brand }: { title: string; children: React.ReactNode; brand?: string }) {
  return (
    // position: relative + zIndex: 1 so the section content sits above the
    // status watermark that lives at z-index 0 on the white card.
    <div style={{ padding: '18px 28px', borderBottom: '1px solid #f0f0f0', position: 'relative', zIndex: 1 }}>
      <div style={{ fontSize: '10px', fontWeight: 700, color: brand || receiptTheme.brand, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: '10px' }}>
        {title}
      </div>
      {children}
    </div>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '16px', padding: '6px 0', fontSize: '13px', lineHeight: 1.5 }}>
      <span style={{ color: '#71717a', flexShrink: 0 }}>{k}</span>
      <span style={{ color: '#111', fontWeight: 500, textAlign: 'right', wordBreak: 'break-word' }}>{v}</span>
    </div>
  );
}

