import { NavLink, Route, Routes, Navigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import {
  Clock, FolderKanban, DollarSign, BarChart3, CheckSquare, ShieldCheck,
  Receipt, CalendarRange, Palmtree, BadgeCheck, LayoutDashboard,
} from 'lucide-react';
import { useTimetrackCapabilities } from './lib/capabilities';
import DashboardPage from './pages/DashboardPage';
import TimePage from './pages/TimePage';
import ProjectsPage from './pages/ProjectsPage';
import BillingRatesPage from './pages/BillingRatesPage';
import ReportsPage from './pages/ReportsPage';
import ApprovalsPage from './pages/ApprovalsPage';
import RolesPage from './pages/RolesPage';
import ClientsInvoicesPage from './pages/ClientsInvoicesPage';
import PlannerPage from './pages/PlannerPage';
import LeavePage from './pages/LeavePage';
import AttendancePage from './pages/AttendancePage';

const TABS = [
  { to: '', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: 'time', label: 'Time', icon: Clock },
  { to: 'projects', label: 'Projects', icon: FolderKanban },
  { to: 'reports', label: 'Reports', icon: BarChart3 },
  { to: 'approvals', label: 'Approvals', icon: CheckSquare },
  { to: 'leave', label: 'Leave', icon: Palmtree },
  { to: 'attendance', label: 'Attendance', icon: BadgeCheck },
  { to: 'planner', label: 'Planner', icon: CalendarRange },
  { to: 'clients', label: 'Clients & Invoices', icon: Receipt, cap: 'create_invoices' as const },
  { to: 'rates', label: 'Billing Rates', icon: DollarSign, cap: 'manage_rates' as const },
  { to: 'roles', label: 'Roles', icon: ShieldCheck, cap: 'manage_projects' as const },
];

export default function TimeTrackApp() {
  const { has } = useTimetrackCapabilities();

  return (
    <div className="flex flex-col h-full">
      <div className="border-b border-border/60 px-4 overflow-x-auto">
        <nav className="flex gap-1 min-w-max">
          {TABS.filter((t) => !t.cap || has(t.cap)).map((t) => (
            <NavLink
              key={t.to}
              to={t.to || '.'}
              end={t.end}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors',
                  isActive
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                )
              }
            >
              <t.icon className="h-4 w-4" />
              {t.label}
            </NavLink>
          ))}
        </nav>
      </div>

      <div className="flex-1 overflow-auto p-4 md:p-6">
        <Routes>
          <Route index element={<DashboardPage />} />
          <Route path="time" element={<TimePage />} />
          <Route path="projects" element={<ProjectsPage />} />
          <Route path="reports" element={<ReportsPage />} />
          <Route path="approvals" element={<ApprovalsPage />} />
          <Route path="leave" element={<LeavePage />} />
          <Route path="attendance" element={<AttendancePage />} />
          <Route path="planner" element={<PlannerPage />} />
          <Route path="clients" element={<ClientsInvoicesPage />} />
          <Route path="rates" element={<BillingRatesPage />} />
          <Route path="roles" element={<RolesPage />} />
          <Route path="*" element={<Navigate to="." replace />} />
        </Routes>
      </div>
    </div>
  );
}
