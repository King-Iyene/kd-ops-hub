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
  LayoutPanelTop,
  Database,
  Table2,
  Code2,
  Globe,
  Clock,
  FolderKanban,
  DollarSign,
  CheckSquare,
  Palmtree,
  CalendarRange,
  MonitorSmartphone,
  Search,
  MapPin,
  History,
  Tags,
  Image as ImageIcon,
} from 'lucide-react';
import type { Role } from '@/lib/roles';

export type NavItem = {
  title: string;
  /** Text actually shown in the sidebar/mobile nav. Falls back to `title`
   *  when omitted. Needed because `title` must be globally unique (it's
   *  the React key and the string NAV_GROUPS filters on), while TimeCamp
   *  itself reuses the same visible label ("By days", "Detailed", …) across
   *  more than one group — disambiguated there only by the group header
   *  above it. */
  label?: string;
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
  { title: 'Dashboard',        url: '/',                  icon: LayoutDashboard, roles: ['super_admin', 'admin', 'finance', 'operations', 'field_staff'] },
  { title: 'Approvals',        url: '/approvals',         icon: Inbox,           roles: ['super_admin', 'admin', 'finance'], badge: 'approvals', permission: 'payments.approve_batches' },
  { title: 'My Portal',        url: '/my-dashboard',      icon: LayoutGrid,      roles: ['super_admin', 'admin', 'finance', 'operations', 'field_staff'] },
  // Finance
  { title: 'Payments',         url: '/payments',          icon: Layers,          roles: ['super_admin', 'admin', 'finance', 'operations'], permission: 'payments.view' },
  { title: 'Payment Schedule', url: '/payments/schedule', icon: CalendarClock,   roles: ['super_admin', 'admin', 'finance', 'operations'], permission: 'payments.view' },
  { title: 'Transactions',     url: '/transactions',      icon: ArrowUpDown,     roles: ['super_admin', 'admin', 'finance', 'operations'], permission: 'payments.view' },
  { title: 'Pay Hub',          url: '/pay-hub',           icon: LayoutPanelTop,  roles: ['super_admin', 'admin', 'finance'], permission: 'payroll.view' },
  { title: 'Payroll',          url: '/payroll',           icon: Banknote,        roles: ['super_admin', 'admin', 'finance'], permission: 'payroll.view' },
  { title: 'Earned Wages',     url: '/ewa',               icon: Wallet,          roles: ['super_admin', 'admin', 'finance', 'operations', 'field_staff'] },
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
  { title: 'Expenses',         url: '/expenses',          icon: Receipt,         roles: ['super_admin', 'admin', 'finance', 'operations', 'field_staff'], permission: 'expenses.submit' },
  // Operations module (Fleet, Vendors) — admin/super_admin only, no
  // per-user permission override: matches the RoleGuard on these routes.
  { title: 'Fleet',            url: '/fleet',             icon: Truck,           roles: ['super_admin', 'admin'] },
  { title: 'Contractors',      url: '/contractors',       icon: Users,           roles: ['super_admin', 'admin', 'finance', 'operations'], permission: 'contractors.view' },
  // Employees, Disciplinary, Audit Log, Settings — STRICT role only.
  // These touch HR records, financial audit, and platform configuration;
  // delegation needs to be deliberate, so the bar is "change the user's
  // role" rather than "toggle a permission". Without this guard a single
  // stale `*.access: true` left in a profile from an earlier admin edit
  // would re-expose the entire admin surface to a downgraded user.
  { title: 'Employees',        url: '/employees',         icon: UserCog,         roles: ['super_admin', 'admin'] },
  { title: 'Leave',            url: '/leave',             icon: CalendarDays,    roles: ['super_admin', 'admin', 'finance', 'operations', 'field_staff'] },
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
  { title: 'Handbook',         url: '/handbook',          icon: BookMarked,      roles: ['super_admin', 'admin', 'finance', 'operations', 'field_staff'] },
  { title: 'Timesheets',       url: '/timesheets',        icon: Timer,           roles: ['super_admin', 'admin', 'finance', 'operations'], permission: 'timesheets.view' },
  // Time Tracking — standalone module (own sidebar section, like CRM/Operations).
  { title: 'Time Dashboard',   url: '/timetrack',         icon: Clock,           roles: ['super_admin', 'admin', 'finance', 'operations', 'field_staff'] },
  { title: 'Time Entries',     url: '/timetrack/time',    icon: Timer,           roles: ['super_admin', 'admin', 'finance', 'operations', 'field_staff'] },
  { title: 'Time Projects',    url: '/timetrack/projects', icon: FolderKanban,   roles: ['super_admin', 'admin', 'finance', 'operations', 'field_staff'] },
  // Reports > Time > Time
  { title: 'Reports: Summary',  label: 'Summary',  url: '/timetrack/reports/summary',  icon: BarChart3, roles: ['super_admin', 'admin', 'finance', 'operations', 'field_staff'] },
  { title: 'Reports: Detailed', label: 'Detailed', url: '/timetrack/reports/detailed', icon: Search,    roles: ['super_admin', 'admin', 'finance', 'operations', 'field_staff'] },
  { title: 'Reports: By days (Time)', label: 'By days', url: '/timetrack/reports/by-days', icon: CalendarDays, roles: ['super_admin', 'admin', 'finance', 'operations', 'field_staff'] },
  { title: 'Reports: Pivot Table', label: 'Pivot Table', url: '/timetrack/reports/pivot', icon: Table2, roles: ['super_admin', 'admin', 'finance', 'operations', 'field_staff'] },
  // Reports > Time > People
  { title: 'Reports: By tasks',          label: 'By tasks',          url: '/timetrack/reports/people-by-tasks',       icon: Users, roles: ['super_admin', 'admin', 'finance', 'operations', 'field_staff'] },
  { title: 'Reports: By days and tasks', label: 'By days and tasks', url: '/timetrack/reports/people-by-days-tasks',  icon: Users, roles: ['super_admin', 'admin', 'finance', 'operations', 'field_staff'] },
  { title: 'Reports: By days (People)',  label: 'By days',           url: '/timetrack/reports/people-by-days',        icon: Users, roles: ['super_admin', 'admin', 'finance', 'operations', 'field_staff'] },
  { title: 'Reports: By projects',       label: 'By projects',       url: '/timetrack/reports/people-by-projects',    icon: Users, roles: ['super_admin', 'admin', 'finance', 'operations', 'field_staff'] },
  // Reports > Time > Other
  { title: 'Reports: Location report',     label: 'Location report',     url: '/timetrack/reports/location',  icon: MapPin,          roles: ['super_admin', 'admin', 'finance', 'operations', 'field_staff'] },
  { title: 'Reports: Real-time dashboard', label: 'Real-time dashboard', url: '/timetrack/reports/dashboard', icon: LayoutDashboard, roles: ['super_admin', 'admin', 'finance', 'operations', 'field_staff'] },
  // Finance — its own hub, like TimeCamp's own left nav ($ icon, separate
  // from the Reports > Time hub above.
  { title: 'Finance: Billable, non-billable', label: 'Billable, non-billable', url: '/timetrack/finance/billable',  icon: Receipt,    roles: ['super_admin', 'admin', 'finance', 'operations'] },
  { title: 'Finance: Estimates',              label: 'Estimates',              url: '/timetrack/finance/estimates', icon: Gauge,      roles: ['super_admin', 'admin', 'finance', 'operations'] },
  { title: 'Finance: Revenues',               label: 'Revenues',               url: '/timetrack/finance/revenues',  icon: HandCoins,  roles: ['super_admin', 'admin', 'finance', 'operations'] },
  { title: 'Finance: Costs',                  label: 'Costs',                  url: '/timetrack/finance/costs',     icon: Wallet,     roles: ['super_admin', 'admin', 'finance', 'operations'] },
  { title: 'Finance: Margin',                 label: 'Margin',                 url: '/timetrack/finance/margin',    icon: ArrowUpDown, roles: ['super_admin', 'admin', 'finance', 'operations'] },
  { title: 'Time Approvals',   url: '/timetrack/approvals', icon: CheckSquare,   roles: ['super_admin', 'admin', 'finance', 'operations', 'field_staff'] },
  { title: 'Time Leave',       url: '/timetrack/leave',   icon: Palmtree,        roles: ['super_admin', 'admin', 'finance', 'operations', 'field_staff'] },
  { title: 'Time Attendance',  url: '/timetrack/attendance', icon: CalendarCheck2, roles: ['super_admin', 'admin', 'finance', 'operations', 'field_staff'] },
  { title: 'Time Planner',     url: '/timetrack/planner', icon: CalendarRange,   roles: ['super_admin', 'admin', 'finance', 'operations', 'field_staff'] },
  { title: 'Time Clients & Invoices', url: '/timetrack/clients', icon: Receipt, roles: ['super_admin', 'admin', 'finance', 'operations'] },
  { title: 'Time Billing Rates', url: '/timetrack/rates', icon: DollarSign,     roles: ['super_admin', 'admin', 'finance', 'operations'] },
  { title: 'Time Roles',       url: '/timetrack/roles',   icon: ShieldCheck,     roles: ['super_admin', 'admin'] },
  { title: 'Activity: Summary',       url: '/timetrack/activity/summary',     icon: LayoutDashboard, roles: ['super_admin', 'admin'] },
  { title: 'Activity: Sites and apps', url: '/timetrack/activity/sites-apps', icon: Globe,           roles: ['super_admin', 'admin'] },
  { title: 'Activity: Categories',     url: '/timetrack/activity/categories', icon: Tags,            roles: ['super_admin', 'admin'] },
  { title: 'Activity: Efficiency',     url: '/timetrack/activity/efficiency', icon: Gauge,            roles: ['super_admin', 'admin'] },
  { title: 'Activity: Goals',          url: '/timetrack/activity/goals',       icon: Target,          roles: ['super_admin', 'admin'] },
  { title: 'Activity: Timeline',       url: '/timetrack/activity/timeline',   icon: History,          roles: ['super_admin', 'admin'] },
  { title: 'Activity: User statistics', url: '/timetrack/activity/stats',     icon: Users,            roles: ['super_admin', 'admin'] },
  { title: 'Activity: Remote work detection', url: '/timetrack/activity/remote-work', icon: ShieldAlert, roles: ['super_admin', 'admin'] },
  { title: 'Activity: Screenshots',    url: '/timetrack/activity/screenshots', icon: ImageIcon,       roles: ['super_admin', 'admin'] },
  { title: 'Time Agent & Policy',      url: '/timetrack/activity/config',     icon: Settings,         roles: ['super_admin', 'admin'] },
  { title: 'Time Settings',    url: '/timetrack/settings', icon: Settings,        roles: ['super_admin', 'admin'] },
  { title: 'Time Kiosk',       url: '/timetrack/kiosk',   icon: MonitorSmartphone, roles: ['super_admin', 'admin', 'finance', 'operations', 'field_staff'] },
  { title: 'Vendors',          url: '/vendors',           icon: Store,           roles: ['super_admin', 'admin'] },
  // Workspace
  { title: 'Tasks',            url: '/tasks',             icon: ListTodo,        roles: ['super_admin', 'admin', 'finance', 'operations', 'field_staff'] },
  { title: 'Goals',            url: '/goals',             icon: Target,          roles: ['super_admin', 'admin'] },
  { title: 'Tables',           url: '/flex-tables',       icon: Table2,          roles: ['super_admin', 'admin'] },
  { title: 'Knowledge',        url: '/knowledge',         icon: BookOpen,        roles: ['super_admin', 'admin', 'finance', 'operations', 'field_staff'] },
  { title: 'Documents',        url: '/documents',         icon: FileText,        roles: ['super_admin', 'admin', 'finance'] },
  { title: 'Reports',          url: '/reports',           icon: BarChart3,       roles: ['super_admin', 'admin', 'finance'], permission: 'reports.view' },
  { title: 'HR Analytics',     url: '/hr-analytics',      icon: BarChart3,       roles: ['super_admin', 'admin', 'finance'], permission: 'reports.view' },
  // CRM module — admin/super_admin only, no per-user permission override:
  // matches the RoleGuard on these routes.
  { title: 'Clients',          url: '/clients',           icon: Building2,       roles: ['super_admin', 'admin'] },
  { title: 'Contacts',         url: '/contacts',          icon: Contact2,        roles: ['super_admin', 'admin'] },
  { title: 'Referrals',        url: '/referrals',         icon: Gift,            roles: ['super_admin', 'admin'] },
  { title: 'Public Links',     url: '/public-links',      icon: Link2,           roles: ['super_admin', 'admin'] },
  { title: 'Communications',   url: '/communications',    icon: Mail,            roles: ['super_admin', 'admin'] },
  // Admin — strict role only (see comment block above).
  { title: 'Approval Workflows', url: '/approval-workflows', icon: GitBranch,    roles: ['super_admin', 'admin'] },
  { title: 'Audit Log',        url: '/audit',             icon: ScrollText,      roles: ['super_admin', 'admin'] },
  { title: 'Settings',         url: '/settings',          icon: Settings,        roles: ['super_admin', 'admin'] },
  { title: 'Principal Disbursements', url: '/principal-disbursements', icon: Landmark, roles: ['super_admin'] },
  // Workspace addition (Assistant)
  { title: 'Developer',        url: '/developer',         icon: Code2,           roles: ['super_admin', 'admin'] as Role[] },
  { title: 'Database',         url: '/data',              icon: Database,        roles: ['super_admin'] },
  { title: 'Assistant',        url: '/assistant',         icon: Bot,             roles: ['super_admin', 'admin', 'finance', 'operations', 'field_staff'] },
  { title: 'Messages',         url: '/messages',          icon: MessageSquare,   roles: ['super_admin', 'admin', 'finance', 'operations', 'field_staff'] },
  // NDI — standalone org module
  { title: 'NDI Overview',     url: '/ndi',               icon: Globe,           roles: ['super_admin', 'admin'] },
  { title: 'NDI Finance',      url: '/ndi/finance',       icon: Wallet,          roles: ['super_admin', 'admin'] },
  { title: 'NDI Employees',    url: '/ndi/employees',     icon: UserCog,         roles: ['super_admin', 'admin'] },
  { title: 'NDI Profile',      url: '/ndi/profile',       icon: Building2,       roles: ['super_admin', 'admin'] },
  { title: 'Platform Guide',   url: '/guide',             icon: BookOpen,        roles: ['super_admin', 'admin', 'finance', 'operations', 'field_staff'] },
];

