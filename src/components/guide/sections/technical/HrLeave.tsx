import { RefTable, RefSection } from '@/components/guide/shared';
import {
  Users, Database, Star, GraduationCap, HeartPulse, UserCheck, UserPlus2,
  CalendarCheck2, ShieldAlert,
} from 'lucide-react';

export function TechHrSection() {
  return (
    <>
      <h2 className="text-xl font-semibold mb-1">HR & Leave Technical Reference</h2>
      <RefSection icon={Users} title="Leave requests">
        <RefTable
          cols={['Rule', 'Detail']}
          rows={[
            { a: 'Approval roles',          b: 'admin / super_admin / operations' },
            { a: 'Rejection reason',        b: 'Mandatory — minimum 10 characters' },
            { a: 'Balance deducted when',   b: 'Leave is approved — restored if approval is reverted' },
            { a: 'Cancellation',            b: 'Employee can cancel their own pending / approved request' },
            { a: 'Soft delete',             b: 'Deleting sets deleted_at — record stays in DB' },
            { a: 'My requests limit',       b: '100 rows (most recent first)' },
            { a: 'Team view limit',         b: '200 rows (admin / privileged roles only)' },
            { a: 'Approvals page limit',    b: '200 pending leave requests' },
          ]}
        />
      </RefSection>

      <RefSection icon={Users} title="Employee profile caps">
        <RefTable
          cols={['Data', 'Cap']}
          rows={[
            { a: 'Payslips shown',             b: '24 (newest first)' },
            { a: 'Salary advances shown',      b: '20 (newest first)' },
            { a: 'Salary increments shown',    b: '20 (newest first)' },
            { a: 'Deductions shown',           b: '20 (newest first)' },
            { a: 'Documents shown',            b: '30 (newest first, soft-deleted excluded)' },
            { a: 'Audit log shown',            b: '50 most recent entries' },
            { a: 'Maximum annual salary',      b: '₦100,000,000 (DB CHECK constraint)' },
            { a: 'Maximum salary advance',     b: '₦50,000,000 (DB CHECK constraint)' },
          ]}
        />
      </RefSection>

      <RefSection icon={Database} title="Budgets">
        <RefTable
          cols={['Rule', 'Detail']}
          rows={[
            { a: 'Maximum annual budget',   b: '₦5,000,000,000 per category (DB CHECK)' },
            { a: 'Approval required',       b: 'admin / finance / super_admin' },
            { a: 'Locking',                 b: 'Locked budgets block new expense submissions against their categories' },
            { a: 'Soft delete',             b: 'Deleting sets deleted_at — record stays in DB' },
            { a: 'Query limit',             b: '200 budget rows per load' },
            { a: 'Approvals page limit',    b: '200 pending budgets' },
          ]}
        />
      </RefSection>

      <RefSection icon={Star} title="Performance Reviews">
        <RefTable
          cols={['Rule', 'Detail']}
          rows={[
            { a: 'Cycle types',             b: 'annual · mid_year · quarterly · probation' },
            { a: 'Competency scale',        b: '1–5 stars across 5 competencies (Delivery, Communication, Teamwork, Initiative, Leadership)' },
            { a: 'Overall rating',          b: 'Computed as the average of the five competency ratings' },
            { a: 'Status flow',             b: 'draft → submitted → acknowledged' },
            { a: 'Review types',            b: 'manager · self · peer (each tracked separately)' },
            { a: 'Who can edit',            b: 'The reviewer (until acknowledged) or any manager role' },
            { a: 'Overdue cycles',          b: 'Cycles past target_completion_date with incomplete reviews are flagged red' },
            { a: 'RLS write access',        b: 'super_admin / admin / finance / operations only' },
          ]}
        />
      </RefSection>

      <RefSection icon={GraduationCap} title="Training &amp; Certifications">
        <RefTable
          cols={['Rule', 'Detail']}
          rows={[
            { a: 'Record types',            b: 'training (course completion) · certification (formal credential)' },
            { a: 'Expiry detection',        b: 'Auto-shows "Expired" when expiry_date &lt; today — no DB job needed' },
            { a: 'Renewal alert',           b: '30-day amber badge when expiry_date is within 30 days' },
            { a: 'Categories',              b: 'professional_development · compliance · safety · technical · leadership · software · other' },
            { a: 'Mandatory flag',          b: 'is_mandatory = true marks compliance/safety training as required' },
            { a: 'Cost tracking',           b: 'cost_ngn fed into budget analysis (no cap)' },
            { a: 'Certificate URL',         b: 'Optional link to PDF or external system' },
            { a: 'RLS write access',        b: 'super_admin / admin / finance / operations only' },
          ]}
        />
      </RefSection>

      <RefSection icon={HeartPulse} title="Employee Benefits">
        <RefTable
          cols={['Rule', 'Detail']}
          rows={[
            { a: 'Benefit types',           b: 'hmo (NHIS) · pension_pfa (PFA) · group_life · other' },
            { a: 'RSA PIN',                 b: 'Stored only for pension_pfa records — Retirement Savings Account number' },
            { a: 'Premium frequency',       b: 'monthly · quarterly · annually' },
            { a: 'Monthly equivalent',      b: 'Computed in-app: quarterly ÷ 3, annually ÷ 12' },
            { a: 'Status values',           b: 'active · suspended · expired' },
            { a: 'Expiry alert',            b: '30-day amber badge when expiry_date approaches; red when past' },
            { a: 'Multiple records',        b: 'Multiple HMO plans per employee allowed (e.g. employee + family plan)' },
            { a: 'RLS write access',        b: 'super_admin / admin / finance / operations only' },
          ]}
        />
      </RefSection>

      <RefSection icon={UserCheck} title="Onboarding &amp; Offboarding">
        <RefTable
          cols={['Rule', 'Detail']}
          rows={[
            { a: 'Checklist types',         b: 'onboarding (new hires) · offboarding (exits)' },
            { a: 'Default items seeded',    b: '11 onboarding items · 8 offboarding items (when "Populate defaults" is checked)' },
            { a: 'Item categories',         b: 'documentation · it_setup · hr_admin · finance · training · equipment · introduction · other' },
            { a: 'Item delegation',         b: 'Each item can be assigned to a team member (HR, IT, finance, buddy)' },
            { a: 'Status derivation',       b: 'Computed in-app — pending (0%) · in_progress (1–99%) · completed (100%). No DB trigger.' },
            { a: 'Item completion',         b: 'Click checkbox — sets completed_at + completed_by. Toggleable.' },
            { a: 'Sort order',              b: 'sort_order INT — lower numbers appear first within each category' },
            { a: 'RLS write access',        b: 'super_admin / admin / finance / operations only' },
          ]}
        />
      </RefSection>

      <RefSection icon={UserPlus2} title="Recruitment Pipeline">
        <RefTable
          cols={['Rule', 'Detail']}
          rows={[
            { a: 'Pipeline stages',         b: 'new → screening → interview_1 → interview_2 → offer → hired | rejected' },
            { a: 'Employment types',        b: 'full_time · part_time · contract · intern' },
            { a: 'Opening status',          b: 'draft (private) · published · closed (no more applicants) · filled' },
            { a: 'Application sources',     b: 'job_board · referral · walk_in · internal · linkedin · other' },
            { a: 'Salary range',            b: 'salary_min_ngn / salary_max_ngn — planning figures, not enforced on offer' },
            { a: 'Offer amount',            b: 'Recorded only when stage is offer or hired; offered_at auto-stamped' },
            { a: 'Hire-to-employee',        b: 'Marking "Hired" does NOT auto-create an auth.users row — admin creates the employee manually' },
            { a: 'Soft delete',             b: 'Job openings use deleted_at; applicants are hard-deleted on removal' },
            { a: 'RLS write access',        b: 'super_admin / admin / finance / operations only' },
          ]}
        />
      </RefSection>

      <RefSection icon={CalendarCheck2} title="Attendance &amp; Timesheets">
        <RefTable
          cols={['Rule', 'Detail']}
          rows={[
            { a: 'Storage',                 b: 'One row per employee per work_date — UNIQUE constraint at DB level' },
            { a: 'Conflict handling',       b: 'Insert uses upsert(onConflict=employee_id,work_date) — re-submission updates the existing row' },
            { a: 'Time storage',            b: 'clock_in / clock_out are TIME (no timezone) — assumes Nigeria WAT (UTC+1)' },
            { a: 'Status values',           b: 'present · absent · late · half_day · remote · on_leave · public_holiday' },
            { a: 'Overtime tracking',       b: 'overtime_minutes INT ≥ 0 — totalled per period in the summary card' },
            { a: 'Month navigation',        b: 'Page loads 1 month at a time; navigator buttons shift the date range' },
            { a: 'Leave integration',       b: 'on_leave status is set manually; not auto-synced from leave_requests (future)' },
            { a: 'RLS write access',        b: 'super_admin / admin / finance / operations only' },
          ]}
        />
      </RefSection>

      <RefSection icon={ShieldAlert} title="Disciplinary Records">
        <RefTable
          cols={['Rule', 'Detail']}
          rows={[
            { a: 'Action ladder',           b: 'verbal_warning → written_warning → final_warning → query → suspension → termination' },
            { a: 'Other types',             b: 'counselling · other (for informal coaching or undefined incidents)' },
            { a: 'Fair hearing support',    b: 'Employee response thread on each record — required by Nigerian Labour Act before termination' },
            { a: 'Acknowledgement',         b: 'acknowledged_at / acknowledged_by — confirms employee received the notice' },
            { a: 'Suspension',              b: 'suspension_days INT > 0 — mandatory when incident_type = suspension' },
            { a: 'Expunge mechanism',       b: 'is_expunged = true hides record from active history but keeps it in audit trail' },
            { a: 'Expunge reason',          b: 'Free-text reason captured (e.g. "12 months clean record")' },
            { a: 'Show expunged toggle',    b: 'Default off — expunged records hidden until "Show expunged" is checked' },
            { a: 'RLS access',              b: 'super_admin / admin only — finance and operations CANNOT view or edit (sensitive HR data)' },
          ]}
        />
      </RefSection>
    </>
  );
}
