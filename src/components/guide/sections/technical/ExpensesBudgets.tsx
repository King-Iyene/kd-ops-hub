import { RefTable, RefSection } from '@/components/guide/shared';
import { CheckCircle2, Receipt, Database } from 'lucide-react';

export function TechExpensesSection() {
  return (
    <>
      <h2 className="text-xl font-semibold mb-1">Expenses & Budgets</h2>
      <RefSection icon={CheckCircle2} title="Approval flow">
        <RefTable
          cols={['Rule', 'Detail']}
          rows={[
            { a: 'Single approval',         b: 'Expenses below the dual-approval threshold need one approver (admin / finance)' },
            { a: 'Dual approval',           b: 'Expenses at or above the threshold in Settings require two separate approvers' },
            { a: 'Dual threshold',          b: 'Configurable in Settings → Expense Limits (0 = dual approval disabled)' },
            { a: 'Self-approval — non-admin', b: 'Staff / finance / operations cannot approve their own expenses' },
            { a: 'Self-approval — admin',   b: 'super_admin and admin roles CAN first-approve their own expenses (exception)' },
            { a: 'Second approver',         b: 'Must be a different person from the first approver — enforced in code' },
            { a: 'Bulk approve',            b: 'Admin / finance only — each item gets its own audit log entry' },
            { a: 'Rejection reason',        b: 'Mandatory for all rejections — minimum 10 characters' },
          ]}
        />
      </RefSection>

      <RefSection icon={Receipt} title="Expense submission rules">
        <RefTable
          cols={['Rule', 'Detail']}
          rows={[
            { a: 'Maximum single expense',    b: '₦100,000,000 (CHECK constraint in DB)' },
            { a: 'Receipt upload size cap',   b: '10 MB per file' },
            { a: 'Receipt compression',       b: 'Images auto-compressed to 1600 px JPEG @ 82% on upload' },
            { a: 'Resubmission',              b: 'Rejected expenses can be edited and resubmitted — creates audit trail' },
            { a: 'Fuel-linked expenses',      b: 'Approving a fuel request auto-creates / updates a linked expense row' },
          ]}
        />
      </RefSection>

      <RefSection icon={Database} title="Data & query limits (Expenses)">
        <RefTable
          cols={['Setting', 'Value']}
          rows={[
            { a: 'Soft delete',               b: 'Deleting an expense sets deleted_at — row stays in DB for audit trail' },
            { a: 'Deleted row visibility',    b: 'Hidden from all UI queries; visible in Supabase dashboard for recovery' },
            { a: 'Approvals page limit',      b: '200 pending expenses fetched at once' },
            { a: 'Dashboard spend-calc limit', b: '2,000 approved expenses (for budget KPIs)' },
            { a: 'Budgets spend-calc limit',  b: '2,000 approved expenses' },
          ]}
        />
      </RefSection>
    </>
  );
}
