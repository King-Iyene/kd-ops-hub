import { useEffect, useState, useCallback } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  LogOut,
  Users,
  Settings,
  Landmark,
  Truck,
  Layers,
  Contact2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/lib/supabase';
import { useAuthStore, useEffectiveRole } from '@/store/authStore';
import { BrandLogo } from '@/components/BrandLogo';
import type { Role } from '@/lib/roles';
import { useApprovalStore } from '@/store/approvalStore';
import {
  ALL_NAV,
  NAV_GROUPS,
  UNGROUPED_TITLES,
  SIDEBAR_HUBS,
  filterNavByRoleAndPermissions,
  type NavItem,
  type NavGroupKey,
  type SidebarHub,
} from '@/lib/navConfig';
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

const HUB_ICONS: Record<string, typeof Users> = {
  Users,
  Settings,
  Landmark,
  Truck,
  Layers,
  Contact2,
};

function getInitials(name: string): string {
  return name
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0] ?? '')
    .join('')
    .toUpperCase();
}

export function AppSidebar() {
  const { state, setOpenMobile, isMobile } = useSidebar();
  const sidebarCollapsed = state === 'collapsed';
  const { profile, signOut } = useAuthStore();
  const effectiveRole = useEffectiveRole();
  const location = useLocation();
  const approvalTotal = useApprovalStore((s) => s.counts.total);
  const refreshApprovals = useApprovalStore((s) => s.refresh);

  useEffect(() => {
    if (isMobile) setOpenMobile(false);
  }, [location.pathname, isMobile, setOpenMobile]);

  const [anomalyOpenCount, setAnomalyOpenCount] = useState<number>(0);

  useEffect(() => {
    refreshApprovals();
    const id = setInterval(refreshApprovals, 90_000);
    return () => clearInterval(id);
  }, [refreshApprovals]);

  useEffect(() => {
    const fetchCount = () => {
      supabase
        .from('payment_anomalies')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'open')
        .in('severity', ['critical', 'high'])
        .then(({ count }) => setAnomalyOpenCount(count ?? 0));
    };
    fetchCount();
    const id = setInterval(fetchCount, 120_000);
    return () => clearInterval(id);
  }, []);

  // ─── Active hub ────────────────────────────────────────────────────────────
  const [activeHub, setActiveHub] = useState<string | null>(null);

  // Sub-group collapse state within hub view
  const [hubGroupCollapsed, setHubGroupCollapsed] = useState<Record<string, boolean>>({});
  const toggleHubGroup = (key: string) => {
    setHubGroupCollapsed((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  // Auto-enter hub when route matches a hub item
  useEffect(() => {
    for (const hub of SIDEBAR_HUBS) {
      const groupTitles = hub.groups.flatMap((gk) => {
        const g = NAV_GROUPS.find((ng) => ng.key === gk);
        return g ? [...g.titles] : [];
      });
      const hubUrls = ALL_NAV
        .filter((n) => groupTitles.includes(n.title))
        .map((n) => n.url);
      const isInHub = hubUrls.some(
        (url) => location.pathname === url || (url !== '/' && location.pathname.startsWith(url)),
      );
      if (isInHub) {
        setActiveHub(hub.key);
        return;
      }
    }
    // Check if on an ungrouped page
    const ungroupedUrls = ALL_NAV
      .filter((n) => UNGROUPED_TITLES.includes(n.title))
      .map((n) => n.url);
    const isUngrouped = ungroupedUrls.some(
      (url) => location.pathname === url || (url !== '/' && location.pathname.startsWith(url)),
    );
    if (isUngrouped) {
      setActiveHub(null);
    }
  }, [location.pathname]);

  // ─── Role + permission filtering ──────────────────────────────────────────
  const role = effectiveRole as Role | undefined;
  const isViewAs = (profile?.role === 'super_admin') && (effectiveRole !== 'super_admin');
  const permissions = isViewAs
    ? null
    : ((profile as any)?.permissions as Record<string, boolean> | null | undefined);
  const navItems = filterNavByRoleAndPermissions(ALL_NAV, role, permissions);

  // ─── Render a single nav item ─────────────────────────────────────────────
  const renderNavItem = useCallback((item: NavItem) => {
    const hasExactMatch = navItems.some((n) => n.url === location.pathname);
    const active = hasExactMatch
      ? location.pathname === item.url
      : location.pathname === item.url ||
        (item.url !== '/' && location.pathname.startsWith(item.url));
    const badgeCount =
      item.badge === 'approvals' ? approvalTotal :
      item.badge === 'anomalies' ? anomalyOpenCount : 0;
    const showBadge = badgeCount > 0;
    const badgeTone = item.badge === 'anomalies'
      ? 'bg-red-500/90 text-white'
      : 'bg-amber-400/90 text-amber-900';

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
            className={cn(
              'flex items-center gap-2.5 rounded-lg px-2 py-[7px] text-[13px] font-medium',
              'kd-transition group relative',
              active
                ? 'bg-white/[0.11] text-white shadow-[inset_0_1px_0_hsl(0_0%_100%/0.07)]'
                : 'text-sidebar-foreground/65 hover:bg-white/[0.06] hover:text-sidebar-foreground',
            )}
          >
            {active && (
              <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-4 rounded-r-full bg-[hsl(var(--sidebar-ring))] shadow-[0_0_6px_hsl(var(--sidebar-ring)/0.8)]" />
            )}
            <item.icon
              className={cn(
                'h-[15px] w-[15px] shrink-0 kd-transition',
                active
                  ? 'text-[hsl(var(--sidebar-ring))]'
                  : 'text-sidebar-foreground/40 group-hover:text-sidebar-foreground/75',
              )}
            />
            {!sidebarCollapsed && (
              <>
                <span className="flex-1 truncate">{item.title}</span>
                {showBadge && (
                  <span className={cn(
                    'relative ml-auto flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1',
                    'text-[9px] font-bold tabular-nums kd-status-live-warning',
                    badgeTone,
                  )}>
                    {badgeCount > 99 ? '99+' : badgeCount}
                  </span>
                )}
              </>
            )}
            {sidebarCollapsed && showBadge && (
              <span className={cn(
                'absolute top-0.5 right-0.5 h-1.5 w-1.5 rounded-full kd-status-live-warning',
                item.badge === 'anomalies' ? 'bg-red-500' : 'bg-amber-400',
              )} />
            )}
          </NavLink>
        </SidebarMenuButton>
      </SidebarMenuItem>
    );
  }, [navItems, location.pathname, approvalTotal, anomalyOpenCount, sidebarCollapsed]);

  const ungroupedItems = navItems.filter((n) => UNGROUPED_TITLES.includes(n.title));

  // ─── Helpers ───────────────────────────────────────────────────────────────

  function getHubItems(hub: SidebarHub) {
    const groupTitles = hub.groups.flatMap((gk) => {
      const g = NAV_GROUPS.find((ng) => ng.key === gk);
      return g ? [...g.titles] : [];
    });
    return navItems.filter((n) => groupTitles.includes(n.title));
  }

  function isHubActive(hub: SidebarHub) {
    const items = getHubItems(hub);
    return items.some(
      (n) => location.pathname === n.url || (n.url !== '/' && location.pathname.startsWith(n.url)),
    );
  }

  // ─── Hub sub-view ──────────────────────────────────────────────────────────

  const activeHubConfig = activeHub ? SIDEBAR_HUBS.find((h) => h.key === activeHub) : null;

  if (activeHubConfig && !sidebarCollapsed) {
    const HubIcon = HUB_ICONS[activeHubConfig.icon] ?? Layers;
    const hubNavGroups = activeHubConfig.groups
      .map((gk) => NAV_GROUPS.find((ng) => ng.key === gk))
      .filter(Boolean) as (typeof NAV_GROUPS)[number][];

    return (
      <Sidebar collapsible="icon">
        {/* Hub header */}
        <div className="px-3 pt-3.5 pb-2 border-b border-sidebar-border/40">
          <button
            onClick={() => setActiveHub(null)}
            className="flex items-center gap-2.5 px-1.5 py-1.5 rounded-lg w-full text-left kd-transition hover:bg-white/[0.06] group/back"
          >
            <ChevronLeft className="h-3.5 w-3.5 text-sidebar-foreground/40 group-hover/back:text-sidebar-foreground/70 kd-transition shrink-0" />
            <div className={cn('h-7 w-7 rounded-lg flex items-center justify-center shrink-0', activeHubConfig.iconBg)}>
              <HubIcon className={cn('h-3.5 w-3.5', activeHubConfig.color)} />
            </div>
            <div className="min-w-0">
              <p className="text-[13px] font-semibold text-sidebar-primary leading-none tracking-tight">
                {activeHubConfig.label}
              </p>
              <p className="text-[10px] text-sidebar-foreground/40 mt-0.5 leading-none truncate">
                {activeHubConfig.description}
              </p>
            </div>
          </button>
        </div>

        <SidebarContent className="pt-1 pb-2">
          {hubNavGroups.map((group) => {
            const groupItems = navItems.filter((n) =>
              (group.titles as readonly string[]).includes(n.title),
            );
            if (groupItems.length === 0) return null;

            const hasManyGroups = hubNavGroups.length > 1;
            const isCollapsed = hubGroupCollapsed[group.key] ?? false;

            return (
              <SidebarGroup key={group.key} className="p-0">
                <SidebarGroupContent>
                  {hasManyGroups && (
                    <button
                      onClick={() => toggleHubGroup(group.key)}
                      className="flex w-full items-center gap-1.5 px-3 pt-3 pb-1 kd-transition hover:opacity-90 focus-visible:outline-none group/sub"
                      aria-expanded={!isCollapsed}
                    >
                      <span className="text-[9px] font-bold uppercase tracking-[0.14em] text-sidebar-foreground/35 flex-1 text-left group-hover/sub:text-sidebar-foreground/55 kd-transition">
                        {group.label}
                      </span>
                      <ChevronDown
                        className={cn(
                          'h-3 w-3 text-sidebar-foreground/25 transition-transform duration-200',
                          'group-hover/sub:text-sidebar-foreground/45',
                          isCollapsed ? '-rotate-90' : '',
                        )}
                      />
                    </button>
                  )}
                  {(!isCollapsed || !hasManyGroups) && (
                    <SidebarMenu className="gap-0.5 px-2 mt-0.5">
                      {groupItems.map(renderNavItem)}
                    </SidebarMenu>
                  )}
                </SidebarGroupContent>
              </SidebarGroup>
            );
          })}
        </SidebarContent>

        {/* Footer */}
        <SidebarFooter className="border-t border-sidebar-border/40 pt-1.5 pb-2.5 px-2">
          <SidebarMenu>
            <SidebarMenuItem className="list-none">
              <SidebarMenuButton
                onClick={signOut}
                className="flex items-center gap-2.5 rounded-md px-2 py-1.5 text-[13px] font-medium text-sidebar-foreground/55 hover:bg-red-500/10 hover:text-red-300 kd-transition w-full"
              >
                <LogOut className="h-3.5 w-3.5 shrink-0" />
                <span>Sign Out</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>

          {profile && (
            <div className="flex items-center gap-2.5 px-2.5 py-2 mt-1 rounded-xl bg-white/[0.06] border border-white/[0.06]">
              <div className="relative shrink-0">
                <div className="h-7 w-7 rounded-lg kd-gradient-brand flex items-center justify-center text-[11px] font-bold text-white ring-1 ring-white/10">
                  {getInitials(profile.full_name ?? profile.email ?? 'U')}
                </div>
                <span className="absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full bg-emerald-400 ring-[1.5px] ring-sidebar-background" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[12px] font-semibold text-sidebar-foreground/90 truncate leading-none">
                  {profile.full_name ?? 'User'}
                </p>
                <p className="text-[10px] text-sidebar-foreground/40 truncate mt-0.5 leading-none">
                  {profile.email}
                </p>
              </div>
            </div>
          )}
        </SidebarFooter>
      </Sidebar>
    );
  }

  // ─── Main sidebar view ─────────────────────────────────────────────────────

  return (
    <Sidebar collapsible="icon">
      {/* Logo area */}
      <div className="px-3 pt-3.5 pb-3 border-b border-sidebar-border/40">
        {!sidebarCollapsed ? (
          <div className="flex items-center gap-2.5 px-0.5">
            <div className="relative shrink-0">
              <BrandLogo size={32} className="h-8 w-8 rounded-lg ring-1 ring-sidebar-border/40 bg-white/5" />
              <span className="absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full bg-emerald-400 ring-2 ring-sidebar-background" />
            </div>
            <div className="min-w-0">
              <p className="text-[13px] font-semibold text-sidebar-primary leading-none tracking-tight">KDOps</p>
              <p className="text-[10.5px] text-sidebar-foreground/45 mt-0.5 tracking-tight">Operations</p>
            </div>
          </div>
        ) : (
          <div className="flex justify-center">
            <BrandLogo size={28} className="h-7 w-7 rounded-lg bg-white/5" />
          </div>
        )}
      </div>

      <SidebarContent className="pt-2 pb-2">
        <SidebarGroup className="p-0">
          <SidebarGroupContent>
            {/* Ungrouped: Dashboard, My Dashboard, Approvals, Finance */}
            <SidebarMenu className="gap-0.5 px-2 mb-2">
              {ungroupedItems.map(renderNavItem)}
            </SidebarMenu>

            {/* Separator */}
            {!sidebarCollapsed && (
              <div className="mx-3 mb-2">
                <div className="h-px bg-sidebar-border/25" />
                <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-sidebar-foreground/30 mt-2.5 mb-1 px-0.5">
                  Modules
                </p>
              </div>
            )}
            {sidebarCollapsed && <div className="mx-3 my-2 h-px bg-sidebar-border/20" />}

            {/* Hub cards */}
            {!sidebarCollapsed ? (
              <div className="px-2 space-y-1">
                {SIDEBAR_HUBS.map((hub) => {
                  const items = getHubItems(hub);
                  if (items.length === 0) return null;
                  const active = isHubActive(hub);
                  const Icon = HUB_ICONS[hub.icon] ?? Layers;

                  return (
                    <button
                      key={hub.key}
                      onClick={() => setActiveHub(hub.key)}
                      className={cn(
                        'w-full flex items-center gap-3 rounded-xl px-2.5 py-2.5 text-left kd-transition group/hub',
                        'border border-transparent',
                        active
                          ? 'bg-white/[0.09] border-white/[0.08] shadow-[inset_0_1px_0_hsl(0_0%_100%/0.06),_0_1px_3px_hsl(0_0%_0%/0.15)]'
                          : 'hover:bg-white/[0.05] hover:border-white/[0.04]',
                      )}
                    >
                      <div className={cn(
                        'h-9 w-9 rounded-lg flex items-center justify-center shrink-0 kd-transition',
                        hub.iconBg,
                        active && 'ring-1 ring-white/10',
                      )}>
                        <Icon className={cn('h-4 w-4 kd-transition', hub.color)} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-1">
                          <p className={cn(
                            'text-[13px] font-semibold leading-none kd-transition truncate',
                            active ? 'text-sidebar-primary' : 'text-sidebar-foreground/75 group-hover/hub:text-sidebar-foreground/90',
                          )}>
                            {hub.label}
                          </p>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <span className="text-[10px] tabular-nums text-sidebar-foreground/25 font-medium">
                              {items.length}
                            </span>
                            <ChevronRight className="h-3 w-3 text-sidebar-foreground/20 group-hover/hub:text-sidebar-foreground/40 kd-transition" />
                          </div>
                        </div>
                        <p className="text-[10.5px] text-sidebar-foreground/35 mt-0.5 leading-none truncate group-hover/hub:text-sidebar-foreground/45 kd-transition">
                          {hub.description}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : (
              /* Collapsed mode: show hub icons as tooltip buttons */
              <SidebarMenu className="gap-0.5 px-2">
                {SIDEBAR_HUBS.map((hub) => {
                  const items = getHubItems(hub);
                  if (items.length === 0) return null;
                  const active = isHubActive(hub);
                  const Icon = HUB_ICONS[hub.icon] ?? Layers;

                  return (
                    <SidebarMenuItem key={hub.key} className="list-none">
                      <SidebarMenuButton
                        tooltip={hub.label}
                        isActive={active}
                        className="relative"
                        onClick={() => setActiveHub(hub.key)}
                      >
                        <div className={cn(
                          'flex items-center justify-center w-full py-0.5',
                        )}>
                          <Icon className={cn(
                            'h-[15px] w-[15px] kd-transition',
                            active ? hub.color : 'text-sidebar-foreground/40',
                          )} />
                        </div>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            )}
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      {/* Footer */}
      <SidebarFooter className="border-t border-sidebar-border/40 pt-1.5 pb-2.5 px-2">
        <SidebarMenu>
          <SidebarMenuItem className="list-none">
            <SidebarMenuButton
              onClick={signOut}
              tooltip={sidebarCollapsed ? 'Sign Out' : undefined}
              className="flex items-center gap-2.5 rounded-md px-2 py-1.5 text-[13px] font-medium text-sidebar-foreground/55 hover:bg-red-500/10 hover:text-red-300 kd-transition w-full"
            >
              <LogOut className="h-3.5 w-3.5 shrink-0" />
              {!sidebarCollapsed && <span>Sign Out</span>}
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>

        {!sidebarCollapsed && profile && (
          <div className="flex items-center gap-2.5 px-2.5 py-2 mt-1 rounded-xl bg-white/[0.06] border border-white/[0.06]">
            <div className="relative shrink-0">
              <div className="h-7 w-7 rounded-lg kd-gradient-brand flex items-center justify-center text-[11px] font-bold text-white ring-1 ring-white/10">
                {getInitials(profile.full_name ?? profile.email ?? 'U')}
              </div>
              <span className="absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full bg-emerald-400 ring-[1.5px] ring-sidebar-background" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[12px] font-semibold text-sidebar-foreground/90 truncate leading-none">
                {profile.full_name ?? 'User'}
              </p>
              <p className="text-[10px] text-sidebar-foreground/40 truncate mt-0.5 leading-none">
                {profile.email}
              </p>
            </div>
          </div>
        )}
      </SidebarFooter>
    </Sidebar>
  );
}
