import { SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { AppSidebar } from '@/components/AppSidebar';
import { NotificationBell } from '@/components/NotificationBell';
import { ProfileDropdown } from '@/components/ProfileDropdown';
import { ThemeToggle } from '@/components/ThemeToggle';
import { ViewAsBanner } from '@/components/ViewAsBanner';
import { MobileNav } from '@/components/MobileNav';
import { CommandPalette } from '@/components/CommandPalette';
import { KeyboardShortcuts } from '@/components/KeyboardShortcuts';
import { ChatWidget } from '@/components/ChatWidget';
import { Outlet, useLocation } from 'react-router-dom';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { OfflineBanner } from '@/components/OfflineBanner';
import { MfaRequiredBanner } from '@/components/MfaRequiredBanner';
import { useEffectiveRole } from '@/store/authStore';
import { useTimeOfDay } from '@/hooks/useTimeOfDay';
import { useIdleTimeout } from '@/hooks/useIdleTimeout';
import { Search } from 'lucide-react';

const PORTAL_LABELS: Record<string, { label: string; color: string }> = {
  super_admin: { label: 'Super Admin',   color: 'bg-purple-500/15 text-purple-700' },
  admin:       { label: 'Admin',         color: 'bg-primary/10 text-primary' },
  finance:     { label: 'Finance',       color: 'bg-emerald-500/15 text-emerald-700' },
  operations:  { label: 'Operations',    color: 'bg-amber-500/15 text-amber-700' },
  field_staff: { label: 'Field Staff',   color: 'bg-sky-500/15 text-sky-700' },
};

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
  '/tasks':                'Tasks',
  '/goals':                'Goals',
  '/knowledge':            'Knowledge',
  '/documents':            'Documents',
  '/reports':              'Reports',
  '/contacts':             'Contacts',
  '/referrals':            'Referrals',
  '/audit':                'Audit Log',
  '/settings':             'Settings',
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
};

function getRouteTitle(pathname: string): string {
  if (ROUTE_TITLES[pathname]) return ROUTE_TITLES[pathname];
  if (pathname.startsWith('/payments/') && pathname.endsWith('/edit')) return 'Edit Payment Batch';
  if (pathname.startsWith('/payments/')) return 'Batch Detail';
  if (pathname.startsWith('/contractors/')) return 'Contractor Profile';
  if (pathname.startsWith('/employees/')) return 'Employee Profile';
  if (pathname.startsWith('/contacts/')) return 'Contact Profile';
  return '';
}

export default function AppLayout() {
  const effectiveRole = useEffectiveRole();
  const location = useLocation();
  const portal = PORTAL_LABELS[effectiveRole ?? ''];
  const pageTitle = getRouteTitle(location.pathname);
  // Sets <html data-tod="…"> so CSS picks up ambient palette shifts.
  useTimeOfDay();
  // Idle-timeout enforcement (reads company_settings.session_timeout_minutes).
  useIdleTimeout();

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
      <ViewAsBanner />
      <MfaRequiredBanner />
      <SidebarProvider>
        {/* Sidebar hidden entirely on mobile — bottom MobileNav handles
            navigation there, and shadcn's <Sidebar> already collapses to
            a Sheet on mobile which felt redundant once the bottom nav
            was in place. md:flex re-enables it from tablet up. */}
        <div className="hidden md:flex">
          <AppSidebar />
        </div>
        <div className="flex-1 flex flex-col min-w-0">
          {/* ── Header ──────────────────────────────────────────────── */}
          <header
            role="banner"
            aria-label="Site header"
            className="h-14 flex items-center justify-between border-b border-border/60 bg-card backdrop-blur-sm px-4 sticky top-0 z-20">
            <div className="flex items-center gap-3 min-w-0">
              {/* Hamburger only on tablet+ where the sidebar exists */}
              <SidebarTrigger className="hidden md:inline-flex shrink-0 kd-transition hover:bg-primary/8 hover:text-primary rounded-md" />
              {/* Mobile: page title always visible */}
              <div className="flex items-center gap-2 min-w-0">
                {pageTitle && (
                  <h1 className="text-sm font-semibold text-foreground truncate">
                    {pageTitle}
                  </h1>
                )}
                {portal && (
                  <>
                    {pageTitle && <span className="hidden sm:inline text-border/60 text-xs select-none">·</span>}
                    <span className={`hidden sm:inline text-[10.5px] font-bold px-2 py-0.5 rounded-full tracking-wide ${portal.color}`}>
                      {portal.label}
                    </span>
                  </>
                )}
              </div>
            </div>
            <div className="flex items-center gap-1.5 sm:gap-2">
              {/* Mobile search button */}
              <button
                type="button"
                onClick={openCommandPalette}
                className="md:hidden inline-flex items-center justify-center h-8 w-8 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/60 kd-transition"
                aria-label="Search"
              >
                <Search className="h-4 w-4" />
              </button>
              {/* Desktop search bar */}
              <button
                type="button"
                onClick={openCommandPalette}
                className="hidden md:inline-flex items-center gap-2 h-8 px-2.5 rounded-md border border-border/60 bg-muted/40 text-muted-foreground hover:text-foreground hover:bg-muted/70 kd-transition text-xs"
                aria-label="Open command palette"
              >
                <Search className="h-3.5 w-3.5" />
                <span>Search</span>
                <kbd className="ml-1 hidden lg:inline-flex items-center gap-0.5 rounded border border-border bg-card px-1.5 py-0.5 text-[10px] font-medium">
                  <span className="text-[11px]">⌘</span>K
                </kbd>
              </button>
              <NotificationBell />
              <div className="hidden sm:block"><ThemeToggle /></div>
              <div className="hidden sm:block w-px h-4 bg-border/60" />
              <div className="hidden sm:block"><ProfileDropdown /></div>
            </div>
          </header>
          {/* ── Main content ────────────────────────────────────────── */}
          <main id="main-content" className="flex-1 p-4 md:p-5 lg:p-6 overflow-auto kd-gradient-mesh">
            <div key={location.pathname} className="kd-page-transition">
              {/* key={pathname} resets the boundary on navigation, so a
                  crash on one page doesn't permanently break the next. */}
              <ErrorBoundary key={location.pathname}>
                <Outlet />
              </ErrorBoundary>
            </div>
          </main>
        </div>
      </SidebarProvider>
      <CommandPalette />
      <KeyboardShortcuts />
      <MobileNav />
      <ChatWidget />
      <div className="h-14 md:hidden" />
    </div>
  );
}
