/**
 * PersonalTransferReceiptModal
 *
 * Same visual family as ReceiptModal (receipt-theme tokens, jsPDF +
 * html2canvas card-to-PDF/PNG, print via .kd-receipt print rules) but a
 * standalone, simpler render for personal_transfers rows — there is no
 * parent `batch` here (Personal Transfer is deliberately isolated from
 * payment_batches), and the provider is always Paystack, so this skips
 * the item-facade provider abstraction ReceiptModal needs for payroll.
 *
 * Brought up to the same sectioned layout as ReceiptModal (logo header,
 * Transfer Details / Beneficiary / Reference / Debit Breakdown sections,
 * in-card status watermark, cert footer) — the original flat key-value
 * card looked unofficial next to the company-disbursement receipt.
 */
import { useRef, useState } from 'react';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Download, Printer, Share2, X, FileImage, FileText, ChevronDown,
} from 'lucide-react';
import { formatReceiptDateTime } from '@/lib/format';
import { paystackTransferFee, stampDutyFor } from '@/lib/paystack';
import { useToast } from '@/hooks/use-toast';
import { receiptTheme } from '@/lib/receipt-theme';
import type { PersonalTransferRow } from '@/lib/personal-transfers';

interface Props {
  open: boolean;
  onClose: () => void;
  row: PersonalTransferRow | null;
  companyName?: string;
  logoUrl?: string | null;
  /** Override the brand accent — see ReceiptModal's identical prop for why
   *  Principal Disbursements passes its own here. */
  brand?: string;
  brandDark?: string;
}

const fmtNgn = (n: number) => `₦${n.toLocaleString('en-NG', { minimumFractionDigits: 2 })}`;

function statusInfo(status: string) {
  if (status === 'succeeded') return { label: 'SUCCESSFUL', dot: receiptTheme.success, tone: 'success' as const };
  if (status === 'failed') return { label: 'FAILED', dot: receiptTheme.failed, tone: 'failed' as const };
  if (status === 'reversed') return { label: 'REVERSED', dot: receiptTheme.muted, tone: 'reversed' as const };
  return { label: 'PENDING', dot: receiptTheme.pending, tone: 'pending' as const };
}

