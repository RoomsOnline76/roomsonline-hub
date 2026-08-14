import { useEffect } from "react";
import { usePmsPropertyId } from "@/hooks/usePmsPropertyId";
import { PmsNoPropertyState } from "@/components/pms/PmsNoPropertyState";
import { ChannelOnboardingWorkspace } from "@/components/onboarding/channel/ChannelOnboardingWorkspace";

/**
 * ROL'OS Channels — the same Channel Onboarding workspace admins use.
 * Incomplete parties stay on the go-live steps; live parties see the Channel Manager.
 */
export default function PMSChannels() {
  const { propertyId } = usePmsPropertyId();

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

  return <ChannelOnboardingWorkspace propertyId={propertyId} variant="pms" />;
}

