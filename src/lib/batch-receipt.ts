import { formatDateTime, formatNaira, formatReceiptDateTime, maskAccountNumber } from '@/lib/format';
import { receiptTheme as R } from '@/lib/receipt-theme';
import { statusLabel } from '@/components/ui-kit/StatusBadge';
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

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>${safeName} — KDOps Receipt</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Cabin:wght@400;600;700&display=swap');
    * { box-sizing: border-box; }
    body { font-family: 'Cabin', system-ui, sans-serif; color: ${R.bodyText}; padding: 32px; max-width: 900px; margin: 0 auto; }
    .brand { display: flex; align-items: center; gap: 12px; padding-bottom: 16px; border-bottom: 3px solid ${R.brand}; margin-bottom: 24px; }
    .brand .mark { width: 44px; height: 44px; border-radius: 8px; background: ${R.brand}; color: white; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 16px; }
    h1 { font-size: 22px; margin: 0 0 4px; }
    h2 { font-size: 16px; margin: 24px 0 8px; color: ${R.brand}; }
    .failed-banner { background: ${R.failedBg}; border: 2px solid ${R.failedBorder}; border-radius: 8px; padding: 14px 18px; margin-bottom: 24px; color: ${R.failed}; font-size: 13px; }
    .failed-banner strong { display: block; font-size: 15px; margin-bottom: 6px; }
    .meta { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px 24px; font-size: 13px; }
    .meta div { padding: 6px 0; }
    .meta .l { color: ${R.muted}; font-size: 11px; text-transform: uppercase; letter-spacing: 0.04em; }
    .meta .v { font-weight: 600; }
    table { width: 100%; border-collapse: collapse; font-size: 11px; margin-top: 8px; }
    th, td { padding: 7px 8px; text-align: left; border-bottom: 1px solid ${R.border}; }
    th { background: ${R.panelBg}; color: ${R.muted}; font-weight: 600; text-transform: uppercase; font-size: 10px; letter-spacing: 0.05em; }
    td.mono { font-family: monospace; font-size: 10px; }
    .right { text-align: right; }
    .totals { margin-top: 16px; padding: 12px 16px; background: ${R.panelBg}; border-radius: 8px; display: flex; justify-content: flex-end; gap: 24px; font-size: 13px; }
    .totals .v { font-weight: 700; }
    .stamp { margin-top: 32px; padding: 12px; border: 2px dashed ${R.gold}; border-radius: 8px; color: ${R.stampText}; font-size: 12px; text-align: center; }
    .footer { margin-top: 28px; font-size: 11px; color: ${R.mutedLight}; text-align: center; }
    .pill { display: inline-block; padding: 2px 7px; border-radius: 999px; font-size: 10px; font-weight: 600; text-transform: uppercase; }
    .pill.success { background: ${R.successBg}; color: ${R.success}; }
    .pill.failed  { background: ${R.failedBg}; color: ${R.failed}; }
    .pill.pending { background: ${R.pendingBg}; color: ${R.pending}; }
    .failed-section { margin-top: 28px; }
    .failed-section h2 { color: ${R.failed}; }
    .bank-ops-note { margin-top: 12px; padding: 10px 14px; background: ${R.pendingBg}; border: 1px solid ${R.pendingBorder}; border-radius: 6px; font-size: 11px; color: ${R.stampText}; }
    @media print { body { padding: 16px; } .no-print { display: none; } }
  </style>
