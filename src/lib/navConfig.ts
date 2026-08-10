/**
 * Single source of truth for the platform's navigation tree.
 *
 * Both AppSidebar (desktop) and MobileNav (PWA) import from here, so
 * a permission, role, or new module added in one place automatically
 * appears in the other. Before this file existed, the two sidebars
 * were duplicating the nav list manually and drifted: the mobile
 * MobileNav had a shorter set of items AND lacked the
 * permission-based filtering that desktop has, so an admin who
 * granted e.g. payments.view to a field user saw it appear in the
 * desktop sidebar but NOT on the user's phone. Don't redo that
 * mistake — both sidebars must read from this module.
 */

import {
  LayoutDashboard,
  CreditCard,
  Truck,
  Receipt,
  Users,
  UserCog,
  Settings,
  Inbox,
  CalendarClock,
  PiggyBank,
  FileText,
  FilePlus2,
  BarChart3,
  CalendarDays,
  ShieldCheck,
  Banknote,
  ListTodo,
  BookOpen,
  ScrollText,
  Target,
  Gift,
  Contact2,
  Mail,
  Building2,
  ArrowUpDown,
  Layers,
  Store,
  Star,
  Package,
  GraduationCap,
  FolderKanban,
  HeartPulse,
  UserCheck,
  UserPlus2,
  CalendarCheck2,
  ShieldAlert,
  Bot,
  Wallet,
  Siren,
  Activity,
  Gauge,
  Link2,
} from 'lucide-react';
import type { Role } from '@/lib/roles';

export type NavItem = {
  title: string;
  url: string;
  icon: typeof LayoutDashboard;
  roles: Role[];
  /** Optional permission key. If the user's role isn't in `roles`,
   *  the item is still shown when this permission is explicitly
   *  granted on the profile (`permissions[key] === true`). Mirrors
   *  the gating logic used by RoleGuard and useFeatureAccess so the
   *  sidebar never lies — if the user can navigate to the route,
   *  the link shows. */
  permission?: string;
  /** Live counter badge — payload sourced by the consumer. */
  badge?: 'approvals' | 'anomalies';
};

