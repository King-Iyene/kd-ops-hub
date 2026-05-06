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
import { paystackTransferFee, stampDutyFor, friendlyPaystackError } from '@/lib/paystack';
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
              // Subtle brand-tinted dot pattern on the white card —
              // "engineered paper" feel without overpowering content.
              background: `radial-gradient(circle, rgba(0,105,148,0.045) 1px, transparent 1.4px) 0 0/14px 14px, #ffffff`,
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

            {/* Top accent bar */}
            <div style={{ height: '4px', background: `linear-gradient(90deg, ${BRAND} 0%, ${s.dot} 50%, ${BRAND} 100%)`, position: 'relative', zIndex: 1 }} />

            {/* Header */}
            <div style={{ padding: '24px 28px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '16px', borderBottom: '1px solid #f0f0f0', position: 'relative', zIndex: 1 }}>
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

            {/* Failure analysis — shown only when the transfer failed.
                Combines the Paystack-friendly explanation with bank-standard
                terminology so a finance team can answer the recipient's
                question "what's wrong with my transfer?" without leaving
                this screen. The block prints with the receipt. */}
            {item.status === 'failed' && (() => {
              const f = friendlyPaystackError(item.failure_reason);
              const bankPerspective = bankPerspectiveFor(item.failure_reason);
              const recipientCanFix = recipientCanFixThis(item.failure_reason);
              return (
                <Section title="Why this transfer failed">
                  <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '12px 14px', marginBottom: '8px' }}>
                    <p style={{ fontSize: '13px', fontWeight: 700, color: '#991b1b', marginBottom: '4px' }}>{f.title}</p>
                    <p style={{ fontSize: '12px', color: '#7f1d1d', lineHeight: 1.55 }}>{f.hint}</p>
                  </div>
                  <Row k="Bank's response" v={<span style={{ fontFamily: 'ui-monospace, Consolas, monospace', fontSize: '11px', color: '#444' }}>{item.failure_reason || 'No reason provided'}</span>} />
                  {bankPerspective && <Row k="What this means" v={bankPerspective} />}
                  {recipientCanFix && (
                    <Row
                      k="Recipient action"
                      v={<span style={{ color: '#0369a1' }}>{recipientCanFix}</span>}
                    />
                  )}
                  <Row k="Beneficiary" v={item.account_name || item.full_name || '—'} />
                  <Row k="Beneficiary bank" v={item.bank_name || '—'} />
                  <Row k="Beneficiary account" v={<span style={{ fontFamily: 'ui-monospace, Consolas, monospace', fontSize: '12px' }}>{item.account_number || '—'}</span>} />
                </Section>
              );
            })()}

            {/* Cost breakdown — only on succeeded */}
            {isSucceeded && (
              <Section title="Debit Breakdown">
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
    // position: relative + zIndex: 1 so the section content sits above the
    // status watermark that lives at z-index 0 on the white card.
    <div style={{ padding: '18px 28px', borderBottom: '1px solid #f0f0f0', position: 'relative', zIndex: 1 }}>
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

// ── Failure interpretation helpers ───────────────────────────────────────────
//
// Two layers of explanation on a failed receipt:
//   bankPerspectiveFor → how a Nigerian bank's customer-service desk would
//                        describe the failure to the recipient
//   recipientCanFixThis → the action the recipient (not finance) can take to
//                          unblock the transfer on their side

function bankPerspectiveFor(raw?: string | null): string | null {
  const r = (raw || '').toLowerCase();
  if (!r) return null;
  if (/cannot resolve|could not resolve|unable to resolve|nuban not valid|account not found|account does not exist/.test(r)) {
    return 'The recipient bank could not match the account number to a customer record. The account number may be wrong, or the bank chose to block the resolution check.';
  }
  if (/account number invalid|invalid account/.test(r)) {
    return 'The account number is not the correct length or format for this bank. Most Nigerian banks use 10-digit NUBAN numbers.';
  }
  if (/name mismatch|name does not match/.test(r)) {
    return 'The name on the recipient\'s bank record does not match the name we sent. This is a fraud-prevention check by the receiving bank.';
  }
  if (/transaction not permitted|account.*restricted|dormant|frozen|account.*suspended/.test(r)) {
    return 'The recipient\'s account is currently restricted, dormant, or frozen by their bank. This can happen after long inactivity or on regulatory holds.';
  }
  if (/insufficient funds|balance.*not enough/.test(r)) {
    return 'Our Paystack wallet did not have enough funds to cover this transfer plus fees. Top up the wallet, then retry.';
  }
  if (/cannot initiate third[\- ]?party payouts|payouts.*not.*enabled/.test(r)) {
    return 'Our Paystack account has not yet been activated for outgoing transfers. KYC is still in progress with Paystack compliance.';
  }
  if (/awaiting otp/.test(r)) {
    return 'Paystack is holding this transfer until a Super Admin approves it on dashboard.paystack.co. This is a high-value safeguard.';
  }
  if (/timeout|gateway timeout|temporarily unavailable/.test(r)) {
    return 'The recipient bank\'s servers did not respond in time. Most timeouts clear on a retry within 10 minutes.';
  }
  if (/duplicate|reference already exists|unique reference/.test(r)) {
    return 'Paystack already saw this exact transfer reference. The original transfer probably went through — click "Reconcile with Paystack" to confirm.';
  }
  if (/unknown bank|no paystack bank code/.test(r)) {
    return 'The bank selected for the recipient is not on Paystack\'s supported list. Confirm the bank name with the recipient and pick the closest match.';
  }
  return null;
}

function recipientCanFixThis(raw?: string | null): string | null {
  const r = (raw || '').toLowerCase();
  if (!r) return null;
  if (/cannot resolve|could not resolve|account not found|account does not exist|nuban not valid/.test(r)) {
    return 'Open your bank app, copy the exact 10-digit account number, and confirm the bank name. Send the screenshot to KD Ops finance.';
  }
  if (/account number invalid|invalid account/.test(r)) {
    return 'Send finance your full 10-digit NUBAN account number from your bank app — not your card number.';
  }
  if (/name mismatch|name does not match/.test(r)) {
    return 'Send finance the EXACT name printed on your bank statement (including any middle names or order changes).';
  }
  if (/dormant|frozen|account.*restricted|account.*suspended/.test(r)) {
    return 'Visit your bank or call their customer line to reactivate the account, then ask finance to retry.';
  }
  if (/timeout|gateway timeout|temporarily unavailable/.test(r)) {
    return 'No action — finance will retry within 10 minutes.';
  }
  return null;
}
