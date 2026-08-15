import { Navigate, useParams } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { ChannelOnboardingWorkspace } from "@/components/onboarding/channel/ChannelOnboardingWorkspace";
import { ChannelManagerNotEnabled } from "@/components/onboarding/channel/ChannelManagerNotEnabled";
import { useAuth } from "@/hooks/useAuth";
import { useChannelManagerEntitlement } from "@/hooks/useChannelManagerEntitlement";

export default function ChannelOnboarding() {
  const { propertyId } = useParams<{ propertyId: string }>();
  const { isScopedAdmin, scopedPropertyIds, scopeResolved, isAdmin, isDev, isFearlessLeader } = useAuth();
  const entitlement = useChannelManagerEntitlement(propertyId);

  if (propertyId && scopeResolved && isScopedAdmin && !scopedPropertyIds.includes(propertyId)) {
    return <Navigate to="/admin/onboarding" replace />;
  }

  return (
    <AppLayout>
      {!propertyId ? (
        <p className="text-sm text-muted-foreground">Select a property from Onboarding.</p>
      ) : entitlement.loading ? (
        <p className="text-sm text-muted-foreground">Checking Channel Manager entitlement…</p>
      ) : entitlement.enabled ? (
        <ChannelOnboardingWorkspace propertyId={propertyId} variant="admin" />
      ) : (
        <ChannelManagerNotEnabled
          propertyId={propertyId}
          canManageBilling={isAdmin || isDev || isFearlessLeader}
        />
      )}
    </AppLayout>
  );
}
