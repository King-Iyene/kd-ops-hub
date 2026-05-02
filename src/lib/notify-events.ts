// Event-driven email helpers
//
// Thin wrappers over sendTemplatedEmail() for the common business events.
// Each helper:
//   1. Resolves the recipient email(s).
//   2. Renders a templated email via the send-email edge fn (channel='templated').
//   3. Swallows failures — these are best-effort. Email outage must NEVER
//      block the underlying business action (approve, pay, etc.).
//
// Usage:
//   await notifyRequestApproved({ requesterEmail, requesterName, kind: 'leave request', summary, approverName, link });
//
// New event? Add a template in email_templates (or seed in a migration), then
// add a helper here calling sendTemplatedEmail with that key.

import { sendTemplatedEmail } from '@/lib/email-templates';
import { supabase } from '@/lib/supabase';

const swallow = (where: string) => (err: unknown) => {
  // eslint-disable-next-line no-console
  console.warn(`[notify-events:${where}] swallowed`, err);
};

export async function notifyRequestApproved(args: {
  requesterEmail: string | null | undefined;
  requesterName: string;
  kind: string;
  summary: string;
  approverName: string;
  note?: string;
  link?: string;
}): Promise<void> {
  if (!args.requesterEmail) return;
  await sendTemplatedEmail({
    templateKey: 'request.approved',
    to: args.requesterEmail,
    vars: {
      requester_name: args.requesterName,
      kind: args.kind,
      summary: args.summary,
      approver_name: args.approverName,
      note: args.note ?? '',
      link: args.link ?? window.location.origin,
    },
  }).catch(swallow('request.approved'));
}

export async function notifyRequestRejected(args: {
  requesterEmail: string | null | undefined;
  requesterName: string;
  kind: string;
  summary: string;
  approverName: string;
  reason: string;
  link?: string;
}): Promise<void> {
  if (!args.requesterEmail) return;
  await sendTemplatedEmail({
    templateKey: 'request.rejected',
    to: args.requesterEmail,
    vars: {
      requester_name: args.requesterName,
      kind: args.kind,
      summary: args.summary,
      approver_name: args.approverName,
      reason: args.reason,
      link: args.link ?? window.location.origin,
    },
  }).catch(swallow('request.rejected'));
}

export async function notifyAnomalyToAdmins(args: {
  title: string;
  summary: string;
  severity: 'low' | 'medium' | 'high';
  link?: string;
}): Promise<void> {
  const { data: admins } = await supabase
    .from('profiles')
    .select('email')
    .in('role', ['super_admin', 'admin'])
    .eq('status', 'active');
  const emails = ((admins ?? []) as { email: string | null }[])
    .map((a) => a.email)
    .filter((e): e is string => !!e);
  if (emails.length === 0) return;
  await Promise.all(
    emails.map((to) =>
      sendTemplatedEmail({
        templateKey: 'anomaly.alert',
        to,
        vars: {
          title: args.title,
          summary: args.summary,
          severity: args.severity,
          detected_at: new Date().toLocaleString(),
          link: args.link ?? window.location.origin,
        },
      }).catch(swallow('anomaly.alert')),
    ),
  );
}

export async function notifySalaryProcessed(args: {
  employeeEmail: string | null | undefined;
  employeeName: string;
  period: string;
  netAmountFormatted: string;
  accountLast4: string;
}): Promise<void> {
  if (!args.employeeEmail) return;
  const { data: cs } = await supabase
    .from('company_settings')
    .select('company_name')
    .eq('id', '00000000-0000-0000-0000-000000000001')
    .maybeSingle();
  await sendTemplatedEmail({
    templateKey: 'salary.processed',
    to: args.employeeEmail,
    vars: {
      employee_name: args.employeeName,
      period: args.period,
      net_amount: args.netAmountFormatted,
      account_last4: args.accountLast4,
      company_name: (cs as any)?.company_name ?? 'KD Squares',
    },
  }).catch(swallow('salary.processed'));
}
