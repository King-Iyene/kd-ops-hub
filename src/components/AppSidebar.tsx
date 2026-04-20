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
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuthStore, useEffectiveRole } from '@/store/authStore';
import type { Role } from '@/lib/roles';
import { useApprovalStore } from '@/store/approvalStore';
import { Badge } from '@/components/ui/badge';
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
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

// Role matrix — spec v2:
//   Super Admin  all
//   Admin        all except Settings
//   Finance      Payments, Contractors, Expenses, Budgets, Subscriptions,
//                Approvals, Reports, Documents, Payroll, Compliance, Dashboard,
//                Tasks, Leave, Audit Log, Knowledge, Cards. NOT HR/Fleet.
//   Operations   Dashboard, Contractors, Employees, Fleet, Leave, Expenses,
//                Tasks, Knowledge. NOT financial.
//   Field Staff  Dashboard, Fleet (submit), Expenses (submit), Leave (own),
//                Knowledge.
const ALL_NAV: NavItem[] = [
  { title: 'Dashboard',     url: '/',              icon: LayoutDashboard, roles: ['super_admin', 'admin', 'finance', 'operations', 'field_staff', 'driver'] },
  { title: 'Approvals',     url: '/approvals',     icon: Inbox,           roles: ['super_admin', 'admin', 'finance'], badge: 'approvals', section: 'Finance' },
  { title: 'Payments',      url: '/payments',      icon: Layers,          roles: ['super_admin', 'admin', 'finance'] },
  { title: 'Transactions',  url: '/transactions',  icon: ArrowUpDown,     roles: ['super_admin', 'admin', 'finance'] },
  { title: 'Payroll',       url: '/payroll',       icon: Banknote,        roles: ['super_admin', 'admin', 'finance'] },
  { title: 'Subscriptions', url: '/subscriptions', icon: CalendarClock,   roles: ['super_admin', 'admin', 'finance'] },
  { title: 'Budgets',       url: '/budgets',       icon: PiggyBank,       roles: ['super_admin', 'admin', 'finance'] },
  { title: 'Cards',         url: '/cards',         icon: CreditCard,      roles: ['super_admin', 'admin', 'finance'] },
  { title: 'Compliance',    url: '/compliance',    icon: ShieldCheck,     roles: ['super_admin', 'admin', 'finance'] },
  { title: 'Expenses',      url: '/expenses',      icon: Receipt,         roles: ['super_admin', 'admin', 'finance', 'operations', 'field_staff', 'driver'], section: 'Operations' },
  { title: 'Fleet',         url: '/fleet',         icon: Truck,           roles: ['super_admin', 'admin', 'operations', 'field_staff', 'driver'] },
  { title: 'Contractors',   url: '/contractors',   icon: Users,           roles: ['super_admin', 'admin', 'finance', 'operations'] },
  { title: 'Employees',     url: '/employees',     icon: UserCog,         roles: ['super_admin', 'admin'] },
  { title: 'Leave',         url: '/leave',         icon: CalendarDays,    roles: ['super_admin', 'admin', 'finance', 'operations', 'field_staff', 'driver'] },
  { title: 'Tasks',         url: '/tasks',         icon: ListTodo,        roles: ['super_admin', 'admin', 'finance', 'operations', 'field_staff', 'driver'], section: 'Workspace' },
  { title: 'Goals',         url: '/goals',         icon: Target,          roles: ['super_admin', 'admin', 'finance', 'operations', 'field_staff', 'driver'] },
  { title: 'Knowledge',     url: '/knowledge',     icon: BookOpen,        roles: ['super_admin', 'admin', 'finance', 'operations', 'field_staff', 'driver'] },
  { title: 'Documents',     url: '/documents',     icon: FileText,        roles: ['super_admin', 'admin', 'finance'] },
  { title: 'Reports',       url: '/reports',       icon: BarChart3,       roles: ['super_admin', 'admin', 'finance'] },
  { title: 'Contacts',      url: '/contacts',      icon: Contact2,        roles: ['super_admin', 'admin', 'finance', 'operations'], section: 'CRM' },
  { title: 'Referrals',     url: '/referrals',     icon: Gift,            roles: ['super_admin', 'admin', 'finance', 'operations', 'field_staff', 'driver'] },
  { title: 'Audit Log',     url: '/audit',         icon: ScrollText,      roles: ['super_admin', 'admin'], section: 'Admin' },
  { title: 'Settings',      url: '/settings',      icon: Settings,        roles: ['super_admin'] },
];

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

  // Keep the badge live: refresh on mount and every time the route changes,
  // so that approving something inside any page decrements the count.
  useEffect(() => {
    refreshApprovals();
  }, [refreshApprovals, location.pathname]);

  // If role can't be read from the profile row (data gap), fail OPEN per
  // spec — render every nav item so the user is never greyed out of work.
  // Default is intentionally NOT field_staff.
  const role = effectiveRole as Role | undefined;
  const navItems = role
    ? ALL_NAV.filter((n) => n.roles.includes(role))
    : ALL_NAV;

  return (
    <Sidebar collapsible="icon">
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="px-4 py-6">
            {!collapsed && (
              <div className="flex items-center gap-3">
                {logoUrl ? (
                  <img src={logoUrl} alt="KD Squares" className="h-9 w-9 rounded-lg object-contain" />
                ) : (
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-sidebar-accent">
                    <span className="text-sm font-bold text-sidebar-accent-foreground">KD</span>
                  </div>
                )}
                <div>
                  <p className="text-sm font-semibold text-sidebar-primary">KDOps</p>
                  <p className="text-xs text-sidebar-foreground/60">Operations Platform</p>
                </div>
              </div>
            )}
            {collapsed && (
              logoUrl ? (
                <img src={logoUrl} alt="KD Squares" className="h-8 w-8 rounded-lg object-contain" />
              ) : (
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-sidebar-accent">
                  <span className="text-xs font-bold text-sidebar-accent-foreground">KD</span>
                </div>
              )
            )}
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item, idx) => {
                const active =
                  location.pathname === item.url ||
                  (item.url !== '/' && location.pathname.startsWith(item.url));
                const showBadge = item.badge === 'approvals' && approvalTotal > 0;
                const showSection = !collapsed && item.section && idx > 0;
                return (
                  <SidebarMenuItem key={item.title}>
                    {showSection && (
                      <div className="px-3 pt-4 pb-1">
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-sidebar-foreground/40">
                          {item.section}
                        </span>
                      </div>
                    )}
                    <SidebarMenuButton
                      asChild
                      isActive={active}
                      tooltip={collapsed ? item.title : undefined}
                    >
                      <NavLink to={item.url} className="kd-transition">
                        <item.icon className="h-4 w-4" />
                        {!collapsed && <span className="flex-1">{item.title}</span>}
                        {!collapsed && showBadge && (
                          <Badge className="bg-warning text-warning-foreground h-5 px-1.5 text-[10px] font-semibold ml-auto">
                            {approvalTotal > 99 ? '99+' : approvalTotal}
                          </Badge>
                        )}
                        {collapsed && showBadge && (
                          <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-warning" />
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
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={signOut}>
              <LogOut className="h-4 w-4" />
              {!collapsed && <span>Sign Out</span>}
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
        {!collapsed && profile && (
          <div className="px-4 pb-4">
            <p className="text-xs text-sidebar-foreground/80 truncate">
              {profile.full_name}
            </p>
            <p className="text-xs text-sidebar-foreground/50 truncate">
              {profile.email}
            </p>
          </div>
        )}
      </SidebarFooter>
    </Sidebar>
  );
}
