import { useEffect, useState, useCallback } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  ChevronDown,
  ChevronLeft,
  LogOut,
  Users,
  Settings,
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
  filterNavByRoleAndPermissions,
  type NavItem,
  type NavGroupKey,
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


// ─── localStorage helpers ─────────────────────────────────────────────────────

const lsKey = (k: NavGroupKey) => `kdops_sidebar_${k}_collapsed`;

function loadCollapsed(k: NavGroupKey): boolean {
  try {
    return localStorage.getItem(lsKey(k)) === 'true';
  } catch {
    return false;
  }
}

function persistCollapsed(k: NavGroupKey, v: boolean) {
  try {
    localStorage.setItem(lsKey(k), String(v));
  } catch { /* localStorage unavailable */ }
}

// ─── Hub icon map ────────────────────────────────────────────────────────────

const HUB_ICONS: Record<string, typeof Users> = {
  Users,
  Settings,
};

// ─── Utility ──────────────────────────────────────────────────────────────────

function getInitials(name: string): string {
  return name
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0] ?? '')
    .join('')
    .toUpperCase();
}

// ─── Component ────────────────────────────────────────────────────────────────

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

  // ─── Group collapse state (initialised from localStorage) ─────────────────

  const [groupCollapsed, setGroupCollapsed] = useState<Record<NavGroupKey, boolean>>(() => ({
    moneyOut:   loadCollapsed('moneyOut'),
    moneyIn:    loadCollapsed('moneyIn'),
    risk:       loadCollapsed('risk'),
    people:     loadCollapsed('people'),
    operations: loadCollapsed('operations'),
    workspace:  loadCollapsed('workspace'),
    crm:        loadCollapsed('crm'),
    admin:      loadCollapsed('admin'),
  }));

  function toggleGroup(key: NavGroupKey) {
    setGroupCollapsed((prev) => {
      const next = !prev[key];
      persistCollapsed(key, next);
      return { ...prev, [key]: next };
    });
  }

  // ─── Hub state ──────────────────────────────────────────────────────────────
  const [activeHub, setActiveHub] = useState<NavGroupKey | null>(null);

  const hubGroups = NAV_GROUPS.filter((g) => 'hub' in g && g.hub);

  // Auto-enter hub mode when the current route matches a hub item
  useEffect(() => {
    for (const group of hubGroups) {
      const groupTitles = group.titles as readonly string[];
      const groupUrls = ALL_NAV
        .filter((n) => groupTitles.includes(n.title))
        .map((n) => n.url);
      const isInHub = groupUrls.some(
        (url) => location.pathname === url || (url !== '/' && location.pathname.startsWith(url)),
      );
      if (isInHub) {
        setActiveHub(group.key);
        return;
      }
    }
    // Don't auto-exit hub when navigating to an ungrouped page —
    // only the back button exits. But if the user navigates to a
    // route in a DIFFERENT group (non-hub), exit the hub.
    if (activeHub) {
      const nonHubGroups = NAV_GROUPS.filter((g) => !('hub' in g && g.hub));
      for (const group of nonHubGroups) {
        const groupTitles = group.titles as readonly string[];
        const groupUrls = ALL_NAV
          .filter((n) => groupTitles.includes(n.title))
          .map((n) => n.url);
        const isInGroup = groupUrls.some(
          (url) => location.pathname === url || (url !== '/' && location.pathname.startsWith(url)),
        );
        if (isInGroup) {
          setActiveHub(null);
          return;
        }
      }
      // Check ungrouped
      const ungroupedUrls = ALL_NAV
        .filter((n) => UNGROUPED_TITLES.includes(n.title))
        .map((n) => n.url);
      const isUngrouped = ungroupedUrls.some(
        (url) => location.pathname === url || (url !== '/' && location.pathname.startsWith(url)),
      );
      if (isUngrouped) {
        setActiveHub(null);
      }
    }
  }, [location.pathname]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-expand the group containing the active route (non-hub groups only)
  useEffect(() => {
    for (const group of NAV_GROUPS) {
      if ('hub' in group && group.hub) continue;
      const groupUrls = ALL_NAV
        .filter((n) => (group.titles as readonly string[]).includes(n.title))
        .map((n) => n.url);
      const isGroupActive = groupUrls.some(
        (url) => location.pathname === url || (url !== '/' && location.pathname.startsWith(url)),
      );
      if (isGroupActive) {
        setGroupCollapsed((prev) => {
          if (!prev[group.key]) return prev;
          persistCollapsed(group.key, false);
          return { ...prev, [group.key]: false };
        });
      }
    }
  }, [location.pathname]);

  // ─── Role + permission filtering ─────────────────────────────────────────

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

  // ─── Hub sidebar view ──────────────────────────────────────────────────────

  const activeHubGroup = activeHub
    ? NAV_GROUPS.find((g) => g.key === activeHub)
    : null;

  if (activeHub && activeHubGroup && !sidebarCollapsed) {
    const hubItems = navItems.filter((n) =>
      (activeHubGroup.titles as readonly string[]).includes(n.title),
    );
    const HubIcon = 'icon' in activeHubGroup
      ? HUB_ICONS[activeHubGroup.icon as string] ?? Users
      : Users;

    return (
      <Sidebar collapsible="icon">
        {/* Hub header with back button */}
        <div className="px-3 pt-3.5 pb-3 border-b border-sidebar-border/40">
          <button
            onClick={() => setActiveHub(null)}
            className="flex items-center gap-2 px-1 py-1 rounded-md w-full text-left kd-transition hover:bg-white/[0.06] group/back"
          >
            <ChevronLeft className="h-4 w-4 text-sidebar-foreground/40 group-hover/back:text-sidebar-foreground/75 kd-transition" />
            <HubIcon className="h-4 w-4 text-sidebar-foreground/50" />
            <span className="text-[13px] font-semibold text-sidebar-primary tracking-tight">
              {activeHubGroup.label}
            </span>
          </button>
        </div>

        <SidebarContent className="pt-2 pb-2">
          <SidebarGroup className="p-0">
            <SidebarGroupContent>
              <SidebarMenu className="gap-0.5 px-2">
                {hubItems.map(renderNavItem)}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
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

  const nonHubGroups = NAV_GROUPS.filter((g) => !('hub' in g && g.hub));

  return (
    <Sidebar collapsible="icon">
      {/* ── Logo area */}
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

      {/* ── Nav */}
      <SidebarContent className="pt-2 pb-2">
        <SidebarGroup className="p-0">
          <SidebarGroupContent>

            {/* Ungrouped: Dashboard, My Dashboard, Approvals, Finance */}
            <SidebarMenu className="gap-0.5 px-2 mb-1">
              {ungroupedItems.map(renderNavItem)}
            </SidebarMenu>

            {/* Regular collapsible groups + hub entries */}
            {NAV_GROUPS.map((group) => {
              const isHub = 'hub' in group && group.hub;
              const groupTitles = group.titles as readonly string[];
              const groupItems = navItems.filter((n) => groupTitles.includes(n.title));
              if (groupItems.length === 0) return null;

              // Hub groups render as a single clickable entry
              if (isHub) {
                const HubIcon = 'icon' in group
                  ? HUB_ICONS[group.icon as string] ?? Users
                  : Users;
                const isActive = groupItems.some(
                  (n) => location.pathname === n.url || (n.url !== '/' && location.pathname.startsWith(n.url)),
                );

                return (
                  <div key={group.key}>
                    {sidebarCollapsed ? (
                      <div className="mx-3 my-2 h-px bg-sidebar-border/20" />
                    ) : (
                      <div className="px-3 pt-3.5 pb-1">
                        <span className="text-[9px] font-bold uppercase tracking-[0.14em] text-sidebar-foreground/35">
                          {group.label}
                        </span>
                      </div>
                    )}
                    <SidebarMenu className="gap-0.5 px-2">
                      <SidebarMenuItem className="list-none">
                        <SidebarMenuButton
                          isActive={isActive}
                          tooltip={sidebarCollapsed ? group.label : undefined}
                          className="relative"
                          onClick={() => setActiveHub(group.key)}
                        >
                          <div
                            className={cn(
                              'flex items-center gap-2.5 rounded-lg px-2 py-[7px] text-[13px] font-medium w-full',
                              'kd-transition group relative cursor-pointer',
                              isActive
                                ? 'bg-white/[0.11] text-white shadow-[inset_0_1px_0_hsl(0_0%_100%/0.07)]'
                                : 'text-sidebar-foreground/65 hover:bg-white/[0.06] hover:text-sidebar-foreground',
                            )}
                          >
                            {isActive && (
                              <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-4 rounded-r-full bg-[hsl(var(--sidebar-ring))] shadow-[0_0_6px_hsl(var(--sidebar-ring)/0.8)]" />
                            )}
                            <HubIcon
                              className={cn(
                                'h-[15px] w-[15px] shrink-0 kd-transition',
                                isActive
                                  ? 'text-[hsl(var(--sidebar-ring))]'
                                  : 'text-sidebar-foreground/40 group-hover:text-sidebar-foreground/75',
                              )}
                            />
                            {!sidebarCollapsed && (
                              <>
                                <span className="flex-1 truncate">{group.label}</span>
                                <span className="text-[10px] tabular-nums text-sidebar-foreground/30 font-medium">
                                  {groupItems.length}
                                </span>
                              </>
                            )}
                          </div>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    </SidebarMenu>
                  </div>
                );
              }

              // Regular collapsible groups
              const isCollapsed = groupCollapsed[group.key];

              return (
                <div key={group.key}>
                  {sidebarCollapsed ? (
                    <div className="mx-3 my-2 h-px bg-sidebar-border/20" />
                  ) : (
                    <button
                      onClick={() => toggleGroup(group.key)}
                      className="flex w-full items-center gap-1.5 px-3 pt-3.5 pb-1 kd-transition hover:opacity-90 focus-visible:outline-none group/grp"
                      aria-expanded={!isCollapsed}
                    >
                      <span className="text-[9px] font-bold uppercase tracking-[0.14em] text-sidebar-foreground/35 flex-1 text-left group-hover/grp:text-sidebar-foreground/55 kd-transition">
                        {group.label}
                      </span>
                      <ChevronDown
                        className={cn(
                          'h-3 w-3 text-sidebar-foreground/25 transition-transform duration-200',
                          'group-hover/grp:text-sidebar-foreground/45',
                          isCollapsed ? '-rotate-90' : '',
                        )}
                      />
                    </button>
                  )}

                  {(!isCollapsed || sidebarCollapsed) && (
                    <SidebarMenu className="gap-0.5 px-2">
                      {groupItems.map(renderNavItem)}
                    </SidebarMenu>
                  )}
                </div>
              );
            })}

          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      {/* ── Footer */}
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
