import { useEffect, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  ChevronDown,
  LogOut,
} from 'lucide-react';
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

  // Close the mobile sidebar automatically whenever the route changes.
  // The shadcn <Sheet>-based mobile sidebar otherwise stays open after a
  // user taps a nav link, requiring them to swipe it away — bad mobile UX.
  useEffect(() => {
    if (isMobile) setOpenMobile(false);
  }, [location.pathname, isMobile, setOpenMobile]);

  // Logo + name come from useBrand inside <BrandLogo>; no per-component
  // fetch needed any more (the hook caches and de-duplicates the request
  // platform-wide).
  const [anomalyOpenCount, setAnomalyOpenCount] = useState<number>(0);

  useEffect(() => {
    refreshApprovals();
    // Refresh every 90 seconds passively — no longer on every navigation.
    // This cuts 5 DB round-trips per page change down to one every 90 s.
    const id = setInterval(refreshApprovals, 90_000);
    return () => clearInterval(id);
  }, [refreshApprovals]);

  // Open critical/high anomaly count drives the "Anomalies" sidebar badge.
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
    finance:    loadCollapsed('finance'),
    treasury:   loadCollapsed('treasury'),
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

  // Auto-expand the group containing the active route so the user never
  // lands on a page whose nav item is hidden inside a collapsed group.
  useEffect(() => {
    for (const group of NAV_GROUPS) {
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
  // An item is shown when EITHER:
  //   • the user's role is in the item's allowed roles, OR
  //   • the item declares a permission key and the profile has that
  //     permission explicitly granted (`permissions[key] === true`).
  // Mirrors RoleGuard's logic so the sidebar matches the routes — when
  // an admin grants e.g. payments.create to a field user, the link
  // appears in their sidebar without them needing to know the URL.
  // Explicit denial (`permissions[key] === false`) hides the link even
  // when the role would normally allow.
  //
  // View-as mode (super_admin simulating another role) DELIBERATELY
  // ignores the real user's permissions JSONB. Otherwise the sim leaks
  // grants from the super_admin's own profile (every key set to true)
  // back into the lower role being simulated. The simulation has to be
  // role-pure to be useful — what would `operations` actually see if
  // they had a clean profile? — so we pass an empty permissions map
  // for the duration of the view-as.

  const role = effectiveRole as Role | undefined;
  const isViewAs = (profile?.role === 'super_admin') && (effectiveRole !== 'super_admin');
  const permissions = isViewAs
    ? null
    : ((profile as any)?.permissions as Record<string, boolean> | null | undefined);
  const navItems = filterNavByRoleAndPermissions(ALL_NAV, role, permissions);

  // ─── Render a single nav item (unchanged styles) ──────────────────────────

  function renderNavItem(item: NavItem) {
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
            className={`
              flex items-center gap-2.5 rounded-md px-2 py-1.5 text-[13px] font-medium
              kd-transition group relative
              ${active
                ? 'bg-white/10 text-white'
                : 'text-sidebar-foreground/70 hover:bg-white/5 hover:text-sidebar-foreground'
              }
            `}
          >
            {active && (
              <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[2px] h-3.5 rounded-r-full bg-cyan-400" />
            )}
            <item.icon
              className={`h-3.5 w-3.5 shrink-0 kd-transition ${
                active
                  ? 'text-cyan-300'
                  : 'text-sidebar-foreground/45 group-hover:text-sidebar-foreground/80'
              }`}
            />
            {!sidebarCollapsed && (
              <>
                <span className="flex-1 truncate">{item.title}</span>
                {showBadge && (
                  <span className={`relative ml-auto flex h-4 min-w-4 items-center justify-center rounded-full ${badgeTone} px-1 text-[9.5px] font-bold tabular-nums kd-status-live-warning`}>
                    {badgeCount > 99 ? '99+' : badgeCount}
                  </span>
                )}
              </>
            )}
            {sidebarCollapsed && showBadge && (
              <span className={`absolute top-0.5 right-0.5 h-1.5 w-1.5 rounded-full kd-status-live-warning ${item.badge === 'anomalies' ? 'bg-red-500' : 'bg-amber-400'}`} />
            )}
          </NavLink>
        </SidebarMenuButton>
      </SidebarMenuItem>
    );
  }

  const ungroupedItems = navItems.filter((n) => UNGROUPED_TITLES.includes(n.title));

  return (
    <Sidebar collapsible="icon">
      {/* ── Logo area — Mercury / Brex style: compact, hairline
          divider, neutral typographic hierarchy. */}
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

      {/* ── Nav ───────────────────────────────────────────────────── */}
      <SidebarContent className="pt-2 pb-2">
        <SidebarGroup className="p-0">
          <SidebarGroupContent>

            {/* Ungrouped: Dashboard + Approvals */}
            <SidebarMenu className="gap-0.5 px-2 mb-1">
              {ungroupedItems.map(renderNavItem)}
            </SidebarMenu>

            {/* Collapsible groups */}
            {NAV_GROUPS.map((group) => {
              const groupItems = navItems.filter((n) =>
                (group.titles as readonly string[]).includes(n.title),
              );
              if (groupItems.length === 0) return null;

              const isCollapsed = groupCollapsed[group.key];

              return (
                <div key={group.key}>
                  {/* Group header */}
                  {sidebarCollapsed ? (
                    <div className="mx-3 my-2 h-px bg-sidebar-border/20" />
                  ) : (
                    <button
                      onClick={() => toggleGroup(group.key)}
                      className="flex w-full items-center gap-1.5 px-3.5 pt-3.5 pb-1 kd-transition hover:opacity-80 focus-visible:outline-none"
                    >
                      <span className="text-[9.5px] font-semibold uppercase tracking-[0.12em] text-sidebar-foreground/40 flex-1 text-left">
                        {group.label}
                      </span>
                      <ChevronDown
                        className={`h-2.5 w-2.5 text-sidebar-foreground/30 transition-transform duration-200 ${
                          isCollapsed ? '-rotate-90' : ''
                        }`}
                      />
                    </button>
                  )}

                  {/* Group items — always visible in icon mode; toggled in expanded mode */}
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

      {/* ── Footer — tighter Mercury-style: hairline divider, smaller
          icon, restrained user card. */}
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
          <div className="flex items-center gap-2.5 px-2 py-1.5 mt-1 rounded-md bg-white/5">
            <div className="h-6 w-6 rounded-full kd-gradient-brand flex items-center justify-center shrink-0 text-[10px] font-bold text-white">
              {getInitials(profile.full_name ?? profile.email ?? 'U')}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[11.5px] font-medium text-sidebar-foreground/85 truncate leading-none">
                {profile.full_name ?? 'User'}
              </p>
              <p className="text-[10px] text-sidebar-foreground/45 truncate mt-0.5">
                {profile.email}
              </p>
            </div>
          </div>
        )}
      </SidebarFooter>
    </Sidebar>
  );
}
