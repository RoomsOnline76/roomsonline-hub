import { AppLayout } from "@/components/layout/AppLayout";
import { PageHeader } from "@/components/layout/PageHeader";
import { ROLRevenuePulse } from "@/components/dashboard";
import { useAuth } from "@/hooks/useAuth";
import { Navigate } from "react-router-dom";

const ROLPulse = () => {
  const { isDev, isFearlessLeader, isScopedAdmin, loading } = useAuth();

  // Wait for auth to resolve before checking permissions
  if (loading) {
    return (
      <AppLayout>
        <div className="min-h-screen flex items-center justify-center">
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </AppLayout>
    );
  }

  // dev/fearless_leader, plus scoped admins whose allow-list includes Revenue
  // Pulse (their data is already narrowed to their properties by RLS).
  if (!isDev && !isFearlessLeader && !isScopedAdmin) {
    return <Navigate to="/dashboard/reports" replace />;
  }


  return (
    <AppLayout>
      <div className="space-y-6">
        <PageHeader
          title="ROL Revenue Pulse"
          subtitle="OTA-wide commercial performance"
        />
        <ROLRevenuePulse />
      </div>
    </AppLayout>
  );
};

export default ROLPulse;
