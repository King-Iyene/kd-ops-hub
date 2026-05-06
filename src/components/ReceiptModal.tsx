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
import { useRef, useState } from 'react';
import html2canvas from 'html2canvas';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Download, Printer, Share2, X } from 'lucide-react';
import { formatReceiptDateTime } from '@/lib/format';
import { paystackTransferFee, stampDutyFor } from '@/lib/paystack';
import { useToast } from '@/hooks/use-toast';

interface Props {
  open: boolean;
  onClose: () => void;
  item: any;
  batch: any;
  companyName?: string;
  logoUrl?: string | null;
}

const BRAND = '#006994';

const fmtNgn = (n: number) => `₦${n.toLocaleString('en-NG', { minimumFractionDigits: 2 })}`;

function statusInfo(status: string) {
  if (status === 'succeeded' || status === 'processed' || status === 'completed') {
    return { label: 'SUCCESSFUL', dot: '#16a34a', text: 'text-emerald-600', tone: 'success' as const };
  }
  if (status === 'failed' || status === 'rejected') {
    return { label: 'FAILED', dot: '#dc2626', text: 'text-red-600', tone: 'failed' as const };
  }
  if (status === 'reversed' || status === 'refunded') {
    return { label: 'REVERSED', dot: '#94a3b8', text: 'text-slate-500', tone: 'reversed' as const };
  }
  return { label: 'PENDING', dot: '#d97706', text: 'text-amber-600', tone: 'pending' as const };
}

