import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export type PermissionKey =
  | 'dashboard.view_kpis'
  | 'dashboard.view_audit_log'
  | 'payments.view'
  | 'payments.create'
  | 'payments.approve_batches'
  | 'payments.quick_pay'
  | 'payments.batch.contractor'
  | 'payments.batch.salary'
  | 'payments.batch.advance'
  | 'payments.batch.bonus'
  | 'payroll.view'
  | 'payroll.create'
  | 'payroll.approve'
  | 'payroll.generate_payslips'
  | 'expenses.view_all'
  | 'expenses.submit'
  | 'expenses.approve'
  | 'expenses.process_payments'
  | 'fleet.view'
  | 'fleet.submit'
  | 'fleet.approve_fuel_requests'
  | 'fleet.manage_vehicles'
  | 'fleet.view_activity'
  | 'leave.view_all'
  | 'leave.approve'
  | 'contractors.view'
  | 'contractors.add'
  | 'contractors.edit'
  | 'contractors.delete'
  | 'employees.view'
  | 'employees.invite'
  | 'employees.edit'
  | 'employees.change_roles'
  | 'employees.manage_permissions'
  | 'performance.view'
  | 'performance.manage'
  | 'training.view'
  | 'training.manage'
  | 'benefits.view'
  | 'benefits.manage'
  | 'onboarding.view'
  | 'onboarding.manage'
  | 'recruitment.view'
  | 'recruitment.manage'
  | 'attendance.view'
  | 'attendance.manage'
  | 'disciplinary.view'
  | 'vendors.view'
  | 'vendors.manage'
  | 'clients.view'
  | 'clients.manage'
  | 'invoices.view'
  | 'invoices.manage'
  | 'assets.view'
  | 'assets.manage'
  | 'projects.view'
  | 'projects.manage'
  | 'reports.view'
  | 'reports.export'
  | 'settings.access'
  | 'settings.manage_integrations';

export type PermissionsMap = Record<string, boolean>;

/**
 * Server-side role gates for permissions whose underlying action is enforced
 * at the database (SECURITY DEFINER RPCs that hard-check role, or RLS
 * policies that scope the role out of the data). For these permissions a
 * permission-flag toggle is a no-op when the user's role isn't in the allowed
 * set — the action will fail at the server regardless. PermissionsEditor uses
 * this table to disable / lock the toggle so an admin doesn't think they've
 * granted something they actually haven't.
 *
 * Keep this in sync with the RPC role checks (see migrations 20260813000000,
 * 20260817000000, 20260920000000, 20260924000000, 20260926000000,
 * 20260927000000) and the role gates in src/lib/navConfig.ts.
 */
