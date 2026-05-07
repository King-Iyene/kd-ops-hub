import { useEffect, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  CreditCard,
  Truck,
  Receipt,
  Users,
  UserCog,
  Settings,
  LogOut,
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
  ChevronRight,
  ChevronDown,
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
  ClipboardList,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuthStore, useEffectiveRole } from '@/store/authStore';
import { BrandLogo } from '@/components/BrandLogo';
import type { Role } from '@/lib/roles';
import { useApprovalStore } from '@/store/approvalStore';
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarFooter,
  useSidebar,
} from '@/components/ui/sidebar';

// ─── Nav item type ────────────────────────────────────────────────────────────

type NavItem = {
  title: string;
  url: string;
  icon: typeof LayoutDashboard;
  roles: Role[];
  /** Optional permission key. If the user's role isn't in `roles`, the item
   *  is still shown when this permission is explicitly granted on the
   *  profile (`permissions[key] === true`). Mirrors the gating logic used
   *  by RoleGuard and useFeatureAccess so the sidebar never lies — if the
   *  user can navigate to the route, the link shows. */
  permission?: string;
  badge?: 'approvals' | 'anomalies';
};

const ALL_NAV: NavItem[] = [
  { title: 'Dashboard',        url: '/',                  icon: LayoutDashboard, roles: ['super_admin', 'admin', 'finance', 'operations', 'field_staff'] },
  { title: 'Approvals',        url: '/approvals',         icon: Inbox,           roles: ['super_admin', 'admin', 'finance'], badge: 'approvals', permission: 'payments.approve_batches' },
  // Finance
  { title: 'Payments',         url: '/payments',          icon: Layers,          roles: ['super_admin', 'admin', 'finance'], permission: 'payments.view' },
  { title: 'Payment Schedule', url: '/payments/schedule', icon: CalendarClock,   roles: ['super_admin', 'admin', 'finance'], permission: 'payments.view' },
  { title: 'Transactions',     url: '/transactions',      icon: ArrowUpDown,     roles: ['super_admin', 'admin', 'finance'], permission: 'payments.view' },
  { title: 'Payroll',          url: '/payroll',           icon: Banknote,        roles: ['super_admin', 'admin', 'finance'], permission: 'payroll.view' },
  { title: 'Earned Wages',     url: '/ewa',               icon: Wallet,          roles: ['super_admin', 'admin', 'finance', 'operations', 'field_staff', 'hr'] },
  { title: 'Subscriptions',    url: '/subscriptions',     icon: CalendarClock,   roles: ['super_admin', 'admin', 'finance'] },
  { title: 'Budgets',          url: '/budgets',           icon: PiggyBank,       roles: ['super_admin', 'admin', 'finance'] },
  { title: 'Cards',            url: '/cards',             icon: CreditCard,      roles: ['super_admin', 'admin', 'finance'] },
  { title: 'Invoices',         url: '/invoices',          icon: FilePlus2,       roles: ['super_admin', 'admin', 'finance'] },
  { title: 'Assets',           url: '/assets',            icon: Package,         roles: ['super_admin', 'admin', 'finance'] },
  { title: 'Compliance',       url: '/compliance',        icon: ShieldCheck,     roles: ['super_admin', 'admin', 'finance'] },
  { title: 'Anomalies',        url: '/anomalies',         icon: Siren,           roles: ['super_admin', 'admin', 'finance'], badge: 'anomalies' },
  { title: 'Cash Flow',        url: '/cashflow',          icon: Activity,        roles: ['super_admin', 'admin', 'finance'] },
  // Operations
  { title: 'Expenses',         url: '/expenses',          icon: Receipt,         roles: ['super_admin', 'admin', 'finance', 'operations', 'field_staff'], permission: 'expenses.submit' },
  { title: 'Fleet',            url: '/fleet',             icon: Truck,           roles: ['super_admin', 'admin', 'operations', 'field_staff'], permission: 'fleet.view' },
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
  { title: 'Attendance',       url: '/attendance',        icon: CalendarCheck2,  roles: ['super_admin', 'admin', 'finance', 'operations'], permission: 'attendance.view' },
  { title: 'Disciplinary',     url: '/disciplinary',      icon: ShieldAlert,     roles: ['super_admin', 'admin'] },
  { title: 'Vendors',          url: '/vendors',           icon: Store,           roles: ['super_admin', 'admin', 'finance', 'operations'], permission: 'vendors.view' },
  // Workspace
  { title: 'Tasks',            url: '/tasks',             icon: ListTodo,        roles: ['super_admin', 'admin', 'finance', 'operations', 'field_staff'] },
  { title: 'Projects',         url: '/projects',          icon: FolderKanban,    roles: ['super_admin', 'admin', 'finance', 'operations'], permission: 'projects.view' },
  { title: 'Goals',            url: '/goals',             icon: Target,          roles: ['super_admin', 'admin', 'finance', 'operations', 'field_staff'] },
  { title: 'Knowledge',        url: '/knowledge',         icon: BookOpen,        roles: ['super_admin', 'admin', 'finance', 'operations', 'field_staff'] },
  { title: 'Documents',        url: '/documents',         icon: FileText,        roles: ['super_admin', 'admin', 'finance'] },
  { title: 'Reports',          url: '/reports',           icon: BarChart3,       roles: ['super_admin', 'admin', 'finance'], permission: 'reports.view' },
  // CRM
  { title: 'Clients',          url: '/clients',           icon: Building2,       roles: ['super_admin', 'admin', 'finance', 'operations'], permission: 'clients.view' },
  { title: 'Contacts',         url: '/contacts',          icon: Contact2,        roles: ['super_admin', 'admin', 'finance', 'operations'] },
  { title: 'Referrals',        url: '/referrals',         icon: Gift,            roles: ['super_admin', 'admin', 'finance', 'operations', 'field_staff'] },
  { title: 'Communications',   url: '/communications',    icon: Mail,            roles: ['super_admin', 'admin', 'finance'] },
  // Admin — strict role only (see comment block above).
  { title: 'Audit Log',        url: '/audit',             icon: ScrollText,      roles: ['super_admin', 'admin'] },
  { title: 'Settings',         url: '/settings',          icon: Settings,        roles: ['super_admin'] },
  // Workspace addition (Assistant)
  { title: 'Assistant',        url: '/assistant',         icon: Bot,             roles: ['super_admin', 'admin', 'finance', 'operations', 'field_staff'] },
];

