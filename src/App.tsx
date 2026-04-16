import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Route, Routes, Navigate } from 'react-router-dom';
import { Toaster as Sonner } from '@/components/ui/sonner';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { useAuthStore } from '@/store/authStore';
import { useAuth } from '@/hooks/useAuth';
import AppLayout from '@/components/AppLayout';
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
import Leave from './pages/Leave';
import SettingsPage from './pages/Settings';
import ProfilePage from './pages/Profile';
import NotFound from './pages/NotFound';
import { Loader as Loader2 } from 'lucide-react';

const queryClient = new QueryClient();

/**
 * Only guard in KDOps is "are you signed in?". Role-based access control was
 * removed — every authenticated user can reach every page.
 */
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
        <Route path="/" element={<Dashboard />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/approvals" element={<Approvals />} />
        <Route path="/payments" element={<Payments />} />
        <Route path="/payments/new" element={<NewPaymentBatch />} />
        <Route path="/payments/:id" element={<BatchDetail />} />
        <Route path="/subscriptions" element={<Subscriptions />} />
        <Route path="/budgets" element={<Budgets />} />
        <Route path="/documents" element={<Documents />} />
        <Route path="/reports" element={<Reports />} />
        <Route path="/fleet" element={<Fleet />} />
        <Route path="/expenses" element={<Expenses />} />
        <Route path="/contractors" element={<Contractors />} />
        <Route path="/employees" element={<Employees />} />
        <Route path="/leave" element={<Leave />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/profile" element={<ProfilePage />} />
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
