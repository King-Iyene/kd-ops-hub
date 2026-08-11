/**
 * PersonalTransferReceiptModal
 *
 * Same visual family as ReceiptModal (receipt-theme tokens, jsPDF +
 * html2canvas card-to-PDF/PNG, print via .kd-receipt print rules) but a
 * standalone, simpler render for personal_transfers rows — there is no
 * parent `batch` here (Personal Transfer is deliberately isolated from
 * payment_batches), and the provider is always Paystack, so this skips
 * the item-facade provider abstraction ReceiptModal needs for payroll.
 */
import { useRef, useState } from 'react';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Download, Printer, Share2, X, ChevronDown } from 'lucide-react';
import { formatReceiptDateTime } from '@/lib/format';
import { useToast } from '@/hooks/use-toast';
import { receiptTheme } from '@/lib/receipt-theme';
import type { PersonalTransferRow } from '@/lib/personal-transfers';

interface Props {
  open: boolean;
  onClose: () => void;
  row: PersonalTransferRow | null;
  companyName?: string;
}

const BRAND = receiptTheme.brand;
const fmtNgn = (n: number) => `₦${n.toLocaleString('en-NG', { minimumFractionDigits: 2 })}`;

function statusInfo(status: string) {
  if (status === 'succeeded') return { label: 'SUCCESSFUL', dot: receiptTheme.success };
  if (status === 'failed') return { label: 'FAILED', dot: receiptTheme.failed };
  if (status === 'reversed') return { label: 'REVERSED', dot: receiptTheme.muted };
  return { label: 'PENDING', dot: receiptTheme.pending };
}

export function PersonalTransferReceiptModal({ open, onClose, row, companyName }: Props) {
  const cardRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();
  const [busy, setBusy] = useState<'download' | 'share' | null>(null);

  if (!row) return null;

  const s = statusInfo(row.status);
  const amount = Number(row.amount_ngn) || 0;
  const recipient = row.recipient_account_name || row.recipient_name;
  const dateStr = row.processed_at || row.created_at
    ? formatReceiptDateTime(row.processed_at || row.created_at)
    : '—';
  const certId = `kdopspt_${String(row.id).toLowerCase().replace(/-/g, '')}`;
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
      <DialogContent className="kd-receipt-dialog max-w-[560px] p-0 border-0 bg-transparent shadow-none max-h-[92vh] overflow-y-auto">
        <div
          className="kd-receipt-backdrop"
          style={{
            position: 'relative',
            background: `linear-gradient(180deg, ${BRAND} 0%, #00547a 100%)`,
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
              fontWeight: 900, fontSize: 'clamp(70px, 13vw, 110px)', letterSpacing: '0.04em',
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

          <div ref={cardRef} className="kd-receipt" style={{ position: 'relative', zIndex: 1, background: '#fff', borderRadius: '12px', padding: '28px 24px', fontFamily: 'Inter, system-ui, sans-serif', color: receiptTheme.bodyText }}>
            <div style={{ textAlign: 'center', marginBottom: 18 }}>
              <div style={{ fontSize: 11, letterSpacing: '0.14em', color: receiptTheme.muted, textTransform: 'uppercase' }}>Personal Transfer Receipt</div>
              <div style={{ fontSize: 12, color: receiptTheme.mutedLight, marginTop: 2 }}>{companyName || 'KD Squares Ltd'} · KDOps · Paystack</div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 20 }}>
              <span style={{ height: 8, width: 8, borderRadius: 999, background: s.dot }} />
              <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: '0.06em' }}>{s.label}</span>
            </div>

            <div style={{ textAlign: 'center', marginBottom: 20 }}>
              <div style={{ fontSize: 30, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{fmtNgn(amount)}</div>
              <div style={{ fontSize: 13, color: receiptTheme.muted, marginTop: 2 }}>to {recipient}</div>
            </div>

            <div style={{ background: receiptTheme.panelBg, border: `1px solid ${receiptTheme.border}`, borderRadius: 10, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[
                ['Bank', row.recipient_bank_name || '—'],
                ['Account number', row.recipient_account_number],
                ['Date', dateStr],
                ['Reference', row.paystack_reference || '—'],
                ...(row.batch_label ? [['Batch', row.batch_label]] : []),
                ...(row.memo ? [['Memo', row.memo]] : []),
                ...(row.status === 'failed' && row.failure_reason ? [['Reason', row.failure_reason]] : []),
              ].map(([label, value]) => (
                <div key={label} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 12.5 }}>
                  <span style={{ color: receiptTheme.muted }}>{label}</span>
                  <span style={{ fontWeight: 500, textAlign: 'right', wordBreak: 'break-word' }}>{value}</span>
                </div>
              ))}
            </div>

            <div style={{ textAlign: 'center', marginTop: 18, fontSize: 10.5, color: receiptTheme.mutedLight }}>
              {certId} · System-generated receipt · Personal Transfer, not a company ledger entry
            </div>
          </div>

          <div className="kd-receipt-actions" style={{ display: 'flex', gap: 8, marginTop: 16, justifyContent: 'center', flexWrap: 'wrap' }}>
            <Button size="sm" variant="secondary" onClick={handlePrint}>
              <Printer className="mr-1.5 h-3.5 w-3.5" /> Print
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="secondary" disabled={busy === 'download'}>
                  <Download className="mr-1.5 h-3.5 w-3.5" /> Download <ChevronDown className="ml-1 h-3 w-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="center">
                <DropdownMenuItem onClick={() => handleDownload('pdf')}>PDF</DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleDownload('png')}>Image (PNG)</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="secondary" disabled={busy === 'share'}>
                  <Share2 className="mr-1.5 h-3.5 w-3.5" /> Share <ChevronDown className="ml-1 h-3 w-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="center">
                <DropdownMenuItem onClick={() => handleShare('pdf')}>PDF</DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleShare('png')}>Image (PNG)</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
