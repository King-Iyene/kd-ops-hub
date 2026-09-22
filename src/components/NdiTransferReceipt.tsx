import { useRef, useState } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Download, Printer, Share2, X, FileImage, FileText, ChevronDown, CheckCircle2, AlertTriangle, Clock, XCircle } from 'lucide-react';
import { formatNaira, formatReceiptDateTime } from '@/lib/format';
import { paystackTransferFee } from '@/lib/paystack';
import { useToast } from '@/hooks/use-toast';
import { errorMessage } from '@/lib/db-errors';

const TEAL = '#112B34';
const CYAN = '#A3F2F5';

interface NdiTransferRow {
  id: string;
  amount_ngn: number;
  status: string;
  category: string;
  description?: string | null;
  narration?: string | null;
  paystack_reference?: string | null;
  created_at: string;
  completed_at?: string | null;
  failure_reason?: string | null;
}

interface NdiBeneficiary {
  id: string;
  name: string;
  bank_name: string;
  account_number: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  row: NdiTransferRow | null;
  beneficiary: NdiBeneficiary | null;
  categoryLabel: string;
}

function statusConfig(status: string) {
  switch (status) {
    case 'success': return { label: 'Successful', icon: CheckCircle2, color: '#10b981', bg: '#ecfdf5', border: '#a7f3d0' };
    case 'failed': return { label: 'Failed', icon: XCircle, color: '#ef4444', bg: '#fef2f2', border: '#fecaca' };
    case 'reversed': return { label: 'Reversed', icon: AlertTriangle, color: '#6b7280', bg: '#f3f4f6', border: '#d1d5db' };
    case 'processing': return { label: 'Processing', icon: Clock, color: '#3b82f6', bg: '#eff6ff', border: '#bfdbfe' };
    default: return { label: 'Pending', icon: Clock, color: '#f59e0b', bg: '#fffbeb', border: '#fde68a' };
  }
}

