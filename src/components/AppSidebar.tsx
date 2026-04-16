import { useEffect } from 'react';
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
} from 'lucide-react';
import { useAuthStore, useEffectiveRole } from '@/store/authStore';
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
import type { Role } from '@/lib/roles';

type NavItem = {
  title: string;
  url: string;
  icon: typeof LayoutDashboard;
  roles: Role[];
  badge?: 'approvals';
};

const ALL_NAV: NavItem[] = [
  { title: 'Dashboard',     url: '/',              icon: LayoutDashboard, roles: ['super_admin', 'admin', 'finance', 'operations'] },
  { title: 'Approvals',     url: '/approvals',     icon: Inbox,           roles: ['super_admin', 'admin', 'finance', 'operations'], badge: 'approvals' },
  { title: 'Payments',      url: '/payments',      icon: CreditCard,      roles: ['super_admin', 'admin', 'finance', 'operations'] },
  { title: 'Subscriptions', url: '/subscriptions', icon: CalendarClock,   roles: ['super_admin', 'admin', 'finance', 'operations'] },
  { title: 'Budgets',       url: '/budgets',       icon: PiggyBank,       roles: ['super_admin', 'admin', 'finance', 'operations'] },
  { title: 'Fleet',         url: '/fleet',         icon: Truck,           roles: ['super_admin', 'admin', 'finance', 'operations', 'field_staff', 'driver'] },
  { title: 'Expenses',      url: '/expenses',      icon: Receipt,         roles: ['super_admin', 'admin', 'finance', 'operations', 'field_staff', 'driver'] },
  { title: 'Contractors',   url: '/contractors',   icon: Users,           roles: ['super_admin', 'admin', 'finance', 'operations'] },
  { title: 'Employees',     url: '/employees',     icon: UserCog,         roles: ['super_admin', 'admin', 'finance', 'operations'] },
  { title: 'Leave',         url: '/leave',         icon: CalendarDays,    roles: ['super_admin', 'admin', 'finance', 'operations', 'field_staff', 'driver'] },
  { title: 'Documents',     url: '/documents',     icon: FileText,        roles: ['super_admin', 'admin', 'finance', 'operations', 'field_staff', 'driver'] },
  { title: 'Reports',       url: '/reports',       icon: BarChart3,       roles: ['super_admin', 'admin', 'finance', 'operations'] },
  { title: 'Settings',      url: '/settings',      icon: Settings,        roles: ['super_admin', 'admin'] },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === 'collapsed';
  const { profile, signOut } = useAuthStore();
  const effectiveRole = useEffectiveRole();
  const location = useLocation();
  const approvalTotal = useApprovalStore((s) => s.counts.total);
  const refreshApprovals = useApprovalStore((s) => s.refresh);

  // Keep the badge live: refresh on mount and every time the route changes,
  // so that approving something inside any page decrements the count.
  useEffect(() => {
    refreshApprovals();
  }, [refreshApprovals, location.pathname]);

  const role = (effectiveRole || 'field_staff') as Role;
  const navItems = ALL_NAV.filter((n) => n.roles.includes(role));

  return (
    <Sidebar collapsible="icon">
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="px-4 py-6">
            {!collapsed && (
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-sidebar-accent">
                  <span className="text-sm font-bold text-sidebar-accent-foreground">KD</span>
                </div>
                <div>
                  <p className="text-sm font-semibold text-sidebar-primary">KDOps</p>
                  <p className="text-xs text-sidebar-foreground/60">Operations Platform</p>
                </div>
              </div>
            )}
            {collapsed && (
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-sidebar-accent">
                <span className="text-xs font-bold text-sidebar-accent-foreground">KD</span>
              </div>
            )}
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => {
                const active =
                  location.pathname === item.url ||
                  (item.url !== '/' && location.pathname.startsWith(item.url));
                const showBadge = item.badge === 'approvals' && approvalTotal > 0;
                return (
                  <SidebarMenuItem key={item.title}>
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
