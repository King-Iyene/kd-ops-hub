import { formatDate, formatDateTime, formatNaira } from '@/lib/format';

export interface PayslipData {
  company_name: string;
  company_address?: string | null;
  logo_url?: string | null;
  employee_name: string;
  employee_email?: string | null;
  employee_role?: string | null;
  employee_number?: string | null;
  bank_name?: string | null;
  bank_account?: string | null;
  period: string;
  gross_ngn: number;
  paye_ngn: number;
  pension_ngn: number;
  nhf_ngn: number;
  net_ngn: number;
  generated_by?: string | null;
  payslip_ref?: string | null;
}

const esc = (v: unknown): string => {
  const s = v === null || v === undefined ? '' : String(v);
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
};

const monthLabel = (period: string) => {
  // Handle "April 2026" (already human-readable) or "2026-04" (yyyy-mm)
  if (/^\d{4}-\d{2}$/.test(period.trim())) {
    const [y, m] = period.split('-');
    return new Date(parseInt(y, 10), parseInt(m, 10) - 1, 1).toLocaleString(
      'en-GB',
      { month: 'long', year: 'numeric' },
    );
  }
  return period;
};

const initials = (name: string) =>
  name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('');

export const renderPayslipHtml = (
  data: PayslipData,
  opts: { autoPrint?: boolean } = {},
): string => {
  const totalDeductions = data.paye_ngn + data.pension_ngn + data.nhf_ngn;
  const generated = formatDateTime(new Date());
  const autoPrint = opts.autoPrint !== false;
  const periodLabel = monthLabel(data.period);
  const ref = data.payslip_ref || '';

  const logoHtml = data.logo_url
    ? `<img src="${esc(data.logo_url)}" alt="${esc(data.company_name)} logo" style="height:52px;width:auto;object-fit:contain;border-radius:6px;" />`
    : `<div style="width:52px;height:52px;border-radius:10px;background:#006994;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:18px;letter-spacing:0.04em;flex-shrink:0;">${esc(initials(data.company_name || 'KD'))}</div>`;

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${esc(data.company_name)} · Payslip · ${esc(periodLabel)} · ${esc(data.employee_name)}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Inter', system-ui, sans-serif;
      color: #111827;
      background: #f9fafb;
      padding: 0;
    }
    .page {
      max-width: 800px;
      margin: 32px auto;
      background: #fff;
      border-radius: 16px;
      box-shadow: 0 4px 24px rgba(0,0,0,0.08);
      overflow: hidden;
    }

    /* ─── Header ─── */
    .header {
      background: linear-gradient(135deg, #0a2533 0%, #0d3347 100%);
      color: #fff;
      padding: 28px 36px 24px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
    }
    .header-left { display: flex; align-items: center; gap: 16px; }
    .company-info h1 { font-size: 20px; font-weight: 700; letter-spacing: -0.3px; color: #fff; }
    .company-info p { font-size: 12px; color: rgba(255,255,255,0.6); margin-top: 2px; }
    .header-right { text-align: right; }
    .header-right .doc-type {
      font-size: 11px; font-weight: 700; letter-spacing: 0.12em;
      text-transform: uppercase; color: rgba(255,255,255,0.5); margin-bottom: 4px;
    }
    .header-right .period {
      font-size: 22px; font-weight: 800; color: #fff; letter-spacing: -0.5px;
    }
    .header-right .ref { font-size: 11px; color: rgba(255,255,255,0.4); margin-top: 3px; }

    /* ─── Employee strip ─── */
    .emp-strip {
      background: #f0f7ff;
      border-bottom: 1px solid #e0edf8;
      padding: 18px 36px;
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
      gap: 16px;
    }
    .emp-strip .field { }
    .emp-strip .lbl { font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.07em; color: #6b7280; }
    .emp-strip .val { font-size: 13px; font-weight: 600; color: #111827; margin-top: 3px; }

    /* ─── Body ─── */
    .body { padding: 28px 36px; }

    .section-title {
      font-size: 10px; font-weight: 700; text-transform: uppercase;
      letter-spacing: 0.1em; color: #9ca3af; margin-bottom: 10px;
    }

    table { width: 100%; border-collapse: collapse; font-size: 13px; margin-bottom: 20px; }
    thead th {
      background: #f9fafb; padding: 9px 14px; text-align: left;
      font-size: 10px; font-weight: 700; text-transform: uppercase;
      letter-spacing: 0.06em; color: #6b7280; border-bottom: 1px solid #e5e7eb;
    }
    thead th.right { text-align: right; }
    tbody td { padding: 10px 14px; border-bottom: 1px solid #f3f4f6; color: #374151; }
    tbody td.right { text-align: right; font-variant-numeric: tabular-nums; font-weight: 500; }
    tbody tr.deduction td { color: #6b7280; }
    tbody tr.deduction td.right { color: #ef4444; }
    tbody tr.subtotal td { background: #fafafa; font-weight: 600; border-top: 2px solid #e5e7eb; }
    tbody tr.subtotal td.right { color: #ef4444; }

    /* ─── Net pay panel ─── */
    .net-panel {
      background: linear-gradient(135deg, #006994 0%, #0481ad 100%);
      border-radius: 12px;
      padding: 22px 28px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 24px;
      box-shadow: 0 4px 16px rgba(0,105,148,0.25);
    }
    .net-panel .lbl {
      font-size: 11px; font-weight: 600; text-transform: uppercase;
      letter-spacing: 0.1em; color: rgba(255,255,255,0.7);
    }
    .net-panel .sublbl { font-size: 11px; color: rgba(255,255,255,0.5); margin-top: 4px; }
    .net-panel .amount { font-size: 32px; font-weight: 800; color: #fff; letter-spacing: -0.5px; font-variant-numeric: tabular-nums; }

    /* ─── Bank & summary ─── */
    .info-row {
      display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 24px;
    }
    .info-box {
      border: 1px solid #e5e7eb; border-radius: 10px; padding: 14px 16px;
    }
    .info-box .lbl { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.07em; color: #9ca3af; margin-bottom: 6px; }
    .info-box .val { font-size: 13px; font-weight: 600; color: #111827; }
    .info-box .sub { font-size: 11px; color: #6b7280; margin-top: 2px; }

    /* ─── Footer ─── */
    .doc-footer {
      border-top: 1px solid #f3f4f6;
      padding: 16px 36px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      font-size: 11px;
      color: #9ca3af;
    }
    .confidential {
      display: inline-block; padding: 2px 10px; border-radius: 999px;
      background: #fef3c7; color: #92400e;
      font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em;
    }

    @media print {
      body { background: #fff; }
      .page { margin: 0; border-radius: 0; box-shadow: none; }
      .net-panel { background: #006994 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .header { background: #0a2533 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
  </style>
</head>
<body>
  <div class="page">
    <!-- Header -->
    <div class="header">
      <div class="header-left">
        ${logoHtml}
        <div class="company-info">
          <h1>${esc(data.company_name)}</h1>
          <p>${esc(data.company_address || 'KDOps · Operations Platform')}</p>
        </div>
      </div>
      <div class="header-right">
        <div class="doc-type">Payslip</div>
        <div class="period">${esc(periodLabel)}</div>
        ${ref ? `<div class="ref">Ref: ${esc(ref)}</div>` : ''}
      </div>
    </div>

    <!-- Employee strip -->
    <div class="emp-strip">
      <div class="field">
        <div class="lbl">Employee</div>
        <div class="val">${esc(data.employee_name)}</div>
      </div>
      ${data.employee_number ? `<div class="field"><div class="lbl">Employee No.</div><div class="val">${esc(data.employee_number)}</div></div>` : ''}
      ${data.employee_role ? `<div class="field"><div class="lbl">Role</div><div class="val">${esc(data.employee_role)}</div></div>` : ''}
      <div class="field">
        <div class="lbl">Pay Period</div>
        <div class="val">${esc(periodLabel)}</div>
      </div>
      <div class="field">
        <div class="lbl">Generated</div>
        <div class="val">${esc(formatDate(new Date()))}</div>
      </div>
    </div>

    <!-- Body -->
    <div class="body">

      <!-- Earnings -->
      <div class="section-title">Earnings</div>
      <table>
        <thead>
          <tr>
            <th>Description</th>
            <th class="right">Amount (₦)</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Basic Salary</td>
            <td class="right">${esc(formatNaira(data.gross_ngn))}</td>
          </tr>
          <tr class="subtotal">
            <td>Gross Pay</td>
            <td class="right" style="color:#111827">${esc(formatNaira(data.gross_ngn))}</td>
          </tr>
        </tbody>
      </table>

      <!-- Deductions -->
      <div class="section-title">Deductions</div>
      <table>
        <thead>
          <tr>
            <th>Description</th>
            <th class="right">Amount (₦)</th>
          </tr>
        </thead>
        <tbody>
          ${data.paye_ngn > 0 ? `<tr class="deduction"><td>PAYE Income Tax</td><td class="right">−&nbsp;${esc(formatNaira(data.paye_ngn))}</td></tr>` : ''}
          ${data.pension_ngn > 0 ? `<tr class="deduction"><td>Pension Contribution (8%)</td><td class="right">−&nbsp;${esc(formatNaira(data.pension_ngn))}</td></tr>` : ''}
          ${data.nhf_ngn > 0 ? `<tr class="deduction"><td>NHF (2.5%)</td><td class="right">−&nbsp;${esc(formatNaira(data.nhf_ngn))}</td></tr>` : ''}
          ${totalDeductions === 0 ? `<tr class="deduction"><td style="color:#9ca3af;font-style:italic">No deductions applied</td><td></td></tr>` : ''}
          <tr class="subtotal">
            <td>Total Deductions</td>
            <td class="right">−&nbsp;${esc(formatNaira(totalDeductions))}</td>
          </tr>
        </tbody>
      </table>

      <!-- Net pay -->
      <div class="net-panel">
        <div>
          <div class="lbl">Net Pay — ${esc(periodLabel)}</div>
          <div class="sublbl">Gross ${esc(formatNaira(data.gross_ngn))} − Deductions ${esc(formatNaira(totalDeductions))}</div>
        </div>
        <div class="amount">${esc(formatNaira(data.net_ngn))}</div>
      </div>

      <!-- Bank & summary info -->
      <div class="info-row">
        ${data.bank_name || data.bank_account ? `
        <div class="info-box">
          <div class="lbl">Payment Method</div>
          <div class="val">${esc(data.bank_name || '—')}</div>
          ${data.bank_account ? `<div class="sub">${esc(data.bank_account)}</div>` : ''}
        </div>` : '<div></div>'}
        <div class="info-box">
          <div class="lbl">Issued To</div>
          <div class="val">${esc(data.employee_name)}</div>
          ${data.employee_email ? `<div class="sub">${esc(data.employee_email)}</div>` : ''}
        </div>
      </div>

    </div><!-- /body -->

    <!-- Footer -->
    <div class="doc-footer">
      <span>Generated by KDOps${data.generated_by ? ' · ' + esc(data.generated_by) : ''} · ${esc(generated)}</span>
      <div style="display:flex;align-items:center;gap:8px;">
        <span class="confidential">Confidential</span>
        <span>This is a system-generated document.</span>
      </div>
    </div>
  </div>

  ${autoPrint ? `<script>window.onload = () => setTimeout(() => window.print(), 300);</script>` : ''}
</body>
</html>`;
};

/** Open the payslip HTML in a new browser tab with auto-print triggered. */
export const openPayslipPrintWindow = (data: PayslipData): void => {
  const html = renderPayslipHtml(data, { autoPrint: true });
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank', 'noopener');
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
};
