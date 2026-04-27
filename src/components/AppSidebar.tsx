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
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuthStore, useEffectiveRole } from '@/store/authStore';
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
  badge?: 'approvals';
};

const ALL_NAV: NavItem[] = [
  { title: 'Dashboard',        url: '/',                  icon: LayoutDashboard, roles: ['super_admin', 'admin', 'finance', 'operations', 'field_staff'] },
  { title: 'Approvals',        url: '/approvals',         icon: Inbox,           roles: ['super_admin', 'admin', 'finance'], badge: 'approvals' },
  // Finance
  { title: 'Payments',         url: '/payments',          icon: Layers,          roles: ['super_admin', 'admin', 'finance'] },
  { title: 'Payment Schedule', url: '/payments/schedule', icon: CalendarClock,   roles: ['super_admin', 'admin', 'finance'] },
  { title: 'Transactions',     url: '/transactions',      icon: ArrowUpDown,     roles: ['super_admin', 'admin', 'finance'] },
  { title: 'Payroll',          url: '/payroll',           icon: Banknote,        roles: ['super_admin', 'admin', 'finance'] },
  { title: 'Subscriptions',    url: '/subscriptions',     icon: CalendarClock,   roles: ['super_admin', 'admin', 'finance'] },
  { title: 'Budgets',          url: '/budgets',           icon: PiggyBank,       roles: ['super_admin', 'admin', 'finance'] },
  { title: 'Cards',            url: '/cards',             icon: CreditCard,      roles: ['super_admin', 'admin', 'finance'] },
  { title: 'Invoices',         url: '/invoices',          icon: FilePlus2,       roles: ['super_admin', 'admin', 'finance'] },
  { title: 'Assets',           url: '/assets',            icon: Package,         roles: ['super_admin', 'admin', 'finance'] },
  { title: 'Compliance',       url: '/compliance',        icon: ShieldCheck,     roles: ['super_admin', 'admin', 'finance'] },
  // Operations
  { title: 'Expenses',         url: '/expenses',          icon: Receipt,         roles: ['super_admin', 'admin', 'finance', 'operations', 'field_staff'] },
  { title: 'Fleet',            url: '/fleet',             icon: Truck,           roles: ['super_admin', 'admin', 'operations', 'field_staff'] },
  { title: 'Contractors',      url: '/contractors',       icon: Users,           roles: ['super_admin', 'admin', 'finance', 'operations'] },
  { title: 'Employees',        url: '/employees',         icon: UserCog,         roles: ['super_admin', 'admin'] },
  { title: 'Leave',            url: '/leave',             icon: CalendarDays,    roles: ['super_admin', 'admin', 'finance', 'operations', 'field_staff'] },
  { title: 'Performance',      url: '/performance',       icon: Star,            roles: ['super_admin', 'admin', 'finance', 'operations'] },
  { title: 'Training',         url: '/training',          icon: GraduationCap,   roles: ['super_admin', 'admin', 'finance', 'operations'] },
  { title: 'Benefits',         url: '/benefits',          icon: HeartPulse,      roles: ['super_admin', 'admin', 'finance', 'operations'] },
  { title: 'Onboarding',       url: '/onboarding',        icon: UserCheck,       roles: ['super_admin', 'admin', 'finance', 'operations'] },
  { title: 'Vendors',          url: '/vendors',           icon: Store,           roles: ['super_admin', 'admin', 'finance', 'operations'] },
  // Workspace
  { title: 'Tasks',            url: '/tasks',             icon: ListTodo,        roles: ['super_admin', 'admin', 'finance', 'operations', 'field_staff'] },
  { title: 'Projects',         url: '/projects',          icon: FolderKanban,    roles: ['super_admin', 'admin', 'finance', 'operations'] },
  { title: 'Goals',            url: '/goals',             icon: Target,          roles: ['super_admin', 'admin', 'finance', 'operations', 'field_staff'] },
  { title: 'Knowledge',        url: '/knowledge',         icon: BookOpen,        roles: ['super_admin', 'admin', 'finance', 'operations', 'field_staff'] },
  { title: 'Documents',        url: '/documents',         icon: FileText,        roles: ['super_admin', 'admin', 'finance'] },
  { title: 'Reports',          url: '/reports',           icon: BarChart3,       roles: ['super_admin', 'admin', 'finance'] },
  // CRM
  { title: 'Clients',          url: '/clients',           icon: Building2,       roles: ['super_admin', 'admin', 'finance', 'operations'] },
  { title: 'Contacts',         url: '/contacts',          icon: Contact2,        roles: ['super_admin', 'admin', 'finance', 'operations'] },
  { title: 'Referrals',        url: '/referrals',         icon: Gift,            roles: ['super_admin', 'admin', 'finance', 'operations', 'field_staff'] },
  // Admin
  { title: 'Audit Log',        url: '/audit',             icon: ScrollText,      roles: ['super_admin', 'admin'] },
  { title: 'Settings',         url: '/settings',          icon: Settings,        roles: ['super_admin'] },
];

