// Expense Policy PDF export
//
// Generates a printable HTML document that mirrors the company expense
// policy as configured in Settings. The "PDF" is HTML opened in a print
// window — the browser's native "Save as PDF" handles the conversion.

import { formatNaira } from '@/lib/format';
import { expenseCategoryLabel } from '@/lib/expense-categories';
import {
  receiptTheme as R,
  docFontImport,
  docBaseStyles,
  docMastheadStyle,
  docDotDivider,
  docTableStyles,
  docWaveFlourish,
  docFooterStyles,
  docPrintStyles,
} from '@/lib/receipt-theme';

export interface PolicyExportInput {
  companyName: string;
  logoUrl?: string | null;
  expenseLimits: Record<string, number>;
  dualApprovalThresholdNgn: number;
  generatedBy?: string;
  policyText?: string | null;
}

const esc = (s: string): string =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

export function exportExpensePolicyPdf(input: PolicyExportInput): void {
  const limits = Object.entries(input.expenseLimits || {})
    .filter(([, n]) => Number(n) > 0)
    .sort(([a], [b]) => expenseCategoryLabel(a).localeCompare(expenseCategoryLabel(b)));

  const today = new Date().toLocaleDateString('en-GB', {
    day: '2-digit', month: 'long', year: 'numeric',
  });

  const logoHtml = input.logoUrl
    ? `<img src="${esc(input.logoUrl)}" alt="" style="height:36px;width:auto;max-width:140px;object-fit:contain;display:block;border-radius:6px;background:rgba(255,255,255,0.15);padding:3px;" />`
    : `<div style="width:36px;height:36px;border-radius:8px;background:rgba(255,255,255,0.2);display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:800;color:#fff;">${esc(input.companyName.split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase())}</div>`;

  const limitsTable = limits.length === 0
    ? `<p style="color:${R.muted};font-style:italic;font-size:13px;">No category caps set — claims of any size route through normal approval.</p>`
    : `<table>
        <thead>
          <tr>
            <th>Category</th>
            <th class="right">Per-claim cap</th>
          </tr>
        </thead>
        <tbody>
          ${limits.map(([cat, amt]) => `
            <tr>
              <td style="text-transform:capitalize;">${esc(expenseCategoryLabel(cat))}</td>
              <td class="right tabular" style="font-weight:600;">${esc(formatNaira(Number(amt)))}</td>
            </tr>`).join('')}
        </tbody>
      </table>`;

  const customClauses = input.policyText && input.policyText.trim()
    ? `<div class="section"><div class="section-title"><span class="num">8</span>Additional Clauses</div><div class="block">${esc(input.policyText)}</div></div>`
    : '';

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Expense Policy — ${esc(input.companyName)}</title>
  <style>
    ${docFontImport}
    ${docBaseStyles}

    .page {
      max-width: 760px;
      margin: 32px auto;
      background: #fff;
      overflow: hidden;
      box-shadow: 0 1px 3px rgba(0,0,0,0.06), 0 8px 32px -8px rgba(0,0,0,0.1);
    }

    ${docMastheadStyle()}
    ${docTableStyles}

    .lede {
      padding: 24px 40px 8px;
      font-size: 13.5px;
      color: ${R.muted};
      line-height: 1.7;
    }

    .body { padding: 0 40px 28px; }
    .section { padding: 20px 0; border-bottom: 1px solid #f4f4f5; }
    .section:last-of-type { border-bottom: none; }
    .section-title {
      font-size: 10px; font-weight: 700; text-transform: uppercase;
      letter-spacing: 0.12em; color: ${R.muted};
      margin-bottom: 14px;
      padding-bottom: 6px;
      border-bottom: 1px solid ${R.border};
      display: flex; align-items: center; gap: 10px;
      position: relative;
    }
    .section-title::after {
      content: ''; position: absolute; left: 0; bottom: -1px;
      width: 28px; height: 2px; background: ${R.brand};
    }
    .section-title .num {
      width: 22px; height: 22px; border-radius: 50%;
      background: ${R.brand}; color: #fff;
      font-size: 10px; font-weight: 800;
      display: inline-flex; align-items: center; justify-content: center;
      flex-shrink: 0;
    }
    .section p { font-size: 13px; color: ${R.muted}; line-height: 1.7; margin-bottom: 10px; }

    .block {
      padding: 14px 16px;
      background: ${R.panelBg};
      border-left: 3px solid ${R.brand};
      font-size: 13px;
      color: ${R.bodyText};
      line-height: 1.7;
      margin-top: 10px;
      white-space: pre-wrap;
    }
    .block strong { color: ${R.bodyText}; }

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
          ${logoHtml}
          <div>
            <div style="font-size:13px;font-weight:700;">${esc(input.companyName)}</div>
            <div style="font-size:10px;color:rgba(255,255,255,0.5);">KDOps Platform</div>
          </div>
        </div>
        <div class="doc-title">Expense Policy</div>
        <div class="doc-subtitle">Company-wide expense guidelines and approval rules</div>
      </div>
      <div style="text-align:right;position:relative;z-index:1;">
        <div style="font-size:10px;color:rgba(255,255,255,0.5);text-transform:uppercase;letter-spacing:0.08em;">Issued</div>
        <div style="font-size:13px;font-weight:600;margin-top:2px;">${esc(today)}</div>
        ${input.generatedBy ? `<div style="font-size:10px;color:rgba(255,255,255,0.5);margin-top:8px;text-transform:uppercase;letter-spacing:0.08em;">Prepared by</div><div style="font-size:12px;margin-top:2px;">${esc(input.generatedBy)}</div>` : ''}
      </div>
    </div>
  </div>

  ${docDotDivider()}

  <p class="lede">
    This policy governs how employees and contractors may claim business expenses
    against ${esc(input.companyName)}'s funds. All claims must follow the
    rules below; over-cap claims may be submitted but are flagged for senior
    review.
  </p>

  <div class="body">
    <div class="section">
      <div class="section-title"><span class="num">1</span>Per-category Caps</div>
      <p>Each category has a ceiling on how much can be claimed per expense item. Claims above the cap are flagged and routed to higher-level approval.</p>
      ${limitsTable}
    </div>

    <div class="section">
      <div class="section-title"><span class="num">2</span>Dual Approval Threshold</div>
      <div class="block">
        Any single expense claim of <strong>${esc(formatNaira(input.dualApprovalThresholdNgn || 0))}</strong> or more requires <strong>two independent approvers</strong> (the second cannot be the submitter or the first approver). This protects against fraud and accidental large disbursements.
      </div>
    </div>

    <div class="section">
      <div class="section-title"><span class="num">3</span>Receipts</div>
      <div class="block">
        <strong>Required:</strong> Vehicle repair claims over ₦10,000.<br/>
        <strong>Recommended:</strong> All claims above ₦5,000.<br/>
        Acceptable formats: JPEG, PNG, PDF. Max 10 MB per file.
      </div>
    </div>

    <div class="section">
      <div class="section-title"><span class="num">4</span>Reimbursement vs. Company Charge</div>
      <div class="block">
        Mark each claim as either a <strong>reimbursement</strong> (you paid out-of-pocket and need money back to your bank account) or a <strong>company charge</strong> (the cost was billed directly to the company — no money flows to you). Reimbursements require valid bank account details on file.
      </div>
    </div>

    <div class="section">
      <div class="section-title"><span class="num">5</span>Mileage</div>
      <div class="block">
        Mileage claims must specify distance in kilometres and the per-km rate. The system calculates the amount automatically. Default rate: <strong>₦100/km</strong>; finance may set a different rate per claim.
      </div>
    </div>

    <div class="section">
      <div class="section-title"><span class="num">6</span>Approval Timeline</div>
      <div class="block">
        Claims are reviewed within <strong>3 business days</strong>. Any claim still pending after 5 days is flagged in the approver dashboard. Rejections include a written reason; you may re-edit and resubmit.
      </div>
    </div>

    <div class="section">
      <div class="section-title"><span class="num">7</span>Audit Trail</div>
      <div class="block">
        Every claim, approval, rejection, and payment is recorded in the immutable audit log with the actor's identity and timestamp. Bank account changes are tamper-resistant via hash-chained logs.
      </div>
    </div>

    ${customClauses}
  </div>

  ${docWaveFlourish()}

  <div class="doc-footer">
    <span>${esc(input.companyName)} · Expense Policy</span>
    <span class="doc-confidential">Internal Document</span>
  </div>
</div>
<script>window.onload = () => setTimeout(() => window.print(), 300);</script>
</body>
</html>`;

  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const win = window.open(url, '_blank', 'noopener,width=720,height=900');
  if (!win) return;
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