// Grouped by money-flow direction and function rather than department —
// "Finance" and "Treasury" used to mix calculation tools (Payroll) with
// movement tools (Cards) with balance-sheet tools (Assets) under one label.
// Money Out / Money In & Treasury / Risk & Controls maps to how a finance
// person actually thinks about these modules, and puts a visible seam in
// the nav between "calculating payroll" and "moving money" that mirrors
// the hard line already enforced at the database layer.
export const NAV_GROUPS = [
  { key: 'moneyOut',   label: 'Money Out',           titles: ['Pay Hub', 'Payments', 'Payment Schedule', 'Transactions', 'Payroll', 'Earned Wages', 'Subscriptions', 'Cards', 'Expenses'] },
  { key: 'moneyIn',    label: 'Money In & Treasury',  titles: ['Invoices', 'Assets', 'Cash Flow'] },
  { key: 'risk',       label: 'Risk & Controls',     titles: ['Budgets', 'Compliance', 'Anomalies'] },
  { key: 'coreHr',     label: 'Core HR',              titles: ['Employees', 'Contractors', 'Placements', 'Attendance'] },
  { key: 'timeLeave',  label: 'Time & Leave',         titles: ['Leave', 'Shifts', 'Timesheets'] },
  // Time Tracking is one hub but (per TimeCamp's own left nav, which this
  // module matches feature-for-feature) several distinct sections, not one
  // flat list: Track, Reports, Computer Activities, Manage, Attendance,
  // Team, Clients, each becomes its own collapsible sub-group here — same
  // mechanism the Finance hub already uses for Money Out / Money In /
  // Risk, just applied to Time Tracking's own pages instead of one big
  // 14-item group.
  { key: 'timeTrackTrack',       label: 'Track',               titles: ['Time Dashboard', 'Time Entries'] },
  // Reports > Time is itself three labeled sub-groups in TimeCamp's own
  // nav (Time / People / Other) above a separate Finance hub — same
  // sub-group mechanism as Money Out/In/Risk above, nested one level
  // deeper via SIDEBAR_HUBS' own groups list.
  { key: 'timeTrackReportsTime',    label: 'Time',   titles: ['Reports: Summary', 'Reports: Detailed', 'Reports: By days (Time)', 'Reports: Pivot Table'] },
  { key: 'timeTrackReportsPeople',  label: 'People', titles: ['Reports: By tasks', 'Reports: By days and tasks', 'Reports: By days (People)', 'Reports: By projects'] },
  { key: 'timeTrackReportsOther',   label: 'Other',  titles: ['Reports: Location report', 'Reports: Real-time dashboard'] },
  { key: 'timeTrackFinance',        label: 'Finance', titles: ['Finance: Billable, non-billable', 'Finance: Estimates', 'Finance: Revenues', 'Finance: Costs', 'Finance: Margin'] },
  { key: 'timeTrackActivityProductivity', label: 'Productivity & Coaching', titles: ['Activity: Summary', 'Activity: Sites and apps', 'Activity: Categories', 'Activity: Efficiency', 'Activity: Goals'] },
  { key: 'timeTrackActivityVerification', label: 'Work verification', titles: ['Activity: Timeline', 'Activity: User statistics', 'Activity: Remote work detection', 'Activity: Screenshots'] },
  { key: 'timeTrackActivityConfig', label: 'Settings', titles: ['Time Agent & Policy'] },
  { key: 'timeTrackManage',      label: 'Manage',               titles: ['Time Projects', 'Time Planner', 'Time Billing Rates'] },
  { key: 'timeTrackAttendance',  label: 'Attendance',           titles: ['Time Attendance', 'Time Leave', 'Time Kiosk'] },
  { key: 'timeTrackTeam',        label: 'Team',                 titles: ['Time Approvals', 'Time Roles'] },
  { key: 'timeTrackClients',     label: 'Clients',               titles: ['Time Clients & Invoices'] },
  { key: 'timeTrackSettings',    label: 'Settings',              titles: ['Time Settings'] },
  { key: 'talent',     label: 'Talent',               titles: ['Recruitment', 'Onboarding', 'Training', 'Performance', 'Succession'] },
  { key: 'compWell',   label: 'Compensation & Wellbeing', titles: ['Benefits', 'Staff Loans'] },
  { key: 'policy',     label: 'Policy & Compliance',  titles: ['Disciplinary', 'Grievances', 'Surveys', 'HR Letters', 'Handbook'] },
  { key: 'operations', label: 'Operations',          titles: ['Fleet', 'Vendors'] },
  { key: 'productivity', label: 'Productivity',       titles: ['Tasks', 'Goals', 'Tables'] },
  { key: 'comms',      label: 'Communication',        titles: ['Assistant', 'Messages'] },
  { key: 'intel',      label: 'Intelligence',         titles: ['Reports', 'HR Analytics', 'Knowledge', 'Documents'] },
  { key: 'crm',        label: 'CRM',                 titles: ['Clients', 'Contacts', 'Referrals', 'Public Links', 'Communications'] },
  { key: 'admin',      label: 'Admin',               titles: ['Audit Log', 'Approval Workflows', 'Settings', 'Principal Disbursements', 'Database', 'Developer'] },
  { key: 'ndi',        label: 'NDI',                 titles: ['NDI Overview', 'NDI Finance', 'NDI Employees', 'NDI Profile'] },
] as const;

