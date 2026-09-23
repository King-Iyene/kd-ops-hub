import { useRef, useState } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Download, Printer, Share2, X, FileImage, FileText, ChevronDown, CheckCircle2, AlertTriangle, Clock, XCircle, Shield } from 'lucide-react';
import { formatNaira, formatReceiptDateTime } from '@/lib/format';
import { paystackTransferFee } from '@/lib/paystack';
import { useToast } from '@/hooks/use-toast';
import { errorMessage } from '@/lib/db-errors';

const TEAL = '#112B34';
const CYAN = '#A3F2F5';
const _TEAL_90 = '#112B34e6';
const _CYAN_20 = '#A3F2F533';
const CYAN_08 = '#A3F2F514';
const CYAN_40 = '#A3F2F566';

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
    case 'success': return { label: 'Successful', color: '#10b981', bgLight: 'rgba(16,185,129,0.08)', icon: CheckCircle2 };
    case 'failed': return { label: 'Failed', color: '#ef4444', bgLight: 'rgba(239,68,68,0.08)', icon: XCircle };
    case 'reversed': return { label: 'Reversed', color: '#6b7280', bgLight: 'rgba(107,114,128,0.08)', icon: AlertTriangle };
    case 'processing': return { label: 'Processing', color: '#3b82f6', bgLight: 'rgba(59,130,246,0.08)', icon: Clock };
    default: return { label: 'Pending', color: '#f59e0b', bgLight: 'rgba(245,158,11,0.08)', icon: Clock };
  }
}

function NdiLogoWatermark() {
  return (
    <svg viewBox="0 0 400 200" style={{ position: 'absolute', right: '-20px', top: '50%', transform: 'translateY(-50%)', width: '260px', height: '130px', opacity: 0.04, pointerEvents: 'none' }}>
      {/* NDI geometric logo shapes */}
      <rect x="0" y="100" width="100" height="100" rx="0" fill={TEAL} />
      <path d="M0 100 L0 0 A100 100 0 0 1 100 100 Z" fill={TEAL} />
      <rect x="110" y="0" width="100" height="100" fill={TEAL} />
      <path d="M210 0 A100 100 0 0 1 210 200 L110 200 L110 0 Z" fill={TEAL} />
      <rect x="220" y="0" width="80" height="95" fill={TEAL} />
      <rect x="220" y="105" width="80" height="95" fill={TEAL} />
    </svg>
  );
}

function SecurityPattern() {
  return (
    <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', opacity: 0.025 }}>
      <defs>
        <pattern id="ndi-guilloche" x="0" y="0" width="60" height="60" patternUnits="userSpaceOnUse">
          <circle cx="30" cy="30" r="28" fill="none" stroke={TEAL} strokeWidth="0.5" />
          <circle cx="30" cy="30" r="20" fill="none" stroke={TEAL} strokeWidth="0.3" />
          <circle cx="30" cy="30" r="12" fill="none" stroke={TEAL} strokeWidth="0.3" />
          <line x1="0" y1="30" x2="60" y2="30" stroke={TEAL} strokeWidth="0.2" />
          <line x1="30" y1="0" x2="30" y2="60" stroke={TEAL} strokeWidth="0.2" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#ndi-guilloche)" />
    </svg>
  );
}

