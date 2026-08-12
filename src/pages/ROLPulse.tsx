import { AppLayout } from "@/components/layout/AppLayout";
import { PageHeader } from "@/components/layout/PageHeader";
import { ROLRevenuePulse } from "@/components/dashboard";
import { useAuth } from "@/hooks/useAuth";
import { Navigate } from "react-router-dom";

const ROLPulse = () => {
  const { isDev, isFearlessLeader, loading } = useAuth();

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

  // dev/fearless_leader only. Scoped admins (certification auditors) use
  // Property Pulse instead — OTA-wide revenue is out of their scope.
  if (!isDev && !isFearlessLeader) {
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
