import { lazy, Suspense } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Route, Routes, Navigate } from 'react-router-dom';
import { Toaster as Sonner } from '@/components/ui/sonner';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { useAuthStore } from '@/store/authStore';
import { useAuth } from '@/hooks/useAuth';
import { MfaChallengeDialog } from '@/components/MfaChallengeDialog';
import AppLayout from '@/components/AppLayout';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { RoleGuard } from '@/components/RoleGuard';
import { ADMIN_ONLY_ROLES, ALL_AUTH_ROLES, APPROVER_ROLES, MANAGER_ROLES } from '@/lib/roles';
import { Loader as Loader2 } from 'lucide-react';

// Eagerly loaded — shown before auth resolves or needed for public routes.
import Login from './pages/Login';
import Register from './pages/Register';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import JoinForm from './pages/JoinForm';
import Privacy from './pages/legal/Privacy';
import Terms from './pages/legal/Terms';
import Unauthorized from './pages/Unauthorized';
import NotFound from './pages/NotFound';

// Lazily loaded — each page becomes its own split chunk.
// Fleet (6 k lines) and Settings (2.5 k lines) alone cut ~40% off the initial bundle.
const Dashboard        = lazy(() => import('./pages/Dashboard'));
const Approvals        = lazy(() => import('./pages/Approvals'));
const Payments         = lazy(() => import('./pages/Payments'));
const Transactions     = lazy(() => import('./pages/Transactions'));
const NewPaymentBatch  = lazy(() => import('./pages/NewPaymentBatch'));
const BatchDetail      = lazy(() => import('./pages/BatchDetail'));
const PaymentSchedule  = lazy(() => import('./pages/PaymentSchedule'));
const Subscriptions    = lazy(() => import('./pages/Subscriptions'));
const Budgets          = lazy(() => import('./pages/Budgets'));
const Expenses         = lazy(() => import('./pages/Expenses'));
const Fleet            = lazy(() => import('./pages/Fleet'));
const Payroll          = lazy(() => import('./pages/Payroll'));
const EarnedWageAccess = lazy(() => import('./pages/EarnedWageAccess'));
const Anomalies        = lazy(() => import('./pages/Anomalies'));
const Communications   = lazy(() => import('./pages/Communications'));
const CashFlow         = lazy(() => import('./pages/CashFlow'));
const Employees        = lazy(() => import('./pages/Employees'));
const EmployeeProfile  = lazy(() => import('./pages/EmployeeProfile'));
const Contractors      = lazy(() => import('./pages/Contractors'));
const ContractorProfile= lazy(() => import('./pages/ContractorProfile'));
const Leave            = lazy(() => import('./pages/Leave'));
const Compliance       = lazy(() => import('./pages/Compliance'));
const Reports          = lazy(() => import('./pages/Reports'));
const Documents        = lazy(() => import('./pages/Documents'));
const Tasks            = lazy(() => import('./pages/Tasks'));
const Knowledge        = lazy(() => import('./pages/Knowledge'));
const Goals            = lazy(() => import('./pages/Goals'));
const Contacts         = lazy(() => import('./pages/Contacts'));
const ContactProfile   = lazy(() => import('./pages/ContactProfile'));
const Referrals        = lazy(() => import('./pages/Referrals'));
const Clients          = lazy(() => import('./pages/Clients'));
const ClientProfile    = lazy(() => import('./pages/ClientProfile'));
const VirtualCards     = lazy(() => import('./pages/VirtualCards'));
const Invoices         = lazy(() => import('./pages/Invoices'));
const Vendors          = lazy(() => import('./pages/Vendors'));
const Performance      = lazy(() => import('./pages/Performance'));
const Assets           = lazy(() => import('./pages/Assets'));
const Training         = lazy(() => import('./pages/Training'));
const Projects         = lazy(() => import('./pages/Projects'));
const Benefits         = lazy(() => import('./pages/Benefits'));
const Onboarding       = lazy(() => import('./pages/Onboarding'));
const Recruitment      = lazy(() => import('./pages/Recruitment'));
const Attendance       = lazy(() => import('./pages/Attendance'));
const Disciplinary     = lazy(() => import('./pages/Disciplinary'));
const AuditLog         = lazy(() => import('./pages/AuditLog'));
const SettingsPage     = lazy(() => import('./pages/Settings'));
const ProfilePage      = lazy(() => import('./pages/Profile'));
const Assistant        = lazy(() => import('./pages/Assistant'));
const AssistantAdmin   = lazy(() => import('./pages/AssistantAdmin'));

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


