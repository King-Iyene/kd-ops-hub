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
