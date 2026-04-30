/**
 * Notification message templates — the SHORT, plain-text strings that go
 * out to employees over WhatsApp / SMS via Termii.
 *
 * Design rules:
 *   - Each template is a tiny pure function. No DB lookups, no async.
 *   - Subject (for email) is short. Body is < 280 chars so it stays in one
 *     SMS segment (160 chars for GSM-7, 70 for UCS-2 — we play safe with 280
 *     for two segments and stop there).
 *   - Always start the message with the recipient's first name and the
 *     KD Squares brand so it's clear at a glance even if truncated.
 *   - No links unless the platform has a public URL set; SMS providers
 *     downgrade trust scores on shortened links.
 */

import { formatNaira } from '@/lib/format';

export type NotificationTemplateKind =
  | 'payslip_ready'
  | 'ewa_approved'
  | 'ewa_rejected'
  | 'ewa_settled'
  | 'payment_received'
  | 'payment_failed'
  | 'leave_approved'
  | 'leave_rejected'
  | 'compliance_due_soon'
  | 'batch_approval_pending';

export interface RenderedTemplate {
  /** Short title for in-app + email subject. */
  title: string;
  /** Plain-text body (≤ 280 chars) for SMS, WhatsApp, and email plaintext. */
  body: string;
  /** Optional rich HTML for email. Falls back to plain-text body if absent. */
  html?: string;
}

/** Pull the first name out of a full name; fall back to the whole string. */
function firstName(name?: string | null): string {
  if (!name) return 'there';
  const parts = String(name).trim().split(/\s+/);
  return parts[0] || 'there';
}

/** Trim a string to maxLen with an ellipsis if it would overflow. */
function clamp(s: string, maxLen = 280): string {
  if (s.length <= maxLen) return s;
  return s.slice(0, maxLen - 1).trimEnd() + '…';
}

// ---------------------------------------------------------------------------
// Template registry
// ---------------------------------------------------------------------------

export const NOTIFICATION_TEMPLATES = {
  payslip_ready: (p: { name?: string; period: string; net_ngn: number; url?: string }): RenderedTemplate => {
    const fn = firstName(p.name);
    const tail = p.url ? ` View: ${p.url}` : '';
    return {
      title: `Payslip ready — ${p.period}`,
      body: clamp(`Hi ${fn}, your KD Squares ${p.period} payslip is ready. Net pay: ${formatNaira(p.net_ngn)}.${tail}`),
    };
  },

  ewa_approved: (p: { name?: string; amount_ngn: number; settlement_period: string }): RenderedTemplate => {
    const fn = firstName(p.name);
    return {
      title: 'Earned Wage Access approved',
      body: clamp(
        `Hi ${fn}, your ${formatNaira(p.amount_ngn)} earned-wage advance is approved. ` +
        `It will be repaid from your ${p.settlement_period} payslip. — KD Squares`,
      ),
    };
  },

  ewa_rejected: (p: { name?: string; amount_ngn: number; reason: string }): RenderedTemplate => {
    const fn = firstName(p.name);
    return {
      title: 'Earned Wage Access declined',
      body: clamp(
        `Hi ${fn}, your ${formatNaira(p.amount_ngn)} earned-wage request was declined. ` +
        `Reason: ${p.reason}. — KD Squares`,
      ),
    };
  },

  ewa_settled: (p: { name?: string; amount_ngn: number; period: string }): RenderedTemplate => {
    const fn = firstName(p.name);
    return {
      title: 'Earned Wage Access settled',
      body: clamp(
        `Hi ${fn}, ${formatNaira(p.amount_ngn)} earned-wage was deducted from your ${p.period} payslip. — KD Squares`,
      ),
    };
  },

  payment_received: (p: { name?: string; amount_ngn: number; reference: string; bank?: string }): RenderedTemplate => {
    const fn = firstName(p.name);
    const bankBit = p.bank ? ` to ${p.bank}` : '';
    return {
      title: 'Payment sent',
      body: clamp(
        `Hi ${fn}, ${formatNaira(p.amount_ngn)}${bankBit} from KD Squares. Ref: ${p.reference}`,
      ),
    };
  },

  payment_failed: (p: { name?: string; amount_ngn: number; reason: string }): RenderedTemplate => {
    const fn = firstName(p.name);
    return {
      title: 'Payment did not go through',
      body: clamp(
        `Hi ${fn}, your ${formatNaira(p.amount_ngn)} transfer from KD Squares did not go through. ` +
        `Reason: ${p.reason}. We are looking into it.`,
      ),
    };
  },

  leave_approved: (p: { name?: string; days: number; start_date: string; end_date: string }): RenderedTemplate => {
    const fn = firstName(p.name);
    return {
      title: 'Leave approved',
      body: clamp(
        `Hi ${fn}, your ${p.days}-day leave from ${p.start_date} to ${p.end_date} is approved. — KD Squares`,
      ),
    };
  },

  leave_rejected: (p: { name?: string; reason: string }): RenderedTemplate => {
    const fn = firstName(p.name);
    return {
      title: 'Leave request declined',
      body: clamp(`Hi ${fn}, your leave request was declined. Reason: ${p.reason}. — KD Squares`),
    };
  },

  compliance_due_soon: (p: { kind: string; period: string; due_date: string; amount_ngn?: number }): RenderedTemplate => {
    const amt = p.amount_ngn ? ` (${formatNaira(p.amount_ngn)})` : '';
    return {
      title: `${p.kind.toUpperCase()} due ${p.due_date}`,
      body: clamp(`Reminder: ${p.kind.toUpperCase()} ${p.period}${amt} is due by ${p.due_date}. — KD Squares Compliance`),
    };
  },

  batch_approval_pending: (p: { batch_name: string; total_ngn: number }): RenderedTemplate => {
    return {
      title: `Approval needed: ${p.batch_name}`,
      body: clamp(
        `KD Squares: ${p.batch_name} (${formatNaira(p.total_ngn)}) is awaiting your approval.`,
      ),
    };
  },
} as const;

export type NotificationPayloadOf<K extends NotificationTemplateKind> =
  Parameters<typeof NOTIFICATION_TEMPLATES[K]>[0];

/** Render a template by kind. Throws if the kind is unknown. */
export function renderTemplate<K extends NotificationTemplateKind>(
  kind: K,
  payload: NotificationPayloadOf<K>,
): RenderedTemplate {
  const fn = NOTIFICATION_TEMPLATES[kind];
  if (!fn) throw new Error(`Unknown notification template: ${kind}`);
  return (fn as any)(payload);
}
