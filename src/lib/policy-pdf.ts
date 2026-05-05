// Expense Policy PDF export
//
// Generates a printable HTML document that mirrors the company expense
// policy as configured in Settings. Used for: external audits, new-hire
// onboarding packs, finance-team reference.
//
// The "PDF" is HTML opened in a print window — the browser's native
// "Save as PDF" handles the conversion. No server-side dep, no external
// library, plays nicely with branded shells.

import { formatNaira } from '@/lib/format';
import { expenseCategoryLabel } from '@/lib/expense-categories';

export interface PolicyExportInput {
  companyName: string;
  logoUrl?: string | null;
  expenseLimits: Record<string, number>;
  dualApprovalThresholdNgn: number;
  generatedBy?: string;
  /** Optional free-text policy clauses from company_settings.policy_text. */
  policyText?: string | null;
}

const escapeHtml = (s: string): string =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

export function exportExpensePolicyPdf(input: PolicyExportInput): void {
  const BRAND = '#006994';
  const limits = Object.entries(input.expenseLimits || {})
    .filter(([, n]) => Number(n) > 0)
    .sort(([a], [b]) => expenseCategoryLabel(a).localeCompare(expenseCategoryLabel(b)));

  const today = new Date().toLocaleDateString('en-GB', {
    day: '2-digit', month: 'long', year: 'numeric',
  });

  const logoHtml = input.logoUrl
    ? `<img src="${escapeHtml(input.logoUrl)}" alt="" style="height:30px;width:auto;max-width:140px;object-fit:contain;display:block;" />`
    : `<div style="font-size:18px;font-weight:800;letter-spacing:-0.02em;color:${BRAND};">${escapeHtml(input.companyName.split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase())}</div>`;

  const limitsTable = limits.length === 0
    ? `<p style="color:#737373;font-style:italic;font-size:13px;">No category caps set — claims of any size route through normal approval.</p>`
    : `<table style="width:100%;border-collapse:collapse;font-size:13px;margin-top:8px;">
        <thead>
          <tr style="background:#f4f4f5;">
            <th style="text-align:left;padding:10px 14px;font-weight:600;color:#525252;border-bottom:1px solid #e4e4e7;font-size:11px;text-transform:uppercase;letter-spacing:0.04em;">Category</th>
            <th style="text-align:right;padding:10px 14px;font-weight:600;color:#525252;border-bottom:1px solid #e4e4e7;font-size:11px;text-transform:uppercase;letter-spacing:0.04em;">Per-claim cap</th>
          </tr>
        </thead>
        <tbody>
          ${limits.map(([cat, amt]) => `
            <tr>
              <td style="padding:10px 14px;border-bottom:1px solid #f4f4f5;text-transform:capitalize;">${escapeHtml(expenseCategoryLabel(cat))}</td>
              <td style="padding:10px 14px;border-bottom:1px solid #f4f4f5;text-align:right;font-variant-numeric:tabular-nums;">${escapeHtml(formatNaira(Number(amt)))}</td>
            </tr>`).join('')}
        </tbody>
      </table>`;

  const customClauses = input.policyText && input.policyText.trim()
    ? `<section><h2>Additional clauses</h2><div style="white-space:pre-wrap;font-size:13px;color:#3f3f46;line-height:1.7;">${escapeHtml(input.policyText)}</div></section>`
    : '';

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Expense Policy — ${escapeHtml(input.companyName)}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
      background: #f4f4f5;
      color: #18181b;
      padding: 40px 16px;
      -webkit-font-smoothing: antialiased;
    }
    .page {
      max-width: 720px;
      margin: 0 auto;
      background: #fff;
      box-shadow: 0 1px 3px rgba(0,0,0,0.06), 0 8px 32px -8px rgba(0,0,0,0.1);
    }
    .accent { height: 4px; background: ${BRAND}; }
    .header {
      padding: 32px 40px 24px;
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 20px;
      border-bottom: 1px solid #f0f0f0;
    }
    .header-meta { text-align: right; font-size: 11px; color: #71717a; line-height: 1.7; }
    .header-meta strong { color: #18181b; }
    h1 {
      font-size: 24px;
      font-weight: 800;
      letter-spacing: -0.02em;
      color: #18181b;
      margin-bottom: 4px;
    }
    .lede {
      padding: 24px 40px 8px;
      font-size: 13.5px;
      color: #525252;
      line-height: 1.7;
    }
    section { padding: 20px 40px; border-bottom: 1px solid #f4f4f5; }
    section:last-of-type { border-bottom: none; }
    section h2 {
      font-size: 11px;
      font-weight: 700;
      color: ${BRAND};
      letter-spacing: 0.12em;
      text-transform: uppercase;
      margin-bottom: 14px;
    }
    .block {
      padding: 14px 16px;
      background: #fafafa;
      border-radius: 8px;
      font-size: 13px;
      color: #3f3f46;
      line-height: 1.7;
      margin-top: 10px;
    }
    .block strong { color: #18181b; }
    .footer {
      padding: 18px 40px 32px;
      border-top: 1px solid #f0f0f0;
      font-size: 11px;
      color: #a1a1aa;
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 12px;
    }
    @media print {
      body { background: #fff; padding: 0; }
      .page { box-shadow: none; max-width: 100%; }
      .accent { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
  </style>
</head>
<body>
<div class="page">
  <div class="accent"></div>

  <div class="header">
    <div>
      ${logoHtml}
      <h1 style="margin-top:14px;">Expense Policy</h1>
      <p style="font-size:13px;color:#71717a;margin-top:2px;">${escapeHtml(input.companyName)}</p>
    </div>
    <div class="header-meta">
      <div><strong>Issued</strong></div>
      <div>${escapeHtml(today)}</div>
      ${input.generatedBy ? `<div style="margin-top:6px;"><strong>Prepared by</strong></div><div>${escapeHtml(input.generatedBy)}</div>` : ''}
    </div>
  </div>

  <p class="lede">
    This policy governs how employees and contractors may claim business expenses
    against ${escapeHtml(input.companyName)}'s funds. All claims must follow the
    rules below; over-cap claims may be submitted but are flagged for senior
    review.
  </p>

  <section>
    <h2>1. Per-category caps</h2>
    <p style="font-size:13px;color:#525252;line-height:1.7;">
      Each category has a ceiling on how much can be claimed per expense item. Claims above the cap will be flagged at submission and routed to higher-level approval.
    </p>
    ${limitsTable}
  </section>

  <section>
    <h2>2. Dual approval threshold</h2>
    <div class="block">
      Any single expense claim of <strong>${escapeHtml(formatNaira(input.dualApprovalThresholdNgn || 0))}</strong> or more requires <strong>two independent approvers</strong> (the second cannot be the submitter or the first approver). This protects against fraud and accidental large disbursements.
    </div>
  </section>

  <section>
    <h2>3. Receipts</h2>
    <div class="block">
      <strong>Required:</strong> Vehicle repair claims over ₦10,000.<br/>
      <strong>Recommended:</strong> All claims above ₦5,000.<br/>
      Acceptable formats: JPEG, PNG, PDF. Max 10 MB per file.
    </div>
  </section>

  <section>
    <h2>4. Reimbursement vs. company charge</h2>
    <div class="block">
      Mark each claim as either a <strong>reimbursement</strong> (you paid out-of-pocket and need money back to your bank account) or a <strong>company charge</strong> (the cost was billed directly to the company — no money flows to you). Reimbursements require valid bank account details on file.
    </div>
  </section>

  <section>
    <h2>5. Mileage</h2>
    <div class="block">
      Mileage claims must specify distance in kilometres and the per-km rate. The system calculates the amount automatically. Default rate: <strong>₦100/km</strong>; finance may set a different rate per claim.
    </div>
  </section>

  <section>
    <h2>6. Approval timeline</h2>
    <div class="block">
      Claims are reviewed within <strong>3 business days</strong>. Any claim still pending after 5 days is flagged in the approver dashboard. Rejections include a written reason; you may re-edit and resubmit.
    </div>
  </section>

  <section>
    <h2>7. Audit trail</h2>
    <div class="block">
      Every claim, approval, rejection, and payment is recorded in the immutable audit log with the actor's identity and timestamp. Bank account changes are tamper-resistant via hash-chained logs.
    </div>
  </section>

  ${customClauses}

  <div class="footer">
    <span>${escapeHtml(input.companyName)} · Expense Policy</span>
    <span>Generated by KD Ops</span>
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
