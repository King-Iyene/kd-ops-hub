import { formatDate, formatDateTime, formatNaira } from '@/lib/format';

/**
 * World-class Nigerian payslip renderer.
 *
 * Design goals (took inspiration from Rippling, Gusto, Deel):
 *   • Employees WANT to look at it — clear hierarchy, generous whitespace,
 *     tabular numerics, a personalised greeting, and one hero stat.
 *   • Radical transparency — surfaces both employee take-home AND
 *     employer costs so total compensation is visible ("true cost").
 *   • Visual pay waterfall — CSS-only chart shows gross → deductions →
 *     net at a glance.
 *   • YTD wealth strip — cumulative net year-to-date so long-term progress
 *     is felt.
 *   • Verifiable — payslip_ref + generated timestamp printed prominently,
 *     designed to look like a real financial instrument.
 *   • Print-perfect A4 with proper page-break behavior.
 *   • Dark-mode-safe — always renders on white for print consistency.
 *
 * All statutory figures preserved (PAYE, Pension, NHF, NHIS, NSITF, etc.)
 * — the redesign is visual only; math flows through unchanged from the
 * caller.
 */

export interface PayslipData {
  company_name: string;
  company_address?: string | null;
  company_rc?: string | null;
  company_tin?: string | null;
  logo_url?: string | null;
  employee_name: string;
  employee_email?: string | null;
  employee_role?: string | null;
  employee_number?: string | null;
  employee_department?: string | null;
  employee_tax_id?: string | null;
  employee_pension_pin?: string | null;
  employee_nhf_number?: string | null;
  bank_name?: string | null;
  bank_account?: string | null;
  bank_account_name?: string | null;
  period: string;
  period_start?: string | null;
  period_end?: string | null;
  pay_date?: string | null;
  gross_ngn: number;
  paye_ngn: number;
  pension_ngn: number;
  nhf_ngn: number;
  nhis_ngn?: number;
  net_ngn: number;
  generated_by?: string | null;
  payslip_ref?: string | null;
  extra_deductions?: { description: string; amount_ngn: number }[] | null;

  components?: {
    basic_ngn?: number;
    housing_ngn?: number;
    transport_ngn?: number;
    bonus_ngn?: number;
    overtime_ngn?: number;
    /** Itemised allowance lines — preferred when available. */
    other_allowances?: { description: string; amount_ngn: number }[] | null;
    /** Flat allowance total — fallback when itemised lines aren't provided. */
    other_allowances_ngn?: number;
  } | null;

  employer_costs?: {
    pension_employer_ngn?: number;
    nhis_employer_ngn?: number;
    nsitf_ngn?: number;
  } | null;

