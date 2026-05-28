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
  extra_deductions?: { description: string; amount_ngn: number }[] | null;

  // ─── NEW (Sprint A): salary component breakdown (optional). ─────────────
  // When provided, the Earnings table shows each component. When omitted,
  // the legacy single-row "Basic Salary" rendering is preserved.
  components?: {
    basic_ngn?: number;
    housing_ngn?: number;
    transport_ngn?: number;
    other_allowances_ngn?: number;
  } | null;

  // ─── NEW: employer-borne costs section (transparency for employees). ────
  employer_costs?: {
    pension_employer_ngn?: number;
    nhis_employer_ngn?: number;
    nsitf_ngn?: number;
  } | null;

  // ─── NEW: Year-to-Date column data (cumulative from January). ───────────
  ytd?: {
    gross_ngn: number;
    paye_ngn: number;
    pension_ngn: number;
    nhf_ngn: number;
    net_ngn: number;
  } | null;
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
  const extraDeductTotal = (data.extra_deductions ?? []).reduce((s, d) => s + d.amount_ngn, 0);
  const totalDeductions = data.paye_ngn + data.pension_ngn + data.nhf_ngn + extraDeductTotal;
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
            ${data.ytd ? '<th class="right">YTD (₦)</th>' : ''}
          </tr>
        </thead>
        <tbody>
          ${data.components && (data.components.basic_ngn || data.components.housing_ngn || data.components.transport_ngn || data.components.other_allowances_ngn) ? `
            ${data.components.basic_ngn ? `<tr><td>Basic Salary</td><td class="right">${esc(formatNaira(data.components.basic_ngn))}</td>${data.ytd ? '<td class="right"></td>' : ''}</tr>` : ''}
            ${data.components.housing_ngn ? `<tr><td>Housing Allowance</td><td class="right">${esc(formatNaira(data.components.housing_ngn))}</td>${data.ytd ? '<td class="right"></td>' : ''}</tr>` : ''}
            ${data.components.transport_ngn ? `<tr><td>Transport Allowance</td><td class="right">${esc(formatNaira(data.components.transport_ngn))}</td>${data.ytd ? '<td class="right"></td>' : ''}</tr>` : ''}
            ${data.components.other_allowances_ngn ? `<tr><td>Other Allowances</td><td class="right">${esc(formatNaira(data.components.other_allowances_ngn))}</td>${data.ytd ? '<td class="right"></td>' : ''}</tr>` : ''}
          ` : `
            <tr>
              <td>Basic Salary</td>
              <td class="right">${esc(formatNaira(data.gross_ngn))}</td>
              ${data.ytd ? `<td class="right">${esc(formatNaira(data.ytd.gross_ngn))}</td>` : ''}
            </tr>
          `}
          <tr class="subtotal">
            <td>Gross Pay</td>
            <td class="right" style="color:#111827">${esc(formatNaira(data.gross_ngn))}</td>
            ${data.ytd ? `<td class="right" style="color:#111827">${esc(formatNaira(data.ytd.gross_ngn))}</td>` : ''}
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
            ${data.ytd ? '<th class="right">YTD (₦)</th>' : ''}
          </tr>
        </thead>
        <tbody>
          ${data.paye_ngn > 0 ? `<tr class="deduction"><td>PAYE Income Tax</td><td class="right">−&nbsp;${esc(formatNaira(data.paye_ngn))}</td>${data.ytd ? `<td class="right">−&nbsp;${esc(formatNaira(data.ytd.paye_ngn))}</td>` : ''}</tr>` : ''}
          ${data.pension_ngn > 0 ? `<tr class="deduction"><td>Pension Contribution (8%)</td><td class="right">−&nbsp;${esc(formatNaira(data.pension_ngn))}</td>${data.ytd ? `<td class="right">−&nbsp;${esc(formatNaira(data.ytd.pension_ngn))}</td>` : ''}</tr>` : ''}
          ${data.nhf_ngn > 0 ? `<tr class="deduction"><td>NHF (2.5%)</td><td class="right">−&nbsp;${esc(formatNaira(data.nhf_ngn))}</td>${data.ytd ? `<td class="right">−&nbsp;${esc(formatNaira(data.ytd.nhf_ngn))}</td>` : ''}</tr>` : ''}
          ${(data.extra_deductions ?? []).map((d) => `<tr class="deduction"><td>${esc(d.description)}</td><td class="right">−&nbsp;${esc(formatNaira(d.amount_ngn))}</td>${data.ytd ? '<td class="right"></td>' : ''}</tr>`).join('')}
          ${totalDeductions === 0 ? `<tr class="deduction"><td style="color:#9ca3af;font-style:italic">No deductions applied</td><td></td>${data.ytd ? '<td></td>' : ''}</tr>` : ''}
          <tr class="subtotal">
            <td>Total Deductions</td>
            <td class="right">−&nbsp;${esc(formatNaira(totalDeductions))}</td>
            ${data.ytd ? `<td class="right">−&nbsp;${esc(formatNaira(data.ytd.paye_ngn + data.ytd.pension_ngn + data.ytd.nhf_ngn))}</td>` : ''}
          </tr>
        </tbody>
      </table>

      ${data.employer_costs && (data.employer_costs.pension_employer_ngn || data.employer_costs.nhis_employer_ngn || data.employer_costs.nsitf_ngn) ? `
      <!-- Employer-borne statutory costs (transparency, not deducted from take-home) -->
      <div class="section-title">Employer-Borne Costs <span style="text-transform:none;font-weight:500;color:#9ca3af;letter-spacing:0">— informational, not deducted from your pay</span></div>
      <table>
        <thead>
          <tr>
            <th>Description</th>
            <th class="right">Amount (₦)</th>
          </tr>
        </thead>
        <tbody>
          ${data.employer_costs.pension_employer_ngn ? `<tr><td>Pension — Employer Contribution (10%)</td><td class="right">${esc(formatNaira(data.employer_costs.pension_employer_ngn))}</td></tr>` : ''}
          ${data.employer_costs.nhis_employer_ngn ? `<tr><td>NHIS — Employer Contribution (10%)</td><td class="right">${esc(formatNaira(data.employer_costs.nhis_employer_ngn))}</td></tr>` : ''}
          ${data.employer_costs.nsitf_ngn ? `<tr><td>NSITF (1%) — Workplace Injury Cover</td><td class="right">${esc(formatNaira(data.employer_costs.nsitf_ngn))}</td></tr>` : ''}
        </tbody>
      </table>
      ` : ''}

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

