import { useRef, useState } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Download, Printer, Share2, X, FileImage, FileText, ChevronDown } from 'lucide-react';
import { formatNaira, formatReceiptDateTime } from '@/lib/format';
import { paystackTransferFee } from '@/lib/paystack';
import { useToast } from '@/hooks/use-toast';
import { hexToRgba } from '@/lib/receipt-theme';
import { errorMessage } from '@/lib/db-errors';

const NDI_BRAND = '#e97c1f';
const NDI_BRAND_DARK = '#b35f14';

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

function statusInfo(status: string) {
  if (status === 'success') return { label: 'SUCCESSFUL', dot: '#117a3d', bg: '#e6f7ec' };
  if (status === 'failed') return { label: 'FAILED', dot: '#b22222', bg: '#fde9e9' };
  if (status === 'reversed') return { label: 'REVERSED', dot: '#71717a', bg: '#f4f4f5' };
  if (status === 'processing') return { label: 'PROCESSING', dot: '#2563eb', bg: '#eff6ff' };
  return { label: 'PENDING', dot: '#8c6700', bg: '#fff5e0' };
}

export function NdiTransferReceipt({ open, onClose, row, beneficiary, categoryLabel }: Props) {
  const { toast } = useToast();
  const cardRef = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState<string | null>(null);

  if (!row) return null;

  const s = statusInfo(row.status);
  const amount = Number(row.amount_ngn);
  const fee = row.status === 'success' ? paystackTransferFee(amount) : 0;
  const total = amount + fee;
  const dateStr = formatReceiptDateTime(row.created_at);
  const certId = `NDI-${row.id.replace(/-/g, '').slice(0, 20).toUpperCase()}`;
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
        await navigator.share({ title: `NDI Transfer Receipt — ${beneficiary?.name ?? 'Transfer'}`, text: `${formatNaira(amount)} to ${beneficiary?.name ?? 'recipient'}`, files: [file] });
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
      <DialogContent className="kd-receipt-dialog max-w-[600px] p-0 border-0 bg-transparent shadow-none max-h-[92vh] overflow-y-auto">
        <div style={{ position: 'relative', background: '#1a1a1e', padding: '24px 18px', borderRadius: '16px' }}>
          <button
            type="button" onClick={onClose} aria-label="Close"
            style={{
              position: 'absolute', top: '12px', right: '12px', height: '32px', width: '32px', borderRadius: '8px',
              border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.06)', color: '#fff',
              display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', zIndex: 5,
            }}
          >
            <X size={16} />
          </button>

          <div
            ref={cardRef}
            id="ndi-receipt-card"
            style={{
              position: 'relative', maxWidth: '520px', margin: '0 auto',
              background: '#ffffff',
              borderRadius: '14px', overflow: 'hidden',
              boxShadow: '0 1px 3px rgba(0,0,0,0.08), 0 24px 48px -14px rgba(0,0,0,0.35)',
              fontFamily: 'Inter, system-ui, sans-serif', color: '#18181b',
            }}
          >
            {/* Top brand bar */}
            <div style={{ height: '4px', background: `linear-gradient(90deg, ${NDI_BRAND}, ${NDI_BRAND_DARK})` }} />

            {/* Masthead */}
            <div style={{ padding: '28px 28px 0', position: 'relative', zIndex: 1 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '16px' }}>
                <div>
                  <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.2em', color: NDI_BRAND, textTransform: 'uppercase' }}>
                    Corporate Transfer
                  </div>
                  <div style={{ fontSize: '32px', fontWeight: 900, color: '#0c1b26', letterSpacing: '-0.03em', lineHeight: 1, marginTop: '4px' }}>
                    RECEIPT
                  </div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontSize: '14px', fontWeight: 800, color: '#111' }}>NDI</div>
                  <div style={{ fontSize: '10px', color: '#8194a0', marginTop: '1px' }}>Niger Delta Innovate</div>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '24px', marginTop: '20px', flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '0.1em', color: '#9aa5ac', textTransform: 'uppercase' }}>Receipt No.</div>
                  <div style={{ fontFamily: 'ui-monospace, Consolas, monospace', fontSize: '11px', color: '#333', marginTop: '2px' }}>{certId}</div>
                </div>
                <div>
                  <div style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '0.1em', color: '#9aa5ac', textTransform: 'uppercase' }}>Date</div>
                  <div style={{ fontSize: '11px', color: '#333', marginTop: '2px' }}>{dateStr}</div>
                </div>
                <div style={{ marginLeft: 'auto' }}>
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '3px 10px', borderRadius: '999px',
                    background: s.bg, color: s.dot, fontWeight: 700, fontSize: '10px',
                    letterSpacing: '0.05em', textTransform: 'uppercase',
                  }}>
                    <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: s.dot, display: 'inline-block' }} />
                    {s.label}
                  </span>
                </div>
              </div>
            </div>

            {/* Divider */}
            <div style={{ margin: '20px 28px 0', height: '2px', background: NDI_BRAND, position: 'relative', zIndex: 1 }}>
              {[0.2, 0.5, 0.8].map((pos) => (
                <span key={pos} style={{
                  position: 'absolute', top: '50%', left: `${pos * 100}%`, transform: 'translate(-50%, -50%)',
                  width: '5px', height: '5px', borderRadius: '50%', background: NDI_BRAND,
                }} />
              ))}
            </div>

            {/* FROM / TO */}
            <div style={{ display: 'flex', padding: '20px 28px', gap: '20px', zIndex: 1, position: 'relative', flexWrap: 'wrap' }}>
              <div style={{ flex: '1 1 160px' }}>
                <div style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '0.1em', color: NDI_BRAND, textTransform: 'uppercase', marginBottom: '5px' }}>From</div>
                <div style={{ fontSize: '13px', fontWeight: 700, color: '#111' }}>Niger Delta Innovate</div>
                <div style={{ fontSize: '11px', color: '#8194a0', marginTop: '2px' }}>NDI Corporate Account</div>
              </div>
              <div style={{ flex: '1 1 160px' }}>
                <div style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '0.1em', color: NDI_BRAND, textTransform: 'uppercase', marginBottom: '5px' }}>To</div>
                <div style={{ fontSize: '13px', fontWeight: 700, color: '#111' }}>{beneficiary?.name ?? row.description ?? '—'}</div>
                {beneficiary && (
                  <div style={{ fontSize: '11px', color: '#8194a0', marginTop: '2px' }}>
                    {beneficiary.bank_name} · <span style={{ fontFamily: 'ui-monospace, Consolas, monospace' }}>{beneficiary.account_number}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Itemized table */}
            <div style={{ padding: '0 28px 8px', position: 'relative', zIndex: 1 }}>
              <div style={{
                display: 'flex', fontSize: '9px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
                color: '#8194a0', borderBottom: `2px solid ${NDI_BRAND}`, paddingBottom: '7px',
              }}>
                <div style={{ flex: 1 }}>Description</div>
                <div style={{ width: '110px', textAlign: 'right' }}>Amount</div>
              </div>

              <div style={{ display: 'flex', padding: '12px 0', borderBottom: '1px solid #eee' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: '12px' }}>Transfer to {beneficiary?.name ?? 'recipient'}</div>
                  <div style={{ fontSize: '10.5px', color: '#8194a0', marginTop: '2px' }}>{categoryLabel}</div>
                  {row.narration && <div style={{ fontSize: '10.5px', color: '#8194a0', fontStyle: 'italic', marginTop: '1px' }}>{row.narration}</div>}
                </div>
                <div style={{ width: '110px', textAlign: 'right', fontWeight: 600, fontSize: '12px' }}>{formatNaira(amount)}</div>
              </div>

              {isSuccess && fee > 0 && (
                <div style={{ display: 'flex', padding: '7px 0', fontSize: '11.5px', color: '#71717a' }}>
                  <div style={{ flex: 1 }}>Transfer fee</div>
                  <div style={{ width: '110px', textAlign: 'right' }}>{formatNaira(fee)}</div>
                </div>
              )}

              {isSuccess && (
                <div style={{
                  display: 'flex', justifyContent: 'flex-end', alignItems: 'baseline', gap: '28px',
                  padding: '12px 0 4px', borderTop: `2px solid ${NDI_BRAND}`, marginTop: '4px',
                }}>
                  <div style={{ fontWeight: 800, fontSize: '13px', color: '#111' }}>TOTAL</div>
                  <div style={{ fontWeight: 900, fontSize: '18px', color: NDI_BRAND }}>{formatNaira(total)}</div>
                </div>
              )}

              {!isSuccess && (
                <div style={{
                  display: 'flex', justifyContent: 'flex-end', alignItems: 'baseline', gap: '28px',
                  padding: '12px 0 4px', borderTop: '1px solid #eee', marginTop: '4px',
                }}>
                  <div style={{ fontWeight: 800, fontSize: '13px', color: '#111' }}>AMOUNT</div>
                  <div style={{ fontWeight: 900, fontSize: '18px', color: '#333' }}>{formatNaira(amount)}</div>
                </div>
              )}

              {row.status === 'failed' && row.failure_reason && (
                <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '10px 12px', marginTop: '12px' }}>
                  <p style={{ fontSize: '11.5px', fontWeight: 700, color: '#991b1b', margin: 0 }}>{row.failure_reason}</p>
                </div>
              )}

              {/* Verification stamp */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '14px' }}>
                <div
                  aria-hidden
                  style={{
                    width: '70px', height: '70px', flexShrink: 0,
                    borderRadius: '50%', border: `2.5px dashed ${s.dot}`, display: 'flex', alignItems: 'center',
                    justifyContent: 'center', transform: 'rotate(-13deg)', background: hexToRgba(s.dot, 0.04),
                  }}
                >
                  <div style={{ textAlign: 'center', color: s.dot, lineHeight: 1.3 }}>
                    <div style={{ fontSize: '6.5px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Paystack</div>
                    <div style={{ fontSize: '10px', fontWeight: 900, letterSpacing: '0.03em' }}>{s.label}</div>
                    <div style={{ fontSize: '6px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Verified</div>
                  </div>
                </div>
              </div>

              {/* Reference */}
              {row.paystack_reference && (
                <div style={{ marginTop: '12px', padding: '8px 10px', background: '#f9fafb', borderRadius: '6px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '0.08em', color: '#9aa5ac', textTransform: 'uppercase' }}>Reference</div>
                    <div style={{ fontFamily: 'ui-monospace, Consolas, monospace', fontSize: '10px', color: '#555', marginTop: '2px', wordBreak: 'break-all' }}>{row.paystack_reference}</div>
                  </div>
                </div>
              )}
            </div>

            {/* Wave flourish */}
            <div style={{ position: 'relative', marginTop: '16px' }}>
              <svg viewBox="0 0 600 50" preserveAspectRatio="none" style={{ display: 'block', width: '100%', height: '42px' }}>
                <path d="M0,28 C120,52 240,6 360,30 C450,48 540,8 600,24 L600,50 L0,50 Z" fill={hexToRgba(NDI_BRAND, 0.10)} />
                <path d="M0,36 C100,12 220,48 340,20 C420,4 520,38 600,18 L600,50 L0,50 Z" fill={hexToRgba(NDI_BRAND, 0.20)} />
              </svg>
              <div style={{
                position: 'absolute', left: '28px', bottom: '8px', fontFamily: 'Georgia, "Times New Roman", serif',
                fontStyle: 'italic', fontSize: '13px', color: NDI_BRAND, opacity: 0.85,
              }}>
                NDI · verified corporate transfer
              </div>
            </div>

            {/* Certificate ID */}
            <div style={{ padding: '8px 28px 18px', textAlign: 'center', position: 'relative', zIndex: 1 }}>
              <span style={{ fontFamily: 'ui-monospace, Consolas, monospace', fontSize: '9px', color: '#c4c4c7', letterSpacing: '0.02em', wordBreak: 'break-all' }}>
                {certId}
              </span>
            </div>
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