// ─── Group definitions ────────────────────────────────────────────────────────

const GROUPS = [
  { key: 'finance',    label: 'Finance',    titles: ['Payments', 'Payment Schedule', 'Transactions', 'Payroll', 'Earned Wages', 'Subscriptions', 'Budgets', 'Cards', 'Invoices', 'Assets', 'Compliance', 'Anomalies', 'Cash Flow'] },
  { key: 'operations', label: 'Operations', titles: ['My Requests', 'Expenses', 'Fleet', 'Contractors', 'Employees', 'Leave', 'Performance', 'Training', 'Benefits', 'Onboarding', 'Recruitment', 'Attendance', 'Disciplinary', 'Vendors'] },
  { key: 'workspace',  label: 'Workspace',  titles: ['Assistant', 'Tasks', 'Projects', 'Goals', 'Knowledge', 'Documents', 'Reports'] },
  { key: 'crm',        label: 'CRM',        titles: ['Clients', 'Contacts', 'Referrals', 'Communications'] },
  { key: 'admin',      label: 'Admin',      titles: ['Audit Log', 'Settings'] },
] as const;

type GroupKey = (typeof GROUPS)[number]['key'];

// Dashboard and Approvals sit above all groups, always visible
const UNGROUPED = ['Dashboard', 'Approvals'];

// ─── localStorage helpers ─────────────────────────────────────────────────────

const lsKey = (k: GroupKey) => `kdops_sidebar_${k}_collapsed`;

