import { SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { AppSidebar } from '@/components/AppSidebar';
import { NotificationBell } from '@/components/NotificationBell';
import { ProfileDropdown } from '@/components/ProfileDropdown';
import { ViewAsBanner } from '@/components/ViewAsBanner';
import { MobileNav } from '@/components/MobileNav';
import { Outlet } from 'react-router-dom';
import { useEffectiveRole } from '@/store/authStore';

const portalLabel = (role: string | undefined): string => {
  switch (role) {
    case 'super_admin':
      return 'Super Admin Portal';
    case 'admin':
      return 'Admin Portal';
    case 'finance':
      return 'Finance Portal';
    case 'operations':
      return 'Operations Portal';
    case 'field_staff':
      return 'Field Staff Portal';
    default:
      return 'Employee Portal';
  }
};

export default function AppLayout() {
  const effectiveRole = useEffectiveRole();

  return (
    <div className="flex min-h-screen flex-col">
      {/* Persistent simulation banner sits above the entire app shell. */}
      <ViewAsBanner />
      <SidebarProvider>
        <AppSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-14 flex items-center justify-between border-b bg-card px-4 sticky top-0 z-10">
            <div className="flex items-center gap-2">
              <SidebarTrigger />
              <span className="text-sm font-medium text-muted-foreground hidden sm:block">
                {portalLabel(effectiveRole)}
              </span>
            </div>
            <div className="flex items-center gap-3">
              <NotificationBell />
              <ProfileDropdown />
            </div>
          </header>
          <main className="flex-1 p-4 md:p-6 overflow-auto">
            <Outlet />
          </main>
        </div>
      </SidebarProvider>
      <MobileNav />
      {/* Bottom padding so mobile content isn't hidden behind the nav bar. */}
      <div className="h-14 md:hidden" />
    </div>
  );
}
