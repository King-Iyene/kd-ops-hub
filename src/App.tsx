import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuthStore } from "@/store/authStore";
import { useAuth } from "@/hooks/useAuth";
import AppLayout from "@/components/AppLayout";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Payments from "./pages/Payments";
import NewPaymentBatch from "./pages/NewPaymentBatch";
import BatchDetail from "./pages/BatchDetail";
import Fleet from "./pages/Fleet";
import Expenses from "./pages/Expenses";
import Contractors from "./pages/Contractors";
import SettingsPage from "./pages/Settings";
import NotFound from "./pages/NotFound";
import { Loader as Loader2 } from "lucide-react";

const queryClient = new QueryClient();

function AuthGuard({ children }: { children: React.ReactNode }) {
  const { loading } = useAuth();
  const { user, profile } = useAuthStore();

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

function AdminRoute({ children }: { children: React.ReactNode }) {
  const { profile, loading } = useAuthStore();
  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
  );
  if (profile?.role !== 'admin') return <Navigate to="/fleet" replace />;
  return <>{children}</>;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        element={
          <AuthGuard>
            <AppLayout />
          </AuthGuard>
        }
      >
        <Route path="/" element={<AdminRoute><Dashboard /></AdminRoute>} />
        <Route path="/payments" element={<AdminRoute><Payments /></AdminRoute>} />
        <Route path="/payments/new" element={<AdminRoute><NewPaymentBatch /></AdminRoute>} />
        <Route path="/payments/:id" element={<AdminRoute><BatchDetail /></AdminRoute>} />
        <Route path="/fleet" element={<Fleet />} />
        <Route path="/expenses" element={<Expenses />} />
        <Route path="/contractors" element={<AdminRoute><Contractors /></AdminRoute>} />
        <Route path="/settings" element={<AdminRoute><SettingsPage /></AdminRoute>} />
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
