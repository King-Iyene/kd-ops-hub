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
  Search,
  ClipboardList,
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
};

// Mobile "More" sheet — grouped to mirror the desktop sidebar.
const GROUPS: { label: string; items: NavItem[] }[] = [
  {
    label: 'Finance',
    items: [
      { title: 'Approvals',     url: '/approvals',     icon: Inbox,         roles: ['super_admin', 'admin', 'finance'] },
      { title: 'Payments',      url: '/payments',      icon: Layers,        roles: ['super_admin', 'admin', 'finance'] },
      { title: 'Transactions',  url: '/transactions',  icon: ArrowUpDown,   roles: ['super_admin', 'admin', 'finance'] },
      { title: 'Payroll',       url: '/payroll',       icon: Banknote,      roles: ['super_admin', 'admin', 'finance'] },
      { title: 'Subscriptions', url: '/subscriptions', icon: CalendarClock, roles: ['super_admin', 'admin', 'finance'] },
      { title: 'Budgets',       url: '/budgets',       icon: PiggyBank,     roles: ['super_admin', 'admin', 'finance'] },
      { title: 'Cards',         url: '/cards',         icon: CreditCard,    roles: ['super_admin', 'admin', 'finance'] },
      { title: 'Compliance',    url: '/compliance',    icon: ShieldCheck,   roles: ['super_admin', 'admin', 'finance'] },
    ],
  },
  {
    label: 'Operations',
    items: [
      { title: 'My Requests', url: '/my-requests', icon: ClipboardList, roles: ['super_admin', 'admin', 'finance', 'operations', 'field_staff', 'driver'] },
      { title: 'Expenses',    url: '/expenses',    icon: Receipt,    roles: ['super_admin', 'admin', 'finance', 'operations', 'field_staff', 'driver'] },
      { title: 'Fleet',       url: '/fleet',       icon: Truck,      roles: ['super_admin', 'admin', 'operations', 'field_staff', 'driver'] },
      { title: 'Contractors', url: '/contractors', icon: Users,      roles: ['super_admin', 'admin', 'finance', 'operations'] },
      { title: 'Employees',   url: '/employees',   icon: UserCog,    roles: ['super_admin', 'admin'] },
      { title: 'Leave',       url: '/leave',       icon: CalendarDays, roles: ['super_admin', 'admin', 'finance', 'operations', 'field_staff', 'driver'] },
    ],
  },
  {
    label: 'Workspace',
    items: [
      { title: 'Tasks',     url: '/tasks',     icon: ListTodo,    roles: ['super_admin', 'admin', 'finance', 'operations', 'field_staff', 'driver'] },
      { title: 'Goals',     url: '/goals',     icon: Target,      roles: ['super_admin', 'admin', 'finance', 'operations', 'field_staff', 'driver'] },
      { title: 'Knowledge', url: '/knowledge', icon: BookOpen,    roles: ['super_admin', 'admin', 'finance', 'operations', 'field_staff', 'driver'] },
      { title: 'Documents', url: '/documents', icon: FileText,    roles: ['super_admin', 'admin', 'finance'] },
      { title: 'Reports',   url: '/reports',   icon: BarChart3,   roles: ['super_admin', 'admin', 'finance'] },
    ],
  },
  {
    label: 'CRM',
    items: [
      { title: 'Contacts',  url: '/contacts',  icon: Contact2, roles: ['super_admin', 'admin', 'finance', 'operations'] },
      { title: 'Referrals', url: '/referrals', icon: Gift,     roles: ['super_admin', 'admin', 'finance', 'operations', 'field_staff', 'driver'] },
    ],
  },
  {
    label: 'Admin',
    items: [
      { title: 'Audit Log', url: '/audit',    icon: ScrollText, roles: ['super_admin', 'admin'] },
      { title: 'Settings',  url: '/settings', icon: Settings,   roles: ['super_admin'] },
    ],
  },
];

