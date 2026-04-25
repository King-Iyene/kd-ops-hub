import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Route, Routes, Navigate } from 'react-router-dom';
import { Toaster as Sonner } from '@/components/ui/sonner';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { useAuthStore, useEffectiveRole } from '@/store/authStore';
import { useAuth } from '@/hooks/useAuth';
import AppLayout from '@/components/AppLayout';
import { RoleGuard } from '@/components/RoleGuard';
import { ALL_AUTH_ROLES, APPROVER_ROLES, MANAGER_ROLES } from '@/lib/roles';
import Login from './pages/Login';
import Register from './pages/Register';
import ForgotPassword from './pages/ForgotPassword';
import Dashboard from './pages/Dashboard';
import Approvals from './pages/Approvals';
import Payments from './pages/Payments';
import Transactions from './pages/Transactions';
import NewPaymentBatch from './pages/NewPaymentBatch';
import BatchDetail from './pages/BatchDetail';
import Subscriptions from './pages/Subscriptions';
import Compliance from './pages/Compliance';
import Tasks from './pages/Tasks';
import Payroll from './pages/Payroll';
import Knowledge from './pages/Knowledge';
import VirtualCards from './pages/VirtualCards';
import AuditLog from './pages/AuditLog';
import Goals from './pages/Goals';
import Budgets from './pages/Budgets';
import Documents from './pages/Documents';
import Reports from './pages/Reports';
import Fleet from './pages/Fleet';
import DriverDashboard from './pages/DriverDashboard';
import Expenses from './pages/Expenses';
import Contractors from './pages/Contractors';
import Contacts from './pages/Contacts';
import ContactProfile from './pages/ContactProfile';
import Referrals from './pages/Referrals';
import JoinForm from './pages/JoinForm';
import ResetPassword from './pages/ResetPassword';
import Employees from './pages/Employees';
import EmployeeProfile from './pages/EmployeeProfile';
import ContractorProfile from './pages/ContractorProfile';
import Leave from './pages/Leave';
import PaymentSchedule from './pages/PaymentSchedule';
import SettingsPage from './pages/Settings';
import ProfilePage from './pages/Profile';
import Unauthorized from './pages/Unauthorized';
import NotFound from './pages/NotFound';
import { Loader as Loader2 } from 'lucide-react';

const queryClient = new QueryClient();