export type NavGroupKey = (typeof NAV_GROUPS)[number]['key'];

export const UNGROUPED_TITLES = ['Dashboard', 'My Portal', 'Approvals', 'Finance', 'Platform Guide'];

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
    key: 'timeTracking',
    label: 'Time Tracking',
    description: 'Timers, timesheets & billing',
    icon: 'Clock',
    color: 'text-teal-400',
    iconBg: 'bg-teal-500/15',
    groups: [
      'timeTrackTrack', 'timeTrackReportsTime', 'timeTrackReportsPeople', 'timeTrackReportsOther',
      'timeTrackFinance', 'timeTrackActivityProductivity', 'timeTrackActivityVerification', 'timeTrackActivityConfig', 'timeTrackManage',
      'timeTrackAttendance', 'timeTrackTeam', 'timeTrackClients', 'timeTrackSettings',
    ],
  },
  {
    key: 'people',
    label: 'People & HR',
    description: 'Staff, leave & compliance',
    icon: 'Users',
    color: 'text-blue-400',
    iconBg: 'bg-blue-500/15',
    groups: ['coreHr', 'timeLeave', 'talent', 'compWell', 'policy'],
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
    groups: ['productivity', 'comms', 'intel'],
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
    key: 'ndi',
    label: 'NDI',
    description: 'Niger Delta Innovate',
    icon: 'Globe',
    color: 'text-orange-400',
    iconBg: 'bg-orange-500/15',
    groups: ['ndi'],
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
