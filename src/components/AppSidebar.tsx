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
import { useAuthStore } from '@/store/authStore';
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
  badge?: 'approvals';
};

/**
 * All modules are visible to every signed-in user. KDOps no longer
 * enforces role-based navigation — see /src/App.tsx.
 */
const NAV: NavItem[] = [
  { title: 'Dashboard',     url: '/',              icon: LayoutDashboard },
  { title: 'Approvals',     url: '/approvals',     icon: Inbox, badge: 'approvals' },
  { title: 'Payments',      url: '/payments',      icon: CreditCard },
  { title: 'Subscriptions', url: '/subscriptions', icon: CalendarClock },
  { title: 'Budgets',       url: '/budgets',       icon: PiggyBank },
  { title: 'Fleet',         url: '/fleet',         icon: Truck },
  { title: 'Expenses',      url: '/expenses',      icon: Receipt },
  { title: 'Contractors',   url: '/contractors',   icon: Users },
  { title: 'Employees',     url: '/employees',     icon: UserCog },
  { title: 'Leave',         url: '/leave',         icon: CalendarDays },
  { title: 'Documents',     url: '/documents',     icon: FileText },
  { title: 'Reports',       url: '/reports',       icon: BarChart3 },
  { title: 'Settings',      url: '/settings',      icon: Settings },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === 'collapsed';
  const { profile, signOut } = useAuthStore();
  const location = useLocation();
  const approvalTotal = useApprovalStore((s) => s.counts.total);
  const refreshApprovals = useApprovalStore((s) => s.refresh);

  useEffect(() => {
    refreshApprovals();
  }, [refreshApprovals, location.pathname]);

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
              {NAV.map((item) => {
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