export function NdiTransferReceipt({ open, onClose, row, beneficiary, categoryLabel }: Props) {
  const { toast } = useToast();
  const cardRef = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState<string | null>(null);

  if (!row) return null;

  const s = statusConfig(row.status);
  const StatusIcon = s.icon;
  const amount = Number(row.amount_ngn);
  const fee = row.status === 'success' ? paystackTransferFee(amount) : 0;
  const total = amount + fee;
  const certId = `NDI-${row.id.replace(/-/g, '').slice(0, 16).toUpperCase()}`;
  const isSuccess = row.status === 'success';

  const filenameFor = (kind: 'png' | 'pdf') =>
    `NDI-Receipt-${(row.paystack_reference ?? row.id).slice(0, 16)}.${kind}`;

  const renderToCanvas = async () => {
    const el = cardRef.current;
    if (!el) return null;
    const html2canvas = (await import('html2canvas')).default;
    return html2canvas(el, { scale: 2, useCORS: true, backgroundColor: null });
  };

  const renderToBlob = async () => {
    const canvas = await renderToCanvas();
    if (!canvas) return null;
    return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  };

  const renderToPdfBlob = async () => {
    const canvas = await renderToCanvas();
    if (!canvas) return null;
    const { default: jsPDF } = await import('jspdf');
    const imgData = canvas.toDataURL('image/png');
    const w = canvas.width; const h = canvas.height;
    const pdfW = 210; const pdfH = (h * pdfW) / w;
    const doc = new jsPDF({ orientation: pdfH > pdfW ? 'portrait' : 'landscape', unit: 'mm', format: [pdfW, pdfH] });
    doc.addImage(imgData, 'PNG', 0, 0, pdfW, pdfH);
    return doc.output('blob');
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
      toast({ title: `Receipt ${kind.toUpperCase()} downloaded` });
    } catch (err: unknown) {
      toast({ title: 'Download failed', description: errorMessage(err), variant: 'destructive' });
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
        await navigator.share({ title: `NDI Transfer Receipt`, text: `${formatNaira(amount)} to ${beneficiary?.name ?? 'recipient'}`, files: [file] });
      } else if (blob) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = filenameFor(kind);
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 5000);
        toast({ title: 'Saved — share not supported on this browser' });
      }
    } catch { /* user cancelled */ } finally {
      setBusy(null);
    }
  };

  const handlePrint = () => window.print();

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="kd-receipt-dialog max-w-[520px] p-0 border-0 bg-transparent shadow-none max-h-[92vh] overflow-y-auto">
        {/* Dark teal envelope */}
        <div style={{ position: 'relative', background: TEAL, padding: '20px 16px', borderRadius: '16px' }}>
          <button
            type="button" onClick={onClose} aria-label="Close"
            style={{
              position: 'absolute', top: '10px', right: '10px', height: '28px', width: '28px', borderRadius: '50%',
              border: 'none', background: 'rgba(163, 242, 245, 0.12)', color: CYAN,
              display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', zIndex: 5,
            }}
          >
            <X size={14} />
          </button>

          {/* Status banner at top of envelope */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
            padding: '8px 16px', marginBottom: '16px',
            background: `${s.color}18`, borderRadius: '8px',
          }}>
            <StatusIcon size={16} style={{ color: s.color }} />
            <span style={{ fontSize: '13px', fontWeight: 700, color: s.color, letterSpacing: '0.03em' }}>
              Transfer {s.label}
            </span>
            {row.status === 'failed' && row.failure_reason && (
              <span style={{ fontSize: '11px', color: `${s.color}cc`, marginLeft: '4px' }}>— {row.failure_reason}</span>
            )}
          </div>

          {/* Main receipt card */}
          <div
            ref={cardRef}
            id="ndi-receipt-card"
            style={{
              position: 'relative', maxWidth: '480px', margin: '0 auto',
              background: '#ffffff', borderRadius: '12px', overflow: 'hidden',
              boxShadow: '0 4px 24px rgba(0,0,0,0.2)',
              fontFamily: 'Inter, system-ui, sans-serif', color: '#1a1a1a',
            }}
          >
            {/* Gradient top edge */}
            <div style={{ height: '3px', background: `linear-gradient(90deg, ${TEAL}, ${CYAN})` }} />

            {/* Header — amount + NDI identity */}
            <div style={{ padding: '24px 24px 20px', textAlign: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', marginBottom: '14px' }}>
                <div style={{
                  width: '28px', height: '28px', borderRadius: '6px', background: TEAL,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '11px', fontWeight: 900, color: CYAN, letterSpacing: '0.05em',
                }}>N</div>
                <span style={{ fontSize: '13px', fontWeight: 700, color: TEAL, letterSpacing: '0.02em' }}>Niger Delta Innovate</span>
              </div>
              <p style={{ fontSize: '36px', fontWeight: 900, color: TEAL, letterSpacing: '-0.02em', lineHeight: 1, margin: 0 }}>
                {formatNaira(amount)}
              </p>
              {isSuccess && fee > 0 && (
                <p style={{ fontSize: '11px', color: '#9ca3af', marginTop: '4px' }}>
                  + {formatNaira(fee)} fee = {formatNaira(total)} total
                </p>
              )}
            </div>

            {/* Transfer details — clean grid */}
            <div style={{ padding: '0 24px 20px' }}>
              <div style={{
                background: '#f8fafb', borderRadius: '10px', padding: '16px',
                border: '1px solid #e5eaed',
              }}>
                {/* Sender */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '14px', paddingBottom: '14px', borderBottom: '1px solid #e5eaed' }}>
                  <div>
                    <p style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '0.12em', color: '#9ca3af', textTransform: 'uppercase', margin: '0 0 3px' }}>From</p>
                    <p style={{ fontSize: '13px', fontWeight: 600, color: TEAL, margin: 0 }}>NDI Corporate</p>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <p style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '0.12em', color: '#9ca3af', textTransform: 'uppercase', margin: '0 0 3px' }}>To</p>
                    <p style={{ fontSize: '13px', fontWeight: 600, color: '#1a1a1a', margin: 0 }}>{beneficiary?.name ?? row.description ?? '—'}</p>
                    {beneficiary && (
                      <p style={{ fontSize: '11px', color: '#6b7280', margin: '2px 0 0' }}>
                        {beneficiary.bank_name} · {beneficiary.account_number}
                      </p>
                    )}
                  </div>
                </div>

                {/* Meta rows */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <MetaField label="Category" value={categoryLabel} />
                  <MetaField label="Date" value={new Date(row.created_at).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' })} />
                  <MetaField label="Time" value={new Date(row.created_at).toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' })} />
                  <MetaField label="Status" value={s.label} valueColor={s.color} />
                  {row.narration && <MetaField label="Narration" value={row.narration} span />}
                  {row.description && beneficiary && <MetaField label="Note" value={row.description} span />}
                </div>
              </div>
            </div>

            {/* Reference section */}
            {row.paystack_reference && (
              <div style={{ padding: '0 24px 16px' }}>
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '10px 14px', background: `${TEAL}08`, borderRadius: '8px', border: `1px solid ${TEAL}15`,
                }}>
                  <div>
                    <p style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '0.1em', color: '#9ca3af', textTransform: 'uppercase', margin: '0 0 2px' }}>Reference</p>
                    <p style={{ fontFamily: 'ui-monospace, Consolas, monospace', fontSize: '10px', color: '#555', margin: 0, wordBreak: 'break-all' }}>{row.paystack_reference}</p>
                  </div>
                </div>
              </div>
            )}

            {/* Footer with cert ID */}
            <div style={{
              padding: '12px 24px', borderTop: '1px solid #f0f0f0',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
              <span style={{ fontFamily: 'ui-monospace, Consolas, monospace', fontSize: '9px', color: '#c4c4c7' }}>{certId}</span>
              <span style={{ fontSize: '9px', color: '#c4c4c7' }}>{formatReceiptDateTime(row.created_at)}</span>
            </div>

            {/* Bottom brand bar */}
            <div style={{ height: '3px', background: `linear-gradient(90deg, ${CYAN}, ${TEAL})` }} />
          </div>
        </div>

        {/* Actions bar */}
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

function MetaField({ label, value, valueColor, span }: { label: string; value: string; valueColor?: string; span?: boolean }) {
  return (
    <div style={span ? { gridColumn: '1 / -1' } : undefined}>
      <p style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '0.1em', color: '#9ca3af', textTransform: 'uppercase', margin: '0 0 2px' }}>{label}</p>
      <p style={{ fontSize: '12px', fontWeight: 500, color: valueColor ?? '#374151', margin: 0 }}>{value}</p>
    </div>
  );
}
