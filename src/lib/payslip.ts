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

  components?: {
    basic_ngn?: number;
    housing_ngn?: number;
    transport_ngn?: number;
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
  const totalDeductions =
    data.paye_ngn + data.pension_ngn + data.nhf_ngn + extraDeductTotal;
  const generated = formatDateTime(new Date());
  const autoPrint = opts.autoPrint !== false;
  const periodLabel = monthLabel(data.period);
  const ref = data.payslip_ref || `KDS-${Date.now().toString(36).toUpperCase()}`;
  const firstName = (data.employee_name || 'there').split(' ')[0];

  // Employer-cost sums for the true-cost calculation.
  const emp = data.employer_costs ?? {};
  const employerCostTotal =
    (emp.pension_employer_ngn ?? 0)
    + (emp.nhis_employer_ngn ?? 0)
    + (emp.nsitf_ngn ?? 0);
  const trueCostToCompany = data.gross_ngn + employerCostTotal;

  // Waterfall segments (all as % of gross).
  const seg = {
    take:    pct(data.net_ngn,          data.gross_ngn),
    paye:    pct(data.paye_ngn,         data.gross_ngn),
    pension: pct(data.pension_ngn,      data.gross_ngn),
    nhf:     pct(data.nhf_ngn,          data.gross_ngn),
    extra:   pct(extraDeductTotal,      data.gross_ngn),
  };

  const logoHtml = data.logo_url
    ? `<img src="${esc(data.logo_url)}" alt="${esc(data.company_name)} logo" class="logo-img" />`
    : `<div class="logo-fallback">${esc(initials(data.company_name || 'KD'))}</div>`;

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${esc(data.company_name)} · Payslip · ${esc(periodLabel)} · ${esc(data.employee_name)}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@500&display=swap');
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body { font-family: 'Inter', system-ui, -apple-system, 'Segoe UI', sans-serif; }
    body {
      color: #0f172a;
      background: #eef2f7;
      padding: 0;
      -webkit-font-smoothing: antialiased;
      font-feature-settings: 'cv02','cv03','cv04','cv11';
    }
    .tabular { font-variant-numeric: tabular-nums; letter-spacing: -0.005em; }
    .mono { font-family: 'JetBrains Mono', ui-monospace, monospace; }

    /* ─── Page ────────────────────────────────────────────── */
    .page {
      max-width: 820px;
      margin: 32px auto;
      background: #fff;
      border-radius: 20px;
      box-shadow: 0 12px 44px rgba(15,23,42,0.10), 0 2px 8px rgba(15,23,42,0.05);
      overflow: hidden;
    }

    /* ─── Header (branded gradient) ──────────────────────── */
    .hero {
      position: relative;
      background:
        radial-gradient(1200px 400px at 90% -20%, rgba(56,189,248,0.35), transparent 60%),
        radial-gradient(800px 350px at 5% 120%, rgba(139,92,246,0.35), transparent 60%),
        linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
      color: #fff;
      padding: 32px 40px 28px;
    }
    .hero-top { display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap; }
    .brand { display: flex; align-items: center; gap: 14px; }
    .logo-img, .logo-fallback {
      width: 44px; height: 44px; border-radius: 10px; object-fit: contain; flex-shrink: 0;
    }
    .logo-fallback {
      background: rgba(255,255,255,0.15);
      color: #fff; display: flex; align-items: center; justify-content: center;
      font-weight: 800; font-size: 15px; letter-spacing: 0.04em;
      backdrop-filter: blur(6px);
    }
    .brand-text { line-height: 1.2; }
    .brand-text .co { font-size: 15px; font-weight: 700; letter-spacing: -0.2px; }
    .brand-text .sub { font-size: 11px; color: rgba(255,255,255,0.6); margin-top: 2px; }
    .doc-badge {
      display: inline-flex; align-items: center; gap: 6px;
      padding: 5px 10px; border-radius: 999px;
      background: rgba(255,255,255,0.10); backdrop-filter: blur(6px);
      font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.12em;
      color: rgba(255,255,255,0.9);
    }
    .doc-badge::before { content:''; width:6px; height:6px; border-radius:50%; background:#10b981; box-shadow:0 0 8px #10b981; }

    /* Greeting + hero net */
    .hero-body { margin-top: 28px; }
    .greeting { font-size: 13px; color: rgba(255,255,255,0.75); font-weight: 500; }
    .greeting b { color: #fff; font-weight: 700; }
    .hero-net {
      display: flex; align-items: baseline; gap: 12px; flex-wrap: wrap;
      margin-top: 6px;
    }
    .hero-net .label { font-size: 12px; color: rgba(255,255,255,0.6); font-weight: 600; text-transform: uppercase; letter-spacing: 0.1em; }
    .hero-net .amount {
      font-size: 44px; font-weight: 800; letter-spacing: -1.2px; line-height: 1;
      background: linear-gradient(135deg, #fff 0%, #cbd5e1 100%);
      -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;
    }
    .hero-net .period { font-size: 13px; color: rgba(255,255,255,0.7); font-weight: 500; }

    /* Ref strip */
    .ref-strip {
      margin-top: 20px; padding-top: 16px;
      border-top: 1px solid rgba(255,255,255,0.10);
      display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px;
      font-size: 11px;
    }
    .ref-strip .kv { color: rgba(255,255,255,0.6); }
    .ref-strip .kv b { color: #fff; font-weight: 600; }

    /* ─── Meta row (employee + bank) ─────────────────────── */
    .meta-row {
      padding: 20px 40px;
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 20px;
      background: #fafbfc;
      border-bottom: 1px solid #e2e8f0;
    }
    .meta-item .k { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: #64748b; }
    .meta-item .v { font-size: 13px; font-weight: 600; color: #0f172a; margin-top: 3px; line-height: 1.35; }
    .meta-item .v.mono { font-size: 12px; }

    /* ─── Body ───────────────────────────────────────────── */
    .body { padding: 28px 40px; }

    .section {
      margin-bottom: 28px;
    }
    .section-title {
      font-size: 10px; font-weight: 700; text-transform: uppercase;
      letter-spacing: 0.12em; color: #64748b;
      display: flex; align-items: center; gap: 8px; margin-bottom: 12px;
    }
    .section-title::after {
      content: ''; flex: 1; height: 1px;
      background: linear-gradient(to right, #e2e8f0, transparent);
    }

    /* Waterfall chart (CSS-only) */
    .waterfall {
      border-radius: 12px; overflow: hidden;
      display: flex; height: 32px; width: 100%;
      box-shadow: inset 0 0 0 1px #e2e8f0;
      background: #f1f5f9;
    }
    .waterfall .seg {
      display: flex; align-items: center; justify-content: center;
      font-size: 10px; font-weight: 700; color: #fff;
      transition: width 0.6s ease;
      white-space: nowrap; overflow: hidden;
    }
    .seg.take    { background: linear-gradient(180deg, #10b981, #059669); }
    .seg.paye    { background: linear-gradient(180deg, #ef4444, #dc2626); }
    .seg.pension { background: linear-gradient(180deg, #f59e0b, #d97706); }
    .seg.nhf     { background: linear-gradient(180deg, #8b5cf6, #7c3aed); }
    .seg.extra   { background: linear-gradient(180deg, #64748b, #475569); }

    .waterfall-legend {
      display: flex; flex-wrap: wrap; gap: 12px; margin-top: 8px;
      font-size: 11px; color: #475569;
    }
    .waterfall-legend .dot {
      display: inline-block; width: 8px; height: 8px; border-radius: 2px;
      margin-right: 5px; vertical-align: middle;
    }

    /* Tables */
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    thead th {
      padding: 10px 14px; text-align: left;
      font-size: 10px; font-weight: 700; text-transform: uppercase;
      letter-spacing: 0.08em; color: #64748b;
      border-bottom: 1px solid #e2e8f0;
    }
    thead th.right { text-align: right; }
    thead th.ytd   { color: #94a3b8; }
    tbody td { padding: 11px 14px; border-bottom: 1px solid #f1f5f9; color: #1f2937; }
    tbody tr:last-child td { border-bottom: none; }
    tbody td.right { text-align: right; }
    tbody td.right.tabular { font-weight: 500; }
    tbody td.ytd { color: #94a3b8; font-weight: 500; }
    tbody tr.deduction td { color: #475569; }
    tbody tr.deduction td.right { color: #dc2626; }
    tbody tr.subtotal td {
      background: #f8fafc; font-weight: 700;
      border-top: 2px solid #e2e8f0; border-bottom: 2px solid #e2e8f0;
    }
    tbody tr.subtotal td.right { color: #dc2626; }
    tbody tr.subtotal.gross td.right { color: #059669; }

    /* Net pay panel */
    .net-panel {
      background:
        radial-gradient(600px 200px at 90% -20%, rgba(255,255,255,0.15), transparent 60%),
        linear-gradient(135deg, #059669 0%, #10b981 100%);
      border-radius: 16px; padding: 24px 28px;
      display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap;
      color: #fff;
      margin-bottom: 24px;
      box-shadow: 0 10px 26px rgba(16,185,129,0.28);
    }
    .net-panel .lbl { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.12em; color: rgba(255,255,255,0.85); }
    .net-panel .sub { font-size: 11px; color: rgba(255,255,255,0.7); margin-top: 3px; }
    .net-panel .amount { font-size: 34px; font-weight: 800; letter-spacing: -0.6px; }

    /* True cost strip */
    .true-cost {
      display: flex; align-items: center; justify-content: space-between; gap: 16px;
      padding: 14px 18px;
      border: 1px dashed #cbd5e1;
      border-radius: 12px;
      background: #fafbfc;
      margin-bottom: 24px;
    }
    .true-cost .k {
      font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; color: #64748b;
    }
    .true-cost .k b { color: #0f172a; font-weight: 700; }
    .true-cost .v { font-size: 15px; font-weight: 700; }

    /* YTD strip (bar with markers) */
    .ytd-strip {
      background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px;
      padding: 14px 18px;
    }
    .ytd-strip .head { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 6px; }
    .ytd-strip .head .l { font-size: 11px; text-transform: uppercase; font-weight: 700; letter-spacing: 0.1em; color: #64748b; }
    .ytd-strip .head .amount { font-size: 16px; font-weight: 700; color: #0f172a; }
    .ytd-strip .bar { height: 8px; background: #e2e8f0; border-radius: 4px; overflow: hidden; }
    .ytd-strip .fill { height: 100%; background: linear-gradient(90deg, #059669 0%, #10b981 100%); border-radius: 4px; }
    .ytd-strip .note { font-size: 10px; color: #94a3b8; margin-top: 6px; }

    /* Info boxes (bank + summary) */
    .info-row {
      display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-bottom: 24px;
    }
    .info-box {
      border: 1px solid #e2e8f0; border-radius: 12px; padding: 14px 18px;
      background: #fff;
    }
    .info-box .k { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: #94a3b8; margin-bottom: 6px; }
    .info-box .v { font-size: 13px; font-weight: 600; color: #0f172a; }
    .info-box .s { font-size: 11px; color: #64748b; margin-top: 2px; }

    /* Employer costs (small print) */
    .emp-costs {
      margin-top: 8px;
      padding: 14px 18px;
      background: #f1f5f9;
      border-radius: 12px;
      font-size: 11px; color: #475569;
    }
    .emp-costs .head { font-size: 10px; text-transform: uppercase; font-weight: 700; letter-spacing: 0.1em; color: #64748b; margin-bottom: 6px; }
    .emp-costs .row { display: flex; justify-content: space-between; padding: 3px 0; }
    .emp-costs .row.total { border-top: 1px solid #cbd5e1; padding-top: 6px; margin-top: 4px; font-weight: 700; color: #0f172a; }

    /* Footer */
    .doc-footer {
      background: #f8fafc; border-top: 1px solid #e2e8f0;
      padding: 18px 40px;
      display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap;
      font-size: 11px; color: #64748b;
    }
    .confidential {
      display: inline-flex; align-items: center; gap: 5px;
      padding: 3px 10px; border-radius: 999px;
      background: #fef3c7; color: #92400e;
      font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em;
    }
    .verify {
      font-family: 'JetBrains Mono', ui-monospace, monospace;
      font-size: 10px; color: #475569;
      padding: 3px 8px; background: #fff; border: 1px solid #e2e8f0; border-radius: 6px;
    }

    /* ─── Print ─────────────────────────────────────────── */
    @media print {
      body { background: #fff; }
      .page { margin: 0; border-radius: 0; box-shadow: none; max-width: none; }
      .hero, .net-panel { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      @page { size: A4; margin: 0; }
    }
  </style>
</head>
<body>
  <div class="page">
    <!-- ── HERO ── -->
    <div class="hero">
      <div class="hero-top">
        <div class="brand">
          ${logoHtml}
          <div class="brand-text">
            <div class="co">${esc(data.company_name)}</div>
            <div class="sub">${esc(data.company_address || 'KDOps · Operations Platform')}</div>
          </div>
        </div>
        <div class="doc-badge">Payslip · ${esc(periodLabel)}</div>
      </div>

      <div class="hero-body">
        <div class="greeting">${greeting(new Date().getHours())}, <b>${esc(firstName)}</b> — here's your payslip for</div>
        <div class="hero-net">
          <span class="amount tabular">${esc(formatNaira(data.net_ngn))}</span>
          <span class="period">${esc(periodLabel)}</span>
        </div>
      </div>

      <div class="ref-strip">
        <span class="kv">Reference <b class="mono">${esc(ref)}</b></span>
        <span class="kv">Issued <b>${esc(formatDate(new Date()))}</b></span>
      </div>
    </div>

    <!-- ── META ── -->
    <div class="meta-row">
      <div class="meta-item">
        <div class="k">Employee</div>
        <div class="v">${esc(data.employee_name)}</div>
      </div>
      ${data.employee_number ? `<div class="meta-item"><div class="k">Staff No.</div><div class="v mono">${esc(data.employee_number)}</div></div>` : ''}
      ${data.employee_role ? `<div class="meta-item"><div class="k">Role</div><div class="v">${esc(data.employee_role)}</div></div>` : ''}
      <div class="meta-item">
        <div class="k">Pay Period</div>
        <div class="v">${esc(periodLabel)}</div>
      </div>
    </div>

    <!-- ── BODY ── -->
    <div class="body">

      <!-- Pay waterfall (CSS-only) -->
      <div class="section">
        <div class="section-title">How your gross was spent</div>
        <div class="waterfall">
          ${data.net_ngn > 0 ? `<div class="seg take"    style="width:${seg.take}%">${seg.take >= 8 ? Math.round(seg.take) + '% take-home' : ''}</div>` : ''}
          ${data.paye_ngn > 0 ? `<div class="seg paye"    style="width:${seg.paye}%">${seg.paye >= 6 ? 'PAYE ' + Math.round(seg.paye) + '%' : ''}</div>` : ''}
          ${data.pension_ngn > 0 ? `<div class="seg pension" style="width:${seg.pension}%">${seg.pension >= 6 ? 'Pension ' + Math.round(seg.pension) + '%' : ''}</div>` : ''}
          ${data.nhf_ngn > 0 ? `<div class="seg nhf"     style="width:${seg.nhf}%">${seg.nhf >= 6 ? 'NHF ' + Math.round(seg.nhf) + '%' : ''}</div>` : ''}
          ${extraDeductTotal > 0 ? `<div class="seg extra"   style="width:${seg.extra}%">${seg.extra >= 6 ? 'Other ' + Math.round(seg.extra) + '%' : ''}</div>` : ''}
        </div>
        <div class="waterfall-legend">
          <span><span class="dot" style="background:#059669"></span>Take-home ${esc(formatNaira(data.net_ngn))}</span>
          ${data.paye_ngn > 0 ? `<span><span class="dot" style="background:#dc2626"></span>PAYE ${esc(formatNaira(data.paye_ngn))}</span>` : ''}
          ${data.pension_ngn > 0 ? `<span><span class="dot" style="background:#d97706"></span>Pension ${esc(formatNaira(data.pension_ngn))}</span>` : ''}
          ${data.nhf_ngn > 0 ? `<span><span class="dot" style="background:#7c3aed"></span>NHF ${esc(formatNaira(data.nhf_ngn))}</span>` : ''}
          ${extraDeductTotal > 0 ? `<span><span class="dot" style="background:#475569"></span>Other ${esc(formatNaira(extraDeductTotal))}</span>` : ''}
        </div>
      </div>

      <!-- Earnings -->
      <div class="section">
        <div class="section-title">Earnings</div>
        <table>
          <thead>
            <tr>
              <th>Description</th>
              <th class="right">Amount (₦)</th>
              ${data.ytd ? '<th class="right ytd">YTD (₦)</th>' : ''}
            </tr>
          </thead>
          <tbody>
            ${data.components
              ? [
                  data.components.basic_ngn      ? `<tr><td>Basic Salary</td><td class="right tabular">${esc(formatNaira(data.components.basic_ngn))}</td>${data.ytd ? '<td class="right ytd tabular">—</td>' : ''}</tr>` : '',
                  data.components.housing_ngn    ? `<tr><td>Housing Allowance</td><td class="right tabular">${esc(formatNaira(data.components.housing_ngn))}</td>${data.ytd ? '<td class="right ytd tabular">—</td>' : ''}</tr>` : '',
                  data.components.transport_ngn  ? `<tr><td>Transport Allowance</td><td class="right tabular">${esc(formatNaira(data.components.transport_ngn))}</td>${data.ytd ? '<td class="right ytd tabular">—</td>' : ''}</tr>` : '',
                  data.components.other_allowances_ngn ? `<tr><td>Other Allowances</td><td class="right tabular">${esc(formatNaira(data.components.other_allowances_ngn))}</td>${data.ytd ? '<td class="right ytd tabular">—</td>' : ''}</tr>` : '',
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
              <th class="right">Amount (₦)</th>
              ${data.ytd ? '<th class="right ytd">YTD (₦)</th>' : ''}
            </tr>
          </thead>
          <tbody>
            ${data.paye_ngn > 0 ? `<tr class="deduction"><td>PAYE Income Tax</td><td class="right tabular">−&nbsp;${esc(formatNaira(data.paye_ngn))}</td>${data.ytd ? `<td class="right ytd tabular">${esc(formatNaira(data.ytd.paye_ngn))}</td>` : ''}</tr>` : ''}
            ${data.pension_ngn > 0 ? `<tr class="deduction"><td>Pension Contribution (8%)</td><td class="right tabular">−&nbsp;${esc(formatNaira(data.pension_ngn))}</td>${data.ytd ? `<td class="right ytd tabular">${esc(formatNaira(data.ytd.pension_ngn))}</td>` : ''}</tr>` : ''}
            ${data.nhf_ngn > 0 ? `<tr class="deduction"><td>NHF (2.5% of basic)</td><td class="right tabular">−&nbsp;${esc(formatNaira(data.nhf_ngn))}</td>${data.ytd ? `<td class="right ytd tabular">${esc(formatNaira(data.ytd.nhf_ngn))}</td>` : ''}</tr>` : ''}
            ${extraDeductions.map((d) => `<tr class="deduction"><td>${esc(d.description)}</td><td class="right tabular">−&nbsp;${esc(formatNaira(d.amount_ngn))}</td>${data.ytd ? '<td class="right ytd tabular">—</td>' : ''}</tr>`).join('')}
            ${totalDeductions === 0 ? `<tr class="deduction"><td colspan="${data.ytd ? 3 : 2}" style="color:#94a3b8;font-style:italic">No deductions applied</td></tr>` : ''}
            <tr class="subtotal">
              <td>Total Deductions</td>
              <td class="right tabular">−&nbsp;${esc(formatNaira(totalDeductions))}</td>
              ${data.ytd ? `<td class="right ytd tabular">${esc(formatNaira(data.ytd.paye_ngn + data.ytd.pension_ngn + data.ytd.nhf_ngn))}</td>` : ''}
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Net pay panel -->
      <div class="net-panel">
        <div>
          <div class="lbl">Net Take-home — ${esc(periodLabel)}</div>
          <div class="sub">Gross ${esc(formatNaira(data.gross_ngn))} − Deductions ${esc(formatNaira(totalDeductions))}</div>
        </div>
        <div class="amount tabular">${esc(formatNaira(data.net_ngn))}</div>
      </div>

      <!-- True cost -->
      ${employerCostTotal > 0 ? `
        <div class="true-cost">
          <div class="k">True cost to company <b>(gross + employer contributions)</b></div>
          <div class="v tabular">${esc(formatNaira(trueCostToCompany))}</div>
        </div>
      ` : ''}

      <!-- YTD strip -->
      ${data.ytd ? `
        <div class="ytd-strip section">
          <div class="head">
            <span class="l">Year-to-date net take-home</span>
            <span class="amount tabular">${esc(formatNaira(data.ytd.net_ngn))}</span>
          </div>
          <div class="bar">
            <div class="fill" style="width:${Math.min(100, Math.round((new Date().getMonth() + 1) / 12 * 100))}%"></div>
          </div>
          <div class="note">Cumulative net from January · ${new Date().getMonth() + 1} of 12 months elapsed</div>
        </div>
      ` : ''}

      <!-- Bank + issued to -->
      <div class="info-row">
        ${data.bank_name || data.bank_account ? `
        <div class="info-box">
          <div class="k">Payment Method</div>
          <div class="v">${esc(data.bank_name || '—')}</div>
          ${data.bank_account ? `<div class="s mono">${esc(data.bank_account)}</div>` : ''}
        </div>` : '<div></div>'}
        <div class="info-box">
          <div class="k">Issued To</div>
          <div class="v">${esc(data.employee_name)}</div>
          ${data.employee_email ? `<div class="s">${esc(data.employee_email)}</div>` : ''}
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
