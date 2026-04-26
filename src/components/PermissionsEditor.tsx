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
  | 'reports.view'
  | 'reports.export'
  | 'settings.access'
  | 'settings.manage_integrations';

export type PermissionsMap = Record<string, boolean>;

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
}

export function PermissionsEditor({ value, onChange, disabled, roleDefaults = [] }: Props) {
  const defaultsSet = new Set<string>(roleDefaults);

  // A toggle is ON when:
  //   - the value is explicitly true, OR
  //   - the value is undefined and the role grants this permission by default
  const isChecked = (key: PermissionKey) => {
    const v = value[key];
    if (v === true) return true;
    if (v === false) return false;
    return defaultsSet.has(key);
  };

  const toggle = (key: PermissionKey) => {
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
              const checked = isChecked(perm.key);
              const explicit = value[perm.key] === true || value[perm.key] === false;
              return (
                <div key={perm.key} className="flex items-center justify-between">
                  <Label
                    htmlFor={perm.key}
                    className="text-sm font-normal cursor-pointer flex items-center gap-2"
                  >
                    <span>{perm.label}</span>
                    {!explicit && checked && (
                      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">role</span>
                    )}
                    {explicit && value[perm.key] === true && !defaultsSet.has(perm.key) && (
                      <span className="text-[10px] uppercase tracking-wider text-success">granted</span>
                    )}
                    {explicit && value[perm.key] === false && (
                      <span className="text-[10px] uppercase tracking-wider text-destructive">denied</span>
                    )}
                  </Label>
                  <Switch
                    id={perm.key}
                    checked={checked}
                    onCheckedChange={() => toggle(perm.key)}
                    disabled={disabled}
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
    'payroll.view', 'payroll.create', 'payroll.approve', 'payroll.generate_payslips',
    'expenses.view_all', 'expenses.submit', 'expenses.approve', 'expenses.process_payments',
    'fleet.view', 'fleet.submit', 'fleet.approve_fuel_requests', 'fleet.manage_vehicles',
    'leave.view_all', 'leave.approve',
    'contractors.view', 'contractors.add', 'contractors.edit', 'contractors.delete',
    'employees.view', 'employees.invite', 'employees.edit', 'employees.change_roles',
    'reports.view', 'reports.export',
    'settings.access', 'settings.manage_integrations',
  ],
  finance: [
    'dashboard.view_kpis', 'dashboard.view_audit_log',
    'payments.view', 'payments.create', 'payments.approve_batches', 'payments.quick_pay',
    'payroll.view', 'payroll.create', 'payroll.approve', 'payroll.generate_payslips',
    'expenses.view_all', 'expenses.submit', 'expenses.approve', 'expenses.process_payments',
    'fleet.view', 'fleet.approve_fuel_requests',
    'leave.view_all',
    'contractors.view', 'contractors.add', 'contractors.edit',
    'employees.view',
    'reports.view', 'reports.export',
  ],
  operations: [
    'dashboard.view_kpis',
    'expenses.view_all', 'expenses.submit',
    'fleet.view', 'fleet.submit',
    'leave.view_all', 'leave.approve',
    'contractors.view',
    'employees.view',
  ],
  field_staff: [
    'expenses.submit',
    'fleet.submit',
  ],
  driver: [
    'fleet.submit',
  ],
};

export { PERMISSION_GROUPS };
