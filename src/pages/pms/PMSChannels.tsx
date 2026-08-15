import { useEffect } from "react";
import { usePmsPropertyId } from "@/hooks/usePmsPropertyId";
import { PmsNoPropertyState } from "@/components/pms/PmsNoPropertyState";
import { ChannelOnboardingWorkspace } from "@/components/onboarding/channel/ChannelOnboardingWorkspace";
import { ChannelManagerNotEnabled } from "@/components/onboarding/channel/ChannelManagerNotEnabled";
import { useChannelManagerEntitlement } from "@/hooks/useChannelManagerEntitlement";
import { useAuth } from "@/hooks/useAuth";

/**
 * ROL'OS Channels — the same Channel Onboarding workspace admins use.
 * Incomplete parties stay on the go-live steps; live parties see the Channel Manager.
 * Distribution is a billable add-on, so the workspace only opens once the
 * Channel Manager entitlement is switched on in billing.
 */
export default function PMSChannels() {
  const { propertyId } = usePmsPropertyId();
  const { isAdmin, isDev, isFearlessLeader } = useAuth();
  const entitlement = useChannelManagerEntitlement(propertyId ?? undefined);

  useEffect(() => {
    document.documentElement.classList.add("channels-force-light");
    return () => document.documentElement.classList.remove("channels-force-light");
  }, []);

  if (!propertyId) {
    return (
      <PmsNoPropertyState
        title="No property linked yet"
        description="Channel distribution stays switched off until a property is assigned to this account. Once linked, go-live and the Channel Manager open here."
      />
    );
  }

  if (entitlement.loading) {
    return <p className="p-4 text-sm text-muted-foreground">Checking Channel Manager entitlement…</p>;
  }

  if (!entitlement.enabled) {
    return (
      <div className="p-4">
        <ChannelManagerNotEnabled
          propertyId={propertyId}
          canManageBilling={isAdmin || isDev || isFearlessLeader}
        />
      </div>
    );
  }

  return <ChannelOnboardingWorkspace propertyId={propertyId} variant="pms" />;
}


