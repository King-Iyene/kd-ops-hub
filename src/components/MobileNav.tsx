import { useMemo, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  CreditCard,
  Receipt,
  Truck,
  Inbox,
  Menu,
  X,
  Search,
  ListTodo,
  LogOut,
  User,
  ChevronRight,
} from 'lucide-react';
import { useApprovalStore } from '@/store/approvalStore';
import { useAuthStore, useEffectiveRole } from '@/store/authStore';
import { cn } from '@/lib/utils';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import type { Role } from '@/lib/roles';
import {
  ALL_NAV,
  NAV_GROUPS,
  filterNavByRoleAndPermissions,
} from '@/lib/navConfig';
import { supabase } from '@/lib/supabase';

type TabDef = {
  title: string;
  url: string;
  icon: typeof LayoutDashboard;
  badge?: 'approvals';
  roles?: Role[];
  permission?: string;
};

const ROLE_TABS: Record<string, TabDef[]> = {
  super_admin: [
    { title: 'Home',      url: '/',          icon: LayoutDashboard },
    { title: 'Approvals', url: '/approvals', icon: Inbox, badge: 'approvals' },
    { title: 'Payments',  url: '/payments',  icon: CreditCard },
    { title: 'Expenses',  url: '/expenses',  icon: Receipt },
  ],
  admin: [
    { title: 'Home',      url: '/',          icon: LayoutDashboard },
    { title: 'Approvals', url: '/approvals', icon: Inbox, badge: 'approvals' },
    { title: 'Payments',  url: '/payments',  icon: CreditCard },
    { title: 'Expenses',  url: '/expenses',  icon: Receipt },
  ],
  finance: [
    { title: 'Home',      url: '/',          icon: LayoutDashboard },
    { title: 'Approvals', url: '/approvals', icon: Inbox, badge: 'approvals' },
    { title: 'Payments',  url: '/payments',  icon: CreditCard },
    { title: 'Expenses',  url: '/expenses',  icon: Receipt },
  ],
  operations: [
    { title: 'Home',      url: '/',          icon: LayoutDashboard },
    { title: 'Fleet',     url: '/fleet',     icon: Truck },
    { title: 'Expenses',  url: '/expenses',  icon: Receipt },
    { title: 'Tasks',     url: '/tasks',     icon: ListTodo },
  ],
  field_staff: [
    { title: 'Home',      url: '/',          icon: LayoutDashboard },
    { title: 'Fleet',     url: '/fleet',     icon: Truck },
    { title: 'Expenses',  url: '/expenses',  icon: Receipt },
    { title: 'Tasks',     url: '/tasks',     icon: ListTodo },
  ],
  driver: [
    { title: 'Home',      url: '/',          icon: LayoutDashboard },
    { title: 'Fleet',     url: '/fleet',     icon: Truck },
    { title: 'Expenses',  url: '/expenses',  icon: Receipt },
    { title: 'Tasks',     url: '/tasks',     icon: ListTodo },
  ],
};

const DEFAULT_TABS: TabDef[] = [
  { title: 'Home',     url: '/',         icon: LayoutDashboard },
  { title: 'Expenses', url: '/expenses', icon: Receipt },
  { title: 'Tasks',    url: '/tasks',    icon: ListTodo },
];