export const PERMISSION_ROLE_GATES: Partial<Record<PermissionKey, { requires: string[]; reason: string }>> = {
  // ── Money: approval / dispatch / Quick Pay ────────────────────────────────
  'payments.approve_batches':
    { requires: ['super_admin', 'admin', 'finance'],
      reason: 'approve_payment_batch / confirm_second_approval / mark_batch_funded RPCs hard-check role.' },
  'payments.quick_pay':
    { requires: ['super_admin', 'admin', 'finance'],
      reason: 'Quick Pay is restricted to approver roles by the Payments UI gate and RLS scope.' },

  // ── Batch types: RLS scopes Operations to contractor batches only ────────
  'payments.batch.salary':
    { requires: ['super_admin', 'admin', 'finance'],
      reason: 'Operations is RLS-scoped to contractor batches only (migration 20260927000000).' },
  'payments.batch.advance':
    { requires: ['super_admin', 'admin', 'finance'],
      reason: 'Operations is RLS-scoped to contractor batches only (migration 20260927000000).' },
  'payments.batch.bonus':
    { requires: ['super_admin', 'admin', 'finance'],
      reason: 'Operations is RLS-scoped to contractor batches only (migration 20260927000000).' },

  // ── Payroll: route + RPCs finance-only ────────────────────────────────────
  'payroll.view':
    { requires: ['super_admin', 'admin', 'finance'],
      reason: 'Payroll module is finance-only at the route level.' },
  'payroll.create':
    { requires: ['super_admin', 'admin', 'finance'],
      reason: 'Payroll creation is finance-only.' },
  'payroll.approve':
    { requires: ['super_admin', 'admin', 'finance'],
      reason: 'approve_payroll_run RPC hard-checks role.' },
  'payroll.generate_payslips':
    { requires: ['super_admin', 'admin', 'finance'],
      reason: 'Payslip generation requires payroll access (finance-only).' },

  // ── Expenses: approval / payment-processing finance-only ──────────────────
  'expenses.approve':
    { requires: ['super_admin', 'admin', 'finance'],
      reason: 'approve_expense / confirm_second_expense_approval RPCs hard-check role.' },
  'expenses.process_payments':
    { requires: ['super_admin', 'admin', 'finance'],
      reason: 'mark_expense_paid RPC and the expense-payment edge function hard-check role.' },

  // ── Sensitive user-admin actions ──────────────────────────────────────────
  'employees.change_roles':
    { requires: ['super_admin'],
      reason: 'Changing user roles requires super_admin.' },
  'employees.manage_permissions':
    { requires: ['super_admin', 'admin'],
      reason: 'Editing another user\'s permissions is admin / super_admin only.' },

  // ── Contractor / Disciplinary / Settings ──────────────────────────────────
  'contractors.delete':
    { requires: ['super_admin', 'admin'],
      reason: 'Contractor delete RPC is admin / super_admin only.' },
  'invoices.view':
    { requires: ['super_admin', 'admin', 'finance'],
      reason: 'Invoices module is finance-only.' },
  'invoices.manage':
    { requires: ['super_admin', 'admin', 'finance'],
      reason: 'Invoices module is finance-only.' },
  'assets.view':
    { requires: ['super_admin', 'admin', 'finance'],
      reason: 'Assets module is finance-only.' },
  'assets.manage':
    { requires: ['super_admin', 'admin', 'finance'],
      reason: 'Assets module is finance-only.' },
  'disciplinary.view':
    { requires: ['super_admin', 'admin'],
      reason: 'Disciplinary records are admin / super_admin only (RLS).' },
  'settings.access':
    { requires: ['super_admin'],
      reason: '/settings route is super_admin only.' },
  'settings.manage_integrations':
    { requires: ['super_admin'],
      reason: 'Integrations management is super_admin only.' },
};

interface PermissionItem {
  key: PermissionKey;
  label: string;
}

interface PermissionGroup {
  title: string;
  permissions: PermissionItem[];
}

