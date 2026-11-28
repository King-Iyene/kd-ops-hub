import { rememberReturnTo } from './lib/returnTo';
import { lazy, Suspense } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Route, Routes, Navigate, Outlet, useLocation } from 'react-router-dom';
import { Toaster } from '@/components/ui/toaster';
import { PwaUpdatePrompt } from '@/components/PwaUpdatePrompt';
import { ConfirmDialogHost } from '@/components/ui/confirm-dialog';
import { PromptDialogHost } from '@/components/ui/prompt-dialog';
import { StepUpDialog } from '@/components/ui/step-up-dialog';
import { TooltipProvider } from '@/components/ui/tooltip';
import { useAuthStore } from '@/store/authStore';
import { useAuth } from '@/hooks/useAuth';
import { MfaChallengeDialog } from '@/components/MfaChallengeDialog';
const AppLayout = lazy(() => import('@/components/AppLayout'));
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { RoleGuard } from '@/components/RoleGuard';
import { TimetrackFontScope } from '@/features/timetrack/TimetrackFontScope';
import { ADMIN_ONLY_ROLES, ALL_AUTH_ROLES, APPROVER_ROLES, MANAGER_ROLES, PAYMENT_ROLES, SUPER_ADMIN_ONLY_ROLES } from '@/lib/roles';
import { Loader as Loader2 } from 'lucide-react';

