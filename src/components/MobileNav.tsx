import { useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  CreditCard,
  Receipt,
  Bell,
  Menu,
  X,
  Search,
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

const TABS = [
  { title: 'Home',      url: '/',          icon: LayoutDashboard },
  { title: 'Pay',       url: '/payments',  icon: CreditCard },
  { title: 'Expenses',  url: '/expenses',  icon: Receipt },
  { title: 'Approvals', url: '/approvals', icon: Bell },
] as const;

export function MobileNav() {
  const location = useLocation();
  const navigate = useNavigate();
  const approvalTotal = useApprovalStore((s) => s.counts.total);
  const profile = useAuthStore((s) => s.profile);
  const effectiveRole = useEffectiveRole();
  const [moreOpen, setMoreOpen] = useState(false);

  // Mirror AppSidebar's filter exactly so an admin who grants e.g.
  // payments.view to a field user sees the link in BOTH the desktop
  // sidebar AND the mobile More sheet. Before this fix the mobile
  // navigation hard-coded a smaller item list and didn't honour the
  // permissions JSONB at all — operators with custom grants would
  // see a strict role-default set on mobile that didn't match what
  // they had on desktop.
  //
  // View-as mode (super_admin simulating another role) suppresses the
  // permissions map for the same reason AppSidebar does — otherwise
  // the simulation leaks the simulator's own grants back into the
  // role being simulated.
  const role = effectiveRole as Role | undefined;
  const isViewAs = (profile?.role === 'super_admin') && (effectiveRole !== 'super_admin');
  const permissions = isViewAs
    ? null
    : ((profile as any)?.permissions as Record<string, boolean> | null | undefined);

  const visibleItems = filterNavByRoleAndPermissions(ALL_NAV, role, permissions);
  const visibleGroups = NAV_GROUPS
    .map((g) => ({
      ...g,
      items: visibleItems.filter((it) => (g.titles as readonly string[]).includes(it.title)),
    }))
    .filter((g) => g.items.length > 0);

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