const PERMISSION_GROUPS: PermissionGroup[] = [
  {
    title: 'Dashboard',
    permissions: [
      { key: 'dashboard.view_kpis', label: 'View KPIs' },
      { key: 'dashboard.view_audit_log', label: 'View audit log' },
    ],
  },
  {
    title: 'Payments',
    permissions: [
      { key: 'payments.view', label: 'View payments' },
      { key: 'payments.create', label: 'Create batches' },
      { key: 'payments.approve_batches', label: 'Approve batches' },
      { key: 'payments.quick_pay', label: 'Quick pay' },
    ],
  },
  {
    // Sub-permissions for the four batch types on /payments/new. Granting
    // `payments.create` alone gives a user access to Contractor batches
    // only — these toggles unlock the three HR-tier batches (salary run,
    // advance, bonus) which by default are admin / finance only.
    title: 'Payment batch types',
    permissions: [
      { key: 'payments.batch.contractor', label: 'Contractor payment' },
      { key: 'payments.batch.salary',     label: 'Employee salary run' },
      { key: 'payments.batch.advance',    label: 'Salary advance' },
      { key: 'payments.batch.bonus',      label: 'Bonus / prize' },
    ],
  },
  {
    title: 'Payroll',
    permissions: [
      { key: 'payroll.view', label: 'View payroll' },
      { key: 'payroll.create', label: 'Create payroll runs' },
      { key: 'payroll.approve', label: 'Approve payroll' },
      { key: 'payroll.generate_payslips', label: 'Generate payslips' },
    ],
  },
  {
    title: 'Expenses',
    permissions: [
      { key: 'expenses.view_all', label: 'View all expenses' },
      { key: 'expenses.submit', label: 'Submit expenses' },
      { key: 'expenses.approve', label: 'Approve expenses' },
      { key: 'expenses.process_payments', label: 'Process payments' },
    ],
  },
  {
    title: 'Fleet',
    permissions: [
      { key: 'fleet.view', label: 'View fleet' },
      { key: 'fleet.submit', label: 'Submit requests' },
      { key: 'fleet.approve_fuel_requests', label: 'Approve fuel requests' },
      { key: 'fleet.manage_vehicles', label: 'Manage vehicles' },
      { key: 'fleet.view_activity', label: 'View activity log' },
    ],
  },
  {
    title: 'Leave',
    permissions: [
      { key: 'leave.view_all', label: 'View all leave' },
      { key: 'leave.approve', label: 'Approve leave' },
    ],
  },
  {
    title: 'Contractors',
    permissions: [
      { key: 'contractors.view', label: 'View contractors' },
      { key: 'contractors.add', label: 'Add contractors' },
      { key: 'contractors.edit', label: 'Edit contractors' },
      { key: 'contractors.delete', label: 'Delete contractors' },
    ],
  },
  {
    title: 'Employees',
    permissions: [
      { key: 'employees.view', label: 'View employees' },
      { key: 'employees.invite', label: 'Invite employees' },
      { key: 'employees.edit', label: 'Edit employees' },
      { key: 'employees.change_roles', label: 'Change roles' },
      { key: 'employees.manage_permissions', label: 'Manage permissions' },
    ],
  },
  {
    title: 'Performance & Training',
    permissions: [
      { key: 'performance.view', label: 'View performance reviews' },
      { key: 'performance.manage', label: 'Manage performance reviews' },
      { key: 'training.view', label: 'View training records' },
      { key: 'training.manage', label: 'Manage training records' },
    ],
  },
  {
    title: 'Benefits & Onboarding',
    permissions: [
      { key: 'benefits.view', label: 'View benefits' },
      { key: 'benefits.manage', label: 'Manage benefits' },
      { key: 'onboarding.view', label: 'View onboarding checklists' },
      { key: 'onboarding.manage', label: 'Manage onboarding checklists' },
    ],
  },
  {
    title: 'Recruitment',
    permissions: [
      { key: 'recruitment.view', label: 'View job openings & applicants' },
      { key: 'recruitment.manage', label: 'Manage recruitment pipeline' },
    ],
  },
  {
    title: 'Attendance',
    permissions: [
      { key: 'attendance.view', label: 'View attendance records' },
      { key: 'attendance.manage', label: 'Record & edit attendance' },
    ],
  },
  {
    title: 'Disciplinary',
    permissions: [
      { key: 'disciplinary.view', label: 'View & manage disciplinary records' },
    ],
  },
  {
    title: 'Vendors & Clients',
    permissions: [
      { key: 'vendors.view', label: 'View vendors' },
      { key: 'vendors.manage', label: 'Manage vendors' },
      { key: 'clients.view', label: 'View clients' },
      { key: 'clients.manage', label: 'Manage clients' },
    ],
  },
  {
    title: 'Invoices & Assets',
    permissions: [
      { key: 'invoices.view', label: 'View invoices' },
      { key: 'invoices.manage', label: 'Manage invoices' },
      { key: 'assets.view', label: 'View assets' },
      { key: 'assets.manage', label: 'Manage assets' },
    ],
  },
  {
    title: 'Projects',
    permissions: [
      { key: 'projects.view', label: 'View projects' },
      { key: 'projects.manage', label: 'Manage projects & milestones' },
    ],
  },
  {
    title: 'Reports',
    permissions: [
      { key: 'reports.view', label: 'View reports' },
      { key: 'reports.export', label: 'Export reports' },
    ],
  },
  {
    title: 'Settings',
    permissions: [
      { key: 'settings.access', label: 'Access settings' },
      { key: 'settings.manage_integrations', label: 'Manage integrations' },
    ],
  },
];