// Eagerly loaded — shown before auth resolves or needed for public routes.
import Login from './pages/Login';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import JoinForm from './pages/JoinForm';
import Privacy from './pages/legal/Privacy';
import Terms from './pages/legal/Terms';
import Careers from './pages/Careers';
const PublicForm = lazy(() => import('./pages/PublicForm'));
const TaskFormPage = lazy(() => import('./pages/TaskFormPage'));
const GuestVisit = lazy(() => import('./pages/GuestVisit'));
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
const PayHub           = lazy(() => import('./pages/PayHub'));
const EarnedWageAccess = lazy(() => import('./pages/EarnedWageAccess'));
const Anomalies        = lazy(() => import('./pages/Anomalies'));
const Communications   = lazy(() => import('./pages/Communications'));
const CashFlow         = lazy(() => import('./pages/CashFlow'));
const FinanceDashboard = lazy(() => import('./pages/FinanceDashboard'));
const Employees        = lazy(() => import('./pages/Employees'));
const EmployeeProfile  = lazy(() => import('./pages/EmployeeProfile'));
const Contractors      = lazy(() => import('./pages/Contractors'));
const ContractorProfile= lazy(() => import('./pages/ContractorProfile'));
const Leave            = lazy(() => import('./pages/Leave'));
const Compliance       = lazy(() => import('./pages/Compliance'));
const Reports          = lazy(() => import('./pages/Reports'));
const HrAnalytics      = lazy(() => import('./pages/HrAnalytics'));
const Documents        = lazy(() => import('./pages/Documents'));
const Knowledge        = lazy(() => import('./pages/Knowledge'));
const Contacts         = lazy(() => import('./pages/Contacts'));
const ContactProfile   = lazy(() => import('./pages/ContactProfile'));
const Referrals        = lazy(() => import('./pages/Referrals'));
const PublicLinks      = lazy(() => import('./pages/PublicLinks'));
const Clients          = lazy(() => import('./pages/Clients'));
const ClientProfile    = lazy(() => import('./pages/ClientProfile'));
const VirtualCards     = lazy(() => import('./pages/VirtualCards'));
const Invoices         = lazy(() => import('./pages/Invoices'));
const Vendors          = lazy(() => import('./pages/Vendors'));
const Performance      = lazy(() => import('./pages/Performance'));
const Assets           = lazy(() => import('./pages/Assets'));
const Training         = lazy(() => import('./pages/Training'));
const Benefits         = lazy(() => import('./pages/Benefits'));
const Onboarding       = lazy(() => import('./pages/Onboarding'));
const Recruitment      = lazy(() => import('./pages/Recruitment'));
const Attendance       = lazy(() => import('./pages/Attendance'));
const Placements       = lazy(() => import('./pages/Placements'));
const Disciplinary     = lazy(() => import('./pages/Disciplinary'));
const AuditLog         = lazy(() => import('./pages/AuditLog'));
const OpsAgent         = lazy(() => import('./pages/OpsAgent'));
const Crew             = lazy(() => import('./pages/Crew'));
const Mailbox          = lazy(() => import('./pages/Mailbox'));
const ZohoOAuthCallback = lazy(() => import('./pages/ZohoOAuthCallback'));
const SettingsPage     = lazy(() => import('./pages/Settings'));
const GuidePage        = lazy(() => import('./pages/Guide'));
const DirectorDisbursements = lazy(() => import('./pages/DirectorDisbursements'));
const ProfilePage      = lazy(() => import('./pages/Profile'));
const Assistant        = lazy(() => import('./pages/Assistant'));
const AssistantAdmin   = lazy(() => import('./pages/AssistantAdmin'));
const Messages          = lazy(() => import('./pages/Messages'));
const HrLetters         = lazy(() => import('./pages/HrLetters'));
const Surveys           = lazy(() => import('./pages/Surveys'));
const Grievances        = lazy(() => import('./pages/Grievances'));
const StaffLoans        = lazy(() => import('./pages/StaffLoans'));
const Shifts            = lazy(() => import('./pages/Shifts'));
const SuccessionPlanning = lazy(() => import('./pages/SuccessionPlanning'));
const Handbook          = lazy(() => import('./pages/Handbook'));
const TimesheetsPage    = lazy(() => import('./pages/Timesheets'));
const MyDashboard       = lazy(() => import('./pages/MyDashboard'));
const ApprovalWorkflows = lazy(() => import('./pages/ApprovalWorkflows'));
const DatabasePage      = lazy(() => import('./features/database/pages/DatabasePage'));
const OfficePage = lazy(() => import('./features/office/OfficePage'));
const TaskHub = lazy(() => import('./pages/TaskHub'));
const TaskMyTasksPage = lazy(() => import('./pages/TaskMyTasksPage'));
const TaskDashboardsPage = lazy(() => import('./pages/TaskDashboardsPage'));
const TaskListPage = lazy(() => import('./pages/TaskListPage'));
const TaskTablePage = lazy(() => import('./pages/TaskTablePage'));
const TimeDashboardPage = lazy(() => import('./features/timetrack/pages/DashboardPage'));
const TimeEntriesPage   = lazy(() => import('./features/timetrack/pages/TimePage'));
const TimeProjectsPage  = lazy(() => import('./features/timetrack/pages/ProjectsPage'));
// Reports > Time > Time
const TimeReportsSummaryPage  = lazy(() => import('./features/timetrack/pages/reports/SummaryPage'));
const TimeReportsDetailedPage = lazy(() => import('./features/timetrack/pages/reports/DetailedPage'));
const TimeReportsByDaysPage   = lazy(() => import('./features/timetrack/pages/reports/TimeByDaysPage'));
const TimeReportsPivotPage    = lazy(() => import('./features/timetrack/pages/reports/PivotTablePage'));
// Reports > Time > People
const PeopleByTasksPage      = lazy(() => import('./features/timetrack/pages/reports/PeopleByTasksPage'));
const PeopleByDaysTasksPage  = lazy(() => import('./features/timetrack/pages/reports/PeopleByDaysAndTasksPage'));
const PeopleByDaysPage       = lazy(() => import('./features/timetrack/pages/reports/PeopleByDaysPage'));
const PeopleByProjectsPage   = lazy(() => import('./features/timetrack/pages/reports/PeopleByProjectsPage'));
// Reports > Time > Other
const LocationReportPage     = lazy(() => import('./features/timetrack/pages/reports/LocationReportPage'));
const RealTimeDashboardPage  = lazy(() => import('./features/timetrack/pages/reports/RealTimeDashboardPage'));
const ProjectReportPage      = lazy(() => import('./features/timetrack/pages/reports/ProjectReportPage'));
// Finance
const TimeApprovalsPage = lazy(() => import('./features/timetrack/pages/ApprovalsPage'));
const TimePlannerPage   = lazy(() => import('./features/timetrack/pages/PlannerPage'));
const TimeExportCenterPage = lazy(() => import('./features/timetrack/pages/ExportCenterPage'));
const TimeTagsPage = lazy(() => import('./features/timetrack/pages/TagsPage'));
const TimeIntegrationsPage = lazy(() => import('./features/timetrack/pages/IntegrationsPage'));
const TimeRolesPage     = lazy(() => import('./features/timetrack/pages/RolesPage'));
const ActivitiesSummaryPage = lazy(() => import('./features/timetrack/pages/activity/ActivitiesSummaryPage'));
const SitesAppsPage = lazy(() => import('./features/timetrack/pages/activity/SitesAppsPage'));
const ActivityCategoriesPage = lazy(() => import('./features/timetrack/pages/activity/ActivityCategoriesPage'));
const ActivityEfficiencyPage = lazy(() => import('./features/timetrack/pages/activity/EfficiencyPage'));
const ActivityGoalsPage = lazy(() => import('./features/timetrack/pages/activity/GoalsPage'));
const ActivityTimelinePage = lazy(() => import('./features/timetrack/pages/activity/TimelinePage'));
const ActivityUserStatisticsPage = lazy(() => import('./features/timetrack/pages/activity/UserStatisticsPage'));
const RemoteWorkDetectionPage = lazy(() => import('./features/timetrack/pages/activity/RemoteWorkDetectionPage'));
const ActivityScreenshotsPage = lazy(() => import('./features/timetrack/pages/activity/ScreenshotsPage'));
const AgentConfigPage = lazy(() => import('./features/timetrack/pages/activity/AgentConfigPage'));
const TimeSettingsPage  = lazy(() => import('./features/timetrack/pages/SettingsPage'));
const SharedViewPage    = lazy(() => import('./features/database/pages/SharedViewPage'));
const Developer         = lazy(() => import('./pages/Developer'));
// NDI — standalone org module
const NdiDashboard      = lazy(() => import('./pages/ndi/NdiDashboard'));
const NdiFinance        = lazy(() => import('./pages/ndi/NdiFinance'));
const NdiEmployees      = lazy(() => import('./pages/ndi/NdiEmployees'));
const NdiProfile        = lazy(() => import('./pages/ndi/NdiProfile'));

