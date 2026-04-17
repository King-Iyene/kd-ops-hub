import { formatDate, formatDateTime, formatNaira } from '@/lib/format';

/**
 * Render a KDOps-branded HTML payslip for a single employee, ready for the
 * browser print-to-PDF dialog. Opening it via window.open(url) + setTimeout
 * triggers the print dialog so the user saves a clean PDF.
 *
 * If `autoPrint` is true the window will call `window.print()` once the
 * content loads (used when the admin clicks "Download PDF"). Pass false for
 * an in-app preview.
 */
export interface PayslipData {
  company_name: string;
  employee_name: string;
  employee_email?: string | null;
  employee_role?: string;
  period: string; // yyyy-mm
  gross_ngn: number;
  paye_ngn: number;
  pension_ngn: number;
  nhf_ngn: number;
  net_ngn: number;
  generated_by?: string | null;
}

const escape = (v: unknown): string => {
  const s = v === null || v === undefined ? '' : String(v);
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
};

const monthLabel = (period: string) => {
  const [y, m] = period.split('-');
  return new Date(parseInt(y, 10), parseInt(m, 10) - 1, 1).toLocaleString(
    'en-GB',
    { month: 'long', year: 'numeric' },
  );
};

export const renderPayslipHtml = (
  data: PayslipData,
  opts: { autoPrint?: boolean } = {},
): string => {
  const totalDeductions = data.paye_ngn + data.pension_ngn + data.nhf_ngn;
  const generated = formatDateTime(new Date());
  const autoPrint = opts.autoPrint !== false;

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${escape(data.company_name)} — Payslip ${escape(monthLabel(data.period))} — ${escape(data.employee_name)}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Cabin:wght@400;600;700&display=swap');
    * { box-sizing: border-box; }
    body {
      font-family: 'Cabin', system-ui, sans-serif;
      color: #0a2533;
      padding: 32px;
      max-width: 780px;
      margin: 0 auto;
      background: #fff;
    }
    .brand {
      display: flex;
      align-items: center;
      gap: 14px;
      padding-bottom: 18px;
      border-bottom: 4px solid #006994;
      margin-bottom: 24px;
    }
    .brand .mark {
      width: 52px;
      height: 52px;
      border-radius: 10px;
      background: #006994;
      color: #fff;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 800;
      font-size: 18px;
      letter-spacing: 0.04em;
    }
    .brand h1 {
      font-size: 22px;
      margin: 0 0 4px;
      letter-spacing: -0.01em;
    }
    .brand .meta { font-size: 12px; color: #5b6b75; }

    .title-row {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      margin-bottom: 18px;
    }
    .title-row h2 {
      font-size: 18px;
      margin: 0;
      color: #006994;
    }
    .badge {
      display: inline-block;
      padding: 3px 12px;
      border-radius: 999px;
      background: #D6AC50;
      color: #3a2e12;
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }

    .grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 10px 24px;
      font-size: 13px;
      margin-bottom: 22px;
    }
    .grid .l { color: #5b6b75; font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.06em; }
    .grid .v { font-weight: 600; }

    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th, td { padding: 10px 12px; text-align: left; border-bottom: 1px solid #e8edf0; }
    th {
      background: #f4f8fa;
      color: #5b6b75;
      font-weight: 700;
      text-transform: uppercase;
      font-size: 10.5px;
      letter-spacing: 0.05em;
    }
    .right { text-align: right; font-variant-numeric: tabular-nums; }
    tr.total td { font-weight: 700; background: #fbfdfe; border-top: 2px solid #006994; }
    tr.sub td { color: #5b6b75; }

    .net-panel {
      margin-top: 22px;
      padding: 18px 20px;
      border-radius: 12px;
      background: linear-gradient(135deg, #006994 0%, #0481ad 100%);
      color: #fff;
      display: flex;
      justify-content: space-between;
      align-items: baseline;
    }
    .net-panel .lbl { text-transform: uppercase; letter-spacing: 0.08em; font-size: 11px; opacity: 0.85; }
    .net-panel .val { font-size: 28px; font-weight: 800; font-variant-numeric: tabular-nums; }

    .stamp {
      margin-top: 28px;
      padding: 12px;
      border: 2px dashed #D6AC50;
      border-radius: 10px;
      color: #6f5a25;
      font-size: 12px;
      text-align: center;
    }
    .footer {
      margin-top: 26px;
      font-size: 11px;
      color: #8194a0;
      text-align: center;
      line-height: 1.6;
    }

    @media print {
      body { padding: 14px; }
      .net-panel { background: #006994 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
  </style>
</head>
<body>
  <div class="brand">
    <div class="mark">KD</div>
    <div>
      <h1>${escape(data.company_name)}</h1>
      <div class="meta">KDOps · Operations Platform</div>
    </div>
  </div>

  <div class="title-row">
    <h2>Payslip — ${escape(monthLabel(data.period))}</h2>
    <span class="badge">Confidential</span>
  </div>

  <div class="grid">
    <div><div class="l">Employee</div><div class="v">${escape(data.employee_name)}</div></div>
    <div><div class="l">Role</div><div class="v">${escape(data.employee_role || '—')}</div></div>
    <div><div class="l">Email</div><div class="v">${escape(data.employee_email || '—')}</div></div>
    <div><div class="l">Pay period</div><div class="v">${escape(monthLabel(data.period))}</div></div>
    <div><div class="l">Generated</div><div class="v">${escape(generated)}</div></div>
    <div><div class="l">Issued to</div><div class="v">${escape(data.employee_email || data.employee_name)}</div></div>
  </div>

  <table>
    <thead>
      <tr>
        <th>Line item</th>
        <th class="right">Amount (NGN)</th>
      </tr>
    </thead>
    <tbody>
      <tr><td>Gross pay</td><td class="right">${escape(formatNaira(data.gross_ngn))}</td></tr>
      <tr class="sub"><td>PAYE</td><td class="right">− ${escape(formatNaira(data.paye_ngn))}</td></tr>
      <tr class="sub"><td>Pension (8%)</td><td class="right">− ${escape(formatNaira(data.pension_ngn))}</td></tr>
      <tr class="sub"><td>NHF (2.5%)</td><td class="right">− ${escape(formatNaira(data.nhf_ngn))}</td></tr>
      <tr class="sub"><td>Total deductions</td><td class="right">− ${escape(formatNaira(totalDeductions))}</td></tr>
      <tr class="total"><td>Net pay</td><td class="right">${escape(formatNaira(data.net_ngn))}</td></tr>
    </tbody>
  </table>

  <div class="net-panel">
    <div>
      <div class="lbl">Net pay this period</div>
      <div style="font-size:12px;opacity:0.85;margin-top:4px;">Dated ${escape(formatDate(new Date()))}</div>
    </div>
    <div class="val">${escape(formatNaira(data.net_ngn))}</div>
  </div>

  <div class="stamp">
    Generated by KDOps ${data.generated_by ? `· ${escape(data.generated_by)} ` : ''}· ${escape(generated)}
  </div>

  <div class="footer">
    This payslip is system-generated and does not require a signature. <br />
    Queries should be directed to your HR / Finance lead. <br />
    ${escape(data.company_name)} · KDOps
  </div>

  ${autoPrint ? `<script>window.onload = () => setTimeout(() => window.print(), 250);</script>` : ''}
</body>
</html>`;
};

/** Open the payslip HTML in a new browser tab with auto-print wired in. */
export const openPayslipPrintWindow = (data: PayslipData): void => {
  const html = renderPayslipHtml(data, { autoPrint: true });
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank', 'noopener');
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
};
