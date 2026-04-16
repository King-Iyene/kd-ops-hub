import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Route, Routes, Navigate } from 'react-router-dom';
import { Toaster as Sonner } from '@/components/ui/sonner';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { useAuthStore } from '@/store/authStore';
import { useAuth } from '@/hooks/useAuth';
import AppLayout from '@/components/AppLayout';
import { RoleGuard } from '@/components/RoleGuard';
import { ALL_AUTH_ROLES, MANAGER_ROLES } from '@/lib/roles';
import Login from './pages/Login';
import Register from './pages/Register';
import ForgotPassword from './pages/ForgotPassword';
import Dashboard from './pages/Dashboard';
import Approvals from './pages/Approvals';
import Payments from './pages/Payments';
import NewPaymentBatch from './pages/NewPaymentBatch';
import BatchDetail from './pages/BatchDetail';
import Subscriptions from './pages/Subscriptions';
import Budgets from './pages/Budgets';
import Documents from './pages/Documents';
import Reports from './pages/Reports';
import Fleet from './pages/Fleet';
import Expenses from './pages/Expenses';
import Contractors from './pages/Contractors';
import Employees from './pages/Employees';
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

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />

      <Route
        element={
          <AuthGuard>
            <AppLayout />
          </AuthGuard>
        }
      >
        {/* Default landing routes to Dashboard for managers, Fleet for others. */}
        <Route
          path="/"
          element={
            <RoleGuard roles={MANAGER_ROLES}>
              <Dashboard />
            </RoleGuard>
          }
        />
        <Route
          path="/dashboard"
          element={
            <RoleGuard roles={MANAGER_ROLES}>
              <Dashboard />
            </RoleGuard>
          }
        />

        {/* Approvals */}
        <Route
          path="/approvals"
          element={
            <RoleGuard roles={MANAGER_ROLES}>
              <Approvals />
            </RoleGuard>
          }
        />

        {/* Payments */}
        <Route
          path="/payments"
          element={
            <RoleGuard roles={MANAGER_ROLES}>
              <Payments />
            </RoleGuard>
          }
        />
        <Route
          path="/payments/new"
          element={
            <RoleGuard roles={MANAGER_ROLES}>
              <NewPaymentBatch />
            </RoleGuard>
          }
        />
        <Route
          path="/payments/:id"
          element={
            <RoleGuard roles={MANAGER_ROLES}>
              <BatchDetail />
            </RoleGuard>
          }
        />

        {/* Subscriptions */}
        <Route
          path="/subscriptions"
          element={
            <RoleGuard roles={MANAGER_ROLES}>
              <Subscriptions />
            </RoleGuard>
          }
        />

        {/* Budgets */}
        <Route
          path="/budgets"
          element={
            <RoleGuard roles={MANAGER_ROLES}>
              <Budgets />
            </RoleGuard>
          }
        />

        {/* Documents — all authenticated roles (fine-grained via visible_to_roles). */}
        <Route
          path="/documents"
          element={
            <RoleGuard roles={ALL_AUTH_ROLES}>
              <Documents />
            </RoleGuard>
          }
        />

        {/* Reports */}
        <Route
          path="/reports"
          element={
            <RoleGuard roles={MANAGER_ROLES}>
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

        {/* Contractors / Employees — managers. */}
        <Route
          path="/contractors"
          element={
            <RoleGuard roles={MANAGER_ROLES}>
              <Contractors />
            </RoleGuard>
          }
        />
        <Route
          path="/employees"
          element={
            <RoleGuard roles={MANAGER_ROLES}>
              <Employees />
            </RoleGuard>
          }
        />

        {/* Settings — admin and super admin. */}
        <Route
          path="/settings"
          element={
            <RoleGuard roles={['super_admin', 'admin']}>
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

        <Route path="/unauthorized" element={<Unauthorized />} />
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
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