interface Props {
  value: PermissionsMap;
  onChange: (updated: PermissionsMap) => void;
  disabled?: boolean;
  /** Role-default state: keys here are ON by default for the current user
   *  even when no explicit value is stored. Other keys default OFF.
   */
  roleDefaults?: PermissionKey[];
  /** Role of the user being edited. When set, toggles whose action is
   *  server-side role-gated (see PERMISSION_ROLE_GATES) and where the user's
   *  role isn't in the allowed list become disabled + visually locked so an
   *  admin doesn't think they've granted something the server will refuse. */
  userRole?: string;
}

export function PermissionsEditor({ value, onChange, disabled, roleDefaults = [], userRole }: Props) {
  const defaultsSet = new Set<string>(roleDefaults);

  /** A permission is "blocked by role" when there's a server-side gate AND
   *  the user's role isn't in the gate's allowed set. We render those toggles
   *  off, disabled, and badged so the admin knows the grant is moot. */
  const blockedByRole = (key: PermissionKey): { blocked: boolean; reason?: string; requires?: string[] } => {
    const gate = PERMISSION_ROLE_GATES[key];
    if (!gate || !userRole) return { blocked: false };
    if (gate.requires.includes(userRole)) return { blocked: false };
    return { blocked: true, reason: gate.reason, requires: gate.requires };
  };

  // A toggle is ON when:
  //   - the value is explicitly true, OR
  //   - the value is undefined and the role grants this permission by default
  //   - AND the permission isn't blocked by role (blocked → forced OFF
  //     regardless of stored value or role default, matching what the server
  //     actually does)
  const isChecked = (key: PermissionKey) => {
    if (blockedByRole(key).blocked) return false;
    const v = value[key];
    if (v === true) return true;
    if (v === false) return false;
    return defaultsSet.has(key);
  };

  const toggle = (key: PermissionKey) => {
    if (blockedByRole(key).blocked) return; // defence: clicks shouldn't reach here, but be safe
    onChange({ ...value, [key]: !isChecked(key) });
  };

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      {PERMISSION_GROUPS.map((group) => (
        <Card key={group.title}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              {group.title}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {group.permissions.map((perm) => {
              const blocked = blockedByRole(perm.key);
              const checked = isChecked(perm.key);
              const explicit = value[perm.key] === true || value[perm.key] === false;
              const friendlyRoles = blocked.requires?.map((r) =>
                r === 'super_admin' ? 'super admin' : r,
              ).join(' / ');
              return (
                <div
                  key={perm.key}
                  className={`flex items-center justify-between ${blocked.blocked ? 'opacity-60' : ''}`}
                  title={blocked.blocked ? blocked.reason : undefined}
                >
                  <Label
                    htmlFor={perm.key}
                    className={`text-sm font-normal flex items-center gap-2 ${blocked.blocked ? 'cursor-not-allowed' : 'cursor-pointer'}`}
                  >
                    <span>{perm.label}</span>
                    {blocked.blocked ? (
                      <span className="text-[10px] uppercase tracking-wider text-muted-foreground border border-border/60 rounded px-1.5 py-0.5">
                        {`needs ${friendlyRoles || 'higher role'}`}
                      </span>
                    ) : (
                      <>
                        {!explicit && checked && (
                          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">role</span>
                        )}
                        {explicit && value[perm.key] === true && !defaultsSet.has(perm.key) && (
                          <span className="text-[10px] uppercase tracking-wider text-success">granted</span>
                        )}
                        {explicit && value[perm.key] === false && (
                          <span className="text-[10px] uppercase tracking-wider text-destructive">denied</span>
                        )}
                      </>
                    )}
                  </Label>
                  <Switch
                    id={perm.key}
                    checked={checked}
                    onCheckedChange={() => toggle(perm.key)}
                    disabled={disabled || blocked.blocked}
                  />
                </div>
              );
            })}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

/**
 * Per-role default permissions. Used by PermissionsEditor to show which
 * toggles are ON by virtue of the role itself (vs. an explicit grant).
 * The route guards in App.tsx are the source of truth — this list mirrors
 * those gates and must stay in sync when routes are added or changed.
 */
export const ROLE_DEFAULT_PERMISSIONS: Record<string, PermissionKey[]> = {
  super_admin: PERMISSION_GROUPS.flatMap((g) => g.permissions.map((p) => p.key)),
  admin: [
    'dashboard.view_kpis', 'dashboard.view_audit_log',
    'payments.view', 'payments.create', 'payments.approve_batches', 'payments.quick_pay',
    'payments.batch.contractor', 'payments.batch.salary', 'payments.batch.advance', 'payments.batch.bonus',
    'payroll.view', 'payroll.create', 'payroll.approve', 'payroll.generate_payslips',
    'expenses.view_all', 'expenses.submit', 'expenses.approve', 'expenses.process_payments',
    'fleet.view', 'fleet.submit', 'fleet.approve_fuel_requests', 'fleet.manage_vehicles', 'fleet.view_activity',
    'leave.view_all', 'leave.approve',
    'contractors.view', 'contractors.add', 'contractors.edit', 'contractors.delete',
    'employees.view', 'employees.invite', 'employees.edit', 'employees.change_roles',
    'performance.view', 'performance.manage',
    'training.view', 'training.manage',
    'benefits.view', 'benefits.manage',
    'onboarding.view', 'onboarding.manage',
    'recruitment.view', 'recruitment.manage',
    'attendance.view', 'attendance.manage',
    'disciplinary.view',
    'vendors.view', 'vendors.manage',
    'clients.view', 'clients.manage',
    'invoices.view', 'invoices.manage',
    'assets.view', 'assets.manage',
    'projects.view', 'projects.manage',
    'reports.view', 'reports.export',
    // Settings is super_admin only at the route level — admin cannot access /settings
  ],
  finance: [
    'dashboard.view_kpis', 'dashboard.view_audit_log',
    'payments.view', 'payments.create', 'payments.approve_batches', 'payments.quick_pay',
    'payments.batch.contractor', 'payments.batch.salary', 'payments.batch.advance', 'payments.batch.bonus',
    'payroll.view', 'payroll.create', 'payroll.approve', 'payroll.generate_payslips',
    'expenses.view_all', 'expenses.submit', 'expenses.approve', 'expenses.process_payments',
    'fleet.view', 'fleet.approve_fuel_requests', 'fleet.view_activity',
    'leave.view_all',
    'contractors.view', 'contractors.add', 'contractors.edit',
    'employees.view',
    'performance.view', 'performance.manage',
    'training.view', 'training.manage',
    'benefits.view', 'benefits.manage',
    'onboarding.view', 'onboarding.manage',
    'recruitment.view', 'recruitment.manage',
    'attendance.view', 'attendance.manage',
    'vendors.view', 'vendors.manage',
    'clients.view', 'clients.manage',
    'invoices.view', 'invoices.manage',
    'assets.view', 'assets.manage',
    'projects.view', 'projects.manage',
    'reports.view', 'reports.export',
  ],
  // Operations role — explicitly NO payroll, NO payments, NO payment-batch
  // creation. Operations runs the people side: contractors, employees,
  // benefits, training, onboarding, attendance. Financial actions stay
  // with finance / admin unless granted as a per-user override.
  operations: [
    'dashboard.view_kpis',
    'expenses.view_all', 'expenses.submit',
    'fleet.view', 'fleet.submit',
    'leave.view_all', 'leave.approve',
    'contractors.view',
    'employees.view',
    'performance.view', 'performance.manage',
    'training.view', 'training.manage',
    'benefits.view', 'benefits.manage',
    'onboarding.view', 'onboarding.manage',
    'recruitment.view', 'recruitment.manage',
    'attendance.view', 'attendance.manage',
    'vendors.view', 'vendors.manage',
    'clients.view', 'clients.manage',
    'projects.view', 'projects.manage',
  ],
  // Field staff — submit-only role. Sees expenses they raise + fleet
  // fuel/trip submissions. No view_all, no approvals, no batch creation.
  field_staff: [
    'expenses.submit',
    'fleet.submit',
  ],
  driver: [
    'fleet.submit',
  ],
};

export { PERMISSION_GROUPS };
