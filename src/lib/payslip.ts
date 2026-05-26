/**
 * Nigerian-standard payslip renderer.
 *
 * Layout follows the FIRS / Nigerian Labour Act minimum disclosures:
 *   1. Company header — name, RC, TIN, registered address, logo
 *   2. Pay period — period start, period end, pay date
 *   3. Employee identity — name, staff no., position, department,
 *      tax ID (TIN), pension RSA PIN, NHF number, account
 *   4. Earnings — basic, housing (20% relief), transport (20% relief),
 *      other allowances, bonus / overtime, total gross
 *   5. Pre-tax statutory contributions — pension (8% employee), NHF
 *      (2.5%), NHIS (5%) — these reduce taxable income
 *   6. PAYE — consolidated relief allowance, taxable income, tax due
 *      under NTA 2025 bands
 *   7. Other deductions — advances, EWA, custom
 *   8. Net pay (highlighted)
 *   9. Employer contributions (informational) — pension (10%),
 *      NSITF (1%), ITF (1% annual, conditional)
 *  10. YTD summary — gross, PAYE, pension, net
 *  11. Bank payment details
 *  12. Signature block — employee + authoriser
 *  13. Footer — confidential, payslip ref, generated timestamp
 *
 * The legacy fields (gross_ngn / paye_ngn / pension_ngn / nhf_ngn /
 * net_ngn) are still required so existing callers don't break. Every
 * new field is optional — rendering degrades gracefully when a tenant
 * hasn't filled in their RC number / employee tax IDs / etc.
 */
import { formatDate, formatDateTime, formatNaira } from '@/lib/format';

// ── Types ────────────────────────────────────────────────────────

export interface PayslipEarnings {
  basic_ngn?: number;
  housing_ngn?: number;
  transport_ngn?: number;
  other_allowances?: { description: string; amount_ngn: number }[];
  bonus_ngn?: number;
  overtime_ngn?: number;
}

export interface PayslipYtd {
  gross_ngn?: number;
  paye_ngn?: number;
  pension_ngn?: number;
  net_ngn?: number;
}

export interface PayslipEmployerContrib {
  pension_employer_ngn?: number;
  nsitf_ngn?: number;
  itf_ngn?: number;
}

export interface PayslipData {
  // ── Company ────────────────────────────────────────────────────
  company_name: string;
  company_address?: string | null;
  company_rc?: string | null;
  company_tin?: string | null;
  logo_url?: string | null;

  // ── Employee ───────────────────────────────────────────────────
  employee_name: string;
  employee_email?: string | null;
  employee_role?: string | null;
  employee_number?: string | null;
  employee_department?: string | null;
  employee_tax_id?: string | null;
  employee_pension_pin?: string | null;
  employee_nhf_number?: string | null;

  // ── Pay period ─────────────────────────────────────────────────
  period: string; // "2026-04" or human-readable like "April 2026"
  period_start?: string | null;
  period_end?: string | null;
  pay_date?: string | null;

  // ── Earnings ───────────────────────────────────────────────────
  // Optional itemised breakdown. If omitted, the renderer treats
  // gross_ngn as a single "Basic Salary" line.
  earnings?: PayslipEarnings;

  // ── Statutory + extras (required for back-compat) ─────────────
  gross_ngn: number;
  paye_ngn: number;
  pension_ngn: number;        // employee 8%
  nhf_ngn: number;            // 2.5%
  nhis_ngn?: number;          // 5% if applicable
  net_ngn: number;
  extra_deductions?: { description: string; amount_ngn: number }[] | null;

  // ── Employer contributions (informational) ────────────────────
  employer_contrib?: PayslipEmployerContrib;

  // ── Year-to-date ──────────────────────────────────────────────
  ytd?: PayslipYtd;

  // ── Bank ──────────────────────────────────────────────────────
  bank_name?: string | null;
  bank_account?: string | null;
  bank_account_name?: string | null;

  // ── Misc ──────────────────────────────────────────────────────
  generated_by?: string | null;
  payslip_ref?: string | null;
}

// ── Helpers ──────────────────────────────────────────────────────

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
    return new Date(parseInt(y, 10), parseInt(m, 10) - 1, 1).toLocaleString(
      'en-GB',
      { month: 'long', year: 'numeric' },
    );
  }
  return period;
};

const ngn = (n: number) => formatNaira(Math.round(n || 0));
const ngnNeg = (n: number) => `−&nbsp;${ngn(n)}`;

