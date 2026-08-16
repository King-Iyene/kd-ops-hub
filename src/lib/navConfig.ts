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
  Briefcase,
  ArrowUpDown,
  Landmark,
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
  MessageSquare,
  FileSignature,
  ClipboardList,
  AlertTriangle,
  HandCoins,
  Clock4,
  Replace,
  BookMarked,
  Timer,
  LayoutGrid,
  GitBranch,
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
  { title: 'My Portal',        url: '/my-dashboard',      icon: LayoutGrid,      roles: ['super_admin', 'admin', 'finance', 'operations', 'field_staff', 'driver'] },
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
  { title: 'Finance',          url: '/finance',           icon: Gauge,           roles: ['super_admin'] },
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
  { title: 'Placements',       url: '/placements',        icon: Briefcase,       roles: ['super_admin'] },
  { title: 'Attendance',       url: '/attendance',        icon: CalendarCheck2,  roles: ['super_admin', 'admin', 'finance', 'operations'], permission: 'attendance.view' },
  { title: 'Disciplinary',     url: '/disciplinary',      icon: ShieldAlert,     roles: ['super_admin', 'admin'] },
  { title: 'HR Letters',       url: '/hr-letters',        icon: FileSignature,   roles: ['super_admin', 'admin'] },
  { title: 'Surveys',          url: '/surveys',           icon: ClipboardList,   roles: ['super_admin', 'admin', 'finance', 'operations'], permission: 'surveys.view' },
  { title: 'Grievances',       url: '/grievances',        icon: AlertTriangle,   roles: ['super_admin', 'admin'] },
  { title: 'Staff Loans',      url: '/staff-loans',       icon: HandCoins,       roles: ['super_admin', 'admin', 'finance'] },
  { title: 'Shifts',           url: '/shifts',            icon: Clock4,          roles: ['super_admin', 'admin', 'finance', 'operations'], permission: 'shifts.view' },
  { title: 'Succession',       url: '/succession',        icon: Replace,         roles: ['super_admin', 'admin'] },
  { title: 'Handbook',         url: '/handbook',          icon: BookMarked,      roles: ['super_admin', 'admin', 'finance', 'operations', 'field_staff', 'driver'] },
  { title: 'Timesheets',       url: '/timesheets',        icon: Timer,           roles: ['super_admin', 'admin', 'finance', 'operations'], permission: 'timesheets.view' },
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
  { title: 'Approval Workflows', url: '/approval-workflows', icon: GitBranch,    roles: ['super_admin', 'admin'] },
  { title: 'Audit Log',        url: '/audit',             icon: ScrollText,      roles: ['super_admin', 'admin'] },
  { title: 'Settings',         url: '/settings',          icon: Settings,        roles: ['super_admin'] },
  { title: 'Principal Disbursements', url: '/principal-disbursements', icon: Landmark, roles: ['super_admin'] },
  // Workspace addition (Assistant)
  { title: 'Assistant',        url: '/assistant',         icon: Bot,             roles: ['super_admin', 'admin', 'finance', 'operations', 'field_staff', 'driver'] },
  { title: 'Messages',         url: '/messages',          icon: MessageSquare,   roles: ['super_admin', 'admin', 'finance', 'operations', 'field_staff', 'driver'] },
  { title: 'Company Guide',    url: '/guide',             icon: BookOpen,        roles: ['super_admin', 'admin', 'finance', 'operations', 'field_staff', 'driver'] },
];

// Grouped by money-flow direction and function rather than department —
// "Finance" and "Treasury" used to mix calculation tools (Payroll) with
// movement tools (Cards) with balance-sheet tools (Assets) under one label.
// Money Out / Money In & Treasury / Risk & Controls maps to how a finance
// person actually thinks about these modules, and puts a visible seam in
// the nav between "calculating payroll" and "moving money" that mirrors
// the hard line already enforced at the database layer.
export const NAV_GROUPS = [
  { key: 'moneyOut',   label: 'Money Out',           titles: ['Payments', 'Payment Schedule', 'Transactions', 'Payroll', 'Earned Wages', 'Subscriptions', 'Cards', 'Expenses'] },
  { key: 'moneyIn',    label: 'Money In & Treasury',  titles: ['Invoices', 'Assets', 'Cash Flow', 'Clients'] },
  { key: 'risk',       label: 'Risk & Controls',     titles: ['Budgets', 'Compliance', 'Anomalies', 'Audit Log'] },
  { key: 'people',     label: 'People & HR',         titles: ['Contractors', 'Employees', 'Placements', 'Leave', 'Performance', 'Training', 'Benefits', 'Onboarding', 'Recruitment', 'Attendance', 'Disciplinary', 'HR Letters', 'Surveys', 'Grievances', 'Staff Loans', 'Shifts', 'Succession', 'Handbook', 'Timesheets'] },
  { key: 'operations', label: 'Operations',          titles: ['Fleet', 'Vendors'] },
  { key: 'workspace',  label: 'Workspace',           titles: ['Assistant', 'Messages', 'Tasks', 'Projects', 'Goals', 'Knowledge', 'Documents', 'Reports', 'HR Analytics', 'Company Guide'] },
  { key: 'crm',        label: 'CRM',                 titles: ['Contacts', 'Referrals', 'Public Links', 'Communications'] },
  { key: 'admin',      label: 'Admin',               titles: ['Approval Workflows', 'Settings', 'Principal Disbursements'] },
] as const;

export type NavGroupKey = (typeof NAV_GROUPS)[number]['key'];

export const UNGROUPED_TITLES = ['Dashboard', 'My Portal', 'Approvals', 'Finance'];

export type SidebarHub = {
  key: string;
  label: string;
  description: string;
  icon: string;
  color: string;
  iconBg: string;
  groups: NavGroupKey[];
};

export const SIDEBAR_HUBS: SidebarHub[] = [
  {
    key: 'finance',
    label: 'Finance',
    description: 'Payments, payroll & treasury',
    icon: 'Landmark',
    color: 'text-emerald-400',
    iconBg: 'bg-emerald-500/15',
    groups: ['moneyOut', 'moneyIn', 'risk'],
  },
  {
    key: 'people',
    label: 'People & HR',
    description: 'Staff, leave & compliance',
    icon: 'Users',
    color: 'text-blue-400',
    iconBg: 'bg-blue-500/15',
    groups: ['people'],
  },
  {
    key: 'operations',
    label: 'Operations',
    description: 'Fleet & vendor management',
    icon: 'Truck',
    color: 'text-amber-400',
    iconBg: 'bg-amber-500/15',
    groups: ['operations'],
  },
  {
    key: 'workspace',
    label: 'Workspace',
    description: 'Tasks, docs & reports',
    icon: 'Layers',
    color: 'text-violet-400',
    iconBg: 'bg-violet-500/15',
    groups: ['workspace'],
  },
  {
    key: 'crm',
    label: 'CRM',
    description: 'Clients, contacts & outreach',
    icon: 'Contact2',
    color: 'text-sky-400',
    iconBg: 'bg-sky-500/15',
    groups: ['crm'],
  },
  {
    key: 'admin',
    label: 'Admin',
    description: 'Settings & audit controls',
    icon: 'Settings',
    color: 'text-slate-400',
    iconBg: 'bg-slate-500/15',
    groups: ['admin'],
  },
];

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
