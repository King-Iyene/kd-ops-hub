// Approval-decision notifications
//
// Single helper that fires both an in-app notification *and* an email to the
// submitter the moment an approval / rejection happens. Best-effort — failures
// never block the originating action.
//
// Why a dedicated helper rather than inline calls:
//   - Approval decisions are the highest-signal events in the platform; they
//     warrant email (in-app alone is too easy to miss).
//   - Centralising the email shell keeps the look consistent across modules
//     (expenses, leave, payments, payroll) without each call-site rebuilding
//     it.
//
// Channels:
//   - In-app: always written via notifyUser().
//   - Email:  sent via the send-email edge function with channel='email' if
//             the recipient profile has an email address on file.

import { supabase } from '@/lib/supabase';
import { notifyUser } from '@/lib/notify';

export interface ApprovalNotifyOpts {
  /** profile.id of the recipient (the submitter, not the approver). */
  userId: string;
  /** Decision label — drives subject + accent colour. */
  decision: 'approved' | 'rejected';
  /** What was approved/rejected: 'expense', 'leave', 'payment', etc. */
  entity: string;
  /** Short human label for the entity, e.g. "Fuel — ₦12,500.00". */
  entityLabel: string;
  /** Optional rejection reason — included in body when present. */
  reason?: string;
  /** Optional deep-link path to view the entity in the app. */
  link?: string;
  /** Hint for the in-app row — usually 'expenses', 'leave', 'payments'. */
  module?: string;
}

const ACCENT: Record<ApprovalNotifyOpts['decision'], string> = {
  approved: '#16a34a',
  rejected: '#dc2626',
};

/** Plain-text fallback for email clients that strip HTML. */
function plainBody(opts: ApprovalNotifyOpts, recipientName: string): string {
  const verb = opts.decision === 'approved' ? 'approved' : 'rejected';
  const lines = [
    `Hi ${recipientName},`,
    '',
    `Your ${opts.entity} (${opts.entityLabel}) has been ${verb}.`,
  ];
  if (opts.reason) lines.push('', `Reason: ${opts.reason}`);
  lines.push('', '— KD Squares');
  return lines.join('\n');
}

/** Branded HTML email shell — clean, brand-coloured accent strip. */
function htmlBody(opts: ApprovalNotifyOpts, recipientName: string): string {
  const accent = ACCENT[opts.decision];
  const verb = opts.decision === 'approved' ? 'approved' : 'rejected';
  const reasonBlock = opts.reason
    ? `<tr><td style="padding:14px 0 0;border-top:1px solid #eef2f6;color:#525252;font-size:13px;line-height:1.6"><strong style="color:#111">Reason:</strong> ${escapeHtml(opts.reason)}</td></tr>`
    : '';
  return `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-family:-apple-system,Segoe UI,Inter,sans-serif">
    <tr><td style="height:4px;background:${accent}"></td></tr>
    <tr><td style="padding:28px 0 8px"><h1 style="font-size:18px;font-weight:700;color:#111;margin:0">Your ${escapeHtml(opts.entity)} was ${verb}</h1></td></tr>
    <tr><td style="padding:0 0 18px"><p style="margin:0;font-size:14px;color:#525252;line-height:1.6">Hi ${escapeHtml(recipientName)},</p></td></tr>
    <tr><td style="padding:0 0 16px"><p style="margin:0;font-size:14px;color:#111;line-height:1.6"><strong>${escapeHtml(opts.entityLabel)}</strong></p></td></tr>
    ${reasonBlock}
  </table>`;
}

function escapeHtml(s: string): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Notify a submitter of an approval / rejection across in-app + email.
 * Never throws.
 */
export async function notifyApprovalDecision(opts: ApprovalNotifyOpts): Promise<void> {
  const verb = opts.decision === 'approved' ? 'approved' : 'rejected';
  const title = `Your ${opts.entity} was ${verb}`;
  const body = `${opts.entityLabel}${opts.reason ? ` — ${opts.reason}` : ''}`;

  // 1. In-app — always.
  await notifyUser({
    userId: opts.userId,
    type: `${opts.entity}_${opts.decision}`,
    module: opts.module || opts.entity,
    priority: opts.decision === 'rejected' ? 'high' : 'normal',
    title,
    body,
  });

  // 2. Email — best-effort, only if we can resolve an address.
  try {
    const { data: profile } = await supabase
      .from('profiles')
      .select('email, full_name, first_name')
      .eq('id', opts.userId)
      .maybeSingle();
    const email = (profile as any)?.email;
    if (!email) return;
    const recipientName =
      (profile as any)?.first_name ||
      ((profile as any)?.full_name as string | undefined)?.split(/\s+/)[0] ||
      'there';
    await supabase.functions.invoke('send-email', {
      body: {
        channel: 'email',
        to: email,
        subject: title,
        html: htmlBody(opts, recipientName),
        text: plainBody(opts, recipientName),
      },
    });
  } catch {
    // Email is best-effort; in-app row was already written.
  }
}
