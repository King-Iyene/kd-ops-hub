import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  CreditCard,
  Receipt,
  Bell,
  Menu,
} from 'lucide-react';
import { useApprovalStore } from '@/store/approvalStore';
import { cn } from '@/lib/utils';

const TABS = [
  { title: 'Home', url: '/', icon: LayoutDashboard },
  { title: 'Pay', url: '/payments', icon: CreditCard },
  { title: 'Expenses', url: '/expenses', icon: Receipt },
  { title: 'Approvals', url: '/approvals', icon: Bell },
  { title: 'More', url: '/fleet', icon: Menu },
] as const;

export function MobileNav() {
  const location = useLocation();
  const approvalTotal = useApprovalStore((s) => s.counts.total);

  return (
    <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-card border-t safe-bottom">
      <div className="flex items-center justify-around h-14">
        {TABS.map((tab) => {
          const active =
            location.pathname === tab.url ||
            (tab.url !== '/' && location.pathname.startsWith(tab.url));
          return (
            <NavLink
              key={tab.title}
              to={tab.url}
              className={cn(
                'flex flex-col items-center gap-0.5 px-3 py-1 kd-transition relative',
                active
                  ? 'text-primary'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <tab.icon className="h-5 w-5" />
              <span className="text-[10px] font-medium">{tab.title}</span>
              {tab.title === 'Approvals' && approvalTotal > 0 && (
                <span className="absolute -top-0.5 right-0.5 h-4 min-w-4 px-1 rounded-full bg-warning text-[9px] font-bold text-warning-foreground flex items-center justify-center">
                  {approvalTotal > 9 ? '9+' : approvalTotal}
                </span>
              )}
            </NavLink>
          );
        })}
      </div>
    </nav>
  );
}
