/**
 * PersonalTransferReceiptModal
 *
 * Same jsPDF + html2canvas card-to-PDF/PNG plumbing as ReceiptModal, but a
 * standalone render for personal_transfers rows — there is no parent
 * `batch` here (Personal Transfer is deliberately isolated from
 * payment_batches), and the provider is always Paystack, so this skips
 * the item-facade provider abstraction ReceiptModal needs for payroll.
 *
 * The `bold` variant (Principal Disbursements) is a real document layout —
 * masthead title, FROM/TO block, an itemized table, a rotated verification
 * stamp instead of a giant diagonal watermark, and a brand-color wave
 * flourish — instead of a generic colored-header-on-a-card look.
 */
import { useRef, useState } from 'react';
// html2canvas and jspdf loaded dynamically at point of use (see renderToCanvas / renderToPdfBlob)
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
import { receiptTheme, hexToRgba } from '@/lib/receipt-theme';
import type { PersonalTransferRow } from '@/lib/personal-transfers';

interface Props {
  open: boolean;
  onClose: () => void;
  row: PersonalTransferRow | null;
  companyName?: string;
  logoUrl?: string | null;
  /** Switches to the document-style layout (masthead, FROM/TO, itemized
   *  table, stamp, wave flourish) instead of the plain sectioned card. */
  bold?: boolean;
}

const fmtNgn = (n: number) => `₦${n.toLocaleString('en-NG', { minimumFractionDigits: 2 })}`;

function statusInfo(status: string) {
  if (status === 'succeeded') return { label: 'SUCCESSFUL', dot: receiptTheme.success, tone: 'success' as const };
  if (status === 'failed') return { label: 'FAILED', dot: receiptTheme.failed, tone: 'failed' as const };
  if (status === 'reversed') return { label: 'REVERSED', dot: receiptTheme.muted, tone: 'reversed' as const };
  return { label: 'PENDING', dot: receiptTheme.pending, tone: 'pending' as const };
}

