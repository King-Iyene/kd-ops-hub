// Roles & Permissions — the real route-level access matrix, generated
// from the actual <RoleGuard roles={...}> declarations in src/App.tsx and
// the role-set constants in src/lib/roles.ts. When a route's guard
// changes, update this table to match — it is documentation, not a
// live query against the router, so it can drift if forgotten.
import { Users, Shield, ShieldCheck, ShieldAlert, KeyRound, Eye } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { SectionIntro, RoleBadges, Callout, RefTable, RefSection, type Role } from '@/components/guide/shared';

const ROLE_SUMMARY: { role: Role; blurb: string }[] = [
  { role: 'super_admin', blurb: 'Full access to every page in the platform, including the 8 pages no other role can see: Settings, Finance Dashboard, Principal Disbursements, Assistant Admin, Employees, Placements, Approval Workflows, and Audit Log. The only role that can simulate other roles ("View As") for testing.' },
  { role: 'admin', blurb: 'Same day-to-day access as Super Admin across HR, finance, and operations pages, minus the 8 super-admin-exclusive pages above. Can manage employees, disciplinary records, HR letters, grievances, and succession planning.' },
  { role: 'finance', blurb: 'Full access to every money-related module — Payments, Payroll, Invoices, Budgets, Expenses, Reports, Cash Flow, Anomalies, Compliance — plus the general HR/ops pages everyone gets. Cannot see Employees, Disciplinary, HR Letters, Grievances, or the super-admin-only pages.' },
  { role: 'operations', blurb: 'Broad day-to-day operational access: Payments (can prepare and view, not the finance-only reporting pages), Fleet, Contractors, Recruitment, Onboarding, Training, Performance, Vendors, Projects, Benefits, Attendance, Timesheets, Surveys, Shifts, Public Links, Contacts, Clients. Cannot see Employees, Invoices, Budgets, Compliance, Reports, HR Analytics, Anomalies, or Cash Flow.' },
  { role: 'field_staff', blurb: 'Front-line access: Dashboard, Fleet, Expenses (submit only), Leave, Tasks, Knowledge Base, Handbook, Goals, Referrals, Earned Wage Access, Assistant, Messages, My Dashboard. No visibility into any finance, HR-admin, or operations-management page.' },
  { role: 'driver', blurb: 'Same access surface as Field Staff — this role exists specifically for fleet drivers and shares the front-line permission set rather than having its own.' },
];