/**
 * Download the payslip HTML as a true PDF. Renders into an off-screen, style-
 * isolated iframe, snapshots it with html2canvas, then paginates onto A4 pages
 * with jsPDF. Both libraries are dynamically imported so they stay out of the
 * initial bundle.
 *
 * Restored after a merge accidentally dropped the export — callers in
 * EmployeeProfile and self-service Profile rely on this.
 */
export async function downloadPayslipPdfFromHtml(html: string, filename: string): Promise<void> {
  const [{ default: jsPDF }, { default: html2canvas }] = await Promise.all([
    import('jspdf'),
    import('html2canvas'),
  ]);

  const iframe = document.createElement('iframe');
  iframe.setAttribute('aria-hidden', 'true');
  iframe.style.position = 'fixed';
  iframe.style.left = '-10000px';
  iframe.style.top = '0';
  iframe.style.width = '820px';
  iframe.style.border = '0';
  document.body.appendChild(iframe);

  try {
    const doc = iframe.contentDocument;
    if (!doc) throw new Error('Could not create render frame');
    doc.open();
    doc.write(html);
    doc.close();
    // Let layout settle (and any webfont swap) before snapshotting.
    await new Promise((r) => setTimeout(r, 450));

    const body = doc.body;
    iframe.style.height = `${body.scrollHeight}px`;
    const canvas = await html2canvas(body, {
      backgroundColor: '#ffffff',
      scale: 2,
      useCORS: true,
      logging: false,
      windowWidth: 820,
    });

    const dataUrl = canvas.toDataURL('image/png', 0.95);
    const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true });
    const pageW = 210;
    const pageH = 297;
    const margin = 10;
    const imgW = pageW - margin * 2;
    const fullH = (canvas.height / canvas.width) * imgW;
    const usableH = pageH - margin * 2;

    // Place the full-height image and shift it up one usable page at a time so
    // a tall payslip flows across multiple A4 pages.
    let heightLeft = fullH;
    let position = margin;
    pdf.addImage(dataUrl, 'PNG', margin, position, imgW, fullH, undefined, 'FAST');
    heightLeft -= usableH;
    while (heightLeft > 0) {
      position = margin - (fullH - heightLeft);
      pdf.addPage();
      pdf.addImage(dataUrl, 'PNG', margin, position, imgW, fullH, undefined, 'FAST');
      heightLeft -= usableH;
    }

    pdf.save(filename.endsWith('.pdf') ? filename : `${filename}.pdf`);
  } finally {
    document.body.removeChild(iframe);
  }
}
