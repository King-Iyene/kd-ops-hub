/**
 * Single source of truth for receipt/print document colors.
 *
 * BatchDetail's batch summary, Payroll's payroll report, and
 * ReceiptModal's per-item receipt render as one document family and
 * must stay visually consistent. All three previously hardcoded their
 * own copies of the same hex values, which is exactly how they drifted
 * apart (BatchDetail's failed-banner text using #8b0000 while every
 * other "failed" state used #b22222; ReceiptModal using an unrelated
 * Tailwind red/emerald/amber set). Import from here instead of typing
 * hex literals so a future color change can't silently diverge again.
 */
export const receiptTheme = {
  brand: '#006994',
  gold: '#D6AC50',
  // Principal Disbursements (director salary/drawings/loan repayments +
  // personal transfers) gets its own accent so its receipts read as
  // visually distinct from a regular payroll/vendor receipt at a glance —
  // deliberately not blue (regular receipts), green/red (success/fail),
  // or amber (pending status watermark). Until the platform goes
  // multi-tenant this is the one override point; a real per-client theme
  // would slot in here instead of a hardcoded pair.
  principalBrand: '#5b2a86',
  principalBrandDark: '#3a1758',
  bodyText: '#0a2533',
  muted: '#5b6b75',
  mutedLight: '#8194a0',
  border: '#e8edf0',
  panelBg: '#f6f9fb',
  success: '#117a3d',
  successBg: '#e6f7ec',
  failed: '#b22222',
  failedBg: '#fde9e9',
  failedBorder: '#f5c0c0',
  failedRowBg: '#fff8f8',
  pending: '#8c6700',
  pendingBg: '#fff5e0',
  pendingBorder: '#f0d890',
  stampText: '#6f5a25',
  badgeText: '#3a2e12',
} as const;

/** '#rrggbb' -> 'rgba(r, g, b, alpha)' — used to tint the receipt card's
 *  dot-texture background to whatever brand color is active (default blue
 *  or Principal Disbursements' purple) instead of a hardcoded hex. */
export function hexToRgba(hex: string, alpha: number): string {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// ─── Shared HTML snippets for the KD Squares document family ─────────────────
// Used by batch-receipt.ts, payslip.ts, policy-pdf.ts and other HTML-string
// document generators so every printable document shares the same visual DNA.

const R = receiptTheme;

export const docFontImport = `@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');`;

export const docBaseStyles = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { font-family: 'Inter', system-ui, -apple-system, 'Segoe UI', sans-serif; }
  body { color: ${R.bodyText}; background: #f0f2f5; -webkit-font-smoothing: antialiased; }
  .tabular { font-variant-numeric: tabular-nums; letter-spacing: -0.005em; }
  .mono { font-family: ui-monospace, 'SF Mono', 'Cascadia Code', monospace; }
`;

export function docDotDivider(color = R.brand): string {
  return `<div style="display:flex;align-items:center;gap:6px;margin:0;">
    <span style="width:5px;height:5px;border-radius:50%;background:${color};flex-shrink:0;"></span>
    <span style="flex:1;height:1.5px;background:${color};"></span>
    <span style="width:5px;height:5px;border-radius:50%;background:${color};flex-shrink:0;"></span>
  </div>`;
}

export function docWaveFlourish(color = R.brand): string {
  return `<svg viewBox="0 0 600 24" preserveAspectRatio="none" style="width:100%;height:24px;display:block;">
    <path d="M0 12 Q75 0 150 12 T300 12 T450 12 T600 12 V24 H0 Z" fill="${color}" opacity="0.07"/>
    <path d="M0 16 Q75 6 150 16 T300 16 T450 16 T600 16" fill="none" stroke="${color}" stroke-width="0.8" opacity="0.2"/>
  </svg>`;
}

export function docVerificationStamp(label: string, refId: string, color = R.gold): string {
  return `<div style="display:flex;flex-direction:column;align-items:center;gap:4px;padding:16px 0 8px;">
    <div style="width:68px;height:68px;border-radius:50%;border:2px dashed ${color};display:flex;align-items:center;justify-content:center;transform:rotate(-13deg);">
      <div style="text-align:center;">
        <div style="font-size:7px;font-weight:800;letter-spacing:0.12em;text-transform:uppercase;color:${color};">${label}</div>
        <div style="font-size:6px;color:${R.mutedLight};margin-top:1px;">KD OPS</div>
      </div>
    </div>
    <div style="font-family:ui-monospace,'SF Mono',monospace;font-size:8px;color:${R.mutedLight};">${refId}</div>
  </div>`;
}

export function docSignatureLine(): string {
  return `<div style="padding:12px 0 4px;display:flex;justify-content:flex-end;">
    <div style="text-align:center;">
      <div style="width:160px;border-bottom:1px solid ${R.border};margin-bottom:4px;"></div>
      <div style="font-size:9px;color:${R.mutedLight};font-style:italic;">Authorised Signatory</div>
    </div>
  </div>`;
}

export function docMastheadStyle(color = R.brand): string {
  return `
    .doc-masthead {
      background: linear-gradient(135deg, ${color} 0%, ${hexToRgba(color, 0.85)} 100%);
      padding: 32px 40px 28px;
      position: relative;
      overflow: hidden;
      color: #fff;
    }
    .doc-masthead::after {
      content: '';
      position: absolute; inset: 0;
      background-image: radial-gradient(circle, rgba(255,255,255,0.12) 1px, transparent 1px);
      background-size: 20px 20px;
      pointer-events: none;
    }
    .doc-masthead .doc-title {
      font-size: 32px;
      font-weight: 900;
      letter-spacing: -0.02em;
      text-transform: uppercase;
      line-height: 1;
    }
    .doc-masthead .doc-subtitle {
      font-size: 12px;
      color: rgba(255,255,255,0.6);
      margin-top: 6px;
      letter-spacing: 0.04em;
    }
  `;
}

export const docTableStyles = `
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  thead th {
    padding: 10px 12px; text-align: left;
    font-size: 9px; font-weight: 700; text-transform: uppercase;
    letter-spacing: 0.1em; color: ${R.muted};
    border-bottom: 2px solid ${R.brand};
    background: ${R.panelBg};
  }
  thead th.right { text-align: right; }
  tbody td {
    padding: 10px 12px;
    border-bottom: 1px solid #f0f2f3;
    color: ${R.bodyText};
  }
  tbody tr:last-child td { border-bottom: none; }
  tbody td.right { text-align: right; }
  tbody td.right.tabular { font-weight: 500; }
  tbody tr.total td {
    font-weight: 700;
    border-top: 2px solid ${R.brand};
    border-bottom: none;
    padding-top: 12px;
  }
`;

export const docFooterStyles = `
  .doc-footer {
    border-top: 1px solid ${R.border};
    padding: 14px 40px;
    display: flex; align-items: center; justify-content: space-between;
    gap: 12px; flex-wrap: wrap;
    font-size: 10px; color: ${R.mutedLight};
  }
  .doc-confidential {
    display: inline-flex; align-items: center; gap: 4px;
    padding: 2px 8px;
    border: 1px solid ${R.gold};
    font-size: 9px; font-weight: 700; text-transform: uppercase;
    letter-spacing: 0.08em; color: ${R.gold};
  }
`;

export const docPrintStyles = `
  @media print {
    body { background: #fff; padding: 0; }
    .page { margin: 0; border: none; box-shadow: none; max-width: none; }
    .doc-masthead { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    @page { size: A4; margin: 12mm; }
  }
`;
