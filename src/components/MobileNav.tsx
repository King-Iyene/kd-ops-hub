import { useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  CreditCard,
  Receipt,
  Bell,
  Menu,
  X,
  Layers,
  Truck,
  Users,
  UserCog,
  Settings,
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
} from 'lucide-react';
import { useApprovalStore } from '@/store/approvalStore';
import { useEffectiveRole } from '@/store/authStore';
import { cn } from '@/lib/utils';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import type { Role } from '@/lib/roles';

const TABS = [
  { title: 'Home',      url: '/',          icon: LayoutDashboard },
  { title: 'Pay',       url: '/payments',  icon: CreditCard },
  { title: 'Expenses',  url: '/expenses',  icon: Receipt },
  { title: 'Approvals', url: '/approvals', icon: Bell },
] as const;

type NavItem = {
  title: string;
  url: string;
  icon: typeof LayoutDashboard;
  roles: Role[];
  section?: string;
};

const ALL_NAV: NavItem[] = [
  { title: 'Dashboard',     url: '/',              icon: LayoutDashboard, roles: ['super_admin', 'admin', 'finance', 'operations', 'field_staff', 'driver'] },
  { title: 'Approvals',     url: '/approvals',     icon: Inbox,           roles: ['super_admin', 'admin', 'finance'], section: 'Finance' },
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

export function MobileNav() {
  const location = useLocation();
  const navigate = useNavigate();
  const approvalTotal = useApprovalStore((s) => s.counts.total);
  const effectiveRole = useEffectiveRole();
  const [moreOpen, setMoreOpen] = useState(false);

  const role = effectiveRole as Role | undefined;
  const navItems = role ? ALL_NAV.filter((n) => n.roles.includes(role)) : ALL_NAV;

  return (
    <>
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-card border-t safe-bottom">
        <div className="flex items-center justify-around h-14">
          {TABS.map((tab) => {
            const active =
              location.pathname === tab.url ||
              (tab.url !== '/' && location.pathname.startsWith(tab.url));
            return (
              <NavLink
                key={tab.title}
                to={tab.url}
                className={cn(
                  'flex flex-col items-center gap-0.5 px-3 py-1 kd-transition relative',
                  active ? 'text-primary' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <tab.icon className="h-5 w-5" />
                <span className="text-[10px] font-medium">{tab.title}</span>
                {tab.title === 'Approvals' && approvalTotal > 0 && (
                  <span className="absolute -top-0.5 right-0.5 h-4 min-w-4 px-1 rounded-full bg-warning text-[9px] font-bold text-warning-foreground flex items-center justify-center">
                    {approvalTotal > 9 ? '9+' : approvalTotal}
                  </span>
                )}
              </NavLink>
            );
          })}

          <button
            onClick={() => setMoreOpen(true)}
            className="flex flex-col items-center gap-0.5 px-3 py-1 kd-transition text-muted-foreground hover:text-foreground"
          >
            <Menu className="h-5 w-5" />
            <span className="text-[10px] font-medium">More</span>
          </button>
        </div>
      </nav>

      <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
        <SheetContent side="bottom" className="max-h-[80vh] overflow-y-auto rounded-t-xl">
          <SheetHeader className="flex flex-row items-center justify-between pb-2">
            <SheetTitle className="text-base">Navigation</SheetTitle>
            <button
              onClick={() => setMoreOpen(false)}
              className="text-muted-foreground hover:text-foreground kd-transition"
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </button>
          </SheetHeader>

          <div className="space-y-1 pb-6">
            {navItems.map((item, idx) => {
              const active =
                location.pathname === item.url ||
                (item.url !== '/' && location.pathname.startsWith(item.url));
              const showSection = item.section && idx > 0;
              return (
                <div key={item.title}>
                  {showSection && (
                    <p className="px-3 pt-4 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/50">
                      {item.section}
                    </p>
                  )}
                  <button
                    onClick={() => { setMoreOpen(false); navigate(item.url); }}
                    className={cn(
                      'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm kd-transition',
                      active
                        ? 'bg-primary/10 text-primary font-medium'
                        : 'text-foreground hover:bg-muted',
                    )}
                  >
                    <item.icon className="h-4 w-4 shrink-0" />
                    {item.title}
                  </button>
                </div>
              );
            })}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
