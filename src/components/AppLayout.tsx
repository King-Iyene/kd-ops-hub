import { SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { AppSidebar } from '@/components/AppSidebar';
import { NotificationBell } from '@/components/NotificationBell';
import { ProfileDropdown } from '@/components/ProfileDropdown';
import { ViewAsBanner } from '@/components/ViewAsBanner';
import { MobileNav } from '@/components/MobileNav';
import { Outlet, useLocation } from 'react-router-dom';
import { useEffectiveRole } from '@/store/authStore';

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
  '/assistant':            'Executive Assist',
  '/contacts':             'Contacts',
  '/referrals':            'Referrals',
  '/audit':                'Audit Log',
  '/settings':             'Settings',
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

  return (
    <div className="flex min-h-screen flex-col">
      <ViewAsBanner />
      <SidebarProvider>
        <AppSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          {/* ── Header ──────────────────────────────────────────────── */}
          <header className="h-14 flex items-center justify-between border-b border-border/60 bg-card/80 backdrop-blur-sm px-4 sticky top-0 z-20 shadow-[0_1px_0_hsl(var(--border)/0.6),0_2px_8px_-2px_hsl(var(--primary)/0.06)]">
            <div className="flex items-center gap-3 min-w-0">
              <SidebarTrigger className="shrink-0 kd-transition hover:bg-primary/8 hover:text-primary rounded-md" />
              <div className="hidden sm:flex items-center gap-2.5 min-w-0">
                {pageTitle && (
                  <h1 className="text-sm font-semibold text-foreground truncate">
                    {pageTitle}
                  </h1>
                )}
                {portal && (
                  <>
                    {pageTitle && <span className="text-border/80 text-xs select-none">·</span>}
                    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${portal.color}`}>
                      {portal.label}
                    </span>
                  </>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <NotificationBell />
              <div className="w-px h-4 bg-border/60" />
              <ProfileDropdown />
            </div>
          </header>
          {/* ── Main content ────────────────────────────────────────── */}
          <main className="flex-1 p-4 md:p-6 overflow-auto kd-gradient-mesh">
            <div className="kd-page-enter">
              <Outlet />
            </div>
          </main>
        </div>
      </SidebarProvider>
      <MobileNav />
      <div className="h-14 md:hidden" />
    </div>
  );
}
