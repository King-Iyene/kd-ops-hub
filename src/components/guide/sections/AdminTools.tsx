// Admin Tools — the platform-level modules that only super admins and
// admins interact with directly: the audit log, approval workflow
// configuration, system settings, and the principal disbursement
// wallet. These are the levers that control how everything else in
// KDOps behaves — who can approve what, what gets logged, and how
// money moves at the company level.
import { ShieldCheck } from 'lucide-react';
import { SectionIntro, ModuleCard, StepList, Callout } from '@/components/guide/shared';

export function AdminToolsSection() {
  return (
    <div className="space-y-6">
      <SectionIntro
        icon={ShieldCheck}
        title="Admin Tools"
        blurb="Platform-level controls that govern how KDOps behaves: what gets logged, who approves what, how the system is configured, and how company-level money moves. These modules are restricted to super admins (and admins where noted) because a misconfiguration here affects everyone."
      />

      <ModuleCard title="Audit Log" route="/audit" roles={['super_admin', 'admin']}>
        <p className="text-sm text-muted-foreground leading-relaxed">
          A tamper-proof, chronological record of every action taken on the platform — payments approved,
          employee records changed, settings updated, logins, role changes, and everything in between. Every
          entry is automatically hash-chained to the previous one, so a deleted or altered record would break
          the chain and be immediately detectable. This is not a feature you configure; it runs silently behind
          every action in KDOps.
        </p>
        <StepList
          steps={[
            'Open Audit Log from the sidebar — the default view shows the most recent activity across the entire platform.',
            'Use the filters at the top to narrow by action type (e.g. "payment.approved", "employee.updated"), by the user who performed the action, or by a date range.',
            'Click any row to expand the full detail: what changed (before and after values), the IP address, timestamp, and the hash-chain reference.',
            'Click Export CSV to download the filtered view — useful for external auditors or compliance reviews who need the raw data in a spreadsheet.',
          ]}
        />
        <Callout tone="tip">
          The audit log is append-only — nobody, including super admins, can edit or delete entries. If an
          auditor asks for proof that records haven't been tampered with, the hash chain is the answer: each
          entry's hash includes the previous entry's hash, so any gap or alteration breaks the sequence.
        </Callout>
      </ModuleCard>

      <ModuleCard title="Approval Workflows" route="/approval-workflows" roles={['super_admin', 'admin']}>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Configure multi-step approval chains that control how payments, expenses, leave requests, and other
          operations move from submission to execution. Instead of relying on people to remember who needs to
          sign off on what, the workflow engine routes each request automatically based on the rules you set here.
        </p>
        <StepList
          steps={[
            'Open Approval Workflows and select the operation type you want to configure — Payments, Expenses, Leave, or others.',
            'Set the first approver requirement: choose a specific role, a named user, or the submitter\'s direct manager.',
            'Add a second approver step if needed — this is where you set the threshold (e.g. "require a second approver for any payment batch above NGN 500,000").',
            'Configure threshold-based routing: different approval chains can apply at different amounts, so a NGN 50,000 expense might need only a manager while a NGN 2,000,000 one routes to the CFO.',
            'Enable step-up authentication for high-value transactions — when turned on, the approver must re-enter their password or complete an MFA challenge at the moment of approval, even if they are already logged in.',
          ]}
        />
        <Callout tone="warn">
          Approval workflows are enforced by the system, not by convention. Once a workflow is active for an
          operation type, there is no way to bypass it — the submit or approve button is simply unavailable
          until every required step is satisfied. Test new workflows with a low-value transaction before applying
          them to production payment batches.
        </Callout>
      </ModuleCard>

      <ModuleCard title="Settings" route="/settings" roles={['super_admin']}>
        <p className="text-sm text-muted-foreground leading-relaxed">
          The central configuration page for the entire platform — company identity, integrations, security
          policies, and notification behavior. Changes here affect every user immediately, so this page is
          restricted to super admins only.
        </p>
        <StepList
          steps={[
            <>
              <strong>Branding</strong> — upload your company logo, set the company name, and configure the
              colour scheme that appears across the platform and in outward-facing documents like payslips
              and invoices.
            </>,
            <>
              <strong>Paystack Integration</strong> — enter your Paystack secret key and public key to connect
              KDOps to your Paystack account for real bank transfers. The connection is tested live when you
              save — if the keys are wrong, the save fails with an error rather than silently accepting bad
              credentials.
            </>,
            <>
              <strong>Notification Preferences</strong> — control which events trigger email and in-app
              notifications: payment approvals, expense submissions, leave requests, system alerts. Each
              notification type can be toggled independently, and you can set company-wide defaults that
              individual users can then narrow (but not widen) from their own profile.
            </>,
            <>
              <strong>Security Policies</strong> — enforce MFA for all users or specific roles, set session
              timeout duration (how long an idle session stays active before requiring re-login), configure
              password complexity requirements, and set the transfer cap (the maximum single-transfer amount
              the platform will process without a second approver).
            </>,
            <>
              <strong>System Configuration</strong> — set the company's fiscal year start, default currency,
              payroll schedule, and other operational defaults that downstream modules (Payroll, Budgets,
              Compliance) reference.
            </>,
          ]}
        />
        <Callout tone="caution">
          Changing the Paystack keys while payment batches are in progress will cause those batches to fail —
          the new keys will not match the session that initiated the transfers. Complete or cancel all pending
          batches before rotating keys.
        </Callout>
      </ModuleCard>

      <ModuleCard title="Principal Disbursements" route="/principal-disbursements" roles={['super_admin']}>
        <p className="text-sm text-muted-foreground leading-relaxed">
          A dedicated module for company-level money movement — personal transfers by the principal (company
          owner) and company disbursements that fall outside the normal payment-batch workflow. Everything here
          runs through Paystack and carries its own full audit trail, separate from the regular Payments module.
        </p>

        <p className="text-sm text-muted-foreground leading-relaxed font-medium">
          Wallet & Dedicated Virtual Account (DVA)
        </p>
        <p className="text-sm text-muted-foreground leading-relaxed">
          The module centres on a <strong>wallet</strong> with a dedicated virtual account number (DVA) issued
          by Paystack. To fund the wallet, transfer money from any bank account to the DVA — the funds appear
          in the wallet balance once the transfer settles, typically within minutes. All disbursements draw
          from this wallet balance, not directly from a bank account, so you always know exactly how much is
          available before you send.
        </p>

        <StepList
          steps={[
            'Open Principal Disbursements — the wallet balance and DVA details are shown at the top of the page. Fund the wallet by transferring to the DVA from your bank.',
            <>
              <strong>Beneficiary Management</strong> — add and save beneficiaries (name, bank, account number)
              so you don't re-enter details for repeat transfers. Account numbers are verified live against the
              receiving bank, just like in Payments.
            </>,
            <>
              <strong>Single Transfer</strong> — select a saved beneficiary (or add a new one), enter the amount
              and a reference note, and submit. The transfer is processed immediately from the wallet balance.
            </>,
            <>
              <strong>Batch Transfers</strong> — select multiple beneficiaries, set individual amounts for each,
              and submit the batch as a single operation. Useful for monthly distributions or multi-party payments
              that the principal handles directly.
            </>,
            <>
              <strong>Recurring Payments</strong> — set up a transfer to repeat on a schedule (weekly, monthly,
              or custom). The system draws from the wallet balance on each scheduled date — if the balance is
              insufficient, the payment fails and you are notified rather than the system silently skipping it.
            </>,
          ]}
        />
        <Callout tone="warn">
          The wallet balance is real money held at Paystack, not a ledger entry. A transfer out of the wallet is
          irreversible once it succeeds — treat the "confirm transfer" step the same way you would treat
          confirming a bank transfer, because that is exactly what it is. Every disbursement, whether single,
          batch, or recurring, is recorded in the audit trail with the initiator, amount, recipient, timestamp,
          and Paystack reference.
        </Callout>
      </ModuleCard>
    </div>
  );
}
