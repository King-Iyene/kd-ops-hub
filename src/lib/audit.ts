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
  | 'profile_viewed_as'
  | 'batch_scheduled'
  | 'director_disbursement_sent'
  | 'director_disbursement_list_viewed'
  | 'director_disbursement_viewed'
  | 'personal_transfer_sent'
  | 'personal_transfer_list_viewed'
  | 'personal_transfer_viewed'
  | 'batch_item_retried'
  | 'batch_receipt_downloaded'
  | 'budget_locked'
  | 'budget_unlocked'
  | 'leave_requested'
  | 'leave_approved'
  | 'leave_rejected'
  | 'leave_cancelled'
  | 'task_created'
  | 'task_updated'
  | 'task_completed'
  | 'task_commented'
  | 'project_created'
  | 'project_updated'
  | 'project_deleted'
  | 'space_created'
  | 'space_updated'
  | 'space_deleted'
  | 'compliance_filed'
  | 'compliance_marked_overdue'
  | 'payroll_created'
  | 'payroll_submitted'
  | 'payroll_approved'
  | 'payroll_paid'
  | 'announcement_posted'
  | 'announcement_removed'
  | 'approval_comment'
  | 'invite_sent'
  | 'invite_revoked'
  | 'company_settings_updated'
  | 'role_changed'
  | 'knowledge_article_created'
  | 'knowledge_article_updated'
  | 'knowledge_article_deleted'
  | 'virtual_card_created'
  | 'virtual_card_updated'
  | 'virtual_card_deactivated'
  | 'goal_created'
  | 'goal_updated'
  | 'goal_completed'
  | 'employee_invite_resent'
  | 'notification_prefs_updated'
  | 'audit_log_exported'
  | 'paystack_recipient_created'
  | 'paystack_transfer_initiated'
  | 'paystack_transfer_succeeded'
  | 'paystack_transfer_failed'
  | 'paystack_transfer_retried'
  | 'payslip_generated'
  | 'payslip_downloaded'
  | 'bank_statement_uploaded'
  | 'bank_reconciliation_matched'
  | 'resubmission_created'
  | 'company_settings_saved'
  | 'report_exported'
  | 'deduction_created'
  | 'deduction_applied'
  | 'user_logged_in'
  | 'user_logged_out'
  | 'paystack_reconciliation_run'
  | 'expense_first_approval'
  | 'expense_deleted'
  | 'budget_deleted'
  | 'leave_deleted'
  | 'fuel_request_deleted'
  | 'client_created'
  | 'client_updated'
  | 'client_deleted'
  | 'data_retention_action'
  | 'platform_export';

export interface AuditActor {
  id?: string | null;
  full_name?: string | null;
  email?: string | null;
}

/**
 * Write a row to the audit_logs table via the `log_audit` SECURITY DEFINER RPC.
 *
 * The RPC enforces `performed_by = auth.uid()` server-side — any client-supplied
 * actor is ignored. This closes H-4 (audit_logs INSERT spoofing). The legacy
 * `actor` parameter is retained for source-compat with existing call sites but
 * is no longer trusted by the database.
 */
export async function logAudit(
  actionType: AuditActionType,
  description: string,
  actor?: AuditActor | null,
  metadata?: Record<string, unknown>
): Promise<void> {
  void actor;
  try {
    const { error } = await supabase.rpc('log_audit', {
      p_action_type: actionType,
      p_description: description,
      p_metadata: metadata ?? {},
    });
    if (error) {
      console.warn('[KDOps] log_audit RPC failed:', error.message);
    }
  } catch (err) {
    console.warn('[KDOps] audit log exception:', err);
  }
}
