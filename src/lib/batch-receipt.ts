import { formatDateTime, formatNaira, formatReceiptDateTime, maskAccountNumber } from '@/lib/format';
import {
  receiptTheme as R,
  docFontImport,
  docBaseStyles,
  docMastheadStyle,
  docDotDivider,
  docTableStyles,
  docWaveFlourish,
  docVerificationStamp,
  docSignatureLine,
  docFooterStyles,
  docPrintStyles,
} from '@/lib/receipt-theme';
import { statusLabel } from '@/components/ui-kit/status-utils';
import { escapeHtml } from '@/lib/html';

interface BatchReceiptParams {
  batch: any;
  items: any[];
  companyName: string;
  logoUrl: string | null;
  profile: { full_name?: string; email?: string } | null;
}

/** Build the printable HTML receipt for a payment batch. Pure — no DOM side effects. */
export function buildBatchReceiptHtml({ batch, items, companyName, logoUrl, profile }: BatchReceiptParams): string {
  const safeName = escapeHtml((batch.name || 'batch').replace(/[^a-zA-Z0-9_-]+/g, '_'));
  const totalSucceeded = items
    .filter((i) => i.status === 'succeeded')
    .reduce((s, i) => s + Number(i.amount_ngn || 0), 0);
  const totalFailed = items
    .filter((i) => i.status === 'failed')
    .reduce((s, i) => s + Number(i.amount_ngn || 0), 0);
  const computedTotal = items.reduce((s, i) => s + Number(i.amount_ngn || 0), 0);
  const amountDisplay = computedTotal > 100_000_000
    ? 'Amount error — please contact support'
    : escapeHtml(formatNaira(computedTotal));
  const hasFailed = batch.status === 'failed' || batch.status === 'partially_processed';
  const failedRows = items.filter((i) => i.status === 'failed');
  const truncRef = (ref: string | null) => {
    if (!ref) return '—';
    return ref.length > 20 ? escapeHtml(ref.slice(0, 20)) + '…' : escapeHtml(ref);
  };
  const reasonCell = (it: any) => {
    if (it.status === 'failed') return `<span style="color:${R.failed}">${escapeHtml(it.failure_reason || 'Transfer rejected by bank')}</span>`;
    if (it.status === 'succeeded') return `<span style="color:${R.success}">Successful</span>`;
    return `<span style="color:${R.pending}">Pending</span>`;
  };

  const batchRef = `KDS-B-${(batch.id || '').replace(/-/g, '').slice(0, 12).toUpperCase()}`;
  const succeededCount = items.filter((i) => i.status === 'succeeded').length;
  const failedCount = failedRows.length;
  const pendingCount = items.length - succeededCount - failedCount;

  const statusPillColor = batch.status === 'succeeded' || batch.status === 'completed'
    ? R.success
    : hasFailed ? R.failed : R.pending;
  const statusPillBg = batch.status === 'succeeded' || batch.status === 'completed'
    ? R.successBg
    : hasFailed ? R.failedBg : R.pendingBg;

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>${safeName} — KDOps Batch Receipt</title>
  <style>
    ${docFontImport}
    ${docBaseStyles}

    .page {
      max-width: 900px;
      margin: 32px auto;
      background: #fff;
      overflow: hidden;
      box-shadow: 0 1px 3px rgba(0,0,0,0.06), 0 8px 32px -8px rgba(0,0,0,0.1);
    }

    ${docMastheadStyle()}

    .meta-grid {
      padding: 24px 40px;
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
      gap: 16px;
      border-bottom: 1px solid ${R.border};
    }
    .meta-item .k {
      font-size: 9px; font-weight: 700; text-transform: uppercase;
      letter-spacing: 0.1em; color: ${R.mutedLight};
    }
    .meta-item .v {
      font-size: 13px; font-weight: 600; color: ${R.bodyText}; margin-top: 3px;
    }

    .summary-strip {
      display: flex; gap: 20px; flex-wrap: wrap;
      padding: 18px 40px;
      border-bottom: 1px solid ${R.border};
      background: ${R.panelBg};
    }
    .summary-item {
      display: flex; align-items: baseline; gap: 8px;
      font-size: 13px;
    }
    .summary-item .dot {
      width: 8px; height: 8px; border-radius: 50%;
      flex-shrink: 0; align-self: center;
    }
    .summary-item .label { color: ${R.muted}; }
    .summary-item .val { font-weight: 700; }

    .body { padding: 28px 40px; }
    .section { margin-bottom: 24px; }
    .section-title {
      font-size: 10px; font-weight: 700; text-transform: uppercase;
      letter-spacing: 0.12em; color: ${R.muted};
      margin-bottom: 10px;
      padding-bottom: 6px;
      border-bottom: 1px solid ${R.border};
      position: relative;
    }
    .section-title::after {
      content: ''; position: absolute; left: 0; bottom: -1px;
      width: 28px; height: 2px; background: ${R.brand};
    }

    ${docTableStyles}

    .pill {
      display: inline-block; padding: 3px 10px; border-radius: 999px;
      font-size: 10px; font-weight: 700; text-transform: uppercase;
      letter-spacing: 0.04em;
    }

    .failed-banner {
      margin: 0 40px 20px;
      background: ${R.failedBg};
      border: 1.5px solid ${R.failedBorder};
      border-radius: 8px;
      padding: 14px 18px;
      color: ${R.failed};
      font-size: 12px;
    }
    .failed-banner strong { display: block; font-size: 14px; margin-bottom: 4px; }

    .totals-panel {
      margin: 20px 0;
      padding: 16px 20px;
      background: ${R.panelBg};
      border: 1px solid ${R.border};
      border-radius: 8px;
      display: flex; justify-content: flex-end; gap: 28px;
      font-size: 13px;
    }
    .totals-panel .label { color: ${R.muted}; font-size: 10px; text-transform: uppercase; letter-spacing: 0.04em; }
    .totals-panel .val { font-weight: 700; margin-top: 2px; }

    .bank-ops-note {
      margin-top: 12px; padding: 10px 14px;
      background: ${R.pendingBg};
      border: 1px solid ${R.pendingBorder};
      border-radius: 6px;
      font-size: 11px; color: ${R.stampText};
    }

    ${docFooterStyles}
    ${docPrintStyles}
  </style>
</head>
<body>
  <div class="page">

    <!-- ── MASTHEAD ── -->
    <div class="doc-masthead">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:20px;flex-wrap:wrap;position:relative;z-index:1;">
        <div>
          <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px;">
            <img
              src="${escapeHtml(logoUrl || '/icon-192.png')}"
              alt="logo"
              style="height:40px;width:40px;object-fit:contain;border-radius:8px;background:rgba(255,255,255,0.15);padding:4px;"
              onerror="this.onerror=null;this.src='/icon-192.png'"
            />
            <div>
              <div style="font-size:13px;font-weight:700;letter-spacing:0.02em;">${escapeHtml(companyName)}</div>
              <div style="font-size:10px;color:rgba(255,255,255,0.5);">KDOps Platform</div>
            </div>
          </div>
          <div class="doc-title">Batch Receipt</div>
          <div class="doc-subtitle">${escapeHtml(batch.name || 'Payment Batch')}</div>
        </div>
        <div style="text-align:right;position:relative;z-index:1;">
          <div style="display:inline-flex;align-items:center;gap:6px;padding:5px 14px;border-radius:20px;background:${statusPillBg};border:1px solid ${statusPillColor}30;">
            <span style="width:7px;height:7px;border-radius:50%;background:${statusPillColor};"></span>
            <span style="font-size:11px;font-weight:700;color:${statusPillColor};">${escapeHtml(statusLabel(batch.status) || batch.status)}</span>
          </div>
          <div style="font-family:ui-monospace,monospace;font-size:10px;color:rgba(255,255,255,0.4);margin-top:8px;">${escapeHtml(batchRef)}</div>
        </div>
      </div>
    </div>

    ${docDotDivider()}

    ${hasFailed ? `
    <div class="failed-banner" style="margin-top:20px;">
      <strong>Failed Payment — No funds transferred to failed recipients</strong>
      ${failedRows.length} of ${items.length} transfer${failedRows.length !== 1 ? 's' : ''} failed.
      Successful transfers are unaffected.
    </div>` : ''}

    <!-- ── META GRID ── -->
    <div class="meta-grid">
      <div class="meta-item"><div class="k">Batch Name</div><div class="v">${escapeHtml(batch.name)}</div></div>
      <div class="meta-item"><div class="k">Transaction Date</div><div class="v">${escapeHtml(formatReceiptDateTime(batch.created_at))}</div></div>
      <div class="meta-item"><div class="k">Period</div><div class="v">${escapeHtml(batch.period || '—')}</div></div>
      <div class="meta-item"><div class="k">Beneficiaries</div><div class="v">${items.length}</div></div>
      <div class="meta-item"><div class="k">Total Amount</div><div class="v" style="color:${R.brand};font-size:15px;">${amountDisplay}</div></div>
      ${batch.scheduled_date ? `<div class="meta-item"><div class="k">Scheduled</div><div class="v">${escapeHtml(formatDateTime(batch.scheduled_date))}</div></div>` : ''}
    </div>

    <!-- ── SUMMARY STRIP ── -->
    <div class="summary-strip">
      ${succeededCount > 0 ? `<div class="summary-item"><span class="dot" style="background:${R.success}"></span><span class="label">Succeeded</span><span class="val" style="color:${R.success}">${succeededCount} · ${escapeHtml(formatNaira(totalSucceeded))}</span></div>` : ''}
      ${failedCount > 0 ? `<div class="summary-item"><span class="dot" style="background:${R.failed}"></span><span class="label">Failed</span><span class="val" style="color:${R.failed}">${failedCount} · ${escapeHtml(formatNaira(totalFailed))}</span></div>` : ''}
      ${pendingCount > 0 ? `<div class="summary-item"><span class="dot" style="background:${R.pending}"></span><span class="label">Pending</span><span class="val" style="color:${R.pending}">${pendingCount}</span></div>` : ''}
    </div>

    <!-- ── BODY ── -->
    <div class="body">

      <div class="section">
        <div class="section-title">Beneficiaries</div>
        <div style="overflow-x:auto;">
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Name</th>
              <th>Bank</th>
              <th>Account</th>
              <th class="right">Amount</th>
              <th>Reference</th>
              <th>Status</th>
              <th>Reason</th>
            </tr>
          </thead>
          <tbody>
            ${items
              .map((it, i) => `
                <tr${it.status === 'failed' ? ` style="background:${R.failedRowBg}"` : ''}>
                  <td style="color:${R.mutedLight};font-size:11px;">${i + 1}</td>
                  <td style="font-weight:500;">${escapeHtml(it.account_name || it.full_name || 'Unknown Recipient')}</td>
                  <td>${escapeHtml(it.bank_name)}</td>
                  <td class="mono" style="font-size:11px;">${escapeHtml(maskAccountNumber(it.account_number))}</td>
                  <td class="right tabular" style="font-weight:600;">${escapeHtml(formatNaira(it.amount_ngn || 0))}</td>
                  <td class="mono" style="font-size:10px;color:${R.mutedLight};">${truncRef(it.paystack_reference)}</td>
                  <td><span class="pill" style="background:${it.status === 'succeeded' ? R.successBg : it.status === 'failed' ? R.failedBg : R.pendingBg};color:${it.status === 'succeeded' ? R.success : it.status === 'failed' ? R.failed : R.pending};">${escapeHtml(it.status)}</span></td>
                  <td style="font-size:11px;">${reasonCell(it)}</td>
                </tr>
              `)
              .join('')}
          </tbody>
        </table>
        </div>
      </div>

      <div class="totals-panel">
        <div><div class="label">Succeeded</div><div class="val" style="color:${R.success}">${escapeHtml(formatNaira(totalSucceeded))}</div></div>
        <div><div class="label">Failed</div><div class="val" style="color:${R.failed}">${escapeHtml(formatNaira(totalFailed))}</div></div>
        <div><div class="label">Total</div><div class="val" style="color:${R.brand};font-size:16px;">${amountDisplay}</div></div>
      </div>

      ${hasFailed && failedRows.length > 0 ? `
      <div class="section" style="margin-top:28px;">
        <div class="section-title" style="color:${R.failed};">Failed Payments (${failedRows.length})</div>
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Bank</th>
              <th>Account</th>
              <th class="right">Amount</th>
              <th>Failure Reason</th>
            </tr>
          </thead>
          <tbody>
            ${failedRows.map((it) => `
              <tr>
                <td style="font-weight:500;">${escapeHtml(it.account_name || it.full_name || 'Unknown Recipient')}</td>
                <td>${escapeHtml(it.bank_name)}</td>
                <td class="mono" style="font-size:11px;">${escapeHtml(maskAccountNumber(it.account_number))}</td>
                <td class="right tabular" style="font-weight:600;">${escapeHtml(formatNaira(it.amount_ngn || 0))}</td>
                <td style="color:${R.failed};font-size:11px;">${escapeHtml(it.failure_reason || 'Transfer rejected by bank')}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
        <div class="bank-ops-note">
          Contact your bank operations team if the failure reason is unclear. No funds were debited for the failed recipients listed above.
        </div>
      </div>` : ''}

      ${docDotDivider()}

      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:20px;flex-wrap:wrap;margin-top:20px;">
        <div>
          ${docVerificationStamp(
            batch.status === 'succeeded' || batch.status === 'completed' ? 'Verified' : 'Processed',
            batchRef,
          )}
        </div>
        ${docSignatureLine()}
      </div>
    </div>

    ${docWaveFlourish()}

    <div class="doc-footer">
      <span>${escapeHtml(companyName)} · Generated by KDOps${profile?.full_name ? ' · ' + escapeHtml(profile.full_name) : ''} · ${escapeHtml(formatDateTime(new Date()))}</span>
      <span class="doc-confidential">Financial Document</span>
    </div>
  </div>

  <script>window.onload = () => { setTimeout(() => window.print(), 250); };</script>
</body>
</html>`;
}
