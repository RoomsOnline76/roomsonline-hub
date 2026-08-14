import { Link, useLocation } from "react-router-dom";
import { ArrowRight, Rocket } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useRolosOnboardingProgress } from "@/hooks/useRolosOnboardingProgress";
import { buildStageProgress, channelOnboardingPath } from "@/config/channelOnboardingStages";
import { useAuth } from "@/hooks/useAuth";

/**
 * Compact hand-off from day-2 editors (property form, property setup) into the
 * single Channel Onboarding workspace. Replaces the floating teleporting wizard.
 */
export function GoLiveContinueBar({ propertyId }: { propertyId: string }) {
  const { pathname } = useLocation();
  const { isAdmin, isDev, isFearlessLeader } = useAuth();
  const { isRolosPms, isLoading, macros, channelsConnected, overall } = useRolosOnboardingProgress(propertyId);

  if (isLoading || !isRolosPms) return null;
  if (channelsConnected > 0 && overall.readyToConnect) return null;

  const onWorkspace =
    pathname.startsWith("/admin/onboarding/") || pathname.startsWith("/pms/channels");
  if (onWorkspace) return null;

  const stages = buildStageProgress(macros);
  const current = stages.find((s) => !s.complete) ?? stages[stages.length - 1];
  const nextLabel = current?.currentMacro?.macro.title ?? current?.def.title ?? "Continue";
  const variant = isAdmin || isDev || isFearlessLeader ? "admin" : "pms";

  return (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2">
      <div className="flex min-w-0 items-center gap-2">
        <Rocket className="h-4 w-4 shrink-0 text-primary" />
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">Continue go-live</p>
          <p className="truncate text-[11px] text-muted-foreground">
            {current?.def.title}: {nextLabel}
          </p>
        </div>
      </div>
      <Button asChild size="sm" className="h-8 shrink-0">
        <Link to={channelOnboardingPath(propertyId, variant)}>
          Open workspace
          <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
        </Link>
      </Button>
    </div>
  );
}
