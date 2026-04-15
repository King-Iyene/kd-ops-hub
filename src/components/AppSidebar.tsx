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
} from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
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

type Role = 'admin' | 'finance' | 'operations' | 'field_staff' | 'driver';

type NavItem = {
  title: string;
  url: string;
  icon: typeof LayoutDashboard;
  roles: Role[];
};

const ALL_NAV: NavItem[] = [
  { title: 'Dashboard',   url: '/',            icon: LayoutDashboard, roles: ['admin', 'finance', 'operations'] },
  { title: 'Payments',    url: '/payments',    icon: CreditCard,      roles: ['admin', 'finance', 'operations'] },
  { title: 'Fleet',       url: '/fleet',       icon: Truck,           roles: ['admin', 'finance', 'operations', 'field_staff', 'driver'] },
  { title: 'Expenses',    url: '/expenses',    icon: Receipt,         roles: ['admin', 'finance', 'operations', 'field_staff', 'driver'] },
  { title: 'Contractors', url: '/contractors', icon: Users,           roles: ['admin', 'finance', 'operations'] },
  { title: 'Employees',   url: '/employees',   icon: UserCog,         roles: ['admin', 'finance', 'operations'] },
  { title: 'Settings',    url: '/settings',    icon: Settings,        roles: ['admin'] },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === 'collapsed';
  const { profile, signOut } = useAuthStore();
  const location = useLocation();

  const role = (profile?.role || 'field_staff') as Role;
  const navItems = ALL_NAV.filter((n) => n.roles.includes(role));

  return (
    <Sidebar collapsible="icon">
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="px-4 py-6">
            {!collapsed && (
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-sidebar-accent">
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
              {navItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    asChild
                    isActive={
                      location.pathname === item.url ||
                      (item.url !== '/' && location.pathname.startsWith(item.url))
                    }
                  >
                    <NavLink to={item.url}>
                      <item.icon className="h-4 w-4" />
                      {!collapsed && <span>{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
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
            <p className="text-xs text-sidebar-foreground/80 truncate">{profile.full_name}</p>
            <p className="text-xs text-sidebar-foreground/50 truncate">{profile.email}</p>
          </div>
        )}
      </SidebarFooter>
    </Sidebar>
  );
}
