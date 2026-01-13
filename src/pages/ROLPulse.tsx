import { AppLayout } from "@/components/layout/AppLayout";
import { PageHeader } from "@/components/layout/PageHeader";
import { ROLRevenuePulse } from "@/components/dashboard";
import { useAuth } from "@/hooks/useAuth";
import { Navigate } from "react-router-dom";

const ROLPulse = () => {
  const { isAdmin, isDev } = useAuth();

  // Only admin/dev can access this page
  if (!isAdmin && !isDev) {
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
