import { Building2 } from "lucide-react";
import type { ReactNode } from "react";
import { Link, Navigate, useLocation } from "react-router-dom";

import { EmptyState } from "@/components/layout/common";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/feedback";
import { useAuth, useBusiness } from "@/hooks/useAuth";
import type { Business } from "@/types";

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <Spinner label="Loading your workspace..." />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return <>{children}</>;
}

export function GuestRoute({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <Spinner />;
  if (user) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}

/** Renders children with the current business, or a "create a business" prompt. */
export function RequireBusiness({ children }: { children: (business: Business) => ReactNode }) {
  const { current, loading } = useBusiness();
  if (loading) return <Spinner />;
  if (!current) {
    return (
      <EmptyState
        icon={Building2}
        title="Create your first business"
        description="Reviews, dashboards and reports are organised per business or outlet."
        action={
          <Button asChild variant="gradient">
            <Link to="/businesses">Add a business</Link>
          </Button>
        }
      />
    );
  }
  return <>{children(current)}</>;
}
