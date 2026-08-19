import { logAudit, type AuditActionType } from '@/lib/audit';
import type { Profile } from '@/store/authStore';
import { formatNaira } from '@/lib/format';
import { notifyApprovalDecision } from '@/lib/approval-notify';

/**
 * Record a rejection for any approvable entity.
 *
 * - Persists `rejection_reason` on the target row (the entity table is caller's
 *   responsibility — we just build the notification + audit trail).
 * - Sends the submitter an in-app notification **and** a branded email via
 *   {@link notifyApprovalDecision} so rejections are never missed.
 * - Writes an audit entry with the rejection reason.
 */
export async function writeRejectionNotification(opts: {
  entity: 'batch' | 'expense' | 'fuel' | 'budget' | 'leave';
  entityLabel: string;
  amount?: number | null;
  reason: string;
  submitterId: string | null;
  actor: Profile | null | undefined;
  auditType: AuditActionType;
  auditDescription: string;
}): Promise<void> {
  if (opts.submitterId) {
    // Unified in-app + email — delegates to the approval-decision notifier so
    // every rejection gets the same branded email that approvals already use.
    await notifyApprovalDecision({
      userId: opts.submitterId,
      decision: 'rejected',
      entity: opts.entity,
      entityLabel: opts.amount
        ? `${opts.entityLabel} — ${formatNaira(opts.amount)}`
        : opts.entityLabel,
      reason: opts.reason,
      module: opts.entity,
    });
  }
  await logAudit(opts.auditType, opts.auditDescription, opts.actor);
}

/** Basic guard — trims and enforces a non-empty, meaningful reason (min 10 chars). */
export const isValidRejectionReason = (s: string): boolean =>
  s.trim().length >= 10;