</head>
<body>
  <div class="brand">
    <img
      src="${escapeHtml(logoUrl || '/icon-192.png')}"
      alt="logo"
      style="height:40px;width:40px;object-fit:contain;border-radius:6px;"
    />
    <div>
      <h1>Payment Batch Receipt</h1>
      <div style="font-size:12px;color:${R.muted}">${escapeHtml(companyName)} · KDOps</div>
    </div>
  </div>

  ${hasFailed ? `
  <div class="failed-banner">
    <strong>⚠️ FAILED PAYMENT — No funds were transferred to failed recipients</strong>
    ${failedRows.length} of ${items.length} transfer${failedRows.length !== 1 ? 's' : ''} failed.
    Successful transfers are unaffected. Review the Failed Payments section below.
  </div>` : ''}

  <div class="meta">
    <div><div class="l">Batch</div><div class="v">${escapeHtml(batch.name)}</div></div>
    <div><div class="l">Status</div><div class="v">${escapeHtml(statusLabel(batch.status) || batch.status)}</div></div>
    <div><div class="l">Transaction Date</div><div class="v">${escapeHtml(formatReceiptDateTime(batch.created_at))}</div></div>
    <div><div class="l">Period</div><div class="v">${escapeHtml(batch.period || '—')}</div></div>
    <div><div class="l">Beneficiaries</div><div class="v">${items.length}</div></div>
    <div><div class="l">Total Amount</div><div class="v">${amountDisplay}</div></div>
    ${batch.scheduled_date ? `<div><div class="l">Scheduled</div><div class="v">${escapeHtml(formatDateTime(batch.scheduled_date))}</div></div>` : ''}
    <div><div class="l">Generated</div><div class="v">${escapeHtml(formatReceiptDateTime(new Date()))}</div></div>
  </div>

  <h2>Beneficiaries</h2>
  <table>
    <thead>
      <tr>
        <th>#</th>
        <th>Name</th>
        <th>Bank</th>
        <th>Account</th>
        <th class="right">Amount</th>
        <th>Paystack Ref</th>
        <th>Status</th>
        <th>Reason</th>
      </tr>
    </thead>
    <tbody>
      ${items
        .map((it, i) => `
          <tr${it.status === 'failed' ? ` style="background:${R.failedRowBg}"` : ''}>
            <td>${i + 1}</td>
            <td>${escapeHtml(it.account_name || it.full_name || 'Unknown Recipient')}</td>
            <td>${escapeHtml(it.bank_name)}</td>
            <td>${escapeHtml(maskAccountNumber(it.account_number))}</td>
            <td class="right">${escapeHtml(formatNaira(it.amount_ngn || 0))}</td>
            <td class="mono">${truncRef(it.paystack_reference)}</td>
            <td><span class="pill ${it.status === 'succeeded' ? 'success' : it.status === 'failed' ? 'failed' : 'pending'}">${escapeHtml(it.status)}</span></td>
            <td>${reasonCell(it)}</td>
          </tr>
        `)
        .join('')}
    </tbody>
  </table>

  <div class="totals">
    <div><span style="color:${R.muted};font-size:11px;text-transform:uppercase">Succeeded:</span> <span class="v">${escapeHtml(formatNaira(totalSucceeded))}</span></div>
    <div><span style="color:${R.muted};font-size:11px;text-transform:uppercase">Failed:</span> <span class="v">${escapeHtml(formatNaira(totalFailed))}</span></div>
    <div><span style="color:${R.muted};font-size:11px;text-transform:uppercase">Total:</span> <span class="v">${amountDisplay}</span></div>
  </div>

  ${hasFailed && failedRows.length > 0 ? `
  <div class="failed-section">
    <h2>⚠️ Failed Payments (${failedRows.length})</h2>
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
            <td>${escapeHtml(it.account_name || it.full_name || 'Unknown Recipient')}</td>
            <td>${escapeHtml(it.bank_name)}</td>
            <td>${escapeHtml(maskAccountNumber(it.account_number))}</td>
            <td class="right">${escapeHtml(formatNaira(it.amount_ngn || 0))}</td>
            <td style="color:${R.failed}">${escapeHtml(it.failure_reason || 'Transfer rejected by bank')}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
    <div class="bank-ops-note">
      Contact your bank operations team if the failure reason is unclear. No funds were debited for the failed recipients listed above.
    </div>
  </div>` : ''}

  <div class="stamp">
    Receipt generated by KDOps · ${escapeHtml(profile?.full_name || profile?.email || 'unknown user')}
    on ${escapeHtml(formatDateTime(new Date()))}
  </div>

  <div class="footer">
    ${escapeHtml(companyName)} · Operations Platform · This is a system-generated receipt.
  </div>

  <script>window.onload = () => { setTimeout(() => window.print(), 250); };</script>
</body>
</html>`;
}
