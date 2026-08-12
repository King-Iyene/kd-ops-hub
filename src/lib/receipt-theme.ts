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