function loadCollapsed(k: GroupKey): boolean {
  try {
    return localStorage.getItem(lsKey(k)) === 'true';
  } catch {
    return false;
  }
}

function persistCollapsed(k: GroupKey, v: boolean) {
  try {
    localStorage.setItem(lsKey(k), String(v));
  } catch { /* localStorage unavailable */ }
}

// ─── Utility ──────────────────────────────────────────────────────────────────

function getInitials(name: string): string {
  return name
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0] ?? '')
    .join('')
    .toUpperCase();
}

// ─── Component ────────────────────────────────────────────────────────────────

export function AppSidebar() {
  const { state, setOpenMobile, isMobile } = useSidebar();
  const sidebarCollapsed = state === 'collapsed';
  const { profile, signOut } = useAuthStore();
  const effectiveRole = useEffectiveRole();
  const location = useLocation();
  const approvalTotal = useApprovalStore((s) => s.counts.total);
  const refreshApprovals = useApprovalStore((s) => s.refresh);

  // Close the mobile sidebar automatically whenever the route changes.
  // The shadcn <Sheet>-based mobile sidebar otherwise stays open after a
  // user taps a nav link, requiring them to swipe it away — bad mobile UX.
  useEffect(() => {
    if (isMobile) setOpenMobile(false);
  }, [location.pathname, isMobile, setOpenMobile]);

  // Logo + name come from useBrand inside <BrandLogo>; no per-component
  // fetch needed any more (the hook caches and de-duplicates the request
  // platform-wide).
  const [anomalyOpenCount, setAnomalyOpenCount] = useState<number>(0);

  useEffect(() => {
    refreshApprovals();
    // Refresh every 90 seconds passively — no longer on every navigation.
    // This cuts 5 DB round-trips per page change down to one every 90 s.
    const id = setInterval(refreshApprovals, 90_000);
    return () => clearInterval(id);
  }, [refreshApprovals]);

  // Open critical/high anomaly count drives the "Anomalies" sidebar badge.
  useEffect(() => {
    const fetchCount = () => {
      supabase
        .from('payment_anomalies')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'open')
        .in('severity', ['critical', 'high'])
        .then(({ count }) => setAnomalyOpenCount(count ?? 0));
    };
    fetchCount();
    const id = setInterval(fetchCount, 120_000);
    return () => clearInterval(id);
  }, []);

  // ─── Group collapse state (initialised from localStorage) ─────────────────

  const [groupCollapsed, setGroupCollapsed] = useState<Record<GroupKey, boolean>>(() => ({
    finance:    loadCollapsed('finance'),
    operations: loadCollapsed('operations'),
    workspace:  loadCollapsed('workspace'),
    crm:        loadCollapsed('crm'),
    admin:      loadCollapsed('admin'),
  }));

  function toggleGroup(key: GroupKey) {
    setGroupCollapsed((prev) => {
      const next = !prev[key];
      persistCollapsed(key, next);
      return { ...prev, [key]: next };
    });
  }

  // Auto-expand the group containing the active route so the user never
  // lands on a page whose nav item is hidden inside a collapsed group.
  useEffect(() => {
    for (const group of GROUPS) {
      const groupUrls = ALL_NAV
        .filter((n) => (group.titles as readonly string[]).includes(n.title))
        .map((n) => n.url);
      const isGroupActive = groupUrls.some(
        (url) => location.pathname === url || (url !== '/' && location.pathname.startsWith(url)),
      );
      if (isGroupActive) {
        setGroupCollapsed((prev) => {
          if (!prev[group.key]) return prev;
          persistCollapsed(group.key, false);
          return { ...prev, [group.key]: false };
        });
      }
    }
  }, [location.pathname]);

  // ─── Role + permission filtering ─────────────────────────────────────────
  // An item is shown when EITHER:
  //   • the user's role is in the item's allowed roles, OR
  //   • the item declares a permission key and the profile has that
  //     permission explicitly granted (`permissions[key] === true`).
  // Mirrors RoleGuard's logic so the sidebar matches the routes — when
  // an admin grants e.g. payments.create to a field user, the link
  // appears in their sidebar without them needing to know the URL.
  // Explicit denial (`permissions[key] === false`) hides the link even
  // when the role would normally allow.
  //
  // View-as mode (super_admin simulating another role) DELIBERATELY
  // ignores the real user's permissions JSONB. Otherwise the sim leaks
  // grants from the super_admin's own profile (every key set to true)
  // back into the lower role being simulated. The simulation has to be
  // role-pure to be useful — what would `operations` actually see if
  // they had a clean profile? — so we pass an empty permissions map
  // for the duration of the view-as.

  const role = effectiveRole as Role | undefined;
  const isViewAs = (profile?.role === 'super_admin') && (effectiveRole !== 'super_admin');
  const permissions = isViewAs
    ? null
    : ((profile as any)?.permissions as Record<string, boolean> | null | undefined);
  const navItems = ALL_NAV.filter((n) => {
    const explicitDeny = n.permission && permissions?.[n.permission] === false;
    if (explicitDeny) return false;
    const explicitGrant = n.permission && permissions?.[n.permission] === true;
    if (explicitGrant) return true;
    return role ? n.roles.includes(role) : true;
  });

  // ─── Render a single nav item (unchanged styles) ──────────────────────────

  function renderNavItem(item: NavItem) {
    const hasExactMatch = navItems.some((n) => n.url === location.pathname);
    const active = hasExactMatch
      ? location.pathname === item.url
      : location.pathname === item.url ||
        (item.url !== '/' && location.pathname.startsWith(item.url));
    const badgeCount =
      item.badge === 'approvals' ? approvalTotal :
      item.badge === 'anomalies' ? anomalyOpenCount : 0;
    const showBadge = badgeCount > 0;
    const badgeTone = item.badge === 'anomalies'
      ? 'bg-red-500/90 text-white'
      : 'bg-amber-400/90 text-amber-900';

    return (
      <SidebarMenuItem key={item.title} className="list-none">
        <SidebarMenuButton
          asChild
          isActive={active}
          tooltip={sidebarCollapsed ? item.title : undefined}
          className="relative"
        >
          <NavLink
            to={item.url}
            className={`
              flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium
              kd-transition group relative
              ${active
                ? 'bg-white/15 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.1),0_1px_3px_rgba(0,0,0,0.2)]'
                : 'text-sidebar-foreground/75 hover:bg-white/8 hover:text-sidebar-foreground'
              }
            `}
          >
            {active && (
              <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-4 rounded-r-full bg-cyan-400" />
            )}
            <item.icon
              className={`h-4 w-4 shrink-0 kd-transition ${
                active
                  ? 'text-cyan-300'
                  : 'text-sidebar-foreground/50 group-hover:text-sidebar-foreground/80'
              }`}
            />
            {!sidebarCollapsed && (
              <>
                <span className="flex-1 truncate">{item.title}</span>
                {showBadge && (
                  <span className={`relative ml-auto flex h-5 min-w-5 items-center justify-center rounded-full ${badgeTone} px-1.5 text-[10px] font-bold kd-status-live-warning`}>
                    {badgeCount > 99 ? '99+' : badgeCount}
                  </span>
                )}
                {active && !showBadge && (
                  <ChevronRight className="h-3 w-3 text-cyan-400/60 shrink-0" />
                )}
              </>
            )}
            {sidebarCollapsed && showBadge && (
              <span className={`absolute top-1 right-1 h-2 w-2 rounded-full kd-status-live-warning ${item.badge === 'anomalies' ? 'bg-red-500' : 'bg-amber-400'}`} />
            )}
          </NavLink>
        </SidebarMenuButton>
      </SidebarMenuItem>
    );
  }

  const ungroupedItems = navItems.filter((n) => UNGROUPED.includes(n.title));

  return (
    <Sidebar collapsible="icon">
      {/* ── Logo area ─────────────────────────────────────────────── */}
      <div className="px-3 pt-4 pb-3 border-b border-sidebar-border/50">
        {!sidebarCollapsed ? (
          <div className="flex items-center gap-3 px-1">
            <div className="relative shrink-0">
              <BrandLogo size={36} className="h-9 w-9 rounded-xl ring-2 ring-sidebar-border/40 bg-white/5" />
              <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-emerald-400 ring-2 ring-sidebar-background" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold text-sidebar-primary leading-none">KDOps</p>
              <p className="text-[11px] text-sidebar-foreground/50 mt-0.5">Operations Platform</p>
            </div>
          </div>
        ) : (
          <div className="flex justify-center">
            <BrandLogo size={32} className="h-8 w-8 rounded-xl bg-white/5" />
          </div>
        )}
      </div>

      {/* ── Nav ───────────────────────────────────────────────────── */}
      <SidebarContent className="pt-2 pb-2">
        <SidebarGroup className="p-0">
          <SidebarGroupContent>

            {/* Ungrouped: Dashboard + Approvals */}
            <SidebarMenu className="gap-0.5 px-2 mb-1">
              {ungroupedItems.map(renderNavItem)}
            </SidebarMenu>

            {/* Collapsible groups */}
            {GROUPS.map((group) => {
              const groupItems = navItems.filter((n) =>
                (group.titles as readonly string[]).includes(n.title),
              );
              if (groupItems.length === 0) return null;

              const isCollapsed = groupCollapsed[group.key];

              return (
                <div key={group.key}>
                  {/* Group header */}
                  {sidebarCollapsed ? (
                    // Icon-mode: thin divider instead of label
                    <div className="mx-3 my-2 h-px bg-sidebar-border/25" />
                  ) : (
                    <button
                      onClick={() => toggleGroup(group.key)}
                      className="flex w-full items-center gap-1.5 px-4 pt-4 pb-1.5 kd-transition hover:opacity-80 focus-visible:outline-none"
                    >
                      <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-sidebar-foreground/35 flex-1 text-left">
                        {group.label}
                      </span>
                      <ChevronDown
                        className={`h-3 w-3 text-sidebar-foreground/30 transition-transform duration-200 ${
                          isCollapsed ? '-rotate-90' : ''
                        }`}
                      />
                    </button>
                  )}

                  {/* Group items — always visible in icon mode; toggled in expanded mode */}
                  {(!isCollapsed || sidebarCollapsed) && (
                    <SidebarMenu className="gap-0.5 px-2">
                      {groupItems.map(renderNavItem)}
                    </SidebarMenu>
                  )}
                </div>
              );
            })}

          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      {/* ── Footer ───────────────────────────────────────────────── */}
      <SidebarFooter className="border-t border-sidebar-border/50 pt-2 pb-3 px-2">
        <SidebarMenu>
          <SidebarMenuItem className="list-none">
            <SidebarMenuButton
              onClick={signOut}
              tooltip={sidebarCollapsed ? 'Sign Out' : undefined}
              className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium text-sidebar-foreground/60 hover:bg-red-500/15 hover:text-red-300 kd-transition w-full"
            >
              <LogOut className="h-4 w-4 shrink-0" />
              {!sidebarCollapsed && <span>Sign Out</span>}
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>

        {!sidebarCollapsed && profile && (
          <div className="flex items-center gap-2.5 px-2.5 py-2 mt-1 rounded-lg bg-white/5">
            <div className="h-7 w-7 rounded-full kd-gradient-brand flex items-center justify-center shrink-0 text-[11px] font-bold text-white">
              {getInitials(profile.full_name ?? profile.email ?? 'U')}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-sidebar-foreground/90 truncate leading-none">
                {profile.full_name ?? 'User'}
              </p>
              <p className="text-[10px] text-sidebar-foreground/45 truncate mt-0.5">
                {profile.email}
              </p>
            </div>
          </div>
        )}
      </SidebarFooter>
    </Sidebar>
  );
}