function VerificationSeal({ status, certId }: { status: string; certId: string }) {
  const isSuccess = status === 'success';
  const sealColor = isSuccess ? '#10b981' : status === 'failed' ? '#ef4444' : '#f59e0b';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px', padding: '16px 0 8px' }}>
      <div style={{
        width: '56px', height: '56px', borderRadius: '50%',
        border: `2.5px solid ${sealColor}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: `${sealColor}0a`,
        position: 'relative',
      }}>
        <div style={{
          width: '44px', height: '44px', borderRadius: '50%',
          border: `1px dashed ${sealColor}60`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Shield size={18} style={{ color: sealColor }} />
        </div>
      </div>
      <div style={{ textAlign: 'center' }}>
        <p style={{ fontSize: '8px', fontWeight: 800, letterSpacing: '0.15em', color: sealColor, textTransform: 'uppercase', margin: 0 }}>
          {isSuccess ? 'Verified & Settled' : status === 'failed' ? 'Transfer Failed' : 'Awaiting Settlement'}
        </p>
        <p style={{ fontFamily: 'ui-monospace, Consolas, monospace', fontSize: '8px', color: '#b0b0b5', margin: '2px 0 0' }}>{certId}</p>
      </div>
    </div>
  );
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
  const txDate = new Date(row.created_at);

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
        await navigator.share({ title: 'NDI Transfer Receipt', text: `${formatNaira(amount)} to ${beneficiary?.name ?? 'recipient'}`, files: [file] });
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
      <DialogContent className="kd-receipt-dialog max-w-[540px] p-0 border-0 bg-transparent shadow-none max-h-[92vh] overflow-y-auto">
        {/* The full receipt card — captured for export */}
        <div
          ref={cardRef}
          id="ndi-receipt-card"
          style={{
            position: 'relative', maxWidth: '520px', margin: '0 auto',
            background: '#ffffff', borderRadius: '16px', overflow: 'hidden',
            boxShadow: '0 8px 40px rgba(17,43,52,0.25), 0 0 0 1px rgba(17,43,52,0.08)',
            fontFamily: 'Inter, system-ui, sans-serif', color: '#1a1a1a',
          }}
        >
          {/* Security guilloche background */}
          <SecurityPattern />

          {/* ── HEADER: dark teal masthead ── */}
          <div style={{
            position: 'relative', overflow: 'hidden',
            background: `linear-gradient(135deg, ${TEAL} 0%, #1a3d4a 100%)`,
            padding: '24px 28px 28px',
          }}>
            {/* Close button */}
            <button
              type="button" onClick={onClose} aria-label="Close"
              style={{
                position: 'absolute', top: '12px', right: '12px', height: '28px', width: '28px', borderRadius: '50%',
                border: 'none', background: CYAN_08, color: CYAN,
                display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', zIndex: 5,
              }}
            >
              <X size={14} />
            </button>

            {/* NDI Logo + Brand */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px' }}>
              {/* Mini NDI geometric logo */}
              <svg viewBox="0 0 36 18" width="36" height="18" style={{ flexShrink: 0 }}>
                <rect x="0" y="9" width="9" height="9" fill={CYAN} />
                <path d="M0 9 L0 0 A9 9 0 0 1 9 9 Z" fill={CYAN} />
                <rect x="10" y="0" width="9" height="9" fill={CYAN} />
                <path d="M19 0 A9 9 0 0 1 19 18 L10 18 L10 0 Z" fill={CYAN} />
                <rect x="20" y="0" width="8" height="8" fill={CYAN} />
                <rect x="20" y="10" width="8" height="8" fill={CYAN} />
              </svg>
              <div>
                <p style={{ fontSize: '11px', fontWeight: 800, color: CYAN, letterSpacing: '0.08em', textTransform: 'uppercase', margin: 0 }}>
                  Niger Delta Innovate
                </p>
                <p style={{ fontSize: '8px', color: CYAN_40, letterSpacing: '0.06em', textTransform: 'uppercase', margin: '2px 0 0' }}>
                  Corporate Transfer Receipt
                </p>
              </div>
            </div>

            {/* Amount — hero */}
            <p style={{ fontSize: '40px', fontWeight: 900, color: '#ffffff', letterSpacing: '-0.025em', lineHeight: 1, margin: 0 }}>
              {formatNaira(amount)}
            </p>
            {isSuccess && fee > 0 && (
              <p style={{ fontSize: '11px', color: CYAN_40, marginTop: '4px' }}>
                + {formatNaira(fee)} fee · {formatNaira(total)} total
              </p>
            )}

            {/* Status pill */}
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: '5px',
              marginTop: '12px', padding: '5px 12px',
              background: s.bgLight, borderRadius: '20px',
              border: `1px solid ${s.color}30`,
            }}>
              <StatusIcon size={12} style={{ color: s.color }} />
              <span style={{ fontSize: '11px', fontWeight: 700, color: s.color }}>{s.label}</span>
            </div>

            {/* Failure reason inline */}
            {row.status === 'failed' && row.failure_reason && (
              <p style={{ fontSize: '10px', color: '#fca5a5', marginTop: '6px' }}>
                {row.failure_reason}
              </p>
            )}

            {/* Watermark logo in header */}
            <NdiLogoWatermark />
          </div>

          {/* ── Thin accent divider ── */}
          <div style={{ height: '2px', background: `linear-gradient(90deg, ${CYAN}, ${TEAL} 50%, transparent)` }} />

          {/* ── BODY ── */}
          <div style={{ position: 'relative', padding: '24px 28px' }}>

            {/* From → To flow */}
            <div style={{ display: 'flex', alignItems: 'stretch', gap: '0', marginBottom: '24px' }}>
              {/* From */}
              <div style={{ flex: 1, padding: '14px 16px', background: '#f7fafb', borderRadius: '10px 0 0 10px', borderRight: 'none' }}>
                <p style={{ fontSize: '8px', fontWeight: 800, letterSpacing: '0.14em', color: '#9ca3af', textTransform: 'uppercase', margin: '0 0 6px' }}>From</p>
                <p style={{ fontSize: '14px', fontWeight: 700, color: TEAL, margin: 0 }}>NDI Corporate</p>
                <p style={{ fontSize: '10px', color: '#9ca3af', margin: '3px 0 0' }}>Wema Bank · 9817509971</p>
              </div>

              {/* Arrow connector */}
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                width: '40px', background: '#f7fafb',
              }}>
                <svg width="20" height="12" viewBox="0 0 20 12"><path d="M0 6h16M12 1l5 5-5 5" fill="none" stroke={TEAL} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </div>

              {/* To */}
              <div style={{ flex: 1, padding: '14px 16px', background: '#f7fafb', borderRadius: '0 10px 10px 0', borderLeft: 'none' }}>
                <p style={{ fontSize: '8px', fontWeight: 800, letterSpacing: '0.14em', color: '#9ca3af', textTransform: 'uppercase', margin: '0 0 6px' }}>To</p>
                <p style={{ fontSize: '14px', fontWeight: 700, color: '#1a1a1a', margin: 0 }}>{beneficiary?.name ?? row.description ?? '—'}</p>
                {beneficiary && (
                  <p style={{ fontSize: '10px', color: '#9ca3af', margin: '3px 0 0' }}>
                    {beneficiary.bank_name} · {beneficiary.account_number}
                  </p>
                )}
              </div>
            </div>

            {/* Details table */}
            <div style={{
              border: `1px solid #e8ecee`, borderRadius: '10px', overflow: 'hidden',
            }}>
              <DetailRow label="Category" value={categoryLabel} />
              <DetailRow label="Date" value={txDate.toLocaleDateString('en-NG', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' })} />
              <DetailRow label="Time" value={txDate.toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit', second: '2-digit' })} />
              {isSuccess && fee > 0 && <DetailRow label="Transaction Fee" value={formatNaira(fee)} />}
              {isSuccess && fee > 0 && <DetailRow label="Total Debit" value={formatNaira(total)} bold />}
              {row.narration && <DetailRow label="Narration" value={row.narration} />}
              {row.description && beneficiary && <DetailRow label="Description" value={row.description} />}
              {row.paystack_reference && (
                <DetailRow label="Reference" value={row.paystack_reference} mono last />
              )}
            </div>

            {/* Verification seal */}
            <VerificationSeal status={row.status} certId={certId} />
          </div>

          {/* ── FOOTER ── */}
          <div style={{
            padding: '10px 28px', background: '#f9fafb', borderTop: '1px solid #f0f0f0',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <span style={{ fontSize: '8px', color: '#c4c4c7', letterSpacing: '0.04em' }}>
              nigerdeltainnovate.org
            </span>
            <span style={{ fontFamily: 'ui-monospace, Consolas, monospace', fontSize: '8px', color: '#c4c4c7' }}>
              {formatReceiptDateTime(row.created_at)}
            </span>
          </div>
        </div>

        {/* ── ACTIONS BAR ── */}
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

function DetailRow({ label, value, mono, bold, last }: { label: string; value: string; mono?: boolean; bold?: boolean; last?: boolean }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
      padding: '10px 16px',
      borderBottom: last ? 'none' : '1px solid #f0f2f3',
    }}>
      <span style={{ fontSize: '11px', color: '#8b919a', flexShrink: 0, marginRight: '12px' }}>{label}</span>
      <span style={{
        fontSize: bold ? '12px' : '11px',
        fontWeight: bold ? 700 : 500,
        color: bold ? TEAL : '#2d3339',
        textAlign: 'right',
        wordBreak: mono ? 'break-all' : undefined,
        fontFamily: mono ? 'ui-monospace, Consolas, monospace' : undefined,
        maxWidth: '65%',
      }}>{value}</span>
    </div>
  );
}