export const ALL_NAV: NavItem[] = [
  { title: 'Dashboard',        url: '/',                  icon: LayoutDashboard, roles: ['super_admin', 'admin', 'finance', 'operations', 'field_staff', 'driver'] },
  { title: 'Approvals',        url: '/approvals',         icon: Inbox,           roles: ['super_admin', 'admin', 'finance'], badge: 'approvals', permission: 'payments.approve_batches' },
  // Finance
  { title: 'Payments',         url: '/payments',          icon: Layers,          roles: ['super_admin', 'admin', 'finance', 'operations'], permission: 'payments.view' },
  { title: 'Payment Schedule', url: '/payments/schedule', icon: CalendarClock,   roles: ['super_admin', 'admin', 'finance', 'operations'], permission: 'payments.view' },
  { title: 'Transactions',     url: '/transactions',      icon: ArrowUpDown,     roles: ['super_admin', 'admin', 'finance', 'operations'], permission: 'payments.view' },
  { title: 'Payroll',          url: '/payroll',           icon: Banknote,        roles: ['super_admin', 'admin', 'finance'], permission: 'payroll.view' },
  { title: 'Earned Wages',     url: '/ewa',               icon: Wallet,          roles: ['super_admin', 'admin', 'finance', 'operations', 'field_staff', 'driver'] },
  { title: 'Subscriptions',    url: '/subscriptions',     icon: CalendarClock,   roles: ['super_admin', 'admin', 'finance'] },
  { title: 'Budgets',          url: '/budgets',           icon: PiggyBank,       roles: ['super_admin', 'admin', 'finance'] },
  { title: 'Cards',            url: '/cards',             icon: CreditCard,      roles: ['super_admin', 'admin', 'finance'] },
  { title: 'Invoices',         url: '/invoices',          icon: FilePlus2,       roles: ['super_admin', 'admin', 'finance'] },
  { title: 'Assets',           url: '/assets',            icon: Package,         roles: ['super_admin', 'admin', 'finance'] },
  { title: 'Compliance',       url: '/compliance',        icon: ShieldCheck,     roles: ['super_admin', 'admin', 'finance'] },
  { title: 'Anomalies',        url: '/anomalies',         icon: Siren,           roles: ['super_admin', 'admin', 'finance'], badge: 'anomalies' },
  { title: 'Cash Flow',        url: '/cashflow',          icon: Activity,        roles: ['super_admin', 'admin', 'finance'] },
  { title: 'Finance',          url: '/finance',           icon: Gauge,           roles: ['super_admin', 'admin', 'finance'] },
  // Operations
  { title: 'Expenses',         url: '/expenses',          icon: Receipt,         roles: ['super_admin', 'admin', 'finance', 'operations', 'field_staff', 'driver'], permission: 'expenses.submit' },
  { title: 'Fleet',            url: '/fleet',             icon: Truck,           roles: ['super_admin', 'admin', 'operations', 'field_staff', 'driver'], permission: 'fleet.view' },
  { title: 'Contractors',      url: '/contractors',       icon: Users,           roles: ['super_admin', 'admin', 'finance', 'operations'], permission: 'contractors.view' },
  // Employees, Disciplinary, Audit Log, Settings — STRICT role only.
  // These touch HR records, financial audit, and platform configuration;
  // delegation needs to be deliberate, so the bar is "change the user's
  // role" rather than "toggle a permission". Without this guard a single
  // stale `*.access: true` left in a profile from an earlier admin edit
  // would re-expose the entire admin surface to a downgraded user.
  { title: 'Employees',        url: '/employees',         icon: UserCog,         roles: ['super_admin', 'admin'] },
  { title: 'Leave',            url: '/leave',             icon: CalendarDays,    roles: ['super_admin', 'admin', 'finance', 'operations', 'field_staff', 'driver'] },
  { title: 'Performance',      url: '/performance',       icon: Star,            roles: ['super_admin', 'admin', 'finance', 'operations'], permission: 'performance.view' },
  { title: 'Training',         url: '/training',          icon: GraduationCap,   roles: ['super_admin', 'admin', 'finance', 'operations'], permission: 'training.view' },
  { title: 'Benefits',         url: '/benefits',          icon: HeartPulse,      roles: ['super_admin', 'admin', 'finance', 'operations'], permission: 'benefits.view' },
  { title: 'Onboarding',       url: '/onboarding',        icon: UserCheck,       roles: ['super_admin', 'admin', 'finance', 'operations'], permission: 'onboarding.view' },
  { title: 'Recruitment',      url: '/recruitment',       icon: UserPlus2,       roles: ['super_admin', 'admin', 'finance', 'operations'], permission: 'recruitment.view' },
  { title: 'Attendance',       url: '/attendance',        icon: CalendarCheck2,  roles: ['super_admin', 'admin', 'finance', 'operations'], permission: 'attendance.view' },
  { title: 'Disciplinary',     url: '/disciplinary',      icon: ShieldAlert,     roles: ['super_admin', 'admin'] },
  { title: 'Vendors',          url: '/vendors',           icon: Store,           roles: ['super_admin', 'admin', 'finance', 'operations'], permission: 'vendors.view' },
  // Workspace
  { title: 'Tasks',            url: '/tasks',             icon: ListTodo,        roles: ['super_admin', 'admin', 'finance', 'operations', 'field_staff', 'driver'] },
  { title: 'Projects',         url: '/projects',          icon: FolderKanban,    roles: ['super_admin', 'admin', 'finance', 'operations'], permission: 'projects.view' },
  { title: 'Goals',            url: '/goals',             icon: Target,          roles: ['super_admin', 'admin', 'finance', 'operations', 'field_staff', 'driver'] },
  { title: 'Knowledge',        url: '/knowledge',         icon: BookOpen,        roles: ['super_admin', 'admin', 'finance', 'operations', 'field_staff', 'driver'] },
  { title: 'Documents',        url: '/documents',         icon: FileText,        roles: ['super_admin', 'admin', 'finance'] },
  { title: 'Reports',          url: '/reports',           icon: BarChart3,       roles: ['super_admin', 'admin', 'finance'], permission: 'reports.view' },
  { title: 'HR Analytics',     url: '/hr-analytics',      icon: BarChart3,       roles: ['super_admin', 'admin', 'finance'], permission: 'reports.view' },
  // CRM
  { title: 'Clients',          url: '/clients',           icon: Building2,       roles: ['super_admin', 'admin', 'finance', 'operations'], permission: 'clients.view' },
  { title: 'Contacts',         url: '/contacts',          icon: Contact2,        roles: ['super_admin', 'admin', 'finance', 'operations'] },
  { title: 'Referrals',        url: '/referrals',         icon: Gift,            roles: ['super_admin', 'admin', 'finance', 'operations', 'field_staff', 'driver'] },
  { title: 'Public Links',     url: '/public-links',      icon: Link2,           roles: ['super_admin', 'admin', 'finance', 'operations'] },
  { title: 'Communications',   url: '/communications',    icon: Mail,            roles: ['super_admin', 'admin', 'finance'] },
  // Admin — strict role only (see comment block above).
  { title: 'Audit Log',        url: '/audit',             icon: ScrollText,      roles: ['super_admin', 'admin'] },
  { title: 'Settings',         url: '/settings',          icon: Settings,        roles: ['super_admin'] },
  // Workspace addition (Assistant)
  { title: 'Assistant',        url: '/assistant',         icon: Bot,             roles: ['super_admin', 'admin', 'finance', 'operations', 'field_staff', 'driver'] },
];