// Kept deliberately conservative on staleTime — this app moves money, and a
// stale balance shown to an approver is worse than an extra network round
// trip. 15s still dedupes rapid remounts/navigation without letting cached
// financial data linger. refetchOnWindowFocus (React Query default: on)
// stays on so switching back to the tab always re-checks the server.
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15_000,
      gcTime: 5 * 60_000,
      retry: (failureCount, error) => {
        const msg = (error as Error)?.message ?? '';
        if (msg.includes('406') || msg.includes('Not Acceptable') || msg.includes('503') || msg.includes('PGRST') || msg.includes('schema cache')) {
          return failureCount < 4;
        }
        return failureCount < 1;
      },
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
      refetchOnWindowFocus: true,
    },
  },
});

function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuthStore();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    rememberReturnTo(location.pathname + location.search);
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
}


const PageSpinner = () => (
  <div className="min-h-screen flex flex-col items-center justify-center bg-background gap-4">
    <div className="relative h-10 w-10">
      <div className="absolute inset-0 rounded-full border-2 border-primary/20" />
      <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-primary animate-spin" />
      <div className="absolute inset-1.5 rounded-full border-2 border-transparent border-t-cyan-400 animate-spin" style={{ animationDirection: 'reverse', animationDuration: '600ms' }} />
    </div>
    <p className="text-xs text-muted-foreground font-medium tracking-wide animate-pulse">Loading…</p>
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
  useAuth();
  return (
    <Suspense fallback={<PageSpinner />}>
    <MfaChallengeGate />
    <Routes>
      <Route path="/login" element={<ErrorBoundary><Login /></ErrorBoundary>} />
      {/* Self-registration disabled — use /join (invite-based) flow instead. */}
      <Route path="/register" element={<Navigate to="/login" replace />} />
      <Route path="/signup" element={<Navigate to="/login" replace />} />
      {/* Public routes — no auth required. */}
      <Route path="/join" element={<ErrorBoundary><JoinForm /></ErrorBoundary>} />
      <Route path="/ref/:code" element={<ErrorBoundary><JoinForm /></ErrorBoundary>} />
      {/* Legal — public, no auth. */}
      <Route path="/legal/privacy" element={<ErrorBoundary><Privacy /></ErrorBoundary>} />
      <Route path="/legal/terms" element={<ErrorBoundary><Terms /></ErrorBoundary>} />
      {/* Public careers page — reads job_openings.status='published'. */}
      <Route path="/careers" element={<ErrorBoundary><Careers /></ErrorBoundary>} />
      {/* Task module table forms: shared link, signed in or not (the form decides). */}
      <Route path="/tf/:token" element={<ErrorBoundary><Suspense fallback={<div className="flex items-center justify-center h-screen"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>}><TaskFormPage /></Suspense></ErrorBoundary>} />
      <Route path="/forms/:formId" element={<ErrorBoundary><Suspense fallback={<div className="flex items-center justify-center h-screen"><div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" /></div>}><PublicForm /></Suspense></ErrorBoundary>} />
      {/* A guest's emailed link to the Virtual Office visitor room: public, no sign-in, and nothing else is reachable from it. */}
      <Route path="/visit/:token" element={<ErrorBoundary><Suspense fallback={<div className="flex items-center justify-center h-screen"><div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" /></div>}><GuestVisit /></Suspense></ErrorBoundary>} />
      <Route path="/forgot-password" element={<ErrorBoundary><ForgotPassword /></ErrorBoundary>} />
      <Route path="/reset-password" element={<ErrorBoundary><ResetPassword /></ErrorBoundary>} />

      {/* Unauthorized — auth-checked but no app chrome (pending users). */}
      <Route
        path="/unauthorized"
        element={
          <ErrorBoundary>
            <AuthGuard>
              <Unauthorized />
            </AuthGuard>
          </ErrorBoundary>
        }
      />

      {/* Shared view — public, no auth required. */}
      <Route
        path="/shared/:token"
        element={
          <ErrorBoundary>
            <SharedViewPage />
          </ErrorBoundary>
        }
      />


      {/* Database Platform — full-screen app shell, no KDOps sidebar. Super Admin only (the ddl-executor edge
          function it calls enforces the same rule server-side). */}
      <Route
        path="/data"
        element={
          <AuthGuard>
            <RoleGuard roles={SUPER_ADMIN_ONLY_ROLES}>
              <ErrorBoundary>
                <DatabasePage />
              </ErrorBoundary>
            </RoleGuard>
          </AuthGuard>
        }
      />

      <Route
        path="/data/:baseId"
        element={
          <AuthGuard>
            <RoleGuard roles={SUPER_ADMIN_ONLY_ROLES}>
              <ErrorBoundary>
                <DatabasePage />
              </ErrorBoundary>
            </RoleGuard>
          </AuthGuard>
        }
      />
      <Route
        path="/data/:baseId/:tableId"
        element={
          <AuthGuard>
            <RoleGuard roles={SUPER_ADMIN_ONLY_ROLES}>
              <ErrorBoundary>
                <DatabasePage />
              </ErrorBoundary>
            </RoleGuard>
          </AuthGuard>
        }
      />
      <Route
        path="/data/:baseId/:tableId/:viewId"
        element={
          <AuthGuard>
            <RoleGuard roles={SUPER_ADMIN_ONLY_ROLES}>
              <ErrorBoundary>
                <DatabasePage />
              </ErrorBoundary>
            </RoleGuard>
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

        {/* Payments — Finance + Admin + Super Admin + Operations. Operations can
            prepare/manage batches; the money path is still guarded downstream
            (batches need an approver, dispatch is bound by per-role transfer
            caps). Other roles can be granted via the permissions JSONB. */}
        <Route
          path="/payments"
          element={
            <RoleGuard roles={PAYMENT_ROLES} permission="payments.view">
              <Payments />
            </RoleGuard>
          }
        />
        <Route
          path="/payments/schedule"
          element={
            <RoleGuard roles={PAYMENT_ROLES} permission="payments.create">
              <PaymentSchedule />
            </RoleGuard>
          }
        />
        <Route
          path="/payments/new"
          element={
            <RoleGuard roles={PAYMENT_ROLES} permission="payments.create">
              <NewPaymentBatch />
            </RoleGuard>
          }
        />
        <Route
          path="/payments/:id/edit"
          element={
            <RoleGuard roles={PAYMENT_ROLES} permission="payments.create">
              <NewPaymentBatch />
            </RoleGuard>
          }
        />
        <Route
          path="/payments/:id"
          element={
            <RoleGuard roles={PAYMENT_ROLES} permission="payments.view">
              <BatchDetail />
            </RoleGuard>
          }
        />

        {/* Transactions — Finance + Admin + Super Admin + Operations. */}
        <Route
          path="/transactions"
          element={
            <RoleGuard roles={PAYMENT_ROLES}>
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

        {/* HR Analytics — headcount, attrition, cost/head, org chart. */}
        <Route
          path="/hr-analytics"
          element={
            <RoleGuard roles={APPROVER_ROLES}>
              <HrAnalytics />
            </RoleGuard>
          }
        />

        {/* Fleet — Operations module, admin/super_admin only. */}
        <Route
          path="/fleet"
          element={
            <RoleGuard roles={ADMIN_ONLY_ROLES}>
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

        {/* Pay Hub — landing point tying Payroll, EWA, Staff Loans and
            Compliance together; same access as Payroll itself. */}
        <Route
          path="/pay-hub"
          element={
            <RoleGuard roles={APPROVER_ROLES}>
              <PayHub />
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

        {/* Finance — the board-level CFO dashboard: people cost, runway,
            compliance and obligations in one view. */}
        <Route
          path="/finance"
          element={
            <RoleGuard roles={['super_admin']}>
              <FinanceDashboard />
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

        {/* Vendor Registry — Operations module, admin/super_admin only. */}
        <Route
          path="/vendors"
          element={
            <RoleGuard roles={ADMIN_ONLY_ROLES}>
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

        {/* Public Links — CRM module, admin/super_admin only. */}
        <Route
          path="/public-links"
          element={
            <RoleGuard roles={ADMIN_ONLY_ROLES}>
              <PublicLinks />
            </RoleGuard>
          }
        />

        {/* Placements — Super Admin only. */}
        <Route
          path="/placements"
          element={
            <RoleGuard roles={['super_admin']}>
              <Placements />
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

        {/* HR Letters — Admin + Super Admin. */}
        <Route
          path="/hr-letters"
          element={
            <RoleGuard roles={ADMIN_ONLY_ROLES}>
              <HrLetters />
            </RoleGuard>
          }
        />

        {/* Surveys / Pulse Checks — Managers. */}
        <Route
          path="/surveys"
          element={
            <RoleGuard roles={MANAGER_ROLES}>
              <Surveys />
            </RoleGuard>
          }
        />

        {/* Grievance Portal — Admin + Super Admin (sensitive). */}
        <Route
          path="/grievances"
          element={
            <RoleGuard roles={ADMIN_ONLY_ROLES}>
              <Grievances />
            </RoleGuard>
          }
        />

        {/* Staff Loans — Finance + Admin + Super Admin. */}
        <Route
          path="/staff-loans"
          element={
            <RoleGuard roles={APPROVER_ROLES}>
              <StaffLoans />
            </RoleGuard>
          }
        />

        {/* Shift / Roster Scheduling — Managers. */}
        <Route
          path="/shifts"
          element={
            <RoleGuard roles={MANAGER_ROLES}>
              <Shifts />
            </RoleGuard>
          }
        />

        {/* Succession Planning — Admin + Super Admin. */}
        <Route
          path="/succession"
          element={
            <RoleGuard roles={ADMIN_ONLY_ROLES}>
              <SuccessionPlanning />
            </RoleGuard>
          }
        />

        {/* Employee Handbook — all authenticated users can read & acknowledge. */}
        <Route
          path="/handbook"
          element={
            <RoleGuard roles={ALL_AUTH_ROLES}>
              <Handbook />
            </RoleGuard>
          }
        />

        {/* Timesheets — Managers. */}
        <Route
          path="/timesheets"
          element={
            <RoleGuard roles={MANAGER_ROLES}>
              <TimesheetsPage />
            </RoleGuard>
          }
        />

        {/* Time Tracking module — standalone, self-contained (src/features/timetrack).
            A real top-level module like CRM/Operations: one route and one
            sidebar entry per section, no tab-shell. Self-service pages are
            open to every active employee; page-level capability checks (not
            app Role[]) gate admin actions within them. The financial/admin
            pages (rates, invoicing, role management) are additionally
            restricted at the route level. */}
        {[
          { path: '/timetrack', Page: TimeDashboardPage, roles: ALL_AUTH_ROLES },
          { path: '/timetrack/time', Page: TimeEntriesPage, roles: ALL_AUTH_ROLES },
          { path: '/timetrack/projects', Page: TimeProjectsPage, roles: ALL_AUTH_ROLES },
          { path: '/timetrack/projects/:projectId/report', Page: ProjectReportPage, roles: ALL_AUTH_ROLES },
          { path: '/timetrack/reports/summary', Page: TimeReportsSummaryPage, roles: ALL_AUTH_ROLES },
          { path: '/timetrack/reports/detailed', Page: TimeReportsDetailedPage, roles: ALL_AUTH_ROLES },
          { path: '/timetrack/reports/by-days', Page: TimeReportsByDaysPage, roles: ALL_AUTH_ROLES },
          { path: '/timetrack/reports/pivot', Page: TimeReportsPivotPage, roles: ALL_AUTH_ROLES },
          { path: '/timetrack/reports/people-by-tasks', Page: PeopleByTasksPage, roles: ALL_AUTH_ROLES },
          { path: '/timetrack/reports/people-by-days-tasks', Page: PeopleByDaysTasksPage, roles: ALL_AUTH_ROLES },
          { path: '/timetrack/reports/people-by-days', Page: PeopleByDaysPage, roles: ALL_AUTH_ROLES },
          { path: '/timetrack/reports/people-by-projects', Page: PeopleByProjectsPage, roles: ALL_AUTH_ROLES },
          { path: '/timetrack/reports/location', Page: LocationReportPage, roles: ALL_AUTH_ROLES },
          { path: '/timetrack/reports/dashboard', Page: RealTimeDashboardPage, roles: ALL_AUTH_ROLES },
          { path: '/timetrack/approvals', Page: TimeApprovalsPage, roles: ALL_AUTH_ROLES },
          { path: '/timetrack/planner', Page: TimePlannerPage, roles: ALL_AUTH_ROLES },
          { path: '/timetrack/export-center', Page: TimeExportCenterPage, roles: ADMIN_ONLY_ROLES },
          { path: '/timetrack/tags', Page: TimeTagsPage, roles: ALL_AUTH_ROLES },
          { path: '/timetrack/integrations', Page: TimeIntegrationsPage, roles: ADMIN_ONLY_ROLES },
          { path: '/timetrack/roles', Page: TimeRolesPage, roles: ADMIN_ONLY_ROLES },
          { path: '/timetrack/activity/summary', Page: ActivitiesSummaryPage, roles: ADMIN_ONLY_ROLES },
          { path: '/timetrack/activity/sites-apps', Page: SitesAppsPage, roles: ADMIN_ONLY_ROLES },
          { path: '/timetrack/activity/categories', Page: ActivityCategoriesPage, roles: ADMIN_ONLY_ROLES },
          { path: '/timetrack/activity/efficiency', Page: ActivityEfficiencyPage, roles: ADMIN_ONLY_ROLES },
          { path: '/timetrack/activity/goals', Page: ActivityGoalsPage, roles: ADMIN_ONLY_ROLES },
          { path: '/timetrack/activity/timeline', Page: ActivityTimelinePage, roles: ADMIN_ONLY_ROLES },
          { path: '/timetrack/activity/stats', Page: ActivityUserStatisticsPage, roles: ADMIN_ONLY_ROLES },
          { path: '/timetrack/activity/remote-work', Page: RemoteWorkDetectionPage, roles: ADMIN_ONLY_ROLES },
          { path: '/timetrack/activity/screenshots', Page: ActivityScreenshotsPage, roles: ADMIN_ONLY_ROLES },
          { path: '/timetrack/activity/config', Page: AgentConfigPage, roles: ADMIN_ONLY_ROLES },
          { path: '/timetrack/settings', Page: TimeSettingsPage, roles: ADMIN_ONLY_ROLES },
        ].map(({ path, Page, roles }) => (
          <Route
            key={path}
            path={path}
            element={
              <RoleGuard roles={roles}>
                <ErrorBoundary>
                  <TimetrackFontScope>
                    <Page />
                  </TimetrackFontScope>
                </ErrorBoundary>
              </RoleGuard>
            }
          />
        ))}

        {/* Virtual office: every signed-in employee. */}
        <Route
          path="/office"
          element={
            <RoleGuard roles={ALL_AUTH_ROLES}>
              <ErrorBoundary>
                <OfficePage />
              </ErrorBoundary>
            </RoleGuard>
          }
        />

        {/* Task module: every signed-in employee (space/list/table creation
            is admin-only, enforced by RLS — the pages themselves hide those
            controls for everyone else; Dashboards is admin-only). Its Home/My Tasks/Dashboards +
            Spaces nav lives in the main sidebar's Task hub panel
            (TaskSidebarNav), not on the page. */}
        <Route
          path="/task"
          element={
            <RoleGuard roles={ALL_AUTH_ROLES}>
              <ErrorBoundary>
                <Outlet />
              </ErrorBoundary>
            </RoleGuard>
          }
        >
          <Route index element={<TaskHub />} />
          <Route path="my-tasks" element={<TaskMyTasksPage />} />
          {/* Company-wide numbers: admins only. Members' overview is Home. */}
          <Route
            path="dashboards"
            element={<RoleGuard roles={['super_admin', 'admin']}><TaskDashboardsPage /></RoleGuard>}
          />
          <Route path="list/:listId" element={<TaskListPage />} />
          {/* Tables (and their forms) are admin-only; shared form links live at /tf/:token. */}
          <Route
            path="table/:tableId"
            element={<RoleGuard roles={['super_admin', 'admin']}><TaskTablePage /></RoleGuard>}
          />
        </Route>

        {/* Employee Self-Service Dashboard — all authenticated users. */}
        <Route
          path="/my-dashboard"
          element={
            <RoleGuard roles={ALL_AUTH_ROLES}>
              <MyDashboard />
            </RoleGuard>
          }
        />

        {/* Approval Workflows — Admin + Super Admin. */}
        <Route
          path="/approval-workflows"
          element={
            <RoleGuard roles={ADMIN_ONLY_ROLES}>
              <ApprovalWorkflows />
            </RoleGuard>
          }
        />

        {/* Developer Hub — Admin + Super Admin. */}
        <Route
          path="/developer"
          element={
            <RoleGuard roles={ADMIN_ONLY_ROLES}>
              <Developer />
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

        {/* Zoho sends the person back here after they allow access. Listed first; React Router would pick it over /agent/* anyway. */}
        <Route
          path="/agent/oauth/zoho"
          element={
            <RoleGuard roles={SUPER_ADMIN_ONLY_ROLES}>
              <ZohoOAuthCallback />
            </RoleGuard>
          }
        />

        {/* Ops Agent — Super Admin and Admin (also enforced in the database; only a Super Admin configures). */}
        <Route
          path="/agent/*"
          element={
            <RoleGuard roles={ADMIN_ONLY_ROLES}>
              <OpsAgent />
            </RoleGuard>
          }
        />

        {/* Crew: the AI executives and their approval queue. Super Admin only (also enforced in the database). */}
        <Route
          path="/crew"
          element={
            <RoleGuard roles={SUPER_ADMIN_ONLY_ROLES}>
              <Crew />
            </RoleGuard>
          }
        />

        {/* Mailbox: every message from the AI executives. Super Admin only (and the database only returns it to the owner). */}
        <Route
          path="/mailbox"
          element={
            <RoleGuard roles={SUPER_ADMIN_ONLY_ROLES}>
              <Mailbox />
            </RoleGuard>
          }
        />

        {/* Contacts CRM — admin/super_admin only. */}
        <Route
          path="/contacts"
          element={
            <RoleGuard roles={ADMIN_ONLY_ROLES}>
              <Contacts />
            </RoleGuard>
          }
        />

        {/* Communications composer — CRM module, admin/super_admin only. */}
        <Route
          path="/communications"
          element={
            <RoleGuard roles={ADMIN_ONLY_ROLES}>
              <Communications />
            </RoleGuard>
          }
        />
        <Route
          path="/contacts/:id"
          element={
            <RoleGuard roles={ADMIN_ONLY_ROLES}>
              <ContactProfile />
            </RoleGuard>
          }
        />

        {/* Referrals — CRM module, admin/super_admin only. */}
        <Route
          path="/referrals"
          element={
            <RoleGuard roles={ADMIN_ONLY_ROLES}>
              <Referrals />
            </RoleGuard>
          }
        />

        {/* Clients CRM — admin/super_admin only. */}
        <Route
          path="/clients"
          element={
            <RoleGuard roles={ADMIN_ONLY_ROLES}>
              <Clients />
            </RoleGuard>
          }
        />
        <Route
          path="/clients/:id"
          element={
            <RoleGuard roles={ADMIN_ONLY_ROLES}>
              <ClientProfile />
            </RoleGuard>
          }
        />

        {/* Settings — Super Admin + Admin (sensitive tabs hidden from admin in Settings.tsx). */}
        <Route
          path="/settings"
          element={
            <RoleGuard roles={['super_admin', 'admin']}>
              <SettingsPage />
            </RoleGuard>
          }
        />

        {/* Platform Guide — read-only reference, every role can see it.
            Wildcard path: Guide.tsx owns its own nested <Routes> so each
            section (Getting Started, Roles & Permissions, ...) is its own
            real, bookmarkable page instead of one long scrolling document. */}
        <Route
          path="/guide/*"
          element={
            <RoleGuard roles={ALL_AUTH_ROLES}>
              <GuidePage />
            </RoleGuard>
          }
        />

        {/* Principal Disbursements — Super Admin only. No `permission` prop:
            this route must never be reachable via a permissions.jsonb
            grant override, only the real (non-simulated) super_admin role. */}
        <Route
          path="/principal-disbursements"
          element={
            <RoleGuard roles={['super_admin']}>
              <DirectorDisbursements />
            </RoleGuard>
          }
        />

        {/* NDI — standalone org module */}
        <Route path="/ndi" element={<RoleGuard roles={ADMIN_ONLY_ROLES}><NdiDashboard /></RoleGuard>} />
        <Route path="/ndi/finance" element={<RoleGuard roles={ADMIN_ONLY_ROLES}><NdiFinance /></RoleGuard>} />
        <Route path="/ndi/employees" element={<RoleGuard roles={ADMIN_ONLY_ROLES}><NdiEmployees /></RoleGuard>} />
        <Route path="/ndi/profile" element={<RoleGuard roles={ADMIN_ONLY_ROLES}><NdiProfile /></RoleGuard>} />

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

        {/* Direct messages — every signed-in user. */}
        <Route
          path="/messages"
          element={
            <RoleGuard roles={ALL_AUTH_ROLES}>
              <Messages />
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
      <ConfirmDialogHost />
      <PromptDialogHost />
      <StepUpDialog />
      <PwaUpdatePrompt />
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <AppRoutes />
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
