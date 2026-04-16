import { supabase } from '@/lib/supabase';
import { logAudit, type AuditActionType } from '@/lib/audit';
import type { Profile } from '@/store/authStore';
import { formatNaira } from '@/lib/format';

/**
 * Record a rejection for any approvable entity.
 *
 * - Persists `rejection_reason` on the target row (the entity table is caller's
 *   responsibility — we just build the notification + audit trail).
 * - Writes an in-app notification to the submitter so they see "Your X was
 *   rejected" in the bell dropdown, with the reason body.
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
    try {
      await supabase.from('notifications').insert({
        user_id: opts.submitterId,
        type: `${opts.entity}_rejected`,
        module: opts.entity,
        priority: 'high',
        title: `Your ${opts.entityLabel} was rejected`,
        body: opts.amount
          ? `${formatNaira(opts.amount)} · ${opts.reason}`
          : opts.reason,
      });
    } catch {
      // best-effort
    }
  }
  await logAudit(opts.auditType, opts.auditDescription, opts.actor);
}

/** Basic guard — trims and enforces a non-empty, meaningful reason. */
export const isValidRejectionReason = (s: string): boolean =>
  s.trim().length >= 3;
