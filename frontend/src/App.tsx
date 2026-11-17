import { FileQuestion } from "lucide-react";
import { lazy, Suspense } from "react";
import { Link, Navigate, Route, Routes } from "react-router-dom";

import { AppShell } from "@/components/layout/AppShell";
import { EmptyState } from "@/components/layout/common";
import { GuestRoute, ProtectedRoute } from "@/components/layout/guards";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/feedback";
import { BusinessProvider } from "@/context/BusinessContext";
import { ForgotPasswordPage, LoginPage, OAuthCallbackPage, RegisterPage } from "@/pages/AuthPages";

const DashboardPage = lazy(() => import("@/pages/DashboardPage").then((m) => ({ default: m.DashboardPage })));
const UploadPage = lazy(() => import("@/pages/UploadPages").then((m) => ({ default: m.UploadPage })));
const UploadsPage = lazy(() => import("@/pages/UploadPages").then((m) => ({ default: m.UploadsPage })));
const ReviewsPage = lazy(() => import("@/pages/ReviewsPage").then((m) => ({ default: m.ReviewsPage })));
const ReportsPage = lazy(() => import("@/pages/ReportPages").then((m) => ({ default: m.ReportsPage })));
const ReportPage = lazy(() => import("@/pages/ReportPages").then((m) => ({ default: m.ReportPage })));
const AskPage = lazy(() => import("@/pages/AskPage").then((m) => ({ default: m.AskPage })));
const BusinessesPage = lazy(() => import("@/pages/BusinessesPage").then((m) => ({ default: m.BusinessesPage })));
const ProfilePage = lazy(() => import("@/pages/AccountPages").then((m) => ({ default: m.ProfilePage })));
const SettingsPage = lazy(() => import("@/pages/AccountPages").then((m) => ({ default: m.SettingsPage })));

function NotFound() {
  return (
    <EmptyState
      icon={FileQuestion}
      title="Page not found"
      description="The page you are looking for does not exist."
      action={
        <Button asChild>
          <Link to="/dashboard">Go to dashboard</Link>
        </Button>
      }
    />
  );
}

export default function App() {
  return (
    <Suspense fallback={<Spinner />}>
      <Routes>
        <Route path="/login" element={<GuestRoute><LoginPage /></GuestRoute>} />
        <Route path="/register" element={<GuestRoute><RegisterPage /></GuestRoute>} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/auth/callback" element={<OAuthCallbackPage />} />
        <Route
          element={
            <ProtectedRoute>
              <BusinessProvider>
                <AppShell />
              </BusinessProvider>
            </ProtectedRoute>
          }
        >
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/upload" element={<UploadPage />} />
          <Route path="/uploads" element={<UploadsPage />} />
          <Route path="/reviews" element={<ReviewsPage />} />
          <Route path="/ask" element={<AskPage />} />
          <Route path="/reports" element={<ReportsPage />} />
          <Route path="/reports/:id" element={<ReportPage />} />
          <Route path="/businesses" element={<BusinessesPage />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<NotFound />} />
        </Route>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </Suspense>
  );
}