function AuthGuard({ children }: { children: React.ReactNode }) {
  const { loading } = useAuth();
  const { user } = useAuthStore();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

/**
 * Driver-only guard for /driver. Unauthenticated users go to /login,
 * any non-driver role is redirected to /dashboard. Honours the
 * Super Admin "view as" simulator via useEffectiveRole.
 */
function DriverRouteGuard({ children }: { children: React.ReactNode }) {
  const { user, profile, loading, profileLoading } = useAuthStore();
  const effectiveRole = useEffectiveRole();

  if (loading || profileLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;
  if (!profile || profile.status !== 'active') {
    return <Navigate to="/login" replace />;
  }
  if (effectiveRole !== 'driver') {
    return <Navigate to="/dashboard" replace />;
  }
  return <>{children}</>;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      {/* Public routes — no auth required. */}
      <Route path="/join" element={<JoinForm />} />
      <Route path="/ref/:code" element={<JoinForm />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />

      {/* Unauthorized — auth-checked but no app chrome (pending users). */}
      <Route
        path="/unauthorized"
        element={
          <AuthGuard>
            <Unauthorized />
          </AuthGuard>
        }
      />

      {/* Driver portal — dedicated mobile route for users with role 'driver'.
          Renders outside AppLayout so the next session can build a full-bleed
          mobile/PWA experience without sidebar or header chrome. */}
      <Route
        path="/driver"
        element={
          <DriverRouteGuard>
            <DriverDashboard />
          </DriverRouteGuard>
        }
      />

      <Route
        element={
          <AuthGuard>
            <AppLayout />
          </AuthGuard>
        }
      >
        {/* Dashboard — every authenticated role. */}
        <Route
          path="/"
          element={
            <RoleGuard roles={ALL_AUTH_ROLES}>
              <Dashboard />
            </RoleGuard>
          }
        />
        <Route
          path="/dashboard"
          element={
            <RoleGuard roles={ALL_AUTH_ROLES}>
              <Dashboard />
            </RoleGuard>
          }
        />

        {/* Payments — Finance + Admin + Super Admin. */}
        <Route
          path="/payments"
          element={
            <RoleGuard roles={APPROVER_ROLES}>
              <Payments />
            </RoleGuard>
          }
        />
        <Route
          path="/payments/schedule"
          element={
            <RoleGuard roles={APPROVER_ROLES}>
              <PaymentSchedule />
            </RoleGuard>
          }
        />
        <Route
          path="/payments/new"
          element={
            <RoleGuard roles={APPROVER_ROLES}>
              <NewPaymentBatch />
            </RoleGuard>
          }
        />
        <Route
          path="/payments/:id/edit"
          element={
            <RoleGuard roles={APPROVER_ROLES}>
              <NewPaymentBatch />
            </RoleGuard>
          }
        />
        <Route
          path="/payments/:id"
          element={
            <RoleGuard roles={APPROVER_ROLES}>
              <BatchDetail />
            </RoleGuard>
          }
        />

        {/* Transactions — Finance + Admin + Super Admin. */}
        <Route
          path="/transactions"
          element={
            <RoleGuard roles={APPROVER_ROLES}>
              <Transactions />
            </RoleGuard>
          }
        />

        {/* Approvals — Finance + Admin + Super Admin. */}
        <Route
          path="/approvals"
          element={
            <RoleGuard roles={APPROVER_ROLES}>
              <Approvals />
            </RoleGuard>
          }
        />

        {/* Subscriptions — Finance + Admin + Super Admin. */}
        <Route
          path="/subscriptions"
          element={
            <RoleGuard roles={APPROVER_ROLES}>
              <Subscriptions />
            </RoleGuard>
          }
        />

        {/* Budgets — Finance + Admin + Super Admin. */}
        <Route
          path="/budgets"
          element={
            <RoleGuard roles={APPROVER_ROLES}>
              <Budgets />
            </RoleGuard>
          }
        />

        {/* Documents — Finance + Admin + Super Admin. */}
        <Route
          path="/documents"
          element={
            <RoleGuard roles={APPROVER_ROLES}>
              <Documents />
            </RoleGuard>
          }
        />

        {/* Reports — Finance + Admin + Super Admin. */}
        <Route
          path="/reports"
          element={
            <RoleGuard roles={APPROVER_ROLES}>
              <Reports />
            </RoleGuard>
          }
        />

        {/* Fleet / Expenses — all authenticated roles. */}
        <Route
          path="/fleet"
          element={
            <RoleGuard roles={ALL_AUTH_ROLES}>
              <Fleet />
            </RoleGuard>
          }
        />
        <Route
          path="/expenses"
          element={
            <RoleGuard roles={ALL_AUTH_ROLES}>
              <Expenses />
            </RoleGuard>
          }
        />

        {/* Contractors — all managers. */}
        <Route
          path="/contractors"
          element={
            <RoleGuard roles={MANAGER_ROLES}>
              <Contractors />
            </RoleGuard>
          }
        />
        <Route
          path="/contractors/:id"
          element={
            <RoleGuard roles={MANAGER_ROLES}>
              <ContractorProfile />
            </RoleGuard>
          }
        />

        {/* Employees — Super Admin + Admin only (per spec). */}
        <Route
          path="/employees"
          element={
            <RoleGuard roles={['super_admin', 'admin']}>
              <Employees />
            </RoleGuard>
          }
        />
        <Route
          path="/employees/:id"
          element={
            <RoleGuard roles={['super_admin', 'admin']}>
              <EmployeeProfile />
            </RoleGuard>
          }
        />

        {/* Leave — every signed-in employee. */}
        <Route
          path="/leave"
          element={
            <RoleGuard roles={ALL_AUTH_ROLES}>
              <Leave />
            </RoleGuard>
          }
        />

        {/* Compliance Centre — Finance + Admin + Super Admin. */}
        <Route
          path="/compliance"
          element={
            <RoleGuard roles={APPROVER_ROLES}>
              <Compliance />
            </RoleGuard>
          }
        />

        {/* Payroll Intelligence — Finance + Admin + Super Admin. */}
        <Route
          path="/payroll"
          element={
            <RoleGuard roles={APPROVER_ROLES}>
              <Payroll />
            </RoleGuard>
          }
        />

        {/* Tasks — every signed-in employee. */}
        <Route
          path="/tasks"
          element={
            <RoleGuard roles={ALL_AUTH_ROLES}>
              <Tasks />
            </RoleGuard>
          }
        />

        {/* Knowledge base — every signed-in employee (access is per-article). */}
        <Route
          path="/knowledge"
          element={
            <RoleGuard roles={ALL_AUTH_ROLES}>
              <Knowledge />
            </RoleGuard>
          }
        />

        {/* Virtual cards — Finance + Admin + Super Admin. */}
        <Route
          path="/cards"
          element={
            <RoleGuard roles={APPROVER_ROLES}>
              <VirtualCards />
            </RoleGuard>
          }
        />

        {/* Audit log — Admin + Super Admin. */}
        <Route
          path="/audit"
          element={
            <RoleGuard roles={['super_admin', 'admin']}>
              <AuditLog />
            </RoleGuard>
          }
        />

        {/* Goals — every signed-in employee. */}
        <Route
          path="/goals"
          element={
            <RoleGuard roles={ALL_AUTH_ROLES}>
              <Goals />
            </RoleGuard>
          }
        />

        {/* Contacts CRM — managers. */}
        <Route
          path="/contacts"
          element={
            <RoleGuard roles={MANAGER_ROLES}>
              <Contacts />
            </RoleGuard>
          }
        />
        <Route
          path="/contacts/:id"
          element={
            <RoleGuard roles={MANAGER_ROLES}>
              <ContactProfile />
            </RoleGuard>
          }
        />

        {/* Referrals — every signed-in user. */}
        <Route
          path="/referrals"
          element={
            <RoleGuard roles={ALL_AUTH_ROLES}>
              <Referrals />
            </RoleGuard>
          }
        />

        {/* Settings — Super Admin only per spec. */}
        <Route
          path="/settings"
          element={
            <RoleGuard roles={['super_admin']}>
              <SettingsPage />
            </RoleGuard>
          }
        />

        {/* Profile — any signed-in user. */}
        <Route
          path="/profile"
          element={
            <RoleGuard roles={ALL_AUTH_ROLES}>
              <ProfilePage />
            </RoleGuard>
          }
        />

      </Route>

      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <AppRoutes />
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