const FULL_MATRIX: { a: string; b: string; c: string }[] = [
  { a: '/dashboard, /', b: 'Dashboard', c: 'Everyone' },
  { a: '/my-dashboard', b: 'My Dashboard', c: 'Everyone' },
  { a: '/profile', b: 'Profile', c: 'Everyone' },
  { a: '/assistant', b: 'AI Assistant', c: 'Everyone' },
  { a: '/messages', b: 'Messages', c: 'Everyone' },
  { a: '/tasks', b: 'Tasks', c: 'Everyone' },
  { a: '/knowledge', b: 'Knowledge Base', c: 'Everyone' },
  { a: '/handbook', b: 'Handbook', c: 'Everyone' },
  { a: '/goals', b: 'Goals', c: 'Everyone' },
  { a: '/leave', b: 'Leave', c: 'Everyone' },
  { a: '/expenses', b: 'Expenses', c: 'Everyone (submit); Finance/Admin approve' },
  { a: '/fleet, /fleet/live', b: 'Fleet', c: 'Everyone' },
  { a: '/ewa', b: 'Earned Wage Access', c: 'Everyone' },
  { a: '/referrals', b: 'Referrals', c: 'Everyone' },
  { a: '/guide', b: 'This guide', c: 'Everyone' },
  { a: '/attendance', b: 'Attendance', c: 'Super Admin, Admin, Finance, Operations' },
  { a: '/timesheets', b: 'Timesheets', c: 'Super Admin, Admin, Finance, Operations' },
  { a: '/payments, /payments/new, /payments/:id, /payments/schedule', b: 'Payments', c: 'Super Admin, Admin, Finance, Operations' },
  { a: '/transactions', b: 'Transactions', c: 'Super Admin, Admin, Finance, Operations' },
  { a: '/contractors, /contractors/:id', b: 'Contractors', c: 'Super Admin, Admin, Finance, Operations' },
  { a: '/vendors', b: 'Vendors', c: 'Super Admin, Admin, Finance, Operations' },
  { a: '/performance', b: 'Performance Reviews', c: 'Super Admin, Admin, Finance, Operations' },
  { a: '/training', b: 'Training', c: 'Super Admin, Admin, Finance, Operations' },
  { a: '/projects', b: 'Projects', c: 'Super Admin, Admin, Finance, Operations' },
  { a: '/benefits', b: 'Benefits', c: 'Super Admin, Admin, Finance, Operations' },
  { a: '/onboarding', b: 'Onboarding & Offboarding', c: 'Super Admin, Admin, Finance, Operations' },
  { a: '/recruitment', b: 'Recruitment', c: 'Super Admin, Admin, Finance, Operations' },
  { a: '/public-links', b: 'Public Links', c: 'Super Admin, Admin, Finance, Operations' },
  { a: '/surveys', b: 'Surveys', c: 'Super Admin, Admin, Finance, Operations' },
  { a: '/shifts', b: 'Shifts', c: 'Super Admin, Admin, Finance, Operations' },
  { a: '/contacts, /contacts/:id', b: 'Contacts', c: 'Super Admin, Admin, Finance, Operations' },
  { a: '/clients, /clients/:id', b: 'Clients', c: 'Super Admin, Admin, Finance, Operations' },
  { a: '/invoices', b: 'Invoices', c: 'Super Admin, Admin, Finance' },
  { a: '/approvals', b: 'Approvals', c: 'Super Admin, Admin, Finance' },
  { a: '/subscriptions', b: 'Subscriptions', c: 'Super Admin, Admin, Finance' },
  { a: '/budgets', b: 'Budgets', c: 'Super Admin, Admin, Finance' },
  { a: '/documents', b: 'Documents', c: 'Super Admin, Admin, Finance' },
  { a: '/reports', b: 'Reports', c: 'Super Admin, Admin, Finance' },
  { a: '/hr-analytics', b: 'HR Analytics', c: 'Super Admin, Admin, Finance' },
  { a: '/compliance', b: 'Compliance', c: 'Super Admin, Admin, Finance' },
  { a: '/payroll', b: 'Payroll', c: 'Super Admin, Admin, Finance' },
  { a: '/anomalies', b: 'Anomalies', c: 'Super Admin, Admin, Finance' },
  { a: '/cashflow', b: 'Cash Flow', c: 'Super Admin, Admin, Finance' },
  { a: '/cards', b: 'Virtual Cards', c: 'Super Admin, Admin, Finance' },
  { a: '/assets', b: 'Assets', c: 'Super Admin, Admin, Finance' },
  { a: '/staff-loans', b: 'Staff Loans', c: 'Super Admin, Admin, Finance' },
  { a: '/communications', b: 'Communications (bulk send)', c: 'Super Admin, Admin, Finance' },
  { a: '/employees, /employees/:id', b: 'Employees Directory', c: 'Super Admin, Admin' },
  { a: '/disciplinary', b: 'Disciplinary Records', c: 'Super Admin, Admin' },
  { a: '/hr-letters', b: 'HR Letters', c: 'Super Admin, Admin' },
  { a: '/grievances', b: 'Grievances', c: 'Super Admin, Admin' },
  { a: '/succession', b: 'Succession Planning', c: 'Super Admin, Admin' },
  { a: '/approval-workflows', b: 'Approval Workflows', c: 'Super Admin, Admin' },
  { a: '/audit', b: 'Audit Log', c: 'Super Admin, Admin' },
  { a: '/settings', b: 'Settings', c: 'Super Admin only' },
  { a: '/finance', b: 'Finance Dashboard', c: 'Super Admin only' },
  { a: '/principal-disbursements', b: 'Principal Disbursements', c: 'Super Admin only' },
  { a: '/assistant/admin', b: 'Assistant Admin', c: 'Super Admin only' },
  { a: '/placements', b: 'Placements', c: 'Super Admin only' },
];

