// Fleet & Assets — everything vehicle- and equipment-related: the daily
// driver/field-staff workflow (fuel, inspections, incidents) alongside the
// finance-facing fixed-asset register and the operations-facing project
// tracker that both lean on the same underlying data.
import { Car } from 'lucide-react';
import { SectionIntro, ModuleCard, StepList, Callout } from '@/components/guide/shared';

export function FleetOpsSection() {
  return (
    <div className="space-y-6">
      <SectionIntro
        icon={Car}
        title="Fleet & Assets"
        blurb="Everything vehicle- and equipment-related lives here: the vehicle roster and daily fuel/maintenance/inspection workflow drivers and field staff touch every day, the fixed-asset register Finance depreciates and insures, and the projects operations plans work against. Unlike most of KDOps, Fleet Dashboard itself is open to every role — drivers and field staff use it to do their job, Finance and Admin use it to see cost, and Operations manages it end to end."
      />

      <ModuleCard title="Fleet Dashboard" route="/fleet" roles={['everyone']}>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Everything vehicle-related in one place, organized into five tabs. <code className="text-xs bg-muted px-1 py-0.5 rounded">/fleet/live</code> is
          just a redirect into this same page — there's no separate "live" screen to learn.
        </p>
        <StepList
          steps={[
            <><strong>Vehicles</strong> — the roster: assigned driver, weekly fuel budget, insurance and service due dates, and current fuel level for each vehicle at a glance.</>,
            <><strong>Fuel</strong> — log fuel purchases as they happen. The system watches every entry and flags unusual jumps (a fill-up far outside a vehicle's normal pattern) for review rather than accepting every number at face value.</>,
            <><strong>Maintenance</strong> — scheduled and completed service records. Routine servicing (oil changes, tyre rotations, and the like) can be set to recur on its own schedule instead of being re-entered by hand every time.</>,
            <><strong>Inspections</strong> — pre-trip and periodic checklists. A defect raised on an inspection doesn't just sit there: it enters a structured resolution workflow with eight possible outcomes — <em>repaired, replaced, adjusted, cleaned, calibrated, temporary fix, deferred,</em> or <em>not required</em> — so every defect ends in a recorded decision, not silence.</>,
            <><strong>Incidents</strong> — accident and incident reporting, with photo attachments, police report numbers where applicable, repair cost tracking, and a resolution status so an incident can be followed from first report through to close-out.</>,
          ]}
        />
        <p className="text-sm text-muted-foreground leading-relaxed">
          At the top of the dashboard, the <strong>Fleet Insights Panel</strong> rolls all five tabs into a single per-vehicle
          health score from 0-100%, weighted across fuel efficiency (20%), maintenance compliance (30%), document/compliance
          status — insurance and service dates (30%), and inspection results (20%). Alongside the score, a smart insights
          engine actively flags overdue maintenance, budget overruns, fuel anomaly rates above 15%, unresolved defects, low
          fuel efficiency, and week-over-week spend trends worth a second look — so problems surface on their own instead of
          waiting for someone to go looking tab by tab.
        </p>
        <p className="text-sm text-muted-foreground leading-relaxed">
          The panel also includes a <strong>Fuel Cost Optimizer</strong>, which ranks every vehicle by cost-per-km over the
          trailing 30 days and calculates a savings opportunity — the fastest way to see which vehicles are quietly costing
          more to run than the rest of the fleet.
        </p>
        <Callout tone="tip">
          Log fuel purchases immediately at the pump, not batched later from memory or a stack of receipts. The anomaly
          detection compares each entry against a vehicle's normal pattern, and delayed, rounded, or reconstructed entries
          make that pattern noisier — which means real anomalies get harder to catch, not easier.
        </Callout>
      </ModuleCard>

      <ModuleCard title="Assets" route="/assets" roles={['super_admin', 'admin', 'finance']}>
        <p className="text-sm text-muted-foreground leading-relaxed">
          The fixed-asset register: IT equipment, motor vehicles, furniture, plant & machinery, buildings, and leasehold
          improvements, all in one record with a live-calculated book value using either straight-line or reducing-balance
          depreciation, depending on how each asset is configured.
        </p>
        <StepList
          steps={[
            'Nigerian CITA capital allowance rates — both initial and annual — are pre-filled per asset category, so tax treatment is consistent without anyone looking up rates by hand each time.',
            'An expiring insurance policy triggers an amber badge 30 days out, the same early-warning pattern used elsewhere in KDOps for compliance dates.',
            'Assets can be assigned to a specific employee and/or department, so "who has this" and "which department carries this cost" are both answerable from the asset record.',
            'Disposed and written-off assets move out of the active register into their own tracked state rather than being deleted — the depreciation and disposal history stays intact.',
          ]}
        />
      </ModuleCard>

      <ModuleCard title="Projects" route="/projects" roles={['super_admin', 'admin', 'finance', 'operations']}>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Links each project to a client, an owner, and a department, and tracks it through a status workflow of{' '}
          <strong>planning → active → on_hold → completed / cancelled</strong>, with a priority of <strong>critical, high,
          normal,</strong> or <strong>low</strong> set independently of status.
        </p>
        <StepList
          steps={[
            'Milestones are inline and drag-sortable — reorder them by dragging, and mark one complete with a single click, no separate edit screen required.',
            'Tasks created against a project in the Tasks module are counted automatically and shown on the project record, so project progress and task load are visible together.',
            'A project that is still active past its own end date is flagged as overdue automatically — nobody has to notice the date has passed and mark it manually.',
          ]}
        />
      </ModuleCard>
    </div>
  );
}