export function ReceiptModal({ open, onClose, item, batch, companyName, logoUrl }: Props) {
  const cardRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();
  const [busy, setBusy] = useState<'download' | 'share' | null>(null);

  if (!item) return null;

  const s = statusInfo(item.status);
  const isSucceeded = item.status === 'succeeded' || item.status === 'processed';

  const txnDateStr = item.processed_at || item.created_at
    ? formatReceiptDateTime(item.processed_at || item.created_at)
    : '—';
  const narration =
    item.narration
    || batch?.description
    || batch?.notes
    || `${companyName || 'KDOps'} · ${batch?.name || 'batch'}`;

  const amount = Number(item.amount_ngn) || 0;
  const psFee = paystackTransferFee(amount);
  const duty = stampDutyFor(amount);
  const total = amount + psFee + duty;
  const internalRef = item.id ? String(item.id).toLowerCase().replace(/-/g, '') : '—';
  const certId = `kdops_${internalRef}`;
  const shortName = (companyName || 'KD Squares').replace(/\s*Ltd\.?$/i, '').trim();
  const initials = shortName.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
  const fileSafe = (str: string) => str.replace(/[^a-z0-9_-]+/gi, '_').slice(0, 40) || 'receipt';
  const filename = `kdops_receipt_${fileSafe(item.full_name || certId)}.png`;

  const renderToBlob = async (): Promise<Blob | null> => {
    const node = cardRef.current;
    if (!node) return null;
    const canvas = await html2canvas(node, {
      backgroundColor: '#ffffff',
      scale: 2,
      useCORS: true,
      logging: false,
    });
    return new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), 'image/png', 0.96),
    );
  };

  const handlePrint = () => {
    document.body.classList.add('kd-receipt-printing');
    const restore = () => {
      document.body.classList.remove('kd-receipt-printing');
      window.removeEventListener('afterprint', restore);
    };
    window.addEventListener('afterprint', restore);
    setTimeout(() => window.print(), 50);
  };

  const handleDownload = async () => {
    setBusy('download');
    try {
      const blob = await renderToBlob();
      if (!blob) throw new Error('Could not render receipt');
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      toast({ title: 'Receipt downloaded' });
    } catch (err: any) {
      toast({ title: 'Download failed', description: err?.message || 'Try Print instead.', variant: 'destructive' });
    } finally {
      setBusy(null);
    }
  };

  const handleShare = async () => {
    setBusy('share');
    try {
      const blob = await renderToBlob();
      const file = blob ? new File([blob], filename, { type: 'image/png' }) : null;
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
        className="kd-receipt-dialog max-w-[640px] p-0 overflow-hidden border-0 bg-transparent shadow-none"
      >
        {/* Backdrop = solid brand blue (no glass), with faint status watermark */}
        <div
          className="kd-receipt-backdrop"
          style={{
            position: 'relative',
            background:
              `linear-gradient(180deg, ${BRAND} 0%, #00547a 100%)`,
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
              color: 'rgba(255,255,255,0.10)',
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
              border: '1px solid rgba(255,255,255,0.25)',
              background: 'rgba(255,255,255,0.10)',
              color: '#fff',
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
              background: '#fff',
              borderRadius: '12px',
              overflow: 'hidden',
              boxShadow: '0 1px 3px rgba(0,0,0,0.08), 0 18px 40px -12px rgba(0,0,0,0.45)',
              fontFamily: 'Inter, system-ui, sans-serif',
              color: '#18181b',
              zIndex: 1,
            }}
          >
            {/* Top accent bar */}
            <div style={{ height: '4px', background: `linear-gradient(90deg, ${BRAND} 0%, ${s.dot} 50%, ${BRAND} 100%)` }} />

            {/* Header */}
            <div style={{ padding: '24px 28px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '16px', borderBottom: '1px solid #f0f0f0' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                {logoUrl ? (
                  <img src={logoUrl} alt="" style={{ height: '30px', width: 'auto', maxWidth: '120px', objectFit: 'contain' }} />
                ) : (
                  <div style={{ width: '34px', height: '34px', borderRadius: '8px', background: BRAND, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px', fontWeight: 800 }}>
                    {initials}
                  </div>
                )}
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: '13px', fontWeight: 700, color: '#111' }}>{shortName}</div>
                  <div style={{ fontSize: '11px', color: '#888', marginTop: '1px' }}>
                    {s.tone === 'failed' ? 'Payment Failed' : s.tone === 'reversed' ? 'Payment Reversed' : s.tone === 'pending' ? 'Payment Pending' : 'Payment Confirmation'}
                  </div>
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '26px', fontWeight: 800, color: '#111', letterSpacing: '-0.02em', lineHeight: 1 }}>{fmtNgn(amount)}</div>
                <div style={{ fontSize: '10px', color: '#aaa', marginTop: '4px', letterSpacing: '0.04em', textTransform: 'uppercase' }}>Settlement amount</div>
              </div>
            </div>

            {/* Transfer details */}
            <Section title="Transfer Details">
              <Row k="Status" v={
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontWeight: 700, color: s.dot, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: s.dot, display: 'inline-block' }} />
                  {s.label}
                </span>
              } />
              <Row k="Date" v={txnDateStr} />
              <Row k="Sent to" v={item.account_name || item.full_name || '—'} />
            </Section>

            {/* Beneficiary */}
            <Section title="Beneficiary">
              <Row k="Bank" v={item.bank_name || '—'} />
              <Row k="Account number" v={<span style={{ fontFamily: 'ui-monospace, Consolas, monospace', fontSize: '12px', letterSpacing: '0.04em' }}>{item.account_number || '—'}</span>} />
            </Section>

            {/* Reference */}
            <Section title="Reference">
              <Row k="Narration" v={narration} />
              {item.paystack_reference && (
                <Row k="Provider reference" v={<span style={{ fontFamily: 'ui-monospace, Consolas, monospace', fontSize: '12px', letterSpacing: '0.04em' }}>{item.paystack_reference}</span>} />
              )}
            </Section>

            {/* Cost breakdown — only on succeeded */}
            {isSucceeded && (
              <Section title="Debit Breakdown">
                <Row k="Principal" v={fmtNgn(amount)} />
                {duty > 0 && <Row k="Stamp duty" v={fmtNgn(duty)} />}
                <Row k="Transfer fee" v={fmtNgn(psFee)} />
                <div style={{ borderTop: '1px solid #e4e4e7', paddingTop: '10px', marginTop: '4px', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', fontSize: '15px' }}>
                  <span style={{ fontWeight: 600, color: '#111' }}>Total debit</span>
                  <span style={{ fontWeight: 700, color: '#111' }}>{fmtNgn(total)}</span>
                </div>
              </Section>
            )}

            {/* Footer cert ID */}
            <div style={{ padding: '14px 28px 22px', borderTop: '1px solid #f0f0f0' }}>
              <span style={{ fontFamily: 'ui-monospace, Consolas, monospace', fontSize: '10px', color: '#c4c4c7', letterSpacing: '0.02em', wordBreak: 'break-all' }}>
                {certId}
              </span>
            </div>
          </div>
        </div>

        {/* Action buttons — flat / simple, sit below the receipt backdrop */}
        <div className="kd-receipt-actions" style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', padding: '12px 18px 18px' }}>
          <Button variant="outline" size="sm" onClick={handleShare} disabled={busy !== null}>
            <Share2 className="h-4 w-4 mr-1.5" />
            {busy === 'share' ? 'Preparing…' : 'Share'}
          </Button>
          <Button variant="outline" size="sm" onClick={handleDownload} disabled={busy !== null}>
            <Download className="h-4 w-4 mr-1.5" />
            {busy === 'download' ? 'Saving…' : 'Download'}
          </Button>
          <Button size="sm" onClick={handlePrint} disabled={busy !== null}>
            <Printer className="h-4 w-4 mr-1.5" />
            Print
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Sub-components ───────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ padding: '18px 28px', borderBottom: '1px solid #f0f0f0' }}>
      <div style={{ fontSize: '10px', fontWeight: 700, color: BRAND, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: '10px' }}>
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
