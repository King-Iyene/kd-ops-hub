// People Operations — the full employee lifecycle from hire to exit. This is
// HR/Admin territory: the employee master record, recruitment, onboarding and
// offboarding, disciplinary process, formal letters, grievances, succession
// planning, and workforce analytics.
import { Users } from 'lucide-react';
import { SectionIntro, ModuleCard, StepList, Callout } from '@/components/guide/shared';

export function PeopleOpsSection() {
  return (
    <div className="space-y-6">
      <SectionIntro
        icon={Users}
        title="People Operations"
        blurb="This section is HR/Admin territory — it covers the full employee lifecycle from the moment a role is opened to the moment someone exits the company: the master employee record, hiring, onboarding and offboarding, formal disciplinary process, HR letters, grievances, succession planning, and workforce analytics. Most modules here are restricted to Admin and Super Admin because they touch sensitive personal, financial, or legal information."
      />

      <ModuleCard title="Employees Directory" route="/employees" roles={['super_admin', 'admin']}>
        <p className="text-sm text-muted-foreground leading-relaxed">
          The Employees Directory is the master record for every person at the company — role, department, employment status,
          salary, bank details used for payroll, and their full history in one place. Click into any employee to open a
          dedicated profile page rather than a cramped modal: it brings together their personal and employment details,
          documents, disciplinary history, leave balances, and more, so you're not hunting across five modules to build a
          picture of one person.
        </p>
        <StepList
          steps={[
            'Open Employees and search or filter by department, role, or status to find the person you need.',
            'Click their name to open the full profile page.',
            'Edit employment details, salary, bank details, or role directly from the profile.',
            'Use the profile\'s tabs to review documents, disciplinary records, and history without leaving the page.',
          ]}
        />
        <Callout tone="warn">
          Role assignment happens here, on the employee's profile — and only Super Admin or Admin can change a role. Changing
          someone's role immediately changes what they can see and do across the rest of KDOps, so treat it with the same care
          as a salary change.
        </Callout>
      </ModuleCard>

      <ModuleCard
        title="Recruitment"
        route="/recruitment"
        roles={['super_admin', 'admin', 'finance', 'operations']}
      >
        <p className="text-sm text-muted-foreground leading-relaxed">
          Recruitment tracks job openings — title, department, employment type, salary range, and closing date — and every
          applicant against a hiring pipeline: <strong>New → Screening → Interview 1 → Interview 2 → Offer →
          Hired/Rejected</strong>. Each applicant's card carries their stage history along with interview dates, the
          interviewer(s) assigned to them, the offer amount once one is extended, and a rejection reason if they don't move
          forward — so months later there's still a record of why a candidate didn't proceed, not just that they didn't.
          Stage-filter buttons across the top show a live count of applicants sitting in each stage, and summary cards give an
          at-a-glance read on active openings, total applicants in the pipeline, offers currently out, and how many hires have
          been made.
        </p>
        <StepList
          steps={[
            'Open Recruitment and click New Opening to post a role — set its title, department, employment type, salary range, and closing date.',
            'As applicants come in, add them to the opening at the New stage.',
            'Move each applicant through Screening, Interview 1, and Interview 2 as they progress, recording interview dates and the assigned interviewer(s) at each step.',
            'Extend an Offer and record the offer amount, then mark the applicant Hired once accepted — or Rejected with a reason at any stage they don\'t proceed.',
            'Use the stage-filter buttons to jump straight to everyone sitting in a given stage, and the summary cards to see openings, applicants, offers, and hires at a glance.',
          ]}
        />
      </ModuleCard>

      <ModuleCard
        title="Onboarding & Offboarding"
        route="/onboarding"
        roles={['super_admin', 'admin', 'finance', 'operations']}
      >
        <p className="text-sm text-muted-foreground leading-relaxed">
          This module generates a checklist for either side of the employment relationship in one click. For a new hire, a
          joining checklist comes pre-filled with default items spanning documentation, IT setup, HR admin, finance, training,
          equipment, and introduction — so nothing gets forgotten because it wasn't top of mind on someone's first day. For
          someone leaving, an exit checklist comes pre-filled with default offboarding items instead. Either checklist can also
          be started blank if the defaults don't fit the situation. Every item can be assigned to a specific team member with
          its own due date, and a progress bar shows how much of the checklist is complete — calculated live in the app itself
          as items are checked off, with no database trigger required to keep it in sync.
        </p>
        <StepList
          steps={[
            'Open Onboarding & Offboarding and choose the employee, then pick Joining or Exit checklist.',
            'Start from the pre-filled default items, or choose to start blank and build the checklist item by item.',
            'Assign each item to the team member responsible, and set a due date.',
            'As items are completed, check them off — the progress bar updates immediately to reflect how much is done.',
          ]}
        />
      </ModuleCard>

      <ModuleCard title="Disciplinary Records" route="/disciplinary" roles={['super_admin', 'admin']}>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Disciplinary Records manages formal HR actions in line with Nigerian Labour Act disciplinary process — a graduated
          ladder of interventions rather than jumping straight to the most severe response. The available action types are, in
          rising order of severity: <strong>counselling</strong>, <strong>verbal warning</strong>, <strong>written
          warning</strong>, <strong>final warning</strong>, <strong>query / show-cause</strong>, <strong>suspension</strong>,
          and <strong>termination</strong>, plus an <strong>other</strong> category for anything that doesn't fit those. Each
          record captures the subject employee, the incident details, the formal outcome, and — where the action is a
          suspension — the number of suspension days.
        </p>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Where an employee is issued a query or show-cause letter, they can respond formally through a built-in response
          thread attached to the record. This isn't a cosmetic comment box — a documented opportunity to respond is what fair
          hearing requires before a more serious action can reasonably follow, and the thread is what preserves that record.
          Records can also be <strong>acknowledged</strong>, confirming the employee received the notice, and later{' '}
          <strong>expunged</strong> with a stated reason after a clean-record period — an expunged record is removed from
          active view but is never deleted: it stays visible in the audit trail and only drops out of an employee's day-to-day
          history when "Show expunged" is switched off, and reappears the moment it's switched back on.
        </p>
        <StepList
          steps={[
            'Open Disciplinary Records and click New Record, choosing the subject employee and the action type.',
            'Document the incident details and, once decided, the formal outcome — including suspension days if the action is a suspension.',
            'For a query or show-cause letter, wait for and record the employee\'s formal response in the record\'s response thread before deciding on any further action.',
            'Mark the record Acknowledged once the employee has confirmed receipt of the notice.',
            'After the applicable clean-record period, a record can be Expunged with a reason — it leaves active history but remains permanently in the audit trail.',
          ]}
        />
        <Callout tone="caution">
          This module directly affects legal and compliance standing, not just an internal record-keeping exercise. Accuracy of
          incident details, timely acknowledgement, and proper documentation of the employee's response all matter if a
          disciplinary decision is ever challenged or reviewed.
        </Callout>
      </ModuleCard>

      <ModuleCard title="HR Letters" route="/hr-letters" roles={['super_admin', 'admin']}>
        <p className="text-sm text-muted-foreground leading-relaxed">
          HR Letters generates and issues formal correspondence — offer letters, warning letters, confirmation letters, and
          similar documents — from within KDOps rather than a separate word processor. Once a letter is issued, it captures
          the recipient's e-signature directly on the letter, giving you a signed, dated record that the employee received and
          acknowledged it, without needing a separate print-sign-scan cycle.
        </p>
        <StepList
          steps={[
            'Open HR Letters and choose the letter type — offer, warning, confirmation, or another available template.',
            'Select the recipient employee and fill in any letter-specific details.',
            'Issue the letter to the recipient.',
            'The recipient signs electronically, and the signed letter is stored against their record.',
          ]}
        />
      </ModuleCard>

      <ModuleCard title="Grievances" route="/grievances" roles={['super_admin', 'admin']}>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Grievances is the formal channel for employees to raise workplace concerns — separate from Disciplinary Records,
          since a grievance is raised by an employee about something affecting them, rather than an action taken against them.
          Submissions can be made anonymously where an employee isn't comfortable attaching their name. Each grievance is
          assigned to an HR handler, who tracks it through to resolution with documented resolution notes, and its status is
          visible throughout — from initial submission to close.
        </p>
        <StepList
          steps={[
            'An employee submits a grievance, optionally anonymously.',
            'An HR handler is assigned to the grievance.',
            'The handler investigates and records resolution notes as the matter progresses.',
            'The grievance status is updated through to Closed once resolved.',
          ]}
        />
      </ModuleCard>

      <ModuleCard title="Succession Planning" route="/succession" roles={['super_admin', 'admin']}>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Succession Planning identifies successor candidates for key roles ahead of a planned departure or promotion, rather
          than scrambling to find coverage after the fact. Each key role can have one or more candidates attached, with a
          readiness level tracked per candidate so it's clear who could step in today versus who needs more time and
          development first.
        </p>
      </ModuleCard>

      <ModuleCard title="HR Analytics" route="/hr-analytics" roles={['super_admin', 'admin', 'finance']}>
        <p className="text-sm text-muted-foreground leading-relaxed">
          HR Analytics aggregates workforce metrics for planning and board reporting — headcount trends over time, turnover
          rate, how the workforce is distributed across departments, and leave utilization. It's a read-only, rolled-up view
          built for decisions about staffing and workforce planning, rather than a place to manage individual employee
          records.
        </p>
      </ModuleCard>
    </div>
  );
}