// ─── Group definitions ────────────────────────────────────────────────────────

const GROUPS = [
  { key: 'finance',    label: 'Finance',    titles: ['Payments', 'Payment Schedule', 'Transactions', 'Payroll', 'Subscriptions', 'Budgets', 'Cards', 'Invoices', 'Assets', 'Compliance'] },
  { key: 'operations', label: 'Operations', titles: ['Expenses', 'Fleet', 'Contractors', 'Employees', 'Leave', 'Performance', 'Training', 'Benefits', 'Onboarding', 'Vendors'] },
  { key: 'workspace',  label: 'Workspace',  titles: ['Tasks', 'Projects', 'Goals', 'Knowledge', 'Documents', 'Reports'] },
  { key: 'crm',        label: 'CRM',        titles: ['Clients', 'Contacts', 'Referrals'] },
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
  } catch {}
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
  const { state } = useSidebar();
  const sidebarCollapsed = state === 'collapsed';
  const { profile, signOut } = useAuthStore();
  const effectiveRole = useEffectiveRole();
  const location = useLocation();
  const approvalTotal = useApprovalStore((s) => s.counts.total);
  const refreshApprovals = useApprovalStore((s) => s.refresh);

  const [logoUrl, setLogoUrl] = useState<string | null>(null);

  useEffect(() => {
    supabase
      .from('company_settings')
      .select('logo_url')
      .limit(1)
      .single()
      .then(({ data }) => {
        if (data?.logo_url) {
          setLogoUrl(data.logo_url);
          localStorage.setItem('kdops_logo_url', data.logo_url);
        }
      });
  }, []);

  useEffect(() => {
    refreshApprovals();
  }, [refreshApprovals, location.pathname]);

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

  // ─── Role filtering ───────────────────────────────────────────────────────

  const role = effectiveRole as Role | undefined;
  const navItems = role ? ALL_NAV.filter((n) => n.roles.includes(role)) : ALL_NAV;

  // ─── Render a single nav item (unchanged styles) ──────────────────────────

  function renderNavItem(item: NavItem) {
    const hasExactMatch = navItems.some((n) => n.url === location.pathname);
    const active = hasExactMatch
      ? location.pathname === item.url
      : location.pathname === item.url ||
        (item.url !== '/' && location.pathname.startsWith(item.url));
    const showBadge = item.badge === 'approvals' && approvalTotal > 0;

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
                  <span className="relative ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-400/90 px-1.5 text-[10px] font-bold text-amber-900 kd-status-live-warning">
                    {approvalTotal > 99 ? '99+' : approvalTotal}
                  </span>
                )}
                {active && !showBadge && (
                  <ChevronRight className="h-3 w-3 text-cyan-400/60 shrink-0" />
                )}
              </>
            )}
            {sidebarCollapsed && showBadge && (
              <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-amber-400 kd-status-live-warning" />
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
              {logoUrl ? (
                <img src={logoUrl} alt="KD" className="h-9 w-9 rounded-xl object-contain ring-2 ring-sidebar-border/40" />
              ) : (
                <div className="h-9 w-9 rounded-xl kd-gradient-brand flex items-center justify-center ring-2 ring-white/10">
                  <span className="text-sm font-bold text-white tracking-tight">KD</span>
                </div>
              )}
              <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-emerald-400 ring-2 ring-sidebar-background" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold text-sidebar-primary leading-none">KDOps</p>
              <p className="text-[11px] text-sidebar-foreground/50 mt-0.5">Operations Platform</p>
            </div>
          </div>
        ) : (
          <div className="flex justify-center">
            {logoUrl ? (
              <img src={logoUrl} alt="KD" className="h-8 w-8 rounded-xl object-contain" />
            ) : (
              <div className="h-8 w-8 rounded-xl kd-gradient-brand flex items-center justify-center">
                <span className="text-xs font-bold text-white">KD</span>
              </div>
            )}
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
