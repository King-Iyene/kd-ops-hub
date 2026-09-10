// Finance — the money-movement modules: Payments, Payroll, Invoices,
// Budgets, and everything that reads or reconciles against them. This is
// the part of the guide where accuracy matters most: KDOps sends real
// bank transfers through Paystack/Flutterwave, so every safeguard
// described here (second approver, transfer caps, locks) is a real
// system behavior, not a suggestion.
import { Wallet } from 'lucide-react';
import { SectionIntro, ModuleCard, StepList, Callout, Screenshot, VideoEmbed, guideVideoUrl } from '@/components/guide/shared';

export function FinanceOpsSection() {
  return (
    <div className="space-y-6">
      <SectionIntro
        icon={Wallet}
        title="Finance"
        blurb="This whole section is Finance / Admin / Operations territory, and most of it moves real money — real bank transfers via Paystack and Flutterwave, not simulated ones. Read it more carefully than the rest of this guide: a misunderstanding here can mean money sent to the wrong account, not just a confusing screen."
      />

      <VideoEmbed src={guideVideoUrl('09-PayrollIntelligence.mp4')} title="Payroll Intelligence" caption="Watch: Running payroll, understanding pay groups, reviewing breakdowns, and payroll history" />
      <VideoEmbed src={guideVideoUrl('07-PaymentBatches.mp4')} title="Payment Batches" caption="Watch: Creating payment batches, adding recipients, and the approval workflow" />
      <VideoEmbed src={guideVideoUrl('17-TransactionHistory.mp4')} title="Transaction History" caption="Watch: Viewing all transactions, filtering by date and type, and exporting records" />
      <VideoEmbed src={guideVideoUrl('20-CardsManagement.mp4')} title="Virtual Cards" caption="Watch: Creating virtual cards, setting limits, and tracking card spend" />
      <VideoEmbed src={guideVideoUrl('22-EarnedWages.mp4')} title="Earned Wage Access" caption="Watch: Requesting an advance, approval flow, and how it affects your next payslip" />
      <VideoEmbed src={guideVideoUrl('23-PaymentSchedule.mp4')} title="Payment Schedules" caption="Watch: Setting up recurring payments, managing schedules, and the approval trigger" />
      <VideoEmbed src={guideVideoUrl('24-PayHubOverview.mp4')} title="Pay Hub Overview" caption="Watch: Your unified command centre for payroll, EWA, staff loans, and compliance" />
      <VideoEmbed src={guideVideoUrl('25-StaffLoans.mp4')} title="Staff Loans" caption="Watch: Creating loans, tracking repayments, and how deductions tie into payroll" />
      <VideoEmbed src={guideVideoUrl('10-BudgetsSubscriptions.mp4')} title="Budgets & Subscriptions" caption="Watch: Setting up budgets, tracking spend vs. allocation, and managing recurring subscriptions" />
      <VideoEmbed src={guideVideoUrl('39-FinanceDashboard.mp4')} title="Finance Dashboard" caption="Watch: The finance overview — revenue, expenses, cash flow summary, and key financial metrics" />
      <VideoEmbed src={guideVideoUrl('40-CashflowManagement.mp4')} title="Cashflow Management" caption="Watch: Tracking cash inflows and outflows, forecasting, and managing liquidity" />
      <VideoEmbed src={guideVideoUrl('59-PrincipalDisbursements.mp4')} title="Principal Disbursements" caption="Watch: Managing principal payments, disbursement schedules, and tracking distributions" />
      <VideoEmbed src={guideVideoUrl('76-MultiCurrencyPayments.mp4')} title="Multi-Currency Payments" caption="Watch: Processing payments in multiple currencies, exchange rates, and settlement" />
      <VideoEmbed src={guideVideoUrl('72-TaxCompliance.mp4')} title="Tax Compliance" caption="Watch: Tax calculations, filing deadlines, and compliance reporting" />
      <VideoEmbed src={guideVideoUrl('95-BankReconciliation.mp4')} title="Bank Reconciliation" caption="Watch: Matching bank statements, reconciling transactions, and resolving discrepancies" />
      <VideoEmbed src={guideVideoUrl('87-LoanManagement.mp4')} title="Loan Management" caption="Watch: Setting up loan products, processing applications, and tracking repayments" />
      <VideoEmbed src={guideVideoUrl('90-GratuityModule.mp4')} title="Gratuity Module" caption="Watch: Calculating end-of-service gratuity, eligibility rules, and payment processing" />

      <ModuleCard title="Pay Hub" route="/pay-hub" roles={['super_admin', 'admin', 'finance']}>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Your unified command centre for all payment-related activity. Pay Hub connects Payroll, Earned Wages, Staff Loans, and
          statutory compliance into a single dashboard. Start here to see total payroll cost, pending EWA requests, active loans,
          and compliance deduction totals — then click through to the specific module you need. Find it in the sidebar under{' '}
          <strong>Finance → Money Out → Pay Hub</strong>.
        </p>
      </ModuleCard>

      <ModuleCard title="Payments & Payment Batches" route="/payments" roles={['super_admin', 'admin', 'finance', 'operations']}>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Payments is how KDOps sends money out — to contractors, vendors, and partners — as real bank transfers processed
          underneath by Paystack or Flutterwave. Individual payments are grouped into <strong>batches</strong> so that a large
          run (say, a week's worth of contractor payouts) is reviewed and approved once as a set, rather than one transfer at a time.
        </p>
        <StepList
          steps={['Click New Batch from the Payments page.']}
        />
        <Screenshot src="/guide/batch-1-start.jpg" alt="The Payments page with the New Batch button highlighted" caption="1. Payments → New Batch." />

        <StepList
          startIndex={1}
          steps={['Pick a payment type — Contractor Payment, Employee Salary Run, Salary Advance, or Bonus / Prize — give the batch a name and payment date, then click Next.']}
        />
        <Screenshot src="/guide/batch-2-details.jpg" alt="Step 1 of the New Payment Batch wizard, with the Next button highlighted" caption="2. Choose a type, name the batch, set the date, then Next." />

        <StepList
          startIndex={2}
          steps={['Add recipients from a saved list, or click Add One-off Beneficiary to add someone by hand — a 10-digit account number is verified live against the receiving bank before you can add them.']}
        />
        <Screenshot variant="contain" src="/guide/batch-3-beneficiary.jpg" alt="The Add One-off Beneficiary dialog with the Bank field highlighted" caption="3. Add One-off Beneficiary — the account resolves and verifies live once you pick a bank and enter the number." />

        <StepList
          startIndex={3}
          steps={['Enter or confirm each recipient\'s amount and reference note, review the batch total on the final step, and submit for approval.']}
        />
        <p className="text-sm text-muted-foreground leading-relaxed">
          Batches above a configurable amount require a <strong>second, independent approver</strong> before anything is sent —
          this co-approval threshold and the underlying transfer caps are enforced by the system based on limits set in
          Settings, not a step people are simply trusted to remember. Once a batch is approved, each transfer is tracked live
          as it moves through processing to success or failure, and every completed batch produces a downloadable,
          audit-ready receipt.
        </p>
        <Callout tone="caution">
          A batch cannot be recalled once its transfers have succeeded — the money has left the account. Double-check account
          numbers before submitting. KDOps verifies account names against the receiving bank as a safety check, but that only
          catches a wrong or nonexistent account number; it will not catch a right account with the wrong amount, so always
          eyeball every amount on the batch before you approve it, not just the total.
        </Callout>
      </ModuleCard>

      <VideoEmbed src={guideVideoUrl('07-PaymentBatches.mp4')} title="Payment Batches" caption="Watch: Creating, approving, and processing bulk payments for contractors and employees" />

      <ModuleCard title="Transactions" route="/transactions" roles={['super_admin', 'admin', 'finance', 'operations']}>
        <p className="text-sm text-muted-foreground leading-relaxed">
          The full ledger of every payment, fee, and charge that has actually happened — a read-only history, not a place to
          initiate anything. It is filterable and exportable, and it is the reconciliation source of truth: when you're
          checking KDOps against your actual bank statement at month end, Transactions is what you check it against.
        </p>
      </ModuleCard>

      <ModuleCard title="Payment Schedule" route="/payments/schedule" roles={['super_admin', 'admin', 'finance', 'operations']}>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Set up recurring payments that create draft batches automatically on schedule — rent, insurance, vendor retainers.
          Each scheduled payment still requires approval before money moves, giving you automation with oversight. Pause, edit,
          or delete schedules at any time. Find it in the sidebar under{' '}
          <strong>Finance → Money Out → Payment Schedule</strong>.
        </p>
      </ModuleCard>

      <ModuleCard title="Payroll" route="/payroll" roles={['super_admin', 'admin', 'finance']}>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Runs a full pay cycle — salary, allowances, statutory deductions (PAYE, pension), and outstanding advances — through
          to signed-off payslips, on a schedule configured per pay group.
        </p>
        <StepList
          steps={[
            'A run is created in draft at the start of a cycle, either automatically on schedule or manually.',
            "Review each employee's calculated pay in the draft, adding any one-off adjustments or advances before approval.",
            'Approve the run — this locks the numbers and generates payslips.',
            'Approved runs feed directly into Payments to actually disburse the money.',
          ]}
        />
        <Callout tone="warn">
          A run that is still pending approval can be <strong>recalled to draft</strong> for editing before it's re-submitted —
          that recall is a logged, auditable action. Once a run is approved, however, it cannot be reverted to draft or edited
          in place; a correction at that point means creating a new payroll run with the corrected figures for the same period.
        </Callout>
      </ModuleCard>

      <VideoEmbed src={guideVideoUrl('08-ExpensesApprovals.mp4')} title="Expenses & Approvals" caption="Watch: Submitting expenses, adding payment account details for reimbursement, and the approval flow" />

      <ModuleCard title="Expenses" route="/expenses" roles={['everyone']}>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Anyone in the company can submit an expense claim with a receipt attached. Each claim routes automatically to the
          right approver based on its amount, and claims above a configurable threshold require a <strong>second approval</strong>{' '}
          before they're cleared. Finance and Admin are the roles that actually approve claims. Approved expenses are tied
          into Budgets automatically, so department and project spend stays current without a separate reconciliation step.
        </p>

        <StepList steps={['Open Expenses and click New Expense.']} />
        <Screenshot src="/guide/expense-1-start.jpg" alt="The Expenses page with the New Expense button highlighted" caption="1. Expenses → New Expense." />

        <StepList
          startIndex={1}
          steps={['Pick a category, choose Reimbursement (you paid) or Company charge (paid directly by the company), enter the amount (or distance, for mileage) and date, and describe what the expense was for.']}
        />
        <Screenshot variant="contain" src="/guide/expense-2-details.jpg" alt="The New Expense Claim dialog with the Description field highlighted" caption="2. Category, payment type, amount, date, description." />

        <StepList
          startIndex={2}
          steps={['Attach a receipt: tap Scan receipt to photograph a paper receipt and auto-fill the amount, date, and description from it, or use "or attach manually" underneath to upload an existing photo or PDF instead.']}
        />
        <Screenshot variant="contain" src="/guide/expense-3-receipt.jpg" alt="The New Expense Claim dialog with the Scan receipt button highlighted" caption="3. Scan a receipt, or attach one manually — either works." />

        <StepList
          startIndex={3}
          steps={[
            <>If this is a reimbursement and you haven't added your bank details yet, tap the <strong>"Add your bank details for payment"</strong> banner
            (visible in the screenshot above) and enter your bank, account number, and account name — an approved reimbursement cannot be paid out
            without them on file.</>,
            'Submit the claim — it routes automatically to the right approver based on its amount, and you can track its status from the Expenses list.',
          ]}
        />
      </ModuleCard>

      <ModuleCard title="Invoices" route="/invoices" roles={['super_admin', 'admin', 'finance']}>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Create and send client invoices with dynamic line items and Nigerian VAT — 7.5% by default, configurable per invoice
          to 0%, 5%, 7.5%, or 10% where the engagement calls for it. Invoices move through <strong>draft → sent → paid</strong>,
          with <strong>overdue</strong> and <strong>cancelled</strong> as the other end states. Overdue is detected automatically by
          comparing the due date to today whenever the invoice is viewed or listed — there is no scheduled job involved, so an
          overdue invoice shows correctly the moment its due date passes. Invoices are linked to the Clients CRM, and each one
          has a print-ready view plus CSV export for your books.
        </p>
      </ModuleCard>

      <VideoEmbed src={guideVideoUrl('10-BudgetsSubscriptions.mp4')} title="Budgets & Subscriptions" caption="Watch: Creating budgets, tracking spend, and managing recurring subscriptions" />

      <ModuleCard title="Budgets" route="/budgets" roles={['super_admin', 'admin', 'finance']}>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Set department or project budgets for a period, and actual spend from Expenses and Payments tracks against it
          automatically as those transactions post — no manual updating of a spreadsheet. A locked budget cannot be edited
          without explicitly unlocking it first, a deliberate safeguard against a budget quietly changing mid-period after
          spend has already been measured against it.
        </p>
      </ModuleCard>

      <ModuleCard title="Contractors" route="/contractors" roles={['super_admin', 'admin', 'finance', 'operations']}>
        <p className="text-sm text-muted-foreground leading-relaxed">
          The master record for every contractor: bank details and a default payment amount, used to speed up recurring pay
          batches. Each contractor has a dedicated profile with their full payment history, uploaded documents, and an audit
          trail of changes — useful both for day-to-day payouts and for answering "who changed this contractor's bank details,
          and when" if it's ever asked. In the sidebar, find Contractors under{' '}
          <strong>People & HR → Core HR → Contractors</strong>.
        </p>
      </ModuleCard>

      <ModuleCard title="Reports" route="/reports" roles={['super_admin', 'admin', 'finance']}>
        <p className="text-sm text-muted-foreground leading-relaxed">
          P&L, cash flow, and payment history in one place. Operating costs here include the <strong>actual</strong> fees
          Paystack and Flutterwave charged on each transfer — not an estimated rate — so the numbers match what really left the
          account. Everything is exportable to CSV for board packs or an audit. In the sidebar, find Reports under{' '}
          <strong>Workspace → Intelligence → Reports</strong>.
        </p>
      </ModuleCard>

      <ModuleCard title="Compliance" route="/compliance" roles={['super_admin', 'admin', 'finance']}>
        <p className="text-sm text-muted-foreground leading-relaxed">
          A calendar of statutory filings and renewals — tax, pension remittance, licences — so nothing lapses quietly.
          Upcoming due dates surface on the Dashboard automatically as amber alerts once they're within 30 days, without
          anyone needing to check the Compliance calendar directly to be warned. In the sidebar, find Compliance under{' '}
          <strong>Finance → Risk & Controls → Compliance</strong>.
        </p>
      </ModuleCard>

      <ModuleCard title="Finance Dashboard" route="/finance" roles={['super_admin']}>
        <p className="text-sm text-muted-foreground leading-relaxed">
          A real-time financial overview of the company's operational spending — total payroll cost, outstanding
          expenses, payment volumes, and budget utilisation across departments. The dashboard aggregates data
          from Payments, Expenses, Payroll, and Budgets into one view so the super admin can spot trends
          (e.g. a department consistently over budget) without opening each module individually. This is the
          landing page when you click <strong>Finance</strong> in the sidebar.
        </p>
        <Callout tone="tip">
          The Finance Dashboard is read-only — it doesn't create or approve anything. Use it for the "big picture"
          before diving into individual modules for action.
        </Callout>
      </ModuleCard>

      <ModuleCard title="Cash Flow" route="/cashflow" roles={['super_admin', 'admin', 'finance']}>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Tracks cash-on-hand snapshots over time alongside burn rate and a runway estimate — the fastest way to see, at a
          glance, how many months the current cash position covers at the current spend rate.
        </p>
      </ModuleCard>

      <ModuleCard title="Anomalies" route="/anomalies" roles={['super_admin', 'admin', 'finance']}>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Automated detection flags unusual payment patterns — duplicate amounts, off-hours batches, sudden spend spikes — for
          finance review. Treat it as a first-pass filter that catches what's easy to miss by eye, not a replacement for
          actually looking at what you're approving.
        </p>
      </ModuleCard>

      <ModuleCard title="Subscriptions & Virtual Cards" route="/subscriptions" roles={['super_admin', 'admin', 'finance']}>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Subscriptions tracks recurring SaaS and vendor charges alongside their renewal dates, so a renewal never arrives as
          a surprise on the bank statement. Virtual Cards (<code className="text-xs bg-muted px-1 py-0.5 rounded">/cards</code>)
          manages issuance of company virtual cards with configurable spend limits, for controlled online purchases that
          don't need a full payment batch.
        </p>
      </ModuleCard>

      <ModuleCard title="Staff Loans & Earned Wage Access" route="/staff-loans" roles={['super_admin', 'admin', 'finance']}>
        <p className="text-sm text-muted-foreground leading-relaxed">
          <strong>Earned Wage Access</strong> (<code className="text-xs bg-muted px-1 py-0.5 rounded">/ewa</code>, everyone)
          is employee-facing self-service: it lets an employee draw a portion of wages they've already earned ahead of
          payday, and the advance is deducted automatically from their next payroll run — a lighter-weight alternative to a
          formal loan for a short-term gap. <strong>Staff Loans</strong> is the finance-managed side of the same idea: a
          formal loan or advance product with its own repayment schedule, set up and tracked by Finance/Admin rather than
          drawn down by the employee directly.
        </p>
      </ModuleCard>
    </div>
  );
}