  ytd?: {
    gross_ngn: number;
    paye_ngn: number;
    pension_ngn: number;
    nhf_ngn: number;
    nhis_ngn?: number;
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
  if (/^\d{4}-\d{2}$/.test(period.trim())) {
    const [y, m] = period.split('-');
    return new Date(parseInt(y, 10), parseInt(m, 10) - 1, 1).toLocaleString('en-GB', {
      month: 'long', year: 'numeric',
    });
  }
  return period;
};

const initials = (name: string) =>
  name.split(' ').filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('');

// Time-of-day greeting — small human touch at the top.
const greeting = (hour: number) =>
  hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

// Turn a number into a % width for the waterfall bars. Guards against 0.
const pct = (n: number, of: number) => (of > 0 ? Math.max(1, Math.min(100, (n / of) * 100)) : 0);

export const renderPayslipHtml = (
  data: PayslipData,
  opts: { autoPrint?: boolean } = {},
): string => {
  const extraDeductions = data.extra_deductions ?? [];
  const extraDeductTotal = extraDeductions.reduce((s, d) => s + d.amount_ngn, 0);
  const nhis = data.nhis_ngn ?? 0;
  const totalDeductions =
    data.paye_ngn + data.pension_ngn + data.nhf_ngn + nhis + extraDeductTotal;
  const generated = formatDateTime(new Date());
  const autoPrint = opts.autoPrint !== false;
  const periodLabel = monthLabel(data.period);
  const ref = data.payslip_ref || `KDS-${Date.now().toString(36).toUpperCase()}`;
  const firstName = (data.employee_name || 'there').split(' ')[0];
  const periodMonth = parseInt(data.period?.split('-')[1] || '', 10) || (new Date().getMonth() + 1);

  // Employer-cost sums for the true-cost calculation.
  const emp = data.employer_costs ?? {};
  const employerCostTotal =
    (emp.pension_employer_ngn ?? 0)
    + (emp.nhis_employer_ngn ?? 0)
    + (emp.nsitf_ngn ?? 0);
  const trueCostToCompany = data.gross_ngn + employerCostTotal;

  // Waterfall segments (all as % of gross, normalized so they never exceed 100%).
  const rawSeg = {
    take:    data.net_ngn,
    paye:    data.paye_ngn,
    pension: data.pension_ngn,
    nhf:     data.nhf_ngn,
    nhis:    nhis,
    extra:   extraDeductTotal,
  };
  const segTotal = Object.values(rawSeg).reduce((a, b) => a + b, 0) || 1;
  const seg = {
    take:    (rawSeg.take / segTotal) * 100,
    paye:    (rawSeg.paye / segTotal) * 100,
    pension: (rawSeg.pension / segTotal) * 100,
    nhf:     (rawSeg.nhf / segTotal) * 100,
    nhis:    (rawSeg.nhis / segTotal) * 100,
    extra:   (rawSeg.extra / segTotal) * 100,
  };

  const FALLBACK_LOGO = `${window.location.origin}/icon-192.png`;
  const logoSrc = data.logo_url || FALLBACK_LOGO;
  const logoHtml = `<img src="${esc(logoSrc)}" alt="${esc(data.company_name)} logo" class="logo-img" onerror="this.onerror=null;this.src='${FALLBACK_LOGO}'" />`;

  const companyIdLine = [
    data.company_rc  ? `RC ${data.company_rc}`   : '',
    data.company_tin ? `TIN ${data.company_tin}` : '',
  ].filter(Boolean).join(' · ');

  const watermarkHtml = `<div class="watermark"><img src="${esc(logoSrc)}" alt="" onerror="this.onerror=null;this.src='${FALLBACK_LOGO}'" /></div>`;

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${esc(data.company_name)} · Payslip · ${esc(periodLabel)} · ${esc(data.employee_name)}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body { font-family: system-ui, -apple-system, 'Segoe UI', sans-serif; }
    body {
      color: #1a1a1a;
      background: #f5f5f4;
      padding: 0;
      -webkit-font-smoothing: antialiased;
    }
    .tabular { font-variant-numeric: tabular-nums; letter-spacing: -0.005em; }
    .mono { font-family: ui-monospace, 'SF Mono', 'Cascadia Code', monospace; }

    /* ─── Page ────────────────────────────────────────────── */
    .page {
      position: relative;
      max-width: 800px;
      margin: 32px auto;
      background: #fff;
      border: 1px solid #e5e5e5;
      overflow: hidden;
    }

    /* ─── Subtle dot grid background ─────────────────────── */
    .page::before {
      content: '';
      position: absolute; inset: 0;
      background-image: radial-gradient(circle, #8fcde0 0.5px, transparent 0.5px);
      background-size: 24px 24px;
      opacity: 0.4;
      pointer-events: none;
      z-index: 0;
    }
    .page > * { position: relative; z-index: 1; }

    /* ─── Watermark (faint logo / initials in background) ── */
    .watermark {
      position: absolute;
      top: 50%; left: 50%;
      transform: translate(-50%, -50%) rotate(-25deg);
      opacity: 0.03;
      pointer-events: none;
      z-index: 0;
    }
    .watermark img {
      width: 400px; height: 400px; object-fit: contain;
    }

    /* ─── Header ─────────────────────────────────────────── */
    .header {
      padding: 36px 40px 28px;
      border-bottom: 1px solid #e5e5e5;
    }
    .header-top {
      display: flex; align-items: flex-start; justify-content: space-between;
      gap: 20px; flex-wrap: wrap;
    }
    .brand { display: flex; align-items: center; gap: 14px; }
    .logo-img {
      width: 48px; height: 48px; border-radius: 8px; object-fit: contain; flex-shrink: 0;
    }
    .brand-text { line-height: 1.3; }
    .brand-text .co { font-size: 16px; font-weight: 700; color: #1a1a1a; }
    .brand-text .sub { font-size: 11px; color: #737373; margin-top: 2px; }
    .doc-type {
      text-align: right;
    }
    .doc-type .title {
      font-size: 11px; font-weight: 700; text-transform: uppercase;
      letter-spacing: 0.14em; color: #737373;
    }
    .doc-type .period {
      font-size: 15px; font-weight: 700; color: #1a1a1a; margin-top: 2px;
    }
    .doc-type .ref {
      font-size: 10px; color: #a3a3a3; margin-top: 4px;
    }
    .doc-type .ref b { color: #525252; font-weight: 600; }

    /* ─── Net hero ────────────────────────────────────────── */
    .net-hero {
      padding: 24px 40px;
      border-bottom: 1px solid #e5e5e5;
      display: flex; align-items: baseline; justify-content: space-between;
      gap: 16px; flex-wrap: wrap;
    }
    .net-hero .label {
      font-size: 11px; font-weight: 600; text-transform: uppercase;
      letter-spacing: 0.08em; color: #737373;
    }
    .net-hero .amount {
      font-size: 40px; font-weight: 800; letter-spacing: -1.5px;
      color: #006994; line-height: 1;
    }
    .net-hero .breakdown {
      font-size: 12px; color: #a3a3a3; margin-top: 4px;
    }

    /* ─── Meta grid ──────────────────────────────────────── */
    .meta-row {
      padding: 18px 40px;
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
      gap: 16px;
      border-bottom: 1px solid #e5e5e5;
    }
    .meta-item .k {
      font-size: 9px; font-weight: 700; text-transform: uppercase;
      letter-spacing: 0.1em; color: #a3a3a3;
    }
    .meta-item .v {
      font-size: 13px; font-weight: 600; color: #1a1a1a; margin-top: 2px; line-height: 1.35;
    }
    .meta-item .v.mono { font-size: 12px; }
    .meta-item .s { font-size: 11px; color: #737373; margin-top: 1px; }

    /* ─── Body ───────────────────────────────────────────── */
    .body { padding: 28px 40px; }

    .section { margin-bottom: 28px; }
    .section-title {
      font-size: 10px; font-weight: 700; text-transform: uppercase;
      letter-spacing: 0.12em; color: #a3a3a3;
      margin-bottom: 10px;
      padding-bottom: 6px;
      border-bottom: 1px solid #e5e5e5;
    }

    /* ─── Composition bar (subtle monochrome) ────────────── */
    .comp-bar {
      display: flex; height: 6px; width: 100%;
      border-radius: 3px; overflow: hidden;
      background: #f5f5f4;
      margin-bottom: 8px;
    }
    .comp-bar .seg { height: 100%; }
    .seg.take    { background: #006994; }
    .seg.paye    { background: #737373; }
    .seg.pension { background: #a3a3a3; }
    .seg.nhf     { background: #c4c4c4; }
    .seg.nhis    { background: #d4d4d4; }
    .seg.extra   { background: #e5e5e5; }

    .comp-legend {
      display: flex; flex-wrap: wrap; gap: 14px;
      font-size: 11px; color: #525252;
    }
    .comp-legend .dot {
      display: inline-block; width: 6px; height: 6px; border-radius: 50%;
      margin-right: 4px; vertical-align: middle;
    }

    /* ─── Tables ─────────────────────────────────────────── */
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    thead th {
      padding: 8px 0; text-align: left;
      font-size: 9px; font-weight: 700; text-transform: uppercase;
      letter-spacing: 0.1em; color: #a3a3a3;
      border-bottom: 1px solid #e5e5e5;
    }
    thead th.right { text-align: right; }
    thead th.ytd { color: #c4c4c4; }
    tbody td {
      padding: 9px 0;
      border-bottom: 1px solid #f5f5f4;
      color: #1a1a1a;
    }
    tbody tr:last-child td { border-bottom: none; }
    tbody td.right { text-align: right; }
    tbody td.right.tabular { font-weight: 500; }
    tbody td.ytd { color: #a3a3a3; font-weight: 500; }
    tbody tr.deduction td { color: #525252; }
    tbody tr.deduction td.right { color: #1a1a1a; }
    tbody tr.subtotal td {
      font-weight: 700;
      border-top: 2px solid #006994;
      border-bottom: none;
      padding-top: 10px;
    }
    tbody tr.subtotal td.right { color: #1a1a1a; }

    /* ─── Net pay panel ──────────────────────────────────── */
    .net-panel {
      background: #006994;
      padding: 22px 28px;
      display: flex; align-items: center; justify-content: space-between;
      gap: 16px; flex-wrap: wrap; color: #fff;
      margin-bottom: 24px;
    }
    .net-panel .lbl {
      font-size: 10px; font-weight: 700; text-transform: uppercase;
      letter-spacing: 0.12em; color: rgba(255,255,255,0.6);
    }
    .net-panel .sub { font-size: 11px; color: rgba(255,255,255,0.4); margin-top: 3px; }
    .net-panel .amount { font-size: 30px; font-weight: 800; letter-spacing: -0.5px; }

    /* ─── True cost strip ────────────────────────────────── */
    .true-cost {
      display: flex; align-items: center; justify-content: space-between; gap: 16px;
      padding: 12px 0;
      border-top: 1px dashed #d4d4d4;
      border-bottom: 1px dashed #d4d4d4;
      margin-bottom: 24px;
    }
    .true-cost .k {
      font-size: 10px; font-weight: 600; text-transform: uppercase;
      letter-spacing: 0.08em; color: #737373;
    }
    .true-cost .v { font-size: 15px; font-weight: 700; color: #1a1a1a; }

    /* ─── YTD strip ──────────────────────────────────────── */
    .ytd-strip {
      padding: 14px 0;
    }
    .ytd-strip .head {
      display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 6px;
    }
    .ytd-strip .head .l {
      font-size: 10px; text-transform: uppercase; font-weight: 700;
      letter-spacing: 0.1em; color: #a3a3a3;
    }
    .ytd-strip .head .amount { font-size: 15px; font-weight: 700; color: #1a1a1a; }
    .ytd-strip .bar {
      height: 4px; background: #e5e5e5; border-radius: 2px; overflow: hidden;
    }
    .ytd-strip .fill {
      height: 100%; background: #006994; border-radius: 2px;
    }
    .ytd-strip .note { font-size: 10px; color: #a3a3a3; margin-top: 5px; }

    /* ─── Info boxes ─────────────────────────────────────── */
    .info-row {
      display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 24px;
    }
    .info-box {
      border: 1px solid #e5e5e5; padding: 14px 16px;
    }
    .info-box .k {
      font-size: 9px; font-weight: 700; text-transform: uppercase;
      letter-spacing: 0.1em; color: #a3a3a3; margin-bottom: 5px;
    }
    .info-box .v { font-size: 13px; font-weight: 600; color: #1a1a1a; }
    .info-box .s { font-size: 11px; color: #737373; margin-top: 2px; }

    /* ─── Employer costs ─────────────────────────────────── */
    .emp-costs {
      margin-top: 8px;
      padding: 14px 0;
      border-top: 1px solid #e5e5e5;
      font-size: 11px; color: #525252;
    }
    .emp-costs .head {
      font-size: 9px; text-transform: uppercase; font-weight: 700;
      letter-spacing: 0.1em; color: #a3a3a3; margin-bottom: 6px;
    }
    .emp-costs .row { display: flex; justify-content: space-between; padding: 3px 0; }
    .emp-costs .row.total {
      border-top: 1px solid #e5e5e5; padding-top: 6px; margin-top: 4px;
      font-weight: 700; color: #1a1a1a;
    }

    /* ─── Footer ─────────────────────────────────────────── */
    .doc-footer {
      border-top: 1px solid #e5e5e5;
      padding: 16px 40px;
      display: flex; align-items: center; justify-content: space-between;
      gap: 12px; flex-wrap: wrap;
      font-size: 10px; color: #a3a3a3;
    }
    .confidential {
      display: inline-flex; align-items: center; gap: 4px;
      padding: 2px 8px;
      border: 1px solid #D6AC50;
      font-size: 9px; font-weight: 700; text-transform: uppercase;
      letter-spacing: 0.08em; color: #D6AC50;
    }
    .verify {
      font-family: ui-monospace, 'SF Mono', monospace;
      font-size: 9px; color: #a3a3a3;
    }

    /* ─── Print ──────────────────────────────────────────── */
    @media print {
      body { background: #fff; }
      .page { margin: 0; border: none; max-width: none; }
      .page::before { opacity: 0.25; }
      .net-panel, .net-hero { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      @page { size: A4; margin: 12mm; }
    }
  </style>
</head>
<body>
  <div class="page">
    ${watermarkHtml}

    <!-- ── HEADER ── -->
    <div class="header">
      <div class="header-top">
        <div class="brand">
          ${logoHtml}
          <div class="brand-text">
            <div class="co">${esc(data.company_name)}</div>
            <div class="sub">${esc(data.company_address || '')}${companyIdLine ? (data.company_address ? ' · ' : '') + esc(companyIdLine) : ''}</div>
          </div>
        </div>
        <div class="doc-type">
          <div class="title">Payslip</div>
          <div class="period">${esc(periodLabel)}</div>
          <div class="ref">Ref <b class="mono">${esc(ref)}</b></div>
        </div>
      </div>
    </div>

    <!-- ── NET HERO ── -->
    <div class="net-hero">
      <div>
        <div class="label">Net take-home pay</div>
        <div class="breakdown">Gross ${esc(formatNaira(data.gross_ngn))} less ${esc(formatNaira(totalDeductions))} in deductions</div>
      </div>
      <div class="amount tabular">${esc(formatNaira(data.net_ngn))}</div>
    </div>

    <!-- ── META ── -->
    <div class="meta-row">
      <div class="meta-item">
        <div class="k">Employee</div>
        <div class="v">${esc(data.employee_name)}</div>
      </div>
      ${data.employee_number ? `<div class="meta-item"><div class="k">Staff No.</div><div class="v mono">${esc(data.employee_number)}</div></div>` : ''}
      ${data.employee_role ? `<div class="meta-item"><div class="k">Role</div><div class="v">${esc(data.employee_role)}</div></div>` : ''}
      ${data.employee_department ? `<div class="meta-item"><div class="k">Department</div><div class="v">${esc(data.employee_department)}</div></div>` : ''}
      <div class="meta-item">
        <div class="k">Pay Period</div>
        <div class="v">${esc(periodLabel)}</div>
        ${data.period_start && data.period_end ? `<div class="s">${esc(formatDate(data.period_start))} – ${esc(formatDate(data.period_end))}</div>` : ''}
      </div>
      ${data.pay_date ? `<div class="meta-item"><div class="k">Pay Date</div><div class="v">${esc(formatDate(data.pay_date))}</div></div>` : ''}
    </div>

    <!-- ── BODY ── -->
    <div class="body">

      <!-- Composition bar -->
      <div class="section">
        <div class="comp-bar">
          ${data.net_ngn > 0 ? `<div class="seg take" style="width:${seg.take}%"></div>` : ''}
          ${data.paye_ngn > 0 ? `<div class="seg paye" style="width:${seg.paye}%"></div>` : ''}
          ${data.pension_ngn > 0 ? `<div class="seg pension" style="width:${seg.pension}%"></div>` : ''}
          ${data.nhf_ngn > 0 ? `<div class="seg nhf" style="width:${seg.nhf}%"></div>` : ''}
          ${nhis > 0 ? `<div class="seg nhis" style="width:${seg.nhis}%"></div>` : ''}
          ${extraDeductTotal > 0 ? `<div class="seg extra" style="width:${seg.extra}%"></div>` : ''}
        </div>
        <div class="comp-legend">
          <span><span class="dot" style="background:#006994"></span>Take-home ${esc(formatNaira(data.net_ngn))}</span>
          ${data.paye_ngn > 0 ? `<span><span class="dot" style="background:#737373"></span>PAYE ${esc(formatNaira(data.paye_ngn))}</span>` : ''}
          ${data.pension_ngn > 0 ? `<span><span class="dot" style="background:#a3a3a3"></span>Pension ${esc(formatNaira(data.pension_ngn))}</span>` : ''}
          ${data.nhf_ngn > 0 ? `<span><span class="dot" style="background:#c4c4c4"></span>NHF ${esc(formatNaira(data.nhf_ngn))}</span>` : ''}
          ${nhis > 0 ? `<span><span class="dot" style="background:#d4d4d4"></span>NHIS ${esc(formatNaira(nhis))}</span>` : ''}
          ${extraDeductTotal > 0 ? `<span><span class="dot" style="background:#e5e5e5"></span>Other ${esc(formatNaira(extraDeductTotal))}</span>` : ''}
        </div>
      </div>

      <!-- Earnings -->
      <div class="section">
        <div class="section-title">Earnings</div>
        <table>
          <thead>
            <tr>
              <th>Description</th>
              <th class="right">Amount (NGN)</th>
              ${data.ytd ? '<th class="right ytd">YTD (NGN)</th>' : ''}
            </tr>
          </thead>
          <tbody>
            ${data.components
              ? [
                  data.components.basic_ngn      ? `<tr><td>Basic Salary</td><td class="right tabular">${esc(formatNaira(data.components.basic_ngn))}</td>${data.ytd ? '<td class="right ytd tabular">—</td>' : ''}</tr>` : '',
                  data.components.housing_ngn    ? `<tr><td>Housing Allowance</td><td class="right tabular">${esc(formatNaira(data.components.housing_ngn))}</td>${data.ytd ? '<td class="right ytd tabular">—</td>' : ''}</tr>` : '',
                  data.components.transport_ngn  ? `<tr><td>Transport Allowance</td><td class="right tabular">${esc(formatNaira(data.components.transport_ngn))}</td>${data.ytd ? '<td class="right ytd tabular">—</td>' : ''}</tr>` : '',
                  ...(data.components.other_allowances?.length
                    ? data.components.other_allowances.map((a) => `<tr><td>${esc(a.description)}</td><td class="right tabular">${esc(formatNaira(a.amount_ngn))}</td>${data.ytd ? '<td class="right ytd tabular">—</td>' : ''}</tr>`)
                    : (data.components.other_allowances_ngn ? [`<tr><td>Other Allowances</td><td class="right tabular">${esc(formatNaira(data.components.other_allowances_ngn))}</td>${data.ytd ? '<td class="right ytd tabular">—</td>' : ''}</tr>`] : [])),
                  data.components.bonus_ngn      ? `<tr><td>Bonus</td><td class="right tabular">${esc(formatNaira(data.components.bonus_ngn))}</td>${data.ytd ? '<td class="right ytd tabular">—</td>' : ''}</tr>` : '',
                  data.components.overtime_ngn   ? `<tr><td>Overtime</td><td class="right tabular">${esc(formatNaira(data.components.overtime_ngn))}</td>${data.ytd ? '<td class="right ytd tabular">—</td>' : ''}</tr>` : '',
                ].filter(Boolean).join('')
              : `<tr><td>Basic Salary</td><td class="right tabular">${esc(formatNaira(data.gross_ngn))}</td>${data.ytd ? `<td class="right ytd tabular">${esc(formatNaira(data.ytd.gross_ngn))}</td>` : ''}</tr>`}
            <tr class="subtotal gross">
              <td>Gross Pay</td>
              <td class="right tabular">${esc(formatNaira(data.gross_ngn))}</td>
              ${data.ytd ? `<td class="right ytd tabular">${esc(formatNaira(data.ytd.gross_ngn))}</td>` : ''}
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Deductions -->
      <div class="section">
        <div class="section-title">Deductions</div>
        <table>
          <thead>
            <tr>
              <th>Description</th>
              <th class="right">Amount (NGN)</th>
              ${data.ytd ? '<th class="right ytd">YTD (NGN)</th>' : ''}
            </tr>
          </thead>
          <tbody>
            ${data.paye_ngn > 0 ? `<tr class="deduction"><td>PAYE Income Tax</td><td class="right tabular">${esc(formatNaira(data.paye_ngn))}</td>${data.ytd ? `<td class="right ytd tabular">${esc(formatNaira(data.ytd.paye_ngn))}</td>` : ''}</tr>` : ''}
            ${data.pension_ngn > 0 ? `<tr class="deduction"><td>Pension (8% of pensionable earnings)</td><td class="right tabular">${esc(formatNaira(data.pension_ngn))}</td>${data.ytd ? `<td class="right ytd tabular">${esc(formatNaira(data.ytd.pension_ngn))}</td>` : ''}</tr>` : ''}
            ${data.nhf_ngn > 0 ? `<tr class="deduction"><td>NHF (2.5%)</td><td class="right tabular">${esc(formatNaira(data.nhf_ngn))}</td>${data.ytd ? `<td class="right ytd tabular">${esc(formatNaira(data.ytd.nhf_ngn))}</td>` : ''}</tr>` : ''}
            ${nhis > 0 ? `<tr class="deduction"><td>NHIS (Employee)</td><td class="right tabular">${esc(formatNaira(nhis))}</td>${data.ytd ? `<td class="right ytd tabular">${esc(formatNaira(data.ytd.nhis_ngn ?? 0))}</td>` : ''}</tr>` : ''}
            ${extraDeductions.map((d) => `<tr class="deduction"><td>${esc(d.description)}</td><td class="right tabular">${esc(formatNaira(d.amount_ngn))}</td>${data.ytd ? '<td class="right ytd tabular">—</td>' : ''}</tr>`).join('')}
            ${totalDeductions === 0 ? `<tr class="deduction"><td colspan="${data.ytd ? 3 : 2}" style="color:#a3a3a3;font-style:italic">No deductions applied</td></tr>` : ''}
            <tr class="subtotal">
              <td>Total Deductions</td>
              <td class="right tabular">${esc(formatNaira(totalDeductions))}</td>
              ${data.ytd ? `<td class="right ytd tabular">${esc(formatNaira(data.ytd.paye_ngn + data.ytd.pension_ngn + data.ytd.nhf_ngn + (data.ytd.nhis_ngn ?? 0)))}</td>` : ''}
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Net pay panel -->
      <div class="net-panel">
        <div>
          <div class="lbl">Net Take-home — ${esc(periodLabel)}</div>
          <div class="sub">Gross ${esc(formatNaira(data.gross_ngn))} less ${esc(formatNaira(totalDeductions))} deductions</div>
        </div>
        <div class="amount tabular">${esc(formatNaira(data.net_ngn))}</div>
      </div>

      <!-- True cost -->
      ${employerCostTotal > 0 ? `
        <div class="true-cost">
          <div class="k">True cost to company (gross + employer contributions)</div>
          <div class="v tabular">${esc(formatNaira(trueCostToCompany))}</div>
        </div>
      ` : ''}

      <!-- YTD strip -->
      ${data.ytd ? `
        <div class="ytd-strip section">
          <div class="head">
            <span class="l">Year-to-date net</span>
            <span class="amount tabular">${esc(formatNaira(data.ytd.net_ngn))}</span>
          </div>
          <div class="bar">
            <div class="fill" style="width:${Math.min(100, Math.round(periodMonth / 12 * 100))}%"></div>
          </div>
          <div class="note">${periodMonth} of 12 months elapsed</div>
        </div>
      ` : ''}

      <!-- Bank + issued to -->
      <div class="info-row">
        ${data.bank_name || data.bank_account ? `
        <div class="info-box">
          <div class="k">Payment Method</div>
          <div class="v">${esc(data.bank_name || '—')}</div>
          ${data.bank_account_name ? `<div class="s">${esc(data.bank_account_name)}</div>` : ''}
          ${data.bank_account ? `<div class="s mono">${esc(data.bank_account)}</div>` : ''}
        </div>` : '<div></div>'}
        <div class="info-box">
          <div class="k">Issued To</div>
          <div class="v">${esc(data.employee_name)}</div>
          ${data.employee_email ? `<div class="s">${esc(data.employee_email)}</div>` : ''}
          ${data.employee_tax_id ? `<div class="s mono">TIN ${esc(data.employee_tax_id)}</div>` : ''}
          ${data.employee_pension_pin ? `<div class="s mono">PenCom PIN ${esc(data.employee_pension_pin)}</div>` : ''}
          ${data.employee_nhf_number ? `<div class="s mono">NHF No. ${esc(data.employee_nhf_number)}</div>` : ''}
        </div>
      </div>

      <!-- Employer costs breakdown -->
      ${employerCostTotal > 0 ? `
        <div class="emp-costs">
          <div class="head">Employer-borne contributions (informational)</div>
          ${emp.pension_employer_ngn ? `<div class="row"><span>Pension (10% employer share)</span><span class="tabular">${esc(formatNaira(emp.pension_employer_ngn))}</span></div>` : ''}
          ${emp.nhis_employer_ngn ? `<div class="row"><span>NHIS (5% employer share)</span><span class="tabular">${esc(formatNaira(emp.nhis_employer_ngn))}</span></div>` : ''}
          ${emp.nsitf_ngn ? `<div class="row"><span>NSITF ECS (1% of payroll)</span><span class="tabular">${esc(formatNaira(emp.nsitf_ngn))}</span></div>` : ''}
          <div class="row total"><span>Total employer contribution</span><span class="tabular">${esc(formatNaira(employerCostTotal))}</span></div>
        </div>
      ` : ''}

    </div><!-- /body -->

    <!-- ── FOOTER ── -->
    <div class="doc-footer">
      <span>Generated by KDOps${data.generated_by ? ' · ' + esc(data.generated_by) : ''} · ${esc(generated)}</span>
      <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
        <span class="verify">ref://${esc(ref)}</span>
        <span class="confidential">Confidential</span>
      </div>
    </div>
  </div>

  ${autoPrint ? `<script>window.onload = () => setTimeout(() => window.print(), 300);</script>` : ''}
</body>
</html>`;
};

/**
 * Open the payslip HTML in a new browser tab (which acts as the preview).
 * autoPrint controls whether the print dialog fires automatically.
 */
export const openPayslipPrintWindow = (
  data: PayslipData,
  opts: { autoPrint?: boolean } = {},
): void => {
  const html = renderPayslipHtml(data, { autoPrint: opts.autoPrint !== false });
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank', 'noopener');
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
};

/**
 * Trigger a plain download (no print dialog) of the rendered HTML.
 * Useful when the payslip is being emailed / archived rather than printed.
 */
export const downloadPayslipPdfFromHtml = (
  data: PayslipData,
  filename?: string,
): void => {
  const html = renderPayslipHtml(data, { autoPrint: false });
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const safe =
    filename
    || `payslip-${(data.employee_name || 'employee').toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${data.period || 'period'}.html`;
  a.href = url;
  a.download = safe;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
};

/**
 * Open an ALREADY-RENDERED payslip document (e.g. HTML fetched back from
 * Supabase Storage) in a new tab — the preview path for stored payslips.
 * Do not confuse with openPayslipPrintWindow, which takes raw PayslipData
 * and renders it fresh; passing a plain HTML string there silently
 * produces a blank/default payslip instead of throwing, since accessing
 * properties on a string never errors in JS.
 */
export const openStoredPayslipHtml = (html: string): void => {
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank', 'noopener');
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
};

/** Download an already-rendered payslip HTML document as a file. */
export const downloadStoredPayslipHtml = (html: string, filename: string): void => {
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.html') ? filename : `${filename}.html`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
};
