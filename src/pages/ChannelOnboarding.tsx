import { Navigate, useParams } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { ChannelOnboardingWorkspace } from "@/components/onboarding/channel/ChannelOnboardingWorkspace";
import { useAuth } from "@/hooks/useAuth";

export default function ChannelOnboarding() {
  const { propertyId } = useParams<{ propertyId: string }>();
  const { isScopedAdmin, scopedPropertyIds, scopeResolved } = useAuth();

  if (propertyId && scopeResolved && isScopedAdmin && !scopedPropertyIds.includes(propertyId)) {
    return <Navigate to="/admin/onboarding" replace />;
  }

  return (
    <AppLayout>
      {propertyId ? (
        <ChannelOnboardingWorkspace propertyId={propertyId} variant="admin" />
      ) : (
        <p className="text-sm text-muted-foreground">Select a property from Onboarding.</p>
      )}
    </AppLayout>
  );
}
