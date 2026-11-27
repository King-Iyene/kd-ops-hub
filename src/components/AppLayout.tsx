import { useCallback, useEffect, useRef, useState } from 'react';
import { SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { AppSidebar } from '@/components/AppSidebar';
import { NotificationBell } from '@/components/NotificationBell';
import { DesktopAgentHeaderButton } from '@/features/timetrack/pages/activity/shared';
import { ProfileDropdown } from '@/components/ProfileDropdown';
import { inDesktopApp } from '@/features/office/desktopApp';
import { ThemeToggle } from '@/components/ThemeToggle';
import { ViewAsBanner } from '@/components/ViewAsBanner';
import { ImpersonationBanner } from '@/components/ImpersonationBanner';
import { MobileNav } from '@/components/MobileNav';
import { CommandPalette } from '@/components/CommandPalette';
import { KeyboardShortcuts } from '@/components/KeyboardShortcuts';
import { ChatWidget } from '@/components/ChatWidget';
import { ScrollToTop } from '@/components/ScrollToTop';
import { Outlet, useLocation } from 'react-router-dom';
import { NewTaskButton } from '@/features/task-module/NewTaskDialog';
import { TaskModalHost } from '@/features/task-module/TaskModal';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { OfflineBanner } from '@/components/OfflineBanner';
import { MfaRequiredBanner } from '@/components/MfaRequiredBanner';
import { useAuthStore, useEffectiveRole } from '@/store/authStore';
import { useKeepSeen } from '@/features/office/useLastSeen';
import { useTimeOfDay } from '@/hooks/useTimeOfDay';
import { useIdleTimeout } from '@/hooks/useIdleTimeout';
import { Search } from 'lucide-react';
import { roleBadgeClass, roleLabel } from '@/lib/roles';

const ROUTE_TITLES: Record<string, string> = {
  '/':                     'Dashboard',
  '/approvals':            'Approvals',
  '/payments':             'Payments',
  '/payments/schedule':    'Payment Schedule',
  '/payments/new':         'New Payment Batch',
  '/transactions':         'Transactions',
  '/payroll':              'Payroll',
  '/subscriptions':        'Subscriptions',
  '/budgets':              'Budgets',
  '/cards':                'Cards',
  '/compliance':           'Compliance',
  '/expenses':             'Expenses',
  '/fleet':                'Fleet',
  '/contractors':          'Contractors',
  '/employees':            'Employees',
  '/leave':                'Leave',
  '/goals':                'Goals',
  '/knowledge':            'Knowledge',
  '/documents':            'Documents',
  '/reports':              'Reports',
  '/contacts':             'Contacts',
  '/referrals':            'Referrals',
  '/audit':                'Audit Log',
  '/settings':             'Settings',
  '/guide':                'Platform Guide',
  '/principal-disbursements': 'Principal Disbursements',
  '/ewa':                  'Earned Wages',
  '/invoices':             'Invoices',
  '/assets':               'Assets',
  '/anomalies':            'Anomalies',
  '/cashflow':             'Cash Flow',
  '/finance':              'Finance',
  '/performance':          'Performance',
  '/training':             'Training',
  '/benefits':             'Benefits',
  '/onboarding':           'Onboarding',
  '/recruitment':          'Recruitment',
  '/placements':           'Placements',
  '/attendance':           'Attendance',
  '/disciplinary':         'Disciplinary',
  '/vendors':              'Vendors',
  '/projects':             'Projects',
  '/hr-analytics':         'HR Analytics',
  '/clients':              'Clients',
  '/public-links':         'Public Links',
  '/communications':       'Communications',
  '/assistant':            'Assistant',
  '/profile':              'My Profile',
  '/messages':             'Messages',
  '/hr-letters':           'HR Letters',
  '/surveys':              'Surveys',
  '/grievances':           'Grievances',
  '/staff-loans':          'Staff Loans',
  '/shifts':               'Shifts',
  '/succession':           'Succession Planning',
  '/handbook':             'Handbook',
  '/timesheets':           'Timesheets',
  '/my-dashboard':         'My Portal',
  '/approval-workflows':   'Approval Workflows',
  '/task':                 'Task',
  '/agent':                'Agent',
  '/task/my-tasks':        'My Tasks',
  '/task/dashboards':      'Task Dashboard',
};

function getRouteTitle(pathname: string): string {
  if (ROUTE_TITLES[pathname]) return ROUTE_TITLES[pathname];
  if (pathname.startsWith('/payments/') && pathname.endsWith('/edit')) return 'Edit Payment Batch';
  if (pathname.startsWith('/payments/')) return 'Batch Detail';
  if (pathname.startsWith('/contractors/')) return 'Contractor Profile';
  if (pathname.startsWith('/employees/')) return 'Employee Profile';
  if (pathname.startsWith('/contacts/')) return 'Contact Profile';
  if (pathname.startsWith('/task/list/')) return 'Task List';
  if (pathname.startsWith('/task/table/')) return 'Task Table';
  return '';
}

export default function AppLayout() {
  const effectiveRole = useEffectiveRole();
  const location = useLocation();
  const pageTitle = getRouteTitle(location.pathname);
  // In the KD Ops desktop app the Office takes the whole window: no top bar (just the profile picture floats in the corner) and no padding
  const officeFull = inDesktopApp() && location.pathname.startsWith('/office');
  useTimeOfDay();
  useIdleTimeout();
  // note that I am using the app (once when it opens, then every two minutes) so everyone sees who is active, not only people inside the Office
  const myId = useAuthStore((s) => s.profile?.id);
  useKeepSeen(myId);

  const mainRef = useRef<HTMLElement>(null);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0 });
  }, [location.pathname]);
  const onScroll = useCallback(() => {
    setScrolled((mainRef.current?.scrollTop ?? 0) > 8);
  }, []);
  useEffect(() => {
    const el = mainRef.current;
    if (!el) return;
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, [onScroll]);

  const openCommandPalette = () => {
    window.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true }),
    );
  };

  return (
    <div className="flex min-h-screen flex-col">
      {/* Skip navigation — visible only on keyboard focus, before anything else */}
      <a href="#main-content" className="kd-skip-link">
        Skip to main content
      </a>
      <OfflineBanner />
      <SidebarProvider>
        {/* Sidebar hidden entirely on mobile — bottom MobileNav handles
            navigation there, and shadcn's <Sidebar> already collapses to
            a Sheet on mobile which felt redundant once the bottom nav
            was in place. md:flex re-enables it from tablet up. */}
        <div className="hidden md:flex">
          <AppSidebar />
        </div>
        <div className="flex-1 flex flex-col min-w-0">
          <ImpersonationBanner />
          <ViewAsBanner />
          <MfaRequiredBanner />
          {/* ── Header ──────────────────────────────────────────────── */}
          {officeFull ? (
            <div className="fixed right-3 top-2 z-30 flex h-10 items-center rounded-full bg-card/80 p-0.5 shadow-md backdrop-blur"><ProfileDropdown /></div>
          ) : (
          <header
            role="banner"
            aria-label="Site header"
            className={`h-14 flex items-center justify-between border-b bg-card px-4 sticky top-0 z-20 kd-transition ${scrolled ? 'border-border/60 shadow-md shadow-black/5 dark:shadow-black/20' : 'border-border/50 dark:border-border/30'}`}>
            <div className="flex items-center gap-3 min-w-0">
              {/* Hamburger only on tablet+ where the sidebar exists */}
              <SidebarTrigger className="hidden md:inline-flex shrink-0 kd-transition hover:bg-primary/8 hover:text-primary rounded-md" />
              {/* Mobile: page title always visible */}
              <div className="flex items-center gap-2 min-w-0">
                {pageTitle && (
                  <p className="text-sm font-semibold text-foreground truncate">
                    {pageTitle}
                  </p>
                )}
                {effectiveRole && (
                  <>
                    {pageTitle && <span className="hidden sm:inline text-border/60 text-xs select-none">·</span>}
                    <span className={`hidden sm:inline text-3xs font-bold px-2.5 py-0.5 rounded-full tracking-wider uppercase border ${roleBadgeClass(effectiveRole ?? '')}`}>
                      {roleLabel(effectiveRole ?? '')}
                    </span>
                  </>
                )}
              </div>
            </div>
            <div className="flex items-center gap-1.5 sm:gap-2">
              {/* Only inside the Task module (not /tasks, the older module). */}
              {(location.pathname === '/task' || location.pathname.startsWith('/task/')) && <NewTaskButton />}
              {/* Mobile search button */}
              <button
                type="button"
                onClick={openCommandPalette}
                className="md:hidden inline-flex items-center justify-center h-11 w-11 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/60 kd-transition"
                aria-label="Search"
              >
                <Search className="h-4 w-4" />
              </button>
              {/* Desktop search bar */}
              <button
                type="button"
                onClick={openCommandPalette}
                className="hidden md:inline-flex items-center gap-2 h-8 px-3 rounded-lg border border-border/50 bg-muted/30 text-muted-foreground hover:text-foreground hover:bg-muted/60 hover:border-border kd-transition text-xs"
                aria-label="Open command palette"
              >
                <Search className="h-3.5 w-3.5" />
                <span>Search</span>
                <kbd className="ml-1 hidden lg:inline-flex items-center gap-0.5 rounded border border-border bg-card px-1.5 py-0.5 text-3xs font-medium">
                  <span className="text-2xs">⌘</span>K
                </kbd>
              </button>
              {location.pathname.startsWith('/timetrack') && <DesktopAgentHeaderButton />}
              <NotificationBell />
              <ThemeToggle />
              <div className="hidden sm:block w-px h-4 bg-border/60" />
              <ProfileDropdown />
            </div>
          </header>
          )}
          {/* ── Main content ────────────────────────────────────────── */}
          <main ref={mainRef} id="main-content" className={officeFull ? 'flex-1 overflow-hidden p-0 kd-gradient-mesh' : 'flex-1 p-4 md:p-5 lg:p-6 overflow-auto kd-gradient-mesh'}>
            <div key={location.pathname} className="kd-page-transition">
              {/* key={pathname} resets the boundary on navigation, so a
                  crash on one page doesn't permanently break the next. */}
              <ErrorBoundary key={location.pathname}>
                <Outlet />
              </ErrorBoundary>
            </div>
          </main>
          {/* Opens whichever task is in ?task=<id>, over any page. */}
          <TaskModalHost />
        </div>
      </SidebarProvider>
      <CommandPalette />
      <KeyboardShortcuts />
      <MobileNav />
      <ChatWidget />
      <ScrollToTop />
      <div className="h-14 md:hidden" />
    </div>
  );
}
