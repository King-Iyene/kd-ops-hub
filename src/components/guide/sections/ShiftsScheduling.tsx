import { Clock } from 'lucide-react';
import { SectionIntro, ModuleCard, StepList, Callout } from '@/components/guide/shared';

export function ShiftsSchedulingSection() {
  return (
    <div className="space-y-6">
      <SectionIntro
        icon={Clock}
        title="Shifts & Scheduling"
        blurb="Plan and manage employee shifts, view the payment schedule for upcoming disbursements, and use My Portal for a self-service view of your own work life."
      />

      <ModuleCard title="Shifts" route="/shifts" roles={['super_admin', 'admin', 'finance', 'operations']}>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Create and assign work shifts to employees and field staff. The shift calendar gives managers a visual
          overview of who is working when, helps prevent scheduling conflicts, and feeds into attendance tracking.
        </p>
        <StepList steps={[
          'Open Shifts from the sidebar to see the shift calendar.',
          'Click Add Shift — select the employee, date, start/end time, and shift type (morning, afternoon, night, custom).',
          'Published shifts are visible to the assigned employee in their My Portal view.',
          'Use the calendar or list view to spot gaps, overlaps, or unassigned slots.',
        ]} />
        <Callout tone="tip">
          Shifts integrate with Attendance — when an employee clocks in, the system can compare their clock-in
          time against their scheduled shift to flag late arrivals or early departures.
        </Callout>
      </ModuleCard>

      <ModuleCard title="Payment Schedule" route="/payments/schedule" roles={['super_admin', 'admin', 'finance', 'operations']}>
        <p className="text-sm text-muted-foreground leading-relaxed">
          A forward-looking calendar of upcoming payment obligations — scheduled payroll runs, recurring vendor
          payments, subscription renewals, and any payment batches with a future date. Helps finance teams
          plan cash flow and ensure sufficient funds are available.
        </p>
        <StepList steps={[
          'Navigate to Payments → Payment Schedule.',
          'The calendar view shows all upcoming payments by date, colour-coded by type.',
          'Click any entry to view details or jump to the source module (payroll run, batch, subscription).',
          'Use this alongside Cash Flow to ensure your accounts can cover upcoming obligations.',
        ]} />
      </ModuleCard>

      <ModuleCard title="My Portal" route="/my-dashboard" roles={['super_admin', 'admin', 'finance', 'operations', 'field_staff']}>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Every user&apos;s personal dashboard — a single page showing everything relevant to you: your upcoming
          shifts, leave balance, recent payslips, pending tasks, expense claims, and quick actions. Field staff
          and operations users see this as their primary landing page.
        </p>
        <StepList steps={[
          'Click My Portal in the sidebar (available to all roles).',
          'View your current leave balance, upcoming shifts, and recent notifications at a glance.',
          'Access quick links to submit expenses, request leave, clock in/out, and view your payslips.',
          'My Portal shows only your own data — managers see the full admin views in the dedicated modules.',
        ]} />
      </ModuleCard>

      <ModuleCard title="Approvals Inbox" route="/approvals" roles={['super_admin', 'admin', 'finance']}>
        <p className="text-sm text-muted-foreground leading-relaxed">
          A unified inbox for everything waiting on your approval — payment batches, expense claims, leave
          requests, and other items routed through approval workflows. The badge count in the sidebar shows
          how many items need your attention.
        </p>
        <StepList steps={[
          'Click Approvals in the sidebar — the badge shows your pending count.',
          'Review each item: the approval card shows the requester, amount, type, and supporting details.',
          'Approve, reject, or request changes. High-value approvals may trigger step-up authentication (re-enter your password or MFA code).',
          'Approved items automatically move to the next stage — processing, payment, or fulfilment.',
        ]} />
        <Callout tone="warn">
          You cannot approve your own submissions. The system enforces separation of duties — the person who
          submits a batch or expense cannot be the same person who approves it.
        </Callout>
      </ModuleCard>
    </div>
  );
}