export function MobileNav() {
  const location = useLocation();
  const navigate = useNavigate();
  const approvalTotal = useApprovalStore((s) => s.counts.total);
  const profile = useAuthStore((s) => s.profile);
  const effectiveRole = useEffectiveRole();
  const [moreOpen, setMoreOpen] = useState(false);

  const role = effectiveRole as Role | undefined;
  const isViewAs = (profile?.role === 'super_admin') && (effectiveRole !== 'super_admin');
  const permissions = isViewAs
    ? null
    : ((profile as any)?.permissions as Record<string, boolean> | null | undefined);

  const tabs = useMemo(() => {
    return ROLE_TABS[role ?? ''] ?? DEFAULT_TABS;
  }, [role]);

  const visibleItems = filterNavByRoleAndPermissions(ALL_NAV, role, permissions);
  const visibleGroups = NAV_GROUPS
    .map((g) => ({
      ...g,
      items: visibleItems.filter((it) => (g.titles as readonly string[]).includes(it.title)),
    }))
    .filter((g) => g.items.length > 0);

  const ungroupedItems = visibleItems.filter(
    (it) => !NAV_GROUPS.some((g) => (g.titles as readonly string[]).includes(it.title)),
  );

  const openCommandPalette = () => {
    setMoreOpen(false);
    window.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true }),
    );
  };

  const handleSignOut = async () => {
    setMoreOpen(false);
    await supabase.auth.signOut();
  };

  return (
    <>
      {/* ── Bottom tab bar ───────────────────────────────────────── */}
      <nav
        className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-card/95 backdrop-blur-lg border-t border-border/50 safe-bottom"
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      >
        <div className="flex items-center justify-around h-14 px-1">
          {tabs.map((tab) => {
            const active =
              location.pathname === tab.url ||
              (tab.url !== '/' && location.pathname.startsWith(tab.url));
            return (
              <NavLink
                key={tab.title}
                to={tab.url}
                className={cn(
                  'flex flex-col items-center justify-center gap-0.5 flex-1 py-1.5 rounded-xl kd-transition relative active:scale-95',
                  active ? 'text-primary' : 'text-muted-foreground',
                )}
              >
                {active && (
                  <span className="absolute top-0 left-1/2 -translate-x-1/2 h-0.5 w-5 rounded-full bg-primary" />
                )}
                <tab.icon className={cn('h-5 w-5 kd-transition', active && 'text-primary')} />
                <span className={cn('text-[10px] font-medium leading-tight', active && 'text-primary font-semibold')}>{tab.title}</span>
                {tab.badge === 'approvals' && approvalTotal > 0 && (
                  <span className="absolute top-0 right-[calc(50%-14px)] h-4 min-w-4 px-0.5 rounded-full bg-amber-400 text-[9px] font-bold text-amber-900 flex items-center justify-center">
                    {approvalTotal > 9 ? '9+' : approvalTotal}
                  </span>
                )}
              </NavLink>
            );
          })}

          <button
            onClick={() => setMoreOpen(true)}
            className={cn(
              'flex flex-col items-center justify-center gap-0.5 flex-1 py-1.5 rounded-xl kd-transition active:scale-95',
              moreOpen ? 'text-primary' : 'text-muted-foreground',
            )}
          >
            <Menu className="h-5 w-5" />
            <span className="text-[10px] font-medium leading-tight">More</span>
          </button>
        </div>
      </nav>

      {/* ── "More" bottom sheet ──────────────────────────────────── */}
      <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
        <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto rounded-t-2xl px-4 pb-8">
          {/* Drag handle */}
          <div className="flex justify-center pt-2 pb-3">
            <span className="w-10 h-1 rounded-full bg-border/80" />
          </div>
          <SheetHeader className="flex flex-row items-center justify-between pb-1">
            <SheetTitle className="text-base font-semibold">Menu</SheetTitle>
            <button
              onClick={() => setMoreOpen(false)}
              className="text-muted-foreground hover:text-foreground kd-transition p-1 -mr-1"
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </button>
          </SheetHeader>

          {/* Search */}
          <button
            onClick={openCommandPalette}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border border-border/60 bg-muted/40 hover:bg-muted/70 kd-transition mb-4 mt-2 active:scale-[0.99]"
          >
            <Search className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground flex-1 text-left">Search…</span>
          </button>

          {/* Ungrouped items (Dashboard, Approvals if visible) */}
          {ungroupedItems.length > 0 && (
            <div className="space-y-0.5 mb-3">
              {ungroupedItems.map((item) => {
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
                        : 'text-foreground hover:bg-muted/60',
                    )}
                  >
                    <item.icon className={cn('h-5 w-5 shrink-0', active ? 'text-primary' : 'text-muted-foreground')} />
                    <span className="flex-1 text-left truncate">{item.title}</span>
                    {item.badge === 'approvals' && approvalTotal > 0 && (
                      <span className="h-5 min-w-5 px-1 rounded-full bg-amber-400 text-[10px] font-bold text-amber-900 flex items-center justify-center">
                        {approvalTotal > 9 ? '9+' : approvalTotal}
                      </span>
                    )}
                    <ChevronRight className={cn('h-4 w-4 shrink-0', active ? 'text-primary/50' : 'text-muted-foreground/40')} />
                  </button>
                );
              })}
            </div>
          )}

          {/* Grouped nav — compact list rows */}
          <div className="space-y-3">
            {visibleGroups.map((group) => (
              <div key={group.label}>
                <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">
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
                            : 'text-foreground hover:bg-muted/60',
                        )}
                      >
                        <item.icon className={cn('h-5 w-5 shrink-0', active ? 'text-primary' : 'text-muted-foreground')} />
                        <span className="flex-1 text-left truncate">{item.title}</span>
                        <ChevronRight className={cn('h-4 w-4 shrink-0', active ? 'text-primary/50' : 'text-muted-foreground/40')} />
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          {/* Profile + Sign out */}
          <div className="mt-6 pt-4 border-t border-border/50 flex items-center gap-3">
            <button
              onClick={() => { setMoreOpen(false); navigate('/profile'); }}
              className="flex-1 flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-muted/40 hover:bg-muted/70 text-sm kd-transition active:scale-[0.98]"
            >
              <User className="h-4 w-4 text-muted-foreground" />
              <span className="truncate">{(profile as any)?.full_name || 'Profile'}</span>
            </button>
            <button
              onClick={handleSignOut}
              className="flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm text-destructive hover:bg-destructive/10 kd-transition active:scale-[0.98]"
            >
              <LogOut className="h-4 w-4" />
              <span>Sign out</span>
            </button>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