// Grouped by money-flow direction and function rather than department —
// "Finance" and "Treasury" used to mix calculation tools (Payroll) with
// movement tools (Cards) with balance-sheet tools (Assets) under one label.
// Money Out / Money In & Treasury / Risk & Controls maps to how a finance
// person actually thinks about these modules, and puts a visible seam in
// the nav between "calculating payroll" and "moving money" that mirrors
// the hard line already enforced at the database layer.
export const NAV_GROUPS = [
  { key: 'moneyOut',   label: 'Money Out',          titles: ['Payments', 'Payment Schedule', 'Transactions', 'Payroll', 'Earned Wages', 'Subscriptions', 'Cards', 'Expenses'] },
  { key: 'moneyIn',    label: 'Money In & Treasury', titles: ['Invoices', 'Assets', 'Cash Flow'] },
  { key: 'risk',       label: 'Risk & Controls',    titles: ['Budgets', 'Compliance', 'Anomalies', 'Audit Log'] },
  { key: 'people',     label: 'People & Contractors', titles: ['Contractors', 'Employees', 'Leave', 'Performance', 'Training', 'Benefits', 'Onboarding', 'Recruitment', 'Attendance', 'Disciplinary'] },
  { key: 'operations', label: 'Operations',         titles: ['Fleet', 'Vendors'] },
  { key: 'workspace',  label: 'Workspace',          titles: ['Assistant', 'Tasks', 'Projects', 'Goals', 'Knowledge', 'Documents', 'Reports', 'HR Analytics'] },
  { key: 'crm',        label: 'CRM',                titles: ['Clients', 'Contacts', 'Referrals', 'Public Links', 'Communications'] },
  { key: 'admin',      label: 'Admin',              titles: ['Settings'] },
] as const;

export type NavGroupKey = (typeof NAV_GROUPS)[number]['key'];

/** Items above all groups (always visible at the top). Finance sits here
 *  too — it's a CFO-level hub aggregating Payroll/Compliance/Budgets/
 *  Vendors/Cash data, not a peer of the line items inside any one group. */
export const UNGROUPED_TITLES = ['Dashboard', 'Approvals', 'Finance'];

/**
 * Filters ALL_NAV using the same role + permission logic the desktop
 * sidebar uses, so MobileNav can mirror it exactly.
 *
 * permissions = profile.permissions JSONB (or null when in view-as
 * mode — see AppSidebar for why we suppress permissions during sim).
 */
export function filterNavByRoleAndPermissions(
  items: NavItem[],
  role: Role | undefined,
  permissions: Record<string, boolean> | null | undefined,
): NavItem[] {
  return items.filter((n) => {
    const explicitDeny = n.permission && permissions?.[n.permission] === false;
    if (explicitDeny) return false;
    const explicitGrant = n.permission && permissions?.[n.permission] === true;
    if (explicitGrant) return true;
    return role ? n.roles.includes(role) : true;
  });
}