export function PersonalTransferReceiptModal({ open, onClose, row, companyName, logoUrl, brand, brandDark }: Props) {
  const cardRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();
  const [busy, setBusy] = useState<'download' | 'share' | null>(null);
  const BRAND = brand || receiptTheme.brand;
  const BRAND_DARK = brandDark || '#00547a';

  if (!row) return null;

  const s = statusInfo(row.status);
  const isSucceeded = row.status === 'succeeded';
  const amount = Number(row.amount_ngn) || 0;
  const recipient = row.recipient_account_name || row.recipient_name;
  const dateStr = row.processed_at || row.created_at
    ? formatReceiptDateTime(row.processed_at || row.created_at)
    : '—';
  // Paystack's transfer fee is a flat tier (not a variable "actual" fee we
  // need from the API), so it's computed the same way it was at send time
  // rather than stored — deterministic, so this always matches reality.
  const fee = paystackTransferFee(amount);
  const duty = stampDutyFor(amount);
  const total = amount + fee + duty;
  const certId = `kdopspt_${String(row.id).toLowerCase().replace(/-/g, '')}`;
  const shortName = (companyName || 'KD Squares').replace(/\s*Ltd\.?$/i, '').trim();
  const fileSafe = (str: string) => str.replace(/[^a-z0-9_-]+/gi, '_').slice(0, 40) || 'receipt';
  const filename = `kdops_personal_transfer_${fileSafe(recipient || certId)}.png`;

  const renderToCanvas = async (): Promise<HTMLCanvasElement | null> => {
    const node = cardRef.current;
    if (!node) return null;
    return html2canvas(node, { backgroundColor: '#ffffff', scale: 2, useCORS: true, logging: false });
  };

  const renderToBlob = async (): Promise<Blob | null> => {
    const canvas = await renderToCanvas();
    if (!canvas) return null;
    return new Promise<Blob | null>((resolve) => canvas.toBlob((b) => resolve(b), 'image/png', 0.96));
  };

  const renderToPdfBlob = async (): Promise<Blob | null> => {
    const canvas = await renderToCanvas();
    if (!canvas) return null;
    const dataUrl = canvas.toDataURL('image/png', 0.96);
    const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true });
    const pageW = 210; const pageH = 297; const margin = 16;
    const maxW = pageW - margin * 2;
    const ratio = canvas.width / canvas.height;
    let imgW = maxW; let imgH = imgW / ratio;
    const maxH = pageH - margin * 2;
    if (imgH > maxH) { imgH = maxH; imgW = imgH * ratio; }
    const x = (pageW - imgW) / 2; const y = (pageH - imgH) / 2;
    pdf.addImage(dataUrl, 'PNG', x, y, imgW, imgH, undefined, 'FAST');
    return pdf.output('blob');
  };

  const filenameFor = (kind: 'png' | 'pdf') => filename.replace(/\.png$/i, kind === 'pdf' ? '.pdf' : '.png');

  const handlePrint = () => {
    const source = cardRef.current;
    if (!source) { window.print(); return; }
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
    setTimeout(() => window.print(), 60);
  };

  const handleDownload = async (kind: 'png' | 'pdf') => {
    setBusy('download');
    try {
      const blob = kind === 'pdf' ? await renderToPdfBlob() : await renderToBlob();
      if (!blob) throw new Error('Could not render receipt');
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = filenameFor(kind);
      document.body.appendChild(a); a.click(); a.remove();
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
        await navigator.share({ title: `Personal Transfer Receipt — ${recipient}`, text: `${fmtNgn(amount)} to ${recipient}`, files: [file] });
      } else if (navigator.share) {
        await navigator.share({ title: `Personal Transfer Receipt — ${recipient}`, text: `${fmtNgn(amount)} to ${recipient} (${certId})` });
      } else if (blob) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = filenameFor(kind);
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 5000);
        toast({ title: 'Share unavailable on this browser', description: `Saved as ${kind.toUpperCase()} instead.` });
      } else {
        await navigator.clipboard.writeText(certId);
        toast({ title: 'Receipt ID copied' });
      }
    } catch {
      /* user cancelled or share failed silently */
    } finally {
      setBusy(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="kd-receipt-dialog max-w-[640px] p-0 border-0 bg-transparent shadow-none max-h-[92vh] overflow-y-auto">
        <div
          className="kd-receipt-backdrop"
          style={{
            position: 'relative',
            background: `linear-gradient(180deg, ${BRAND} 0%, ${BRAND_DARK} 100%)`,
            padding: '24px 18px',
            borderRadius: '16px',
            overflow: 'hidden',
          }}
        >
          <div
            aria-hidden
            style={{
              position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
              pointerEvents: 'none', transform: 'rotate(-18deg)', fontFamily: 'Inter, system-ui, sans-serif',
              fontWeight: 900, fontSize: 'clamp(80px, 14vw, 120px)', letterSpacing: '0.04em',
              color: 'rgba(255,255,255,0.10)', whiteSpace: 'nowrap',
            }}
          >
            {s.label}
          </div>

          <button
            type="button" onClick={onClose} aria-label="Close receipt"
            style={{
              position: 'absolute', top: '12px', right: '12px', height: '32px', width: '32px', borderRadius: '8px',
              border: '1px solid rgba(255,255,255,0.25)', background: 'rgba(255,255,255,0.10)', color: '#fff',
              display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', zIndex: 5,
            }}
          >
            <X size={16} />
          </button>

          <div
            ref={cardRef}
            id="kd-receipt-card"
            style={{
              position: 'relative',
              maxWidth: '560px',
              margin: '0 auto',
              background: `radial-gradient(circle, rgba(0,105,148,0.045) 1px, transparent 1.4px) 0 0/14px 14px, #ffffff`,
              borderRadius: '12px',
              overflow: 'hidden',
              boxShadow: '0 1px 3px rgba(0,0,0,0.08), 0 18px 40px -12px rgba(0,0,0,0.45)',
              fontFamily: 'Inter, system-ui, sans-serif',
              color: '#18181b',
              zIndex: 1,
            }}
          >
            {/* In-card status watermark, colour-matched to the outcome */}
            <div
              aria-hidden
              style={{
                position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                pointerEvents: 'none', transform: 'rotate(-18deg)', fontFamily: 'Inter, system-ui, sans-serif',
                fontWeight: 900, fontSize: 'clamp(64px, 11vw, 100px)', letterSpacing: '0.05em',
                color: s.dot, opacity: 0.07, whiteSpace: 'nowrap', zIndex: 0, filter: 'blur(0.5px)',
              }}
            >
              {s.label}
            </div>

            <div style={{ height: '4px', background: `linear-gradient(90deg, ${BRAND} 0%, ${s.dot} 50%, ${BRAND} 100%)`, position: 'relative', zIndex: 1 }} />

            {/* Header */}
            <div style={{ padding: '24px 28px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '16px', borderBottom: '1px solid #f0f0f0', position: 'relative', zIndex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                <img
                  src={logoUrl || '/icon-192.png'}
                  alt=""
                  style={{ height: '34px', width: '34px', objectFit: 'contain', borderRadius: '8px' }}
                  crossOrigin="anonymous"
                />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: '13px', fontWeight: 700, color: '#111' }}>{shortName}</div>
                  <div style={{ fontSize: '11px', color: '#888', marginTop: '1px' }}>
                    {s.tone === 'failed' ? 'Transfer Failed' : s.tone === 'reversed' ? 'Transfer Reversed' : s.tone === 'pending' ? 'Transfer Pending' : 'Personal Transfer Confirmation'}
                  </div>
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '26px', fontWeight: 800, color: '#111', letterSpacing: '-0.02em', lineHeight: 1 }}>{fmtNgn(amount)}</div>
                <div style={{ fontSize: '10px', color: '#aaa', marginTop: '4px', letterSpacing: '0.04em', textTransform: 'uppercase' }}>Settlement amount</div>
              </div>
            </div>

            <Section brand={BRAND} title="Transfer Details">
              <Row k="Status" v={
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontWeight: 700, color: s.dot, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: s.dot, display: 'inline-block' }} />
                  {s.label}
                </span>
              } />
              <Row k="Date" v={dateStr} />
              <Row k="Sent to" v={recipient || '—'} />
              <Row k="Paid via" v="Paystack" />
            </Section>

            <Section brand={BRAND} title="Beneficiary">
              <Row k="Bank" v={row.recipient_bank_name || '—'} />
              <Row k="Account number" v={<span style={{ fontFamily: 'ui-monospace, Consolas, monospace', fontSize: '12px', letterSpacing: '0.04em' }}>{row.recipient_account_number || '—'}</span>} />
            </Section>

            <Section brand={BRAND} title="Reference">
              {row.memo && <Row k="Memo" v={row.memo} />}
              {row.batch_label && <Row k="Batch" v={row.batch_label} />}
              {row.paystack_reference && (
                <Row k="Provider reference" v={<span style={{ fontFamily: 'ui-monospace, Consolas, monospace', fontSize: '12px', letterSpacing: '0.04em' }}>{row.paystack_reference}</span>} />
              )}
              {!row.memo && !row.batch_label && !row.paystack_reference && <Row k="Narration" v={`${shortName} · Personal Transfer`} />}
            </Section>

            {row.status === 'failed' && (
              <Section brand={BRAND} title="Why this transfer failed">
                <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '12px 14px', marginBottom: '8px' }}>
                  <p style={{ fontSize: '13px', fontWeight: 700, color: '#991b1b', margin: 0 }}>{row.failure_reason || 'Paystack rejected the transfer'}</p>
                </div>
                <Row k="Beneficiary" v={recipient || '—'} />
                <Row k="Beneficiary bank" v={row.recipient_bank_name || '—'} />
                <Row k="Beneficiary account" v={<span style={{ fontFamily: 'ui-monospace, Consolas, monospace', fontSize: '12px', letterSpacing: '0.04em' }}>{row.recipient_account_number || '—'}</span>} />
              </Section>
            )}

            {isSucceeded && (
              <Section brand={BRAND} title="Debit Breakdown">
                <Row k="Transfer amount" v={fmtNgn(amount)} />
                {duty > 0 && <Row k="Stamp duty" v={fmtNgn(duty)} />}
                <Row k="Transfer fee" v={fmtNgn(fee)} />
                <div style={{ borderTop: '1px solid #e4e4e7', paddingTop: '10px', marginTop: '4px', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', fontSize: '15px' }}>
                  <span style={{ fontWeight: 600, color: '#111' }}>Total debit</span>
                  <span style={{ fontWeight: 700, color: '#111' }}>{fmtNgn(total)}</span>
                </div>
              </Section>
            )}

            <div style={{ padding: '14px 28px 22px', borderTop: '1px solid #f0f0f0', position: 'relative', zIndex: 1 }}>
              <span style={{ fontFamily: 'ui-monospace, Consolas, monospace', fontSize: '10px', color: '#c4c4c7', letterSpacing: '0.02em', wordBreak: 'break-all' }}>
                {certId} · Personal Transfer, not a company ledger entry
              </span>
            </div>
          </div>
        </div>

        <div className="kd-receipt-actions sticky bottom-0 z-10 flex flex-wrap items-center justify-center sm:justify-end gap-2 px-4 py-3 bg-card/95 backdrop-blur-sm border-t border-border/40 rounded-b-2xl">
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

function Section({ title, children, brand }: { title: string; children: React.ReactNode; brand?: string }) {
  return (
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
