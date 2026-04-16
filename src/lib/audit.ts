import { supabase } from '@/lib/supabase';

export type AuditActionType =
  | 'batch_created'
  | 'batch_submitted'
  | 'batch_approved'
  | 'batch_rejected'
  | 'batch_funded'
  | 'batch_processed'
  | 'contractor_added'
  | 'contractor_edited'
  | 'contractor_deactivated'
  | 'fuel_request_submitted'
  | 'fuel_request_approved'
  | 'fuel_request_rejected'
  | 'trip_log_submitted'
  | 'expense_submitted'
  | 'expense_approved'
  | 'expense_rejected'
  | 'employee_added'
  | 'employee_edited'
  | 'employee_deactivated'
  | 'subscription_added'
  | 'subscription_edited'
  | 'subscription_cancelled'
  | 'subscription_renewed'
  | 'budget_created'
  | 'budget_submitted'
  | 'budget_approved'
  | 'budget_rejected'
  | 'budget_edited'
  | 'document_uploaded'
  | 'document_deleted'
  | 'document_edited'
  | 'bulk_approved'
  | 'profile_updated'
  | 'profile_password_changed'
  | 'profile_viewed_as';

export interface AuditActor {
  id?: string | null;
  full_name?: string | null;
  email?: string | null;
}

/**
 * Write a row to the audit_logs table. Never throws — logs failures to the
 * console so that operational actions are not blocked by audit logging errors.
 */
export async function logAudit(
  actionType: AuditActionType,
  description: string,
  actor?: AuditActor | null
): Promise<void> {
  try {
    const performedBy = actor?.id ?? null;
    const performedByName =
      actor?.full_name && actor.full_name.trim()
        ? actor.full_name
        : actor?.email ?? null;

    const { error } = await supabase.from('audit_logs').insert({
      action_type: actionType,
      description,
      performed_by: performedBy,
      performed_by_name: performedByName,
    });

    if (error) {
      console.warn('[KDOps] audit log insert failed:', error.message);
    }
  } catch (err) {
    console.warn('[KDOps] audit log exception:', err);
  }
}
