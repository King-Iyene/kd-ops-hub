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
  ArrowUpDown,
  Layers,
  ChevronRight,
  Briefcase,
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

type NavItem = {
  title: string;
  url: string;
  icon: typeof LayoutDashboard;
  roles: Role[];
  badge?: 'approvals';
  section?: string;
};

const ALL_NAV: NavItem[] = [
  { title: 'Dashboard',         url: '/',                  icon: LayoutDashboard, roles: ['super_admin', 'admin', 'finance', 'operations', 'field_staff'] },
  { title: 'Approvals',         url: '/approvals',         icon: Inbox,           roles: ['super_admin', 'admin', 'finance'], badge: 'approvals', section: 'Finance' },
  { title: 'Payments',          url: '/payments',          icon: Layers,          roles: ['super_admin', 'admin', 'finance'] },
  { title: 'Payment Schedule',  url: '/payments/schedule', icon: CalendarClock,   roles: ['super_admin', 'admin', 'finance'] },
  { title: 'Transactions',      url: '/transactions',      icon: ArrowUpDown,     roles: ['super_admin', 'admin', 'finance'] },
  { title: 'Payroll',           url: '/payroll',           icon: Banknote,        roles: ['super_admin', 'admin', 'finance'] },
  { title: 'Subscriptions',     url: '/subscriptions',     icon: CalendarClock,   roles: ['super_admin', 'admin', 'finance'] },
  { title: 'Budgets',           url: '/budgets',           icon: PiggyBank,       roles: ['super_admin', 'admin', 'finance'] },
  { title: 'Cards',             url: '/cards',             icon: CreditCard,      roles: ['super_admin', 'admin', 'finance'] },
  { title: 'Compliance',        url: '/compliance',        icon: ShieldCheck,     roles: ['super_admin', 'admin', 'finance'] },
  { title: 'Expenses',          url: '/expenses',          icon: Receipt,         roles: ['super_admin', 'admin', 'finance', 'operations', 'field_staff'], section: 'Operations' },
  { title: 'Fleet',             url: '/fleet',             icon: Truck,           roles: ['super_admin', 'admin', 'operations', 'field_staff'] },
  { title: 'Contractors',       url: '/contractors',       icon: Users,           roles: ['super_admin', 'admin', 'finance', 'operations'] },
  { title: 'Employees',         url: '/employees',         icon: UserCog,         roles: ['super_admin', 'admin'] },
  { title: 'Leave',             url: '/leave',             icon: CalendarDays,    roles: ['super_admin', 'admin', 'finance', 'operations', 'field_staff'] },
  { title: 'Tasks',             url: '/tasks',             icon: ListTodo,        roles: ['super_admin', 'admin', 'finance', 'operations', 'field_staff'], section: 'Workspace' },
  { title: 'Goals',             url: '/goals',             icon: Target,          roles: ['super_admin', 'admin', 'finance', 'operations', 'field_staff'] },
  { title: 'Executive Assist',  url: '/assistant',         icon: Briefcase,       roles: ['super_admin', 'admin', 'finance', 'operations'] },
  { title: 'Knowledge',         url: '/knowledge',         icon: BookOpen,        roles: ['super_admin', 'admin', 'finance', 'operations', 'field_staff'] },
  { title: 'Documents',         url: '/documents',         icon: FileText,        roles: ['super_admin', 'admin', 'finance'] },
  { title: 'Reports',           url: '/reports',           icon: BarChart3,       roles: ['super_admin', 'admin', 'finance'] },
  { title: 'Contacts',          url: '/contacts',          icon: Contact2,        roles: ['super_admin', 'admin', 'finance', 'operations'], section: 'CRM' },
  { title: 'Referrals',         url: '/referrals',         icon: Gift,            roles: ['super_admin', 'admin', 'finance', 'operations', 'field_staff'] },
  { title: 'Audit Log',         url: '/audit',             icon: ScrollText,      roles: ['super_admin', 'admin'], section: 'Admin' },
  { title: 'Settings',          url: '/settings',          icon: Settings,        roles: ['super_admin'] },
];

function getInitials(name: string): string {
  return name
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0] ?? '')
    .join('')
    .toUpperCase();
}

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === 'collapsed';
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

  const role = effectiveRole as Role | undefined;
  const navItems = role ? ALL_NAV.filter((n) => n.roles.includes(role)) : ALL_NAV;

  return (
    <Sidebar collapsible="icon">
      {/* ── Logo area ─────────────────────────────────────────────── */}
      <div className="px-3 pt-4 pb-3 border-b border-sidebar-border/50">
        {!collapsed ? (
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

      <SidebarContent className="pt-2 pb-2">
        <SidebarGroup className="p-0">
          <SidebarGroupContent>
            <SidebarMenu className="gap-0.5 px-2">
              {navItems.map((item, idx) => {
                const hasExactNavMatch = navItems.some((n) => n.url === location.pathname);
                const active = hasExactNavMatch
                  ? location.pathname === item.url
                  : location.pathname === item.url ||
                    (item.url !== '/' && location.pathname.startsWith(item.url));
                const showBadge = item.badge === 'approvals' && approvalTotal > 0;
                const showSection = !collapsed && item.section && idx > 0;

                return (
                  <SidebarMenuItem key={item.title} className="list-none">
                    {showSection && (
                      <div className="px-2 pt-4 pb-1.5">
                        <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-sidebar-foreground/35">
                          {item.section}
                        </span>
                      </div>
                    )}
                    <SidebarMenuButton
                      asChild
                      isActive={active}
                      tooltip={collapsed ? item.title : undefined}
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
                        {/* Active indicator bar */}
                        {active && (
                          <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-4 rounded-r-full bg-cyan-400" />
                        )}

                        <item.icon className={`h-4 w-4 shrink-0 kd-transition ${active ? 'text-cyan-300' : 'text-sidebar-foreground/50 group-hover:text-sidebar-foreground/80'}`} />

                        {!collapsed && (
                          <>
                            <span className="flex-1 truncate">{item.title}</span>
                            {showBadge && (
                              <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-400/90 px-1.5 text-[10px] font-bold text-amber-900">
                                {approvalTotal > 99 ? '99+' : approvalTotal}
                              </span>
                            )}
                            {active && !showBadge && (
                              <ChevronRight className="h-3 w-3 text-cyan-400/60 shrink-0" />
                            )}
                          </>
                        )}
                        {collapsed && showBadge && (
                          <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-amber-400" />
                        )}
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      {/* ── Footer ───────────────────────────────────────────────── */}
      <SidebarFooter className="border-t border-sidebar-border/50 pt-2 pb-3 px-2">
        <SidebarMenu>
          <SidebarMenuItem className="list-none">
            <SidebarMenuButton
              onClick={signOut}
              tooltip={collapsed ? 'Sign Out' : undefined}
              className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium text-sidebar-foreground/60 hover:bg-red-500/15 hover:text-red-300 kd-transition w-full"
            >
              <LogOut className="h-4 w-4 shrink-0" />
              {!collapsed && <span>Sign Out</span>}
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>

        {!collapsed && profile && (
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