export function PersonalTransferReceiptModal({ open, onClose, row, companyName, logoUrl, bold }: Props) {
  const cardRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();
  const [busy, setBusy] = useState<'download' | 'share' | null>(null);
  const BRAND = receiptTheme.brand;
  const BRAND_DARK = '#00547a';
  const backdropBg = `linear-gradient(180deg, ${BRAND} 0%, ${BRAND_DARK} 100%)`;
  const backdropWatermarkColor = 'rgba(255,255,255,0.10)';
  const closeBtnStyle = { border: '1px solid rgba(255,255,255,0.25)', background: 'rgba(255,255,255,0.10)', color: '#fff' };
  // The document-style layout sits on a plain paper surround, not a solid
  // color block — the typography/table/stamp carry the brand identity now.
  const docBackdropBg = '#eef1f4';

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
    const { default: html2canvas } = await import('html2canvas');
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
    const { default: jsPDF } = await import('jspdf');
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

  const actions = (
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
  );

  if (bold) {
    return (
      <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
        <DialogContent className="kd-receipt-dialog max-w-[640px] p-0 border-0 bg-transparent shadow-none max-h-[92vh] overflow-y-auto">
          <div className="kd-receipt-backdrop" style={{ position: 'relative', background: docBackdropBg, padding: '24px 18px', borderRadius: '16px' }}>
            <button
              type="button" onClick={onClose} aria-label="Close receipt"
              style={{
                position: 'absolute', top: '12px', right: '12px', height: '32px', width: '32px', borderRadius: '8px',
                border: '1px solid rgba(0,0,0,0.12)', background: '#fff', color: '#333',
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
                background: `radial-gradient(circle, ${hexToRgba(BRAND, 0.05)} 1px, transparent 1.4px) 0 0/14px 14px, #ffffff`,
                borderRadius: '14px',
                overflow: 'hidden',
                boxShadow: '0 1px 3px rgba(0,0,0,0.08), 0 24px 48px -14px rgba(0,0,0,0.35)',
                fontFamily: 'Inter, system-ui, sans-serif',
                color: '#18181b',
              }}
            >
              {/* Faint brand-mark watermark, bottom-right */}
              <img
                src={logoUrl || '/icon-192.png'}
                alt="" aria-hidden crossOrigin="anonymous"
                style={{
                  position: 'absolute', right: '-18px', bottom: '-18px', height: '128px', width: '128px',
                  objectFit: 'contain', opacity: 0.045, transform: 'rotate(-8deg)', zIndex: 0, pointerEvents: 'none',
                }}
              />

              {/* Masthead */}
              <div style={{ padding: '30px 32px 0', position: 'relative', zIndex: 1 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '16px' }}>
                  <div>
                    <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.2em', color: BRAND, textTransform: 'uppercase' }}>
                      Personal Transfer
                    </div>
                    <div style={{ fontSize: '36px', fontWeight: 900, color: '#0c1b26', letterSpacing: '-0.03em', lineHeight: 1, marginTop: '4px' }}>
                      RECEIPT
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                    <img
                      src={logoUrl || '/icon-192.png'} alt="" crossOrigin="anonymous"
                      style={{ height: '28px', width: '28px', objectFit: 'contain', borderRadius: '7px' }}
                    />
                    <div style={{ fontSize: '13px', fontWeight: 700, color: '#111' }}>{shortName}</div>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '28px', marginTop: '22px', flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '0.1em', color: '#9aa5ac', textTransform: 'uppercase' }}>Receipt No.</div>
                    <div style={{ fontFamily: 'ui-monospace, Consolas, monospace', fontSize: '12px', color: '#333', marginTop: '3px' }}>{certId.slice(0, 24)}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '0.1em', color: '#9aa5ac', textTransform: 'uppercase' }}>Date</div>
                    <div style={{ fontSize: '12px', color: '#333', marginTop: '3px' }}>{dateStr}</div>
                  </div>
                  <div style={{ marginLeft: 'auto' }}>
                    <span style={{
                      display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '4px 10px', borderRadius: '999px',
                      background: hexToRgba(s.dot, 0.12), color: s.dot, fontWeight: 700, fontSize: '11px',
                      letterSpacing: '0.04em', textTransform: 'uppercase',
                    }}>
                      <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: s.dot, display: 'inline-block' }} />
                      {s.label}
                    </span>
                  </div>
                </div>
              </div>

              {/* Divider with dot accents */}
              <div style={{ position: 'relative', margin: '22px 32px 0', height: '2px', background: BRAND, zIndex: 1 }}>
                {[0.18, 0.5, 0.82].map((pos) => (
                  <span key={pos} style={{
                    position: 'absolute', top: '50%', left: `${pos * 100}%`, transform: 'translate(-50%, -50%)',
                    width: '5px', height: '5px', borderRadius: '50%', background: BRAND,
                  }} />
                ))}
              </div>

              {/* FROM / TO */}
              <div style={{ display: 'flex', padding: '22px 32px', gap: '24px', position: 'relative', zIndex: 1, flexWrap: 'wrap' }}>
                <div style={{ flex: '1 1 180px' }}>
                  <div style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '0.1em', color: BRAND, textTransform: 'uppercase', marginBottom: '6px' }}>From</div>
                  <div style={{ fontSize: '14px', fontWeight: 700, color: '#111' }}>{shortName}</div>
                  <div style={{ fontSize: '12px', color: '#8194a0', marginTop: '2px' }}>Principal Disbursements wallet</div>
                </div>
                <div style={{ flex: '1 1 180px' }}>
                  <div style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '0.1em', color: BRAND, textTransform: 'uppercase', marginBottom: '6px' }}>To</div>
                  <div style={{ fontSize: '14px', fontWeight: 700, color: '#111' }}>{recipient || '—'}</div>
                  <div style={{ fontSize: '12px', color: '#8194a0', marginTop: '2px' }}>
                    {row.recipient_bank_name || '—'} · <span style={{ fontFamily: 'ui-monospace, Consolas, monospace' }}>{row.recipient_account_number || '—'}</span>
                  </div>
                </div>
              </div>

              {/* Itemized table + stamp */}
              <div style={{ position: 'relative', padding: '0 32px 8px', zIndex: 1 }}>
                <div style={{
                  display: 'flex', fontSize: '10px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
                  color: '#8194a0', borderBottom: `2px solid ${BRAND}`, paddingBottom: '8px',
                }}>
                  <div style={{ flex: 1 }}>Description</div>
                  <div style={{ width: '120px', textAlign: 'right' }}>Amount</div>
                </div>

                <div style={{ display: 'flex', padding: '14px 0', borderBottom: '1px solid #eee' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: '13px' }}>Transfer to {recipient || 'recipient'}</div>
                    {row.memo && <div style={{ fontSize: '11.5px', color: '#8194a0', fontStyle: 'italic', marginTop: '2px' }}>{row.memo}</div>}
                    {row.batch_label && <div style={{ fontSize: '11px', color: BRAND, marginTop: '2px' }}>Batch: {row.batch_label}</div>}
                  </div>
                  <div style={{ width: '120px', textAlign: 'right', fontWeight: 600, fontSize: '13px' }}>{fmtNgn(amount)}</div>
                </div>

                {isSucceeded && (
                  <>
                    {duty > 0 && (
                      <div style={{ display: 'flex', padding: '8px 0', fontSize: '12.5px', color: '#71717a' }}>
                        <div style={{ flex: 1 }}>Stamp duty</div>
                        <div style={{ width: '120px', textAlign: 'right' }}>{fmtNgn(duty)}</div>
                      </div>
                    )}
                    <div style={{ display: 'flex', padding: '8px 0', fontSize: '12.5px', color: '#71717a' }}>
                      <div style={{ flex: 1 }}>Transfer fee</div>
                      <div style={{ width: '120px', textAlign: 'right' }}>{fmtNgn(fee)}</div>
                    </div>
                    <div style={{
                      display: 'flex', justifyContent: 'flex-end', alignItems: 'baseline', gap: '32px',
                      padding: '14px 0 4px', borderTop: `2px solid ${BRAND}`, marginTop: '4px',
                    }}>
                      <div style={{ fontWeight: 800, fontSize: '14px', color: '#111' }}>TOTAL</div>
                      <div style={{ fontWeight: 900, fontSize: '19px', color: BRAND }}>{fmtNgn(total)}</div>
                    </div>
                  </>
                )}

                {row.status === 'failed' && (
                  <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '12px 14px', marginTop: '12px' }}>
                    <p style={{ fontSize: '12.5px', fontWeight: 700, color: '#991b1b', margin: 0 }}>{row.failure_reason || 'Paystack rejected the transfer'}</p>
                  </div>
                )}

                {/* Verification stamp — in normal document flow (NOT
                    absolutely positioned) so it can never sit on top of
                    the total or any other figure, regardless of content
                    length. Reads like an actual document mark instead of
                    a template placeholder. */}
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '16px' }}>
                  <div
                    aria-hidden
                    style={{
                      width: '76px', height: '76px', flexShrink: 0,
                      borderRadius: '50%', border: `2.5px dashed ${s.dot}`, display: 'flex', alignItems: 'center',
                      justifyContent: 'center', transform: 'rotate(-13deg)', background: hexToRgba(s.dot, 0.04),
                    }}
                  >
                    <div style={{ textAlign: 'center', color: s.dot, lineHeight: 1.3 }}>
                      <div style={{ fontSize: '7px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Paystack</div>
                      <div style={{ fontSize: '11px', fontWeight: 900, letterSpacing: '0.03em' }}>{s.label}</div>
                      <div style={{ fontSize: '6.5px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Verified</div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Wave flourish + signature line */}
              <div style={{ position: 'relative', marginTop: '18px' }}>
                <svg viewBox="0 0 600 56" preserveAspectRatio="none" style={{ display: 'block', width: '100%', height: '48px' }}>
                  <path d="M0,30 C100,58 200,4 300,30 C400,56 500,4 600,28 L600,56 L0,56 Z" fill={hexToRgba(BRAND, 0.10)} />
                  <path d="M0,38 C120,10 240,52 360,24 C450,4 540,42 600,20 L600,56 L0,56 Z" fill={hexToRgba(BRAND, 0.22)} />
                </svg>
                <div style={{
                  position: 'absolute', left: '32px', bottom: '10px', fontFamily: 'Georgia, "Times New Roman", serif',
                  fontStyle: 'italic', fontSize: '14px', color: BRAND, opacity: 0.85,
                }}>
                  {shortName} · verified transfer
                </div>
              </div>

              <div style={{ padding: '10px 32px 22px', textAlign: 'center', position: 'relative', zIndex: 1 }}>
                <span style={{ fontFamily: 'ui-monospace, Consolas, monospace', fontSize: '10px', color: '#c4c4c7', letterSpacing: '0.02em', wordBreak: 'break-all' }}>
                  {certId}
                </span>
              </div>
            </div>
          </div>
          {actions}
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="kd-receipt-dialog max-w-[640px] p-0 border-0 bg-transparent shadow-none max-h-[92vh] overflow-y-auto">
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
          <div
            aria-hidden
            style={{
              position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
              pointerEvents: 'none', transform: 'rotate(-18deg)', fontFamily: 'Inter, system-ui, sans-serif',
              fontWeight: 900, fontSize: 'clamp(80px, 14vw, 120px)', letterSpacing: '0.04em',
              color: backdropWatermarkColor, whiteSpace: 'nowrap',
            }}
          >
            {s.label}
          </div>

          <button
            type="button" onClick={onClose} aria-label="Close receipt"
            style={{
              position: 'absolute', top: '12px', right: '12px', height: '32px', width: '32px', borderRadius: '8px',
              ...closeBtnStyle,
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
                {certId}
              </span>
            </div>
          </div>
        </div>

        {actions}
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