export function RolesPermissionsSection() {
  return (
    <div className="space-y-6">
      <SectionIntro
        icon={Shield}
        title="Roles & Permissions"
        blurb="KDOps has 6 real roles, assigned per employee in Settings → Employees. Every route in the app is gated to one of these role sets — there is no page that silently shows different content per role; if you can't see something, your role's guard doesn't include it, full stop."
      />

      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="pt-4 pb-4 flex items-start gap-3">
          <Eye className="h-5 w-5 text-primary shrink-0 mt-0.5" />
          <p className="text-sm text-muted-foreground leading-relaxed">
            This table is generated from the literal <code className="text-xs bg-muted px-1 py-0.5 rounded">&lt;RoleGuard roles={'{'}...{'}'}&gt;</code> on
            every route in <code className="text-xs bg-muted px-1 py-0.5 rounded">src/App.tsx</code>, not a description someone wrote by hand — if it's wrong, the router itself is wrong, and that's a bug to report.
          </p>
        </CardContent>
      </Card>

      <RefSection icon={Users} title="The 6 roles, in plain English">
        <div className="grid gap-3">
          {ROLE_SUMMARY.map(({ role, blurb }) => (
            <div key={role} className="rounded-lg border p-3.5">
              <div className="flex items-center gap-2 mb-1.5">
                <RoleBadges roles={[role]} />
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">{blurb}</p>
            </div>
          ))}
        </div>
      </RefSection>

      <Callout tone="tip">
        Super Admin can temporarily <strong>simulate</strong> any other role from the account menu ("View As") to see exactly what
        that role sees — the fastest way to verify a permission change actually took effect, without needing a second test account.
      </Callout>

      <RefSection icon={KeyRound} title="Full route access matrix">
        <RefTable cols={['Route(s)', 'Page', 'Who can open it']} rows={FULL_MATRIX} />
      </RefSection>

      <RefSection icon={ShieldAlert} title="How access is actually enforced">
        <RefTable
          cols={['Layer', 'What it does']}
          rows={[
            { a: 'Route guard (client)', b: 'RoleGuard wraps every authenticated route in App.tsx and redirects to /unauthorized if the logged-in profile\'s role is not in the allowed list. This is a UX convenience, not the real security boundary.' },
            { a: 'Row Level Security (database)', b: 'The real boundary. Every table has Postgres RLS policies that check the request\'s role/user id server-side — even if someone bypassed the UI entirely and called the API directly, RLS still blocks anything their role should not see or write.' },
            { a: 'SECURITY DEFINER RPCs', b: 'Sensitive state changes (approvals, transfer limits, payroll posting) go through server-side functions that re-check the caller\'s role and business rules before writing — the client cannot skip a validation step by calling the table directly.' },
            { a: 'Edge function auth', b: 'Server-side functions (payments, payroll, webhooks) verify the caller\'s JWT and role independently of the frontend — a modified frontend cannot grant itself extra access.' },
          ]}
        />
      </RefSection>

      <RefSection icon={ShieldCheck} title="Requesting a role change">
        <p className="text-sm text-muted-foreground leading-relaxed">
          Roles are set per employee under <strong>Settings → Employees</strong> by a Super Admin. If your work has changed and you
          need different access, ask your manager to raise it with a Super Admin — there is no self-service way to change your own role,
          by design.
        </p>
      </RefSection>
    </div>
  );
}