export function MobileNav() {
  const location = useLocation();
  const navigate = useNavigate();
  const approvalTotal = useApprovalStore((s) => s.counts.total);
  const effectiveRole = useEffectiveRole();
  const [moreOpen, setMoreOpen] = useState(false);

  const role = effectiveRole as Role | undefined;
  const visibleGroups = role
    ? GROUPS.map((g) => ({ ...g, items: g.items.filter((it) => it.roles.includes(role)) }))
        .filter((g) => g.items.length > 0)
    : GROUPS;

  const openCommandPalette = () => {
    setMoreOpen(false);
    window.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true }),
    );
  };

  return (
    <>
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-card/90 backdrop-blur-md border-t border-border/60 safe-bottom shadow-[0_-1px_0_hsl(var(--border)/0.5),0_-4px_16px_-4px_hsl(var(--primary)/0.08)]">
        <div className="flex items-center justify-around h-14 px-2">
          {TABS.map((tab) => {
            const active =
              location.pathname === tab.url ||
              (tab.url !== '/' && location.pathname.startsWith(tab.url));
            return (
              <NavLink
                key={tab.title}
                to={tab.url}
                className={cn(
                  'flex flex-col items-center gap-0.5 min-w-[52px] py-1.5 px-3 rounded-xl kd-transition relative active:scale-95',
                  active ? 'text-primary bg-primary/8' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {active && (
                  <>
                    <span className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-px h-0.5 w-6 rounded-full bg-primary" />
                    {/* Soft TOD-aware halo behind the active icon */}
                    <span className="pointer-events-none absolute inset-x-3 inset-y-1 rounded-lg bg-[hsl(var(--tod-glow))] opacity-10 blur-md" />
                  </>
                )}
                <tab.icon className={cn('relative h-5 w-5 kd-transition', active && 'text-primary scale-110')} />
                <span className={cn('relative text-[10px] font-medium', active && 'text-primary')}>{tab.title}</span>
                {tab.title === 'Approvals' && approvalTotal > 0 && (
                  <span className="absolute top-0.5 right-1.5 h-4 min-w-4 px-1 rounded-full bg-amber-400 text-[9px] font-bold text-amber-900 flex items-center justify-center kd-status-live-warning">
                    {approvalTotal > 9 ? '9+' : approvalTotal}
                  </span>
                )}
              </NavLink>
            );
          })}

          <button
            onClick={() => setMoreOpen(true)}
            className="flex flex-col items-center gap-0.5 min-w-[52px] py-1.5 px-3 rounded-xl kd-transition text-muted-foreground hover:text-foreground hover:bg-muted/60 active:scale-95"
          >
            <Menu className="h-5 w-5" />
            <span className="text-[10px] font-medium">More</span>
          </button>
        </div>
      </nav>

      <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
        <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto rounded-t-2xl">
          <SheetHeader className="flex flex-row items-center justify-between pb-2">
            <SheetTitle className="kd-display text-lg">Navigation</SheetTitle>
            <button
              onClick={() => setMoreOpen(false)}
              className="text-muted-foreground hover:text-foreground kd-transition"
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </button>
          </SheetHeader>

          {/* Search button — opens the command palette */}
          <button
            onClick={openCommandPalette}
            className="w-full flex items-center gap-3 px-3 py-3 rounded-lg border border-border/60 bg-muted/40 hover:bg-muted/70 kd-transition mb-3 mt-2 active:scale-[0.99]"
          >
            <Search className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground flex-1 text-left">Search anywhere…</span>
            <kbd className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-card border border-border/60 text-muted-foreground">
              ⌘ K
            </kbd>
          </button>

          <div className="space-y-4 pb-6">
            {visibleGroups.map((group) => (
              <div key={group.label}>
                <p className="px-3 pt-2 pb-1.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70">
                  {group.label}
                </p>
                <div className="space-y-0.5">
                  {group.items.map((item) => {
                    const active =
                      location.pathname === item.url ||
                      (item.url !== '/' && location.pathname.startsWith(item.url));
                    return (
                      <button
                        key={item.title}
                        onClick={() => { setMoreOpen(false); navigate(item.url); }}
                        className={cn(
                          'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm kd-transition active:scale-[0.99]',
                          active
                            ? 'bg-primary/10 text-primary font-medium'
                            : 'text-foreground hover:bg-muted',
                        )}
                      >
                        <item.icon className={cn('h-4 w-4 shrink-0', active && 'text-primary')} />
                        <span className="flex-1 text-left">{item.title}</span>
                        {item.url === '/approvals' && approvalTotal > 0 && (
                          <span className="ml-auto h-5 min-w-5 px-1.5 rounded-full bg-amber-400 text-[10px] font-bold text-amber-900 flex items-center justify-center kd-status-live-warning">
                            {approvalTotal > 9 ? '9+' : approvalTotal}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