const PageSpinner = () => (
  <div className="min-h-screen flex items-center justify-center bg-background">
    <Loader2 className="h-8 w-8 animate-spin text-primary" />
  </div>
);

/**
 * Renders the MFA challenge dialog whenever the auth store has an mfaPending
 * row. After a successful verify the dialog clears mfaPending and re-fetches
 * the profile so the rest of the app unlocks.
 */
function MfaChallengeGate() {
  const mfaPending = useAuthStore((s) => s.mfaPending);
  const setMfaPending = useAuthStore((s) => s.setMfaPending);
  const setLoading = useAuthStore((s) => s.setLoading);
  const user = useAuthStore((s) => s.user);
  const fetchProfile = useAuthStore((s) => s.fetchProfile);
  if (!mfaPending) return null;
  return (
    <MfaChallengeDialog
      open
      factorId={mfaPending.factorId}
      onSuccess={async () => {
        setMfaPending(null);
        if (user) await fetchProfile(user.id);
        setLoading(false);
      }}
    />
  );
}

function AppRoutes() {
  return (
    <Suspense fallback={<PageSpinner />}>
    <MfaChallengeGate />
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      {/* Public routes — no auth required. */}
      <Route path="/join" element={<JoinForm />} />
      <Route path="/ref/:code" element={<JoinForm />} />
      {/* Legal — public, no auth. */}
      <Route path="/legal/privacy" element={<Privacy />} />
      <Route path="/legal/terms" element={<Terms />} />
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

      <Route
        element={
          <AuthGuard>
            <ErrorBoundary>
              <AppLayout />
            </ErrorBoundary>
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

        {/* Payments — Finance + Admin + Super Admin by default; other roles can be
            granted via the permissions JSONB (e.g. ops can schedule/submit batches). */}
        <Route
          path="/payments"
          element={
            <RoleGuard roles={APPROVER_ROLES} permission="payments.view">
              <Payments />
            </RoleGuard>
          }
        />
        <Route
          path="/payments/schedule"
          element={
            <RoleGuard roles={APPROVER_ROLES} permission="payments.create">
              <PaymentSchedule />
            </RoleGuard>
          }
        />
        <Route
          path="/payments/new"
          element={
            <RoleGuard roles={APPROVER_ROLES} permission="payments.create">
              <NewPaymentBatch />
            </RoleGuard>
          }
        />
        <Route
          path="/payments/:id/edit"
          element={
            <RoleGuard roles={APPROVER_ROLES} permission="payments.create">
              <NewPaymentBatch />
            </RoleGuard>
          }
        />
        <Route
          path="/payments/:id"
          element={
            <RoleGuard roles={APPROVER_ROLES} permission="payments.view">
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

        {/* Invoices — Finance + Admin + Super Admin. */}
        <Route
          path="/invoices"
          element={
            <RoleGuard roles={APPROVER_ROLES}>
              <Invoices />
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
        {/* /fleet/live redirects to /fleet — Live Tracking is now a tab inside Fleet. */}
        <Route path="/fleet/live" element={<Navigate to="/fleet" replace />} />
        <Route
          path="/expenses"
          element={
            <RoleGuard roles={ALL_AUTH_ROLES}>
              <Expenses />
            </RoleGuard>
          }
        />
        {/* /my-requests was merged into /expenses — redirect to keep old links working. */}
        <Route path="/my-requests" element={<Navigate to="/expenses" replace />} />

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

        {/* Earned Wage Access — every signed-in employee can request a draw;
            admin / finance see the approval queue inside the page. */}
        <Route
          path="/ewa"
          element={
            <RoleGuard roles={ALL_AUTH_ROLES}>
              <EarnedWageAccess />
            </RoleGuard>
          }
        />

        {/* Anomalies — finance / admin only review queue. */}
        <Route
          path="/anomalies"
          element={
            <RoleGuard roles={APPROVER_ROLES}>
              <Anomalies />
            </RoleGuard>
          }
        />

        {/* Cash Flow — finance / admin only forward forecast. */}
        <Route
          path="/cashflow"
          element={
            <RoleGuard roles={APPROVER_ROLES}>
              <CashFlow />
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

        {/* Vendor Registry — Managers (Finance, Ops, Admin). */}
        <Route
          path="/vendors"
          element={
            <RoleGuard roles={MANAGER_ROLES}>
              <Vendors />
            </RoleGuard>
          }
        />

        {/* Performance Reviews — Managers. */}
        <Route
          path="/performance"
          element={
            <RoleGuard roles={MANAGER_ROLES}>
              <Performance />
            </RoleGuard>
          }
        />

        {/* Asset Register — Finance + Admin + Super Admin. */}
        <Route
          path="/assets"
          element={
            <RoleGuard roles={APPROVER_ROLES}>
              <Assets />
            </RoleGuard>
          }
        />


        {/* Training & Certifications — Managers. */}
        <Route
          path="/training"
          element={
            <RoleGuard roles={MANAGER_ROLES}>
              <Training />
            </RoleGuard>
          }
        />

        {/* Project Tracker — Managers. */}
        <Route
          path="/projects"
          element={
            <RoleGuard roles={MANAGER_ROLES}>
              <Projects />
            </RoleGuard>
          }
        />

        {/* Employee Benefits — Managers. */}
        <Route
          path="/benefits"
          element={
            <RoleGuard roles={MANAGER_ROLES}>
              <Benefits />
            </RoleGuard>
          }
        />

        {/* Onboarding & Offboarding — Managers. */}
        <Route
          path="/onboarding"
          element={
            <RoleGuard roles={MANAGER_ROLES}>
              <Onboarding />
            </RoleGuard>
          }
        />

        {/* Recruitment Pipeline — Managers. */}
        <Route
          path="/recruitment"
          element={
            <RoleGuard roles={MANAGER_ROLES}>
              <Recruitment />
            </RoleGuard>
          }
        />

        {/* Attendance & Timesheets — Managers. */}
        <Route
          path="/attendance"
          element={
            <RoleGuard roles={MANAGER_ROLES}>
              <Attendance />
            </RoleGuard>
          }
        />

        {/* Disciplinary Records — Admin + Super Admin only (sensitive HR data). */}
        <Route
          path="/disciplinary"
          element={
            <RoleGuard roles={ADMIN_ONLY_ROLES}>
              <Disciplinary />
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

        {/* Communications composer — admin / super_admin / finance only. */}
        <Route
          path="/communications"
          element={
            <RoleGuard roles={['super_admin','admin','finance']}>
              <Communications />
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

        {/* Clients CRM — managers. */}
        <Route
          path="/clients"
          element={
            <RoleGuard roles={MANAGER_ROLES}>
              <Clients />
            </RoleGuard>
          }
        />
        <Route
          path="/clients/:id"
          element={
            <RoleGuard roles={MANAGER_ROLES}>
              <ClientProfile />
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

        {/* AI Assistant — every signed-in user can chat; super admin manages config + KB. */}
        <Route
          path="/assistant"
          element={
            <RoleGuard roles={ALL_AUTH_ROLES}>
              <Assistant />
            </RoleGuard>
          }
        />
        <Route
          path="/assistant/admin"
          element={
            <RoleGuard roles={['super_admin']}>
              <AssistantAdmin />
            </RoleGuard>
          }
        />

      </Route>

      <Route path="*" element={<NotFound />} />
    </Routes>
    </Suspense>
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