const initials = (name: string) =>
  name.split(' ').filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('');

// ── Render ───────────────────────────────────────────────────────

export const renderPayslipHtml = (
  data: PayslipData,
  opts: { autoPrint?: boolean } = {},
): string => {
  const periodLabel = monthLabel(data.period);
  const ref = data.payslip_ref || '';
  const generated = formatDateTime(new Date());
  const autoPrint = opts.autoPrint !== false;

  const e = data.earnings || {};
  const otherAllow = e.other_allowances ?? [];
  const otherAllowTotal = otherAllow.reduce((s, a) => s + (a.amount_ngn || 0), 0);

  // Basic / housing / transport — if itemised, render each line; if
  // not, fall back to a single "Basic Salary" worth gross_ngn so the
  // template degrades cleanly for legacy callers.
  const hasItemisedEarnings = (
    e.basic_ngn != null || e.housing_ngn != null || e.transport_ngn != null
    || otherAllow.length > 0 || e.bonus_ngn != null || e.overtime_ngn != null
  );
  const earningRows: { label: string; amount: number }[] = hasItemisedEarnings
    ? [
        ...(e.basic_ngn != null     ? [{ label: 'Basic salary',         amount: e.basic_ngn     }] : []),
        ...(e.housing_ngn != null   ? [{ label: 'Housing allowance',    amount: e.housing_ngn   }] : []),
        ...(e.transport_ngn != null ? [{ label: 'Transport allowance',  amount: e.transport_ngn }] : []),
        ...otherAllow.map((a) => ({ label: a.description, amount: a.amount_ngn })),
        ...(e.bonus_ngn ? [{ label: 'Bonus',     amount: e.bonus_ngn }] : []),
        ...(e.overtime_ngn ? [{ label: 'Overtime', amount: e.overtime_ngn }] : []),
      ]
    : [{ label: 'Basic salary', amount: data.gross_ngn }];

  const totalEarnings = earningRows.reduce((s, r) => s + r.amount, 0);
  // If the items don't quite reconcile to gross_ngn (rounding, optional
  // fields), trust gross_ngn as the source of truth — that's the figure
  // every other system in the platform uses.
  const grossDisplay = Math.abs(totalEarnings - data.gross_ngn) < 1
    ? totalEarnings
    : data.gross_ngn;

  const extraDeductTotal = (data.extra_deductions ?? []).reduce((s, d) => s + d.amount_ngn, 0);
  const statutoryDeductionsTotal =
    (data.paye_ngn || 0) + (data.pension_ngn || 0) + (data.nhf_ngn || 0) + (data.nhis_ngn || 0);
  const totalDeductions = statutoryDeductionsTotal + extraDeductTotal;

  const ec = data.employer_contrib || {};
  const employerTotal =
    (ec.pension_employer_ngn || 0) + (ec.nsitf_ngn || 0) + (ec.itf_ngn || 0);

  const ytd = data.ytd;
  const hasYtd = !!ytd && (
    ytd.gross_ngn != null || ytd.paye_ngn != null
    || ytd.pension_ngn != null || ytd.net_ngn != null
  );

  const logoHtml = data.logo_url
    ? `<img src="${esc(data.logo_url)}" alt="${esc(data.company_name)} logo" style="height:54px;width:54px;object-fit:contain;border-radius:10px;background:#fff;padding:4px;flex-shrink:0;" />`
    : `<div style="width:54px;height:54px;border-radius:10px;background:#006994;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:18px;letter-spacing:0.04em;flex-shrink:0;">${esc(initials(data.company_name || 'KD'))}</div>`;

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
      background: #f3f4f6;
      padding: 0;
      font-size: 13px;
      line-height: 1.45;
    }
    .page {
      max-width: 820px;
      margin: 24px auto;
      background: #fff;
      border-radius: 16px;
      box-shadow: 0 4px 24px rgba(0,0,0,0.08);
      overflow: hidden;
    }

    /* ── Header ──────────────────────────────────────────── */
    .header {
      background: linear-gradient(135deg, #0a2533 0%, #0d3347 60%, #145270 100%);
      color: #fff;
      padding: 28px 36px 22px;
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 16px;
    }
    .h-left { display: flex; align-items: flex-start; gap: 14px; }
    .h-company h1 { font-size: 18px; font-weight: 700; letter-spacing: -0.2px; color: #fff; }
    .h-company p { font-size: 11px; color: rgba(255,255,255,0.55); margin-top: 2px; line-height: 1.55; }
    .h-company .meta { display: flex; gap: 14px; margin-top: 6px; font-size: 10.5px; color: rgba(255,255,255,0.5); }
    .h-company .meta span b { color: rgba(255,255,255,0.85); font-weight: 600; }
    .h-right { text-align: right; }
    .h-right .doctype {
      font-size: 10.5px; font-weight: 700; letter-spacing: 0.18em;
      text-transform: uppercase; color: rgba(255,255,255,0.45); margin-bottom: 6px;
    }
    .h-right .period {
      font-size: 22px; font-weight: 800; color: #fff; letter-spacing: -0.4px; line-height: 1.05;
    }
    .h-right .ref { font-size: 10.5px; color: rgba(255,255,255,0.42); margin-top: 4px; font-family: ui-monospace, Consolas, monospace; }

    /* ── Period strip ─────────────────────────────────────── */
    .period-strip {
      background: linear-gradient(180deg, #f0f7ff 0%, #e8f1fb 100%);
      border-bottom: 1px solid #d8e6f3;
      padding: 14px 36px;
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 18px;
    }
    .period-strip .lbl {
      font-size: 9.5px; font-weight: 700; text-transform: uppercase;
      letter-spacing: 0.1em; color: #5b6b75;
    }
    .period-strip .val { font-size: 13.5px; font-weight: 600; color: #0d3347; margin-top: 3px; }

    /* ── Employee strip ──────────────────────────────────── */
    .emp-strip {
      padding: 18px 36px;
      border-bottom: 1px solid #f3f4f6;
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
      gap: 14px 18px;
    }
    .emp-strip .lbl {
      font-size: 9.5px; font-weight: 700; text-transform: uppercase;
      letter-spacing: 0.07em; color: #9ca3af;
    }
    .emp-strip .val {
      font-size: 12.5px; font-weight: 600; color: #111827; margin-top: 3px;
      word-break: break-word;
    }
    .emp-strip .val.mono { font-family: ui-monospace, Consolas, monospace; font-size: 12px; letter-spacing: -0.01em; }

    /* ── Body ────────────────────────────────────────────── */
    .body { padding: 26px 36px; }
    .section-title {
      font-size: 10.5px; font-weight: 700; text-transform: uppercase;
      letter-spacing: 0.12em; color: #0d3347; margin: 0 0 10px;
      display: flex; align-items: center; gap: 8px;
    }
    .section-title::before {
      content: ''; width: 18px; height: 2px; background: #006994; border-radius: 2px;
    }
    .info-note {
      font-size: 10.5px; color: #6b7280; font-style: italic; margin-top: -4px; margin-bottom: 8px;
    }

    /* Earnings + deductions side-by-side on wide screens */
    .pay-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 20px;
      margin-bottom: 18px;
    }
    @media (max-width: 700px) {
      .pay-grid { grid-template-columns: 1fr; }
    }

    table { width: 100%; border-collapse: collapse; font-size: 12.5px; }
    thead th {
      background: #f9fafb; padding: 8px 12px; text-align: left;
      font-size: 9.5px; font-weight: 700; text-transform: uppercase;
      letter-spacing: 0.07em; color: #6b7280; border-bottom: 1px solid #e5e7eb;
    }
    thead th.right { text-align: right; }
    tbody td { padding: 9px 12px; border-bottom: 1px solid #f3f4f6; color: #374151; }
    tbody td.right { text-align: right; font-variant-numeric: tabular-nums; font-weight: 500; }
    tbody tr.earn td.right { color: #047857; font-weight: 600; }
    tbody tr.deduct td.right { color: #b91c1c; }
    tbody tr.subtotal td { background: #f9fafb; font-weight: 700; border-top: 2px solid #e5e7eb; color: #111827; }
    tbody tr.subtotal td.right { font-size: 13px; }
    tbody tr.subtotal.earn td.right { color: #047857; }
    tbody tr.subtotal.deduct td.right { color: #b91c1c; }

    /* ── Net pay panel ──────────────────────────────────── */
    .net-panel {
      background: linear-gradient(135deg, #006994 0%, #0481ad 50%, #00b4d8 100%);
      border-radius: 14px;
      padding: 22px 28px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 22px;
      box-shadow: 0 6px 20px -4px rgba(0,105,148,0.35);
      gap: 16px;
    }
    .net-panel .lbl {
      font-size: 10.5px; font-weight: 700; text-transform: uppercase;
      letter-spacing: 0.16em; color: rgba(255,255,255,0.75);
    }
    .net-panel .sublbl { font-size: 11px; color: rgba(255,255,255,0.6); margin-top: 5px; line-height: 1.5; }
    .net-panel .amount {
      font-size: 30px; font-weight: 800; color: #fff;
      letter-spacing: -0.5px; font-variant-numeric: tabular-nums;
      text-align: right; line-height: 1.05;
    }
    .net-panel .pay-date { font-size: 10.5px; color: rgba(255,255,255,0.7); margin-top: 4px; text-transform: uppercase; letter-spacing: 0.1em; }

    /* ── Side-by-side info boxes ─────────────────────────── */
    .info-row {
      display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-bottom: 18px;
    }
    @media (max-width: 700px) {
      .info-row { grid-template-columns: 1fr; }
    }
    .info-box {
      border: 1px solid #e5e7eb; border-radius: 10px; padding: 14px 16px;
    }
    .info-box .lbl {
      font-size: 9.5px; font-weight: 700; text-transform: uppercase;
      letter-spacing: 0.08em; color: #9ca3af; margin-bottom: 8px;
    }
    .info-box .row { display: flex; justify-content: space-between; padding: 4px 0; font-size: 12px; }
    .info-box .row .k { color: #6b7280; }
    .info-box .row .v { color: #111827; font-weight: 600; font-variant-numeric: tabular-nums; }
    .info-box.bank .v { font-family: ui-monospace, Consolas, monospace; font-size: 12px; }

    /* ── Signature block ─────────────────────────────────── */
    .sig-row {
      margin-top: 18px;
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 28px;
    }
    .sig-block .line {
      border-bottom: 1px solid #1f2937;
      height: 36px;
    }
    .sig-block .label {
      font-size: 10px; font-weight: 700; text-transform: uppercase;
      letter-spacing: 0.08em; color: #6b7280; margin-top: 6px;
    }
    .sig-block .name { font-size: 12px; color: #374151; margin-top: 2px; }

    /* ── Footer ─────────────────────────────────────────── */
    .doc-footer {
      border-top: 1px solid #f3f4f6;
      padding: 14px 36px 18px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      font-size: 10.5px;
      color: #9ca3af;
      gap: 12px;
      flex-wrap: wrap;
    }
    .confidential {
      display: inline-block; padding: 2px 9px; border-radius: 999px;
      background: #fef3c7; color: #92400e;
      font-size: 9.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em;
    }
    .doc-footer .ref-mono { font-family: ui-monospace, Consolas, monospace; }

    @media print {
      body { background: #fff; padding: 0; }
      .page { margin: 0; border-radius: 0; box-shadow: none; max-width: none; }
      .header, .net-panel { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
  </style>
</head>
<body>
  <div class="page">

    <!-- ── HEADER ─────────────────────────────────────── -->
    <div class="header">
      <div class="h-left">
        ${logoHtml}
        <div class="h-company">
          <h1>${esc(data.company_name)}</h1>
          ${data.company_address ? `<p>${esc(data.company_address)}</p>` : ''}
          ${(data.company_rc || data.company_tin) ? `
            <div class="meta">
              ${data.company_rc ? `<span><b>RC:</b> ${esc(data.company_rc)}</span>` : ''}
              ${data.company_tin ? `<span><b>TIN:</b> ${esc(data.company_tin)}</span>` : ''}
            </div>` : ''}
        </div>
      </div>
      <div class="h-right">
        <div class="doctype">Salary payslip</div>
        <div class="period">${esc(periodLabel)}</div>
        ${ref ? `<div class="ref">Ref: ${esc(ref)}</div>` : ''}
      </div>
    </div>

    <!-- ── PERIOD STRIP ──────────────────────────────────── -->
    <div class="period-strip">
      <div>
        <div class="lbl">Period start</div>
        <div class="val">${esc(data.period_start ? formatDate(data.period_start) : periodLabel)}</div>
      </div>
      <div>
        <div class="lbl">Period end</div>
        <div class="val">${esc(data.period_end ? formatDate(data.period_end) : periodLabel)}</div>
      </div>
      <div>
        <div class="lbl">Pay date</div>
        <div class="val">${esc(data.pay_date ? formatDate(data.pay_date) : '—')}</div>
      </div>
    </div>

    <!-- ── EMPLOYEE STRIP ────────────────────────────────── -->
    <div class="emp-strip">
      <div>
        <div class="lbl">Employee</div>
        <div class="val">${esc(data.employee_name)}</div>
      </div>
      ${data.employee_number ? `<div><div class="lbl">Staff no.</div><div class="val mono">${esc(data.employee_number)}</div></div>` : ''}
      ${data.employee_role ? `<div><div class="lbl">Position</div><div class="val">${esc(data.employee_role)}</div></div>` : ''}
      ${data.employee_department ? `<div><div class="lbl">Department</div><div class="val">${esc(data.employee_department)}</div></div>` : ''}
      ${data.employee_tax_id ? `<div><div class="lbl">Tax ID (TIN)</div><div class="val mono">${esc(data.employee_tax_id)}</div></div>` : ''}
      ${data.employee_pension_pin ? `<div><div class="lbl">RSA PIN</div><div class="val mono">${esc(data.employee_pension_pin)}</div></div>` : ''}
      ${data.employee_nhf_number ? `<div><div class="lbl">NHF no.</div><div class="val mono">${esc(data.employee_nhf_number)}</div></div>` : ''}
    </div>

    <!-- ── BODY ──────────────────────────────────────────── -->
    <div class="body">

      <!-- Earnings + Deductions side-by-side -->
      <div class="pay-grid">

        <!-- Earnings -->
        <div>
          <div class="section-title">Earnings</div>
          <table>
            <thead>
              <tr>
                <th>Description</th>
                <th class="right">Amount (₦)</th>
              </tr>
            </thead>
            <tbody>
              ${earningRows.map((r) => `
                <tr class="earn">
                  <td>${esc(r.label)}</td>
                  <td class="right">${esc(ngn(r.amount))}</td>
                </tr>
              `).join('')}
              <tr class="subtotal earn">
                <td>Total gross</td>
                <td class="right">${esc(ngn(grossDisplay))}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Deductions -->
        <div>
          <div class="section-title">Deductions</div>
          <table>
            <thead>
              <tr>
                <th>Description</th>
                <th class="right">Amount (₦)</th>
              </tr>
            </thead>
            <tbody>
              ${data.pension_ngn > 0 ? `<tr class="deduct"><td>Pension contribution (8%)</td><td class="right">${ngnNeg(data.pension_ngn)}</td></tr>` : ''}
              ${data.nhf_ngn > 0     ? `<tr class="deduct"><td>NHF (2.5%)</td><td class="right">${ngnNeg(data.nhf_ngn)}</td></tr>` : ''}
              ${data.nhis_ngn && data.nhis_ngn > 0 ? `<tr class="deduct"><td>NHIS (5%)</td><td class="right">${ngnNeg(data.nhis_ngn)}</td></tr>` : ''}
              ${data.paye_ngn > 0    ? `<tr class="deduct"><td>PAYE income tax</td><td class="right">${ngnNeg(data.paye_ngn)}</td></tr>` : ''}
              ${(data.extra_deductions ?? []).map((d) => `<tr class="deduct"><td>${esc(d.description)}</td><td class="right">${ngnNeg(d.amount_ngn)}</td></tr>`).join('')}
              ${totalDeductions === 0 ? `<tr class="deduct"><td colspan="2" style="color:#9ca3af;font-style:italic;text-align:center;padding:14px;">No deductions applied</td></tr>` : ''}
              <tr class="subtotal deduct">
                <td>Total deductions</td>
                <td class="right">${ngnNeg(totalDeductions)}</td>
              </tr>
            </tbody>
          </table>
        </div>

      </div>

      <!-- Net pay -->
      <div class="net-panel">
        <div>
          <div class="lbl">Net pay — ${esc(periodLabel)}</div>
          <div class="sublbl">Gross ${esc(ngn(grossDisplay))} − Deductions ${esc(ngn(totalDeductions))}</div>
          ${data.pay_date ? `<div class="pay-date">Pays ${esc(formatDate(data.pay_date))}</div>` : ''}
        </div>
        <div class="amount">${esc(ngn(data.net_ngn))}</div>
      </div>

      <!-- Employer contributions + YTD side-by-side -->
      ${(employerTotal > 0 || hasYtd) ? `
        <div class="info-row">

          ${employerTotal > 0 ? `
          <div class="info-box">
            <div class="lbl">Employer contributions <span style="font-weight:500;color:#9ca3af;text-transform:none;letter-spacing:0;">— informational, not deducted from you</span></div>
            ${ec.pension_employer_ngn ? `<div class="row"><span class="k">Pension employer (10%)</span><span class="v">${esc(ngn(ec.pension_employer_ngn))}</span></div>` : ''}
            ${ec.nsitf_ngn             ? `<div class="row"><span class="k">NSITF (1%)</span><span class="v">${esc(ngn(ec.nsitf_ngn))}</span></div>` : ''}
            ${ec.itf_ngn               ? `<div class="row"><span class="k">ITF (1%, annual)</span><span class="v">${esc(ngn(ec.itf_ngn))}</span></div>` : ''}
            <div class="row" style="border-top:1px solid #e5e7eb;margin-top:6px;padding-top:8px;"><span class="k" style="font-weight:600;color:#374151;">Total employer cost</span><span class="v">${esc(ngn(employerTotal))}</span></div>
          </div>` : '<div></div>'}

          ${hasYtd ? `
          <div class="info-box">
            <div class="lbl">Year-to-date</div>
            ${ytd!.gross_ngn != null   ? `<div class="row"><span class="k">YTD gross</span><span class="v">${esc(ngn(ytd!.gross_ngn))}</span></div>` : ''}
            ${ytd!.paye_ngn != null    ? `<div class="row"><span class="k">YTD PAYE</span><span class="v">${esc(ngn(ytd!.paye_ngn))}</span></div>` : ''}
            ${ytd!.pension_ngn != null ? `<div class="row"><span class="k">YTD pension</span><span class="v">${esc(ngn(ytd!.pension_ngn))}</span></div>` : ''}
            ${ytd!.net_ngn != null     ? `<div class="row" style="border-top:1px solid #e5e7eb;margin-top:6px;padding-top:8px;"><span class="k" style="font-weight:600;color:#374151;">YTD net</span><span class="v">${esc(ngn(ytd!.net_ngn))}</span></div>` : ''}
          </div>` : '<div></div>'}

        </div>` : ''}

      <!-- Bank + issued-to -->
      <div class="info-row">
        ${(data.bank_name || data.bank_account) ? `
        <div class="info-box bank">
          <div class="lbl">Payment details</div>
          <div class="row"><span class="k">Bank</span><span class="v" style="font-family:'Inter',sans-serif;font-size:12px;">${esc(data.bank_name || '—')}</span></div>
          ${data.bank_account ? `<div class="row"><span class="k">Account</span><span class="v">${esc(data.bank_account)}</span></div>` : ''}
          ${data.bank_account_name ? `<div class="row"><span class="k">Name</span><span class="v" style="font-family:'Inter',sans-serif;font-size:12px;">${esc(data.bank_account_name)}</span></div>` : ''}
        </div>` : '<div></div>'}
        <div class="info-box">
          <div class="lbl">Issued to</div>
          <div class="row"><span class="k">Name</span><span class="v">${esc(data.employee_name)}</span></div>
          ${data.employee_email ? `<div class="row"><span class="k">Email</span><span class="v" style="font-family:'Inter',sans-serif;font-size:11.5px;">${esc(data.employee_email)}</span></div>` : ''}
        </div>
      </div>

      <!-- Signature block -->
      <div class="sig-row">
        <div class="sig-block">
          <div class="line"></div>
          <div class="label">Employee signature</div>
          <div class="name">${esc(data.employee_name)}</div>
        </div>
        <div class="sig-block">
          <div class="line"></div>
          <div class="label">Authorised signatory</div>
          <div class="name">${esc(data.generated_by || data.company_name)}</div>
        </div>
      </div>

    </div>

    <!-- ── FOOTER ─────────────────────────────────────────── -->
    <div class="doc-footer">
      <span>Generated by KDOps${data.generated_by ? ' · ' + esc(data.generated_by) : ''} · ${esc(generated)}${ref ? ` · <span class="ref-mono">${esc(ref)}</span>` : ''}</span>
      <div style="display:flex;align-items:center;gap:8px;">
        <span class="confidential">Confidential</span>
        <span>System-generated · keep for your records.</span>
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
 * Render a payslip HTML document to a downloadable multi-page A4 PDF — a real
 * file download, no browser print dialog. jsPDF + html2canvas are dynamically
 * imported so they stay out of the initial bundle and only load on first use.
 * The HTML is rendered in an offscreen, style-isolated iframe so the payslip's
 * own CSS never leaks into the app.
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
